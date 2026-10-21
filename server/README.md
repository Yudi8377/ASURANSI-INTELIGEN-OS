# API Server — Self-hosted

Dashboard web adalah antarmuka, bukan server. API harus berjalan pada mesin/server yang Anda kendalikan dan mengakses Neon lewat `DATABASE_URL`. Jangan menaruh kredensial Neon di browser atau APK Android.

## Rencana stack
Node.js LTS + TypeScript + Fastify, PostgreSQL driver `pg`, validasi skema, Argon2id, access token berumur pendek + refresh-token rotation, MFA untuk admin, RBAC dan tenant scoping.

## Release gates sebelum endpoint produksi dibuka
1. Login/invite, verifikasi identitas, MFA privileged users; tidak ada akun admin default.
2. Periksa izin dan tenant pada setiap request dan setiap objek.
3. Secret hanya dari environment; jangan commit `.env` atau connection string.
4. TLS, CORS allowlist, CSRF protection untuk cookie, rate limit, body size limits, secure headers, parameterized SQL, dan redaksi log.
5. API versioning, idempotency untuk transaksi, audit event, backup terenkripsi dan restore drill.
6. Test authorization lintas tenant, dependency audit, SAST/DAST, dan uji penetrasi terotorisasi.

Status: rancangan persyaratan. API produksi belum terimplementasi/siap menerima data sensitif.