# Template packs

Ready-made edit recipes. A template is **data**, not code: one JSON file that says which format to use, how
hard to cut, which titles and lower-thirds to add and when, and what the editor cannot do yet. The applier in
`packages/core/src/templates.ts` turns a template into edits **deterministically, with no AI**. The AI's only
job is to pick a template and fill in its variables ("make it a real-estate listing" becomes
`apply_template { templateId: "real-estate-listing", variables: { agent_name: "...", price: "..." } }`).

```
templates/
  styles/       creator and format editing styles   (16)
  industries/   industry recipes                     (18)
```

Each file is named `<id>.json`. Files starting with `_` are ignored. The schema is `TemplateSchema` in
`packages/core/src/templates.ts`; it is the source of truth and rejects unknown keys.

## What a template contains

| Field | Meaning |
|---|---|
| `id`, `version`, `kind` | Kebab-case id (same as the file name), revision number, `style` or `industry`. |
| `name`, `description`, `tags` | Shown to people and read by the AI when choosing. Say what the template does AND what it leaves to you. |
| `license`, `author`, `source` | SPDX licence from the allow-list, who wrote it, and the research file section the numbers come from. |
| `variables` | Values the user supplies: `name`, `label`, `type` (`text`, `name`, `phone`, `url`), `required`, `default`, `maxLength`, `example`. |
| `formats` | Supported aspect ratios (`16:9`, `9:16`, `1:1`, `4:5`), a target `lengthSec`, and per-platform lengths. `defaultAspect` picks one. |
| `cleanup` | `{ preset, overrides? }` with a cut preset from `CUT_PRESET_NAMES` (`gentle`, `standard`, `tight`, `podcast`, `tutorial`) and optional overrides of its numbers, or `{ skip: true, reason }` for music- or narration-led footage. |
| `beats` | The shot list: id, name, target `durationSec`, guidance, footage hint, optional `overlay` it belongs to. Guidance for the filmmaker; the editor does not re-arrange footage into it. |
| `overlays` | Text overlays using ONLY presets from `OVERLAY_PRESETS` (see timing rules below). |
| `fades` | Seconds of fade in at the start and fade out at the end. |
| `deferred` | Steps that need engine features that do not exist yet, each with `requires: [...]`. Always reported as skipped. |
| `notes` | Compliance reminders shown to the user, each with a category. Always shown with the disclaimer "general notes, not legal advice". |
| `confirmations` | Questions the user must answer before publishing (current price, release signed, ...). Reported as needs-review. |

### Overlay timing rules

All times are seconds on the **cut** video, so they are computed after the cleanup step.

- `anchor: "start"` begins `offset` seconds after the start (title at `0.3`, lower-third at `2`).
- `anchor: "end"` finishes `offset` seconds before the end (end card: `offset: 0`, `duration: 4`).
- `anchor: "full"` covers from `offset` to the end, split into pieces the overlay command accepts (disclaimer bars).
- `duration` is the wanted length. `maxFraction` caps it as a share of the video, and `minDuration` is the
  shortest the overlay may be squeezed to; below that it is skipped with a reason, never shown half-way.
- Overlays never run past the end. Two overlays at the same screen position never overlap: the higher
  `priority` keeps its time and the other is shortened or dropped. That is how a 6-second video keeps its end
  card clear of the title.
- `when` skips the overlay if that variable has no value. Text uses `{{variable}}`; separators left
  dangling by an empty variable (`"{{phone}} · {{url}}"` with no phone) are trimmed.
- Font sizes are reduced automatically so text fits the frame (the renderer does not wrap). When even the
  smallest size would overflow, the step is reported as needs-review.

### Variables and safety

Values are sanitised (control and invisible characters removed, whitespace collapsed) and validated by type
and length. Too-long values are **rejected**, not cut. Unknown variable names are errors. Types: `name`
(letters, digits and `. , ' & ( ) / -`), `phone` (7 to 15 digits), `url` (http or https only; shown without the
scheme). Variables never reach FFmpeg or a shell; the overlay renderer writes text to files.

### What applying does

`applyTemplate` (and the `apply_template` command) runs, in order: set format, check framing, smart cut with
the preset (or the preset plus overrides), add overlays, set fades, then report on length, the beat
structure, deferred steps and confirmations. It returns a report where every step is **done**, **skipped**
(with the reason) or **needs-review**. It is one undo step, and applying it twice replaces its own overlays
instead of stacking copies (`existing: "replace"`, the default; `"skip"` and `"add"` are the alternatives).
Overlays are named `tpl-<template id>-<overlay id>`; moving one by hand is undone on the next apply.

Not done on purpose: matching footage to beats, choosing highlights, re-framing a wide video for 9:16
(it is letterboxed and the report says so), and anything under `deferred`.

## Adding a template

1. Copy the closest file in `styles/` or `industries/`, rename it `<new-id>.json` and set `id` to match.
2. Fill every field. Keep numbers traceable: put the research section in `source` and prefer values from
   `docs/research/creator-editing-styles.md` and `docs/research/industry-video-templates.md`. If a number is a
   guess, say so in the guidance text.
3. Use only existing overlay presets (`OVERLAY_PRESETS` in `packages/core/src/presets.ts`) and cut presets.
   Anything else the style needs (captions, music, B-roll, zoom, sound effects, speed, transitions, colour
   grade, logos, waveform, re-framing, matching footage to beats) goes under `deferred` with `requires`.
   Never fake it with an overlay. The names are the keys of `ENGINE_FEATURES`.
4. Give every variable an `example` and, where sensible, a `default`. Mark `required: true` only if the
   template is meaningless without it.
5. Write compliance `notes` for the topics that apply (health, finance, real estate, testimonials, advertising,
   music, copyright, privacy, AI disclosure, safety). Any template that lists a music step needs a `music` note.
   Notes are general information; word them as "check", not as legal conclusions.
6. Run `pnpm --filter @dax/core test` (every template is validated, applied to a fake project and checked for
   timing, short videos, idempotence and honest reporting) and `pnpm exec biome check --write templates`.

## For scout agents (intake policy)

Adding a template is a content intake. The rules in `docs/research/open-source-radar.md` ("Intake policy") and
`docs/adr/0009-autonomous-open-source-intake.md` apply:

- **Licence.** Only templates you wrote, or that are CC0-1.0, MIT, Apache-2.0, BSD or CC-BY-4.0 with attribution
  in `author`/`source`. Never copy a template, preset pack or caption style from a project whose licence is
  not on the allow-list (non-commercial, AGPL/GPL and "no licence" are out). Read, summarise, and write your own.
- **No copying creators or brands.** A style template describes a publicly discussed technique in your own
  words. Do not include a creator's captions, graphics, fonts, music, catchphrases or footage, and keep the
  "not affiliated" note on templates named after a creator.
- **Evidence.** Cite the source in `source`, and mark vendor claims and guesses as such. Leave folklore
  statistics ("67% swipe away in 3 s") out.
- **No telemetry, no network, no executable content.** A template is plain JSON. No URLs to fetch, no paths, no
  FFmpeg arguments, no scripts.
- **Compliance.** Do not weaken or drop a `notes` or `confirmations` entry that exists in a similar template.
- **Escalate** to a human: anything touching medical, legal or financial claims beyond a general reminder, minors,
  or a licence you are unsure about. One template per pull request, with the test output in the description.
