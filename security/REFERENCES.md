# Sumber literasi dan pemetaan pertahanan

Korpus ini dibangun secara bertahap; tidak realistis atau legal untuk mengklaim seluruh isi internet telah diunduh dan ditanamkan. Setiap dokumen harus punya asal, versi, tanggal akses, hash, lisensi, tanggal berlaku, dan status review. Konten dari penyerang digunakan untuk memahami TTP dan mitigasi, bukan untuk menjalankan serangan terhadap pihak lain.

## Referensi keamanan utama
- OWASP Application Security Verification Standard (ASVS): https://asvs.owasp.org/ — persyaratan verifikasi aplikasi web; stable release yang dirujuk pada saat pencatatan adalah ASVS 5.0.0.
- OWASP API Security Top 10 2023: https://api-security.owasp.org/editions/2023/en/0x11-t10/ — termasuk broken object-level authorization, broken authentication, SSRF, dan konfigurasi keamanan.
- MITRE ATT&CK: https://attack.mitre.org/ — basis pengetahuan perilaku adversary berdasarkan observasi dunia nyata, untuk memetakan deteksi dan mitigasi.
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework — tata kelola dan pengelolaan risiko keamanan siber.
- OWASP MASVS: https://mas.owasp.org/MASVS/ — perlu dipetakan untuk aplikasi Android sebelum rilis.
- NIST Secure Software Development Framework (SSDF): https://csrc.nist.gov/Projects/ssdf — perlu dimasukkan ke pipeline pengembangan.

## Regulasi dan tata kelola Indonesia
- Portal Peraturan BPK: https://peraturan.bpk.go.id/
- Portal Peraturan Pemerintah: https://peraturan.go.id/
- Otoritas Jasa Keuangan: https://www.ojk.go.id/
- JDIH OJK: https://jdih.ojk.go.id/
- UU 40/2014 tentang Perasuransian; telaah perubahan melalui UU 4/2023 tentang P2SK.
- UU 27/2022 tentang Pelindungan Data Pribadi.
- Peraturan OJK terkait penyelenggaraan usaha perasuransian, tata kelola, manajemen risiko, kesehatan keuangan, pelaporan, perlindungan konsumen, produk dan pemasaran; daftar final harus dipetakan menurut jenis badan usaha dan aktivitas berizin.
- Ketentuan pajak, ketenagakerjaan, pembukuan, tanda tangan elektronik, transaksi elektronik, arsip dan penyelesaian sengketa sesuai ruang lingkup produk.

## Standar internasional
- IAIS Insurance Core Principles: https://www.iais.org/
- ISO/IEC 27001 (keamanan informasi), ISO/IEC 42001 (sistem manajemen AI), ISO 31000 (manajemen risiko): https://www.iso.org/
- ISO merupakan standar berhak cipta. Jangan menyimpan atau menyebarkan salinan standar penuh tanpa hak; simpan metadata, pemetaan kontrol, dan materi berlisensi.

## Proses ingestion
1. Ambil dokumen dari penerbit/portal resmi; catat waktu, URL, versi, hash SHA-256, lisensi, yurisdiksi, dan tanggal efektif.
2. Parse dokumen; simpan halaman/pasal dan teks asli. Jangan hanya mengandalkan ringkasan AI.
3. Bandingkan dengan versi sebelumnya dan identifikasi pencabutan/perubahan.
4. Verifikasi dua tahap oleh reviewer hukum/kepatuhan; status awal selalu `queued`/belum terverifikasi.
5. Bangun paket offline bertanda tangan; hanya paket terverifikasi yang dipublikasikan.
6. AI harus mengutip sumber dan menunjukkan keterbatasan, yurisdiksi, dan tanggal pengetahuan.

Tidak ada sertifikasi atau opini hukum yang otomatis diberikan oleh keberadaan referensi ini.
