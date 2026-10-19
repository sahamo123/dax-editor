/**
 * Opt-in tests that use the real network and a real llama-server. They only run with
 * `DAX_LIVE_TESTS=1`; default test runs never touch the network.
 *
 *   DAX_LIVE_TESTS=1 pnpm --filter @dax/local-llm test live
 *   DAX_LIVE_TESTS=1 DAX_LLAMA_SERVER=/path/to/llama-server DAX_LIVE_MODEL=qwen3.5-2b-q4km \
 *     pnpm --filter @dax/local-llm test live      # also downloads the model and runs it
 */
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "./catalog.js";
import { verifyCatalogEntry } from "./catalog-verify.js";
import { LocalModelManager } from "./manager.js";

const live = process.env.DAX_LIVE_TESTS === "1";

/** POST a JSON body and parse the JSON answer. Used instead of fetch (see the call site). */
function postJson(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      { method: "POST", headers: { "content-type": "application/json", ...headers } },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => {
          data += c;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, json: JSON.parse(data) }));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}
const binary = process.env.DAX_LIVE_LLAMA_SERVER;
const modelId = process.env.DAX_LIVE_MODEL;

describe.skipIf(!live)("live: catalog URLs", () => {
  it.each(MODEL_CATALOG.map((m) => [m.id, m] as const))(
    "%s is reachable with the listed size, hash and licence",
    async (_id, entry) => {
      const check = await verifyCatalogEntry(entry);
      expect(check.problems).toEqual([]);
    },
    60_000,
  );
});

describe.skipIf(!live || !binary || !modelId)("live: real llama-server", () => {
  it("installs a model, starts llama-server and gets a tool call back", async () => {
    const dataDir = process.env.DAX_LIVE_DATA_DIR ?? mkdtempSync(join(tmpdir(), "dax-live-"));
    // The binary is passed explicitly so the test never downloads a runtime or uses a stray override.
    const manager = new LocalModelManager({ dataDir, runtime: { binaryPath: binary as string } });
    console.info(`[live] llama-server: ${binary}, model: ${modelId}, data: ${dataDir}`);
    try {
      await manager.install(modelId as string);
      const handle = await manager.start({ modelId: modelId as string });
      // node:http has no response-header timeout; fetch gives up after 300 s, which a loaded
      // CPU can exceed for a single non-streaming completion.
      const { status, json } = await postJson(
        `${handle.baseUrl}/chat/completions`,
        { authorization: `Bearer ${handle.apiKey}` },
        {
          model: handle.modelId,
          temperature: 0,
          max_tokens: 200,
          tool_choice: "auto",
          tools: [
            {
              type: "function",
              function: {
                name: "delete_range",
                description: "Delete the timeline range [from, to) in seconds.",
                parameters: {
                  type: "object",
                  properties: { from: { type: "number" }, to: { type: "number" } },
                  required: ["from", "to"],
                },
              },
            },
          ],
          messages: [
            { role: "system", content: "You edit video by calling tools. Times are seconds." },
            { role: "user", content: "Delete everything between 10 and 15 seconds." },
          ],
        },
      );
      expect(status).toBe(200);
      const json2 = json as {
        choices: {
          message: { tool_calls?: { function: { name: string; arguments: string } }[] };
        }[];
      };
      const call = json2.choices[0]?.message.tool_calls?.[0];
      expect(call?.function.name).toBe("delete_range");
      expect(JSON.parse(call?.function.arguments ?? "{}")).toMatchObject({ from: 10, to: 15 });
    } finally {
      await manager.stop();
      if (!process.env.DAX_LIVE_DATA_DIR) rmSync(dataDir, { recursive: true, force: true });
    }
  }, 900_000);
});
