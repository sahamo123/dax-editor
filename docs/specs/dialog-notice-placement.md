---
type: Spec
title: Keep task notices usable while dialogs are open
description: Placement, focus and verification contract for visible task notifications during modal workflows.
tags: [desktop, accessibility, dialogs, notifications]
status: draft
generated:
  by: process:implementer
  at: 2026-11-02T17:45:00Z
---

# Keep task notices usable while dialogs are open

## Problem

At 1024×700, a local-model cancellation notice overlaps the Settings Save button. [#257](https://github.com/sahamo123/dax-editor/issues/257) records a failing geometry regression using fake work. The separate rendered-effects review dialog has a higher stacking level than the global toast stack, so a notice can also be hidden behind it. Visible notices must remain reachable and not obscure dialog actions.

## Contract

- With no modal, keep the existing fixed toast stack and live regions. While an application modal is open, present the same visible notices in a bounded, scrollable in-flow area inside the topmost modal. Keep the dialog header and footer actions unobstructed, including at compact viewport sizes and with multiple long messages.
- Share a lightweight optional notice-host context between the app shell and editor; standalone editor use remains functional without a host provider. Modal hosts register only while mounted, and nested dialogs return the stack to the previous host when closed.
- Move one persistent toast container between the shell and the active host so that mounting a dialog does not restart notice lifetimes or duplicate dismiss controls. Keep the existing independently batched polite and urgent live regions stable and preserve their contents, ordering and priority.
- Existing modal focus containment must include dismiss buttons. Opening, closing or dismissing a notice must not steal focus from a valid focused action; keyboard users must be able to reach and dismiss notices and continue using the dialog.
- Cap and scroll the notice area rather than truncating long errors or suppressing them. Keep error details readable and dismissible. Do not introduce automatic retries, new network access or dependencies.
- Pause each visible notice's remaining lifetime while focus is inside or a pointer hovers the active notice area, including its scrollable modal region. Resume the remaining time after both interactions leave; untouched notices retain their existing timeouts. New notices arriving during interaction also wait. Moving the persistent stack between dialogs must not reset timers or duplicate announcements.

## Evidence

Use generated media and fake services only. First preserve the pre-fix compact geometry failure. Then test Settings and rendered-review dialogs at common and compact sizes, including multiple long error/info/success notices, geometry and pointer hit-testing, dismissal, focus containment and reduced motion. Verify the stable live-region batching tests and inspect actual rendered screenshots. Run relevant component/browser checks, `pnpm check`, documentation and self-review on the exact candidate. Native Windows scaling and actual screen-reader speech remain separate acceptance gates.
