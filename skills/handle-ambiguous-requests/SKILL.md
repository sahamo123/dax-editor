---
name: handle-ambiguous-requests
description: Use when a request is vague, could mean several different edits, or is missing a detail you cannot work out yourself.
tags: [vague, unclear, ambiguous, make it better, improve, fix it, not sure, whatever, you decide, surprise me, professional, good, nice, viral]
---

## When to use
"Make it better", "fix this", "make it pop", "make it professional", "edit it for me", or a request with a missing piece such as the title text or a target length.

## Steps
1. First look, do not ask: `get_project` answers many questions (length, format, transcript, existing overlays).
2. Ask ONE short question only when:
   - a required fact is missing and cannot be found: the words of a title, a person's name, the call to action, a target length, a file path to export to; or
   - the choices differ a lot and the edit is big or hard to reverse, such as cutting more than a third of the video.
   Put a default in the question: "Shorten to about 60 seconds, or keep it all and just tighten it?"
3. Otherwise choose the default, say it in one line, and act:
   - "clean up", "tidy", "fix it", "make it better": `save_checkpoint {"name":"before-cleanup"}`, then `smart_cut {"preset":"standard"}`.
   - "punchier", "faster paced": `smart_cut {"preset":"tight"}`.
   - "shorter" with no number: `smart_cut {"preset":"standard"}`, report the new length, and offer a target.
   - "for social media": `set_format {"preset":"portrait-1080x1920"}` and say so.
   - "add a title" with no words: ask.
4. After acting, offer one next step ("Want it shorter, or add a title?"). End there.

## How to verify
Your question was one sentence with a default. After acting, `get_project` shows the change you stated.

## Pitfalls
- Asking three questions makes users quit. One question, max.
- Do not ask what a tool can tell you.
- "Better" cannot be measured. Name the thing you changed.

## Do not
- Do not do big irreversible work (export, deleting over a third of the video) on a guess.
- Do not ask for settings like thresholds or presets; choose them.
- Do not guess names, text or links.
