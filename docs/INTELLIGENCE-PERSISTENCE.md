# Persistent intelligence research

## API

The authenticated API provides a separate persistence-enabled execution endpoint:

- `POST /api/v1/intelligence/research/run` — executes configured public JSON sources, saves a tenant-scoped research run and its findings in one transaction, and writes an audit record. Requires `intelligence:research`.
- `GET /api/v1/intelligence/research/runs?limit=25&offset=0` — lists only the authenticated tenant's runs. Requires `intelligence:read`.
- `GET /api/v1/intelligence/findings?limit=25&offset=0&status=unverified&runId=<uuid>` — lists only the authenticated tenant's findings, with bounded pagination and optional status/run filters. Requires `intelligence:read`.

The existing `POST /api/v1/intelligence/research` endpoint remains the non-persistent research preview. Clients should use the `/run` endpoint when saved history is required.

## Migration and release

Apply `database/migrations/0003_intelligence_research_persistence.sql` after migrations `0001` and `0002` on the intended Neon branch. The migration is additive. This pull request does not apply it to any Neon branch or deploy production.

The endpoint uses a transaction for run metadata, findings, and audit entry. On persistence failure it rolls back and returns HTTP 503; it never reports results as saved when the transaction fails. Queries always include the authenticated `tenant_id`. Database-backed integration tests against a disposable validation branch are still required before production rollout.

## Trust boundaries

Every fetched finding is saved as `unverified` by default. Saving data is not fact-checking. No finding is automatically promoted to verified, and this API does not make underwriting, pricing, fraud, claim acceptance/denial, reserving, or settlement decisions. Provider access remains opt-in and governed by the existing HTTPS host allowlist and source configuration.
