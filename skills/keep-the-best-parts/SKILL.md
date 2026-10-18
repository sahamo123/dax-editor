---
name: keep-the-best-parts
description: Use when the user wants only the best moments of a longer video kept, such as a highlight reel, teaser, recap or the main points.
tags: [highlight, highlights, highlight reel, best parts, best moments, key moments, reel, teaser, trailer, sizzle, recap, summary, main points, greatest hits, keep only]
---

## When to use
"Make a highlight reel", "keep the best parts", "give me a 60 second teaser", "just the key points". Several parts of a long video are kept, the rest dropped.

## Steps
1. `get_project`: duration D, `hasTranscript`. Target length T: the user's, else 45 s for a reel (30 to 90 s) or about a fifth of D for a recap.
2. `save_checkpoint {"name":"before-highlights"}`.
3. Read `get_transcript`. Without a transcript, `transcribe {}` first; if that fails, say you can only pick by scene changes and loud moments, and ask which parts matter.
4. Shortlist 3 to 6 moments of 8 to 30 s each, adding up to about T. Good ones: a clear claim or result, a number, a joke or story with its payoff, strong energy. Skip greetings, setup and tangents.
5. Make each moment a whole thought. Set its start and end inside the silent stretch before and after it. Find these with `detect_silence {"minDuration":0.3}`. Start about 0.15 s before the first word, end about 0.1 s after the last.
6. Keep them: `keep_only {"ranges":[{"start":62,"end":84},{"start":310,"end":335}]}` (example values, timeline seconds on the untouched video). Order stays chronological.
7. Optional polish: `smart_cut {"preset":"tight"}`, then `set_fades` on the first clip (`fadeIn` 0.3) and last clip (`fadeOut` 0.5), ids from `get_project`.
8. To open with the strongest moment, see short-form-vertical-hook (cold open).

## How to verify
`get_project`: duration within 10 percent of T, clip count matches the moments. Check each junction starts at a sentence start with `get_transcript`.

## Pitfalls
- `keep_only` uses timeline seconds. Do it before other cuts, or convert: clip start + (source minus sourceIn).
- Joins are hard cuts; no transitions exist. Say so.
- Choosing "best" is a judgement. Tell the user which moments you kept and why.

## Do not
- Do not start or end a moment mid-sentence.
- Do not drop the context a moment needs to make sense.
- Do not export.
