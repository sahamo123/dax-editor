---
name: tighten-talking-video
description: Use when the user wants talking footage cleaned up, tighter or more polished, with pauses, filler words and dead air removed in one pass.
tags: [tighten, tighter, clean up, cleanup, tidy, polish, punchy, snappy, pacing, talking head, vlog, dead air, smart cut, pause, filler, um, silence]
---

## When to use
"Clean up this video", "make it tighter", "remove the ums and pauses", or any talking-head, vlog, lecture or interview footage. It is the best default first edit.

## Steps
1. `get_project`. Note the duration, `hasAudio` and `hasTranscript`. No audio: say so and stop.
2. No transcript yet? Try `transcribe {}` once. It is what lets filler words and false starts be found. If it says speech recognition is not set up, carry on: only pauses and dead air at the ends can be cut then.
3. `save_checkpoint {"name":"before-tighten"}`.
4. Pick the preset:
   - `standard`: default for most talk.
   - `tight`: fast or energetic clips, social posts, or the user said punchy.
   - `gentle`: interviews, emotional or slow speakers, or the user said light touch.
   - `podcast`: relaxed conversation; keeps 0.6 s pauses.
   - `tutorial`: teaching and narration; keeps thinking pauses.
5. Run `smart_cut {"preset":"standard"}`. It applies only the safe cuts.
6. If the result says some cuts are left for review (false starts, retakes), follow review-false-starts-and-retakes. Otherwise tell the user how many are left.

## How to verify
`get_project`: the duration equals the "Timeline is now" number in the result. A normal result is 5 to 25 percent shorter.

## Pitfalls
- More than 35 percent removed: music or noise may be fooling the detector. `undo` and retry with `gentle`.
- Almost nothing removed: the footage is already tight. Say so; do not escalate to `tight` unasked.
- Running the same preset twice finds nothing new.
- Without a transcript, filler words stay in. Say that.

## Do not
- Do not use `tight` on interviews or podcasts unless asked.
- Do not hand-cut with `delete_range` for this job.
- Do not export.
