---
type: Reference
title: "Handoff patches"
description: "Unverified work-in-progress patches saved so nothing is lost when a builder stops. Apply with git apply; they are not part of the build until applied and checked."
tags: [handoff]
status: draft
generated:
  by: process:implementer
  at: 2026-10-19T06:30:00Z
---

# Handoff patches

Patches here are unfinished work from builders that stopped. They are not verified and may not apply cleanly after later commits.

- `review-fix-D-F-wip.patch`: review items D (pinned runtime digests and the opt-in for unverified installs) and F (model manager start/stop races), partly written, untested. Start from `docs/engineering/handoff.md`.

To try one: `git apply --check docs/handoff/<file>` first, then fix conflicts, add regression tests, and run `pnpm check` before committing.
