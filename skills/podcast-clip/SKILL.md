---
name: podcast-clip
description: Use when the user wants a short shareable clip cut out of a longer podcast, interview or conversation recording.
tags: [podcast, clip, snippet, soundbite, conversation, episode, long recording, share a moment, quote, pull a clip, audiogram, two people, host, episode clip]
---

## When to use
"Make a 45 second clip from this episode", "pull the best answer", "turn this into a social clip". One complete moment from a long recording.

## Steps
1. `get_project`, `transcribe {}` if there is no transcript, then `get_transcript`.
2. `save_checkpoint {"name":"before-clip"}`.
3. Find ONE self-contained moment, 30 to 60 s: a question and its answer, a story with its payoff, or a strong claim and its reason. It must start at the start of a sentence and end on a finished thought. Prefer one with a hook line in the first sentence.
4. Set the edges inside silent stretches: `detect_silence {"minDuration":0.3}`. Keep about 0.2 s before the first word and 0.3 s after the last.
5. `keep_only {"ranges":[{"start":1234.2,"end":1281.6}]}` (example values, timeline seconds on the untouched recording).
6. Light cleanup keeping the natural rhythm: `smart_cut {"preset":"podcast"}`.
7. Fades: `set_fades {"clipId":"<clip id>","fadeIn":0.2,"fadeOut":0.4}`.
8. Speaker name: add-lower-third at second 0.8. A hook quote as `title-pop`, 2.5 s, up to 8 words, if the user wants it.
9. For social: `set_format {"preset":"portrait-1080x1920"}` (see change-format-for-platform; the picture gets bars, not a crop).

## How to verify
`get_project`: duration 30 to 60 s (or the user's target). `get_transcript` at the new first and last seconds: starts on a sentence start, ends on a sentence end.

## Pitfalls
- Without a transcript you cannot find a moment reliably; ask the user for a time range.
- Audio-only files cannot be imported; the recording must be a video.
- No captions, waveform or speaker labels exist; see handle-unsupported-requests.
- Do the `keep_only` first: source and timeline times differ after other cuts.

## Do not
- Do not start mid-sentence or end on a question left unanswered.
- Do not use `tight`; conversation needs its pauses.
- Do not export.
