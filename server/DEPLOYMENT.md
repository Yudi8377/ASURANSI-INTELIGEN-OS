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
