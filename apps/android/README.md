# Android client (native)

Target: Kotlin + Jetpack Compose, Room/SQLite FTS untuk cache dan knowledge pack lokal, WorkManager untuk sinkronisasi yang dapat dilanjutkan, Android Keystore untuk kunci lokal, serta API HTTPS yang dikendalikan operator.

## Offline-first
- Cache hanya data minimum yang diizinkan; antrekan perubahan dengan idempotency key dan status queued/synced/conflict.
- Paket hukum harus memuat manifest, versi, hash, tanggal berlaku, sumber dan status verifikasi.
- Pilih model AI lokal berdasarkan lisensi, ukuran, RAM, ABI dan benchmark perangkat. Jangan mengklaim AI offline sebelum runtime dan model dibundel serta diuji.
- Paket pembaruan harus diverifikasi, dikarantina, direview, lalu diaktifkan.

Status: spesifikasi awal, bukan APK siap instalasi. Build Kotlin, model lokal, signing key, dan uji perangkat masih diperlukan.