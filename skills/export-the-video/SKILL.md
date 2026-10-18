---
name: export-the-video
description: Use only when the user explicitly asks to export, render or save the finished video to an MP4 file.
tags: [export, render, save as, save video, mp4, download, finish, final video, output file, publish]
---

## When to use
"Export it", "render the video", "save it as an MP4". Never as a side effect of another edit. Exporting writes a file on the user's disk and cannot be undone from the history, so it needs the user's confirmation.

## Steps
1. `get_project`: check duration, format, overlays. Tell the user in one line what will be exported (length, size).
2. Get the full output path, ending in .mp4, in a folder the app may write to. No path given? Ask one short question and propose one, e.g. the Videos folder with a clear name.
3. Ask for confirmation: "Export 0:42 at 1080x1920 to /Users/sam/Videos/promo.mp4?" Wait for a clear yes. If the file may exist, say it will not be replaced unless the user agrees to overwrite.
4. Only after the yes: `export_video {"path":"/Users/sam/Videos/promo.mp4","overwrite":false}`. Set `overwrite` true only if the user said to replace the existing file.
5. Report the path and length from the result.

## How to verify
The result says "Exported N s to <path>". Compare N with the project duration from `get_project`; they should match to within a second.

## Pitfalls
- "already exists": offer a new name; do not switch `overwrite` to true on your own.
- "outside the allowed folders": ask the user for another folder.
- If this command is not available to you, tell the user to use the Export button in the app.
- Exports take time on long videos.

## Do not
- Do not call `export_video` without confirmation in this conversation.
- Do not invent a path or folder.
- Do not claim the file exists unless the result says it was written.
