/**
 * Network check of catalog entries against Hugging Face: a HEAD request must succeed, the size
 * must match, and the LFS ETag (which is the file's SHA-256) must equal the catalog hash. The
 * licence and gating flags come from the model API. Used by `pnpm catalog:verify` and the opt-in
 * live test; never called by the app at run time.
 */
import { z } from "zod";
import type { ModelEntry } from "./catalog.js";

/** Result of checking one catalog entry. */
export interface CatalogCheck {
  /** Catalog id that was checked. */
  id: string;
  /** True when every check passed. */
  ok: boolean;
  /** One line per failed check (empty when `ok`). */
  problems: string[];
  /** HTTP status of the final HEAD response. */
  status: number | undefined;
  /** Size reported by the server, bytes. */
  contentLength: number | undefined;
  /** SHA-256 reported by the server (from `x-linked-etag`). */
  remoteSha256: string | undefined;
  /** Licence id the repository declares in its card metadata. */
  remoteLicense: string | undefined;
}

const RepoSchema = z.object({
  gated: z.union([z.boolean(), z.string()]).optional(),
  private: z.boolean().optional(),
  cardData: z.object({ license: z.string().optional() }).passthrough().optional(),
});

/**
 * HEAD-check one entry. Never throws; failures are reported in `problems`.
 * @param entry The catalog entry to verify.
 * @param doFetch Fetch implementation (default global `fetch`).
 */
export async function verifyCatalogEntry(
  entry: ModelEntry,
  doFetch: typeof fetch = fetch,
): Promise<CatalogCheck> {
  const problems: string[] = [];
  let status: number | undefined;
  let contentLength: number | undefined;
  let remoteSha256: string | undefined;
  let remoteLicense: string | undefined;
  try {
    // First hop without following redirects: the Hugging Face resolver answers with the LFS
    // metadata (hash, commit) and a redirect to the CDN that holds the bytes.
    const first = await doFetch(entry.url, { method: "HEAD", redirect: "manual" });
    const etag = first.headers.get("x-linked-etag")?.replace(/"/g, "");
    remoteSha256 = etag?.toLowerCase();
    const commit = first.headers.get("x-repo-commit");
    if (commit && commit !== entry.source.revision) {
      problems.push(`revision: server says ${commit}, catalog pins ${entry.source.revision}`);
    }
    let response = first;
    if (first.status >= 300 && first.status < 400) {
      const location = first.headers.get("location");
      if (!location) problems.push("redirect without Location header");
      else response = await doFetch(new URL(location, entry.url), { method: "HEAD" });
    }
    status = response.status;
    if (response.status !== 200) problems.push(`HEAD returned HTTP ${response.status}`);
    const length = response.headers.get("content-length");
    contentLength = length ? Number(length) : undefined;
    if (contentLength !== entry.sizeBytes) {
      problems.push(`size: server says ${contentLength}, catalog says ${entry.sizeBytes}`);
    }
    if (response.headers.get("accept-ranges") !== "bytes") {
      problems.push("server does not advertise Accept-Ranges: bytes (resume would not work)");
    }
    if (remoteSha256 !== entry.sha256) {
      problems.push(`sha256: server says ${remoteSha256}, catalog says ${entry.sha256}`);
    }

    const api = await doFetch(`https://huggingface.co/api/models/${entry.source.repo}`);
    if (api.ok) {
      const repo = RepoSchema.parse(await api.json());
      remoteLicense = repo.cardData?.license;
      if (repo.gated) problems.push("repository is gated (downloads would need a login)");
      if (repo.private) problems.push("repository is private");
      if (remoteLicense?.toLowerCase() !== "apache-2.0") {
        problems.push(`licence: card says "${remoteLicense}", catalog says ${entry.license.spdx}`);
      }
    } else {
      problems.push(`model API returned HTTP ${api.status}`);
    }
  } catch (error) {
    problems.push(`request failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    id: entry.id,
    ok: problems.length === 0,
    problems,
    status,
    contentLength,
    remoteSha256,
    remoteLicense,
  };
}
