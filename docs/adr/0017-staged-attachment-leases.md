---
type: Decision
title: Isolate new temporary attachments behind explicit leases
description: Propose opaque attachment leases with durable promotion and conservative recovery, while preserving all legacy uploads.
tags: [storage, attachments, recovery, privacy]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T10:40:00Z
---

# 0017: Isolate new temporary attachments behind explicit leases

## Context

The existing stage-only upload returns a reusable filesystem path. Saved projects, external clients, undo history and queued or interrupted tasks can retain that path beyond the current session. Neither task retention nor a scan of the open project proves that the source is unused. [Issue #202](https://github.com/sahamo123/dax-editor/issues/202) reproduced both abandoned files and valid long-lived references; the [research](../research/staged-attachment-lifetime.md) records the evidence.

## Proposed decision

Introduce a separate, opt-in temporary lease protocol for new clients. A lease exposes an opaque ID, never a temporary filesystem path. The engine serializes claim, promotion and explicit discard; it publishes a durable copy before any consumer can reference it. A chat task is acknowledged only after its ownership and task records are durably committed. On uncertain or partial recovery, retain bytes and refuse unsafe reuse or deletion. Do not replay edits after a restart or an uncertain response.

Legacy uploads, paths, saved projects, history, CLI and MCP clients remain durable and unchanged. No legacy or unrecognized upload is swept. Initial implementation slices add the protocol and state machine without enabling automatic cleanup; explicit discard is limited to a positively proven, unclaimed lease in an application-owned staging root. The detailed [contract](../specs/staged-attachment-leases.md) defines crash boundaries and acceptance tests.

## Consequences and unresolved gates

This is a proposed design, not an implementation or a guarantee of cleanup. Retaining ambiguous files can consume disk space. Quotas, visible recovery and a user-directed management flow are required; expiry alone never proves safety. Promotion can leave an extra durable copy after failure. No implementation may claim crash-safe acknowledgement until task persistence, single-writer ownership, filesystem durability and Windows path-containment behavior are proven. Multi-process locking and safe handle-based deletion need a platform-specific design and tests before cleanup is enabled.
