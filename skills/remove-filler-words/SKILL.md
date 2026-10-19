---
name: remove-filler-words
description: Use when the user wants um, uh, er and other filler words taken out of the speech.
tags: [um, uh, er, erm, hmm, filler, filler word, verbal tic, stutter, ahs, ums, uhs]
---

## When to use
"Remove the ums and uhs", "cut the filler words". It needs a transcript, because filler words are found from the words, not the sound.

## Steps
1. `get_project`. Is `hasTranscript` true?
2. If not, run `transcribe {}`. If it says speech recognition is not set up, tell the user fillers cannot be found without it, offer `smart_cut {"preset":"gentle"}` for pauses only, and stop.
3. `save_checkpoint {"name":"before-fillers"}`.
4. Read `get_transcript`. If no um or uh appears in the text but the user hears them, the transcriber dropped them. Tell the user; do not invent cuts.
5. Best choice: `smart_cut {"preset":"standard"}`. It removes each filler together with the gap around it, and long pauses too.
6. Only fillers, nothing else: `remove_fillers {}`. For a custom list: `remove_fillers {"fillers":["um","uh"]}`. This deletes just the word and can leave a small gap.
7. Report how many were removed.

## How to verify
The result says "Removed N filler word(s)" with seconds; `get_project` duration matches. `get_transcript` keeps showing the original words, because it reads the source file, not the edit. Do not use it to check.

## Pitfalls
- Default list: um, umm, uh, uhh, er, erm, hmm, mm. Real words such as like, so, actually, you know are not in it.
- "No filler words left to cut" after `smart_cut` means it already did the job.
- Cuts land between words; if a cut sounds clipped, `undo` and use `gentle`.

## Do not
- Do not add real words (like, so, basically) to `fillers` unless the user names them, and then warn that it may change meaning.
- Do not call `remove_fillers` before checking `hasTranscript`.
- Do not export.
