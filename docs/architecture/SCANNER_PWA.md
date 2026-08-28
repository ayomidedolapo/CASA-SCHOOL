# CASA School ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â Scanner PWA

## Product boundary

`/scanner` is the dedicated installable attendance terminal.

It is not a School Admin dashboard.

The terminal is intended for an Android tablet or other suitable camera-capable browser device installed as a PWA.

## Core rule

**The card identifies the student. The face verifies the person.**

The PWA cannot create accepted attendance from QR alone.

## Device provisioning

The PWA starts unprovisioned.

A School Technician or other authorized operator provisions the physical terminal through CASA and receives the `CASAT1` credential once.

The credential is entered once on the device.

The PWA verifies it against `/api/terminal/session` before saving it in IndexedDB.

The credential is never:

- placed in the URL;
- logged;
- sent to analytics;
- stored in localStorage;
- embedded in the manifest or service worker.

CASA server storage remains SHA-256-only for the terminal secret.

Browser storage can be cleared by the device/browser. Reprovisioning or credential rotation then requires the replacement one-time credential.

## Human authorization of terminal lifecycle

Phase 3H closes the Phase 3C deferred Passkey rule.

Terminal mutations now require fresh action-scoped step-up grants:

- `TERMINAL_PROVISION`
- `TERMINAL_ROTATE`
- `TERMINAL_SUSPEND`
- `TERMINAL_REACTIVATE`
- `TERMINAL_REVOKE`

The terminal bearer credential itself cannot administer its own lifecycle.

## Automatic attendance operation

Students do not choose arrival versus departure.

The PWA sends `operation=AUTO`.

The trusted server resolves:

- no attendance record ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ CHECK_IN;
- current ON_CAMPUS ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ CHECK_OUT;
- already SIGNED_OUT ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ CHECK_IN, then existing re-entry policy rejects it.

The actual persisted attendance attempt still stores only CHECK_IN or CHECK_OUT.

AUTO is an API input convenience, not a new database attendance operation.

## QR flow

The PWA uses the rear/environment camera with qr-scanner. It uses the browser's native BarcodeDetector when available and its worker-based QR decoder otherwise.

After a QR is decoded:

1. raw QR exists only transiently in browser memory;
2. PWA sends it to the terminal scan API with a new idempotent request ID;
3. server hashes and resolves the card within the terminal's school;
4. Scanner displays student identity only after the server matched it;
5. camera switches away from QR before Face Liveness starts.

The PWA never persists the raw student QR.

## Face Liveness

Phase 3H uses `FaceLivenessDetectorCore` from Amplify UI with CASA's custom credential provider.

The PWA does not use Cognito user authentication.

The backend returns temporary STS credentials generated in Phase 3G.

Those credentials:

- are held only in React state;
- are never written to IndexedDB/localStorage;
- include the STS session token;
- authorize only `rekognition:StartFaceLivenessSession`;
- expire independently of the CASA terminal credential.

`onAnalysisComplete` calls CASA's server-side liveness completion route.

CASAÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Ânot the browserÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Âretrieves the liveness result, compares the exact ACTIVE FaceId, creates the trusted assertion, and finalizes attendance.

## Retry

AWS liveness sessions are single-use.

If the browser liveness component errors or the user cancels, the PWA calls CASA's liveness cancellation route.

That marks the bound provider session FAILED without rejecting the attendance verification attempt.

The same pending attempt can therefore create a fresh liveness session.

A genuine completed face/liveness mismatch still rejects the attendance attempt and requires a fresh card scan.

## Sign-out

When AUTO resolves to CHECK_OUT and normal dismissal rules permit it:

- face+liveness must pass;
- Phase 3D commits SIGNED_OUT atomically;
- the school WhatsApp notification outbox is queued for eligible guardians when an ACTIVE school sender is configured.

The terminal shows `Signed out` after server confirmation.

## Early departure

AUTO may identify a student as attempting CHECK_OUT before normal dismissal.

The Scanner stops and displays staff authorization required.

Phase 3H does not weaken this into a terminal-token approval.

A later supervised early-departure surface will consume the existing `EARLY_DEPARTURE` Passkey action.

## PWA / network model

The manifest starts at `/scanner`.

The Scanner registers `scanner-sw.js`.

Phase 3H deliberately gives that service worker no fetch cache.

Attendance remains online-only.

This prevents an accidental pseudo-offline implementation from caching:

- terminal API responses;
- QR payloads;
- AWS STS credentials;
- biometric results.

Real offline attendance requires a separate threat model, signed local queue, replay/idempotency rules, clock-drift policy, revocation semantics, and biometric offline strategy.

## Installation

Production requires HTTPS.

After provisioning, the School Technician installs `/scanner` using the browser/platform Add to Home Screen / Install App action.

No app-store publication is required for the Scanner.

## UI discipline

The Scanner is a real operational surface, not a temporary admin mock.

Its interface is intentionally narrow:

- oversized state typography;
- high-contrast monochrome layout;
- rear-camera QR surface;
- AWS Face Liveness surface;
- clear success/failure;
- minimal device controls.

This does not begin the broader School Admin visual redesign.
## Phase 3H recovery note

The initial Scanner installer stopped at ESLint before production build/live verification because the secure-context branch synchronously set React state inside an effect.

Recovery moved that transition behind the Scanner's asynchronous boot boundary rather than disabling `react-hooks/set-state-in-effect`.

The initial `@zxing/browser` install also resolved `@zxing/library@0.23.0`, which declares a Node 24 engine while CASA School runs Node 22. The QR stack was replaced by `qr-scanner@1.4.2`; the incompatible ZXing packages were removed from the lockfile.

A first recovery attempt completed the dependency swap but stopped before source mutation because its QrCamera regex was too strict. V3 uses deterministic source markers instead.
## Manifest smoke-test recovery

The V4 recovery completed source verification and production build, then stopped during live verification because its PowerShell manifest assertion regex-matched raw `Invoke-WebRequest.Content`.

V5 treats the manifest as structured JSON:

- HTTP 200 is required;
- response bytes/string are normalized to UTF-8 text;
- JSON parsing must succeed;
- `name` must be `CASA School Scanner`;
- `start_url` must be `/scanner`;
- `display` must be `standalone`.

No PWA architecture or manifest source change was required.
## Phase 3I supervised early departure

When the Scanner receives `EARLY_DEPARTURE_AUTH_REQUIRED`, it keeps the attendance attempt pending and polls only that attempt's authenticated terminal status.

After OWNER/ADMIN authorizes the release through Attendance Operations, the Scanner automatically starts a fresh AWS Face Liveness session for the same attempt.

The Scanner never receives the human Passkey step-up token or private release reason.