# CASA — Product UI System

## Brand rule

CASA is the product brand across Institution and School modules. `School`, `Registry`, `Attendance`, `Technical`, `My Class`, and similar labels are workspace context, not separate product brands.

Preferred visible pattern:

- `CASA` — primary brand;
- `School operations`, `CASA / Registry`, `CASA / Attendance`, etc. — secondary context;
- never use `CASA School` as a separate wordmark or product identity in the UI.

## Shared visual grammar

Institution is the visual-template authority for CASA modules:

1. off-white editorial/context surface (`#f2f2ef`);
2. white operational work surface;
3. thin neutral rules, with black reserved for decisive boundaries;
4. small mono uppercase kicker labels;
5. large editorial headings with tight tracking;
6. square controls and panels;
7. restrained success/warning/danger colour only for status meaning;
8. wide desktop layouts around 1600–1700px, collapsing naturally on mobile;
9. numbered/structured action lists where multiple workspaces/actions are presented;
10. no generic rounded SaaS cards.

School pages can differ in information density and workflow, but should begin from this same grammar rather than inventing an independent shell.

## Attendance terminal rule

The School Scanner is a CASA attendance terminal, not a separate branded product.

The terminal keeps:

- QR/card identification;
- face/liveness verification;
- time/presence decision;
- terminal credential isolation;
- front/rear camera selection when supported;
- wake-lock and camera recovery;
- network-only attendance/security API behavior.

Installation UI must follow browser capability. CASA may expose an install action only when the browser has emitted a real `beforeinstallprompt` event. CASA must not display a fake install button or manual fallback instructions when installation is not actually available through that event.

## Module consistency

The following School surfaces should visually read as members of the same CASA family as Institution:

- landing/access;
- login;
- registry;
- attendance;
- school technician;
- teacher / My Class;
- Staff & Access;
- Passkey security;
- CASA internal technical operations;
- attendance terminal.

Consistency means shared brand, spacing, typography, rules, surface hierarchy and interaction grammar — not identical page composition.
