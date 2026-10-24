# Production release gate

The repository has a working CI pipeline and a validation-only Neon deployment. Production remains deliberately separate until the release inputs below are configured and tested.

## Required GitHub Actions configuration

Repository **Secrets**:
- `NEON_API_KEY`: Neon API key with access to project `rapid-meadow-32896086`.
- `DATABASE_URL_PRODUCTION`: connection string for production branch `br-crimson-haze-aoajbbfh` only. Do not reuse the validation `DATABASE_URL` secret.
- `AUTH_ACCESS_TOKEN_SECRET_PRODUCTION`: high-entropy secret of at least 32 characters. Do not commit it or paste it into chat.

Repository **Variables**:
- `APP_ORIGIN`: HTTPS origin of the deployed dashboard, without a path (for the default GitHub Pages project site this is `https://yudi8377.github.io`).
- `VITE_API_BASE_URL`: production function URL including `/api`, for example `https://<production-function-host>/api`.

## Release order

1. Confirm production schema and migration history; do not run migrations from the deployment workflow.
2. Add the production secrets/variables in GitHub Settings.
3. Trigger **Deploy Neon Functions (production, manual)** and type `DEPLOY-PRODUCTION`. The workflow requires the `production` GitHub Environment and checks `/api/health` for HTTP 200, API status `ok`, and database status `connected`.
4. After the production function URL is known, set `VITE_API_BASE_URL` and trigger **Deploy dashboard to GitHub Pages (manual)** with `DEPLOY-PAGES`.
5. Verify login, CRM CRUD, tenant isolation, session revocation, audit logging, and rollback procedures with non-sensitive test tenants before accepting paying customers.

## Important limitations

- CI and validation deployment do not constitute an independent security audit or regulatory certification.
- The dashboard hides demo metrics and unsupported modules when API mode is enabled; several business modules still need implementation.
- Production workflows are manual and guarded; they are not triggered automatically by pushes to `main`.
