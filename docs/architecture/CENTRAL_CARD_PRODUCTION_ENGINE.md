# CASA School - Central Student ID Card Production Engine

## Core invariant

The ID card identifies the student. The face verifies the person.

The physical student-card QR is a reusable identity credential.

CASA therefore never persists that raw QR secret merely so a card can be printed later.

## Production sequence

New card issuance and reissue are synchronous through the security-critical render boundary:

1. authenticated OWNER, ADMIN, or SCHOOL_TECHNICIAN reaches the school route;
2. CASA determines whether the action is CARD_ISSUE or CARD_REISSUE;
3. a fresh one-use Passkey grant for that exact action is required;
4. CASA resolves the one ACTIVE private card-template version;
5. CASA verifies private card object storage is configured;
6. the raw 256-bit student-card credential is generated in server memory;
7. the QR is rendered into the final personalized card while the raw credential exists only in memory;
8. front, back, and combined preview artifacts are written to private CASA-controlled object storage;
9. only after rendering succeeds does one database transaction create/replace the active card, persist the SHA-256 credential hash, create the production job, and append lifecycle/production events;
10. the raw credential is discarded and is never returned to the school browser.

A rendering or storage failure creates no card row.

A database conflict after artifact upload triggers best-effort orphan artifact deletion and creates no replacement card.

## Legacy cards

Cards issued before Phase 3K remain valid for Scanner identity resolution.

They may have no production job or rendered artifact.

The legacy raw issuance and raw replacement endpoints are disabled.

All new issue/reissue operations use the production route.

## Passkey

New actions:

- CARD_ISSUE
- CARD_REISSUE

A password session alone cannot issue or reissue a student identity credential.

The grant remains user + school + membership + action scoped, five minutes, and single use.

The production job stores the exact consumed Passkey grant ID.

## CASA-owned templates

`student_card_templates` is global CASA production infrastructure.

A template version contains:

- private front source object key;
- private back source object key;
- private layout JSON;
- immutable version label;
- DRAFT / ACTIVE / RETIRED lifecycle.

Only one template can be ACTIVE.

Activation retires the previous ACTIVE version atomically.

School-facing routes never return:

- source object keys;
- layout JSON;
- reusable blank template artwork.

## Template layout

Coordinates are normalized to the actual source image dimensions.

Supported text data sources:

- school name;
- student name;
- CASA Student ID;
- optional school student/admission number;
- date of birth;
- sex/gender display;
- class;
- card serial.

The template centrally chooses which side contains the QR.

This makes design/version changes data-driven without distributing the master template to schools.

## Private artifact storage

Required deployment configuration:

- `CASA_CARD_STORAGE_BUCKET`
- `CASA_CARD_STORAGE_REGION`

Optional:

- `CASA_CARD_STORAGE_ENDPOINT`
- `CASA_CARD_STORAGE_FORCE_PATH_STYLE=true`

AWS/default credential-chain secrets are deployment secrets and are not stored in PostgreSQL.

Template source files and final front/back/preview objects remain private.

## Public-by-link ID Card URL

Each production job receives a separate 256-bit random public access key.

That key is not the student QR credential.

The public route is:

`/id-card/<43-character-random-key>`

The route:

- requires no CASA login;
- is possession-based;
- returns the finished combined preview from private storage;
- emits `X-Robots-Tag: noindex, nofollow, noarchive`;
- uses no directory listing;
- uses no sequential student/card identifier;
- can be rotated without changing the physical card QR.

The public key intentionally persists because it is the durable public-by-link artifact locator.

## Production queue

A card is queued only after rendering succeeds.

Status:

- READY;
- EXPORTED;
- PRINTED.

`CARD_PRODUCTION_READY` is a durable event suitable for later Motherboard consumption.

Central queue APIs are protected by the temporary internal CASA production key bridge until Motherboard provides its own first-class central operator identity.

The bridge uses:

`CASA_CARD_PRODUCTION_INTERNAL_KEY`

It must be at least 32 characters and remains an environment secret.

School users cannot call central template/queue APIs.

## Central template setup

Internal operations flow:

1. upload front/back master image assets to `/api/internal/card-production/template-assets`;
2. create a DRAFT template with source keys + layout;
3. activate that template;
4. school issue/reissue becomes available.

Until an ACTIVE template and storage configuration exist, card production fails closed.

## XLSX manifest

The central manifest endpoint returns an `.xlsx` production manifest.

Columns include:

- School;
- Student Name;
- CASA Student ID;
- optional School Student/Admission Number;
- Date of Birth;
- Age;
- Gender/Sex;
- Class;
- Card Serial;
- clickable public ID Card URL;
- Template Version;
- Production Status;
- Queued At.

Age is calculated at export time from date of birth. Age is not stored permanently.

The database remains authoritative. The spreadsheet is an operational export.

## Render snapshot

Each job stores a non-secret render snapshot of the student/school/class values actually used on that card.

Later changes to the student's name or class therefore do not rewrite historical production evidence.

## School UI

Registry now shows:

- active card;
- whether the card is a grandfathered legacy card or CASA-rendered production card;
- production state;
- template version;
- public finished-card link;
- production history.

The Registry never receives the QR token/payload for new cards.

## Deferred

This phase does not add:

- Motherboard UI;
- automatic print-vendor integration;
- bulk ZIP packaging of separate front/back artifacts;
- a student portrait capture/storage workflow.

Those can build on the production job/artifact model without weakening the QR credential invariant.

No broad School Admin visual redesign is included.