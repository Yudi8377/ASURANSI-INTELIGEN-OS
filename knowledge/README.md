# Offline legal knowledge pack

The initial database contains a catalog of 14 source records; it does not yet contain full verified texts of those laws, regulations, or standards. Do not represent a source catalog as a complete legal knowledge base.

Each ingested document must include: issuing body, official URL, publication number, title, original text, article/section, language, publication date, effective date, repeal/amendment relationships, retrieval timestamp, SHA-256, license/redistribution status, verifier, review timestamp and current status.

## Lifecycle
`queued → retrieved → parsed → version-checked → legal/compliance review → approved → signed pack → distributed → superseded`

Any source with uncertain provenance, broken text extraction, missing effective date, conflicting versions, or license concerns remains quarantined. Official texts must be preferred over summaries. AI-generated summaries never replace the original legal text.

## Offline distribution
Generate a compact SQLite/FTS package with manifest and file hashes. Sign the manifest with a release key held outside GitHub. Client verifies signature and hashes before activating. Retain the prior known-good pack for rollback. Show pack version and last verified date in both dashboard and Android app.
