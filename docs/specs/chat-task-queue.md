---
type: Spec
title: Chat tasks, steering and planning mode
description: Persistent local task metadata, serial chat requests, steering, video attachments and enforced read-only planning.
tags: [desktop, server, agent]
status: draft
generated:
  by: process:implementer
  at: 2026-10-21T00:00:00Z
---

# Chat tasks, steering and planning mode

Desktop submission context, stale-context refusal and legacy-client compatibility are specified in [Guard chat submission context](chat-context-guard.md).

The chat composer stays editable during a run. Send queues a follow-up; Steer task adds guidance to the active conversation at the next model boundary without aborting current work. Mode switches, attachments and runners without live guidance support continue immediately after the active run finishes. Stop remains a separate explicit cancellation action. Existing edits remain in project history. Each request captures its mode at submission, has a stable task id, and moves through queued, running, completed, failed or cancelled. Queue depth is limited to 20. The task panel shows status and supports cancelling specific queued/running work.

Steering belongs to the active run's captured assistant connection. If the current provider, its effective configuration or its private credential differs from the active run, reject a Steer request before creating a task; explain that the user can switch back to the active connection or deliberately queue a new request. Do not reveal or compare credentials in client-visible output. The existing Queue action still captures the current provider and never cancels the active run. Changes to unrelated provider configurations must not prevent steering. This protects against the reproduced attribution mismatch in [#221](https://github.com/sahamo123/dax-editor/issues/221).

Tasks are authoritative in the engine and written atomically with private permissions to app-local `tasks.json`. Metadata survives browser refresh; engine restart marks unfinished work interrupted and does not execute it. Retain the latest 100 finished tasks plus active tasks. This feature tracks chat and browser imports; manual timeline edits remain tracked in project history and export progress remains in the existing jobs panel.

During an orderly engine shutdown, seal active chat before flushing task metadata and mark it interrupted unless an explicit cancellation or failure already determined its outcome. Mark queued chat interrupted without dispatching it. A provider that ignores abort must not delay shutdown indefinitely; late chat events and calls through the guarded command interface are ignored or refused after the run is sealed. Preserve the recorded history and do not replay unfinished work on restart. This rule does not assert that arbitrary untrusted code with direct session access is sandboxed.

Planning mode offers and executes only registry commands marked read-only. Its system guidance requests a proposed plan without edits; the tool runner independently refuses unoffered mutating calls. CLI bridges are refused in Planning mode because their tool permissions cannot be constrained through this contract. Switching the composer to Edit does not execute an earlier plan; a new explicit request is required.

Chat video attachments use staged browser uploads (up to 10 per request, 1 GiB each). They remain local. Edit tasks import them when dispatched through the existing serialized command registry; Planning tasks receive attachment names/paths as untrusted context without adding them to the timeline. Planning cannot inspect video frames or infer their contents from a filename. Unattached staged files are retained; automatic source cleanup is deferred to avoid breaking saved projects.

Before staging any attachment, the desktop checks the entire selection for the request limit and the existing empty/size limits. A known-invalid selection causes no upload or chat request, retains the draft and selection, and identifies the problem. An unexpected later upload or network failure can still leave an earlier staged copy; never imply this preflight is complete cleanup. See [staged attachment lifetime](../research/staged-attachment-lifetime.md).

Verify FIFO ordering, steering, queued cancellation, captured modes, task persistence/restart, and refusal of malicious mutating tool calls in Planning mode. Verify composer controls and real offline-model responses. Do not claim automatic approval or execution of a plan.
