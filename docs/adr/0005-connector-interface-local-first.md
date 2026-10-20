---
type: Decision
title: "ADR 0005: Local files first, behind a Connector interface"
description: Version 0.1 handles local files only, but all media access goes through a Connector interface so cloud storage can be added without changing the engine.
tags: [adr, connectors, storage]
status: stable
generated:
  by: process:implementer
  at: 2026-10-18T18:50:00Z
---

# ADR 0005: Local files first, behind a Connector interface

## Context

Users will want footage from Google Drive and similar services. Video files are large, so how bytes move matters. We considered routing everything through an integration platform such as Composio. We could not verify its file size limit, but it copies files through its own storage (per third-party documentation mirrors), which is a poor fit for multi-gigabyte video. See [landscape research](/research/landscape.md).

## Decision

- v0.1 supports **local files only**.
- All media access goes through the `Connector` interface in `packages/core/src/connector.ts` (`list`, `stat`, `download`, optional `upload`). `LocalConnector` is the first implementation and can restrict access to allowed folders.
- Later connectors move **file bytes directly** between the provider and local disk, with resumable transfers: Google Drive (native API) and rclone first.
- **Actions** that are not file transfer (publishing to a social site, posting a message) will use a separate adapter that can be backed by MCP servers or an integration platform. These are optional.

## Consequences

- Adding a provider means implementing one interface and registering it. No engine changes.
- Google Drive access needs an OAuth decision: reading arbitrary files requires a Google "restricted" scope that needs app verification, while the narrower `drive.file` scope with the Picker only sees files the user chooses (unverified; check Google's current policy before building).

## Alternatives considered

- **Composio for everything:** fastest start, but relays large files and ties file access to a third party. Kept as an optional action backend only.
