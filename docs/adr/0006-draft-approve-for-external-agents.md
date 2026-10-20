---
type: Decision
title: "ADR 0006 (proposed): Draft-and-approve edits for external agents"
description: Proposed rule that edits from external MCP agents go to an isolated draft the user can approve, committed as a single undo step, with export and delete excluded.
tags: [adr, mcp, safety, proposed]
status: draft
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0006 (proposed): Draft-and-approve edits for external agents

**Status: proposed.** Not implemented. Needs a spec before the MCP server is built.

## Context

When Claude Code or another agent drives the editor over MCP, a bad edit could damage the user's work, and some actions cannot be undone (export overwriting a file, deleting media). The related project OpenChatCut uses a draft and review flow for this; we adopt the *idea* only (see [learnings](/research/openchatcut-learnings.md)). Its code is AGPL and must not be copied.

## Proposed decision

- An external agent opens an **edit session**. Reads and edits in that session apply to an isolated draft, not the live timeline.
- The agent submits the draft for review. In **manual** mode the user previews and approves or rejects it in the app. In **auto** mode it applies immediately.
- Applying a draft is **one undo step**.
- Irreversible actions (export, delete, publish, upload) are **not available inside a draft session**; they need a direct, separately approved call.
- The built-in chat agent and external agents call the same underlying tools, so there is one set of behaviors to test.
- Agent-facing tools take typed, validated parameters; never raw shell or FFmpeg arguments.

## Consequences

- The `Session` class in `@dax/core` will need a branching or draft notion.
- Evals should cover the draft flow once it exists.

## Alternatives considered

- **Edit live with undo only:** simpler, but cannot protect irreversible actions and gives the user no preview before changes land.
