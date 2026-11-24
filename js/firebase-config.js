/*
 * ============================================================
 *  KONFIGURASI FIREBASE — Notifikasi Kehadiran Orang Tua
 * ============================================================
 *  Diisi SEKALI oleh admin sekolah. Lihat PANDUAN_NOTIFIKASI_ORANG_TUA.md bagian B.
 *  Nilai di bawah ini aman berada di repo publik (memang dirancang untuk dipakai di browser).
 *  JANGAN menaruh file kunci Service Account (.json) di sini atau di GitHub.
 *  Selama masih kosong, Portal Orang Tua tetap berjalan, hanya tombol notifikasi yang belum muncul.
 *
 *  config   : Firebase Console → ⚙ Setelan proyek → Umum → Aplikasi Anda → SDK setup and configuration → Config
 *  vapidKey : Firebase Console → ⚙ Setelan proyek → Cloud Messaging → Web configuration → Web Push certificates → Key pair
 */
window.SIPMUR_FIREBASE = {
  config: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
  },
  vapidKey: ''
};
