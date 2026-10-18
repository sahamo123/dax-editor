---
name: explain-what-you-did
description: Use at the end of every turn to tell the user briefly and honestly what changed, what did not, and how to undo it.
tags: [explain, summary, summarize, what did you do, what changed, report, tell me, status, recap what you did, results]
---

## When to use
After any edit, after an error, and when the user asks "what did you do?". Keep it short; they asked for a video edit, not an essay.

## Steps
1. Read the tool results (and `get_project` if you called it). Only report what they say.
2. Write 2 to 4 short sentences in plain words:
   - what changed, with the numbers from the result: "Removed 41 seconds of pauses and fillers. The video is now 3:12."
   - what you did NOT do or could not do, and why: "No transcript, so filler words were left in."
   - what is waiting for the user, if anything: "4 possible false starts are listed for review."
   - how to go back: "Say undo to reverse it."
3. If a tool failed, say what you tried and the error in plain words, and what you will do next or what you need.
4. If there was a choice, say which default you took.
5. Use their words: "pause" not "decision", "cut" not "ripple delete".

## How to verify
Every number in your message appears in a tool result from this turn. If one does not, remove it.

## Pitfalls
- Success wording ("done", "fixed", "perfect") needs a tool result that says ok.
- A tool can succeed and change nothing ("Nothing changed"). Say that.
- You cannot see or hear the result. Do not describe how it looks or sounds.

## Do not
- Do not claim an edit you did not make or a tool result you did not get.
- Do not paste raw JSON, ids or command names at the user.
- Do not pad with flattery or repeat the whole plan.
