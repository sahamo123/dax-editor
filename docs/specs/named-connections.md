---
type: Spec
title: Named API connections
description: Explicit immutable snapshots of provider configuration and isolated private credentials.
tags: [providers, desktop, settings]
status: draft
generated:
  by: process:implementer
  at: 2026-10-23T00:00:00Z
---

# Named API connections

Delivery #8 / T03 #11. Save the current API configuration under a name; load or remove a saved snapshot explicitly. Multiple snapshots of the same family are supported. Loading selects that family and restores configuration and its own credential, with no inference or connection probe. Working-copy changes never silently overwrite the snapshot. Local/CLI providers retain their current configuration workflow.

Public snapshot metadata lives in settings.json; keys stay only in secrets.json. Existing per-family settings/keys remain valid without migration. Legacy settings writes preserve snapshots; only the explicit authenticated connection endpoint may change their immutable configurations. Each snapshot has an application-generated UUID, a name up to 80 characters, a supported API family and validated configuration. Limit 24. No credentials in responses, tasks or project files.

Settings/credential mutations share the engine serial queue. Loading clears the previous working key before changing its settings, then restores only the selected snapshot key. A crash during loading therefore leaves a missing key rather than another account's key. Compatible keys retain endpoint binding. Already queued requests retain their captured settings and credential. Removing a snapshot leaves the working copy unchanged.

UI: save current form before snapshot creation, name field, saved connections by family, explicit Load and Remove, and a message that loading replaces the working configuration. Clear typed keys before loading; discard unsaved form edits only through explicit Load. No automatic paid fallback. Test independent accounts/endpoints, keyless connections, restart, ordinary settings compatibility, unauthorized access and secret non-disclosure. Native/hosted live validation remains separate.
