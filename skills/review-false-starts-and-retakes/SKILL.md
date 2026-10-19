---
name: review-false-starts-and-retakes
description: Use when the user wants stumbles, restarted sentences or repeated takes removed, or when a cut plan lists cuts that are still waiting for review.
tags: [false start, retake, repeat, repeated, restart, stumble, flub, mistake, blooper, said twice, mess up, take two, for review]
---

## When to use
"Cut my mistakes", "I said that twice", "remove the bad takes", or after `smart_cut` reported cuts for review. These cuts need judgement, so check each one.

## Steps
1. `get_project`: `hasTranscript` must be true. If not, `transcribe {}`; if that fails, say false starts cannot be found reliably and stop.
2. `save_checkpoint {"name":"before-retakes"}`.
3. `plan_cuts {"preset":"standard"}`. Only `standard` and `tight` look for retakes; `gentle`, `podcast` and `tutorial` do not. Remember the `planId`.
4. In `data.decisions`, take those with `kind` false_start or retake (status proposed). Each has `start`, `end`, a `reason` quoting the words, and a `confidence`.
5. Check each: `get_transcript` with `from` = start minus 3 and `to` = end plus 5.
   - false start: the same opening words are said again, more fully, just after. Accept.
   - retake: the plan removes the EARLIER take. Accept only if the later take is complete and the earlier one is flawed or cut off. If the two takes say different things, reject.
6. Apply: `apply_cut_plan {"planId":"<planId>","includeProposed":true,"exclude":["<rejected id>"]}`. To accept just a few, use `only` with their ids and `includeProposed` false.
7. Tell the user what you cut (quote the words) and what you kept.

## How to verify
The result says how many seconds were removed; `get_project` duration agrees. Cuts already made by `smart_cut` are skipped, not repeated.

## Pitfalls
- `plan_cuts` lists at most 60 cuts. Confidence is 0.75 for false starts and 0.6 for retakes: never accept blindly.
- A plan lives only in this session. "Unknown plan" means run `plan_cuts` again.
- Rephrased retakes look different in text and are missed. Say so.

## Do not
- Do not set `includeProposed` true without reading the reasons.
- Do not apply a retake whose earlier take is the better one.
- Do not export.
