# Dax Editor product context

This is the working product brief for the existing Dax Editor desktop application. The [current status](docs/STATUS.md) and issue receipts distinguish implemented behavior from proposed work; this document is not a release-readiness claim.

## Product and audience

Dax Editor is a free, Apache-2.0, local-first video editor for people producing short videos, podcasts, educational material and other creator content. A creator can edit by hand or describe an edit to an assistant, inspect the result, adjust it, undo it and export. Windows is the first acceptance target; the shared engine also supports CLI and MCP entry points.

## Essential outcomes

- Import local media, work on an existing project, preview the edit, save/reopen and export a playable result without configuring an assistant or paying for an API.
- Use local AI or an optional user-supplied provider; communicate actual setup and connection status honestly. Do not silently switch providers or send user media to a provider.
- Keep in-app tasks understandable: Planning proposes without editing; queued follow-ups retain their context; steering does not cancel the active request; Stop is separate; errors and recovery are visible.
- Share one project session, typed command registry, validation and history across manual, AI and MCP actions. Keep credentials and local machine paths outside portable project data.
- Preserve user projects and editing history during failures and upgrades. A browser preview, a mock, a real model, an external client and a native build are distinct evidence classes.

## Proposed first-improvement journey

Setup is skippable: choose or open a project, import media, optionally choose an editing direction, then edit, review and export. Existing projects open directly in the editor. Project-wide setup and selection-specific properties have separate homes. Chat, task status, preview and timeline remain accessible as the window changes size. The [workspace contract](docs/specs/workspace-design-contract.md) defines the proposed interaction; it is not yet implemented merely because it is written down.

## Boundaries

No paid service is mandatory. Remotion is excluded. Arbitrary scripts, a second editing engine, a public hosting service, professional multitrack parity and automatic behind-person masking are outside this first-improvement route. Later profiles and advanced layers follow their own reviewed contracts and evidence gates. Native Windows acceptance and installation on the owner's machine remain open until tested on the relevant candidate and policy-authorized target.
