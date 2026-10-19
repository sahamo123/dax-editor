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

- `review-fix-G-H-wip.patch`: review items G (finite numbers in schemas) and H (asset paths and FFmpeg protocol whitelist), partly written, untested. Applies to the branch as of the D and F merge; check with `git apply --check` first.

To try one: `git apply --check docs/handoff/<file>` first, then fix conflicts, add regression tests, and run `pnpm check` before committing.
