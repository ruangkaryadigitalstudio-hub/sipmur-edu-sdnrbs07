/*
 * ============================================================
 *  SIPMUR EDU — Portal Orang Tua & Notifikasi Kehadiran (v2.1)
 * ============================================================
 *  - Portal Orang Tua: status kehadiran anak hari ini + riwayat 14 hari.
 *  - Notifikasi push lewat Firebase Cloud Messaging (Android: Chrome; iPhone/iPad: iOS 16.4+ setelah dipasang ke Layar Utama).
 *  - Surat Aktivasi (QR + Kode Orang Tua) untuk dibagikan sekolah.
 *  - Halaman Admin → Notifikasi Orang Tua.
 *  Memakai fungsi global dari app.js ($, esc, ic, api, apiT, toast, modal, konfirmasi, qrSvg, S, A, …).
 */
(function () {
  'use strict';
  const LS = { mode: 'sipedu_ortu', anak: 'sipedu_ortu_anak', token: 'sipedu_ortu_fcm', sig: 'sipedu_ortu_sig', sinkron: 'sipedu_ortu_sinkron' };
  const FB = window.SIPMUR_FIREBASE || {};
  const FB_VERSI = '10.12.2';
  const O = { on: false, data: null, memuat: false, pasang: null };

  // ── Penyimpanan lokal ──
  const baca = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const tulis = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* mode privat */ } };
  function daftarAnak() { try { const a = JSON.parse(baca(LS.anak) || '[]'); return Array.isArray(a) ? a.filter(x => x && x.nisn && x.kode) : []; } catch (e) { return []; } }
  function simpanAnak(a) { tulis(LS.anak, JSON.stringify(a.slice(0, 10))); tulisUrl(); }
  const normKode = k => String(k || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  const tampilKode = k => normKode(k).replace(/^(.{4})(.{4})$/, '$1-$2');
  const sigAnak = () => daftarAnak().map(a => a.nisn).sort().join(',');
  const kirimanAnak = () => daftarAnak().map(a => ({ nisn: a.nisn, kode: a.kode }));

  /** Simpan daftar anak di alamat halaman, supaya iPhone yang memasang dari Safari tetap membawa datanya. */
  function tulisUrl() {
    try {
      const a = daftarAnak();
      const q = a.length ? '?ortu=' + a.map(x => x.nisn + '-' + normKode(x.kode)).join(',') : '?ortu=1';
      history.replaceState(null, '', location.pathname + q);
    } catch (e) { /* abaikan */ }
  }
  /** Ambil anak dari tautan ?ortu=NISN-KODE[,NISN-KODE]. */
  function anakDariUrl() {
    const v = new URLSearchParams(location.search).get('ortu') || '';
    return v.split(',').map(s => /^([A-Za-z0-9]{3,20})-([0-9A-Fa-f]{4}-?[0-9A-Fa-f]{4})$/.exec(s.trim())).filter(Boolean).map(m => ({ nisn: m[1], kode: normKode(m[2]) }));
  }

  // ── Kemampuan perangkat ──
  const fbSiap = () => { const c = FB.config || {}; return !!(c.apiKey && c.projectId && c.messagingSenderId && c.appId && FB.vapidKey); };
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => { try { return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const dukungPush = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  function versiIOS() { const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent); return m ? +m[1] + +m[2] / 100 : null; }
  function namaPerangkat() {
    const u = navigator.userAgent;
    const hp = /iPhone/.test(u) ? 'iPhone' : /iPad|Macintosh/.test(u) && navigator.maxTouchPoints > 1 ? 'iPad' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : 'Perangkat';
    const br = /EdgA?\//.test(u) ? 'Edge' : /SamsungBrowser/.test(u) ? 'Samsung Internet' : /CriOS|Chrome\//.test(u) ? 'Chrome' : /FxiOS|Firefox/.test(u) ? 'Firefox' : /Safari/.test(u) ? 'Safari' : '';
    return hp + (br ? ' · ' + br : '') + (standalone() ? ' (aplikasi)' : '');
  }

  // Tombol "Pasang aplikasi" untuk Android/Chrome
  window.addEventListener('beforeinstallprompt', ev => { ev.preventDefault(); O.pasang = ev; if (Ortu.tampil()) render(); });
  window.addEventListener('appinstalled', () => { O.pasang = null; if (Ortu.tampil()) { toast('Aplikasi terpasang. Buka dari ikon di layar utama.', 'ok'); render(); } });

  // ── Firebase: ambil token perangkat ──
  async function regSw() {
    if (!('serviceWorker' in navigator)) throw new Error('Browser ini tidak mendukung service worker.');
    await navigator.serviceWorker.register('sw.js');
    return navigator.serviceWorker.ready;
  }
  async function ambilToken() {
    const reg = await regSw();
    const base = 'https://www.gstatic.com/firebasejs/' + FB_VERSI + '/';
    const [fa, fm] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-messaging.js')]);
    if (!(await fm.isSupported())) throw new Error('Browser ini belum mendukung notifikasi web.' + (isIOS() ? ' Pastikan iOS 16.4+ dan aplikasi dibuka dari ikon Layar Utama.' : ''));
    const app = fa.getApps().length ? fa.getApp() : fa.initializeApp(FB.config);
    const token = await fm.getToken(fm.getMessaging(app), { vapidKey: FB.vapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error('Token notifikasi tidak diperoleh. Coba lagi.');
    return token;
  }
  async function daftarkan(token) {
    const r = await api('apiOrtuDaftar', { anak: kirimanAnak(), token: token, perangkat: namaPerangkat() });
    if (!r.success) throw new Error(r.message);
    tulis(LS.token, token); tulis(LS.sig, sigAnak()); tulis(LS.sinkron, String(Date.now()));
    return r;
  }
  const notifAktif = () => dukungPush() && Notification.permission === 'granted' && !!baca(LS.token);

  /** Saat portal dibuka: perbarui pendaftaran diam-diam bila token berubah, daftar anak berubah, atau sudah 7 hari. */
  async function sinkronDiam() {
    if (!fbSiap() || !dukungPush() || Notification.permission !== 'granted' || !daftarAnak().length || !baca(LS.token)) return;
    if (isIOS() && !standalone()) return;
    try {
      const t = await ambilToken();
      const lama = +(baca(LS.sinkron) || 0);
      if (t !== baca(LS.token) || baca(LS.sig) !== sigAnak() || Date.now() - lama > 7 * 864e5) await daftarkan(t);
    } catch (e) { /* diam: dicoba lagi saat dibuka berikutnya */ }
  }

  // ── Aksi ──
  async function aktifkan(btn) {
    if (!fbSiap()) { toast('Sekolah belum menyiapkan notifikasi (konfigurasi Firebase kosong).', 'err'); return; }
    if (!daftarAnak().length) { toast('Tambahkan data anak dahulu.', 'err'); return; }
    let izin = Notification.permission;
    if (izin !== 'granted') { try { izin = await Notification.requestPermission(); } catch (e) { izin = 'denied'; } }
    if (izin !== 'granted') { toast('Izin notifikasi belum diberikan.', 'err'); render(); return; }
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Mengaktifkan…'; }
    try {
      const r = await daftarkan(await ambilToken());
      toast(r.message, 'ok');
      if (r.data && r.data.notifSiap === false) toast('Catatan: sekolah belum menyalakan pengiriman notifikasi. Notifikasi akan masuk setelah diaktifkan sekolah.', 'warn');
    } catch (e) { toast('Gagal mengaktifkan notifikasi: ' + e.message, 'err'); }
    render();
  }
  async function matikan() {
    if (!await konfirmasi({ title: 'Matikan notifikasi?', msg: 'HP ini tidak akan menerima pemberitahuan kehadiran lagi. Data anak tetap tersimpan dan bisa diaktifkan kembali kapan saja.', ok: 'Matikan', danger: true })) return;
    const t = baca(LS.token);
    if (t) { const r = await api('apiOrtuBerhenti', { token: t }); if (!r.success) { toast(r.message, 'err'); return; } }
    try { const reg = await navigator.serviceWorker.getRegistration(); const sub = reg && await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); } catch (e) { /* abaikan */ }
    tulis(LS.token, null); tulis(LS.sig, null);
    toast('Notifikasi di HP ini dimatikan.', 'ok'); render();
  }
  async function perbaruiPendaftaran() {
    if (!notifAktif()) return;
    try {
      if (daftarAnak().length) await daftarkan(await ambilToken());
      else { await api('apiOrtuBerhenti', { token: baca(LS.token) }); tulis(LS.token, null); tulis(LS.sig, null); }
    } catch (e) { toast('Pendaftaran notifikasi belum diperbarui: ' + e.message, 'err'); }
  }
  function formTambah(awal) {
    awal = awal || {};
    modal({
      title: 'Tambah Anak', ok: 'Tambahkan',
      body: '<div class="banner info mb">' + ic('mail') + '<div>NISN dan <b>Kode Orang Tua</b> tertulis di <b>Surat Aktivasi</b> dari sekolah. Hubungi wali kelas bila belum menerimanya.</div></div>' +
        '<label class="f" for="oa-nisn">NISN / ID murid</label><input class="inp" id="oa-nisn" name="nisn" autocapitalize="characters" spellcheck="false" autocomplete="off" value="' + esc(awal.nisn || '') + '" placeholder="Contoh: 0123456789 atau SM2026001" required>' +
        '<label class="f" for="oa-kode">Kode Orang Tua (8 karakter)</label><input class="inp ortu-kode-inp" id="oa-kode" name="kode" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" value="' + esc(awal.kode ? tampilKode(awal.kode) : '') + '" placeholder="XXXX-XXXX" required>' +
        '<div class="hint">Huruf A–F dan angka 0–9. Tanda hubung boleh diketik atau tidak.</div>',
      onOk: async f => {
        const nisn = f.nisn.value.trim().toUpperCase(), kode = normKode(f.kode.value);
        if (!nisn || kode.length !== 8) { toast('Isi NISN dan Kode Orang Tua (8 karakter).', 'err'); return false; }
        const a = daftarAnak();
        if (a.some(x => x.nisn === nisn)) { toast('Anak ini sudah ada di daftar.', 'err'); return false; }
        if (a.length >= 10) { toast('Maksimal 10 anak per HP.', 'err'); return false; }
        const r = await api('apiOrtuStatus', { anak: [{ nisn: nisn, kode: kode }] });
        const d = r.success && r.data.anak[0];
        if (!r.success || !d || d.galat) { toast((d && d.galat) || r.message, 'err'); return false; }
        a.push({ nisn: nisn, kode: kode, nama: d.nama, kelas: d.kelas });
        simpanAnak(a); tutupModal();
        toast(d.nama + ' ditambahkan.', 'ok');
        await perbaruiPendaftaran();
        muat();
      }
    });
  }
  async function hapusAnak(nisn) {
    const a = daftarAnak(), x = a.find(y => y.nisn === nisn);
    if (!x || !await konfirmasi({ title: 'Hapus ' + (x.nama || nisn) + '?', msg: 'Data anak ini dihapus dari HP ini dan notifikasinya berhenti. Anda dapat menambahkannya lagi dengan Kode Orang Tua.', ok: 'Hapus', danger: true })) return;
    simpanAnak(a.filter(y => y.nisn !== nisn));
    if (O.data) O.data.anak = (O.data.anak || []).filter(y => y.nisn !== nisn);
    await perbaruiPendaftaran();
    render();
  }

  // ── Data ──
  async function muat() {
    const a = daftarAnak();
    if (!a.length) { O.data = null; render(); return; }
    O.memuat = true; render();
    const r = await api('apiOrtuStatus', { anak: kirimanAnak() });
    O.memuat = false;
    if (!Ortu.tampil()) return;
    if (!r.success) { toast(r.message, 'err'); render(); return; }
    O.data = r.data;
    let ubah = false, pindah = false;
    r.data.anak.forEach(d => {
      if (!d.nisnLama) return; // ID sementara/NISN lama sudah diganti sekolah: simpan NISN & kode baru
      const x = a.find(y => y.nisn === d.nisnLama);
      if (x) { x.nisn = d.nisn; x.kode = d.kodeBaru; ubah = pindah = true; }
    });
    r.data.anak.forEach(d => { const x = a.find(y => y.nisn === d.nisn); if (x && d.nama && (x.nama !== d.nama || x.kelas !== d.kelas)) { x.nama = d.nama; x.kelas = d.kelas; ubah = true; } });
    if (ubah) simpanAnak(a);
    if (pindah) perbaruiPendaftaran();
    render();
  }

  // ── Tampilan ──
  const JENIS = {
    tepat: { c: 'ok', i: 'check_circle', t: 'Hadir tepat waktu' }, terlambat: { c: 'warn', i: 'schedule', t: 'Hadir terlambat' },
    sakit: { c: 's', i: 'medical_services', t: 'Sakit' }, izin: { c: 'i', i: 'event_busy', t: 'Izin' }, alpa: { c: 'a', i: 'cancel', t: 'Alpa' },
    belum: { c: 'nil', i: 'hourglass_empty', t: 'Belum scan' }, kosong: { c: 'nil', i: 'remove', t: 'Tidak ada data' }, libur: { c: 'off', i: 'beach_access', t: 'Libur' }
  };
  const jamT = j => String(j || '').replace(':', '.');
  function statusBesar(h, shift) {
    const J = JENIS[h.jenis] || JENIS.kosong;
    let judul = J.t, sub = '';
    if (h.jenis === 'tepat') { judul = 'Sudah tiba di sekolah'; sub = 'Pukul ' + jamT(h.jam) + ' WIB · tepat waktu'; }
    else if (h.jenis === 'terlambat') { judul = 'Sudah tiba di sekolah'; sub = 'Pukul ' + jamT(h.jam) + ' WIB · terlambat ' + h.telat + ' menit'; }
    else if (h.jenis === 'sakit' || h.jenis === 'izin' || h.jenis === 'alpa') { judul = 'Tercatat ' + J.t; sub = h.ket ? 'Keterangan: ' + h.ket : 'Dicatat oleh sekolah'; }
    else if (h.jenis === 'belum') {
      const a = O.data && O.data.aturan && O.data.aturan[shift];
      judul = 'Belum scan kartu hari ini'; sub = a ? 'Jam masuk shift ' + shift + ': ' + jamT(a.buka) + '–' + jamT(a.batas) + ' WIB' : '';
    } else if (h.jenis === 'libur') { judul = 'Hari libur'; sub = h.ket || ''; }
    return '<div class="ortu-st j-' + J.c + '"><span class="ms fill">' + J.i + '</span><div><b>' + esc(judul) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div></div>';
  }
  function riwayat(hari) {
    const urut = hari.slice().reverse();
    return '<div class="ortu-riw" role="list">' + urut.map(h => {
      const J = JENIS[h.jenis] || JENIS.kosong, d = new Date(h.tanggal + 'T00:00:00Z');
      const label = fTgl(h.tanggal) + ': ' + J.t + (h.jam ? ' (' + jamT(h.jam) + ')' : '') + (h.ket ? ' — ' + h.ket : '');
      return '<div class="ortu-hr j-' + J.c + '" role="listitem" title="' + esc(label) + '" aria-label="' + esc(label) + '"><i></i><span>' + d.getUTCDate() + '</span></div>';
    }).join('') + '</div>';
  }
  function kartuAnak(d) {
    if (d.galat) {
      return '<div class="card ortu-anak"><div class="row between"><b>NISN ' + esc(d.nisn) + '</b><button class="btn ghost sm" data-act="ortuhapus" data-n="' + esc(d.nisn) + '">' + ic('delete', 'sm') + 'Hapus</button></div><div class="banner err mt">' + ic('error') + '<div>' + esc(d.galat) + '</div></div></div>';
    }
    const r = d.ringkas || {};
    return '<div class="card ortu-anak"><div class="row between"><div class="grow"><div class="ortu-nm">' + esc(d.nama) + '</div><div class="small muted">Kelas ' + esc(d.kelas) + ' · Shift ' + esc(d.shift) + ' · ' + (d.sementara ? 'ID ' : 'NISN ') + esc(d.nisn) + '</div></div>' +
      '<button class="iconbtn" data-act="ortuhapus" data-n="' + esc(d.nisn) + '" aria-label="Hapus ' + esc(d.nama) + ' dari HP ini">' + ic('person_remove') + '</button></div>' +
      statusBesar(d.hariIni || { jenis: 'kosong' }, d.shift) +
      '<div class="small muted mt" style="margin-bottom:6px">14 hari terakhir</div>' + riwayat(d.hari || []) +
      '<div class="ortu-ring"><span class="chip ok">Hadir ' + (r.hadir || 0) + '</span><span class="chip warn">Terlambat ' + (r.terlambat || 0) + '</span><span class="chip s">Sakit ' + (r.S || 0) + '</span><span class="chip i">Izin ' + (r.I || 0) + '</span><span class="chip a">Alpa ' + (r.A || 0) + '</span></div></div>';
  }
  function kartuNotif() {
    const a = daftarAnak();
    if (!a.length) return '';
    const sekolahSiap = !O.data || O.data.notifSiap !== false;
    if (!fbSiap()) return '<div class="banner info">' + ic('notifications_off') + '<div>Notifikasi kehadiran belum disiapkan oleh sekolah. Status anak tetap bisa dilihat di halaman ini.</div></div>';
    if (isIOS() && !standalone()) {
      const v = versiIOS();
      if (v && v < 16.4) return '<div class="banner">' + ic('system_update') + '<div>Notifikasi di iPhone/iPad memerlukan <b>iOS 16.4 atau lebih baru</b>. Perbarui iOS di Pengaturan → Umum → Pembaruan Perangkat Lunak.</div></div>';
      return '<div class="card ortu-ios"><h3>' + ic('ios_share') + ' Pasang dulu agar notifikasi bisa masuk</h3><ol>' +
        '<li>Ketuk tombol <b>Bagikan</b> <span class="ms">ios_share</span> di Safari (bawah layar / pojok kanan atas).</li>' +
        '<li>Pilih <b>Tambahkan ke Layar Utama</b> (Add to Home Screen), lalu ketuk <b>Tambah</b>.</li>' +
        '<li>Tutup Safari, buka <b>SIPMUR EDU</b> dari ikon di layar utama, lalu ketuk <b>Aktifkan Notifikasi</b>.</li></ol>' +
        '<div class="small muted">Harus memakai Safari. Bila setelah dibuka dari ikon data anak kosong, ketuk <b>Tambah Anak</b> dan masukkan NISN + Kode Orang Tua lagi.</div></div>';
    }
    if (!dukungPush()) return '<div class="banner">' + ic('notifications_off') + '<div>Browser ini tidak mendukung notifikasi. Di Android gunakan <b>Google Chrome</b>; di iPhone gunakan <b>Safari</b> lalu pasang ke Layar Utama.</div></div>';
    if (Notification.permission === 'denied') {
      return '<div class="banner err">' + ic('notifications_off') + '<div><b>Notifikasi diblokir.</b> ' + (isIOS() ? 'Buka Pengaturan iPhone → Notifikasi → SIPMUR EDU → nyalakan Izinkan Notifikasi, lalu buka aplikasi ini lagi.' : 'Ketuk ikon gembok/pengaturan di samping alamat (atau tekan lama ikon aplikasi → Info aplikasi) → Notifikasi → Izinkan, lalu muat ulang.') + '</div></div>';
    }
    if (notifAktif()) {
      return '<div class="card ortu-notif on"><div class="row"><span class="ms fill ortu-bel">notifications_active</span><div class="grow"><b>Notifikasi aktif di HP ini</b><div class="small muted">Anda akan diberi tahu saat anak tiba di sekolah, serta bila tercatat Sakit, Izin, atau Alpa.' + (sekolahSiap ? '' : ' <b>Pengiriman dari sekolah sedang dinonaktifkan.</b>') + '</div></div></div>' +
        '<button class="btn ghost sm mt" data-act="ortumati">' + ic('notifications_off', 'sm') + 'Matikan notifikasi</button></div>';
    }
    return '<div class="card ortu-notif"><div class="row"><span class="ms fill ortu-bel">notifications</span><div class="grow"><b>Dapatkan pemberitahuan kehadiran</b><div class="small muted">Muncul di HP setiap kali anak scan kartu di sekolah, tanpa WhatsApp dan tanpa biaya.</div></div></div>' +
      '<button class="btn block accent mt" data-act="ortuaktif">' + ic('notifications_active', 'sm') + 'Aktifkan Notifikasi</button>' +
      '<div class="small muted mt">Setelah menekan tombol, pilih <b>Izinkan</b> pada pertanyaan yang muncul.</div></div>';
  }
  function kartuPasang() {
    if (standalone() || !O.pasang) return '';
    return '<div class="card ortu-notif"><div class="row"><span class="ms fill ortu-bel">install_mobile</span><div class="grow"><b>Pasang aplikasi di HP</b><div class="small muted">Agar bisa dibuka dari layar utama seperti aplikasi biasa.</div></div></div><button class="btn block mt" data-act="ortupasang">' + ic('download', 'sm') + 'Pasang Aplikasi</button></div>';
  }
  function render() {
    if (!Ortu.tampil()) return;
    const p = S.pub || {}, a = daftarAnak(), d = O.data;
    const isi = a.length
      ? (d ? d.anak.map(kartuAnak).join('') : a.map(() => '<div class="card"><div class="sk h"></div><div class="sk l"></div></div>').join(''))
      : '<div class="card ortu-kosong"><span class="ms fill">family_restroom</span><h2>Selamat datang, Bapak/Ibu</h2><p class="muted">Pantau kehadiran anak di sekolah dan terima pemberitahuan langsung di HP. Siapkan <b>Surat Aktivasi</b> dari sekolah yang berisi NISN dan Kode Orang Tua.</p>' +
        '<button class="btn block accent" data-act="ortutambah">' + ic('person_add', 'sm') + 'Tambah Data Anak</button><div class="small muted mt">Punya QR di surat? Cukup scan QR tersebut dengan kamera HP.</div></div>';
    $('#app-container').innerHTML = '<div class="ortu">' +
      '<header class="ortu-hd"><div class="ortu-logo">' + (p.logo ? '<img src="' + esc(p.logo) + '" alt="">' : ic('school')) + '</div><div class="grow"><b>Portal Orang Tua</b><span>' + esc(p.nama || '') + '</span></div>' +
      (a.length ? '<button class="iconbtn" data-act="ortumuat" aria-label="Muat ulang">' + (O.memuat ? '<span class="spin"></span>' : ic('refresh')) + '</button>' : '') + '</header>' +
      '<main class="ortu-main">' + (d ? '<div class="small muted">' + esc(fTgl(d.tanggal)) + '</div>' : '') + kartuNotif() + isi +
      (a.length && a.length < 10 ? '<button class="btn ghost block" data-act="ortutambah">' + ic('person_add', 'sm') + 'Tambah anak lain</button>' : '') + kartuPasang() +
      '<div class="ortu-ft"><button class="btn ghost sm" data-act="ortukeluar">' + ic('badge', 'sm') + 'Masuk sebagai Guru / Staf</button><div>' + esc(p.app || 'SIPMUR EDU') + ' · ' + esc(p.nama || '') + '</div></div></main></div>';
  }

  // ── Aksi klik (didaftarkan ke objek A milik app.js) ──
  Object.assign(A, {
    keortu: () => { tulis(LS.mode, '1'); Ortu.mulai(); },
    ortukeluar: () => { O.on = false; tulis(LS.mode, '0'); try { history.replaceState(null, '', location.pathname); } catch (e) { /* abaikan */ } O.data = null; init(); },
    ortutambah: () => formTambah(),
    ortuhapus: el => hapusAnak(el.dataset.n),
    ortumuat: () => muat(),
    ortuaktif: el => aktifkan(el),
    ortumati: () => matikan(),
    ortupasang: async () => { if (!O.pasang) return; O.pasang.prompt(); try { await O.pasang.userChoice; } catch (e) { /* abaikan */ } O.pasang = null; render(); },
    ortusurat: () => suratDialog($('#qk-kelas') ? $('#qk-kelas').value : ''),
    ortusuratadm: () => suratCetak(($('#on-kelas') || {}).value || ''),
    ortusimpan: () => adminSimpan(),
    ortuuji: () => adminUji(),
    ortutrigger: async () => { const r = await apiT('apiPasangTrigger', true); toast(r.message, r.success ? 'ok' : 'err'); if (r.success) go('admin', { sub: 'ortu' }); },
    ortusakelar: async el => { const r = await apiT('apiOrtuSimpanKunci', { aktif: el.dataset.on === '1' }); toast(r.message, r.success ? 'ok' : 'err'); if (r.success) go('admin', { sub: 'ortu' }); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Ortu.tampil() && daftarAnak().length && !O.memuat) muat(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', ev => { if (ev.data && ev.data.tipe === 'notif' && Ortu.tampil()) muat(); });

  // ── Surat Aktivasi (dicetak sekolah) ──
  function urlSitus() { return location.origin + location.pathname.replace(/index\.html$/, ''); }
  function suratDialog(kelasId) {
    if (!kelasId) { toast('Pilih satu kelas dulu untuk mencetak Surat Aktivasi.', 'err'); return; }
    suratCetak(kelasId);
  }
  async function suratCetak(kelasId) {
    if (!kelasId) { toast('Pilih kelas.', 'err'); return; }
    const r = await apiT('apiOrtuKodeKelas', { kelasId: kelasId });
    if (!r.success) { toast(r.message, 'err'); return; }
    const d = r.data, n = d.murid.length;
    if (!n) { toast('Tidak ada murid di kelas ini.', 'err'); return; }
    if (!await konfirmasi({ title: 'Cetak ' + n + ' Surat Aktivasi?', html: 'Dua surat per lembar A4 (±' + Math.ceil(n / 2) + ' lembar). Gunting di garis putus-putus, lalu bagikan ke orang tua.<br><br><b>Kode Orang Tua bersifat rahasia</b>: siapa pun yang memegangnya dapat melihat kehadiran murid tersebut.', ok: 'Cetak' })) return;
    const url = urlSitus(), sek = d.sekolah;
    let root = $('#print-root'); if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
    root.innerHTML = '<div class="surat-wrap">' + d.murid.map(m => {
      const tautan = url + '?ortu=' + encodeURIComponent(m.nisn) + '-' + m.kode;
      return '<section class="surat"><div class="sh"><div class="sl' + (S.pub.logo ? '' : ' x') + '">' + (S.pub.logo ? '<img src="' + esc(S.pub.logo) + '" alt="">' : '') + '</div><div><b>' + esc(sek.nama) + '</b><span>Surat Aktivasi Notifikasi Kehadiran · ' + esc(sek.app || 'SIPMUR EDU') + (sek.tahunAjaran ? ' · TA ' + esc(sek.tahunAjaran) : '') + '</span></div></div>' +
        '<div class="sb"><div class="si"><p>Kepada Yth. Orang Tua/Wali dari:</p><table><tr><td>Nama</td><td><b>' + esc(m.nama) + '</b></td></tr><tr><td>Kelas</td><td>' + esc(m.kelas) + '</td></tr><tr><td>' + (m.sementara ? 'ID Murid' : 'NISN') + '</td><td><b>' + esc(m.nisn) + '</b>' + (m.sementara ? ' <small>(sementara)</small>' : '') + '</td></tr></table>' +
        '<div class="sk2"><small>KODE ORANG TUA</small><strong>' + tampilKode(m.kode) + '</strong></div>' +
        '<ol><li><b>Scan QR</b> di samping dengan kamera HP (atau buka <u>' + esc(url.replace(/^https?:\/\//, '')) + '</u>, pilih <b>Portal Orang Tua</b>, lalu isi NISN dan kode).</li>' +
        '<li><b>Pasang aplikasi</b>. Android (Chrome): menu ⋮ → <i>Instal aplikasi</i>. iPhone (Safari): <i>Bagikan</i> → <i>Tambahkan ke Layar Utama</i>.</li>' +
        '<li>Buka aplikasi dari ikon di layar utama, ketuk <b>Aktifkan Notifikasi</b>, lalu pilih <b>Izinkan</b>.</li></ol></div>' +
        '<div class="sq">' + qrSvg(tautan) + '<small>Scan untuk mendaftar</small></div></div>' +
        '<div class="sf">Kode ini rahasia, khusus orang tua/wali murid di atas. Notifikasi gratis, tanpa WhatsApp. iPhone memerlukan iOS 16.4 atau lebih baru.</div></section>';
    }).join('') + '</div>';
    document.body.classList.add('print-surat');
    const selesai = () => { document.body.classList.remove('print-surat'); root.innerHTML = ''; window.removeEventListener('afterprint', selesai); };
    window.addEventListener('afterprint', selesai);
    setTimeout(() => { try { window.print(); } catch (e) { selesai(); toast('Pencetakan tidak tersedia di tampilan ini.', 'err'); } }, 250);
  }

  // ── Halaman Admin → Notifikasi Orang Tua ──
  async function aOrtu(rid) {
    const r = await apiT('apiOrtuRingkas');
    if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
    const d = r.data, fb = d.firebase, web = fbSiap();
    const opsi = kelasInput();
    const cek = (ok, teks, aksi) => '<div class="ortu-cek ' + (ok ? 'ok' : 'no') + '"><span class="ms fill">' + (ok ? 'check_circle' : 'radio_button_unchecked') + '</span><div class="grow">' + teks + '</div>' + (aksi || '') + '</div>';
    const siapSemua = fb.siap && web && d.trigger && d.aktif;
    const ST = { terkirim: 'ok', gagal: 'err', antre: 'warn', lewati: '' };
    halaman(admHead('Notifikasi Orang Tua') +
      '<div class="banner ' + (siapSemua ? 'ok' : 'info') + ' mb">' + ic(siapSemua ? 'check_circle' : 'info', 'fill') + '<div>' + (siapSemua ? '<b>Notifikasi orang tua berjalan.</b> Orang tua menerima pemberitahuan ±1 menit setelah anak scan kartu, dan saat tercatat Sakit/Izin/Alpa.' : 'Ikuti 4 langkah di bawah sampai semuanya bercentang. Panduan lengkap ada di file <b>PANDUAN_NOTIFIKASI_ORANG_TUA</b>.') + '</div></div>' +
      '<div class="grid gr2"><div class="card"><h3>Langkah penyiapan</h3>' +
        cek(fb.siap, '<b>1. Kunci Firebase (Service Account)</b><div class="small muted">' + (fb.siap ? 'Proyek <b>' + esc(fb.projectId) + '</b>' : 'Belum disimpan. Tempel isi file .json di bawah.') + '</div>') +
        cek(web, '<b>2. Konfigurasi web</b><div class="small muted">' + (web ? 'File <code>js/firebase-config.js</code> sudah terisi.' : 'Isi <code>js/firebase-config.js</code> di repo GitHub, lalu push.') + '</div>') +
        cek(!!d.trigger, '<b>3. Pengirim otomatis (trigger)</b><div class="small muted">' + (d.trigger ? 'Terpasang, berjalan tiap menit.' : 'Belum terpasang.') + '</div>', d.trigger ? '' : '<button class="btn sm" data-act="ortutrigger">Pasang</button>') +
        cek(d.aktif, '<b>4. Pengiriman diaktifkan</b><div class="small muted">' + (d.aktif ? 'Aktif.' : 'Sedang dimatikan.') + '</div>', '<button class="btn ghost sm" data-act="ortusakelar" data-on="' + (d.aktif ? '0' : '1') + '">' + (d.aktif ? 'Matikan' : 'Nyalakan') + '</button>') +
        '<label class="f" for="on-sa">' + (fb.siap ? 'Ganti kunci Service Account (opsional)' : 'Kunci Service Account Firebase (.json)') + '</label><textarea class="inp" id="on-sa" rows="4" spellcheck="false" autocomplete="off" placeholder="{ &quot;type&quot;: &quot;service_account&quot;, &quot;project_id&quot;: … }"></textarea>' +
        '<div class="hint">Firebase Console → ⚙ Setelan proyek → Akun layanan → <b>Buat kunci pribadi baru</b>. Buka file .json yang terunduh dengan Notepad, salin semua, tempel di sini. Kunci disimpan di Script Properties (tidak terlihat di Spreadsheet).</div>' +
        '<button class="btn block mt" data-act="ortusimpan">' + ic('key', 'sm') + 'Simpan &amp; Uji Kunci</button></div>' +
      '<div class="col"><div class="card"><h3>Ringkasan</h3><div class="grid gr2">' +
        '<div class="stat"><span class="n">' + d.murid + '<small class="muted" style="font-size:13px"> / ' + d.totalMurid + '</small></span><span class="l">Murid terhubung</span></div>' +
        '<div class="stat"><span class="n">' + d.perangkat + '</span><span class="l">HP orang tua</span></div>' +
        '<div class="stat"><span class="n" style="color:var(--ok)">' + d.hariIni.terkirim + '</span><span class="l">Terkirim hari ini</span></div>' +
        '<div class="stat"><span class="n" style="color:' + (d.hariIni.gagal ? 'var(--err)' : 'inherit') + '">' + d.hariIni.gagal + '</span><span class="l">Gagal hari ini' + (d.antre ? ' · ' + d.antre + ' antre' : '') + '</span></div></div></div>' +
      '<div class="card"><h3>Surat Aktivasi</h3><div class="small muted">Cetak per kelas, lalu bagikan ke orang tua. Berisi QR dan Kode Orang Tua.</div><label class="f" for="on-kelas">Kelas</label><select class="inp" id="on-kelas">' + opsiKelasHtml(opsi, opsi.length ? opsi[0].id : '') + '</select>' +
        '<button class="btn block mt" data-act="ortusuratadm">' + ic('print', 'sm') + 'Cetak Surat Aktivasi</button></div>' +
      '<div class="card"><h3>Uji kirim</h3><div class="small muted">Kirim notifikasi uji ke HP orang tua yang sudah mendaftar.</div><div class="row mt"><input class="inp grow" id="on-uji" inputmode="numeric" placeholder="NISN murid" autocomplete="off"><button class="btn" data-act="ortuuji">' + ic('send', 'sm') + 'Kirim</button></div></div></div></div>' +
      '<div class="card mt"><h3>Notifikasi terakhir</h3>' + (d.terakhir.length ? '<div class="scrollx"><table class="tb"><thead><tr><th>Waktu</th><th>Pesan</th><th>Status</th></tr></thead><tbody>' +
        d.terakhir.map(x => '<tr><td class="small" style="white-space:nowrap">' + esc(String(x.waktu).substr(5, 11)) + '</td><td>' + esc(x.judul) + '<div class="small muted">NISN ' + esc(x.nisn) + '</div></td><td><span class="chip ' + (ST[x.status] || '') + '">' + esc(x.status) + '</span><div class="small muted">' + esc(x.ket) + '</div></td></tr>').join('') +
        '</tbody></table></div>' : '<div class="empty">' + ic('notifications_none') + 'Belum ada notifikasi.</div>') + '</div>', rid);
  }
  async function adminSimpan() {
    const v = ($('#on-sa') || {}).value || '';
    if (!v.trim()) { toast('Tempel isi file Service Account (.json) terlebih dahulu.', 'err'); return; }
    const r = await apiT('apiOrtuSimpanKunci', { json: v });
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) go('admin', { sub: 'ortu' });
  }
  async function adminUji() {
    const n = (($('#on-uji') || {}).value || '').trim();
    if (!n) { toast('Isi NISN murid.', 'err'); return; }
    const r = await apiT('apiOrtuUji', n);
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) go('admin', { sub: 'ortu' });
  }
  window.aOrtu = aOrtu;

  // ── API untuk app.js ──
  const Ortu = {
    aktif() { const q = new URLSearchParams(location.search); return q.has('ortu') || baca(LS.mode) === '1'; },
    tampil() { return O.on; },
    mulai() {
      O.on = true; tulis(LS.mode, '1');
      const dariUrl = anakDariUrl(), a = daftarAnak();
      dariUrl.forEach(x => { if (!a.some(y => y.nisn === x.nisn)) a.push(x); });
      simpanAnak(a);
      O.data = null; render(); muat().then(sinkronDiam);
    }
  };
  window.Ortu = Ortu;
})();
