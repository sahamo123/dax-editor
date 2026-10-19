---
name: remove-a-section
description: Use when the user names a specific stretch, clip, intro or ending to delete, with times or a description such as the first 10 seconds or the part about pricing.
tags: [cut out, chop off, take out, segment, section, cut the first, cut the last, cut the end, cut the intro, cut the outro, cut the ending, remove the first, remove the last, remove the end, remove the intro, remove the outro, remove the ending, delete the first, delete the last, delete the intro, delete the ending, trim the start, trim the end, cut from, delete from, remove from, get rid of]
---

## When to use
"Cut the first 10 seconds", "remove 1:20 to 1:45", "delete the last part", "take out the section about pricing", "remove the second clip".

## Steps
1. `get_project`: duration D and the clips (ids, start, end).
2. Turn times into seconds: 1:20 is 80. Described by topic ("the pricing part")? Read `get_transcript`, find the passage, and use the silences around it from `detect_silence {"minDuration":0.3}` as the edges.
3. `save_checkpoint {"name":"before-section"}` if the removal is longer than 10 percent of D.
4. Remove it:
   - a stretch: `delete_range {"from":80,"to":105}`.
   - the start: `delete_range {"from":0,"to":10}`.
   - the end: `delete_range {"from":172,"to":182}` (D minus 10 up to D).
   - a whole clip: `remove_clip {"clipId":"<id>"}`.
   - keep one part only: `keep_only {"ranges":[{"start":20,"end":90}]}`.
5. Several removals? Work from the latest time to the earliest, or call `get_project` between them. After a delete, everything later moves earlier by the removed length.
6. Say what was removed and the new length.

## How to verify
`get_project`: new duration equals old minus the removed length. Text overlays after the range moved earlier with the footage; one inside the range was shortened or removed.

## Pitfalls
- Times are timeline seconds, not source seconds. `trim_clip` is the opposite: its `in` and `out` are source seconds.
- "Around 1:20" means find the nearest pause; exact times from the user are used exactly.
- `from` must be less than `to` and inside the video. If not, ask one short question.
- `split` alone removes nothing.

## Do not
- Do not guess which part the user means when two parts fit; ask one short question.
- Do not cut mid-word when the user gave approximate times.
- Do not export.
