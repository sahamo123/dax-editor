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

The chat composer stays editable during a run. Send queues a follow-up; Steer now cancels the active run and inserts the new instruction at the front. Existing edits remain in project history. Each request captures its mode at submission, has a stable task id, and moves through queued, running, completed, failed or cancelled. Queue depth is limited to 20. The task panel shows status and supports cancelling specific queued/running work.

Tasks are authoritative in the engine and written atomically with private permissions to app-local `tasks.json`. Metadata survives browser refresh; engine restart marks unfinished work interrupted and does not execute it. Retain the latest 100 finished tasks plus active tasks. This feature tracks chat and browser imports; manual timeline edits remain tracked in project history and export progress remains in the existing jobs panel.

Planning mode offers and executes only registry commands marked read-only. Its system guidance requests a proposed plan without edits; the tool runner independently refuses unoffered mutating calls. CLI bridges are refused in Planning mode because their tool permissions cannot be constrained through this contract. Switching the composer to Edit does not execute an earlier plan; a new explicit request is required.

Chat video attachments use staged browser uploads (up to 10 per request, 1 GiB each). They remain local. Edit tasks import them when dispatched through the existing serialized command registry; Planning tasks receive attachment names/paths as untrusted context without adding them to the timeline. Planning cannot inspect video frames or infer their contents from a filename. Unattached staged files are retained; automatic source cleanup is deferred to avoid breaking saved projects.

Verify FIFO ordering, steering, queued cancellation, captured modes, task persistence/restart, and refusal of malicious mutating tool calls in Planning mode. Verify composer controls and real offline-model responses. Do not claim automatic approval or execution of a plan.
