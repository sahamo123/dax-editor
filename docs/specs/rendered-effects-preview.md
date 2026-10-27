---
type: Spec
title: Rendered effects preview
description: "Review the complete edit through the existing renderer without exporting a user-managed file or changing the project."
tags: [desktop, preview, rendering]
status: draft
generated:
  by: process:implementer
  at: 2026-10-27T00:00:00Z
---

# Rendered effects preview

## Problem and contract

The interactive clip preview omits zoom/image/music processing. Users need to review the complete combination, including ducking and captions, before final export. An explicit Render preview action produces a review copy using the existing export renderer and the current format, rather than claiming that browser approximations equal the final render. It may take as long as export.

The typed `render_preview` registry command requires an editor-host capability, accepts no path or encoder arguments, writes no project/history change and is excluded from Planning like export. It starts the existing cancellable export job, with an immutable project snapshot. A host-generated UUID identifies its private output. At most three review files are retained per engine; removed/failed/unfinished or previous-project/revision files cannot be served. Shutdown removes review files after workers have exited. Media requests retain Host/Origin/token checks and Range support.

The desktop review dialog pauses interactive playback and shows job progress, cancellation, errors and the completed video with native playback controls. A revision/project change invalidates the video immediately and offers regeneration. Closing a dialog does not silently stop a job; Stop is explicit. Native interactive playback remains available without waiting for a render.

Review copies use VP9/Opus WebM through the same effect filter graph. This avoids depending on proprietary MP4 codecs in browser/webview builds; MP4 export and its encoder selection remain unchanged. The live host alone selects this review format and its private path. Review encoding may differ from the final export while effect timing/composition remains shared.

## Acceptance

- Real generated-media test renders combined edits, verifies playable audio/video, authenticated Range serving, unchanged project/history, stale project/revision rejection and shutdown cleanup.
- Capability/argument validation refuses unsupported hosts and injected paths; Planning cannot invoke the command.
- UI checks cover progress, completion, failure, cancellation and stale-result handling. Browser workflow plays the resulting complete edit.
- Existing local-first behavior, saved projects, exports and task semantics remain compatible.
