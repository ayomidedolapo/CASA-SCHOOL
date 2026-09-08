# CASA School - Phase 3K Central Student ID Card Production

Status: installer in progress until migration and verification complete.

## Added

- CARD_ISSUE and CARD_REISSUE Passkey actions;
- CASA-only versioned card-template registry;
- private template asset upload;
- single ACTIVE template invariant;
- private S3-compatible object-storage adapter;
- server-side text + QR renderer;
- render-before-database issuance invariant;
- front/back/combined preview artifacts;
- production render snapshot;
- READY / EXPORTED / PRINTED production queue;
- durable CARD_PRODUCTION_READY / EXPORTED / PRINTED events;
- separate rotatable high-entropy public ID Card URL;
- unauthenticated noindex public artifact route;
- central production queue API;
- XLSX production manifest with age calculated at export time;
- legacy raw issuance/replacement endpoints disabled;
- Registry production status/public-link workflow.

## Security

- raw student QR secret is never persisted for production;
- raw student QR secret is never returned to Registry for new cards;
- master template source/layout is never returned to school routes;
- card production fails closed without ACTIVE template/storage;
- existing cards remain valid;
- new issue/reissue requires Passkey;
- internal central production bridge uses environment-only secret;
- no hardcoded email or school-visible master template exists.

## Migration

Phase 3K creates migration 15.

All fourteen earlier migration files must remain byte-for-byte unchanged.