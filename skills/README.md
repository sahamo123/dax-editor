# Skills

Short, operational playbooks that the built-in AI (including small local models) and external agents load on demand. A skill tells a model WHEN to use it, WHICH registry commands to call with WHAT values, HOW to check the result, and what NOT to do. The only actions a skill may use are the commands in `COMMANDS` (`packages/core/src/commands.ts`). The folder is read by `loadSkills` in `packages/core/src/skills.ts`.

## Layout

```
skills/
  README.md
  router/SKILL.md            one line per skill: "name: when". Shown when a request matches nothing.
  <skill-name>/SKILL.md      one folder per skill; the folder name equals the skill name
```

## File format

```markdown
---
name: cut-to-length
description: Use when the user wants the video shorter or fitted to a target length such as 30 seconds.
tags: [shorter, shorten, length, duration, seconds, trim down, cut down]
---

## When to use
## Steps
## How to verify
## Pitfalls
## Do not
```

- Frontmatter is flat (`key: value`). `tags` is an inline list; `[a, "b, c"]` quotes items with commas. No nested YAML. Unknown keys are ignored.
- `name`: lowercase letters, digits and hyphens; same as the folder.
- `description`: ONE sentence, starts with "Use when", says WHEN to use the skill, written so a router can match it.
- `tags`: 5 or more words and short phrases a person might type (`um`, `clean up`, `tiktok`). They are matched after simple stemming (`pauses` = `pause`). A tag like `clean up` is a phrase and must appear in that order. Tags are what makes selection work, so add the synonyms people use.
- Body sections, in this order: When to use, Steps (numbered), How to verify, Pitfalls, Do not.

## Writing rules

1. Keep each file under 2,500 characters (the router under 3,000). Small models lose the thread in long text. Cut words, not facts.
2. Name the exact command and a sensible value. Write call examples as a backticked command, a space, then valid JSON: `` `smart_cut {"preset":"standard"}` ``. A test checks that the command exists and the arguments pass its schema. Use real values (seconds), not placeholders; a quoted placeholder string like `"<id>"` is fine.
3. Only mention commands that exist. For a capability that does not exist yet (captions, music, B-roll, zoom keyframes), say so and offer the nearest real option. Never pretend.
4. A skill that mentions an irreversible command (today `export_video`) must say it needs the user's confirmation.
5. Say how to verify with a read-only command (`get_project`, `get_transcript`, `get_history`) and what a good result looks like.
6. Times are seconds. Say whether a time is timeline time or source time. `delete_range` and `keep_only` use timeline time; `get_transcript`, `detect_silence` and cut plans use source time. Convert with: timeline time = clip start + (source time minus sourceIn).
7. Reference other skills by their exact name (for example "see add-callout"); a test checks they exist.
8. Plain words, no emoji. The reader may be a small model.

## Adding a skill

1. Create `skills/<name>/SKILL.md` as above.
2. Add one line `- <name>: <when>` to `skills/router/SKILL.md` (at most 130 characters).
3. Run `pnpm --filter @dax/core test` (the tests lint every skill) and `pnpm exec biome check --write skills packages/core`.
4. If a request should pick your skill, add a case to `packages/core/src/skills.test.ts` and check it is chosen.

## How skills reach the model

```ts
import { loadSkills, selectSkills, skillContext } from "@dax/core";

const skills = loadSkills("skills");
// For @dax/agent: contextProvider: (message) => skillContext(selectSkills(message, skills))
```

`selectSkills(message, skills, { limit, maxChars })` scores skills by tag, name and description, includes the best few in full (default 3), adds `verify-your-edit` and `explain-what-you-did` in compact form every time, and keeps the text under `maxChars` (default 6,000). With no match it offers the router. The packaged app must ship this folder.
