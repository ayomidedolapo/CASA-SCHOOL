# CASA School - Phase 3J Technician Identity & Scanner Operations

Status: GREEN

## Scope

Source-only operational phase.

No database migration is permitted.

## Added

- dedicated OWNER / ADMIN / SCHOOL_TECHNICIAN workbench;
- Registry student search and identity-readiness view;
- active biometric profile visibility;
- active student-card visibility;
- Passkey-driven AWS face enrollment and re-enrollment UI;
- explicit enrollment liveness cancellation;
- Passkey-driven Scanner terminal provisioning;
- Passkey-driven terminal credential rotation;
- Passkey-driven suspend, reactivate, and revoke;
- one-time terminal credential display only in transient React state;
- links back to Registry, Attendance, and Scanner PWA.

## Deliberate boundary

The workbench does not expose raw student-card credentials.

Card production remains the next backend architecture phase.

No broader School Admin redesign is included.
## Verification

- Technician operations self-test passed.
- Attendance Operations self-test passed.
- Scanner, AWS biometric, provider, Passkey, trusted biometric, terminal, attendance, card, and auth self-tests passed.
- TypeScript passed.
- ESLint passed.
- Production build passed.
- Fourteen migration files remained byte-for-byte unchanged.
- Development database remained at fourteen applied migrations.
- Anonymous Registry student list returned HTTP 401.
- Anonymous terminal list returned HTTP 401.
- Anonymous enrollment-liveness cancellation returned HTTP 401.
- No live AWS enrollment was manufactured by the installer.
- No student, card, terminal, biometric, or attendance operational record was manufactured by the installer.