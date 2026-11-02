---
type: Spec
title: Guard chat submission context
description: Bind a desktop chat request to its initiating project and provider configuration before attachment staging.
tags: [chat, tasks, concurrency, desktop]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T07:00:00Z
---

# Guard chat submission context

[Issue #201](https://github.com/sahamo123/dax-editor/issues/201) addresses a reproduced race: a synthetic Planning request initiated in one project or with one provider was queued under another context when the selection changed while an attachment was being staged. The task was attributed to the later context. No real project or hosted provider was used.

## Contract

- Capture the active project identity and an opaque, non-secret provider-context version at the instant a desktop user submits a message, before staging any attachments. Preserve mode and steering as today.
- Include both values in the eventual chat request. The authoritative engine checks them immediately before creating a task and captures its existing immutable provider settings and credentials only after the check. A project transition in progress must not race the check or accept chat against a session about to be replaced.
- A mismatch, or an in-progress project or provider transition, is rejected before task creation with an actionable conflict. The user can review the current project and provider and explicitly submit again; never automatically replay an edit. A confirmed pre-task conflict may preserve the original draft and attachments. A network failure or other uncertain post-attempt outcome is not presented as definitely unsent.
- Publish a non-secret provider-context version in current engine state. Changes that invalidate provider settings, credentials or runtime state conservatively change the version; neither credentials nor a credential-derived fingerprint is exposed. Restarted sessions use a new project identity.
- Current desktop clients fail closed with a useful message if an older engine does not expose both values. Preserve existing API compatibility: a legacy client may omit both guards and retains its prior unguarded behavior; a request containing only one guard is invalid. This limitation must remain explicit until a separately planned protocol migration can require guards for all clients.
- Do not reject merely because the project revision changed while an active queued edit was progressing; existing command-level revision checks still protect subsequent edits. Guarding the project identity does not authorize stale tool mutations.

## Verification

Reproduce project and provider switches during staged upload, between uploads, and immediately before submission. Test server-side mismatches, a matching request, incomplete guards, legacy unguarded behavior, and an in-progress project transition. Verify one intentional request at most, retained draft on confirmed rejection, Planning and queue/steer behavior, and no secrets in state or logs. Use generated media, fake providers and local-only test servers. Native desktop and actual screen-reader evidence remain separate.
