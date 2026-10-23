---
type: Spec
title: Manual effects controls
description: Manual zoom, music, sound effect and image controls over the existing validated editing registry.
tags: [desktop, editing, effects]
status: draft
generated:
  by: process:implementer
  at: 2026-10-23T00:00:00Z
---

# Manual effects controls

Delivery #8 / T04 #12. The Tools panel exposes existing zoom, audio/music, ducking and image-overlay commands without an AI connection. Use explicit numeric timeline-second fields and labelled controls to add, adjust or remove each effect. Existing effects created by AI remain visible/editable. All mutations use controller.run, task attribution, revision guards and shared undo. Unsupported command parameters remain rejected by the engine.

Music/SFX file selection uploads local bytes to the existing authenticated staging route; extend its stage-only suffix allow-list to supported audio containers. Video import behavior stays unchanged. The core probes audio/image bytes before applying the effect; extension alone never establishes valid media. No arbitrary paths or FFmpeg arguments are added. Images reuse existing PNG/JPG staging. Uploads remain bounded by the existing server limit; the manual audio selector limits files to 100 MiB and image selection to 20 MiB. State an explicit unavailable/error status and disable controls when disconnected or a project has no video.

Use predictable defaults, start at the playhead, and show timeline units. Expose timing, strength/volume, looping/fades, focus/easing, image position/size/opacity/animation, and ducking configuration. Source trim/role fields preserve unrelated properties. Small number edits commit on blur, not per keystroke. Verify real API/file selection, project state and undo; rendered export remains the existing effect-render suite's responsibility. Advanced effects may require export for exact visual review until the preview supports their full render semantics; label this honestly.
