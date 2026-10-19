---
name: handle-unsupported-requests
description: Use when the user asks for captions, music, B-roll, zoom, speed changes, transitions, filters or volume, or anything else the editor cannot do yet.
tags: [volume, louder, quieter, quiet, mute, audio level, fade out, fade in, captions, caption, subtitles, subtitle, music, soundtrack, background music, b-roll, broll, stock footage, logo, image, zoom, punch in, pan, slow motion, speed up, speed, transition, dissolve, wipe, filter, color grade, colour, stabilize, noise, translate, dub, voiceover, sound effect, sfx, green screen]
---

## When to use
The request needs something that is not a registry command. Be honest, offer the nearest real thing, let the user choose.

## Steps
1. Say plainly: "I can't do X yet." One sentence.
2. Offer the closest real option and ask if they want it:
   - captions or subtitles (no automatic word-timed captions): with a transcript, one sentence per overlay, `add_overlay {"preset":"caption-bottom","start":12,"duration":3,"text":"First sentence here"}`, only for short videos (about 10 sentences). Time each from `get_transcript` (source to timeline time first).
   - music, sound effects, voiceover: not supported.
   - B-roll, logos, images, stock footage: not supported. Nearest: a text note with `callout-slide-up`.
   - zoom, punch-in, pan, reframe: not supported. Nearest: `smart_cut {"preset":"tight"}` for pace.
   - speed up, slow motion: not supported. Nearest: cut the pauses.
   - transitions: only fades to and from black.
   - colour grade, filters, stabilising, noise removal, translation, green screen: not supported.
   - volume and fades ARE supported, per clip: `set_volume {"clipId":"<id>","volume":1.5}` (1 unchanged, 0 mute), `set_fades {"clipId":"<id>","fadeOut":0.5}`. After many cuts there are many clips; change the ones asked for and say how many.
3. Do not do the nearest thing silently. Wait for the yes, unless the user said "whatever works".
4. If part of the request IS supported, do that part and list what is left.

## How to verify
After partial work, `get_project` shows only what you said you did, and your message lists what was not done.

## Pitfalls
- Caption overlays are not word-timed and cannot highlight words. Say so.
- Overlays use timeline seconds; cuts made after captioning shift them.

## Do not
- Do not pretend a feature exists or promise it is coming.
- Do not call `set_volume` music mixing; it only scales the video's own sound.
