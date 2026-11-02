---
type: Spec
title: Crash-safe staged attachment leases
description: Define an opt-in temporary attachment lifecycle that cannot delete legacy or referenced project media.
tags: [attachments, storage, tasks, recovery]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T10:40:00Z
---

# Crash-safe staged attachment leases

## Problem and scope

A browser attachment can be staged successfully even if a later attachment fails or the user abandons a draft. Current staged uploads are immediately durable, return a path and can be consumed by other commands. Retaining them is safer than guessing whether they are referenced, but can leave duplicate files. [Issue #227](https://github.com/sahamo123/dax-editor/issues/227) specifies a new opt-in path; [ADR 0017](../adr/0017-staged-attachment-leases.md) records the proposed boundary.

The first consumer is desktop chat. Existing video import, image, audio and motion-asset pickers continue to use the durable upload API until separately migrated. CLI/MCP and old desktop clients retain their existing path-based behavior. No existing project, history, task or upload is rewritten or deleted. This work does not add general disk cleaning, arbitrary deletion, remote storage or automatic replay.

## Consumer map and compatibility

| Consumer | Current behavior | Lease boundary |
|---|---|---|
| Chat attachments | `uploadMedia(file, true)` returns an app-owned path; the task stores paths and imports video at dispatch. Planning receives paths without importing. | New chat clients send opaque lease IDs; both Edit and Planning promote before task acknowledgement. Planning still makes no project edit. |
| Manual import | `uploadMedia(file)` copies and immediately imports video. | Keep the existing durable flow and error behavior. |
| Image, audio and motion pickers | Stage-only upload returns a path later passed to a typed command. | Keep the existing durable flow until each consumer has an explicit promotion adapter and tests. |
| Saved projects, undo history and recovered tasks | May contain durable source paths outside the current session or data folder. | Never infer non-use from the current project or limited task history; preserve every existing path. |
| Legacy API, CLI and MCP | Accept existing paths and commands under their current allow-root rules. | Do not expose lease files through these paths or require a protocol upgrade for old clients. |

## Protocol and state machine

The exact endpoint names are proposed: an authenticated binary `POST /api/attachment-leases` returns `{ leaseId, sizeBytes, expiresAt }`; an authenticated `POST /api/attachment-leases/:leaseId/discard` requests explicit discard. The upload uses the existing extension, per-file size and untrusted-name validation. The reply never contains a temporary path. Extend chat with optional `attachmentLeaseIds`; reject a request combining lease IDs with legacy `attachments`, duplicate IDs, more than ten IDs or malformed IDs. Old clients and their request shapes remain valid.

Each new lease has a random opaque ID, a private application-owned directory, a versioned manifest and exactly one bounded file. The engine must not pass its temporary path to a command, model, project, history, task, export or client. Explicitly deny the staging root from general path-based commands, uploads, media serving and legacy attachment paths. Authentication and existing Host/Origin/token checks apply to every new route; an opaque ID is not authorization.

This is an application API boundary, not an operating-system sandbox: processes running as the same user may have filesystem access. Existing clients remain compatible but do not acquire temporary-lease behavior implicitly.

| State | Meaning and allowed next action |
|---|---|
| `WRITING` | Upload is incomplete. No consumer can see the file. A proven pre-publication write failure can remove only its own validated temporary file; an ambiguous crash is retained for recovery. |
| `READY` | Complete lease and manifest are durable. It may be claimed or explicitly discarded, never both. Expiry prevents new claims but alone does not delete bytes. |
| `PROMOTING` | Claim intent is durably recorded before copying or publishing. Discard is refused. A crash or uncertain write retains all candidates and is reconciled conservatively. |
| `PROMOTED` | A verified durable source exists and its mapping is persisted. It is never automatically removed by lease cleanup, even if chat acceptance later fails. |
| `DISCARDING` / `DISCARDED` | An explicit discard won the serialized race while the lease was provably unclaimed. Repeat discard is idempotent; a claim cannot succeed afterward. |
| `QUARANTINED` | Metadata, path ownership, publication or recovery is uncertain. Refuse claims and deletion; surface a recoverable storage notice without exposing private contents. |

Transitions must be linearizable across all clients and across any process sharing the same data directory. An in-process mutex alone is insufficient: the implementation must establish a tested single-writer lock or equivalent cross-process exclusion before enabling discard. A lock failure fails closed. Manifest publication and durable-copy ordering require file and directory flush behavior supported by the target filesystem; unsupported or unverified durability fails closed rather than being called crash-safe.

## Submission and recovery ordering

1. Validate the entire request, both chat context guards, all lease IDs, quotas and project identity before changing ownership. Do not create a task for a malformed or stale request.
2. Under the ownership coordinator, durably record claim/promotion intent for the complete batch. A competing discard must either win before this point or be refused. Recheck project and provider context after potentially slow promotion.
3. Copy or exclusively publish each source to a durable app-owned location, verify its size and content integrity, persist its mapping, and flush required data/metadata before making paths available to any consumer. A partial batch may leave extra durable copies; retain and account for them.
4. Reserve a stable submission/task identity and durably commit task metadata and all promoted references before returning HTTP 202 or dispatching the runner. Existing asynchronous task-store writes do not by themselves establish this guarantee and must be redesigned or extended first.
5. A client-generated idempotency key maps retries to the same persisted submission. Scope it to the authenticated engine's data directory and project so it survives an engine restart; bind it to a canonical fingerprint of all relevant request context, including mode, provider and attachment IDs, without persisting secrets in the fingerprint. Reuse with different context is a conflict. A retry after an uncertain response returns the existing task or a conflict; it never schedules a duplicate edit. Restart marks unfinished accepted work interrupted and does not replay it.
6. Explicit discard is allowed only for a validated app-created `READY` lease with no claim, in-flight consumer or uncertain metadata. Validate containment and resist symlink/junction replacement at the deletion boundary using a platform-supported handle-based or equivalent proven method. If proof is unavailable, retain the bytes. Never accept an arbitrary path for deletion.

Crashes at every boundary, missing/corrupt manifests, disk-full, permission errors, interrupted streams, stale context, cancellation, duplicate requests and concurrent claims/discards must preserve any potentially referenced bytes. A response loss is not proof of failure. No cleanup removes a promoted, legacy, unknown or quarantined source.

## Quotas, visibility and verification

Show selected-file limits, staging usage and actionable quota/disk-space errors before accepting more data. Reserve and account for in-progress bytes, enforce the existing ten-file and 1 GiB per-file bounds, and make global limits configurable and documented. Expired but uncertain files remain counted and visible for support; expiry is not an automatic deletion guarantee. Expose explicit discard only for proven unclaimed leases and explain that durable project sources are retained. Do not log tokens, filenames, prompts or file contents.

Implement in separately reviewed slices: (1) protocol and pure transition model with no deletion, (2) durable coordinator and crash recovery with no consumer exposure, (3) atomic promotion and chat integration with idempotency, (4) proven explicit discard and UI/storage accounting, and only then (5) evaluate any automatic expiry cleanup in a new decision. Each slice keeps legacy clients working and passes its own migration and security tests.

Tests use generated media and isolated temp roots. Cover malformed and duplicate IDs, quotas and stream limits; same- and cross-process claim/discard races; stale project/provider transitions; every crash boundary and restart; partial batch promotion; retry after response loss; symlinks/junctions and swapped paths; disk-full and permission failures; Planning, Edit, queue, cancel, undo/history, saved/reopened projects and legacy image/audio/import flows. Verify no temporary path appears in client responses, logs, tasks, projects, history, model prompts or external tools. Do not test deletion against user data. Native and packaged-runtime acceptance remains separate.
