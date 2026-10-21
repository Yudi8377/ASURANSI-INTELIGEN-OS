# Threat model dan pertahanan berlapis

## Aset dan ancaman
Data identitas, kontak, polis, klaim, dokumen, data payroll, percakapan AI, token, dan kredensial. Ancaman meliputi credential stuffing, phishing, privilege escalation, IDOR/BOLA, SQL injection, XSS, CSRF, SSRF, file berbahaya, prompt injection, data exfiltration, supply-chain compromise, insider misuse, ransomware, dan denial of service.

## Kontrol wajib
1. Identitas: MFA privileged users, password hash Argon2id, rate limit, session rotation/revocation.
2. Otorisasi: deny-by-default RBAC, validasi tenant dan izin pada setiap objek/aksi; test anti-IDOR/BOLA.
3. Data: TLS, enkripsi saat tersimpan, enkripsi field untuk data identitas/rekening, minimisasi data, redaksi log, retensi dan penghapusan.
4. Database: akses melalui API, least-privilege role, parameterized query, transaksi, constraints, backup terenkripsi dan restore drill.
5. Web/mobile: CSP, secure headers, strict CORS, CSRF protection bila memakai cookie, validasi deep link, Android Keystore, tidak ada secret di APK.
6. AI: retrieved content dianggap input tidak tepercaya; provenance/citations, freshness dan tanggal berlaku; tool allowlist; approval gates. Jangan biarkan AI memutus penolakan klaim, menetapkan fraud, mengirim pajak atau membayar klaim secara otomatis.
7. Operasi: dependency pinning, secret scanning, SAST, SBOM, signed releases, alert audit, incident playbook, recovery tests.
8. Pengujian: hanya pada sistem milik sendiri atau dengan izin tertulis. Tidak ada pengujian destruktif ke sistem pihak lain.

## Release gates
Unit/integration tests, tenant isolation tests, auth tests, dependency/secret scans, OWASP ASVS/MASVS mapping, API security testing, Android storage/network review, dan uji penetrasi independen terotorisasi sebelum produksi.

Tidak ada desain yang menjamin sistem mustahil ditembus. Dokumen ini bukan sertifikasi ISO atau hasil audit independen.