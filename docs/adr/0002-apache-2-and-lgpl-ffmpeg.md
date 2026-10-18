---
type: Decision
title: "ADR 0002: Apache-2.0 license with an LGPL-safe FFmpeg"
description: The project is Apache-2.0 and ships only FFmpeg builds without GPL encoders, preferring platform hardware encoders.
tags: [adr, license, ffmpeg]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0002: Apache-2.0 license with an LGPL-safe FFmpeg

## Context

The project must be completely free and open source and easy for others to build on, including commercially. FFmpeg builds that include `libx264` or `libx265` are GPL, and distributing one inside our installer would pull our distribution toward GPL.

## Decision

- License the project under **Apache-2.0**.
- Ship (or download on first run) an **LGPL FFmpeg build** without GPL components. Encode H.264 with platform encoders (VideoToolbox, NVENC, QSV, AMF) and fall back to `libopenh264`, VP9 or AV1.
- The encoder choice lives in `packages/core/src/render.ts` (`chooseEncoder`). It still uses `libx264` when a developer's local FFmpeg has it, which is fine for local use but never relied upon.
- Run GPL programs (for example Blender) only as separate processes, never linked.

## Consequences

- Software-only encoding quality on machines without hardware encoders may be lower than x264. To be measured.
- We must test the encoder matrix per operating system (tracked in the roadmap).
- Contributors must not add GPL or AGPL code or dependencies. See `AGENTS.md`.

## Alternatives considered

- **GPL-3.0 for the whole project:** allows a full-featured FFmpeg, but every fork and integration must also be GPL. Rejected.
- **MIT:** equivalent for our purposes but lacks Apache's explicit patent grant.
