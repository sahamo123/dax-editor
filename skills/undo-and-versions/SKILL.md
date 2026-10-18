---
name: undo-and-versions
description: Use when the user wants to undo, redo or go back to an earlier version, or before any big edit that should be easy to reverse.
tags: [undo, redo, go back, revert, previous version, earlier version, history, checkpoint, restore, rollback, put it back, original, version, oops, undo that]
---

## When to use
"Undo that", "go back to how it was", "I liked the version before", "bring it back". Also use step 1 yourself before every big change.

## Steps
1. Before a big or multi-step edit (`smart_cut`, `keep_only`, `apply_cut_plan`, a format change, several deletes): `save_checkpoint {"name":"before-tighten"}`. Names under 60 characters, clear.
2. Undo the last change: `undo`. Again for the one before. Each AI action such as `smart_cut` is one step.
3. Undid too much: `redo`.
4. Go back further or to a named version: `get_history`. Read the list (id, label, who made it, duration). Find the state, then `restore_state {"id":3}` (example id).
5. "Undo what the AI did": in `get_history`, find the last state made by a person ("manual") before the AI states, and `restore_state` to it.
6. Run `get_project` to see the result, then tell the user what state they are in (length, what was undone).

## How to verify
The result says "Timeline is now N s". `get_project` shows the same duration and the expected clips and overlays.

## Pitfalls
- Editing after an undo starts a new branch; the old states stay in `get_history`, nothing is lost.
- History is kept for this session only. After the app closes only the saved project remains.
- `get_history` shows the latest 50 states.
- Exported files are not undone. Deleting them is not possible here.
- "Nothing to undo" means the project is at its first state.

## Do not
- Do not undo without being asked, unless an edit failed or clearly broke the project.
- Do not guess a state id; read it from `get_history`.
- Do not claim to have restored something until the result says so.
