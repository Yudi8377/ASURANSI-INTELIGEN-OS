# Deployment runbook (self-hosted)

This runbook is for an administrator-controlled Linux host. GitHub stores source and CI artifacts; Neon provides PostgreSQL. Neither GitHub Pages nor Neon alone runs the Fastify API. An always-on host you control is required for commercial use.

## 1. Required environment

Provide these as environment variables in the host's secret manager or shell. Never commit the values.

- `DATABASE_URL`: Neon connection string for the selected project/branch. Use the pooled connection string if appropriate for your deployment; keep TLS verification enabled.
- `AUTH_ACCESS_TOKEN_SECRET`: cryptographically random secret, at least 32 characters (prefer 64+ random bytes encoded as hex).
- `APP_ORIGIN`: exact HTTPS origin of the dashboard, no wildcard.
- `ADMIN_EMAIL`, `ADMIN_NAME`, `ADMIN_PASSWORD`, `TENANT_CODE`, `TENANT_NAME`: only for the one-time bootstrap command.

Generate a secret with `openssl rand -hex 32`. Do not paste it into chat, GitHub issues, or source files.

## 2. Build and run the API

From the repository root on the host:

1. Review the release gates in `SECURITY.md` and this file.
2. Set the environment variables in the host's protected environment.
3. Build the image: `docker compose -f server/docker-compose.yml build`.
4. Start it: `docker compose -f server/docker-compose.yml up -d`.
5. Confirm the local health endpoint: `curl --fail http://127.0.0.1:8080/api/health`.
6. Configure a reverse proxy you administer to terminate TLS and route `/api/` to `127.0.0.1:8080`. Do not expose port 8080 directly to the internet.
7. Set dashboard build variable `VITE_API_BASE_URL` to the API prefix, for example `https://app.example.com/api`, only when the same-origin HTTPS reverse proxy is configured. Rebuild the frontend and serve its static `dist/` files from the same HTTPS origin.

The compose service binds only to loopback on the host, uses a read-only container filesystem, drops Linux capabilities, and enables a health check. Keep the host OS, Docker, and reverse proxy patched.

## 3. One-time administrator bootstrap

Only after the schema has been applied and reviewed, run the bootstrap script once from a trusted Node.js environment with the variables above set:

```sh
npm install --prefix server
node server/scripts/bootstrap-admin.mjs
```

Use a unique password of at least 15 characters. Remove `ADMIN_PASSWORD` from the environment immediately afterwards. The script refuses to overwrite an existing account. Do not expose the API publicly until MFA and all production release gates are complete.

## 4. Current release limitations — do not skip

- The web CRM has an API mode for login and client CRUD, but the remaining dashboard modules still include demonstration values or non-integrated screens.
- API access tokens are short-lived, but refresh-token rotation, MFA, password reset/invitation lifecycle, and production-grade session management are not yet implemented.
- The current bootstrap grants the initial administrator wildcard permissions; restrict this through reviewed role policy before onboarding more users.
- Legal source metadata is not the same as a complete verified legal corpus. Do not present AI outputs as legal advice or automate claim denial, fraud findings, payroll release, tax filing, or payments.
- Commercial release requires tenant-isolation tests, authorization tests, dependency/SAST scans, an authorized penetration test, encrypted backups with a successful restore drill, monitoring/alerts, incident response, privacy notices/consent and retention workflows, and review of applicable Indonesian insurance, personal-data, tax, employment, and consumer-protection obligations.
- Android CI builds a debug APK. A signed release build, key custody, privacy review, API integration, offline sync/conflict resolution, and store release process remain outstanding.

## 5. Verify after deployment

- `GET /api/health` returns 200 over HTTPS.
- Login fails closed for incorrect credentials and rate limits repeated failures.
- A user from tenant A cannot read or mutate tenant B records, including by guessing object IDs.
- CRM create/update/delete creates audit events and changes persist after refresh.
- No Neon credentials or privileged secrets appear in frontend bundles, APK assets, logs, or repository history.
- Backups can be restored to a separate test environment before any real customer data is entered.

Do not use real customer data until the security and compliance release gates above are signed off.


## Scenario Engine rollout

The scenario draft and pricing sensitivity API is introduced behind the `scenarios:create`, `scenarios:read`, and `scenarios:run` permissions. The bootstrap system administrator has wildcard permissions; other roles must be granted only the permissions they need.

Before enabling the routes against a live database, review and apply `database/migrations/0002_scenario_runs.sql` through the approved migration workflow. The migration was tested on an isolated Neon validation branch; it has **not** been applied to the production branch by this change.

Current execution maturity:
- Pricing sensitivity uses a versioned deterministic formula and reports baseline/adverse/stress sensitivities from explicit user-supplied assumptions. It is not a validated actuarial pricing model, tariff, or customer quote.
- Underwriting, claims, fraud triage, portfolio, renewal, regulatory-change and liquidity scenarios currently produce qualitative scenario plans only; they do not claim numeric forecasts.
- Every run requires human review. The API writes an audit record and stores the engine version.
- External evidence submitted through the scenario draft endpoint is unverified/pending review; a caller cannot mark evidence as verified through that endpoint.
- The UI in demo mode stores drafts in browser memory only. API mode requires the database migration, API deployment, correct permissions, and HTTPS configuration.


## Optional API hosting on Neon Functions

The API now has a fetch adapter at `server/src/neon-function.mjs`. This is a deployment path to validate—not a claim that the API is already deployed. Neon Functions are supported in this project's `aws-ap-southeast-1` region, but production deployment still requires operator-controlled secret provisioning and smoke tests.

From a trusted terminal with the Neon CLI installed and the correct project/production branch selected:

1. Change into `server/` so the API's `package.json` and dependencies are in scope.
2. Provision a unique `AUTH_ACCESS_TOKEN_SECRET` (at least 32 characters; prefer `openssl rand -hex 32`) in a protected local environment file. Never commit it or paste it into chat.
3. Set `NEON_FUNCTION_RUNTIME=1` and the exact dashboard origin in `APP_ORIGIN`. Neon injects `DATABASE_URL` for the selected branch.
4. Review the target branch and environment carefully, then deploy the function with slug `asuransiapi` and source `src/neon-function.mjs` using the current Neon CLI. Pass secrets only through the CLI's supported protected environment mechanism; never put them in shell history or logs.
5. Retrieve the invocation URL from Neon and test `GET /api/health`, CORS preflight, invalid login rate limits, and authenticated tenant isolation before connecting the dashboard.
6. Keep the API private/unannounced until all production release gates in this document and `SECURITY.md` are completed.

The adapter uses Fastify's injection interface to translate web `Request` objects into the existing routes. It does not bypass authentication, authorization, or validation. Confirm behavior on a non-production branch first. Scenario endpoints additionally require migration `0002_scenario_runs.sql`, which has not been applied to production.
