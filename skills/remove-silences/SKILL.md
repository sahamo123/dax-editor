---
name: remove-silences
description: Use when the user wants only the silent pauses or dead air removed, or wants control over how long a pause must be before it is cut.
tags: [silence, silent, pause, awkward pause, dead air, gap, threshold]
---

## When to use
"Remove the silences", "cut the long pauses", "get rid of dead air". If the user also wants um and uh gone, use tighten-talking-video instead.

## Steps
1. `get_project`. `hasAudio` must be true.
2. `save_checkpoint {"name":"before-silence"}`.
3. Look first, nothing changes: `detect_silence {"noiseDb":-30,"minDuration":0.6}`. Read the count and `totalSeconds`.
4. Found 0 but the user hears pauses (noisy room)? Use `plan_cuts {"preset":"standard"}`, then `apply_cut_plan {"planId":"<planId>"}`. The plan measures the room tone itself.
5. Otherwise run `remove_silences {"noiseDb":-30,"minDuration":0.6,"pad":0.15}`.
6. Choose values yourself, do not ask the user:
   - natural: `minDuration` 0.7, `pad` 0.15.
   - tight: `minDuration` 0.4, `pad` 0.08.
   - light: `minDuration` 1.0, `pad` 0.25.
   `pad` stays on each side of a cut, so 0.15 leaves about 0.3 s of pause.
7. Report the seconds removed.

## How to verify
`get_project`: the new duration equals the "Timeline is now" number, and the removed seconds are close to `totalSeconds` from step 3. Removing more than 25 percent of the video is a warning sign.

## Pitfalls
- A higher `noiseDb` (closer to 0) counts more as silence. Above -20 it can clip quiet speech.
- A lower `noiseDb` (-40) is stricter and may find nothing in a noisy room.
- Music under the speech means no pause is silent. Say so.
- Pauses already cut earlier are skipped, so a repeat run reports nothing left.

## Do not
- Do not use `minDuration` under 0.3 (choppy, robotic).
- Do not use this for filler words; see remove-filler-words.
- Do not export.
