# ASURANSI INTELIGEN OS

Platform operasional asuransi dengan dashboard admin, CRM, polis, klaim, accounting, HR/payroll, perpajakan, master data, knowledge base regulasi, audit, dan AI Companion.

## Prinsip arsitektur
- Dashboard admin adalah antarmuka operasional, bukan server. Semua klien menggunakan API server; server mengakses Neon PostgreSQL.
- Offline-first: klien dapat menyimpan antrean lokal dan sinkronisasi saat jaringan tersedia. Neon tidak dapat diakses ketika perangkat benar-benar offline.
- AI lokal menggunakan knowledge pack yang diverifikasi dan model inferensi lokal yang dipasang terpisah. Jangan menganggap API key atau model remote sebagai AI offline.
- AI tidak memutus penolakan klaim, menetapkan fraud, membuat keputusan pajak final, atau mengeksekusi transaksi finansial tanpa persetujuan manusia.
- Keamanan: deny-by-default, RBAC, tenant isolation, audit trail, MFA-ready, rate limiting, secret hygiene, backup/restore tests, dan security testing terotorisasi.

## Struktur
- `src/`: dashboard web React + TypeScript
- `server/`: rancangan API server untuk deployment pada server yang Anda kendalikan
- `database/migrations/`: skema PostgreSQL
- `knowledge/`: manifest sumber regulasi; teks resmi harus diimpor, diverifikasi, diberi versi dan tanggal berlaku
- `security/`: threat model dan kontrol pertahanan
- `apps/android/`: rancangan klien Android native offline-first

## Mulai dashboard demo
`npm install` lalu `npm run dev`.

Dashboard awal memakai data contoh browser dan belum terhubung ke Neon/API. Jangan masukkan data nasabah nyata dalam mode demo.

## Database
Target Neon yang ditetapkan pengguna: project `rapid-meadow-32896086`, branch `br-crimson-haze-aoajbbfh`. Simpan connection string hanya di secret environment `DATABASE_URL`, jangan commit ke Git.

## Sumber dan kepatuhan
Sumber awal yang perlu diverifikasi: UU 40/2014 tentang Perasuransian beserta perubahan melalui UU 4/2023 P2SK; peraturan OJK yang relevan; UU 27/2022 tentang Pelindungan Data Pribadi; peraturan pajak/ketenagakerjaan; prinsip IAIS. Repository ini bukan bukti sertifikasi ISO, audit keamanan, atau persetujuan regulator.
