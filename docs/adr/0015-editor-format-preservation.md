---
type: Decision
title: Preserve omitted format options in live editor sessions
description: Keep footage fit and frame rate during editor format changes while retaining standalone CLI preset defaults.
tags: [editor, commands, compatibility]
status: stable
generated:
  by: process:implementer
  at: 2026-10-22T00:00:00Z
---

# Preserve omitted format options in live editor sessions

The expanded real-model suite initially checked dimensions but missed an unsolicited fit change. Existing preset semantics intentionally choose blur for portrait/square and reset landscape to contain. That conflicts with the live editor contract to preserve unspecified properties, even when the model correctly omits an unwanted fit argument.

Use an explicit `CommandContext.preserveFormatOptions` capability on the existing shared command path. Editor contexts (manual, in-app AI and live MCP) keep current fit and frame rate when omitted; explicit validated values still apply. Batches inherit the context. Standalone command/CLI contexts retain their existing preset defaults unless they opt in. No project schema, command API or saved-file migration changes are needed.

Regression tests must cover editor preservation, explicit changes and legacy defaults. The offline smoke asserts fit/frame-rate preservation and title timing as well as dimensions/text. A prior narrow PASS is not full correctness evidence.
