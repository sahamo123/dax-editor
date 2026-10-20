---
name: verify-your-edit
description: Use after every edit to check with read-only commands that the project really changed the way you intended before telling the user.
tags: [verify, check, confirm, make sure, did it work, correct, review the edit, double check, validate, inspect]
---

## When to use
After every edit that changes the project, and whenever the user asks "did it work?". It is quick: one or two read-only calls.

## Steps
1. Read the tool result first. Is it an error, or does it say "Nothing changed"? Then the edit did not happen. Say that.
2. Call `get_project`. Compare it with what you intended:
   - duration: equals the "Timeline is now" number in the result and is plausible (a tighten cuts 5 to 25 percent; a length target is met within 3 s).
   - clips: the count and times make sense (no zero-length clip).
   - overlays: each `start` is at least 0, each `end` is no later than the duration, the text is exact, none overlap by mistake.
   - format: the width, height and fps you set.
3. After a cut, spot-check 2 or 3 cut points with `get_transcript` (source times): the words read naturally and no sentence is chopped. If there is no transcript, say you could only check the numbers.
4. If something is off, fix it (`undo` and retry) or report it. Do not hide it.
5. Then give the user a short summary (see explain-what-you-did).

## How to verify
This skill is the check. Before and after numbers (duration, clip count, overlay count) are the evidence you report.

## Pitfalls
- You cannot see or hear the video. Never say it sounds or looks good; say what the numbers show.
- `get_transcript` reads the source file, so it does not change after cuts.
- A tool can succeed but do little ("0 silences"). That is a result, not a failure.

## Do not
- Do not say "done" or "fixed" without a successful tool result.
- Do not skip `get_project` after a cut, a format change or an overlay.
- Do not run edits just to verify.
