---
type: Research
title: Industry video templates
description: Per-industry recipes for what a good video looks like, a template schema that expresses them, and three worked examples for applying them to uploaded footage.
tags: [research, templates, industries, platforms, compliance, presets]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T19:08:00Z
---

# Research: industry video templates

Written 2026-10-18 for the "make this a real-estate listing video" feature. Labels: **(verified)** = read on the official page; **(snippet)** = seen only in a search result, not fetched; **(unverified)** = vendor or blog claim we could not check; **(inference)** = our reasoning, not in any source. Reddit (r/VideoEditing, r/smallbusiness, r/marketing) was not reachable from this environment, so there is no Reddit evidence below. Compliance notes are general information, **not legal advice**.

## Recommendation

1. **A template is data, not code.** It is an ordered list of beats, each with a duration range, a footage hint and an action (keep, trim, speed, add), plus cleanup, overlay, caption, music, gate and export settings. The planner picks the cuts from the user's footage. A template never names file paths or FFmpeg arguments (AGENTS.md: typed, validated parameters only).
2. **One beat list, many formats.** Derive the 16:9, 9:16 and 4:5 outputs from the same beats. When a format is too long, trim beats in ascending `trim_priority` and never go below a beat's minimum. The hook and the CTA have the highest priority, so they survive.
3. **Gates block export.** Consent, disclosure, a current price, a valid licence number and no clinical before-and-after are confirmations the user must give. A generic editor cannot know these, so they are the most valuable part of a template.
4. **Reuse the existing presets.** `packages/core/src/presets.ts` already defines `title-fade`, `title-pop`, `title-typewriter`, `lower-third-slide`, `caption-bottom` and `callout-slide-up`. Four overlays the industries need do not exist: `badge-price`, `end-card`, `label-before-after` and `disclosure-bar`. Add them as presets, not as one-off styles.
5. **Music is a licence question first.** A template asks for a mood tag. The source is either a licensed or CC0 library or user-supplied music with rights confirmed. Platform in-app sound libraries are not reused off-platform (see the TikTok note in Compliance).
6. **Start with 12 templates, not 20.** The 20 industries below are the research base. Ship the ones with the widest demand first (real estate, local services, e-commerce, restaurants, personal brand, fitness, online courses, podcast clips, events, B2B testimonials, nonprofit, recruiting) and add the rest as the schema proves itself.

### Platform reference (what the sources support)

| Surface | Ratio and size | Length guidance |
|---|---|---|
| YouTube Shorts, organic | 9:16, up to 1080p (verified) | Up to 3 minutes (verified); 15 to 60 s typical (snippet) |
| YouTube Shorts ads | 9:16 (verified) | Action ads 10 to 30 s; other campaigns 10 to 60 s (verified) |
| YouTube long form | 16:9 (inference) | Chapters recommended over 10 minutes (snippet, unverified) |
| Meta Feed ads | 4:5, 1440 x 1800 recommended (verified) | 1 s to 241 min technical (verified); captions optional but recommended (verified) |
| LinkedIn video ads | 4:5, 9:16, 16:9, 1:1 (verified); no recommended ratio named (verified) | 3 s to 30 min technical (verified); about 15 to 30 s for broad reach (snippet) |
| TikTok in-feed ads | 9:16, 540 x 960 or larger (snippet) | Policy 5 to 60 s (snippet); travel spec suggests 21 to 34 s (snippet) |
| TikTok creative guidance | 9:16 (verified) | Hook in first 3 s, proposition by 6 s (verified); on-screen text 5 to 10 words per second (verified) |
| Instagram Reels, organic | Between 1.91:1 and 9:16 (snippet) | Over 3 minutes reduces reach to new viewers (snippet, unverified) |

## Template schema (v1 proposal)

Times are seconds (floats). A `[min, max]` range is guidance the planner fits to the footage. `{{name}}` is replaced by an input. An overlay or gate whose `when` input is missing is skipped, not shown blank.

```yaml
template:
  id: real-estate-listing          # kebab-case, unique
  version: 1
  industry: real-estate
  inputs:                          # user-supplied values; {{name}} in overlays and gate prompts
    - {name: price, required: false}
    - {name: agent_name, required: true}
  formats:                         # outputs, all derived from the one beat list
    - {id: yt-16x9, aspect: "16:9", size: [1920, 1080], duration: [60, 150]}
  beats:                           # ordered; the planner fills each from footage
    - id: hero
      duration: [3, 5]
      match: {shot: exterior-wide, min_clips: 1}   # footage hint, never a file path
      edit: {action: trim, max_clip_seconds: 5}    # keep | trim | speed | add
      overlay: {preset: badge-price, text: "{{price}}", when: price}  # preset id, or a proposed one
      captions: none                                # none | voice | all
      silence: keep                                 # keep | cut
      trim_priority: 9              # lowest number is trimmed first when too long; never below min
  cleanup:
    silence: {threshold_db: -35, min_seconds: 0.6, keep_pad_seconds: 0.12, scope: voice}
    filler: {remove: [um, uh, "you know"], min_confidence: 0.85}
    stabilize: auto                 # auto | off
  captions: {style: caption-bottom, source: transcript, max_text_wps: 10}  # TikTok range 5 to 10
  music: {mood: [warm, steady], source: user-licensed, level_db: -18,
          duck: {under_voice_db: -12, attack_ms: 150, release_ms: 400}}
  gates:                            # blocking: export waits for the user to confirm
    - {id: price-current, ask: "Is the price shown still current?", blocks_export: true}
  export:
    - {format: yt-16x9, loudness_lufs: -14, encoder: "render.ts encoder selection"}  # -14 is (inference)
```

### Example A: real-estate listing (fully written)

```yaml
template:
  id: real-estate-listing
  version: 1
  industry: real-estate
  inputs:
    - {name: price, required: false}
    - {name: agent_name, required: true}
    - {name: agent_title, required: false}
    - {name: city, required: true}
    - {name: cta_url, required: true}
  formats:
    - {id: yt-16x9, aspect: "16:9", size: [1920, 1080], duration: [60, 150]}
    - {id: reel-9x16, aspect: "9:16", size: [1080, 1920], duration: [20, 45]}
    - {id: feed-4x5, aspect: "4:5", size: [1080, 1350], duration: [15, 30]}
  beats:
    - {id: hero, duration: [3, 5], match: {shot: exterior-wide, min_clips: 1}, edit: {action: trim, max_clip_seconds: 5}, overlay: {preset: badge-price, text: "{{price}}", when: price}, captions: none, silence: keep, trim_priority: 9}
    - {id: entry, duration: [3, 6], match: {shot: entry-hall, min_clips: 1}, edit: {action: keep}, overlay: {preset: lower-third-slide, text: "{{agent_name}}", subtitle: "{{agent_title}}", when: agent_name}, captions: voice, silence: keep, trim_priority: 5}
    - {id: living, duration: [8, 14], match: {shot: living-room, min_clips: 1}, edit: {action: trim, max_clip_seconds: 8}, overlay: {preset: title-fade, text: "{{city}}"}, captions: voice, silence: keep, trim_priority: 6}
    - {id: kitchen, duration: [6, 10], match: {shot: kitchen, min_clips: 1}, edit: {action: trim, max_clip_seconds: 6}, overlay: null, captions: none, silence: keep, trim_priority: 4}
    - {id: bedroom, duration: [5, 8], match: {shot: bedroom, min_clips: 1}, edit: {action: trim, max_clip_seconds: 5}, overlay: null, captions: none, silence: keep, trim_priority: 3}
    - {id: detail, duration: [3, 6], match: {shot: standout-detail, min_clips: 0}, edit: {action: add, max_clip_seconds: 4}, overlay: {preset: callout-slide-up, text: "Standout feature"}, captions: none, silence: keep, trim_priority: 2}
    - {id: end-card, duration: [5, 6], match: {shot: none, min_clips: 0}, edit: {action: add}, overlay: {preset: end-card, lines: ["{{agent_name}}", "{{cta_url}}"]}, captions: none, silence: keep, trim_priority: 10}
  cleanup:
    silence: {threshold_db: -40, min_seconds: 1.0, keep_pad_seconds: 0.2, scope: voice}
    filler: {remove: [], min_confidence: 0.9}
    stabilize: auto
  captions: {style: caption-bottom, source: transcript, max_text_wps: 8}
  music: {mood: [warm, steady, no-vocals], source: user-licensed, level_db: -18, duck: {under_voice_db: -12, attack_ms: 150, release_ms: 400}}
  gates:
    - {id: price-current, ask: "Is the price shown still current?", blocks_export: true}
    - {id: staging, ask: "Is any room virtually staged or AI-altered? If yes, add a disclosure.", blocks_export: true}
    - {id: people, ask: "Has every identifiable occupant or neighbour consented, or been blurred?", blocks_export: true}
  export:
    - {format: yt-16x9, loudness_lufs: -14, encoder: "render.ts encoder selection"}
    - {format: reel-9x16, loudness_lufs: -14, encoder: "render.ts encoder selection"}
```

### Example B: local service before-and-after (fully written)

```yaml
template:
  id: local-service-before-after
  version: 1
  industry: local-services
  inputs:
    - {name: business_name, required: true}
    - {name: phone, required: true}
    - {name: service_area, required: true}
    - {name: licence_no, required: false}
    - {name: testimonial_clip, required: false}
  formats:
    - {id: reel-9x16, aspect: "9:16", size: [1080, 1920], duration: [15, 45]}
    - {id: site-16x9, aspect: "16:9", size: [1920, 1080], duration: [30, 60]}
  beats:
    - {id: problem, duration: [3, 5], match: {shot: problem-on-camera, min_clips: 1}, edit: {action: trim, max_clip_seconds: 5}, overlay: {preset: lower-third-slide, text: "{{business_name}}", subtitle: "{{service_area}}"}, captions: voice, silence: keep, trim_priority: 7}
    - {id: before, duration: [3, 6], match: {shot: before-same-angle, min_clips: 1}, edit: {action: keep}, overlay: {preset: label-before-after, text: "BEFORE"}, captions: none, silence: keep, trim_priority: 5}
    - {id: work, duration: [10, 20], match: {shot: repair-work, min_clips: 1}, edit: {action: speed, speed: [1.0, 2.0]}, overlay: null, captions: voice, silence: keep, trim_priority: 3}
    - {id: after, duration: [3, 6], match: {shot: after-same-angle, min_clips: 1}, edit: {action: keep}, overlay: {preset: label-before-after, text: "AFTER"}, captions: none, silence: keep, trim_priority: 8}
    - {id: testimonial, duration: [5, 10], match: {shot: customer-quote, min_clips: 0}, edit: {action: trim, max_clip_seconds: 10}, overlay: null, captions: all, silence: cut, trim_priority: 2}
    - {id: cta, duration: [4, 5], match: {shot: none, min_clips: 0}, edit: {action: add}, overlay: {preset: end-card, lines: ["{{phone}}", "{{licence_no}}"]}, captions: none, silence: keep, trim_priority: 10}
  cleanup:
    silence: {threshold_db: -38, min_seconds: 0.5, keep_pad_seconds: 0.1, scope: voice}
    filler: {remove: [um, uh], min_confidence: 0.85}
    stabilize: auto
  captions: {style: caption-bottom, source: transcript, max_text_wps: 8}
  music: {mood: [none], source: user-licensed, level_db: -30, duck: {under_voice_db: -12, attack_ms: 100, release_ms: 300}}
  gates:
    - {id: licence, ask: "Is the licence number correct and required in this state or trade?", blocks_export: true}
    - {id: same-spot, ask: "Are before and after the same spot and angle, with only crop or light changed?", blocks_export: true}
    - {id: release, ask: "Do you have a release from every customer or person visible?", blocks_export: true}
  export:
    - {format: reel-9x16, loudness_lufs: -14, encoder: "render.ts encoder selection"}
    - {format: site-16x9, loudness_lufs: -14, encoder: "render.ts encoder selection"}
```

### Example C: B2B testimonial (fully written)

```yaml
template:
  id: b2b-testimonial
  version: 1
  industry: b2b-testimonial
  inputs:
    - {name: customer_name, required: true}
    - {name: customer_title, required: true}
    - {name: company, required: true}
    - {name: metric, required: false}
    - {name: metric_source, required: false}
    - {name: material_connection, required: false}
  formats:
    - {id: yt-16x9, aspect: "16:9", size: [1920, 1080], duration: [90, 150]}
    - {id: li-1x1, aspect: "1:1", size: [1080, 1080], duration: [30, 60]}
    - {id: short-9x16, aspect: "9:16", size: [1080, 1920], duration: [15, 30]}
  beats:
    - {id: outcome, duration: [3, 5], match: {shot: customer-talking, min_clips: 1}, edit: {action: trim, max_clip_seconds: 5}, overlay: {preset: lower-third-slide, text: "{{customer_name}}", subtitle: "{{customer_title}}, {{company}}"}, captions: all, silence: keep, trim_priority: 8}
    - {id: challenge, duration: [10, 20], match: {shot: customer-talking, min_clips: 1}, edit: {action: trim, max_clip_seconds: 20}, overlay: null, captions: all, silence: cut, trim_priority: 5}
    - {id: use, duration: [20, 40], match: {shot: product-in-use, min_clips: 1}, edit: {action: keep}, overlay: null, captions: all, silence: cut, trim_priority: 4}
    - {id: result, duration: [10, 20], match: {shot: customer-talking, min_clips: 1}, edit: {action: trim, max_clip_seconds: 20}, overlay: {preset: callout-slide-up, text: "{{metric}}", when: metric}, captions: all, silence: cut, trim_priority: 6}
    - {id: quote, duration: [3, 5], match: {shot: customer-talking, min_clips: 1}, edit: {action: trim, max_clip_seconds: 5}, overlay: null, captions: all, silence: keep, trim_priority: 7}
    - {id: cta, duration: [4, 5], match: {shot: none, min_clips: 0}, edit: {action: add}, overlay: {preset: end-card, lines: ["{{metric_source}}"]}, captions: none, silence: keep, trim_priority: 10}
  cleanup:
    silence: {threshold_db: -35, min_seconds: 0.5, keep_pad_seconds: 0.15, scope: voice}
    filler: {remove: [um, uh, "you know"], min_confidence: 0.85}
    stabilize: auto
  captions: {style: caption-bottom, source: transcript, max_text_wps: 8}
  music: {mood: [calm, confident], source: user-licensed, level_db: -22, duck: {under_voice_db: -14, attack_ms: 200, release_ms: 500}}
  gates:
    - {id: approval, ask: "Did the customer approve the final cut and use of their name and logo in writing?", blocks_export: true}
    - {id: disclosure, ask: "Is there a material connection (payment, free product, partner, employee)? If yes, the disclosure bar is added.", blocks_export: true}
    - {id: metric, ask: "Is the metric accurate, dated and sourced? If it is shown, is the 'results vary' line present?", blocks_export: true}
  export:
    - {format: yt-16x9, loudness_lufs: -14, encoder: "render.ts encoder selection"}
    - {format: li-1x1, loudness_lufs: -14, encoder: "render.ts encoder selection"}
    - {format: short-9x16, loudness_lufs: -14, encoder: "render.ts encoder selection"}
```

## Per-industry recipes

Each recipe gives the goal, platform lengths, ordered beats with target durations, required on-screen elements, captions, silence policy, music, common mistakes and compliance notes. Length guidance is marked by its label above.

### 1. Online education and courses
- **Goal:** Teach one outcome per video and keep viewers to the end of the lesson.
- **Platforms:** YouTube 16:9 lessons of 6 to 12 min (inference); Shorts 9:16 teasers of 30 to 60 s. Wistia reports that 1 to 5 minute tutorials are watched past 50% on average (verified).
- **Beats:** Outcome hook 0-5 s, context 5-20 s, one concept per block of 60-150 s, recap 10-15 s, next-lesson CTA 5 s.
- **On-screen:** Name lower-third once, chapter title cards, `callout-slide-up` on code or UI.
- **Captions:** Required for accessibility and muted play.
- **Silence:** Cut gaps over 0.6 s, but keep 1 to 2 s after an on-screen instruction.
- **Music:** None under speech; an optional bed at -24 dB on the intro only.
- **Mistakes:** Intro over 15 s; a 40-minute single capture; screen text too small to read on a phone.
- **Compliance:** Income or results claims need substantiation (inference). Student faces need a release. Synthetic presenters need disclosure where the platform requires it.

### 2. Software / SaaS demo and tutorial
- **Goal:** Show one workflow that ends in a visible result, then drive a trial.
- **Platforms:** LinkedIn 1:1 or 4:5 at 30 to 60 s (snippet); YouTube 16:9 demo at 2 to 3 min (snippet); Shorts or Reels 9:16 feature clip at 15 to 30 s.
- **Beats:** Outcome hook 0-3 s, problem 3-10 s, one workflow 15-60 s with zoomed UI and a cursor highlight, proof 5-10 s, CTA 5 s.
- **On-screen:** Zoom callouts on UI, end card with URL (`end-card`).
- **Captions:** Required. On-screen text at 5 to 10 words per second at most (verified).
- **Silence:** Trim load times; keep at least 0.5 s on each UI transition so the eye can follow.
- **Music:** Light, under -20 dB, ducked under speech.
- **Mistakes:** Four features in one video; reading the UI aloud; a blurry screen recording below 1080p.
- **Compliance:** "Faster" or benchmark claims need a source on screen or in the description (inference). Customer logos and quotes need written permission. Other users' data and emails must be hidden.

### 3. Real estate listing and tour
- **Goal:** Make the viewer book a showing or message the agent.
- **Platforms:** Website and YouTube 16:9 at 60 to 150 s; Reels and TikTok 9:16 at 20 to 45 s; Feed 4:5 at 15 to 30 s. Sources disagree on listing length: 30 to 90 s (snippet, unverified) and 2 to 3 min for high-end homes (snippet, unverified).
- **Beats:** Hero with price 0-5 s, entry 3-6 s, living room 8-14 s, kitchen 6-10 s, bedroom 5-8 s, standout detail 3-6 s, outdoor 5-8 s, end card with agent and URL 5-6 s.
- **On-screen:** Price badge once, city in the hook, agent lower-third, end card. A Shotstack real-estate reel (fetched) uses a price plus period line and a contact end card, which matches this pattern.
- **Captions:** Required when there is narration; optional for music-led tours.
- **Silence:** No silence to cut in a music-led tour; hold 4 s or more on the exterior and the standout detail.
- **Music:** Warm and steady, no vocals, ducked under narration.
- **Mistakes:** Handheld shake (sources say to use a tripod); clutter or people in frame; a stale price; a social cut longer than 150 s.
- **Compliance:** Meta's Housing special ad category covers ads for sale or rental of residential property and restricts targeting (snippet; exact video rules unverified). Fair-housing wording must not express a preference (inference, US Fair Housing Act). Virtual staging or AI-altered rooms should be disclosed (inference; see YouTube's altered-content rule in Sources). Identifiable people need consent or blurring. Check MLS and broker photo rules locally (inference).

### 4. Fitness and coaching
- **Goal:** A follow or a trial booking, by showing a method rather than a workout.
- **Platforms:** Reels, TikTok and Shorts at 9:16, 15 to 45 s (snippet, vendor-heavy); Feed 4:5 at 30 to 60 s (snippet).
- **Beats:** Movement or contrast hook 0-3 s, one drill 10-25 s in slow motion or repeated, cue text 3-5 s, form tip 5-10 s, "book a trial" CTA 3-5 s.
- **On-screen:** Exercise name (`title-fade`, short), rep or timer callout, CTA lower-third.
- **Captions:** Required. Word-level captions help exercise cues land muted (snippet).
- **Silence:** Cut setup and warm-up; keep counting audio.
- **Music:** Energetic for HIIT (-16 dB), calm for mobility; ducked under cues.
- **Mistakes:** Long intro; full sets; dramatic body-change before-and-after; horizontal footage with black bars (snippet).
- **Compliance:** Meta's personal health and appearance policy restricts ads that imply knowledge of a viewer's weight or health, and lists weight-loss before-and-after images as non-compliant (snippet; the official page could not be fetched). Avoid "guaranteed" and show "results vary" with any result (inference, FTC typical-results principle). Medical claims need professional review.

### 5. Restaurant, food and recipe
- **Goal:** Visits, orders and follows; sell the dish.
- **Platforms:** Reels and TikTok 9:16 at 15 to 30 s for process; Shorts 9:16 up to 60 s (snippet).
- **Beats:** Money shot 0-2 s (pour, sizzle, pull-apart), process 3-15 s in at most three steps with close-ups, finished plate 3-5 s, location and hours or booking line 3-4 s.
- **On-screen:** Restaurant name and location, `badge-price` only for a dated offer, CTA.
- **Captions:** Recommended; short step text on screen.
- **Silence:** Keep natural sound (sizzle, pour); cut dead air only.
- **Music:** Trending or sound design, licensed (see the TikTok note).
- **Mistakes:** Logo intro; dim dish shots; text over the food; no location.
- **Compliance:** Allergen and "healthy" claims need substantiation (inference). Adapting another creator's recipe needs credit (inference). Alcohol promotions need age-appropriate targeting (inference).

### 6. E-commerce product ad
- **Goal:** Purchase or add to cart.
- **Platforms:** TikTok 9:16 at 15 to 34 s (snippet; travel spec suggests 21 to 34 s); Meta 4:5 or 9:16 at 15 to 30 s (inference); YouTube Shorts ads 10 to 30 s for action campaigns (verified).
- **Beats:** Hook 0-3 s with the product in the first frame, problem 3-6 s, demo 6-18 s, proof 3-5 s (review or real use), offer and CTA 3-5 s.
- **On-screen:** `badge-price` for the offer, product name at first use, end card with URL.
- **Captions:** Required; on-screen text at 5 to 10 words per second at most (verified).
- **Silence:** One cut every 1 to 2 s in the demo; no silence over 0.3 s on voice.
- **Music:** Upbeat, licensed.
- **Mistakes:** Logo intro (sources say avoid it); product not visible in the first frame; no price; testing three hooks at once.
- **Compliance:** The FTC rule banning fake reviews took effect 2024-10-21 (snippet). Reviewers must be real. Paid creators must disclose in the video, not only in the caption (verified). "Limited time" must be true.

### 7. Local services (plumber, salon, HVAC)
- **Goal:** Calls and bookings inside the service area.
- **Platforms:** Reels, TikTok and Shorts 9:16 at 15 to 60 s; before-and-after under 90 s (snippet, vendor); website 16:9 at 30 to 60 s.
- **Beats:** Problem on camera 0-5 s, before 3-6 s, work 10-20 s (time-lapse allowed), after 3-6 s, customer quote 5-10 s (optional), CTA with phone 4-5 s.
- **On-screen:** Business name and service area, `label-before-after`, end card with phone and licence number where required.
- **Captions:** Recommended; repeat the phone number as text.
- **Silence:** Keep work sounds; speed-ramp time-lapse; cut repetition.
- **Music:** None or light; work sounds carry it.
- **Mistakes:** Ring light; dark cellar shots; no contact method; before-and-after not clearly labelled (snippet).
- **Compliance:** Licence claims must be the real licence, and state rules vary (inference). Customers on camera need a release. Neighbouring properties should be blurred or consented (inference). Review claims follow the FTC rule above.

### 8. Healthcare clinics
- **Goal:** Appointments and trust. The lowest-risk content is staff introductions and office tours.
- **Platforms:** Website 16:9 at 60 to 90 s; Reels 9:16 at 15 to 30 s; YouTube and Google 60 to 120 s (snippet, unverified).
- **Beats:** Provider introduction with credential 0-5 s, what the clinic treats 5-15 s, what a visit looks like with no patients 15-30 s, how to book 5 s, end card 5 s.
- **On-screen:** Provider lower-third with credential, `disclosure-bar` ("general information, not medical advice"), end card with booking route.
- **Captions:** Required.
- **Silence:** Calm pacing; silence up to 1 s is fine.
- **Music:** Calm, low (-22 dB); no urgency music.
- **Mistakes:** Patients on camera without written authorization; clinical before-and-after; "painless" or "guaranteed"; urgency framing for treatments.
- **Compliance:** Using protected health information in marketing needs written authorization under 45 CFR 164.508(a)(3) (snippet); a general media release is not enough (snippet). State medical and dental boards vary, and some states restrict before-and-after and testimonials (snippet). Meta rejects some clinical before-and-after images (snippet). A fake or AI "patient" testimonial falls under the FTC rule (inference). Not legal advice.

### 9. Finance and investing explainers
- **Goal:** Trust and education; lead to a regulated product or newsletter.
- **Platforms:** YouTube 16:9 at 5 to 12 min with chapters (inference); Shorts 9:16 at 30 to 60 s; LinkedIn 1:1 or 4:5 at 30 to 60 s (inference).
- **Beats:** Question hook 0-5 s, definition 5-20 s, worked example with labelled illustrative numbers 20-60 s, risks and limits 10-20 s, disclaimer 5 s, CTA 5 s.
- **On-screen:** `disclosure-bar` on the whole clip, source lines, an "illustrative, not a forecast" tag on any number.
- **Captions:** Required; spell out financial terms.
- **Silence:** Slower than other industries; hold 1 s on each key rule; no music under numbers.
- **Music:** Neutral; avoid "winning" or "rocket" sound design.
- **Mistakes:** Projected returns; "guaranteed"; cherry-picked charts; influencer posts that the firm never reviewed.
- **Compliance:** FINRA Rule 2210 generally prohibits projected performance in communications, and a 2026 proposal (SR-FINRA-2026-004) would add a path for it; its status is unclear (snippet). Social posts count as retail communications when a firm paid for them or approved them (snippet). FINRA fined one broker $850,000 in 2024 for supervising finfluencers (snippet). Adviser marketing rules differ by jurisdiction (inference). Not legal advice.

### 10. Personal brand and creator
- **Goal:** Follows, watch time and inbound for the creator's offer.
- **Platforms:** Shorts, Reels and TikTok 9:16 at 20 to 45 s; YouTube 16:9 at 8 to 15 min with chapters (snippet); LinkedIn 1:1 or 4:5 at 30 to 60 s (inference).
- **Beats:** Hook 0-2 s (contrarian line or visual interrupt, not an intro breath), setup 2-8 s, one point 10-25 s, one example 5-10 s, CTA 3-5 s.
- **On-screen:** Name lower-third at first appearance; `caption-bottom` for keywords; "part 2" callout.
- **Captions:** Required; most viewers scroll muted (snippet).
- **Silence:** Jump-cut gaps over 0.4 s; add a visual change every 5 to 8 s (inference).
- **Music:** Trending or royalty-free, with voice on top.
- **Mistakes:** An intro breath before the point; a talking head with no visual change; several CTAs.
- **Compliance:** Sponsorship disclosure in the video (verified). Platform paid-partnership labels are separate and required (inference). AI avatars need the disclosure the platform requires (snippet).

### 11. Podcast clips
- **Goal:** Listens and follows; the clip is an advert for the episode.
- **Platforms:** Reels, TikTok and Shorts 9:16 at 30 to 60 s (snippet); 1:1 feed; Shorts up to 3 min (verified); full episode 16:9 with chapters.
- **Beats:** Strongest line verbatim 0-3 s, context card 3-8 s, exchange 15-40 s, punch line 3-5 s, episode card with title and host 4 s.
- **On-screen:** Speaker lower-third at each speaker change, active-speaker crop, word-level captions, episode title card.
- **Captions:** Required (snippet: 85 percent watched muted, unverified).
- **Silence:** Remove crosstalk and fillers; keep natural laughter; cut gaps over 0.5 s and keep 0.2 s padding.
- **Music:** None under speech; a bed only on the title card.
- **Mistakes:** A clip with no context; cutting mid-sentence; a static crop on a moving guest; unlicensed clips of other media.
- **Compliance:** Speaker consent for clip use (check the contract). Quotes must be accurate and not misleading (inference). Clips of other programmes or music need rights (inference).

### 12. News and commentary
- **Goal:** Credibility and daily return; explain an event fast.
- **Platforms:** Shorts and Reels 9:16 at 45 to 90 s (inference); YouTube 16:9 at 6 to 12 min with chapters (inference); 1:1 feed.
- **Beats:** Claim or question 0-5 s, what happened with dates 10-20 s, analysis 20-60 s, counter-view 10-15 s, sources card 5 s, CTA 3 s.
- **On-screen:** Date and source lower-third, attributed quote cards, a "commentary" label.
- **Captions:** Required; quotes verbatim.
- **Silence:** Fast on facts; hold 3 s or more on quotes and charts.
- **Music:** Minimal; no sting that implies a verdict (inference).
- **Mistakes:** Clips out of context; undated footage presented as current; unsourced numbers.
- **Compliance:** Defamation and privacy exposure for named people (inference). Fair use of news clips depends on jurisdiction (inference). Label realistic AI-generated visuals (see YouTube altered-content rule).

### 13. Gaming highlights
- **Goal:** Clips that get replayed; channel growth; traffic to full VODs.
- **Platforms:** Shorts and TikTok 9:16 at 15 to 35 s, up to 60 s when needed (snippet); Shorts up to 3 min (verified); 16:9 compilations at 3 to 8 min (inference).
- **Beats:** Action hook 0-2 s (start on the action, not the setup), setup 2-5 s in one line, payoff 5-15 s, reaction 2-4 s, loop or next-clip CTA 2 s.
- **On-screen:** Game title and moment tag (`title-pop`, short), chapter markers on compilations, subscribe end card.
- **Captions:** Required for talking commentary; optional for music-led clips.
- **Silence:** Cut dead time between kills; keep the game's sound design; silence is allowed on the payoff.
- **Music:** Game audio first; any added music must be licensed.
- **Mistakes:** Letterboxing left in; setup before action; a 16:9 crop that cuts the HUD.
- **Compliance:** Publisher fan-content policies vary (inference). Copyrighted music in streams can trigger takedowns (inference). Minors' voices on voice chat need consent (inference).

### 14. Events and weddings
- **Goal:** Bookings and shares; a keepsake for clients.
- **Platforms:** 16:9 highlight film at 3 to 5 min (snippet; vendors cite 3 to 8 min); 30 to 60 s teaser (snippet); Reels 9:16 at 15 to 30 s (inference).
- **Beats:** Opening image 0-5 s, names and date title 5 s, three to five key moments of 15-20 s each on music swells, emotional beat 15-30 s (vows or speeches), vendor credit 5 s.
- **On-screen:** Names and date (`title-fade`), vendor credit at the end, no prices.
- **Captions:** Required for speeches (inference); optional for music-led moments.
- **Silence:** Cut on the beat for music-led sections; duck fully under vows and speeches.
- **Music:** Romantic or celebratory per couple; licensed or client-supplied; ducked -12 dB under speech.
- **Mistakes:** Unlicensed music in paid work; cutting a vow mid-sentence; a 10-minute highlight used as a social cut.
- **Compliance:** Consent from couples and guests for social use (inference); minors; venue filming rules (inference); licensed music for paid vendors (inference).

### 15. Non-profit and fundraising
- **Goal:** Donations, volunteers and sign-ups.
- **Platforms:** 16:9 appeal at 60 to 90 s (snippet); donor or beneficiary story at 2 to 3 min (snippet); Shorts and Reels 9:16 at 15 to 45 s; 1:1 feed.
- **Beats:** Person-first hook 0-5 s, problem 5-15 s, the people affected 15-30 s, what the organisation does 10-15 s, the ask with gift impact 5-10 s, URL end card 5 s.
- **On-screen:** Person's name and relation lower-third, `callout-slide-up` for "what $X does", donate URL end card.
- **Captions:** Required (inference: donors often watch muted).
- **Silence:** Give emotional moments 2 to 4 s with no music under them; no fast cuts on testimony.
- **Music:** Warm and sparse; never a crisis sting.
- **Mistakes:** Pity framing; beneficiaries shown without consent; the ask after 60 s.
- **Compliance:** Written release from beneficiaries, especially minors and people in medical or refugee situations (inference). Charitable solicitation registration and disclosure rules vary by state and country (inference). Impact claims need reporting behind them (inference).

### 16. Recruiting and employer brand
- **Goal:** Qualified applications and a candidate pipeline.
- **Platforms:** LinkedIn 16:9, 1:1 or 9:16 at 30 to 90 s (snippet); careers page at 90 to 150 s (snippet, vendor); Reels and Shorts 9:16 day-in-the-life at 15 to 30 s (inference).
- **Beats:** Role or team hook 0-4 s, day in the life 15-30 s, the work and the team 15-30 s, what to expect (growth, flexibility) 10 s, apply CTA 4 s.
- **On-screen:** Employee name and role lower-third, apply-link end card, location and remote-policy text.
- **Captions:** Required; one source says 80 to 90 percent of LinkedIn video is watched muted (snippet, unverified).
- **Silence:** Natural; avoid scrambled multi-cut edits.
- **Music:** Light and optimistic, or none.
- **Mistakes:** A scripted monologue; no role or pay information; an overproduced advert feel.
- **Compliance:** Equal-opportunity wording in job ads (inference). Pay-transparency disclosure in job ads is required in some places (inference; check). Employees need consent to appear and to later reuse.

### 17. Internal communications and training
- **Goal:** Understanding and completion of a procedure or announcement.
- **Platforms:** 16:9 in the learning system at 2 to 5 min for one objective (snippet, ATD-linked); 9:16 field clips at 30 to 60 s (inference).
- **Beats:** Objective 0-5 s, why it matters 10-20 s, steps 1 to 3 with screen or demo 30-90 s each, check question 10 s, resources 5 s.
- **On-screen:** Step-number callouts (`callout-slide-up`), section title cards, policy version and date in a corner.
- **Captions:** Required for compliance training (inference).
- **Silence:** One objective per video; keep sections separable so one can be re-recorded (snippet).
- **Music:** None for policy; a light bed on intros only.
- **Mistakes:** A 20-minute all-in-one; an undated policy; customer data visible on a screen.
- **Compliance:** Employee likeness and recording consent (inference; works councils in some EU countries). Do not show client data. Training records may have retention rules (inference).

### 18. Travel and tourism
- **Goal:** Bookings, saves and visits.
- **Platforms:** Reels, TikTok and Shorts 9:16 at 15 to 30 s; 16:9 destination film at 60 to 120 s (inference); 4:5 feed at 15 to 30 s (inference).
- **Beats:** Specific visual 0-2 s (a named place, not a generic sweep), what to do 3-8 s, three highlights 5-8 s each, practical tip (cost, time, access) 5-8 s, save or book CTA with location tag 3 s.
- **On-screen:** Place name (`title-fade`), a price or time-tip callout, location tag.
- **Captions:** Required; text overlays can replace narration (snippet).
- **Silence:** 2 to 3 s per shot; drone shots of 3 to 4 s at most in a reel (inference).
- **Music:** Local or licensed; upbeat for activity, calm for landscapes.
- **Mistakes:** A generic drone opener with no information; a horizontal drone shot cropped badly (snippet); stale prices.
- **Compliance:** Drone flights need local permission and licences (inference; for example FAA rules in the US). Filming on private property needs permission. People in frame need consent. "Best" or "cheapest" claims need support (inference).

### 19. Automotive
- **Goal:** Test drives, lead forms and showroom visits.
- **Platforms:** Reels and TikTok 9:16 at 15 to 30 s (inference); 16:9 walkaround at 2 to 5 min (snippet); feed 1:1 or 4:5 at 15 to 30 s (inference).
- **Beats:** Hook with engine sound or a feature 0-3 s, exterior 3-8 s, interior and tech 8-15 s, engine sound 5 s, price or offer 4 s with fine print, CTA with location 3 s.
- **On-screen:** Model, year and trim lower-third; `badge-price` with dated fine print; stock number text; `disclosure-bar`.
- **Captions:** Required; spec text on screen.
- **Silence:** Slow walkaround; let the engine play with no music under it.
- **Music:** None under the engine; otherwise energetic.
- **Mistakes:** A price without fees; the wrong trim; a dirty car; landscape-only footage for social.
- **Compliance:** Advertised price, fees and finance or lease terms must be disclosed in the ad (inference; rules differ by country and state). Manufacturer logos and trademarks follow the dealership agreement (inference). "Certified" claims need the programme's real requirements (inference).

### 20. B2B testimonials and case studies
- **Goal:** Pipeline and buyer trust.
- **Platforms:** LinkedIn 16:9 or 1:1 at 30 to 60 s (snippet); YouTube 16:9 case study at 2 to 4 min (inference); 9:16 cut-downs at 15 to 30 s (inference).
- **Beats:** Outcome in the customer's words 0-5 s, challenge 10-20 s, what they did with the product 20-40 s, result with a number 10-20 s, recommendation quote 3-5 s, CTA 4 s.
- **On-screen:** Customer name, title and company; `callout-slide-up` for the metric; `disclosure-bar` when a material connection exists; "results vary" line when a number is shown.
- **Captions:** Required; LinkedIn advises subtitles (snippet).
- **Silence:** Slow and natural; cut between breaths.
- **Music:** Low bed, ducked under speech.
- **Mistakes:** Unverifiable numbers; a customer who has not approved the cut; a hard sell inside a testimonial.
- **Compliance:** Under 16 CFR Part 255, material connections must be disclosed in the video, and testimonials must reflect real experience (verified via FTC guidance; the rule text is snippet). Written approval for name and logo use (inference). The 2024 rule bans fake or AI-generated testimonials (snippet).

## Sources

**Fetched and read (verified claims):**
- https://support.google.com/youtube/answer/10059070 (YouTube Help: Shorts up to 3 minutes; 1080p maximum)
- https://support.google.com/google-ads/answer/16041697?hl=en (Google Ads Help: Shorts ads length and vertical guidance)
- https://business.linkedin.com/advertise/ads/sponsored-content/video-ads/specs (LinkedIn: video ad specs)
- https://www.facebook.com/business/ads-guide/update/video (Meta Ads Guide: Facebook Feed video specs)
- https://ads.tiktok.com/help/article/creative-best-practices?lang=en (TikTok Ads Help: creative best practices)
- https://wistia.com/blog/optimal-video-length (Wistia, July 2025, citing its 2026 State of Video data)
- https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers (FTC: Disclosures 101 for influencers)
- https://support.google.com/youtube/answer/15447836?hl=en (YouTube Help: AI disclosure; only partial text retrieved)
- https://shotstack.io/studio/templates/stylish-real-estate-reel-template/ (Shotstack commercial template; read as a structure reference only)
- https://github.com/mifi/editly (Editly, MIT licence: declarative clips, layers and transitions spec; reference only, no code copied)
- https://github.com/vercel-labs/json-render (Apache-2.0; checked, not used. Its Remotion renderer is excluded by AGENTS.md)

**Search results only (snippets, not fetched; treat as unverified):**
- Platform: https://ads.tiktok.com/help/article/tiktok-auction-in-feed-ads?redirected=2 ; https://ads.tiktok.com/resources/help/article/tiktok-reservation-topview ; https://ads.tiktok.com/help/article/list-of-creative-specifications-for-travel-ads ; https://help.instagram.com/1038071743007909/?helpref=uf_share ; https://business.linkedin.com/content/dam/me/business/en-us/marketing-solutions/resources/pdfs/video-ads-tip-linkedin.pdf ; https://www.facebook.com/business/help/103816146375741?locale=en_GB
- Compliance: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-B/part-255 ; https://www.federalregister.gov/documents/2023/07/26/2023-14795/guides-concerning-the-use-of-endorsements-and-testimonials-in-advertising ; https://wsgr.com/en/insights/ftc-issues-final-rule-banning-fake-and-misleading-consumer-reviews-and-testimonials.html ; https://transparency.meta.com/en-gb/policies/ad-standards/restricted-goods-services/health-wellness ; https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/special-ad-category ; https://www.tiktok.com/legal/page/global/commercial-music-library-user-terms/en ; https://licenseorg.com/guide/music-audio/youtube-audio-library ; https://www.accountablehq.com/post/hipaa-training-checklist-for-clinic-marketing-staff-before-posting-patient-testimonial-videos ; https://ada.org/resources/practice/practice-management/36_socialmedia_video ; https://investmentnews.com/regulation-and-legislation/finra-fines-m1-finance-in-landmark-social-media-enforcement/250948 ; https://www.willkie.com/publications/2026/02/finra-proposes-greater-flexibility-to-show-target-and-projected-performance-in-communications
- Industry practice (vendor-heavy): https://async.com/blog/how-to-make-a-real-estate-video/ ; https://www.housingwire.com/articles/13-video-marketing-best-practices-for-your-real-estate-business/ ; https://www.td.org/content/atd-blog/right-sizing-e-learning-videos-for-optimal-engagement ; https://www.owner.com/blog/social-media-for-restaurants ; https://ecommercefastlane.com/ugc-hooks-for-ecommerce/ ; https://saashero.net/content/video-marketing-for-field-service/ ; https://vidpros.com/wedding-video-editing-packages-highlights-vs-full-length/ ; https://audienceplayer.com/how-to-make-your-workout-videos-go-viral-on-tiktok-or-reels ; https://zubtitle.com/blog/mastering-the-hook-in-the-era-of-half-second-attention-spans ; https://recast.studio/blog/audiogram-best-practices-for-social-media ; https://blog.eklipse.gg/beginner-guide-2/youtube/optimal-youtube-shorts-length-to-boost-views-and-engagement.html ; https://www.yansmedia.com/blog/nonprofit-video-length ; https://content.jobteaser.com/view/889449198/12/ ; https://customerthink.com/?p=48750 ; https://recruitingdaily.com/?p=47678 ; https://profiletree.com/how-to-produce-and-edit-video-for-tourism-businesses/ ; https://digitaldealer.com/news/30-seconds-2-minutes-makes-difference/76654/ ; https://zenabm.com/blog/linkedin-video-ads-best-practices

**Gaps.** Reddit was blocked (WebFetch refused; the search tool rejects reddit.com). Two FTC pages and the Meta health policy page returned 404 or were not readable, so the FTC endorsement rules rest on search snippets and the fetched Disclosures 101 page. Instagram and TikTok official help pages could not be read. Music sync rights for paid ads were not resolved by any source. Each unverified figure above needs a check against the live platform page before the template ships.
