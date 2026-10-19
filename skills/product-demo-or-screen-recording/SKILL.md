---
name: product-demo-or-screen-recording
description: Use when the video is a screen recording, software walkthrough or product demo, narrated or silent, that needs cleaning up and labelling.
tags: [screen recording, screencast, screen capture, demo, product demo, software, app walkthrough, walkthrough, ui, click, cursor, saas, loom, onboarding, dead wait, loading]
---

## When to use
"Clean up my screen recording", "tighten this demo", "add step labels to the walkthrough". The picture is a screen, often with narration.

## Steps
1. `get_project`: check `hasAudio` and `hasTranscript`.
2. `save_checkpoint {"name":"before-demo"}`.
3. Narrated? `transcribe {}` if needed, then `smart_cut {"preset":"tutorial"}`. It cuts long speech pauses but keeps thinking time while the person acts.
4. No audio, or silent parts where only the screen changes? Audio tools find nothing. Use `detect_scenes {"threshold":0.3}` to see when the screen changes. A long stretch with no change and no speech (a loading wait) is a candidate: ask the user, then `delete_range {"from":95,"to":110}`. Several: work from the end back.
5. Opening title: `add_overlay {"preset":"title-fade","start":0.4,"duration":3,"text":"Create an invoice"}` (what it shows, up to 6 words).
6. Step cards: `add_overlay {"preset":"title-fade","start":30,"duration":2,"text":"Step 2: Add a customer"}` at each scene change. A click target: `callout-slide-up`, 3 s, "Click Settings" (see add-callout).
7. Keep the format landscape. Do not shrink to vertical unless asked; small screen text becomes unreadable.
8. Ending: add-end-card-cta.

## How to verify
`get_project`: overlays in order, none past the end, duration down only by confirmed cuts.

## Pitfalls
- Zoom into clicks, cursor highlights, speed-ups of waits and music do not exist yet; say so (handle-unsupported-requests).
- Typing noise or system sounds read as speech, so pauses may not be found.
- A scene change can be a pop-up, not a new step. Check before labelling.
- Delete ranges AFTER you confirm them; wrong ones cut useful clicks.

## Do not
- Do not cut silent footage just because it is silent.
- Do not label steps you cannot see in the transcript or scenes.
- Do not export.
