---
type: Research
title: OpenChatCut learnings
description: Ideas we take from OpenChatCut, a conversational AI video editor under AGPL-3.0, plus where dax-editor will adopt them or differ.
tags: [research, competitors, agents, mcp, skills, licensing, ux]
status: stable
generated:
  by: process:scribe
  at: 2026-10-18T18:45:00Z
---

# OpenChatCut learnings

> **License: AGPL-3.0+. This note records IDEAS ONLY.** [OpenChatCut](https://github.com/0xsline/OpenChatCut) is AGPL-3.0 and dax-editor is Apache-2.0. Nobody copies, pastes, translates or closely paraphrases its code into this repo. See the licensing rules in [AGENTS.md](../../AGENTS.md).

Source: the OpenChatCut README, read on 2026-10-18. The source code was not read, so every fact below is what the README claims. Snapshot: about 2.5k GitHub stars, built with Electron, React and Remotion, licensed AGPL-3.0+.

For the wider competitive picture see [landscape](landscape.md).

## 1. Ideas worth keeping

### a. Immutable timeline state and one command layer
The project state is immutable. Agents and the UI both change it only through the same commands, so every edit is traceable and undoable. This matches our design: the core edit operations are pure and never mutate their input (see [AGENTS.md](../../AGENTS.md)).

### b. Draft, review and approve for external agents
- The client calls `begin_edit_session` with `approvalMode` set to `manual` or `auto`.
- All reads and edits carry the session id and go to an isolated draft.
- `review_edit_session` submits the draft.
- In `manual` mode the user previews the draft and approves or rejects it in the editor. In `auto` mode it applies immediately.
- Either way the draft commits as **one undo step**.
- A stale `auto` session returns an error. It does not silently fall back to something else.
- Generation, export and deletion tools are deliberately excluded from draft sessions, because a rejected proposal could not roll them back.
- Approval in the agent client controls whether a tool may be called. Project approval is a separate control.

### c. Agent Skills
- One installable router skill loads 26 specialised skills on demand.
- Each skill is a `SKILL.md` file, with the same layout as `~/.codex/skills` and `~/.claude/skills`.
- Custom user skills live at `~/.openchatcut/skills/<slug>/SKILL.md`.
- A `/` command picks a workflow.

### d. One tool set for the built-in agent and external clients
The built-in agent and external MCP clients call the same internal editing tools. There is no second, weaker API for outside agents.

### e. Safety
- Server-managed media directory paths and cloud credentials are never written into project JSON.
- Local path imports go through an `AGENT_IMPORT_ROOTS` allowlist.
- The MCP bridge is single-user and single-machine.

### f. User experience
- The agent workspace, media pool, preview and multitrack timeline sit together on one screen.
- Chat, drafts and proposals persist across refresh and restart.
- Editing features listed: snapping, ripple edits, keyframes, markers, undo and redo.

### g. Repo and process gaps we can beat
- No `AGENTS.md`.
- No `CONTRIBUTING` file.
- No evals directory.
- Contributor guidance is a short README section: branch from `main`, add an executable check, run tests, lint and build.

### h. Weaknesses its README admits
- Early builds.
- macOS builds are unsigned.
- Preview and render depend on Remotion. Automated rendering needs a paid Remotion licence, which is one reason we avoid Remotion (see [landscape](landscape.md)).
- Connected AI features need the user's own credentials.

## 2. What dax-editor will adopt

- **The command layer and the draft/approve flow for external agents.** Record it as an ADR, see [ADR 0006](../adr/0006-draft-approve-for-external-agents.md). That ADR is proposed and not yet implemented.
- **The `SKILL.md` format for editing recipes.** Format recipes (tutorial, explainer, short-form) stay as data files, see [ROADMAP](../ROADMAP.md).
- **One shared tool set** for the built-in agent and the MCP server.
- **Export and delete excluded from agent drafts.** A rejected proposal must always be fully undoable.

## 3. Where dax-editor will differ

- **Permissive Apache-2.0** licence instead of AGPL-3.0.
- **Tauri** for the desktop shell, not Electron.
- **No Remotion.** Cuts, concat, audio, scaling and caption burn-in use FFmpeg only. Animated overlays come from a pluggable overlay renderer.
- **Evals, `AGENTS.md` and an OKF knowledge base from day one**, not added later.
- **A connector layer** for files outside the local machine, so the engine never changes when a new source is added.
- **An embedded local model** as one of the chat backends, not only cloud or API-key backends.

## 4. Open questions

- **Owner feedback (open).** The project owner uses OpenChatCut regularly. Their hands-on feedback is not yet recorded. To capture:
  - What do they like about it?
  - What frustrates them?
  
  Add the answers to this section, dated, and turn anything actionable into a GitHub issue.
