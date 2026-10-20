---
type: Research
title: Creator editing styles as engine templates
description: Sixteen creator and format editing styles reduced to measurable parameters, mapped onto the engine's presets, with the engine gaps ranked by how many styles need them.
tags: [research, editing, styles, captions, pacing, presets, templates]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:20:00Z
---

# Creator editing styles as engine templates

Written 2026-10-18. Goal: sixteen creator and format styles, each reduced to a parameter block that a "make it in this style" template could apply to an uploaded talking-head, screen-recording or tutorial video. Engine facts were read on this date from `packages/core/src/presets.ts`, `schema.ts`, `render.ts`, `overlay-filters.ts` and `transcript.ts`.

**Evidence tags.** Every value carries one tag:

- **[S]** stated by the creator, an official or platform document, or platform data, and opened (see Sources).
- **[V]** vendor, tool-blog, press or search-snippet claim, or an AI-generated style analyser. Directional only.
- **[I]** our inference, or a gap in the sources. Measure before a template ships.

**Limits.** No Reddit thread could be read: the search tool refused the domain and the fetch was blocked. No creator interview we opened gives per-minute editing numbers, so most numeric values are [V] or [I]. Treat them as starting defaults for a tunable template, not as ground truth. The per-style cut rates are not measured by anyone we found, except MrBeast's two counted samples.

## 1. Ranked engine gaps

Ranked by how many of the 16 styles need the capability (counts include [I] needs). Gap IDs G1 to G13 are used in Section 3.

**Engine baseline.** One gapless main video track (`v1`). Clips carry `volume` and fade-to-black or from-black only. Overlays are text only, drawn with `drawtext` in six animations (none, fade, slide-up, slide-left, pop, typewriter) and four positions, with an optional box and an accent bar. Two font files (regular and bold). Silence and scene detection exist in `media.ts`. Transcript word timings and filler ranges exist in `transcript.ts`, but no speech-to-text adapter implements `Transcriber`.

1. **G3. Audio layers: music bed with ducking, plus SFX one-shots placed on cut points** (12 styles). Today a clip has one audio stream with `volume` and fades. Needed: an audio track list, sidechain ducking under voice, and one-shot placement. A loudness target near -14 LUFS is the secondary-source playback reference for YouTube [V].
2. **G2. Punch-in and zoom keyframes per clip** (11). `render.ts` only fits and pads each clip (`scale` then `pad`). Needed: a crop-and-scale window that changes over time, with easing. G12 reuses it.
3. **G5. Image, shape and full-frame card overlays** (10). Overlays are `kind: "text"` only. Needed: image and shape overlays, a solid-colour card for chapter and end cards, and map or sketch layers.
4. **G1. Word-timed captions with per-word highlight and outline** (9). `caption-bottom` shows whole lines in one style. Needed: a caption-track model that chunks words into 2 to 4 word groups, a speech-to-text adapter, and per-run colour and outline (ASS through libass, or a drawtext chain). Interim: one `title-pop` overlay per word gives a one-word-at-a-time look, with no colour switch inside a line.
5. **G4. A second video layer for B-roll inserts** (7). Needed: an overlay video track above `v1`, with a rule for which audio plays (normally keep the A-roll voice).
5. **G9. Colour grade or LUT per clip or project** (7). `render.ts` changes colour only through `format=yuv420p`. Needed: LUT or curves and levels parameters. Any LUT file must have a licence that AGENTS.md allows.
7. **G8. Text outline, shadow and font family** (5). `OverlayStyleSchema` has colour, bold, box and accent only. Needed: outline width and colour, shadow, and a font list beyond regular and bold.
8. **G6. 9:16 reframe with subject position** (4). Today the frame is letterboxed. Needed: a crop window with an x offset, set by hand first, then by speaker or face tracking.
8. **G10. Transitions beyond fade-to-black** (4). Needed: dissolve, wipe and zoom-through between main-track clips (FFmpeg `xfade` is the likely tool; the clip-timing model needs checking).
10. **G7. Keyframed motion for overlays** (3). The six animations are fixed. Needed: position, scale and opacity keyframes with easing, and a path for maps and sketch strokes.
10. **G11. Speed change and ramps** (3). Needed: per-clip speed with matching audio (`setpts` with `atempo`, which has a per-instance range limit to check), then speed keyframes.
10. **G12. Cursor and click-driven zoom for screen recordings** (3). The engine has no cursor input. Needed: a cursor and click track from the recorder as a sidecar file, turned into G2 keyframes.
13. **G13. Waveform or audiogram visual** (1). Needed: a waveform overlay generated from clip audio. One implementation note says bars must be driven from the frame time, not a live analyser, or they desync [V].

Already covered, no gap: lower third with slide, title fade, title pop, typewriter title, callout box, silence detection, and filler-word ranges once a transcript exists.

### 1.1 Existing presets and where they fit

| Preset (`presets.ts`) | Fits | Limits seen |
|---|---|---|
| `title-fade` | chapter titles, location titles, step cards (3.3, 3.4, 3.7, 3.9, 3.13, 3.15) | none for these uses |
| `title-pop` | one-word captions, hook text (3.1, 3.11, 3.12) | one word or short phrase per overlay |
| `title-typewriter` | code-like text, sketch captions (3.6, 3.7) | long text falls back to fade |
| `lower-third-slide` | speaker or interviewee name (3.4, 3.10, 3.14, 3.16) | fixed bottom-left, duration editable |
| `caption-bottom` | sentence subtitles (3.7, 3.10, 3.14, 3.16) | one style, no word sync |
| `callout-slide-up` | emphasis, key numbers (3.1, 3.5, 3.6) | one box colour, top position |

## 2. Comparison table

Values are the parameter the style is best known for. [S], [V] and [I] tags are in Section 3.

| Style | Format and length | Cut rate | Silence kept | Zoom or jump cut | Captions | Music and SFX | Hook (first 3-5 s) |
|---|---|---|---|---|---|---|---|
| 3.1 Hormozi word captions | 9:16 talking head [V] | ASL 1-3 s [V] | removed [V] | jump cut every 1-3 s; 10-20% punch-in [V] | word by word, 2-4 words [V] | subtle music, no transition SFX [V] | claim up front [I] |
| 3.2 MrBeast retention | 16:9 long-form [I] | 38 and 23 cuts in one sampled minute [S] | not stated | frequent zooms [I] | not stated [I] | loud SFX, quick cuts [V] | outcome teaser [I] |
| 3.3 Ali Abdaal talking head | 16:9 long-form [I] | ASL 2-5 s [V] | cut by hand [S] | zoom-ins at key moments [S] | added in post [V] | sound design about 4 of 30 h [S] | topic stated early [I] |
| 3.4 Vox / Harris / Veritasium | 16:9, 8-20 min [I] | follows narration [V] | narration pauses [I] | slow push-ins [I] | sparse callouts [V] | music low under voice [V] | question or scene, stakes in 10 s [opinion] |
| 3.5 Kurzgesagt | 16:9 [I] | timed to narration [S] | narration sets pace [S] | none, animated camera [I] | not stated [I] | score and SFX per video [S] | visual metaphor, big number [I] |
| 3.6 Fireship | 16:9 short tutorial [I] | dense, no figure [V] | dead air cut [V] | code zoom [I] | likely [I] | SFX and meme inserts [I] | problem named at once [I] |
| 3.7 Khan whiteboard | 16:9 [V] | one continuous drawing [I] | narration continuous [I] | zoom-ins and callouts [V] | sparse [I] | quiet bed [I] | question, then sketch [I] |
| 3.8 MKBHD review | 16:9, 8-15 min [I] | not measured | not stated | punch-in on product [I] | not stated | music bed [I] | verdict early [I] |
| 3.9 Neistat vlog | 16:9, 5-15 min [I] | sped-up montage, jump cuts [V] | jump cut inside speech [V] | push-in as a cut [V] | none [I] | music first, cut to beats [V] | mid-action, cut-off [V] |
| 3.10 Podcast clip | 9:16, 15-60 s [V] | one per speaker change [I] | trimmed [I] | reframe to speaker [I] | word captions, speaker labels [V] | licensed music only [V] | quote with context [V] |
| 3.11 UGC testimonial | 9:16, 15-30 s [I] | native pacing [V] | trimmed [I] | handheld punch-in [I] | on [V] | low or trending audio [I] | pattern interrupt in 2 s [V] |
| 3.12 Short-form hooks | 9:16; Shorts up to 3 min [S] | sub-3 s shots [V] | trimmed [I] | interrupt zoom [V] | short, high contrast [V] | SFX on interrupts [V] | payoff first, promise [V] |
| 3.13 Screen tutorial | 16:9, 9:16 cut-down [I] | continuous [I] | dead waits sped up [I] | click-driven zoom [V] | step captions [I] | low bed [I] | end result first [V] |
| 3.14 Minimal corporate | 16:9 or 4:5, 15-30 s [S] | 3-6 s [I] | trimmed [I] | none [I] | SRT, text only [S] | quiet, sound off by default [V] | topic and name on screen [V] |
| 3.15 Cinematic travel | 16:9 or 9:16, 30-90 s [I] | beat-matched [V] | no speech [I] | slow push-in, ramp [V] | place titles [I] | score dominant, foley [V] | strongest shot first [I] |
| 3.16 Documentary interview | 16:9, 5-15 min [I] | 4-8 s with B-roll cover [I] | pauses kept [I] | subtle push-in [I] | sentence subtitles [I] | bed 10-15 dB under voice [V] | cold-open line, title [I] |

No source we opened measures cut rates by style. The table is a set of defaults to tune.

## 3. Style templates

Each block lists the parameters in the order the brief asked for, then the engine fit. Values are the best available; the tag says how good they are.

### 3.1 Hormozi-style word captions (talking head)

Evidence: [V] Choppity and Submagic reverse-engineering, a 2026 critique, and a Premiere and CapCut how-to. No creator-published spec found.

- **Format:** 9:16 vertical; speaker fills at least 60% of frame [V].
- **Cuts and silence:** jump cuts every 1-3 s between a medium shot and a tighter close-up; pauses and filler removed [V].
- **Zoom:** 10-20% digital punch-ins, "frequent" (no frequency given) [V].
- **Captions:** bold sans, uppercase, white base, active word yellow, thick black outline, slight shadow, 2-4 words visible, lower third, each word bounces in. Values are unquantified [V]. Font is "close to Montserrat Black" in one source, "The Bold Font" or Anton in others [V]. Premiere method: max 15 characters per line, min 2 s per caption [V].
- **Titles and B-roll:** no title system; B-roll layered to illustrate speech [V].
- **Music and SFX:** subtle low-energy music, no transition SFX [V]. No level given.
- **Grade:** high contrast, warm skin, near-black background, soft key light [V]. A 2026 critique calls the yellow-and-green look oversaturated and suggests a brand colour for the highlight [V].
- **Hook and end:** open on the claim or promise with no intro card [I]. CTA not sourced [I].
- **Avoid:** generic yellow-green highlight [V]; captions over the face [I].
- **Engine:** `title-pop` one word at a time is the nearest fit today; `callout-slide-up` for emphasis. Needs G1, G2, G3, G6, G8, G9.

### 3.2 MrBeast fast-cut retention editing

Evidence: [S] the creator's own statements and a two-sample cut count (Tubefilter author's one-minute counts); [V] AIR's definition and Hacker News opinion.

- **Format:** 16:9 long-form [I].
- **Cuts and silence:** 38 cuts in one sampled minute (March 2023 video) and 23 in one minute (2024 video) [S, two samples, one creator]. Older style removed pauses [V, press summary].
- **Zoom:** frequent zooms [I].
- **Captions:** not stated [I].
- **Titles and B-roll:** frequent graphics; AIR lists B-roll and on-screen text used when attention slips [V].
- **Music and SFX:** loud SFX, quick cuts, flashing effects, no pauses [V, press description]. No level given.
- **Grade:** [I].
- **Hook and end:** outcome teaser [I]. The creator later said he "slowed down our videos, focused on story telling, let scenes breathe, yelled less", and called the ultra-fast style something that "doesn't even work" [S]. The author notes many factors affect views [S].
- **Avoid:** copying the 2023 density as a default. Loud SFX on every cut.
- **Engine:** `title-pop`, `callout-slide-up`. Needs G1, G2, G3, G4, G5, G10.

### 3.3 Ali Abdaal talking head with B-roll and chapter cards

Evidence: [S] editing-team account via a vendor post (times described as approximate); [V] Riverside and an AI analyser.

- **Format:** 16:9 long-form [I].
- **Cuts and silence:** 2-5 s per shot [V, low-quality analyser]. Silences cut by hand, zoom-ins at key moments [S].
- **Zoom:** zoom-ins at key moments, not every sentence [S].
- **Captions:** added in post [V].
- **Titles and B-roll:** about 30 h of editing per video: roughly 4 h A-roll cleanup, 8 h B-roll, 6 h titles and motion graphics, 4 h music and sound, 8 h review and sponsor work [S, approximate]. Chapter cards at topic changes [S].
- **Music and SFX:** sound design is one of the larger blocks above [S].
- **Grade:** [I].
- **Hook and end:** [I] state the topic in the first lines.
- **Avoid:** B-roll with no function. An editor quoted in a Descript article says stock "coverage" with no purpose hurts [opinion].
- **Engine:** `title-fade` for chapter titles, `lower-third-slide`, `caption-bottom`. A chapter card needs G5. Needs G1, G2, G3, G4, G5.

### 3.4 Explainer: Vox, Johnny Harris, Veritasium

Evidence: [V] search snippets and gig briefs describing the look; [opinion] two editors quoted in a Descript article. The Veritasium process was not found.

- **Format:** 16:9, 8-20 min [I].
- **Cuts and silence:** cuts follow narration beats. No figure found [V]. Narration pauses kept for emphasis [I].
- **Zoom:** slow push-ins on maps and archival shots [I].
- **Captions:** sparse text callouts; subtitles not discussed [V].
- **Titles and B-roll:** name lower third plus chapter title. Archival clips, news footage, maps and simple text callouts cut to narration. The voice does not fill every second [V]. Johnny Harris's own map tutorial uses After Effects and Mapbox [V, summary].
- **Music and SFX:** music low under narration [V]. A "10-15 dB below voiceover" figure is attributed to "many editors" only [unverified].
- **Grade:** film-like texture; physical props and manual inputs on talking heads [V, newsletter].
- **Hook and end:** a question or a specific scene, with the topic clear within 10 s [opinion].
- **Avoid:** "too many wild and crazy graphics" [opinion]; stock B-roll used only as coverage [opinion].
- **Engine:** `title-fade`, `lower-third-slide`, `callout-slide-up`. Needs G3, G4, G5, G7, G9.

### 3.5 Kurzgesagt motion-graphic explainer

Evidence: [S] the studio's own production page (five stages, no timings).

- **Format:** 16:9 [I]. No length given.
- **Cuts and silence:** animation is timed to narration. Steve's voiceover "provides the timing for the animation team" [S].
- **Zoom:** no punch-ins; camera moves are drawn [I].
- **Captions:** not stated [I].
- **Titles and visuals:** vector, pixel and infographic illustration; 2D flat animation with 3D elements; visual metaphors [S]. No B-roll [I].
- **Music and SFX:** a specially composed soundtrack per video plus sound effects for mood [S].
- **Grade:** flat, bright palette [I].
- **Hook and end:** visual metaphor opens [I]. Sources appear on screen [V, search snippet].
- **Avoid:** copying the production budget. The page gives no timings, so do not promise a schedule.
- **Engine:** no preset is a close fit. `callout-slide-up` for stat callouts, `title-fade`. Needs G3, G5, G7.

### 3.6 Fireship-style fast code tutorial

Evidence: [V] one skills file that describes the style; no creator-published breakdown found.

- **Format:** 16:9 short tutorial [I].
- **Cuts and silence:** dense; each shot must entertain, teach or set up a transition [V]. Pace comes from the writing and structure, not from speed-up in post [V].
- **Zoom:** code zooms [I].
- **Captions:** likely, for jokes and terms [I].
- **Titles and visuals:** code screens, code callouts, meme inserts [I].
- **Music and SFX:** SFX and music [I].
- **Grade:** dark code themes [I].
- **Hook and end:** problem named in the first seconds [I]; short recap at the end [I].
- **Avoid:** code too small to read on a phone [I]; shots that add nothing [V].
- **Engine:** `title-typewriter` for code-like text, `callout-slide-up`. Needs G1, G2, G3, G5, G12.

### 3.7 Khan Academy and whiteboard-sketch explainer

Evidence: [S] Sal Khan's 2013 advice (Fast Company, search snippet only, not opened); [V] style guides.

- **Format:** 16:9 [V].
- **Cuts and silence:** one continuous drawing, long shots [I].
- **Zoom:** zoom-ins and callouts added in post [V].
- **Captions:** sparse [I].
- **Titles and visuals:** dark digital chalkboard, coloured pen strokes, calm narrator [V]. The sketch comes after the script, and the script is often thrown away [S, snippet]. About ten minutes per video [S, snippet].
- **Music and SFX:** quiet bed [I].
- **Grade:** dark background [V].
- **Hook and end:** question, then the sketch [I].
- **Avoid:** long unbroken zooms; many font styles [I].
- **Engine:** `title-typewriter`, `caption-bottom`, `callout-slide-up`. Needs G2, G5, G7, G12.

### 3.8 MKBHD-style product review

Evidence: [V] search only; thin. A secondhand summary says the creator edits his own videos, and a masterclass says the team uses Final Cut Pro.

- **Format:** 16:9, 8-15 min [I].
- **Cuts and silence:** not measured [I]. Product close-ups [I].
- **Zoom:** punch-ins on product detail [I].
- **Captions:** [I].
- **Titles and B-roll:** spec or price cards [I]; B-roll mostly product and filming [I].
- **Music and SFX:** low music bed [I].
- **Grade:** neutral, clean [I].
- **Hook and end:** verdict or key feature in the first 15 s [I].
- **Avoid:** spec dumps without context [I].
- **Engine:** `lower-third-slide` for the product name, `title-fade`. Needs G2, G3, G4, G5, G9.

### 3.9 Casey Neistat-style vlog

Evidence: [V] analyses and a vlogging guide; no editing interview opened.

- **Format:** 16:9 vlog, 5-15 min [I].
- **Cuts and silence:** jump cuts inside continuous speech, timed to natural pauses. Random ones look like mistakes [V]. Montages of sped-up footage [V]. One guide says he shoots 30+ minutes for a 10-minute vlog [V].
- **Zoom:** a push-in used as a cut [V]; whip-pan match cuts [V].
- **Captions:** none stated [I].
- **Titles and B-roll:** montage B-roll [V].
- **Music and SFX:** music chosen first, cuts to its beats [V, one guide].
- **Grade:** [I].
- **Hook and end:** mid-action opening; scene change mid-sentence [V].
- **Avoid:** random jump cuts [V].
- **Engine:** `title-fade` for day titles. Needs G2, G3, G4, G10, G11.

### 3.10 Podcast video clips with waveform and captions

Evidence: [V] 2026 vendor guides; no creator interview.

- **Format:** 9:16 vertical. Length: 15-45 s, 30-90 s, or under 60 s, depending on the guide [V, conflicting].
- **Cuts and silence:** one cut per speaker change [I]; silences trimmed [I].
- **Zoom:** reframe to the speaking person [I].
- **Captions:** word captions with speaker labels. One vendor says labels need a sample check; it cites 94-99% accuracy for clear single-speaker audio and 90-95% for several speakers [V].
- **Titles and waveform:** audiogram waveform over a background [V].
- **Music:** licensed music only [V].
- **Grade:** none [I].
- **Hook and end:** a complete moment with hook, context and payoff [V]. Episode link as CTA [I].
- **Avoid:** wrong speaker labels; unlicensed music; a waveform that desyncs (see G13).
- **Engine:** `caption-bottom`, `lower-third-slide` for the speaker name. Needs G1, G2, G3, G6, G8, G13.

### 3.11 Talking-head ad and UGC testimonial

Evidence: [V] platform guidance relayed by agencies and tool vendors. No official TikTok or Meta page was opened. A WARC summary of TikTok-partner studies is the most specific source.

- **Format:** 9:16, 15-30 s [I].
- **Cuts and silence:** native pacing, no figure [V]; trimmed [I].
- **Zoom:** handheld punch-ins [I].
- **Captions:** on, with text overlays [V].
- **Titles:** product or offer card near the end [I].
- **Music and SFX:** trending or low audio [I].
- **Grade:** natural light, no LUT [V].
- **Hook and end:** a pattern interrupt or problem in the first 2 s. WARC reports 2 s as the ideal ad-recall point and 2.5 s for awareness [V]. The "67% swipe away in 3 s" figure is unsourced [folklore]. Offer and CTA card [I].
- **Avoid:** studio polish [V]; customer footage without written permission [V].
- **Engine:** `title-pop` for the hook, `caption-bottom`. Needs G1, G2, G5, G6, G9.

### 3.12 Short-form vertical hooks (Shorts, Reels, TikTok)

Evidence: [S] the platform change, from press coverage (YouTube's own post not opened); [V] hook-formula guide.

- **Format:** 9:16. Shorts can run up to 3 minutes for square or vertical uploads, from 15 October 2024; before that the limit was 60 s [S, press].
- **Cuts and silence:** short shots, under about 3 s [V].
- **Zoom:** pattern-interrupt zooms, colour shifts, freeze-frames with text [V].
- **Captions:** short, high contrast, on screen at least 2 s [V]. Reading-speed reference from the Netflix English guide: 42 characters per line, two lines, 20 characters per second for adults [S].
- **Titles:** hook text in the first 2 s [V].
- **Music and SFX:** a sudden SFX on each interrupt [V].
- **Grade:** [I].
- **Hook and end:** pattern interrupt, direct promise with a number, question, or contradiction plus promise; lead with the payoff [V]. A 2-2.5 s hook target is the author's own practice [V]. A "3-second hold" threshold is asserted but unsourced [folklore]. Loop or next-video card [I].
- **Avoid:** promises with no measurable outcome; burying the payoff [V].
- **Engine:** `title-pop`, `caption-bottom`, `callout-slide-up`. Needs G1, G2, G3, G6, G8, G10.

### 3.13 Screen-recording tutorial with zoom-ins and cursor highlight

Evidence: [V] Screen Studio's guide and competitor pages. No independent source.

- **Format:** 16:9 source; optional 9:16 cut-down [I].
- **Cuts and silence:** continuous; dead waits removed or sped up [I].
- **Zoom:** click-driven zoom that glides in; manual override. Zoom on areas with no clicks needs manual setting [V]. Cursor smoothed; clicks show a ripple [V].
- **Captions:** step captions in the lower third [I].
- **Titles:** "Step N" cards [I]; webcam bubble [I].
- **Music and SFX:** low bed [I].
- **Grade:** none [I].
- **Hook and end:** end result first [V, one creator's anecdote]. CTA [I].
- **Avoid:** zooms on empty areas [V]; screen text too small for a vertical cut [I].
- **Engine:** `title-fade` for step cards, `caption-bottom`. Needs G12, G2, G1, G5, G11.

### 3.14 Minimalist corporate and LinkedIn

Evidence: [S] LinkedIn's Help page (undated snapshot; the page says "last updated 3 months ago"); [V] vendor guides.

- **Format:** 16:9 up to 1920x1080; 1:1; 4:5 recommended at 720x900; 9:16 at 720x1280 [S]. Length: 15-30 s recommended, up to 90 s in-stream [S].
- **Cuts and silence:** slow, 3-6 s [I]; trimmed [I].
- **Zoom:** none [I].
- **Captions:** SRT, text only, no custom formatting [S]. Sound is off by default [V], so captions carry the message.
- **Titles:** one-line title or name in the lower third; brand font [I].
- **B-roll:** office or product shots [I].
- **Music and SFX:** quiet, no SFX [I].
- **Grade:** neutral, flat [I].
- **Hook and end:** name and topic on screen in the first 3 s [V]. Logo end card of 2-3 s [I].
- **Avoid:** decorative transitions and loud SFX [I]. Platform SRT cannot carry the brand look, so burn captions in [S].
- **Engine:** `lower-third-slide` restyled, `caption-bottom`, `title-fade`. Needs G1 (SRT import), G5, G8, G9.

### 3.15 Cinematic travel

Evidence: [V] an Adobe tutorial snippet, LUT vendor pages and a freelancer listing. No creator breakdown.

- **Format:** 16:9 or 9:16; 30-90 s [I].
- **Cuts and silence:** beat-matched. Markers on the beat, then Automate to Sequence [V].
- **Zoom and speed:** speed ramps with optical-flow smoothing [V]; slow push-ins [I].
- **Captions:** place names as titles [I].
- **Titles and B-roll:** nearly all B-roll [I].
- **Music and SFX:** score dominant, foley layered over it [V].
- **Grade:** LUT applied after converting log footage; re-check exposure and white balance after the LUT [V]. Grain and halation as finishing [V].
- **Hook and end:** strongest shot first [I]; place and date title at the end [I].
- **Avoid:** a LUT applied to unconverted log footage [V].
- **Engine:** `title-fade`, `title-typewriter`. Needs G4, G3, G9, G10, G11, G2.

### 3.16 Documentary interview with lower thirds

Evidence: [S] an institutional brand guide (UAB Medicine) and a media guideline (ON Inc.), both search snippets; [V] Epidemic Sound, Riverside and Soundstripe guides.

- **Format:** 16:9; 5-15 min [I].
- **Cuts and silence:** interview cut with B-roll cover [I]; pauses kept for weight [I].
- **Zoom:** subtle push-ins [I].
- **Captions:** sentence subtitles where the platform needs them [I]. Netflix limits: 42 characters per line, two lines [S].
- **Titles:** interviewee lower third; UAB sets 1-3 s on first appearance, starting on a cut and not carried across shots [S, institutional]. General guides say 3-6 s [V]. Hold the name 3-5 s after speech starts; keep names under three words [V]. Documentary lower thirds take a limited area, not a full news band [V]. Keep text inside the legacy title-safe area of 80% width and height [S-secondary, Autodesk help and SMPTE history].
- **B-roll:** archival and location footage [I].
- **Music and SFX:** bed under speech [V]. A "10-15 dB" level is unattributed [unverified].
- **Grade:** neutral, natural [I].
- **Hook and end:** strongest line as a cold open, then title card [I].
- **Avoid:** full-width news bands [V]; one lower third across several shots [S].
- **Engine:** `lower-third-slide` (exists; duration editable), `title-fade`. Needs G4, G3, G8, G9.

## 4. Rules of thumb: evidence against folklore

**Well supported enough to use as defaults**

- **Caption readability limits.** Netflix English style guide: 42 characters per line, two lines maximum, 20 characters per second for adult programmes and 17 for children's, event length 5/6 s to 7 s [S]. These are distributor rules, not engagement findings.
- **Engagement falls with length (one platform).** Wistia's uploads: average engagement about 52% under one minute; "naturally declines after the five-minute mark"; an 11% drop past 30 minutes [S, platform data, correlational].
- **Shot length has fallen over a century.** About 12 s in 1930 to about 2.5 s today for English-language films, from Salt's dataset of over 15,000 films, presented by Cutting [S]. This is descriptive and says nothing about retention.
- **Redundant on-screen text can compete with narration.** A lab study found that on-screen text summarising a narrated animation lowered retention and transfer [V, Mayer, Heiser and Lonn 2001]. Caption evidence is mixed; a UCL study found some reduced understanding [V]. Keep captions for readability and avoid duplicating titles.

**Plausible but weakly supported: test before defaulting**

- **Cut every 1-3 s, or an interrupt every few seconds.** One AI analyser's description of one creator [V]. Apart from MrBeast's two samples, no cut-rate data by creator.
- **Hook windows of 2-3 s.** Two-second ad recall from TikTok-partner studies, via WARC [V]. The "3-second hold" YouTube uses is asserted without a source [folklore].
- **The first 5-10 seconds decide whether viewers stay.** Two editors' rules of thumb [opinion].
- **Music 10-15 dB under voice.** One unattributed claim [unverified]. Editors quoted in the Descript article say only that speech must stay audible [opinion].
- **Sound-off viewing.** "85% of Facebook video is watched without sound" comes from 2016 publisher-reported numbers, not a Facebook study [V].

**Folklore: leave out of templates**

- "67% swipe away in 3 s", "50-60% of Shorts viewers drop in 3 s", "Shorts average retention 73.6%", "70-80% of a 20-minute video watched" (all vendor, unsourced).
- "Loud SFX and flashing effects raise retention." No data; commentary on one creator.
- "Retention editing" as a proven method. The definition is vendor-written [V] and no comparative study was found.

**Implication for the template.** Expose cut rate, zoom frequency, music level, and silence threshold as user settings. Use the defaults above, and log what the user changes so the defaults can be tuned.

## 5. Sources

### Opened and read

1. Tubefilter, MrBeast cut counts and quotes (AMP page): https://www.tubefilter.com/2024/03/04/mrbeast-editing-style-number-of-cuts-per-video/amp/
2. Choppity, Alex Hormozi style analysis (AI-generated tool output, low confidence): https://www.choppity.com/tools/recreate-video-editing-style/alex-hormozi/
3. Submagic, how to make Hormozi captions: https://www.submagic.co/blog/how-to-make-alex-hormozi-captions
4. Kurzgesagt, "Our video process": https://kurzgesagt.org/youtube/
5. AIR, "What is retention editing" (vendor glossary): https://air.io/en/youtube-glossary/what-is-retention-editing
6. Opus blog, YouTube Shorts hook formulas (vendor guide): https://www.opus.pro/blog/youtube-shorts-hook-formulas
7. Adobe blog, Ali Abdaal editing time (vendor-promoted interview): https://blog.adobe.com/en/publish/2024/09/05/how-ai-helps-ali-abdaal-save-hours-every-week
8. LinkedIn Help, video ad specifications: https://www.linkedin.com/help/linkedin/answer/85306
9. Netflix Partner Help, English (USA) Timed Text Style Guide: https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977
10. Netflix Partner Help, General Requirements: https://partnerhelp.netflixstudios.com/hc/en-us/articles/215758617
11. TV Writer, on Cutting's shot-length talk: https://tvwriter.com/how-film-and-tv-audiences-have-changed-in-the-last-100-years/
12. Aegisub, ASS override tags (karaoke and timing tags): https://aegisub.org/docs/latest/ass_tags/
13. Descript blog, advice from YouTube editors (quoted editors, opinion): https://descript.com/blog/article/advice-for-video-editors-from-youtube-video-editors
14. Wistia, optimal video length (July 2025 article citing 2026 report data): https://wistia.com/blog/optimal-video-length
15. FFmpeg filter documentation: https://ffmpeg.org/ffmpeg-filters.html (fetched, but truncated before the subtitles section, so no facts are taken from it)

Local files read: `/home/user/dax-editor/AGENTS.md`, `docs/engineering/knowledge-protocol.md`, `packages/core/src/presets.ts`, `packages/core/src/schema.ts`, `packages/core/src/render.ts`, `packages/core/src/overlay-filters.ts`, `packages/core/src/transcript.ts`, `docs/research/landscape.md`.

### Seen in search results, not opened

These were used only as leads. Claims from them are tagged [V], [S-secondary] or [unverified] above.

- Fast Company, Sal Khan's 2013 tips: https://www.fastcompany.com/3007137/4-tips-creating-sal-khan-style-instruction-videofrom-sal-khan
- Screen Studio auto-zoom guide: https://screen.studio/guide/auto-zoom
- WARC, TikTok attention-grabbing ads: https://www.warc.com/content/article/event-reports/best-practices-for-creating-attention-grabbing-ads-on-tiktok/en-gb/154096
- PetaPixel, Shorts expand to three minutes (October 2024): https://petapixel.com/2024/10/04/youtube-shorts-expands-video-length-to-three-minutes/
- Autodesk, safe display regions: https://help.autodesk.com/cloudhelp/2017/ENU/Maya/files/GUID-13D613FF-994F-480A-AF0E-DFE06418A351.htm
- Epidemic Sound, lower thirds: https://www.epidemicsound.com/blog/lower-thirds/
- UAB Medicine video brand guide (2021): https://www.uabmedicine.org/wp-content/uploads/sites/3/2023/01/UABMedicine-video-brand-guides-2021.pdf
- Soundstripe, documentary lower thirds: https://soundstripe.com/blogs/a-documentarians-guide-to-lower-thirds
- UCL Discovery, captions in instructional video: https://discovery.ucl.ac.uk/id/eprint/10134849/
- Mobile Marketing Magazine, 85% without sound (2016 publisher figures): https://mobilemarketingmagazine.com/85-per-cent-of-facebook-videos-watched-without-sound/
- Meterplugs, YouTube loudness reference change (-14 LUFS, 2019): https://meterplugs.com/blog/2019/09/18/youtube-changes-loudness-reference-to-14-lufs.html
- Documentary Tube, Johnny Harris vs Vox: https://www.documentarytube.com/blog/johnny-harris-vs-vox-how-their-documentary-styles-differ/
- Creator Handbook, interview with Derek Muller: https://www.creatorhandbook.net/inside-veritasium-an-interview-with-dr-derek-muller-12ad2351a4b3/
- Adobe Premiere Pro, edit to music tutorial: https://www.adobe.com/learn/premiere-pro/web/edit-music-video
- Joyspace, Hormozi editing style in 2026: https://joyspace.ai/hormozi-editing-style-2026-analysis
- Recast, audiogram best practices: https://recast.studio/blog/audiogram-best-practices-for-social-media
- Hacker News, MrBeast editing threads (commentary only): https://news.ycombinator.com/item?id=42699110

Not reachable: Reddit (r/VideoEditing, r/NewTubers). The search filter refused the domain and the fetch was blocked. Community-level claims about jump cuts and music levels are therefore absent from this file.
