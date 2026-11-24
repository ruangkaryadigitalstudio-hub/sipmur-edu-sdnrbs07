/* ============================================================
   SIPMUR EDU — Frontend (SPA). Seluruh navigasi di sisi klien.
   ============================================================ */
'use strict';

// ── State global ──
const S = {
  token: null, user: null, boot: null, pub: { nama: '', app: 'SIPMUR EDU', appFull: 'Sistem Informasi Presensi Murid', tagline: 'Satu Data, Tertib Presensi, Terpantau Setiap Hari.', logo: '', pattern: '', marquee: null },
  route: 'beranda', params: {}, rid: 0, charts: [], loads: 0,
  tgl: null, rekap: { tab: 'rekap', dari: '', sampai: '', kelasId: '' },
  inp: null, piketShift: 'Semua', piketPilih: {}, adm: {}
};

// ── Utilitas dasar ──
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c) => '<span class="ms ' + (c || '') + '" aria-hidden="true">' + n + '</span>';
const HR = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BL = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function todayStr() { return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); }
function pD(s) { const p = String(s).split('-').map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])); }
function addD(s, n) { const d = pD(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().substr(0, 10); }
function fTgl(s) { if (!s) return '-'; const d = pD(s); return HR[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BL[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
function fTglPendek(s) { const d = pD(s); return d.getUTCDate() + ' ' + BL[d.getUTCMonth()]; }
function pct(v) { return v === null || v === undefined ? '–' : (Math.round(v * 10) / 10) + '%'; }
function inisial(n) { return String(n || '?').trim().split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
function debounce(fn, ms) { let t; return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); }; }

// ── Loading bar & toast ──
function loadBar(delta) {
  S.loads = Math.max(0, S.loads + delta);
  const b = $('#loadbar'); if (!b) return;
  if (S.loads > 0) { b.style.opacity = 1; b.style.width = '70%'; }
  else { b.style.width = '100%'; setTimeout(() => { if (!S.loads) { b.style.opacity = 0; b.style.width = '0'; } }, 250); }
}
function toast(msg, tipe) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (tipe || '');
  el.setAttribute('role', 'status');
  el.innerHTML = ic(tipe === 'err' ? 'error' : tipe === 'ok' ? 'check_circle' : 'info', 'sm') + '<div>' + esc(msg) + '</div>';
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = 0; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, tipe === 'err' ? 5000 : 3200);
}

// ── Pemanggil API (GAS-PRO-API: fetch → Google Apps Script → JSON) ──
// Content-Type WAJIB text/plain agar browser tidak mengirim preflight OPTIONS (ditolak GAS) → bebas CORS.
// Pesan kegagalan jaringan selalu diawali "Koneksi" (dipakai antrean scan QR untuk mencoba ulang otomatis).
const GAS_URL = String((window.SIPMUR_CONFIG || {}).GAS_URL || '').trim();
const API_BATAS_MS = 120000;
function gasSiap() { return GAS_URL.indexOf('GANTI_') < 0 && /^https:\/\/script\.google\.com\/.+\/exec$/.test(GAS_URL); }
function api(fn) {
  const args = Array.prototype.slice.call(arguments, 1);
  if (!gasSiap()) return Promise.resolve({ success: false, message: 'Alamat backend (GAS_URL) belum diisi dengan benar di js/config.js.' });
  loadBar(1);
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const tmr = ctl ? setTimeout(() => ctl.abort(), API_BATAS_MS) : null;
  return fetch(GAS_URL, {
    method: 'POST', redirect: 'follow', cache: 'no-store',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ fn: fn, args: args }),
    signal: ctl ? ctl.signal : undefined
  })
    .then(res => res.text().then(txt => {
      try { return JSON.parse(txt); }
      catch (e) {
        if (!res.ok) throw new Error('server membalas HTTP ' + res.status);
        return { success: false, message: 'Server tidak mengirim data JSON. Pastikan GAS_URL di js/config.js benar dan deployment Apps Script diatur "Siapa saja".' };
      }
    }))
    .then(r => {
      if (r && r.code === 'SESSION') sesiHabis();
      return r || { success: false, message: 'Respons kosong dari server.' };
    })
    .catch(e => ({
      success: false,
      message: 'Koneksi gagal: ' + (e && e.name === 'AbortError' ? 'server terlalu lama merespons.' : navigator.onLine === false ? 'tidak ada internet.' : (e && e.message ? e.message : e))
    }))
    .finally(() => { if (tmr) clearTimeout(tmr); loadBar(-1); });
}
// ── Cache sisi klien: pindah menu tidak menunggu server selama data masih segar ──
// Semua panggilan yang mengubah data otomatis membuang cache, sehingga tampilan tidak pernah memakai data yang baru saja diubah.
const CTTL = { apiDashboard: 60000, apiPiket: 30000, apiPresensiKelas: 45000, apiRiwayat: 60000, apiScanHari: 15000, apiRekapWaktu: 20000, apiMasterList: 120000 };
const BACA_SAJA = { apiBootstrap: 1, apiMusik: 1, apiGetPengaturan: 1, apiTtdList: 1, apiTestimoniList: 1, apiStatusIntegrasi: 1, apiResetRingkasan: 1, apiNaikKelasRencana: 1, apiAlumniList: 1, apiRekapPdf: 1, apiRekapHtml: 1, apiPiketTemplate: 1, apiMapelList: 1, apiLogPengingat: 1, apiJadwalPiket: 1, apiEksporData: 1, apiEfektifList: 1, apiQrKartu: 1, apiRekapTelat: 1 };
const KC = { map: {}, fly: {}, gen: 0 };
function cacheBersih() { KC.map = {}; KC.gen++; }
function apiT(fn) {
  const args = Array.prototype.slice.call(arguments, 1), ttl = CTTL[fn];
  const panggil = () => api.apply(null, [fn, S.token].concat(args));
  if (!ttl) {
    if (BACA_SAJA[fn]) return panggil();
    KC.gen++; // permintaan baca yang sedang berjalan tidak boleh disimpan (bisa basi)
    return panggil().then(r => { if (r && r.success) cacheBersih(); return r; });
  }
  const key = fn + '|' + JSON.stringify(args), c = KC.map[key];
  if (c && Date.now() - c.t < ttl) return Promise.resolve(JSON.parse(c.j));
  if (KC.fly[key]) return KC.fly[key].then(r => JSON.parse(JSON.stringify(r)));
  const gen = KC.gen;
  const p = panggil().then(r => {
    delete KC.fly[key];
    if (r && r.success && gen === KC.gen) KC.map[key] = { t: Date.now(), j: JSON.stringify(r) };
    return r;
  });
  KC.fly[key] = p;
  return p;
}

// ── Sesi ──
function simpanSesi() { try { localStorage.setItem('sipedu_sesi', JSON.stringify({ token: S.token })); } catch (e) { /* abaikan */ } }
function hapusSesi() { try { localStorage.removeItem('sipedu_sesi'); } catch (e) { /* abaikan */ } }
function bacaSesi() { try { return (JSON.parse(localStorage.getItem('sipedu_sesi') || 'null') || {}).token || null; } catch (e) { return null; } }
function sesiHabis() {
  if (!S.token) return;
  S.token = null; S.user = null; hapusSesi(); cacheBersih(); qrHenti();
  toast('Sesi berakhir. Silakan masuk kembali.', 'err');
  tampilLogin();
}
function keluar() { qrHenti(); cacheBersih(); S.token = null; S.user = null; S.boot = null; S.inp = null; S.scan = null; hapusSesi(); tampilLogin(); }

// ── Modal & konfirmasi ──
function tutupModal() { $('#modal-root').innerHTML = ''; S.modalOk = null; }
function modal(o) {
  const root = $('#modal-root');
  root.innerHTML = '<div class="ovl" data-act="ovl"><form class="sheet ' + (o.wide ? 'wide' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(o.title) + '" novalidate>' +
    '<div class="hd"><h3>' + esc(o.title) + '</h3><button type="button" class="iconbtn" data-act="mclose" aria-label="Tutup">' + ic('close') + '</button></div>' +
    '<div class="bd">' + o.body + '</div>' +
    (o.ok === false ? '' : '<div class="ft"><button type="button" class="btn ghost" data-act="mclose">' + esc(o.cancel || 'Batal') + '</button><button type="submit" class="btn ' + (o.danger ? 'danger' : '') + '">' + esc(o.ok || 'Simpan') + '</button></div>') +
    '</form></div>';
  const f = $('form', root);
  S.modalOk = o.onOk || null;
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (!S.modalOk) return tutupModal();
    const btn = $('button[type=submit]', f); const t = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spin"></span>';
    try { const r = await S.modalOk(f); if (r === false) { btn.disabled = false; btn.innerHTML = t; } }
    catch (e) { toast(e.message || 'Terjadi kesalahan.', 'err'); btn.disabled = false; btn.innerHTML = t; }
  });
  setTimeout(() => { const first = $('input:not([type=hidden]):not([type=checkbox]),select,textarea', f); if (first && window.innerWidth > 700) first.focus(); }, 60);
  if (o.onOpen) o.onOpen(f);
  return f;
}
function konfirmasi(o) {
  return new Promise(res => {
    const root = $('#confirm-root');
    root.innerHTML = '<div class="ovl"><div class="cdlg" role="alertdialog" aria-modal="true"><h3>' + esc(o.title) + '</h3><div class="muted">' + (o.html || esc(o.msg || '')) + '</div>' +
      '<div class="acts"><button class="btn ghost" data-c="0">' + esc(o.cancel || 'Batal') + '</button><button class="btn ' + (o.danger ? 'danger' : '') + '" data-c="1">' + esc(o.ok || 'Ya, Lanjut') + '</button></div></div></div>';
    root.onclick = ev => { const b = ev.target.closest('[data-c]'); if (!b) return; root.innerHTML = ''; root.onclick = null; res(b.dataset.c === '1'); };
  });
}

// ── Unduh file ──
function dlBlob(blob, nama) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nama; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
}
function b64Blob(b64, mime) {
  const bin = atob(b64); const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
let _xlsxP = null;
function muatXLSX() {
  if (window.XLSX) return Promise.resolve();
  if (_xlsxP) return _xlsxP;
  _xlsxP = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = res; s.onerror = () => { _xlsxP = null; rej(new Error('Pustaka Excel gagal dimuat. Periksa koneksi internet.')); };
    document.head.appendChild(s);
  });
  return _xlsxP;
}
async function simpanXLSX(sheets, nama) {
  await muatXLSX();
  const wb = XLSX.utils.book_new();
  sheets.forEach(sh => {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    const w = (sh.rows[0] || []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...sh.rows.slice(0, 60).map(r => String(r[i] == null ? '' : r[i]).length + 2))) }));
    ws['!cols'] = w;
    XLSX.utils.book_append_sheet(wb, ws, sh.name.substr(0, 31));
  });
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  dlBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nama);
}

// ── Chart ──
function cv(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
function bersihChart() { S.charts.forEach(c => { try { c.destroy(); } catch (e) { /* abaikan */ } }); S.charts = []; }
function buatChart(id, cfg) {
  const el = document.getElementById(id);
  if (!el || !window.Chart) return;
  Chart.defaults.font.family = "'Plus Jakarta Sans',sans-serif";
  Chart.defaults.color = cv('--text-3');
  cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false }, cfg.options || {});
  S.charts.push(new Chart(el, cfg));
}

// ── Avatar, running text, dropzone ──
function avatarHtml(u, px, cls) {
  px = px || 40;
  if (u && u.foto) return '<img class="av ' + (cls || '') + '" src="' + u.foto + '" alt="Foto ' + esc(u.nama) + '" style="width:' + px + 'px;height:' + px + 'px">';
  return '<div class="avatar ' + (cls || '') + '" style="width:' + px + 'px;height:' + px + 'px;border-radius:' + Math.round(px / 2.6) + 'px;font-size:' + Math.round(px / 2.6) + 'px">' + esc(inisial(u ? u.nama : '?')) + '</div>';
}
function marqueeHtml(m) {
  if (!m || !m.aktif || !String(m.text || '').trim()) return '';
  const dur = Math.max(10, (m.text.length * 0.22 + 16) * (5 / (m.speed || 5)));
  return '<div class="mq" role="marquee" aria-label="Pengumuman" style="background:' + esc(m.bg) + ';color:' + esc(m.color) + '"><div class="mq-in" style="animation-duration:' + dur.toFixed(1) + 's"><span>' + esc(m.text) + '</span></div></div>';
}
function refreshMarquee() {
  const el = $('#mq-slot'); if (el) el.innerHTML = marqueeHtml(S.boot && S.boot.sekolah.marquee);
}
function dz(tipe, label, accept, icon) {
  return '<div class="dz" data-dz="' + tipe + '" tabindex="0" role="button" aria-label="' + esc(label) + '">' + ic(icon || 'cloud_upload', 'lg') + '<div class="bold">' + esc(label) + '</div>' +
    '<div class="small muted">Tarik &amp; lepas berkas ke sini, atau klik untuk memilih</div><input type="file" class="sr" accept="' + accept + '" tabindex="-1"></div>';
}
const DZ = {
  logo: f => unggahAset(f, 'logo'),
  pattern: f => unggahAset(f, 'pattern'),
  foto: f => bukaCrop(f),
  logoJaya: f => unggahAset(f, 'logoJaya'),
  logoKiri: f => unggahAset(f, 'logoKiri'),
  impor: f => bacaImporFile(f)
};
function pakaiBerkas(zone, file) {
  if (!file) return;
  const fn = DZ[zone.dataset.dz]; if (!fn) return;
  const acc = ($('input', zone).accept || '');
  const ok = acc.split(',').some(a => { a = a.trim().toLowerCase(); return a.charAt(0) === '.' ? file.name.toLowerCase().endsWith(a) : (a.endsWith('/*') ? file.type.indexOf(a.slice(0, -1)) === 0 : file.type === a); });
  if (!ok) return toast('Jenis berkas tidak sesuai.', 'err');
  fn(file);
}
function reRenderAll() { renderShell(); setNavAktif(); go(S.route, S.params); }

// ── Pemotong foto profil (geser + zoom) ──
function bukaCrop(file) {
  if (!/^image\//.test(file.type)) return toast('Pilih berkas gambar.', 'err');
  const fr = new FileReader();
  fr.onerror = () => toast('Gagal membaca berkas.', 'err');
  fr.onload = () => {
    const img = new Image();
    img.onerror = () => toast('Berkas bukan gambar yang valid.', 'err');
    img.onload = () => jalankanCrop(img);
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}
function jalankanCrop(img) {
  const SZ = 280, st = { z: 1, ox: 0, oy: 0 };
  const base = Math.max(SZ / img.width, SZ / img.height);
  modal({
    title: 'Sesuaikan Foto Profil', ok: 'Simpan Foto',
    body: '<div class="cropwrap"><canvas id="cr-cv" width="' + SZ + '" height="' + SZ + '" aria-label="Area pemotongan foto"></canvas><div class="cropmask"></div></div>' +
      '<div class="row mt"><button type="button" class="iconbtn" data-act="czoom" data-d="-0.2" aria-label="Perkecil">' + ic('remove') + '</button><input type="range" id="cr-z" min="1" max="4" step="0.01" value="1" class="grow" aria-label="Zoom foto" style="accent-color:var(--primary)"><button type="button" class="iconbtn" data-act="czoom" data-d="0.2" aria-label="Perbesar">' + ic('add') + '</button></div>' +
      '<div class="hint center">Geser foto untuk mengatur posisi. Gunakan slider untuk memperbesar / memperkecil.</div>',
    onOk: async () => {
      const out = document.createElement('canvas'); out.width = out.height = 320;
      gambar(out.getContext('2d'), 320 / SZ);
      const r = await apiT('apiUploadFoto', { mime: 'image/jpeg', base64: out.toDataURL('image/jpeg', 0.88).split(',')[1] });
      if (!r.success) { toast(r.message, 'err'); return false; }
      S.user.foto = r.data.uri; toast(r.message, 'ok'); tutupModal(); reRenderAll();
    },
    onOpen: () => {
      const cv = $('#cr-cv'), zr = $('#cr-z');
      const batas = () => { const w = img.width * base * st.z, h = img.height * base * st.z; st.ox = Math.max(-(w - SZ) / 2, Math.min((w - SZ) / 2, st.ox)); st.oy = Math.max(-(h - SZ) / 2, Math.min((h - SZ) / 2, st.oy)); };
      const gambar_ = () => { batas(); gambar(cv.getContext('2d'), 1); };
      window.__gbr = function (ctx, k) {
        const w = img.width * base * st.z * k, h = img.height * base * st.z * k, S2 = SZ * k;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, S2, S2);
        ctx.drawImage(img, S2 / 2 - w / 2 + st.ox * k, S2 / 2 - h / 2 + st.oy * k, w, h);
      };
      window.cropState = { st: st, redraw: gambar_, zr: zr };
      let drag = null;
      cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, ox: st.ox, oy: st.oy }; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (!drag) return; const k = SZ / cv.getBoundingClientRect().width; st.ox = drag.ox + (e.clientX - drag.x) * k; st.oy = drag.oy + (e.clientY - drag.y) * k; gambar_(); });
      const stop = () => { drag = null; };
      cv.addEventListener('pointerup', stop); cv.addEventListener('pointercancel', stop);
      cv.addEventListener('wheel', e => { e.preventDefault(); st.z = Math.max(1, Math.min(4, st.z + (e.deltaY < 0 ? .1 : -.1))); zr.value = st.z; gambar_(); }, { passive: false });
      zr.addEventListener('input', () => { st.z = +zr.value; gambar_(); });
      gambar_();
    }
  });
}
function gambar(ctx, k) { if (window.__gbr) window.__gbr(ctx, k); }

/* ============================================================
   LOGIN
   ============================================================ */
const MUSIK = { el: null, mati: false };
function setIkonMusik() { const b = $('#btn-musik'); if (b) b.innerHTML = ic(MUSIK.mati ? 'music_off' : 'music_note'); }
function hentiMusik() { if (MUSIK.el) { try { MUSIK.el.pause(); } catch (e) { /* abaikan */ } MUSIK.el = null; } }
async function mulaiMusik() {
  hentiMusik();
  const m = S.boot && S.boot.musik; if (!m || !m.aktif) return;
  try { MUSIK.mati = localStorage.getItem('sipedu_musik_off') === '1'; } catch (e) { /* abaikan */ }
  setIkonMusik();
  const r = await apiT('apiMusik');
  if (!r.success || !r.data.uri || !S.token) return;
  const a = new Audio(r.data.uri); a.loop = true; a.volume = Math.min(1, Math.max(0, m.volume / 100)); MUSIK.el = a;
  if (MUSIK.mati) return;
  a.play().catch(() => {
    const lagi = () => { if (MUSIK.el === a && !MUSIK.mati) a.play().catch(() => {}); };
    document.addEventListener('click', lagi, { once: true }); document.addEventListener('keydown', lagi, { once: true });
  });
}
function toggleMusik() {
  MUSIK.mati = !MUSIK.mati;
  try { localStorage.setItem('sipedu_musik_off', MUSIK.mati ? '1' : '0'); } catch (e) { /* abaikan */ }
  if (MUSIK.el) { if (MUSIK.mati) MUSIK.el.pause(); else MUSIK.el.play().catch(() => {}); }
  setIkonMusik();
}
const WARNA_T = ['#1d4ed8', '#b45309', '#047857', '#9333ea', '#be185d', '#0e7490', '#c2410c'];
function warnaNama(n) { let h = 0; String(n).split('').forEach(c => { h = (h * 31 + c.charCodeAt(0)) % 997; }); return WARNA_T[h % WARNA_T.length]; }
function bubbleHtml(t) {
  const tg = /^\d{4}-\d{2}-\d{2}$/.test(t.waktu || '') ? fTglPendek(t.waktu) + ' ' + t.waktu.substr(0, 4) : '';
  return '<div class="wa-row">' + (t.foto ? '<img class="wa-av" src="' + t.foto + '" alt="Foto ' + esc(t.nama) + '">' : '<div class="wa-av ini">' + esc(inisial(t.nama)) + '</div>') +
    '<div class="wa-b"><div class="wa-n" style="color:' + warnaNama(t.nama) + '">' + esc(t.nama) + '</div>' + (t.kelas || t.sekolah ? '<div class="wa-r">Mengajar: ' + esc([t.kelas ? 'Kelas ' + t.kelas : '', t.sekolah].filter(Boolean).join(' • ')) + '</div>' : '') + '<div class="wa-t">' + esc(t.isi) + '</div><div class="wa-m">' + esc(tg) + ' ' + ic('done_all') + '</div></div></div>';
}
function testiSection(tm) {
  if (!tm || !tm.items || !tm.items.length) return '';
  const op = Math.min(100, Math.max(20, S.pub.testiOpacity || 60)) / 100;
  return '<section class="testi" style="--to:' + op + '" aria-label="Testimoni pengguna"><div class="testi-h">' + ic('forum', 'sm') + 'Testimoni Pengguna</div><div class="wa-chat">' + tm.items.map(bubbleHtml).join('') + '</div>' +
    (tm.total > tm.items.length ? '<button class="btn soft block" style="margin-top:10px" data-act="testisemua">Selengkapnya ' + ic('arrow_forward', 'sm') + '</button>' : '') + '</section>';
}
async function tampilTestimoni() {
  bersihChart();
  $('#app-container').innerHTML = '<div class="login-root">' + marqueeHtml(S.pub.marquee) + '<div class="testi-page"><div class="testi-top"><button class="btn soft" data-act="kelogin">' + ic('arrow_back', 'sm') + 'Kembali ke Login</button><h1>Testimoni Pengguna</h1></div>' +
    '<div class="wa-chat" id="testi-all">' + skeleton() + '</div><button class="btn block mt" data-act="kelogin">' + ic('login', 'sm') + 'Kembali ke halaman login</button></div></div>';
  window.scrollTo(0, 0);
  const r = await api('apiTestimoniSemua');
  const el = $('#testi-all'); if (!el) return;
  el.innerHTML = r.success && r.data.length ? r.data.map(bubbleHtml).join('') : '<div class="empty">Belum ada testimoni.</div>';
}
async function refreshTestiPub() { const r = await api('apiTestimoniPublik'); if (r.success) S.pub.testimoni = r.data; }

const LG_KID = (x, shirt, hair, skin, girl, delay) => '<g transform="translate(' + x + ',0)"><g class="lg-bob" style="animation-delay:' + delay + 's">' +
  '<rect x="-14" y="176" width="10" height="36" rx="5" fill="#1e293b"/><rect x="4" y="176" width="10" height="36" rx="5" fill="#1e293b"/>' +
  '<ellipse cx="-9" cy="213" rx="10" ry="5" fill="#0f172a"/><ellipse cx="9" cy="213" rx="10" ry="5" fill="#0f172a"/>' +
  '<rect x="-32" y="122" width="14" height="42" rx="7" fill="#f59e0b"/>' +
  '<rect x="-23" y="112" width="46" height="70" rx="16" fill="' + shirt + '"/>' +
  (girl ? '<path d="M-26 168 L26 168 L32 188 L-32 188 Z" fill="#1e293b" opacity=".85"/>' : '') +
  '<rect x="21" y="116" width="10" height="38" rx="5" fill="' + skin + '" transform="rotate(-28 26 118)"/>' +
  '<rect x="-31" y="120" width="10" height="36" rx="5" fill="' + skin + '" transform="rotate(10 -26 122)"/>' +
  '<circle cx="0" cy="88" r="25" fill="' + skin + '"/>' +
  '<path d="M-26 86 a26 26 0 0 1 52 0 q-26 -16 -52 0z" fill="' + hair + '"/>' +
  (girl ? '<circle cx="-29" cy="84" r="9" fill="' + hair + '"/><circle cx="29" cy="84" r="9" fill="' + hair + '"/>' : '') +
  '<circle cx="-8" cy="92" r="2.6" fill="#1e293b"/><circle cx="8" cy="92" r="2.6" fill="#1e293b"/><path d="M-7 100 q7 7 14 0" stroke="#1e293b" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
  '</g><g class="lg-pop" style="animation-delay:' + (delay + .3) + 's"><circle cx="0" cy="44" r="14" fill="#22c55e" stroke="#fff" stroke-width="3"/><path d="M-6 44 l4.5 4.5 l8 -9" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g></g>';
const LG_ILL = () => '<svg viewBox="0 0 430 240" role="img" aria-label="Murid hadir di sekolah" xmlns="http://www.w3.org/2000/svg">' +
  '<circle cx="215" cy="125" r="108" fill="#fff" opacity=".12"/><ellipse cx="215" cy="216" rx="200" ry="11" fill="#000" opacity=".14"/>' +
  LG_KID(58, '#3b82f6', '#1e293b', '#fcd9b6', false, 0) + LG_KID(128, '#ec4899', '#7c2d12', '#f5c6a0', true, .35) + LG_KID(198, '#10b981', '#312e81', '#e8b48a', false, .7) +
  '<g class="lg-float"><rect x="262" y="22" width="150" height="176" rx="18" fill="#fff"/><rect x="305" y="12" width="64" height="24" rx="9" fill="#fbbf24"/><rect x="319" y="19" width="36" height="9" rx="4.5" fill="#fff" opacity=".85"/>' +
  [0, 1, 2].map(i => '<circle cx="288" cy="' + (66 + i * 34) + '" r="10" fill="#22c55e"/><path d="M283 ' + (66 + i * 34) + ' l3.5 3.5 l7 -8" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="306" y="' + (61 + i * 34) + '" width="84" height="9" rx="4.5" fill="#cbd5e1"/>').join('') +
  '<circle cx="288" cy="168" r="10" fill="#f59e0b"/><text x="288" y="172.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="sans-serif">S</text><rect x="306" y="163" width="60" height="9" rx="4.5" fill="#cbd5e1"/></g>' +
  '<g fill="#fde68a"><path class="lg-tw" d="M20 40 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z"/><path class="lg-tw" style="animation-delay:.8s" d="M240 24 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z"/></g></svg>';
function tampilLogin() {
  hentiMusik();
  bersihChart();
  const p = S.pub;
  const pat = p.pattern ? "url('" + p.pattern + "')" : '';
  const L = p.login || {}, G = L.gaya || {}, kartu = (L.tema || 'kartu') !== 'gradien', la = L.latar || {};
  const gayaCss = (code, uk) => {
    const a = String(code || '').split('|'); let s = '';
    if (a[0]) s += 'font-weight:' + a[0] + ';'; if (a[1] === '1') s += 'font-style:italic;'; if (a[2]) s += 'color:' + a[2] + ';'; if (uk) s += 'font-size:' + uk + 'px;';
    return s ? ' style="' + s + '"' : '';
  };
  const namaApp = L.namaApp || p.app, namaFull = L.namaFull || (p.appFull + ' ' + p.nama);
  const lg = { sapaan: L.sapaan || 'Hai, Selamat Datang!', sub: L.subjudul || 'Presensi murid jadi rapi, cepat, dan akurat', desk: L.deskripsi || p.tagline || '', judul: L.judulForm || 'Selamat Datang Kembali', subf: L.subForm || 'Masuk untuk mengisi dan merekap presensi murid' };
  const rs = '--lg1:' + (L.warna1 || (kartu ? '#7cc4ff' : '#4f46e5')) + ';--lg2:' + (L.warna2 || (kartu ? '#8da2fb' : '#818cf8')) + ';--lgbtn:' + (L.tombol || (kartu ? '#1d4ed8' : '#4f46e5')) + ';--lgtxt:' + (kartu ? ((!L.teks || String(L.teks).toLowerCase() === '#ffffff') ? '#0f172a' : L.teks) : (L.teks || '#ffffff')) + ';--lgop:' + ((la.opacity === '' || la.opacity === undefined ? 55 : +la.opacity) / 100) + (p.pattern ? ";--lgpat:url('" + p.pattern + "')" : '') + (L.logoUk ? ';--lglogo:' + L.logoUk + 'px' : '');
  const md = L.media || {};
  const mediaBox = md.ada ? '<div class="lg-media shape-' + (md.bentuk || 'membulat') + '" id="lg-media" style="width:min(' + (md.ukuran || 320) + 'px,100%)"><img id="lg-media-img" alt="Foto halaman login"></div>' : '';
  const logoImg = (src, alt) => '<div class="logo"><img src="' + src + '" alt="' + alt + '"></div>';
  $('#app-container').innerHTML =
    '<div class="login-root lg2' + (kartu ? ' lg3' : '') + (la.ada ? ' has-bg' : '') + '" style="' + rs + '">' + (la.ada ? '<div class="lg-bg" id="lg-bg"></div>' : '') + marqueeHtml(p.marquee) + '<div class="login-wrap"><div class="login-hero">' +
    '<div class="lg-brand"><div class="logos">' + (p.logoKiri ? logoImg(p.logoKiri, 'Logo tambahan') : '') + (p.logo ? logoImg(p.logo, 'Logo sekolah') : '<div class="logo">' + ic('school', 'lg') + '</div>') + '</div>' +
    '<div class="lg-name"' + gayaCss(G.nama, L.namaUk) + '>' + esc(namaApp) + '<small' + gayaCss(G.full, L.subUk) + '>' + esc(namaFull) + '</small></div></div>' +
    '<h1 class="lg-sapa"' + gayaCss(G.sapa) + '>' + esc(lg.sapaan) + '</h1><p class="lg-sub"' + gayaCss(G.sub) + '>' + esc(lg.sub) + '</p>' + (lg.desk ? '<p class="lg-desc"' + gayaCss(G.desk) + '>' + esc(lg.desk) + '</p>' : '') +
    '<div class="lg-ill">' + LG_ILL() + '</div>' + mediaBox + '</div>' +
    '<div class="login-side"><div class="login-card" id="login-card"><h2 class="lg-h"' + gayaCss(G.judul) + '>' + esc(lg.judul) + '</h2><p class="lg-hs"' + gayaCss(G.subf) + '>' + esc(lg.subf) + '</p>' +
    '<div class="tabs2" role="tablist"><button class="on" data-act="logtab" data-t="guru" role="tab">Guru</button><button data-act="logtab" data-t="admin" role="tab">Superadmin</button></div>' +
    '<form id="f-guru" novalidate><label class="f" for="lg-nip">NIP/NIKKI</label>' +
    '<div class="inp-ico">' + ic('badge') + '<input class="inp" id="lg-nip" name="nip" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="NIP/NIKKI" required></div>' +
    '<button class="btn block mt" type="submit">Masuk</button></form>' +
    '<form id="f-admin" class="hidden" novalidate><label class="f" for="lg-user">Username</label>' +
    '<div class="inp-ico">' + ic('badge') + '<input class="inp" id="lg-user" name="u" autocomplete="username" value="admin" required></div>' +
    '<label class="f" for="lg-pw">Sandi</label><div class="inp-ico">' + ic('lock') + '<input class="inp" id="lg-pw" name="p" type="password" autocomplete="current-password" required></div>' +
    '<button class="btn block mt" type="submit">Masuk sebagai Superadmin</button></form>' +
    (window.Ortu ? '<div class="lg-ortu"><span>Orang tua/wali murid?</span><button type="button" class="btn ghost block" data-act="keortu">' + ic('family_restroom', 'sm') + 'Buka Portal Orang Tua</button></div>' : '') + '</div>' +
    testiSection(p.testimoni) + '<div class="login-foot">© ' + new Date().getFullYear() + ' ' + esc(p.nama) + '</div></div></div></div>';
  if (la.ada) {
    const pasang = d => {
      const el = $('#lg-bg'); if (!el) return;
      if (d.tipe === 'video') { el.innerHTML = '<video autoplay muted loop playsinline></video>'; const v = el.firstChild; v.muted = true; v.src = d.uri; v.play().catch(() => {}); }
      else el.style.backgroundImage = "url('" + d.uri + "')";
    };
    if (S.pub.loginLatar) pasang(S.pub.loginLatar);
    else api('apiLoginLatar').then(r => { if (r.success && r.data.uri) { S.pub.loginLatar = r.data; pasang(r.data); } });
  }
  if (md.ada) {
    const isi = uri => { const im = $('#lg-media-img'); if (!im) return; im.src = uri; $('#lg-media').classList.add('on'); if (md.mode !== 'tambah') $('.lg-ill').classList.add('hidden'); };
    if (S.pub.loginMediaUri) isi(S.pub.loginMediaUri);
    else api('apiLoginMedia').then(r => { if (r.success && r.data.uri) { S.pub.loginMediaUri = r.data.uri; isi(r.data.uri); } });
  }
  $('#f-guru').addEventListener('submit', async ev => {
    ev.preventDefault();
    const b = $('button', ev.target); b.disabled = true;
    const r = await api('apiLoginGuru', ev.target.nip.value);
    b.disabled = false; masukDariLogin(r);
  });
  $('#f-admin').addEventListener('submit', async ev => {
    ev.preventDefault();
    const b = $('button', ev.target); b.disabled = true;
    const r = await api('apiLoginAdmin', ev.target.u.value, ev.target.p.value);
    b.disabled = false; masukDariLogin(r);
  });
}
async function masukDariLogin(r) {
  if (!r.success) return toast(r.message, 'err');
  S.token = r.data.token; S.user = r.data.user; simpanSesi();
  await mulaiApp(true);
  toast(r.message, 'ok');
}

/* ============================================================
   SHELL & ROUTER
   ============================================================ */
function menuNav() {
  const u = S.user, m = [{ k: 'beranda', i: 'home', l: 'Beranda' }];
  if (u.isPiket) m.push({ k: 'piket', i: 'assignment_ind', l: 'Piket' });
  m.push({ k: 'input', i: 'edit_note', l: 'Input', fab: true });
  m.push({ k: 'qr', i: 'qr_code_scanner', l: 'Scan QR' });
  m.push({ k: 'rekap', i: 'analytics', l: 'Rekap' });
  m.push({ k: 'profil', i: u.role === 'admin' ? 'settings' : 'account_circle', l: u.role === 'admin' ? 'Pengaturan' : 'Profil' });
  return m;
}
function renderShell() {
  const p = S.pub, u = S.user, nav = menuNav();
  const logo = (p.logoKiri ? '<img src="' + p.logoKiri + '" alt="">' : '') + (p.logo ? '<img src="' + p.logo + '" alt="">' : ic('school'));
  const side = nav.map(n => '<button class="nv" data-act="go" data-r="' + n.k + '" data-nav="' + n.k + '">' + ic(n.i) + n.l + '<span class="dot hidden" data-badge="' + n.k + '"></span></button>').join('');
  const bn = nav.map(n => n.fab
    ? '<button class="fab" data-act="go" data-r="' + n.k + '" data-nav="' + n.k + '" aria-label="' + n.l + ' presensi"><span class="c">' + ic(n.i, 'lg fill') + '</span><span class="l">' + n.l + '</span></button>'
    : '<button data-act="go" data-r="' + n.k + '" data-nav="' + n.k + '">' + ic(n.i) + '<span>' + n.l + '</span><span class="dot hidden" data-badge="' + n.k + '"></span></button>').join('');
  $('#app-container').innerHTML =
    '<div class="shell"><aside class="side"><div class="brand"><div class="lg">' + logo + '</div><div><div class="bold" style="color:var(--primary);font-size:17px">' + esc(p.app) + '</div><div class="small muted">' + esc(p.nama) + '</div></div></div>' + side +
    '<button class="sideuser" data-act="go" data-r="profil">' + avatarHtml(u, 38) + '<span style="min-width:0"><b class="ell">' + esc(u.nama) + '</b><span class="small muted ell" style="display:block">' + esc(u.jenis) + '</span></span></button></aside>' +
    '<div class="shellmain"><header class="topbar"><div class="brand"><div class="lg">' + logo + '</div><div style="min-width:0"><div class="t1">' + esc(p.app) + '</div><div class="t2">' + esc(p.nama) + '</div></div></div>' +
    (S.boot && S.boot.musik && S.boot.musik.aktif ? '<button class="iconbtn" data-act="musik" id="btn-musik" aria-label="Putar atau jeda musik latar">' + ic(MUSIK.mati ? 'music_off' : 'music_note') + '</button>' : '') + '<button class="iconbtn" data-act="tema" aria-label="Ganti tema gelap/terang">' + ic('contrast') + '</button>' +
    '<button class="iconbtn tb-av" data-act="go" data-r="profil" aria-label="Profil saya">' + avatarHtml(u, 34) + '</button></header>' +
    '<div id="mq-slot">' + marqueeHtml(S.boot && S.boot.sekolah.marquee) + '</div>' +
    '<main class="main" id="page"></main></div>' +
    '<nav class="bnav" aria-label="Navigasi utama">' + bn + '</nav></div>';
}
function setNavAktif() {
  const akar = S.route === 'admin' ? 'profil' : S.route;
  $$('[data-nav]').forEach(b => {
    const on = b.dataset.nav === akar;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
}
function setBadge(k, n) {
  $$('[data-badge="' + k + '"]').forEach(e => { e.textContent = n > 99 ? '99+' : n; e.classList.toggle('hidden', !n); });
}
function go(rute, params) {
  const nav = menuNav().map(n => n.k).concat(['admin']);
  if (nav.indexOf(rute) < 0) rute = 'beranda';
  S.route = rute; S.params = params || {};
  S.rid++;
  bersihChart(); qrHenti();
  setNavAktif();
  const pg = $('#page');
  if (pg) { pg.innerHTML = skeleton(); window.scrollTo(0, 0); }
  const fn = { beranda: pBeranda, piket: pPiket, input: pInput, qr: pQr, rekap: pRekap, profil: pProfil, admin: pAdmin }[rute];
  fn(S.rid);
}
function skeleton() { return '<div class="sk h"></div><div class="sk h" style="height:60px"></div><div class="sk l"></div><div class="sk l" style="width:70%"></div><div class="sk h"></div>'; }
function aktif(rid) { return rid === S.rid && $('#page'); }
function halaman(html, rid) { if (aktif(rid)) $('#page').innerHTML = html; }
function galat(r, rid) {
  halaman('<div class="empty">' + ic('cloud_off') + '<div class="bold">Gagal memuat data</div><div class="small">' + esc(r.message) + '</div><button class="btn mt" data-act="reload">Coba Lagi</button></div>', rid);
}
function terapkanTema() {
  const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('sipedu_tema', t); } catch (e) { /* abaikan */ }
  if (S.user) go(S.route, S.params);
}

/* ============================================================
   BERANDA
   ============================================================ */
const NAMA_BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function bulanSel(R) {
  const ym = todayStr().substr(0, 7), y = +ym.substr(0, 4), m = +ym.substr(5, 2), ys = m >= 7 ? y : y - 1, o = [];
  for (let i = 0; i < 12; i++) { const mm = ((6 + i) % 12) + 1, yy = ys + (6 + i >= 12 ? 1 : 0), b = yy + '-' + String(mm).padStart(2, '0'); if (b > ym) break; o.push('<option value="' + b + '"' + (R.bulan === b ? ' selected' : '') + '>' + NAMA_BLN[mm - 1] + ' ' + yy + '</option>'); }
  const ef = (S.boot && S.boot.efektif) || {}, b0 = R.bulan;
  return '<label class="f" style="margin-top:0" for="rk-bulan">Periode kehadiran (bulan)</label><select class="inp" id="rk-bulan" data-chg="rkbulan"><option value="">Rentang tanggal manual</option>' + o.join('') + '</select>' +
    (b0 ? '<div class="hint">' + (ef[b0] ? 'Hari efektif bulan ini: ' + esc(ef[b0]) + ' hari (input Superadmin).' : 'Hari efektif bulan ini belum diinput Superadmin; dihitung otomatis.') + '</div>' : '');
}
function kelasSaya() {
  const u = S.user, semua = S.boot.kelas.filter(k => k.aktif);
  if (u.role === 'admin') return semua;
  const mine = semua.filter(k => k.waliId === u.id);
  if (mine.length) return mine;
  if (u.jenis === 'Guru Mapel') return semua.filter(k => (u.kelasMapel || []).some(m => m.id === k.id));
  // Guru tanpa kelas wali (mis. Guru Mapel): kelas pada shift mengajarnya (Pagi / Siang / Pagi & Siang)
  return semua.filter(k => !u.shift || u.shift === 'Pagi & Siang' || u.shift === k.shift);
}
function chipKelas(k) {
  if (k.terkirim) return k.nihil ? '<span class="chip ok">' + ic('check_circle', 'sm fill') + 'Nihil</span>' : '<span class="chip ok">' + ic('check_circle', 'sm fill') + 'Terkirim</span>';
  if (k.draft) return '<span class="chip warn">Draf</span>';
  return '<span class="chip err">Belum kirim</span>';
}
async function pBeranda(rid) {
  const tgl = S.tgl || todayStr(); S.tgl = tgl;
  const r = await apiT('apiDashboard', { tanggal: tgl });
  if (!aktif(rid)) return;
  if (!r.success) return galat(r, rid);
  const d = r.data, g = d.ringkasan, u = S.user;
  const kelasIds = kelasSaya().map(k => k.id);
  const tampil = (u.role === 'admin' || u.isPiket) ? d.kelas : d.kelas.filter(k => kelasIds.indexOf(k.id) >= 0);
  const belum = d.kelas.filter(k => !k.terkirim).length;
  if (u.isPiket) setBadge('piket', belum);
  const persen = g.persen;
  const sapa = (() => { const h = +new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', hour12: false }); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; })();
  const pagi = S.boot.jam;
  let h = '<div class="row between wrap mb"><div><h1 class="page-title">' + sapa + ', ' + esc(u.nama.split(',')[0]) + '</h1><div class="page-sub" style="margin:0">' + fTgl(d.tanggal) + ' • TA ' + esc(S.boot.sekolah.tahunAjaran) + (S.boot.piketHariIni.length ? ' • Piket hari ini: ' + esc(S.boot.piketHariIni.join(', ')) : '') + '</div></div>' +
    '<input type="date" class="inp" style="width:auto" id="bd-tgl" value="' + d.tanggal + '" max="' + todayStr() + '" aria-label="Pilih tanggal"></div>';
  h += '<div class="hero"><div class="lbl">Tingkat Kehadiran Hari Ini</div><div class="big">' + pct(persen) + '</div>' +
    '<div class="lbl" style="margin-top:6px">' + g.sudahKirim + ' dari ' + g.totalKelas + ' kelas sudah mengirim presensi</div>' +
    '<div class="progress" style="margin-top:10px;background:rgba(255,255,255,.25)"><i style="width:' + (g.totalKelas ? g.sudahKirim / g.totalKelas * 100 : 0) + '%;background:var(--accent)"></i></div></div>';
  h += '<div class="grid g4 mt"><div class="stat"><span class="n">' + g.tidakMasuk + '</span><span class="l">Tidak masuk</span></div>' +
    '<div class="stat s"><span class="n">' + g.S + '</span><span class="l">Sakit</span></div><div class="stat i"><span class="n">' + g.I + '</span><span class="l">Izin</span></div><div class="stat a"><span class="n">' + g.A + '</span><span class="l">Alpa</span></div></div>';
  if ((u.isPiket || u.role === 'admin') && belum > 0 && d.tanggal === todayStr()) {
    h += '<div class="banner mt">' + ic('notifications_active') + '<div class="grow"><b>' + belum + ' kelas belum mengirim presensi.</b> Pengingat otomatis terkirim pukul ' + esc(pagi.pagi) + ' (Pagi) dan ' + esc(pagi.siang) + ' (Siang).</div><button class="btn sm accent" data-act="go" data-r="piket">Pantau</button></div>';
  }
  if (u.role === 'admin' && !((S.boot.efektif || {})[todayStr().substr(0, 7)])) {
    h += '<div class="banner err warnbig mt" role="alert">' + ic('event_busy') + '<div class="grow"><b>Hari efektif bulan ini belum diinput.</b><div class="small">Rekap guru kelas dan guru mapel memakai angka ini.</div></div><button class="btn sm" data-act="keefektif">Isi Sekarang</button></div>';
  }
  if (u.role === 'guru' && kelasIds.length && (u.kelasWali || []).length) {
    const mine = d.kelas.filter(k => kelasIds.indexOf(k.id) >= 0 && !k.terkirim), tung = d.tunggakan || [];
    if (d.tanggal === todayStr() && (mine.length || tung.length)) {
      h += '<div class="banner err warnbig mt" role="alert">' + ic('warning') + '<div class="grow"><b>PERINGATAN: laporan kehadiran belum diisi.</b>' +
        (mine.length ? '<div>Kelas ' + esc(mine.map(k => k.nama).join(', ')) + ' belum mengirim presensi hari ini. Batas: Pagi ' + esc(pagi.pagi) + ', Siang ' + esc(pagi.siang) + '.</div>' : '') +
        (tung.length ? '<div class="small" style="margin-top:4px">Belum terkirim pada: ' + tung.slice(0, 6).map(x => fTglPendek(x.tanggal) + ' (' + esc(x.kelas) + ')').join(', ') + (tung.length > 6 ? ', dan ' + (tung.length - 6) + ' lainnya' : '') + '</div>' : '') +
        '</div><button class="btn sm" data-act="go" data-r="input">Isi Sekarang</button></div>';
    }
  }
  h += '<div class="card mt"><h3>' + ((u.role === 'admin' || u.isPiket) ? 'Status Pengiriman Kelas' : 'Kelas Saya') + '</h3><div class="list">' +
    (tampil.length ? tampil.map(k => '<div class="item"><div class="avatar ' + (k.terkirim ? 'ok' : 'err') + '">' + esc(k.nama) + '</div><div class="grow"><div class="bold">Kelas ' + esc(k.nama) + ' <span class="muted small">• ' + k.shift + '</span></div>' +
      '<div class="small muted">' + esc(k.wali || 'Wali belum ditetapkan') + (k.terkirim ? ' • ' + k.waktu : '') + '</div></div>' +
      '<div style="text-align:right">' + chipKelas(k) + '<div class="small muted" style="margin-top:3px">' + (k.terkirim ? k.jumlahAbsen + ' tidak masuk' : '') + '</div></div></div>').join('') : '<div class="empty">' + ic('school') + 'Belum ada data kelas.</div>') + '</div></div>';
  const p = d.periode;
  h += '<div class="card mt"><h3>Tren Kehadiran 7 Hari Terakhir</h3>' + (p.harian.length ? '<div class="chartbox"><canvas id="ch-tren"></canvas></div>' : '<div class="empty small">Belum ada data pengiriman pada periode ini.</div>') + '</div>';
  h += '<div class="card mt"><h3>Ketidakhadiran per Kelas (7 hari)</h3>' + (p.perKelas.some(x => x.tidakMasuk) ? '<div class="chartbox"><canvas id="ch-kelas"></canvas></div>' : '<div class="empty small">Tidak ada catatan ketidakhadiran.</div>') + '</div>';
  h += '<div class="card mt"><h3>' + ic('lightbulb', 'sm') + ' Insight</h3>' + d.insight.map(t => '<div class="insight">' + ic('arrow_right') + '<div>' + esc(t) + '</div></div>').join('') + '</div>';
  halaman(h, rid);
  const el = $('#bd-tgl'); if (el) el.onchange = () => { S.tgl = el.value || todayStr(); go('beranda'); };
  if (p.harian.length) buatChart('ch-tren', { type: 'line', data: { labels: p.harian.map(x => fTglPendek(x.tanggal)), datasets: [{ label: '% Hadir', data: p.harian.map(x => x.persen), borderColor: cv('--primary'), backgroundColor: cv('--primary') + '33', fill: true, tension: .35, pointRadius: 4 }] }, options: { scales: { y: { min: Math.max(0, Math.min.apply(null, p.harian.map(x => x.persen || 100)) - 10), max: 100, ticks: { callback: v => v + '%' } } }, plugins: { legend: { display: false } } } });
  if (p.perKelas.some(x => x.tidakMasuk)) buatChart('ch-kelas', { type: 'bar', data: { labels: p.perKelas.map(x => x.nama), datasets: [{ label: 'Sakit', data: p.perKelas.map(x => x.S), backgroundColor: cv('--sakit') }, { label: 'Izin', data: p.perKelas.map(x => x.I), backgroundColor: cv('--izin') }, { label: 'Alpa', data: p.perKelas.map(x => x.A), backgroundColor: cv('--alpa') }] }, options: { scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } } });
}

/* ============================================================
   PANTAUAN PIKET
   ============================================================ */
async function pPiket(rid) {
  if (!S.user.isPiket && S.user.role !== 'admin') return go('beranda');
  const tgl = S.tgl || todayStr();
  const r = await apiT('apiPiket', { tanggal: tgl });
  if (!aktif(rid)) return;
  if (!r.success) return galat(r, rid);
  const d = r.data, g = d.ringkasan, hariIni = d.tanggal === todayStr();
  S.piketData = d;
  const f = S.piketShift;
  const lihat = d.kelas.filter(k => f === 'Semua' || k.shift === f);
  const belum = lihat.filter(k => !k.terkirim), sudah = lihat.filter(k => k.terkirim);
  setBadge('piket', d.kelas.filter(k => !k.terkirim).length);
  let h = '<div class="row between wrap mb"><div><h1 class="page-title">Pantauan Piket</h1><div class="page-sub" style="margin:0">' + fTgl(d.tanggal) + '</div></div>' +
    '<input type="date" class="inp" style="width:auto" id="pk-tgl" value="' + d.tanggal + '" max="' + todayStr() + '" aria-label="Pilih tanggal"></div>';
  h += '<div class="grid g3" style="grid-template-columns:repeat(3,1fr)"><div class="stat"><span class="n">' + g.sudahKirim + '/' + g.totalKelas + '</span><span class="l">Kelas terkirim</span></div>' +
    '<div class="stat"><span class="n" style="color:var(--err)">' + g.belumKirim + '</span><span class="l">Belum kirim</span></div><div class="stat"><span class="n">' + pct(g.persen) + '</span><span class="l">Kehadiran</span></div></div>';
  h += '<div class="seg mt" role="tablist">' + ['Semua', 'Pagi', 'Siang'].map(s => '<button class="' + (f === s ? 'on' : '') + '" data-act="pkshift" data-s="' + s + '">' + s + (s === 'Pagi' ? ' (' + g.pagi.sudah + '/' + g.pagi.total + ')' : s === 'Siang' ? ' (' + g.siang.sudah + '/' + g.siang.total + ')' : '') + '</button>').join('') + '</div>';
  h += '<div class="card mt"><div class="row between wrap"><h3 style="margin:0">Belum Mengirim (' + belum.length + ')</h3>' +
    (hariIni && belum.length ? '<button class="btn sm ghost" data-act="pkall">Pilih semua</button>' : '') + '</div>';
  if (!belum.length) h += '<div class="empty">' + ic('task_alt') + 'Semua kelas pada filter ini sudah mengirim presensi.</div>';
  else h += '<div class="list">' + belum.map(k => {
    const noWa = !k.waliWa;
    return '<label class="item" style="cursor:pointer">' + (hariIni ? '<input type="checkbox" style="width:22px;height:22px;accent-color:var(--primary)" data-chg="pkpilih" data-id="' + k.id + '"' + (S.piketPilih[k.id] ? ' checked' : '') + '>' : '') +
      '<div class="avatar err">' + esc(k.nama) + '</div><div class="grow"><div class="bold">Kelas ' + esc(k.nama) + ' <span class="muted small">• ' + k.shift + '</span></div><div class="small muted">' + esc(k.wali || 'Wali belum ditetapkan') + '</div>' +
      (noWa ? '<div class="small" style="color:var(--warn)">Nomor WA belum diisi</div>' : '') + '</div>' +
      (k.diingatkan ? '<span class="chip warn">' + ic('notifications', 'sm') + k.diingatkan + '</span>' : '') +
      (k.draft ? '<span class="chip">Draf ' + k.draft + '</span>' : '') +
      '<button type="button" class="btn sm soft" data-act="pkisi" data-id="' + k.id + '">' + ic('edit_note', 'sm') + 'Isi</button></label>';
  }).join('') + '</div>';
  h += '</div>';
  h += '<div class="card mt"><h3>Sudah Mengirim (' + sudah.length + ')</h3>' + (sudah.length ? '<div class="list">' + sudah.map(k =>
    '<details class="item" style="display:block"><summary style="list-style:none;display:flex;align-items:center;gap:12px;cursor:pointer;min-height:44px"><div class="avatar ok">' + esc(k.nama) + '</div><div class="grow"><div class="bold">Kelas ' + esc(k.nama) + ' <span class="muted small">• ' + k.shift + '</span></div>' +
    '<div class="small muted">' + esc(k.pengirim) + ' • ' + k.waktu + '</div></div>' + (k.nihil ? '<span class="chip ok">Nihil</span>' : '<span class="chip s">S ' + k.S + '</span><span class="chip i">I ' + k.I + '</span><span class="chip a">A ' + k.A + '</span>') + '</summary>' +
    (k.absen.length ? '<div style="padding:6px 0 0 54px">' + k.absen.map(a => '<div class="small" style="padding:4px 0">' + a.no + '. ' + esc(a.nama) + ' <span class="chip ' + a.status[0].toLowerCase() + '">' + a.status + '</span>' + (a.ket ? ' <span class="muted">— ' + esc(a.ket) + '</span>' : '') + '</div>').join('') + '</div>' : '<div class="small muted" style="padding:6px 0 0 54px">Semua murid hadir.</div>') + '<div style="padding:8px 0 0 54px"><button type="button" class="btn sm soft" data-act="pkisi" data-id="' + k.id + '">' + ic('edit_note', 'sm') + 'Ubah Presensi</button></div></details>').join('') + '</div>' : '<div class="empty small">Belum ada kelas yang mengirim.</div>') + '</div>';
  h += '<div class="row wrap mt"><button class="btn accent" data-act="pkisi" data-id="">' + ic('edit_note', 'sm') + 'Isi Presensi Kelas</button><button class="btn soft" data-act="rekapharian">' + ic('picture_as_pdf', 'sm') + 'Rekap Seluruh Sekolah (PDF)</button>' + ((S.user.kelasWali || []).length ? '<button class="btn soft" data-act="rekapkelas">' + ic('picture_as_pdf', 'sm') + 'Rekap Kelas Saya (PDF)</button>' : '') + '</div>';
  if (hariIni) h += '<div class="stickybar" id="pk-bar"><div class="grow small"><b id="pk-n">0</b> kelas dipilih' + (d.pengingatTerkirim ? ' • ' + d.pengingatTerkirim + ' sudah diingatkan hari ini' : '') + '</div><button class="btn accent" data-act="pkkirim" id="pk-kirim" disabled>' + ic('send', 'sm') + 'Kirim Pengingat WA</button></div>';
  halaman(h, rid);
  const el = $('#pk-tgl'); if (el) el.onchange = () => { S.tgl = el.value || todayStr(); S.piketPilih = {}; go('piket'); };
  hitungPilih();
}
function hitungPilih() {
  const n = Object.keys(S.piketPilih).filter(k => S.piketPilih[k]).length;
  const a = $('#pk-n'), b = $('#pk-kirim'); if (a) a.textContent = n; if (b) b.disabled = !n;
}
async function kirimPengingatTerpilih() {
  const d = S.piketData; if (!d) return;
  const ids = Object.keys(S.piketPilih).filter(k => S.piketPilih[k]);
  if (!ids.length) return;
  const ok = await konfirmasi({ title: 'Kirim pengingat WhatsApp?', msg: ids.length + ' wali kelas akan menerima pesan pengingat untuk mengirim presensi.', ok: 'Kirim' });
  if (!ok) return;
  const kelasMap = {}; d.kelas.forEach(k => { kelasMap[k.id] = k; });
  const per = { Pagi: [], Siang: [] };
  ids.forEach(id => { if (kelasMap[id]) per[kelasMap[id].shift].push(id); });
  let rincian = [], terkirim = 0, gagal = 0, pesanGalat = '';
  for (const sh of ['Pagi', 'Siang']) {
    if (!per[sh].length) continue;
    const r = await apiT('apiKirimPengingat', { kelasIds: per[sh], shift: sh });
    if (!r.success) { pesanGalat = r.message; continue; }
    terkirim += r.data.terkirim; gagal += r.data.gagal; rincian = rincian.concat(r.data.rincian);
  }
  S.piketPilih = {};
  if (!rincian.length) return toast(pesanGalat || 'Tidak ada pengingat terkirim.', 'err');
  modal({
    title: 'Hasil Pengiriman Pengingat', ok: false,
    body: '<div class="banner ' + (gagal ? '' : 'ok') + '">' + ic(gagal ? 'warning' : 'check_circle') + '<div><b>' + terkirim + ' terkirim</b>' + (gagal ? ', <b>' + gagal + ' gagal</b>' : '') + '</div></div><div class="list mt">' +
      rincian.map(x => '<div class="item"><div class="grow"><b>Kelas ' + esc(x.kelas) + '</b><div class="small muted">' + esc(x.pesan) + '</div></div><span class="chip ' + (x.ok ? 'ok' : 'err') + '">' + (x.ok ? 'Terkirim' : 'Gagal') + '</span></div>').join('') + '</div>' +
      '<button type="button" class="btn block mt" data-act="mclose">Tutup</button>'
  });
  go('piket');
}
/* ============================================================
   INPUT PRESENSI
   ============================================================ */
/** Daftar kelas untuk Input: Guru Piket & Superadmin dapat mengisi semua kelas (kelas sendiri di urutan atas). */
function kelasInput() {
  const u = S.user, saya = kelasSaya();
  if (u.role === 'admin' || !u.isPiket) return saya;
  const ids = saya.map(k => k.id);
  const lain = S.boot.kelas.filter(k => k.aktif && ids.indexOf(k.id) < 0)
    .sort((a, b) => (a.shift + a.nama).localeCompare(b.shift + b.nama, 'id', { numeric: true }));
  return saya.concat(lain);
}
function opsiKelasHtml(opsi, sel) {
  const o = k => '<option value="' + k.id + '"' + (k.id === sel ? ' selected' : '') + '>Kelas ' + esc(k.nama) + ' (' + k.shift + ')</option>';
  const u = S.user;
  if (u.role === 'admin' || !u.isPiket) return opsi.map(o).join('');
  const saya = kelasSaya().map(k => k.id);
  const a = opsi.filter(k => saya.indexOf(k.id) >= 0), b = opsi.filter(k => saya.indexOf(k.id) < 0);
  return (a.length ? '<optgroup label="Kelas saya">' + a.map(o).join('') + '</optgroup>' : '') + (b.length ? '<optgroup label="Kelas lain (mode piket)">' + b.map(o).join('') + '</optgroup>' : '');
}
function muridKelas(namaKelas) {
  return S.boot.murid.filter(m => m[2] === namaKelas).sort((a, b) => a[1].localeCompare(b[1], 'id'));
}
async function pInput(rid) {
  const opsi = kelasInput();
  if (!opsi.length) return halaman('<div class="empty">' + ic('school') + 'Belum ada kelas aktif. Hubungi Superadmin.</div>', rid);
  if (!S.inp || !opsi.some(k => k.id === S.inp.kelasId)) S.inp = { tanggal: todayStr(), kelasId: opsi[0].id, marks: {}, terkirim: false, waktu: '' };
  const I = S.inp;
  const [r, rs] = await Promise.all([apiT('apiPresensiKelas', { tanggal: I.tanggal, kelasId: I.kelasId }), apiT('apiScanHari', { tanggal: I.tanggal })]);
  if (!aktif(rid)) return;
  if (!r.success) return galat(r, rid);
  S.scan = rs && rs.success ? rs.data.peta : {}; S.scanTgl = I.tanggal;
  I.marks = {};
  r.data.items.forEach(it => { I.marks[it.nisn] = { status: it.status, ket: it.ket }; });
  I.terkirim = r.data.terkirim; I.waktu = r.data.waktu; I.pengirim = r.data.pengirim;
  renderInput(rid);
}
function renderInput(rid) {
  const I = S.inp, opsi = kelasInput(), kelas = S.boot.kelas.find(k => k.id === I.kelasId);
  const roster = muridKelas(kelas.nama);
  let h = '<h1 class="page-title">Input Presensi</h1><div class="page-sub">Tandai hanya murid yang <b>tidak masuk</b>. Murid tanpa tanda dianggap hadir.</div>';
  if (S.user.isPiket && S.user.role !== 'admin') h += '<div class="banner info mb">' + ic('shield_person') + '<div><b>Mode Guru Piket aktif.</b> Anda dapat mengisi atau mengubah presensi <b>semua kelas</b>. Pilih kelas pada daftar di bawah.</div></div>';
  h += '<div class="card"><div class="grid gr2"><div><label class="f" style="margin-top:0" for="in-kelas">Kelas</label><select class="inp" id="in-kelas" data-chg="inkelas">' +
    opsiKelasHtml(opsi, I.kelasId) + '</select></div>' +
    '<div><label class="f" style="margin-top:0" for="in-tgl">Tanggal</label><input class="inp" type="date" id="in-tgl" data-chg="intgl" value="' + I.tanggal + '" max="' + todayStr() + '"></div></div></div>';
  h += '<div id="in-status">' + statusInputHtml() + '</div>';
  h += '<div class="grid mt" style="grid-template-columns:repeat(4,1fr);gap:8px" id="in-count">' + hitungHtml(roster.length) + '</div>';
  h += '<div class="card mt relpos"><label class="f" style="margin-top:0" for="in-cari">Cari cepat murid (semua kelas)</label><div class="inp-ico">' + ic('search') + '<input class="inp" id="in-cari" data-inp="cari" placeholder="Ketik nama atau NISN…" autocomplete="off"></div><div id="cari-res"></div></div>';
  h += '<div class="card mt"><h3>Daftar Murid — Kelas ' + esc(kelas.nama) + ' (' + roster.length + ')</h3><div id="in-qrbar">' + qrBarHtml(roster) + '</div><div id="roster">' + rosterHtml(roster) + '</div></div>';
  h += '<div class="stickybar"><button class="btn ghost" data-act="inpsimpan">' + ic('save', 'sm') + 'Simpan Draf</button><button class="btn grow accent" data-act="inpkirim">' + ic('send', 'sm') + (I.terkirim ? 'Kirim Ulang' : 'Kirim Manual') + '</button></div>';
  halaman(h, rid);
}
function statusInputHtml() {
  const I = S.inp;
  if (I.terkirim) return '<div class="banner ok mt">' + ic('check_circle', 'fill') + '<div><b>Presensi lengkap &amp; terkirim</b>' + (I.waktu ? ' pukul ' + esc(I.waktu) : '') + (I.pengirim ? ' oleh ' + esc(I.pengirim) : '') + '. Anda masih bisa mengubah lalu kirim ulang.</div></div>';
  return '<div class="banner info mt">' + ic('info') + '<div>Presensi kelas ini <b>belum lengkap</b>. Murid yang scan QR otomatis hadir. Murid yang <b>tidak scan wajib diberi keterangan</b> (Sakit/Izin + alasan). Jika sampai pergantian hari belum diberi keterangan, murid tersebut dicatat <b>Alpa</b> otomatis.</div></div>';
}
function hitungHtml(total) {
  const m = S.inp.marks; let s = 0, i = 0, a = 0;
  Object.keys(m).forEach(k => { if (m[k].status === 'Sakit') s++; else if (m[k].status === 'Izin') i++; else if (m[k].status === 'Alpa') a++; });
  return '<div class="stat"><span class="n">' + Math.max(0, total - s - i - a) + '</span><span class="l">Hadir</span></div><div class="stat s"><span class="n">' + s + '</span><span class="l">Sakit</span></div><div class="stat i"><span class="n">' + i + '</span><span class="l">Izin</span></div><div class="stat a"><span class="n">' + a + '</span><span class="l">Alpa</span></div>';
}
function rosterHtml(roster) {
  if (!roster.length) return '<div class="empty">' + ic('group_off') + 'Belum ada murid di kelas ini.</div>';
  const m = S.inp.marks;
  return roster.map((r, i) => {
    const cur = m[r[0]];
    const btn = (s, l) => '<button type="button" class="' + (cur && cur.status === s ? 'on ' : '') + l + '" data-act="mark" data-n="' + esc(r[0]) + '" data-s="' + s + '" aria-pressed="' + (cur && cur.status === s ? 'true' : 'false') + '" aria-label="' + s + ' - ' + esc(r[1]) + '">' + l + '</button>';
    return '<div class="mrow" style="flex-wrap:wrap"><div class="no">' + (i + 1) + '</div><div class="nm">' + esc(r[1]) + '<small>NISN ' + esc(r[0]) + (S.scan && S.scanTgl === S.inp.tanggal && S.scan[r[0]] ? ' • <b style="color:var(--ok)">✔ QR ' + esc(S.scan[r[0]]) + '</b>' : '') + '</small></div><div class="pill3">' + btn('Sakit', 'S') + btn('Izin', 'I') + btn('Alpa', 'A') + '</div>' +
      (cur ? '<input class="inp" style="margin:0 0 4px 36px;min-height:40px;font-size:13.5px;width:calc(100% - 36px)" placeholder="' + (cur.status === 'Alpa' ? 'Keterangan (opsional)' : 'Keterangan wajib diisi') + '" maxlength="200" data-inp="ket" data-n="' + esc(r[0]) + '" value="' + esc(cur.ket) + '">' : '') + '</div>';
  }).join('');
}
function refreshInput() {
  const kelas = S.boot.kelas.find(k => k.id === S.inp.kelasId);
  const roster = muridKelas(kelas.nama);
  const ro = $('#roster'); if (ro) ro.innerHTML = rosterHtml(roster);
  const qb = $('#in-qrbar'); if (qb) qb.innerHTML = qrBarHtml(roster);
  const c = $('#in-count'); if (c) c.innerHTML = hitungHtml(roster.length);
}
function itemsInput() { return Object.keys(S.inp.marks).map(n => ({ nisn: n, status: S.inp.marks[n].status, ket: S.inp.marks[n].ket || '' })); }
async function simpanInput(kirim) {
  const I = S.inp, items = itemsInput();
  const kelas = S.boot.kelas.find(k => k.id === I.kelasId);
  const tanpa = items.filter(x => x.status !== 'Alpa' && !String(x.ket || '').trim());
  if (kirim && tanpa.length) return toast('Keterangan wajib diisi untuk ' + tanpa.length + ' murid Sakit/Izin.', 'err');
  if (kirim) {
    const ok = await konfirmasi({ title: I.terkirim ? 'Kirim ulang presensi?' : 'Kirim presensi kelas ' + kelas.nama + '?', msg: items.length ? items.length + ' murid tidak masuk akan dikirim ke piket.' : 'Tidak ada murid yang ditandai — presensi dikirim sebagai NIHIL (semua hadir).', ok: 'Kirim' });
    if (!ok) return;
  }
  const r = await apiT('apiSimpanPresensi', { tanggal: I.tanggal, kelasId: I.kelasId, items: items, kirim: !!kirim });
  if (!r.success) return toast(r.message, 'err');
  I.terkirim = r.data.terkirim; I.waktu = r.data.waktu; I.pengirim = S.user.nama;
  toast(r.message, 'ok');
  const st = $('#in-status'); if (st) st.innerHTML = statusInputHtml();
  if (!kirim && I.terkirim) toast('Semua murid sudah tercatat — presensi kelas terkirim otomatis.', 'ok');
  if (kirim) {
    modal({ title: 'Presensi Terkirim', ok: false, body: '<div class="center" style="padding:10px 0"><div class="avatar ok" style="width:64px;height:64px;margin:0 auto 10px;border-radius:50%">' + ic('check', 'lg') + '</div><div class="bold" style="font-size:17px">Kelas ' + esc(kelas.nama) + ' • ' + fTgl(I.tanggal) + '</div>' +
      '<div class="grid mt" style="grid-template-columns:repeat(4,1fr);gap:8px;text-align:center">' + hitungHtml(muridKelas(kelas.nama).length) + '</div><div class="mt bold">Kehadiran ' + pct(r.data.persen) + '</div></div>' + (I.dariPiket && S.user.isPiket ? '<div class="row mt"><button type="button" class="btn ghost grow" data-act="mclose">Isi Kelas Lain</button><button type="button" class="btn grow" data-act="pkback">Kembali ke Piket</button></div>' : '<button type="button" class="btn block mt" data-act="mclose">Selesai</button>') });
  }
}
const cariMurid = debounce(function (q) {
  const box = $('#cari-res'); if (!box) return;
  q = String(q || '').trim().toLowerCase();
  if (q.length < 2) { box.innerHTML = ''; return; }
  const hasil = S.boot.murid.filter(m => m[1].toLowerCase().indexOf(q) >= 0 || m[0].indexOf(q) >= 0).slice(0, 8);
  box.innerHTML = hasil.length ? '<div class="sugg">' + hasil.map(m => '<div class="si"><div class="grow"><b>' + esc(m[1]) + '</b><div class="small muted">Kelas ' + esc(m[2]) + ' • ' + esc(m[0]) + '</div></div><div class="pill3">' +
    ['Sakit:S', 'Izin:I', 'Alpa:A', 'Hadir:H'].map(x => { const p = x.split(':'); return '<button type="button" data-act="tandai" data-n="' + esc(m[0]) + '" data-s="' + p[0] + '" aria-label="' + p[0] + ' - ' + esc(m[1]) + '">' + p[1] + '</button>'; }).join('') + '</div></div>').join('') + '</div>' : '<div class="small muted" style="padding:8px 2px">Murid tidak ditemukan.</div>';
}, 200);
async function tandaiCepat(nisn, status) {
  const r = await apiT('apiTandaiMurid', { tanggal: S.inp.tanggal, nisn: nisn, status: status });
  if (!r.success) return toast(r.message, 'err');
  toast(r.message, 'ok');
  const kelas = S.boot.kelas.find(k => k.id === S.inp.kelasId);
  if (kelas && kelas.nama === r.data.kelas) {
    if (status === 'Hadir') delete S.inp.marks[nisn]; else S.inp.marks[nisn] = { status: status, ket: (S.inp.marks[nisn] || {}).ket || '' };
    refreshInput();
  }
  const b = $('#cari-res'); if (b) b.innerHTML = ''; const c = $('#in-cari'); if (c) c.value = '';
}

/* ============================================================
   RIWAYAT & REKAP
   ============================================================ */
function opsiKelasRekap() {
  const u = S.user;
  if (u.role === 'guru' && S.rekap.cakupan === 'kelas' && (u.kelasWali || []).length) return kelasSaya();
  return (u.role === 'admin' || u.isPiket) ? S.boot.kelas.filter(k => k.aktif) : kelasSaya();
}
async function pRekap(rid) {
  const R = S.rekap, t = todayStr();
  const bisaCak = S.user.role === 'guru' && S.user.isPiket && ((S.user.kelasWali || []).length > 0 || (S.user.kelasMapel || []).length > 0);
  if (!bisaCak) R.cakupan = ''; else if (!R.cakupan) R.cakupan = 'sekolah';
  if (!R.sampai) { R.sampai = t; R.dari = t.substr(0, 8) + '01'; R.bulan = t.substr(0, 7); }
  const opsi = opsiKelasRekap();
  let h = '<h1 class="page-title">Riwayat &amp; Rekap</h1><div class="page-sub">Pantau tren kehadiran dan unduh laporan.</div>';
  h += '<div class="seg" role="tablist"><button class="' + (R.tab === 'rekap' ? 'on' : '') + '" data-act="rktab" data-t="rekap">Rekap</button><button class="' + (R.tab === 'riwayat' ? 'on' : '') + '" data-act="rktab" data-t="riwayat">Riwayat</button></div>';
  h += '<div class="card mt">' + (bisaCak ? '<div class="seg" role="tablist" style="margin-bottom:10px"><button class="' + (R.cakupan === 'sekolah' ? 'on' : '') + '" data-act="rkcak" data-c="sekolah">Seluruh Sekolah</button><button class="' + (R.cakupan === 'kelas' ? 'on' : '') + '" data-act="rkcak" data-c="kelas">Kelas Saya</button></div>' : '') + bulanSel(R) + '<div class="grid g3" style="grid-template-columns:1fr 1fr"><div><label class="f" style="margin-top:0" for="rk-dari">Dari</label><input class="inp" type="date" id="rk-dari" data-chg="rkf" data-k="dari" value="' + R.dari + '" max="' + t + '"></div>' +
    '<div><label class="f" style="margin-top:0" for="rk-sampai">Sampai</label><input class="inp" type="date" id="rk-sampai" data-chg="rkf" data-k="sampai" value="' + R.sampai + '" max="' + t + '"></div></div>' +
    '<label class="f" for="rk-kelas">Kelas</label><select class="inp" id="rk-kelas" data-chg="rkf" data-k="kelasId"><option value="">Semua kelas' + (opsi.length < S.boot.kelas.filter(k => k.aktif).length ? ' saya' : '') + '</option>' +
    opsi.map(k => '<option value="' + k.id + '"' + (R.kelasId === k.id ? ' selected' : '') + '>Kelas ' + esc(k.nama) + '</option>').join('') + '</select>' +
    '<div class="hint">Rentang maksimal 93 hari.</div></div><div id="rk-isi" class="mt">' + skeleton() + '</div>';
  halaman(h, rid);
  if (R.tab === 'rekap') await isiRekap(rid); else await isiRiwayat(rid);
}
async function isiRekap(rid) {
  const R = S.rekap;
  const r = await apiT('apiDashboard', { tanggal: R.sampai, dari: R.dari, sampai: R.sampai });
  if (!aktif(rid)) return;
  if (!r.success) return void ($('#rk-isi').innerHTML = '<div class="empty">' + esc(r.message) + '</div>');
  const p = r.data.periode;
  const ids = opsiKelasRekap().map(k => k.id);
  const namaOk = {}; S.boot.kelas.forEach(k => { if (R.kelasId ? k.id === R.kelasId : ids.indexOf(k.id) >= 0) namaOk[k.nama] = true; });
  const pk = p.perKelas.filter(x => namaOk[x.nama]);
  const tS = pk.reduce((a, x) => a + x.S, 0), tI = pk.reduce((a, x) => a + x.I, 0), tA = pk.reduce((a, x) => a + x.A, 0);
  let h = '<div class="hero"><div class="lbl">Rata-rata Kehadiran (' + fTglPendek(p.dari) + ' – ' + fTglPendek(p.sampai) + ')</div><div class="big">' + pct(p.persen) + '</div><div class="lbl">' + (tS + tI + tA) + ' catatan tidak masuk • ' + p.harian.length + ' hari ada pengiriman</div></div>';
  h += '<div class="grid mt" style="grid-template-columns:repeat(3,1fr)"><div class="stat s"><span class="n">' + tS + '</span><span class="l">Sakit</span></div><div class="stat i"><span class="n">' + tI + '</span><span class="l">Izin</span></div><div class="stat a"><span class="n">' + tA + '</span><span class="l">Alpa</span></div></div>';
  h += '<div class="row wrap mt"><button class="btn soft grow" data-act="rkpdf">' + ic('picture_as_pdf', 'sm') + 'PDF</button><button class="btn soft grow" data-act="rkxls">' + ic('table_view', 'sm') + 'Excel</button></div>';
  h += '<div class="grid gr2 mt"><div class="card"><h3>Tren Kehadiran Harian</h3>' + (p.harian.length ? '<div class="chartbox"><canvas id="rc-tren"></canvas></div>' : '<div class="empty small">Belum ada data.</div>') + '</div>' +
    '<div class="card"><h3>Komposisi Alasan</h3>' + ((tS + tI + tA) ? '<div class="chartbox"><canvas id="rc-donut"></canvas></div>' : '<div class="empty small">Tidak ada ketidakhadiran.</div>') + '</div></div>';
  h += '<div class="card mt"><h3>Per Kelas</h3><div class="scrollx"><table class="tb"><thead><tr><th>Kelas</th><th>S</th><th>I</th><th>A</th><th>Total</th></tr></thead><tbody>' +
    pk.map(x => '<tr><td><b>' + esc(x.nama) + '</b></td><td>' + x.S + '</td><td>' + x.I + '</td><td>' + x.A + '</td><td><b>' + x.tidakMasuk + '</b></td></tr>').join('') + '</tbody></table></div></div>';
  h += '<div class="card mt"><h3>' + ic('lightbulb', 'sm') + ' Insight</h3>' + r.data.insight.map(t => '<div class="insight">' + ic('arrow_right') + '<div>' + esc(t) + '</div></div>').join('') + '</div>';
  $('#rk-isi').innerHTML = h;
  if (p.harian.length) buatChart('rc-tren', { type: 'line', data: { labels: p.harian.map(x => fTglPendek(x.tanggal)), datasets: [{ label: '% Hadir', data: p.harian.map(x => x.persen), borderColor: cv('--primary'), backgroundColor: cv('--primary') + '33', fill: true, tension: .3 }] }, options: { scales: { y: { max: 100, ticks: { callback: v => v + '%' } } }, plugins: { legend: { display: false } } } });
  if (tS + tI + tA) buatChart('rc-donut', { type: 'doughnut', data: { labels: ['Sakit', 'Izin', 'Alpa'], datasets: [{ data: [tS, tI, tA], backgroundColor: [cv('--sakit'), cv('--izin'), cv('--alpa')], borderWidth: 0 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
}
async function isiRiwayat(rid) {
  const R = S.rekap;
  const r = await apiT('apiRiwayat', { dari: R.dari, sampai: R.sampai, kelasId: R.kelasId });
  if (!aktif(rid)) return;
  if (!r.success) return void ($('#rk-isi').innerHTML = '<div class="empty">' + esc(r.message) + '</div>');
  const d = r.data; let h = '';
  if (d.terlewat.length) {
    h += '<details class="banner err" style="display:block;margin-bottom:12px"><summary style="cursor:pointer;min-height:36px;display:flex;gap:8px;align-items:center">' + ic('event_busy') + '<b>' + d.terlewat.length + ' pengiriman terlewat (hari kerja)</b></summary><div class="small" style="margin-top:8px">' +
      d.terlewat.slice(0, 60).map(x => '<div style="padding:3px 0">' + fTgl(x.tanggal) + ' — Kelas ' + esc(x.nama) + (x.wali ? ' (' + esc(x.wali) + ')' : '') + '</div>').join('') + (d.terlewat.length > 60 ? '<div>… dan ' + (d.terlewat.length - 60) + ' lainnya</div>' : '') + '</div></details>';
  }
  if (!d.hari.length) h += '<div class="empty">' + ic('history') + 'Tidak ada riwayat pada rentang ini.</div>';
  else h += d.hari.map(x => '<details class="card" style="margin-bottom:10px"><summary style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:10px;min-height:44px"><div class="grow"><div class="bold">' + fTgl(x.tanggal) + '</div><div class="small muted">' + (x.libur ? 'Libur' + (x.ketLibur ? ' — ' + esc(x.ketLibur) : '') : x.terkirim + ' dari ' + x.total + ' kelas terkirim') + '</div></div>' +
    '<span class="chip ' + (x.persen === null ? '' : x.persen >= 95 ? 'ok' : x.persen >= 90 ? 'warn' : 'err') + '">' + pct(x.persen) + '</span>' + ic('expand_more', 'sm') + '</summary><div class="list" style="margin-top:8px">' +
    x.kelas.map(k => '<div class="item" style="display:block"><div class="row"><b class="grow">Kelas ' + esc(k.nama) + '</b>' + chipKelas(k) + '</div>' +
      (k.absen.length ? '<div class="small" style="margin-top:6px">' + k.absen.map(a => '<div style="padding:2px 0">' + a.no + '. ' + esc(a.nama) + ' <span class="chip ' + a.status[0].toLowerCase() + '">' + a.status + '</span>' + (a.ket ? ' <span class="muted">— ' + esc(a.ket) + '</span>' : '') + '</div>').join('') + '</div>' : '') + '</div>').join('') + '</div></details>').join('');
  $('#rk-isi').innerHTML = h;
}
async function openRekap(opt) {
  const r = await apiT('apiRekapHtml', opt);
  if (!r.success) return toast(r.message, 'err');
  S.rekapOpt = opt; S.rekapHtml = r.data;
  modal({ title: 'Pratinjau Laporan', wide: true, ok: false, body: '<div class="pdfwrap" id="pdf-wrap"><iframe class="pdfframe" id="pdf-fr" title="Pratinjau laporan"></iframe></div><div class="row wrap mt"><button type="button" class="btn grow" data-act="pdfunduh">' + ic('download', 'sm') + 'Unduh PDF</button><button type="button" class="btn soft grow" data-act="pdfcetak">' + ic('print', 'sm') + 'Cetak</button></div>',
    onOpen: () => {
      const f = $('#pdf-fr'), w = $('#pdf-wrap'); if (!f || !w) return;
      const lebar = r.data.lebar || (r.data.landscape ? 1123 : 794), sk = Math.min(1, (w.clientWidth || lebar) / lebar), tinggi = Math.round(window.innerHeight * 0.62);
      f.style.cssText = 'width:' + lebar + 'px;height:' + Math.round(tinggi / sk) + 'px;transform:scale(' + sk + ');transform-origin:0 0';
      w.style.height = tinggi + 'px'; f.srcdoc = r.data.html;
    } });
}
async function unduhPdf() {
  const b = $('[data-act=pdfunduh]'); if (b) b.disabled = true;
  const r = await apiT('apiRekapPdf', S.rekapOpt);
  if (b) b.disabled = false;
  if (!r.success) return toast(r.message, 'err');
  dlBlob(b64Blob(r.data.base64, 'application/pdf'), r.data.filename);
  toast('PDF diunduh.', 'ok');
}
async function unduhExcel() {
  const R = S.rekap;
  const r = await apiT('apiEksporData', { cakupan: R.cakupan, dari: R.dari, sampai: R.sampai, kelasId: R.kelasId });
  if (!r.success) return toast(r.message, 'err');
  try { await simpanXLSX(r.data.sheets, 'Rekap_Presensi_' + r.data.dari + '_sd_' + r.data.sampai + '.xlsx'); toast('Excel diunduh.', 'ok'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ============================================================
   PROFIL & PENGATURAN
   ============================================================ */
function fotoCard() {
  const u = S.user;
  return '<div class="card"><h3>Foto Profil</h3><div class="row wrap" style="align-items:flex-start"><div id="foto-prev">' + avatarHtml(u, 96) + '</div><div class="grow" style="min-width:210px">' +
    dz('foto', 'Unggah foto profil', 'image/png,image/jpeg,image/webp', 'add_a_photo') + '</div></div>' +
    (u.foto ? '<button class="btn ghost sm mt" data-act="fotohapus">' + ic('delete', 'sm') + 'Hapus foto</button>' : '') +
    '<div class="hint">Setelah memilih foto, geser dan atur zoom sebelum disimpan.</div></div>';
}
async function pProfil(rid) {
  const u = S.user, s = S.boot.sekolah;
  let h = '<h1 class="page-title">' + (u.role === 'admin' ? 'Pengaturan' : 'Profil & Data Saya') + '</h1><div class="page-sub">' + esc(s.nama) + ' • TA ' + esc(s.tahunAjaran) + ' (' + esc(s.semester) + ')</div>';
  h += '<div class="grid gr2"><div class="col"><div class="card"><div class="row">' + avatarHtml(u, 60) + '<div class="grow" style="min-width:0"><div class="bold" style="font-size:17px">' + esc(u.nama) + '</div><div class="small muted">' + esc(u.jenis) + (u.nip ? ' • ' + esc(u.nip) : '') + '</div>' +
    '<div class="row wrap" style="margin-top:6px">' + (u.isPiket && u.role !== 'admin' ? '<span class="chip warn">' + ic('shield_person', 'sm') + 'Guru Piket hari ini</span>' : '') + (u.role === 'guru' ? '<span class="chip">' + ic('schedule', 'sm') + esc(u.shift) + '</span>' : '') + (u.kelasWali && u.kelasWali.length ? '<span class="chip">Wali Kelas ' + esc(u.kelasWali.map(k => k.nama).join(', ')) + '</span>' : '') + '</div></div></div></div>';
  h += fotoCard();
  if (u.role === 'guru') {
    h += '<form class="card" id="f-profil" novalidate><h3>Data Saya</h3><label class="f" style="margin-top:0">Nama lengkap</label><input class="inp" value="' + esc(u.nama) + '" disabled aria-describedby="h-nama"><div class="hint" id="h-nama">Nama hanya dapat diubah oleh Superadmin.</div>' +
      '<label class="f" for="pf-nip">NIP / NIKKI</label><input class="inp" id="pf-nip" value="' + esc(u.nip) + '" disabled><div class="hint">NIP/NIKKI dipakai untuk login; hanya Superadmin yang dapat mengubahnya.</div>' +
      '<label class="f" for="pf-wa">No. WhatsApp (untuk pengingat presensi)</label><input class="inp" id="pf-wa" name="wa" inputmode="tel" placeholder="08xxxxxxxxxx" value="' + esc(u.wa) + '">' +
      '<button class="btn block mt" type="submit">Simpan Data</button></form>';
  }
  h += '</div><div class="col"><div class="card"><div class="row"><div class="grow"><div class="bold">Mode Gelap</div><div class="small muted">Nyaman untuk mata di ruangan redup.</div></div><label class="sw"><input type="checkbox" data-chg="tema"' + (document.documentElement.getAttribute('data-theme') === 'dark' ? ' checked' : '') + ' aria-label="Mode gelap"><i></i></label></div></div>';
  if (u.role === 'admin') {
    const mb = l => l.map(m => '<button data-act="adm" data-s="' + m[0] + '">' + ic(m[1]) + '<b>' + m[2] + '</b><span class="d">' + m[3] + '</span></button>').join('');
    h += '<div class="sec-h" style="margin-top:4px">Data Master</div><div class="menugrid">' +
      mb([['kelas', 'meeting_room', 'Kelas & Shift', 'Rombel, shift, wali kelas'], ['murid', 'groups', 'Murid', 'Data murid + impor Excel'], ['naik', 'upgrade', 'Naik Kelas', 'Naikkan semua kelas 1x klik'], ['alumni', 'school', 'Alumni', 'Murid yang sudah lulus'], ['guru', 'badge', 'Guru', 'Data guru, shift, impor Excel'], ['piket', 'calendar_month', 'Jadwal Piket', 'Atur per hari'], ['libur', 'event_busy', 'Hari Libur', 'Tanggal tanpa presensi']]) + '</div>';
    h += '<div class="sec-h">Sistem</div><div class="menugrid">' +
      mb([['tahun', 'event_repeat', 'Tahun Ajaran', 'Otomatis / manual, semester'], ['jamscan', 'schedule', 'Jam Presensi', 'Buka & batas tepat waktu tiap shift'], ['sekolah', 'domain', 'Profil Sekolah', 'Nama, kop, logo, pattern login'], ['running', 'campaign', 'Running Text', 'Teks berjalan & warna'], ['wa', 'notifications_active', 'Pengingat WhatsApp', 'Gateway, jam, trigger, log'], ['ortu', 'family_restroom', 'Notifikasi Orang Tua', 'Firebase, surat aktivasi, uji kirim'], ['kop', 'description', 'Kop Laporan', 'Logo Jaya Raya, logo sekolah, alamat kop'], ['loginui', 'palette', 'Tampilan Login', 'Teks dan warna halaman login'], ['testi', 'forum', 'Testimoni', 'Kelola testimoni halaman login'], ['musik', 'music_note', 'Musik Latar', 'Backsound setelah login'], ['efektif', 'event_available', 'Hari Efektif', 'Input hari efektif tiap bulan'], ['ttd', 'draw', 'Tanda Tangan', 'Tanda tangan kepala sekolah & guru'], ['cetak', 'print', 'Pengaturan Cetak', 'Kertas A4/F4 dan margin'], ['mapel', 'menu_book', 'Jadwal Guru Mapel', 'Kelas dan hari mengajar guru mapel'], ['akun', 'manage_accounts', 'Data & Sandi Admin', 'Nama, foto, username, sandi'], ['reset', 'delete_forever', 'Reset Data', 'Kehadiran, murid, dan guru']]) + '</div>';
  }
  h += '<button class="btn danger block mt" data-act="keluar">' + ic('logout', 'sm') + 'Keluar</button></div></div>';
  halaman(h, rid);
  const f = $('#f-profil');
  if (f) f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const r = await apiT('apiSimpanProfil', { wa: f.wa.value });
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { S.user.wa = r.data.wa; }
  });
}

/* ============================================================
   ADMIN
   ============================================================ */
async function reloadBoot() {
  const r = await apiT('apiBootstrap');
  if (r.success) { S.boot = r.data; S.user = r.data.user; }
}
function admHead(judul, aksi) {
  return '<div class="row mb"><button class="iconbtn" data-act="go" data-r="profil" aria-label="Kembali">' + ic('arrow_back') + '</button><h1 class="page-title grow" style="margin:0">' + judul + '</h1>' + (aksi || '') + '</div>';
}
async function pAdmin(rid) {
  const sub = S.params.sub;
  const fn = { kelas: aKelas, murid: aMurid, guru: aGuru, piket: aPiket, libur: aLibur, sekolah: aSekolah, wa: aWA, akun: aAkun, tahun: aTahun, jamscan: aJamScan, running: aRunning, kop: aKop, testi: aTesti, musik: aMusik, efektif: aEfektif, mapel: aMapel, ttd: aTtd, cetak: aCetak, loginui: aLoginUI, ortu: window.aOrtu, reset: aReset, naik: aNaik, alumni: aAlumni }[sub];
  if (!fn) return go('profil');
  await fn(rid);
}
const btnTambah = e => '<button class="btn sm" data-act="madd" data-e="' + e + '">' + ic('add', 'sm') + 'Tambah</button>';

async function aKelas(rid) {
  const [rk, rg] = await Promise.all([apiT('apiMasterList', 'kelas'), apiT('apiMasterList', 'guru')]);
  if (!aktif(rid)) return; if (!rk.success) return galat(rk, rid);
  S.adm.kelas = rk.data; S.adm.guru = rg.data || [];
  halaman(admHead('Kelas & Shift', btnTambah('kelas')) + '<div class="card"><div class="list">' + (rk.data.length ? rk.data.map(k =>
    '<div class="item"><div class="avatar ' + (k.aktif ? '' : 'warn') + '">' + esc(k.nama) + '</div><div class="grow"><div class="bold">Kelas ' + esc(k.nama) + ' <span class="chip">' + k.shift + '</span>' + (k.aktif ? '' : ' <span class="chip warn">Nonaktif</span>') + '</div><div class="small muted">' + esc(k.waliNama || 'Wali belum ditetapkan') + ' • ' + k.jumlahMurid + ' murid</div></div>' +
    '<button class="iconbtn" data-act="medit" data-e="kelas" data-id="' + k.id + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="mdel" data-e="kelas" data-id="' + k.id + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') : '<div class="empty">Belum ada kelas.</div>') + '</div></div>', rid);
}
/** ID sementara untuk murid yang belum punya NISN (contoh SM2026001). */
const isSementara = n => /^SM\d{7,}$/.test(String(n || ''));
const labelNisn = n => isSementara(n) ? 'ID sementara' : 'NISN';
function listMurid() {
  const A = S.adm, q = (A.mq || '').toLowerCase(), kf = A.mk || '', lim = A.mlim || 60;
  const f = (A.murid || []).filter(m => (!kf || (kf === '__sm' ? isSementara(m.nisn) : m.kelas === kf)) && (!q || m.nama.toLowerCase().indexOf(q) >= 0 || m.nisn.toLowerCase().indexOf(q) >= 0));
  return '<div class="small muted" style="margin-bottom:6px">' + f.length + ' murid</div><div class="list">' + f.slice(0, lim).map(m =>
    '<div class="item"><div class="avatar">' + esc(inisial(m.nama)) + '</div><div class="grow"><div class="bold">' + esc(m.nama) + '</div><div class="small muted">' + labelNisn(m.nisn) + ' ' + esc(m.nisn) + ' • ' + (m.kelas ? 'Kelas ' + esc(m.kelas) : 'Tanpa kelas') + (isSementara(m.nisn) ? ' <span class="chip warn">Belum ber-NISN</span>' : '') + '</div></div>' +
    '<button class="iconbtn" data-act="medit" data-e="murid" data-id="' + esc(m.nisn) + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="mdel" data-e="murid" data-id="' + esc(m.nisn) + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') + '</div>' +
    (f.length > lim ? '<button class="btn ghost block mt" data-act="mmore">Tampilkan lebih banyak</button>' : '');
}
async function aMurid(rid) {
  const [rm, rk] = await Promise.all([apiT('apiMasterList', 'murid'), apiT('apiMasterList', 'kelas')]);
  if (!aktif(rid)) return; if (!rm.success) return galat(rm, rid);
  S.adm.murid = rm.data; S.adm.kelas = rk.data || [];
  halaman(admHead('Murid', '<button class="btn sm soft" data-act="mimpor" data-e="murid">' + ic('upload_file', 'sm') + 'Impor</button>' + btnTambah('murid')) +
    '<div class="card"><div class="grid gr2"><div class="inp-ico">' + ic('search') + '<input class="inp" placeholder="Cari nama / NISN" data-inp="mq" value="' + esc(S.adm.mq || '') + '" aria-label="Cari murid"></div>' +
    '<select class="inp" data-chg="mk" aria-label="Filter kelas"><option value="">Semua kelas</option>' + rk.data.map(k => '<option' + (S.adm.mk === k.nama ? ' selected' : '') + ' value="' + esc(k.nama) + '">Kelas ' + esc(k.nama) + '</option>').join('') +
    (rm.data.some(m => isSementara(m.nisn)) ? '<option value="__sm"' + (S.adm.mk === '__sm' ? ' selected' : '') + '>Belum ber-NISN (ID sementara: ' + rm.data.filter(m => isSementara(m.nisn)).length + ')</option>' : '') + '</select></div><div id="mlist" class="mt">' + listMurid() + '</div></div>', rid);
}
function listGuru() {
  const q = (S.adm.gq || '').toLowerCase();
  const f = (S.adm.guru || []).filter(g => !q || g.nama.toLowerCase().indexOf(q) >= 0);
  return '<div class="small muted" style="margin-bottom:6px">' + f.length + ' guru</div><div class="list">' + f.map(g =>
    '<div class="item"><div class="avatar">' + esc(inisial(g.nama)) + '</div><div class="grow"><div class="bold">' + esc(g.nama) + (g.aktif ? '' : ' <span class="chip warn">Nonaktif</span>') + '</div><div class="small muted">' + esc(g.jenis) + ' • ' + esc(g.shift) + ' • ' + (g.wa ? esc(g.wa) : 'WA belum diisi') + '</div></div>' +
    '<button class="iconbtn" data-act="medit" data-e="guru" data-id="' + g.id + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="mdel" data-e="guru" data-id="' + g.id + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') + '</div>';
}
async function aGuru(rid) {
  const r = await apiT('apiMasterList', 'guru');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.guru = r.data;
  halaman(admHead('Guru', '<button class="btn sm soft" data-act="mimpor" data-e="guru">' + ic('upload_file', 'sm') + 'Impor</button>' + btnTambah('guru')) +
    '<div class="card"><div class="inp-ico">' + ic('search') + '<input class="inp" placeholder="Cari nama guru" data-inp="gq" value="' + esc(S.adm.gq || '') + '" aria-label="Cari guru"></div><div id="glist" class="mt">' + listGuru() + '</div></div>', rid);
}
async function aLibur(rid) {
  const r = await apiT('apiMasterList', 'libur');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.libur = r.data;
  halaman(admHead('Hari Libur', btnTambah('libur')) + '<div class="banner info mb">' + ic('info') + '<div>Sabtu &amp; Minggu otomatis libur. Tambahkan libur nasional / cuti bersama di sini agar tidak dihitung “terlewat”.</div></div><div class="card"><div class="list">' + (r.data.length ? r.data.map(l =>
    '<div class="item"><div class="avatar warn">' + ic('event_busy') + '</div><div class="grow"><div class="bold">' + esc(l.ket) + '</div><div class="small muted">' + fTgl(l.tanggal) + '</div></div><button class="iconbtn" data-act="medit" data-e="libur" data-id="' + l.id + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="mdel" data-e="libur" data-id="' + l.id + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') : '<div class="empty">Belum ada hari libur.</div>') + '</div></div>', rid);
}

// ── Form master ──
function formKelas(k) {
  k = k || { aktif: true, shift: 'Pagi' };
  const guru = (S.adm.guru || []).filter(g => g.aktif || g.id === k.waliId);
  return '<input type="hidden" name="id" value="' + esc(k.id || '') + '"><label class="f" for="fk-n">Nama kelas</label><input class="inp" id="fk-n" name="nama" maxlength="20" placeholder="Contoh: 1A" value="' + esc(k.nama || '') + '" required>' +
    '<label class="f" for="fk-s">Shift</label><select class="inp" id="fk-s" name="shift"><option' + (k.shift === 'Pagi' ? ' selected' : '') + '>Pagi</option><option' + (k.shift === 'Siang' ? ' selected' : '') + '>Siang</option></select>' +
    '<label class="f" for="fk-w">Wali kelas</label><select class="inp" id="fk-w" name="waliId"><option value="">— Belum ditetapkan —</option>' + guru.map(g => '<option value="' + g.id + '"' + (k.waliId === g.id ? ' selected' : '') + '>' + esc(g.nama) + '</option>').join('') + '</select>' +
    '<label class="check"><input type="checkbox" name="aktif"' + (k.aktif !== false ? ' checked' : '') + '> Kelas aktif</label>';
}
function formMurid(m) {
  m = m || {};
  const baru = !m.nisn, sem = isSementara(m.nisn);
  return '<input type="hidden" name="asalNisn" value="' + esc(m.nisn || '') + '">' +
    (sem ? '<div class="banner mb">' + ic('badge') + '<div>Murid ini memakai <b>ID sementara ' + esc(m.nisn) + '</b>. Bila NISN sudah terbit, <b>ganti isian di bawah dengan NISN asli</b> lalu Simpan. Riwayat presensi dan HP orang tua ikut pindah; kartu QR lama tetap berlaku sampai kartu baru dicetak.</div></div>' : '') +
    '<label class="f" for="fm-i">' + (sem ? 'NISN (ganti ID sementara dengan NISN asli)' : 'NISN') + '</label><input class="inp" id="fm-i" name="nisn" inputmode="numeric" maxlength="20" autocomplete="off" value="' + esc(m.nisn || '') + '" required>' +
    (baru ? '<label class="check"><input type="checkbox" name="sementara" data-chg="fmsem"> Belum punya NISN (mis. murid baru kelas 1) — buatkan ID sementara otomatis</label>' : '<div class="hint">Mengganti NISN akan memindahkan seluruh riwayat murid ke NISN baru. Kartu QR perlu dicetak ulang.</div>') +
    '<label class="f" for="fm-n">Nama lengkap</label><input class="inp" id="fm-n" name="nama" maxlength="80" value="' + esc(m.nama || '') + '" required>' +
    '<label class="f" for="fm-k">Kelas</label><select class="inp" id="fm-k" name="kelas"><option value="">— Tanpa kelas —</option>' + (S.adm.kelas || []).map(k => '<option' + (m.kelas === k.nama ? ' selected' : '') + ' value="' + esc(k.nama) + '">Kelas ' + esc(k.nama) + '</option>').join('') + '</select>';
}
function formGuru(g) {
  g = g || { aktif: true, jenis: 'Guru Kelas' };
  return '<input type="hidden" name="id" value="' + esc(g.id || '') + '"><label class="f" for="fg-n">Nama lengkap</label><input class="inp" id="fg-n" name="nama" maxlength="100" value="' + esc(g.nama || '') + '" required>' +
    '<label class="f" for="fg-p">NIP / NIKKI (dipakai untuk login)</label><input class="inp" id="fg-p" name="nip" maxlength="40" value="' + esc(g.nip || '') + '" required>' +
    '<label class="f" for="fg-w">No. WhatsApp</label><input class="inp" id="fg-w" name="wa" inputmode="tel" placeholder="08xxxxxxxxxx" value="' + esc(g.wa || '') + '">' +
    '<label class="f" for="fg-j">Jenis guru</label><select class="inp" id="fg-j" name="jenis"><option' + (g.jenis === 'Guru Kelas' ? ' selected' : '') + '>Guru Kelas</option><option' + (g.jenis === 'Guru Mapel' ? ' selected' : '') + '>Guru Mapel</option></select>' +
    '<label class="f" for="fg-s">Shift mengajar</label><select class="inp" id="fg-s" name="shift">' + ['Pagi', 'Siang', 'Pagi & Siang'].map(x => '<option' + ((g.shift || 'Pagi & Siang') === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select><div class="hint">Guru Mapel yang mengajar di kedua shift pilih “Pagi &amp; Siang”: ia dapat mengisi presensi kelas pada kedua shift.</div>' +
    '<label class="check"><input type="checkbox" name="aktif"' + (g.aktif !== false ? ' checked' : '') + '> Guru aktif</label>';
}
function formLibur(l) {
  l = l || {};
  return '<input type="hidden" name="id" value="' + esc(l.id || '') + '"><label class="f" for="fl-t">Tanggal</label><input class="inp" type="date" id="fl-t" name="tanggal" value="' + esc(l.tanggal || '') + '" required>' +
    '<label class="f" for="fl-k">Keterangan</label><input class="inp" id="fl-k" name="ket" maxlength="80" placeholder="Contoh: Hari Kemerdekaan" value="' + esc(l.ket || '') + '">';
}
const FORMS = { kelas: formKelas, murid: formMurid, guru: formGuru, libur: formLibur };
const JUDUL = { kelas: 'Kelas', murid: 'Murid', guru: 'Guru', libur: 'Hari Libur' };
function cariRec(e, id) {
  const l = S.adm[e] || [];
  return l.find(x => (e === 'murid' ? x.nisn : x.id) === id);
}
function bukaFormMaster(e, rec) {
  modal({
    title: (rec ? 'Ubah ' : 'Tambah ') + JUDUL[e], body: FORMS[e](rec), onOk: async f => {
      const fd = new FormData(f), o = {};
      fd.forEach((v, k) => { o[k] = v; });
      if (f.elements.aktif) o.aktif = f.elements.aktif.checked;
      if (e === 'murid' && o.asalNisn && o.nisn && o.asalNisn !== o.nisn.trim().toUpperCase() &&
        !await konfirmasi({ title: 'Ganti ' + labelNisn(o.asalNisn) + '?', html: '<b>' + esc(o.asalNisn) + '</b> → <b>' + esc(o.nisn.trim().toUpperCase()) + '</b><br><br>Seluruh riwayat presensi, scan, dan HP orang tua ikut dipindahkan. Kartu QR lama masih bisa dipakai sementara, tetapi sebaiknya <b>cetak ulang kartu</b> dengan NISN baru.', ok: 'Ganti' })) return false;
      const r = await apiT('apiMasterSave', e, o);
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: S.params.sub });
    }
  });
}

// ── Jadwal piket PER HARI ──
async function aPiket(rid) {
  const [r, rg] = await Promise.all([apiT('apiJadwalPiket'), apiT('apiMasterList', 'guru')]);
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.guru = rg.data || []; S.adm.jadwal = r.data;
  const t = todayStr();
  halaman(admHead('Jadwal Piket', '<button class="btn sm" data-act="pkbulan">' + ic('event_repeat', 'sm') + 'Piket Bulanan</button> <button class="btn sm soft" data-act="pkadd">' + ic('add', 'sm') + 'Per Tanggal</button>') + '<div class="banner info mb">' + ic('info') + '<div>Jadwal piket diatur <b>per hari</b>. Untuk beberapa hari sekaligus, isi “Sampai tanggal” — setiap hari tetap tersimpan terpisah dan bisa diubah satu per satu. Guru terjadwal otomatis mendapat menu Piket pada hari itu.</div></div>' +
    '<div class="card"><div class="list">' + (r.data.length ? r.data.map(j => '<div class="item"><div class="avatar ' + (j.tanggal === t ? 'ok' : (j.tanggal > t ? '' : 'warn')) + '" style="flex-direction:column;line-height:1.1"><span style="font-size:15px">' + pD(j.tanggal).getUTCDate() + '</span><span style="font-size:10px">' + BL[pD(j.tanggal).getUTCMonth()] + '</span></div><div class="grow"><div class="bold">' + fTgl(j.tanggal) + (j.tanggal === t ? ' <span class="chip ok">Hari ini</span>' : '') + (j.tanggal > t ? ' <span class="chip">Mendatang</span>' : '') + '</div>' +
      '<div class="small muted">' + (j.guru.length ? esc(j.guru.map(g => g.nama).join(', ')) : '—') + (j.catatan ? ' • ' + esc(j.catatan) : '') + '</div></div>' +
      '<button class="iconbtn" data-act="pkedit" data-id="' + j.tanggal + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="pkdel" data-id="' + j.tanggal + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') : '<div class="empty">' + ic('event_available') + 'Belum ada jadwal piket.</div>') + '</div></div>', rid);
}
function bukaFormPiketBulan(tpl) {
  const gr = (S.adm.guru || []).filter(g => g.aktif), now = todayStr().substr(0, 7);
  const hari = [1, 2, 3, 4, 5].map(d => '<label class="f">' + ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'][d] + '</label><div class="pickbox" style="max-height:120px;overflow:auto">' +
    gr.map(g => '<label class="check"><input type="checkbox" name="g' + d + '" value="' + g.id + '"' + ((tpl[d] || []).indexOf(g.id) >= 0 ? ' checked' : '') + '> ' + esc(g.nama) + '</label>').join('') + '</div>').join('');
  modal({ title: 'Jadwal Piket Bulanan',
    body: '<div class="hint">Isi sekali di awal bulan. Tiap hari kerja (Senin–Jumat) punya guru piket sendiri dan berulang sepanjang bulan. Sabtu, Minggu, dan hari libur otomatis dilewati.</div>' +
      '<div class="grid gr2"><div><label class="f" for="fb-b">Mulai bulan</label><input class="inp" type="month" id="fb-b" name="bulan" value="' + now + '" required></div>' +
      '<div><label class="f" for="fb-n">Berulang selama</label><select class="inp" id="fb-n" name="jumlah"><option value="1">1 bulan</option><option value="2">2 bulan</option><option value="3">3 bulan</option><option value="6">6 bulan</option></select></div></div>' + hari,
    onOk: async f => {
      const h = {}; for (let d = 1; d <= 5; d++) h[d] = $$('input[name=g' + d + ']:checked', f).map(x => x.value);
      const r = await apiT('apiSimpanPiketBulanan', { bulan: f.bulan.value, jumlahBulan: f.jumlah.value, hari: h });
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: 'piket' });
    } });
}
function bukaFormPiket(j) {
  const pilih = {}; (j ? j.guru : []).forEach(g => { pilih[g.id] = true; });
  modal({
    title: j ? 'Ubah Piket ' + fTglPendek(j.tanggal) : 'Atur Jadwal Piket',
    body: '<div class="grid gr2"><div><label class="f" for="fp-t">' + (j ? 'Tanggal' : 'Mulai tanggal') + '</label><input class="inp" type="date" id="fp-t" name="tanggal" value="' + (j ? j.tanggal : todayStr()) + '"' + (j ? ' readonly' : '') + ' required></div>' +
      (j ? '' : '<div><label class="f" for="fp-s">Sampai tanggal (opsional)</label><input class="inp" type="date" id="fp-s" name="sampai"></div>') + '</div>' +
      (j ? '' : '<label class="check"><input type="checkbox" name="lewati" checked> Lewati Sabtu, Minggu &amp; hari libur</label>') +
      '<label class="f">Guru piket</label><div class="pickbox">' +
      (S.adm.guru || []).filter(g => g.aktif).map(g => '<label class="check"><input type="checkbox" name="g" value="' + g.id + '"' + (pilih[g.id] ? ' checked' : '') + '> ' + esc(g.nama) + '</label>').join('') + '</div>' +
      '<label class="f" for="fp-c">Catatan (opsional)</label><input class="inp" id="fp-c" name="catatan" maxlength="100" value="' + esc(j ? j.catatan : '') + '">',
    onOk: async f => {
      const ids = $$('input[name=g]:checked', f).map(x => x.value);
      const r = await apiT('apiSimpanJadwalPiket', { tanggal: f.tanggal.value, sampai: f.sampai ? f.sampai.value : '', guruIds: ids, catatan: f.catatan.value, lewatiLibur: f.lewati ? f.lewati.checked : true });
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: 'piket' });
    }
  });
}

// ── Profil sekolah ──
async function aSekolah(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data; S.adm.pg = p;
  const opL = p.loginLatarOpacity === '' || p.loginLatarOpacity === undefined ? 55 : p.loginLatarOpacity;
  const latarCard = '<div class="card"><h3>Latar Belakang Login (Foto / Video)</h3><div class="ttprev" style="min-height:90px;align-items:center"><img id="lt-prev" alt="" style="display:none;max-width:100%;max-height:180px"><video id="lt-vid" muted loop playsinline style="display:none;max-width:100%;max-height:180px"></video><span id="lt-none" class="muted small">' + (p.loginLatarAda ? 'Memuat…' : 'Belum ada') + '</span></div>' +
    '<input class="inp mt" type="file" id="lt-f" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" aria-label="Berkas latar login"><div class="row wrap mt"><button class="btn grow" type="button" data-act="latup">' + ic('upload', 'sm') + 'Unggah</button>' + (p.loginLatarAda ? '<button class="btn ghost" type="button" data-act="latdel">' + ic('delete', 'sm') + 'Hapus</button>' : '') + '</div>' +
    '<label class="f" for="lt-op">Kekuatan gradien di atas latar: <b id="lt-opv">' + opL + '</b>%</label><input type="range" id="lt-op" min="0" max="100" value="' + opL + '" style="width:100%"><button class="btn sm soft mt" type="button" data-act="latop">Simpan gradien</button>' +
    '<div class="hint">Foto atau video (MP4/WebM, maks. sekitar 4 MB, diputar tanpa suara) tampil di belakang halaman masuk, di desktop dan mobile, dengan gradien warna dari menu Tampilan Login di atasnya.</div></div>';
  const fld = (k, l, ph) => '<label class="f" for="ps-' + k + '">' + l + '</label><input class="inp" id="ps-' + k + '" name="' + k + '" value="' + esc(p[k]) + '" placeholder="' + (ph || '') + '">';
  halaman(admHead('Profil Sekolah') + '<div class="grid gr2"><form class="card" id="f-sekolah" novalidate>' + fld('namaSekolah', 'Nama sekolah') + fld('npsn', 'NPSN') + fld('kepalaSekolah', 'Nama kepala sekolah') + fld('nipKepsek', 'NIP kepala sekolah') +
    '<button class="btn block mt" type="submit">Simpan Profil</button></form><div class="col">' +
    '<div class="card"><h3>Logo Sekolah</h3><div class="row wrap" style="align-items:flex-start"><div class="imgbox"><img class="imgprev" id="pv-logo" src="' + (p.logo || '') + '" alt="Logo" style="' + (p.logo ? '' : 'display:none') + '">' + (p.logo ? '' : '<span class="muted small" id="pv-logo-e">Belum ada</span>') + '</div><div class="grow" style="min-width:200px">' + dz('logo', 'Unggah logo', 'image/png,image/jpeg,image/webp', 'image') + '</div></div>' + (p.logo ? '<button class="btn ghost sm mt" data-act="asethapus" data-j="logo">' + ic('delete', 'sm') + 'Hapus logo</button>' : '') + '<div class="hint">Dipakai di kop PDF, halaman masuk, dan menu.</div></div>' +
    '<div class="card"><h3>Pattern Latar Belakang Halaman Masuk</h3><div class="row wrap" style="align-items:flex-start"><div class="imgbox patt" id="pv-pattern-box" style="' + (p.pattern ? "background-image:url('" + p.pattern + "')" : '') + '">' + (p.pattern ? '' : '<span class="muted small">Belum ada</span>') + '</div><div class="grow" style="min-width:200px">' + dz('pattern', 'Unggah pattern', 'image/png,image/jpeg,image/webp', 'texture') + '</div></div>' + (p.pattern ? '<button class="btn ghost sm mt" data-act="asethapus" data-j="pattern">' + ic('delete', 'sm') + 'Hapus pattern</button>' : '') + '<div class="hint">Gambar diulang (tile) sebagai latar. Pilih pola kecil yang kontrasnya lembut, mis. batik atau geometris.</div></div>' + latarCard + '</div></div>', rid);
  const lo = $('#lt-op'); if (lo) lo.addEventListener('input', e => { $('#lt-opv').textContent = e.target.value; });
  if (p.loginLatarAda) api('apiLoginLatar').then(rr => {
    const n = $('#lt-none'); if (!n) return;
    if (!rr.success || !rr.data.uri) { n.textContent = 'Gagal memuat pratinjau.'; return; }
    S.pub.loginLatar = rr.data; n.style.display = 'none';
    if (rr.data.tipe === 'video') { const v = $('#lt-vid'); v.src = rr.data.uri; v.style.display = ''; v.play().catch(() => {}); } else { const im = $('#lt-prev'); im.src = rr.data.uri; im.style.display = ''; }
  });
  $('#f-sekolah').addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = {}; new FormData(ev.target).forEach((v, k) => { o[k] = v; });
    const rr = await apiT('apiSimpanPengaturan', o);
    if (!rr.success) return toast(rr.message, 'err');
    toast(rr.message, 'ok'); S.pub.nama = o.namaSekolah; await reloadBoot();
  });
}
/** Logo: latar putih di sisi luar (yang menyentuh tepi gambar) dibuat transparan; putih di dalam logo dipertahankan. */
function resizeLogoTransparan(file, maks) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Gagal membaca berkas.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Berkas bukan gambar yang valid.'));
      img.onload = () => {
        const sk = Math.min(1, maks / Math.max(img.width, img.height)), w = Math.max(1, Math.round(img.width * sk)), h = Math.max(1, Math.round(img.height * sk));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
        const d = x.getImageData(0, 0, w, h), p = d.data, seen = new Uint8Array(w * h), st = [];
        const putih = i => p[i * 4 + 3] < 20 || (p[i * 4] > 232 && p[i * 4 + 1] > 232 && p[i * 4 + 2] > 232);
        const dorong = i => { if (!seen[i] && putih(i)) { seen[i] = 1; st.push(i); } };
        for (let a = 0; a < w; a++) { dorong(a); dorong((h - 1) * w + a); }
        for (let b = 0; b < h; b++) { dorong(b * w); dorong(b * w + w - 1); }
        while (st.length) {
          const i = st.pop(), px = i % w, py = (i - px) / w;
          if (px > 0) dorong(i - 1); if (px < w - 1) dorong(i + 1); if (py > 0) dorong(i - w); if (py < h - 1) dorong(i + w);
        }
        for (let i = 0; i < w * h; i++) if (seen[i]) p[i * 4 + 3] = 0;
        // haluskan tepi: piksel yang bersebelahan dengan latar dibuat setengah transparan bila hampir putih
        for (let i = 0; i < w * h; i++) {
          if (seen[i]) continue; const px = i % w, py = (i - px) / w;
          const tetangga = (px > 0 && seen[i - 1]) || (px < w - 1 && seen[i + 1]) || (py > 0 && seen[i - w]) || (py < h - 1 && seen[i + w]);
          if (tetangga) { const l = (p[i * 4] + p[i * 4 + 1] + p[i * 4 + 2]) / 3; if (l > 200) p[i * 4 + 3] = Math.max(0, Math.round((255 - l) * 4.6)); }
        }
        x.putImageData(d, 0, 0);
        res({ mime: 'image/png', base64: c.toDataURL('image/png').split(',')[1] });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
function resizeGambar(file, maks, png) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(new Error('Gagal membaca berkas.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => rej(new Error('Berkas bukan gambar yang valid.'));
      img.onload = () => {
        const sk = Math.min(1, maks / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * sk); c.height = Math.round(img.height * sk);
        const x = c.getContext('2d');
        if (!png) { x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); }
        x.drawImage(img, 0, 0, c.width, c.height);
        const mime = png ? 'image/png' : 'image/jpeg';
        res({ mime: mime, base64: c.toDataURL(mime, 0.85).split(',')[1] });
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}
async function unggahAset(f, j) {
  try {
    const g = (j === 'logo' || j === 'logoKiri') ? await resizeLogoTransparan(f, 512) : await resizeGambar(f, j === 'pattern' ? 640 : 512, f.type === 'image/png');
    const r = await apiT('apiUploadAset', { jenis: j, mime: g.mime, base64: g.base64 });
    if (!r.success) return toast(r.message, 'err');
    S.pub[j] = r.data.uri; toast(r.message, 'ok');
    if (j === 'logo' || j === 'logoKiri') { renderShell(); setNavAktif(); }
    go('admin', { sub: S.params.sub || 'sekolah' });
  } catch (e) { toast(e.message, 'err'); }
}

// ── Kop laporan ──
async function aKop(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data;
  const fld = (k, l, ph) => '<label class="f" for="pk-' + k + '">' + l + '</label><input class="inp" id="pk-' + k + '" name="' + k + '" value="' + esc(p[k]) + '" placeholder="' + esc(ph || '') + '" maxlength="200">';
  const box = (j, judul, uri, ket) => '<div class="card"><h3>' + judul + '</h3><div class="row wrap" style="align-items:flex-start"><div class="imgbox">' + (uri ? '<img class="imgprev" src="' + uri + '" alt="' + esc(judul) + '">' : '<span class="muted small">Belum ada</span>') + '</div><div class="grow" style="min-width:200px">' + dz(j, 'Unggah gambar', 'image/png,image/jpeg,image/webp', 'image') + '</div></div>' + (uri ? '<button class="btn ghost sm mt" data-act="asethapus" data-j="' + j + '">' + ic('delete', 'sm') + 'Hapus</button>' : '') + '<div class="hint">' + ket + '</div></div>';
  halaman(admHead('Kop Laporan') + '<div class="grid gr2"><form class="card" id="f-kop" novalidate>' +
    fld('kopBaris1', 'Nama Provinsi', 'PEMERINTAH PROVINSI DKI JAKARTA') + fld('kopBaris2', 'Dinas Pendidikan', 'DINAS PENDIDIKAN') + fld('namaSekolah', 'Nama Sekolah') + fld('alamat', 'Alamat Sekolah') +
    fld('kopEmail', 'Email Sekolah') + fld('kopTelp', 'No. Telepon Sekolah') + fld('kopKecamatan', 'Kecamatan') + fld('kopKelurahan', 'Kelurahan') + fld('kopKota', 'Kota Administrasi', 'Kota Administrasi Jakarta Utara') + fld('kopKodePos', 'Kode Pos') +
    '<button class="btn block mt" type="submit">Simpan Kop</button></form><div class="col">' +
    box('logoJaya', 'Logo Jaya Raya (kiri kop)', p.logoJaya, 'Tampil di sisi kiri kop pada PDF rekap.') + box('logoKiri', 'Logo Tambahan (kiri logo sekolah)', p.logoKiri, 'Tampil di sebelah kiri logo sekolah pada halaman login dan dashboard.') + box('logo', 'Logo Sekolah (kanan kop)', p.logo, 'Tampil di sisi kanan kop; juga dipakai di halaman masuk dan menu.') + '</div></div>', rid);
  $('#f-kop').addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = {}; new FormData(ev.target).forEach((v, k) => { o[k] = v; });
    const rr = await apiT('apiSimpanPengaturan', o);
    if (!rr.success) return toast(rr.message, 'err');
    toast(rr.message, 'ok'); S.pub.nama = o.namaSekolah; await reloadBoot();
  });
}

// ── Testimoni ──
async function aTesti(rid) {
  const [r, pg] = await Promise.all([apiT('apiTestimoniList'), apiT('apiGetPengaturan')]);
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.testi = r.data;
  const op = (pg.success && parseInt(pg.data.testiOpacity, 10)) || 60;
  const aktifT = !(pg.success && pg.data.testiAktif === 'false');
  halaman(admHead('Testimoni', '<button class="btn sm" data-act="tadd">' + ic('add', 'sm') + 'Tambah</button>') +
    '<div class="card"><label class="check"><input type="checkbox" id="tt-on"' + (aktifT ? ' checked' : '') + '> <b>Tampilkan testimoni di halaman login</b></label><div class="hint">Matikan untuk menyembunyikan seluruh bagian testimoni. Data testimoni tidak dihapus.</div></div>' +
    '<form class="card mt" id="f-top" novalidate><h3>Transparansi di Halaman Login</h3><div class="row"><input type="range" id="to-r" name="testiOpacity" min="20" max="100" step="5" value="' + op + '" style="flex:1" aria-label="Transparansi"><b id="to-v">' + op + '%</b></div>' +
    '<div class="hint">Makin rendah, testimoni makin samar agar tidak mengganggu form login. Menjadi jelas saat disentuh atau ditunjuk.</div><button class="btn sm mt" type="submit">Simpan</button></form>' +
    '<div class="card mt"><div class="list">' + (r.data.length ? r.data.map(t =>
    '<div class="item">' + avatarHtml({ foto: t.foto, nama: t.nama }, 44) + '<div class="grow" style="min-width:0"><div class="bold ell">' + esc(t.nama) + '</div>' + ((t.kelas || t.sekolah) ? '<div class="small" style="color:var(--primary)">' + esc([t.kelas ? 'Kelas ' + t.kelas : '', t.sekolah].filter(Boolean).join(' • ')) + '</div>' : '') + '<div class="small muted" style="white-space:normal;overflow-wrap:anywhere">' + esc(t.isi) + '</div></div>' +
    '<button class="iconbtn" data-act="tedit" data-id="' + t.id + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="tdel" data-id="' + t.id + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') : '<div class="empty">Belum ada testimoni.</div>') +
    '</div></div><div class="hint">Halaman masuk menampilkan 5 testimoni terbaru; sisanya lewat tombol “Selengkapnya”.</div>', rid);
  $('#tt-on').addEventListener('change', async e => {
    const rr = await apiT('apiSimpanPengaturan', { testiAktif: e.target.checked ? 'true' : 'false' });
    toast(rr.message, rr.success ? 'ok' : 'err'); if (rr.success) refreshTestiPub(); else e.target.checked = !e.target.checked;
  });
  $('#to-r').addEventListener('input', e => { $('#to-v').textContent = e.target.value + '%'; });
  $('#f-top').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = $('#to-r').value, rr = await apiT('apiSimpanPengaturan', { testiOpacity: v });
    toast(rr.message, rr.success ? 'ok' : 'err'); if (rr.success) S.pub.testiOpacity = +v;
  });
}
function bukaFormTesti(t) {
  t = t || {};
  const E = { img: null, dirty: false };
  modal({ title: t.id ? 'Ubah Testimoni' : 'Tambah Testimoni',
    body: '<label class="f" for="ft-n">Nama pengguna</label><input class="inp" id="ft-n" name="nama" maxlength="80" value="' + esc(t.nama || '') + '" required>' +
      '<label class="f" for="ft-k">Mengajar di kelas</label><input class="inp" id="ft-k" name="kelas" maxlength="60" placeholder="Contoh: 3A" value="' + esc(t.kelas || '') + '">' +
      '<label class="f" for="ft-s">Nama sekolah</label><input class="inp" id="ft-s" name="sekolah" maxlength="100" placeholder="Contoh: SDN Melati 01" value="' + esc(t.sekolah || '') + '">' +
      '<label class="f" for="ft-i">Deskripsi testimoni</label><textarea class="inp" id="ft-i" name="isi" rows="4" maxlength="400" required>' + esc(t.isi || '') + '</textarea>' +
      '<label class="f" for="ft-f">Foto (opsional)</label><input class="inp" id="ft-f" name="foto" type="file" accept="image/png,image/jpeg,image/webp">' +
      '<div class="fe ' + (t.foto ? '' : 'hidden') + '" id="fe"><canvas id="fe-cv" width="200" height="200" aria-label="Pratinjau foto"></canvas><div class="fe-ctl">' +
      '<label>Perbesar<input type="range" id="fe-z" min="1" max="3" step="0.05" value="1"></label><label>Geser kiri–kanan<input type="range" id="fe-x" min="-100" max="100" value="0"></label><label>Geser atas–bawah<input type="range" id="fe-y" min="-100" max="100" value="0"></label></div></div>' +
      (t.foto ? '<label class="check"><input type="checkbox" name="hapusFoto"> Hapus foto saat ini</label>' : ''),
    onOpen: f => {
      const cv = $('#fe-cv'), z = $('#fe-z'), x = $('#fe-x'), y = $('#fe-y');
      const draw = () => {
        const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 200, 200);
        if (!E.img) return;
        const w = E.img.naturalWidth, h = E.img.naturalHeight, k = Math.max(200 / w, 200 / h) * (+z.value), dw = w * k, dh = h * k;
        c.drawImage(E.img, (200 - dw) / 2 - (+x.value / 100) * Math.max(0, dw - 200) / 2, (200 - dh) / 2 - (+y.value / 100) * Math.max(0, dh - 200) / 2, dw, dh);
      };
      const muat = src => { const im = new Image(); im.onload = () => { E.img = im; $('#fe').classList.remove('hidden'); draw(); }; im.src = src; };
      if (t.foto) muat(t.foto);
      f.foto.addEventListener('change', () => {
        const file = f.foto.files && f.foto.files[0]; if (!file) return;
        const fr = new FileReader(); fr.onload = () => { z.value = 1; x.value = 0; y.value = 0; E.dirty = true; muat(fr.result); }; fr.readAsDataURL(file);
      });
      [z, x, y].forEach(el => el.addEventListener('input', () => { E.dirty = true; draw(); }));
    },
    onOk: async f => {
      const o = { id: t.id || '', nama: f.nama.value, kelas: f.kelas.value, sekolah: f.sekolah.value, isi: f.isi.value };
      const hapus = f.hapusFoto && f.hapusFoto.checked;
      if (hapus) o.hapusFoto = true;
      else if (E.img && E.dirty) { o.mime = 'image/jpeg'; o.base64 = $('#fe-cv').toDataURL('image/jpeg', 0.85).split(',')[1]; }
      const r = await apiT('apiTestimoniSimpan', o);
      if (!r.success) { toast(r.message, 'err'); return false; }
      tutupModal(); toast(r.message, 'ok'); refreshTestiPub(); go('admin', { sub: 'testi' });
    } });
}

// ── Hari efektif ──
async function aEfektif(rid) {
  const r = await apiT('apiEfektifList');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  halaman(admHead('Hari Efektif') + '<form class="card" id="f-ef" novalidate><h3>Hari belajar efektif per bulan</h3><div class="hint">Wajib diisi tiap bulan. Angka ini dipakai pada rekap guru kelas dan guru mapel (rumus: jumlah S/I/A ÷ ((hari efektif × jumlah murid) ÷ 100)). Saran = Senin–Jumat dikurangi hari libur yang sudah diinput.</div><div class="efg">' +
    r.data.map(x => '<div><label class="f" for="ef-' + x.bulan + '">' + esc(x.label) + '</label><input class="inp" type="number" min="0" max="31" inputmode="numeric" id="ef-' + x.bulan + '" name="' + x.bulan + '" value="' + esc(x.nilai) + '" placeholder="Saran: ' + x.saran + '"><div class="hint">Saran: ' + x.saran + ' hari</div></div>').join('') +
    '</div><button class="btn block mt" type="submit">Simpan Hari Efektif</button></form>', rid);
  $('#f-ef').addEventListener('submit', async ev => {
    ev.preventDefault();
    const items = r.data.map(x => ({ bulan: x.bulan, jumlah: ev.target[x.bulan].value }));
    const rr = await apiT('apiEfektifSimpan', items);
    toast(rr.message, rr.success ? 'ok' : 'err'); if (rr.success) await reloadBoot();
  });
}
// ── Jadwal guru mapel ──
const HARI_N = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
async function aMapel(rid) {
  const r = await apiT('apiMapelList');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.mapel = r.data; r.data.assign.sort((x, y) => x.guru.localeCompare(y.guru) || x.kelas.localeCompare(y.kelas));
  halaman(admHead('Jadwal Guru Mapel', '<button class="btn sm" data-act="mpadd">' + ic('add', 'sm') + 'Tambah</button>') +
    '<div class="hint">Buat guru dengan jenis “Guru Mapel” di menu Guru, lalu tentukan kelas, mata pelajaran, dan hari mengajarnya di sini. Jumlah pertemuan pada rekap dihitung dari hari mengajar yang presensi kelasnya sudah terkirim.</div>' +
    '<div class="card mt"><div class="list">' + (r.data.assign.length ? r.data.assign.map(a =>
      '<div class="item"><div class="grow" style="min-width:0"><div class="bold ell">' + esc(a.guru) + '</div><div class="small muted">Kelas ' + esc(a.kelas) + ' • ' + esc(a.mapel) + ' • ' + a.hari.map(n => HARI_N[n]).join(', ') + '</div></div>' +
      '<button class="iconbtn" data-act="mpedit" data-id="' + a.id + '" aria-label="Ubah">' + ic('edit') + '</button><button class="iconbtn" data-act="mpdel" data-id="' + a.id + '" aria-label="Hapus">' + ic('delete') + '</button></div>').join('') : '<div class="empty">Belum ada jadwal. ' + (r.data.guru.length ? '' : 'Belum ada guru berjenis Guru Mapel.') + '</div>') + '</div></div>', rid);
}
function bukaFormMapelBanyak() {
  const d = S.adm.mapel;
  if (!d.guru.length) return toast('Belum ada guru berjenis Guru Mapel. Tambahkan dulu di menu Guru.', 'err');
  modal({ title: 'Tambah Jadwal Guru Mapel',
    body: '<div class="hint">Pilih guru, mata pelajaran, lalu centang semua kelas dan hari mengajarnya sekaligus. Satu kali isi.</div>' +
      '<label class="f" for="mb-g">Guru mapel</label><select class="inp" id="mb-g" name="guruId">' + d.guru.map(g => '<option value="' + g.id + '">' + esc(g.nama) + '</option>').join('') + '</select>' +
      '<label class="f" for="mb-m">Mata pelajaran</label><input class="inp" id="mb-m" name="mapel" maxlength="60" required>' +
      '<label class="f">Kelas yang diajar <button type="button" class="btn sm ghost" id="mb-all" style="min-height:32px;padding:2px 10px">Pilih semua</button></label><div class="pickbox" style="max-height:150px;overflow:auto">' +
      d.kelas.map(k => '<label class="check"><input type="checkbox" name="kls" value="' + k.id + '"> Kelas ' + esc(k.nama) + '</label>').join('') + '</div>' +
      '<label class="f">Hari mengajar</label><div class="row wrap">' + [1, 2, 3, 4, 5, 6].map(n => '<label class="check"><input type="checkbox" name="hari" value="' + n + '"> ' + HARI_N[n] + '</label>').join('') + '</div>',
    onOpen: f => { $('#mb-all').addEventListener('click', () => { const bx = $$('input[name=kls]', f), semua = bx.every(x => x.checked); bx.forEach(x => { x.checked = !semua; }); }); },
    onOk: async f => {
      const r = await apiT('apiMapelSimpanBanyak', { guruId: f.guruId.value, mapel: f.mapel.value, kelasIds: $$('input[name=kls]:checked', f).map(x => x.value), hari: $$('input[name=hari]:checked', f).map(x => +x.value) });
      if (!r.success) { toast(r.message, 'err'); return false; }
      tutupModal(); toast(r.message, 'ok'); go('admin', { sub: 'mapel' });
    } });
}
function bukaFormMapel(a) {
  const d = S.adm.mapel; a = a || { hari: [] };
  modal({ title: a.id ? 'Ubah Jadwal Mengajar' : 'Tambah Jadwal Mengajar',
    body: '<label class="f" for="fm-g">Guru mapel</label><select class="inp" id="fm-g" name="guruId">' + d.guru.map(g => '<option value="' + g.id + '"' + (a.guruId === g.id ? ' selected' : '') + '>' + esc(g.nama) + '</option>').join('') + '</select>' +
      '<label class="f" for="fm-k">Kelas</label><select class="inp" id="fm-k" name="kelasId">' + d.kelas.map(k => '<option value="' + k.id + '"' + (a.kelasId === k.id ? ' selected' : '') + '>Kelas ' + esc(k.nama) + '</option>').join('') + '</select>' +
      '<label class="f" for="fm-m">Mata pelajaran</label><input class="inp" id="fm-m" name="mapel" maxlength="60" value="' + esc(a.mapel || '') + '" required>' +
      '<div class="f">Hari mengajar</div><div class="row wrap">' + [1, 2, 3, 4, 5, 6].map(n => '<label class="check"><input type="checkbox" name="hari" value="' + n + '"' + (a.hari.indexOf(n) >= 0 ? ' checked' : '') + '> ' + HARI_N[n] + '</label>').join('') + '</div>',
    onOk: async f => {
      const hari = [...f.querySelectorAll('input[name=hari]:checked')].map(x => +x.value);
      const r = await apiT('apiMapelSimpan', { id: a.id || '', guruId: f.guruId.value, kelasId: f.kelasId.value, mapel: f.mapel.value, hari: hari });
      if (!r.success) { toast(r.message, 'err'); return false; }
      tutupModal(); toast(r.message, 'ok'); go('admin', { sub: 'mapel' });
    } });
}

// ── Tanda tangan digital ──
async function aTtd(rid) {
  const r = await apiT('apiTtdList');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.ttd = r.data;
  const row = (id, judul, sub, uri) => '<div class="item"><div class="ttthumb">' + (uri ? '<img src="' + uri + '" alt="Tanda tangan ' + esc(judul) + '">' : '<span class="muted small">Belum ada</span>') + '</div><div class="grow" style="min-width:0"><div class="bold ell">' + esc(judul) + '</div><div class="small muted ell">' + esc(sub) + '</div></div>' +
    '<button class="btn sm soft" data-act="ttdup" data-id="' + id + '">' + ic('upload', 'sm') + (uri ? 'Ganti' : 'Unggah') + '</button>' + (uri ? '<button class="iconbtn" data-act="ttddel" data-id="' + id + '" aria-label="Hapus">' + ic('delete') + '</button>' : '') + '</div>';
  const k = r.data.kepsek;
  halaman(admHead('Tanda Tangan Digital') + '<div class="hint">Unggah foto atau scan tanda tangan di kertas putih. Latar putih dibersihkan otomatis menjadi transparan, lalu dipotong rapi. Tanda tangan tampil di atas nama pada lembar rekap.</div>' +
    '<div class="card mt"><h3>Kepala Sekolah</h3><div class="list">' + row('kepsek', k.nama || 'Kepala Sekolah', 'NIP. ' + (k.nip || '-'), k.uri) + '</div></div>' +
    '<div class="card mt"><h3>Guru</h3><div class="list">' + (r.data.guru.length ? r.data.guru.map(g => row(g.id, g.nama, 'NIP/NIKKI. ' + (g.nip || '-'), g.uri)).join('') : '<div class="empty">Belum ada guru.</div>') + '</div></div>', rid);
}
function prosesTtd(img, level) {
  const k = Math.min(1, 500 / img.naturalWidth), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h), p = d.data, T = 245 - level * 1.1;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let i = 0; i < p.length; i += 4) {
    if (level > 0) { const L = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]; p[i + 3] = Math.round(p[i + 3] * Math.min(1, Math.max(0, (T - L) / 40))); }
    if (p[i + 3] > 20) { const px = (i / 4) % w, py = Math.floor(i / 4 / w); if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  if (x1 < 0) return null;
  x.putImageData(d, 0, 0);
  const m = 3, sx = Math.max(0, x0 - m), sy = Math.max(0, y0 - m), sw = Math.min(w - sx, x1 - x0 + 1 + 2 * m), sh = Math.min(h - sy, y1 - y0 + 1 + 2 * m);
  const o = document.createElement('canvas'); o.width = sw; o.height = sh;
  o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, sw, sh);
  return o;
}
function bukaEditorTtd(id, nama) {
  const E = { img: null, hasil: null };
  modal({ title: 'Tanda Tangan: ' + nama,
    body: '<input class="inp" type="file" id="tt-f" accept="image/png,image/jpeg,image/webp" aria-label="Berkas tanda tangan"><div class="ttprev"><canvas id="tt-cv" width="400" height="150"></canvas></div>' +
      '<label class="f" for="tt-t">Pembersihan latar: <b id="tt-tv">60</b></label><input type="range" id="tt-t" min="0" max="100" value="60" style="width:100%">' +
      '<div class="hint">Geser ke kanan jika latar belum bersih, ke kiri jika goresan tipis ikut hilang. PNG yang sudah transparan: geser ke 0.</div>',
    onOpen: () => {
      const cv = $('#tt-cv'), sl = $('#tt-t');
      const gambar = () => {
        const c = cv.getContext('2d'); c.clearRect(0, 0, 400, 150);
        if (!E.img) return;
        E.hasil = prosesTtd(E.img, +sl.value);
        if (!E.hasil) return;
        const k = Math.min(400 / E.hasil.width, 150 / E.hasil.height, 1), w = E.hasil.width * k, h = E.hasil.height * k;
        c.drawImage(E.hasil, (400 - w) / 2, (150 - h) / 2, w, h);
      };
      $('#tt-f').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        const fr = new FileReader(); fr.onload = () => { const im = new Image(); im.onload = () => { E.img = im; gambar(); }; im.src = fr.result; }; fr.readAsDataURL(f);
      });
      sl.addEventListener('input', () => { $('#tt-tv').textContent = sl.value; gambar(); });
    },
    onOk: async () => {
      if (!E.hasil) { toast('Pilih gambar tanda tangan yang jelas dahulu.', 'err'); return false; }
      const b64 = E.hasil.toDataURL('image/png').split(',')[1];
      const r = await apiT('apiTtdSimpan', { id: id, mime: 'image/png', base64: b64 });
      if (!r.success) { toast(r.message, 'err'); return false; }
      tutupModal(); toast(r.message, 'ok'); go('admin', { sub: 'ttd' });
    } });
}
// ── Pengaturan cetak ──
async function aCetak(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data, kertas = p.cetakKertas === 'F4' ? 'F4' : 'A4', h = parseFloat(p.cetakMarginH) || 14, v = parseFloat(p.cetakMarginV) || 14;
  halaman(admHead('Pengaturan Cetak') + '<div class="grid gr2"><form class="card" id="f-cetak" novalidate>' +
    '<label class="f" for="ck-k">Ukuran kertas</label><select class="inp" id="ck-k" name="cetakKertas"><option value="A4"' + (kertas === 'A4' ? ' selected' : '') + '>A4 (210 × 297 mm)</option><option value="F4"' + (kertas === 'F4' ? ' selected' : '') + '>F4 / Folio (215 × 330 mm)</option></select>' +
    '<label class="f" for="ck-h">Margin kiri dan kanan (mm)</label><input class="inp" type="number" min="5" max="40" step="0.5" inputmode="decimal" id="ck-h" name="cetakMarginH" value="' + h + '">' +
    '<label class="f" for="ck-v">Margin atas dan bawah (mm)</label><input class="inp" type="number" min="5" max="40" step="0.5" inputmode="decimal" id="ck-v" name="cetakMarginV" value="' + v + '">' +
    '<div class="hint">Margin kiri sama dengan kanan, dan atas sama dengan bawah, supaya isi rata dan seimbang. Rekap bulanan otomatis landscape. Berlaku untuk semua lembar rekap PDF.</div><button class="btn block mt" type="submit">Simpan Pengaturan Cetak</button></form>' +
    '<div class="card"><h3>Pratinjau</h3><div class="kertasbox"><div class="kertas" id="kt"><div class="kt-isi" id="kt-isi"></div></div></div><div class="hint" id="kt-info"></div></div></div>', rid);
  const f = $('#f-cetak');
  const upd = () => {
    const F4 = f.cetakKertas.value === 'F4', W = F4 ? 215 : 210, H = F4 ? 330 : 297, mh = Math.min(40, Math.max(0, +f.cetakMarginH.value || 0)), mv = Math.min(40, Math.max(0, +f.cetakMarginV.value || 0));
    $('#kt').style.aspectRatio = W + ' / ' + H;
    $('#kt-isi').style.cssText = 'left:' + (mh / W * 100) + '%;right:' + (mh / W * 100) + '%;top:' + (mv / H * 100) + '%;bottom:' + (mv / H * 100) + '%';
    $('#kt-info').textContent = 'Area cetak: ' + (W - 2 * mh).toFixed(1) + ' × ' + (H - 2 * mv).toFixed(1) + ' mm';
  };
  f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = {}; new FormData(f).forEach((val, key) => { o[key] = val; });
    const rr = await apiT('apiSimpanPengaturan', o);
    toast(rr.message, rr.success ? 'ok' : 'err');
  });
}

// ── Tampilan halaman login ──
const LG_DEF = { loginSapaan: 'Hai, Selamat Datang!', loginSubjudul: 'Presensi murid jadi rapi, cepat, dan akurat', loginDeskripsi: '', loginJudulForm: 'Selamat Datang Kembali', loginSubForm: 'Masuk untuk mengisi dan merekap presensi murid', loginWarna1: '#7cc4ff', loginWarna2: '#8da2fb', loginWarnaTombol: '#1d4ed8', loginWarnaTeks: '#0f172a', loginTema: 'kartu',
  loginNamaApp: '', loginNamaFull: '', loginLogoUkuran: '58', loginNamaUkuran: '26', loginNamaSubUkuran: '12', loginMediaMode: 'ganti', loginMediaBentuk: 'membulat', loginMediaUkuran: '320' };
const LG_GAYA = [['nama', 'Nama aplikasi (SIPMUR EDU)', '800'], ['full', 'Keterangan nama aplikasi', '500'], ['sapa', 'Judul besar', '800'], ['sub', 'Subjudul', '400'], ['desk', 'Deskripsi', '400'], ['judul', 'Judul kartu masuk', '800'], ['subf', 'Keterangan kartu masuk', '400']];
const LG_BOBOT = [['300', 'Tipis'], ['400', 'Normal'], ['500', 'Sedang'], ['600', 'Agak tebal'], ['700', 'Tebal'], ['800', 'Sangat tebal']];
function lgMap(o, ada) {
  const g = {}; LG_GAYA.forEach(x => { g[x[0]] = o['loginGaya_' + x[0]] || ''; });
  return { sapaan: o.loginSapaan, subjudul: o.loginSubjudul, deskripsi: o.loginDeskripsi, judulForm: o.loginJudulForm, subForm: o.loginSubForm, warna1: o.loginWarna1, warna2: o.loginWarna2, tombol: o.loginWarnaTombol, teks: o.loginWarnaTeks,
    tema: o.loginTema, latar: (S.pub.login || {}).latar, namaApp: o.loginNamaApp, namaFull: o.loginNamaFull, logoUk: o.loginNamaApp === undefined ? '' : o.loginLogoUkuran, namaUk: o.loginNamaUkuran, subUk: o.loginNamaSubUkuran, gaya: g, media: { ada: ada, mode: o.loginMediaMode, bentuk: o.loginMediaBentuk, ukuran: o.loginMediaUkuran } };
}
async function aLoginUI(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data, v = k => p[k] || LG_DEF[k], ada = !!p.loginMediaAda;
  const tx = (k, l, mx, area) => '<label class="f" for="lu-' + k + '">' + l + '</label>' + (area ? '<textarea class="inp" rows="2"' : '<input class="inp"') + ' id="lu-' + k + '" name="' + k + '" maxlength="' + mx + '"' + (area ? '>' + esc(v(k)) + '</textarea>' : ' value="' + esc(v(k)) + '">');
  const tx2 = (k, l, mx, ph) => '<label class="f" for="lu-' + k + '">' + l + '</label><input class="inp" id="lu-' + k + '" name="' + k + '" maxlength="' + mx + '" value="' + esc(p[k] || '') + '" placeholder="' + esc(ph) + '">';
  const cl = (k, l) => '<label class="f" for="lu-' + k + '">' + l + '</label><div class="row"><input type="color" id="lu-' + k + '" name="' + k + '" value="' + v(k) + '" style="width:64px;height:46px;padding:2px;border-radius:12px;border:1.5px solid var(--border);background:var(--surface)"><b id="hx-' + k + '" class="small">' + v(k) + '</b></div>';
  const rg = (k, l, mn, mx) => '<label class="f" for="lu-' + k + '">' + l + ': <b id="rv-' + k + '">' + v(k) + '</b></label><input type="range" id="lu-' + k + '" name="' + k + '" min="' + mn + '" max="' + mx + '" value="' + v(k) + '" style="width:100%">';
  const sel = (k, l, opts) => '<label class="f" for="lu-' + k + '">' + l + '</label><select class="inp" id="lu-' + k + '" name="' + k + '">' + opts.map(o => '<option value="' + o[0] + '"' + (v(k) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>';
  const gy = LG_GAYA.map(([id, lb, dw]) => {
    const a = String(p['loginGaya_' + id] || '').split('|'), w = a[0] || dw, it = a[1] === '1', c = a[2] || '';
    return '<div class="gy"><div class="gy-t">' + lb + '</div><div class="gy-c"><select class="inp" name="w_' + id + '" aria-label="Ketebalan ' + lb + '">' + LG_BOBOT.map(b => '<option value="' + b[0] + '"' + (w === b[0] ? ' selected' : '') + '>' + b[1] + '</option>').join('') + '</select>' +
      '<label class="check"><input type="checkbox" name="i_' + id + '"' + (it ? ' checked' : '') + '> Miring</label><input type="color" name="c_' + id + '" value="' + (c || '#ffffff') + '" aria-label="Warna ' + lb + '"><label class="check"><input type="checkbox" name="a_' + id + '"' + (c ? '' : ' checked') + '> Warna otomatis</label></div></div>';
  }).join('');
  const lbox = (j, judul, uri, ket) => '<div class="card"><h3>' + judul + '</h3><div class="row wrap" style="align-items:flex-start"><div class="imgbox">' + (uri ? '<img class="imgprev" src="' + uri + '" alt="' + judul + '">' : '<span class="muted small">Belum ada</span>') + '</div><div class="grow" style="min-width:200px">' + dz(j, 'Unggah logo', 'image/png,image/jpeg,image/webp', 'image') + '</div></div>' + (uri ? '<button class="btn ghost sm mt" data-act="asethapus" data-j="' + j + '">' + ic('delete', 'sm') + 'Hapus</button>' : '') + '<div class="hint">' + ket + '</div></div>';
  halaman(admHead('Tampilan Login') + '<div class="grid gr2"><form class="card" id="f-lu" novalidate>' +
    '<h3>Gaya halaman</h3>' + sel('loginTema', 'Gaya', [['kartu', 'Kartu terang (seperti desain baru)'], ['gradien', 'Gradien penuh (desain sebelumnya)']]) + '<h3 class="mt">Teks</h3>' + tx('loginSapaan', 'Judul besar', 60) + tx('loginSubjudul', 'Subjudul', 120) + tx('loginDeskripsi', 'Deskripsi (kosong = pakai tagline aplikasi)', 220, true) + tx('loginJudulForm', 'Judul kartu masuk', 50) + tx('loginSubForm', 'Keterangan kartu masuk', 100) +
    tx2('loginNamaApp', 'Nama aplikasi', 30, S.pub.app) + tx2('loginNamaFull', 'Keterangan nama aplikasi', 80, S.pub.appFull + ' ' + S.pub.nama) +
    '<h3 class="mt">Ukuran</h3>' + rg('loginLogoUkuran', 'Tinggi logo sekolah (px)', 20, 160) + rg('loginNamaUkuran', 'Ukuran tulisan “nama aplikasi” (px)', 14, 60) + rg('loginNamaSubUkuran', 'Ukuran keterangan nama aplikasi (px)', 8, 24) +
    '<h3 class="mt">Gaya tulisan</h3><div class="hint">Atur ketebalan, huruf miring, dan warna tiap tulisan. “Warna otomatis” mengikuti warna tulisan umum.</div>' + gy +
    '<h3 class="mt">Warna</h3><div class="hint">Pada gaya Kartu terang, warna latar dilembutkan otomatis dan tulisan putih otomatis diganti gelap agar terbaca.</div>' + cl('loginWarna1', 'Warna latar (awal)') + cl('loginWarna2', 'Warna latar (akhir)') + cl('loginWarnaTombol', 'Warna tombol dan tab') + cl('loginWarnaTeks', 'Warna tulisan umum di latar') +
    '<h3 class="mt">Foto / animasi</h3>' + sel('loginMediaMode', 'Penempatan', [['ganti', 'Gantikan ilustrasi anak-anak'], ['tambah', 'Tampil di bawah ilustrasi']]) + sel('loginMediaBentuk', 'Bentuk', [['kotak', 'Kotak'], ['membulat', 'Sudut membulat'], ['lingkaran', 'Lingkaran']]) + rg('loginMediaUkuran', 'Lebar gambar (px)', 80, 520) +
    '<div class="row wrap mt"><button class="btn grow" type="submit">Simpan</button><button class="btn soft" type="button" id="lu-reset">Kembalikan bawaan</button></div></form>' +
    '<div class="col"><div class="card"><h3>Pratinjau</h3><div class="lgprev" id="lgp"><div class="row" style="gap:10px;align-items:center"><img id="lgp-logo" alt="" style="' + (S.pub.logo ? '' : 'display:none') + '" src="' + (S.pub.logo || '') + '"><div><div id="lgp-n"></div><small id="lgp-f"></small></div></div><b id="lgp-s"></b><span id="lgp-u"></span><i id="lgp-b">Masuk</i></div></div>' +
    lbox('logoKiri', 'Logo Tambahan (kiri logo sekolah)', p.logoKiri, 'Tampil di sebelah kiri logo sekolah, tanpa latar putih. Latar putih di sisi luar logo dihapus otomatis saat diunggah.') + lbox('logo', 'Logo Sekolah', p.logo, 'Tampil di halaman login dan dashboard, tanpa kotak putih.') + '<div class="card"><h3>Unggah foto atau GIF</h3><div class="ttprev" style="min-height:90px;align-items:center"><img id="lm-prev" alt="" style="display:none;max-width:100%;max-height:200px"><span id="lm-none" class="muted small">' + (ada ? 'Memuat…' : 'Belum ada gambar') + '</span></div>' +
    '<input class="inp mt" type="file" id="lm-f" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Berkas foto atau GIF"><div class="row wrap mt"><button class="btn grow" type="button" data-act="lmup">' + ic('upload', 'sm') + 'Unggah</button>' + (ada ? '<button class="btn ghost" type="button" data-act="lmdel">' + ic('delete', 'sm') + 'Hapus</button>' : '') + '</div>' +
    '<div class="hint">GIF bergerak didukung (maks. sekitar 2 MB). Foto biasa dikecilkan otomatis. Penempatan, bentuk, dan lebar diatur di formulir kiri lalu disimpan.</div></div></div></div>', rid);
  if (ada) api('apiLoginMedia').then(rr => { const im = $('#lm-prev'); if (!im) return; if (rr.success && rr.data.uri) { im.src = rr.data.uri; im.style.display = ''; $('#lm-none').style.display = 'none'; S.pub.loginMediaUri = rr.data.uri; } else $('#lm-none').textContent = 'Gagal memuat pratinjau.'; });
  const f = $('#f-lu');
  const gayaDari = id => f['w_' + id].value + '|' + (f['i_' + id].checked ? 1 : 0) + '|' + (f['a_' + id].checked ? '' : f['c_' + id].value);
  const upd = () => {
    ['loginWarna1', 'loginWarna2', 'loginWarnaTombol', 'loginWarnaTeks'].forEach(k => { $('#hx-' + k).textContent = f[k].value; });
    ['loginLogoUkuran', 'loginNamaUkuran', 'loginNamaSubUkuran', 'loginMediaUkuran'].forEach(k => { $('#rv-' + k).textContent = f[k].value; });
    const g = $('#lgp'), kt = f.loginTema.value !== 'gradien', c1 = f.loginWarna1.value, c2 = f.loginWarna2.value;
    const tc = (kt && f.loginWarnaTeks.value.toLowerCase() === '#ffffff') ? '#0f172a' : f.loginWarnaTeks.value;
    g.style.background = kt ? 'linear-gradient(120deg,color-mix(in srgb,' + c1 + ' 30%,#fff),color-mix(in srgb,' + c2 + ' 42%,#fff))' : 'linear-gradient(120deg,' + c1 + ',' + c2 + ')'; g.style.color = tc;
    const st = (el, id, uk) => { const a = gayaDari(id).split('|'); el.style.fontWeight = a[0]; el.style.fontStyle = a[1] === '1' ? 'italic' : 'normal'; el.style.color = a[2] || tc; if (uk) el.style.fontSize = Math.min(uk, 40) + 'px'; };
    $('#lgp-n').textContent = f.loginNamaApp.value || S.pub.app; $('#lgp-f').textContent = f.loginNamaFull.value || (S.pub.appFull + ' ' + S.pub.nama);
    st($('#lgp-n'), 'nama', +f.loginNamaUkuran.value); st($('#lgp-f'), 'full', +f.loginNamaSubUkuran.value);
    $('#lgp-logo').style.height = Math.min(+f.loginLogoUkuran.value, 90) + 'px';
    const s = $('#lgp-s'), u = $('#lgp-u'); s.textContent = f.loginSapaan.value; u.textContent = f.loginSubjudul.value; st(s, 'sapa'); st(u, 'sub');
    $('#lgp-b').style.background = f.loginWarnaTombol.value;
  };
  f.addEventListener('input', upd); f.addEventListener('change', upd); upd();
  $('#lu-reset').addEventListener('click', () => {
    Object.keys(LG_DEF).forEach(k => { f[k].value = LG_DEF[k]; });
    LG_GAYA.forEach(([id, , dw]) => { f['w_' + id].value = dw; f['i_' + id].checked = false; f['a_' + id].checked = true; }); upd();
  });
  f.addEventListener('submit', async ev => {
    ev.preventDefault();
    const o = {}; Object.keys(LG_DEF).forEach(k => { o[k] = f[k].value; });
    LG_GAYA.forEach(([id]) => { o['loginGaya_' + id] = gayaDari(id); });
    const rr = await apiT('apiSimpanPengaturan', o);
    toast(rr.message, rr.success ? 'ok' : 'err');
    if (rr.success) S.pub.login = lgMap(o, ada || !!S.pub.loginMediaUri);
  });
}

// ── Musik latar ──// ── Musik latar ──
async function aMusik(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const m = r.data.musik || { volume: 40 };
  halaman(admHead('Musik Latar') + '<div class="grid gr2"><div class="card"><h3>Berkas Musik</h3>' +
    (m.ada ? '<div class="banner info">' + ic('music_note') + '<div class="grow" style="overflow-wrap:anywhere"><b>' + esc(m.nama) + '</b></div></div>' : '<div class="empty small">Belum ada musik.</div>') +
    '<label class="f" for="mu-f">Unggah musik (MP3/M4A/OGG/WAV, maks 4 MB)</label><input class="inp" id="mu-f" type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav">' +
    '<button class="btn block mt" data-act="musikup">' + ic('upload', 'sm') + 'Unggah</button>' + (m.ada ? '<button class="btn ghost sm mt" data-act="musikdel">' + ic('delete', 'sm') + 'Hapus musik</button>' : '') + '</div>' +
    '<form class="card" id="f-musik" novalidate><h3>Pengaturan</h3><label class="check"><input type="checkbox" name="aktif"' + (m.aktif ? ' checked' : '') + '> Putar musik setelah login</label>' +
    '<label class="f" for="mu-v">Volume: <b id="mu-vv">' + m.volume + '%</b></label><input type="range" id="mu-v" name="volume" min="0" max="100" value="' + m.volume + '" style="width:100%">' +
    '<div class="hint">Musik berhenti saat keluar. Pengguna dapat menjeda lewat ikon musik di bilah atas. Sebagian peramban butuh satu ketukan layar sebelum suara bisa diputar.</div><button class="btn block mt" type="submit">Simpan</button></form></div>', rid);
  $('#mu-v').addEventListener('input', e => { $('#mu-vv').textContent = e.target.value + '%'; });
  $('#f-musik').addEventListener('submit', async ev => {
    ev.preventDefault();
    const rr = await apiT('apiSimpanMusik', { aktif: ev.target.aktif.checked, volume: ev.target.volume.value });
    toast(rr.message, rr.success ? 'ok' : 'err');
    if (rr.success) { await reloadBoot(); mulaiMusik(); }
  });
}

// ── Jam presensi per shift ──
async function aJamScan(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const a = r.data.aturanScan, b = r.data.aturanBawaan;
  const titik = t => String(t).replace(':', '.');
  const kartu = (sh, k) => '<div class="card mt"><h3>' + ic(sh === 'Pagi' ? 'wb_sunny' : 'wb_twilight', 'sm') + ' Shift ' + sh + '</h3>' +
    '<div class="grid gr2"><div><label class="f" for="js-b' + k + '">Presensi dibuka pukul</label><input type="time" class="inp" id="js-b' + k + '" name="b' + k + '" value="' + esc(a[sh].buka) + '" required></div>' +
    '<div><label class="f" for="js-t' + k + '">Tepat waktu sampai pukul</label><input type="time" class="inp" id="js-t' + k + '" name="t' + k + '" value="' + esc(a[sh].batas) + '" required></div></div>' +
    '<div class="hint">Bawaan: buka ' + titik(b[sh].buka) + ', batas ' + titik(b[sh].batas) + ' WIB.</div></div>';
  halaman(admHead('Jam Presensi') + '<div class="banner info">' + ic('info') + '<div>Atur jam presensi QR untuk tiap shift. <b>Scan sebelum jam buka ditolak.</b> Scan antara jam buka dan batas = <b>tepat waktu</b>. Setelah menit batas terlewati, scan tetap tercatat dengan status <b>terlambat</b> (lama telat dihitung dari jam batas). Shift tiap kelas diatur di Data Master → Kelas &amp; Shift. Sekolah dengan satu shift cukup memakai Shift Pagi.</div></div>' +
    '<form id="f-jam" novalidate>' + kartu('Pagi', 'P') + kartu('Siang', 'S') +
    '<button class="btn block mt" type="submit">' + ic('save', 'sm') + 'Simpan</button><button type="button" class="btn soft block mt" id="jam-bawaan">' + ic('restart_alt', 'sm') + 'Kembalikan ke bawaan</button></form>' +
    '<div class="small muted mt">Halaman Scan yang sedang terbuka perlu dimuat ulang agar memakai jam yang baru.</div>', rid);
  const f = $('#f-jam');
  const simpan = async o => { const rr = await apiT('apiSimpanPengaturan', o); toast(rr.message, rr.success ? 'ok' : 'err'); if (rr.success) { cacheBersih(); go('admin', { sub: 'jamscan' }); } };
  f.addEventListener('submit', ev => { ev.preventDefault(); simpan({ jamBukaScan: f.bP.value, jamBatasScan: f.tP.value, jamBukaScanSiang: f.bS.value, jamBatasScanSiang: f.tS.value }); });
  $('#jam-bawaan').addEventListener('click', () => simpan({ jamBukaScan: '', jamBatasScan: '', jamBukaScanSiang: '', jamBatasScanSiang: '' }));
}

// ── Tahun ajaran ──
async function aTahun(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data, akt = p.tahunAjaranAktif, oto = p.tahunAjaranOtomatis, manual = p.tahunAjaranMode === 'manual';
  const y = +todayStr().substr(0, 4), opsi = [];
  for (let i = y - 2; i <= y + 3; i++) opsi.push(i + '/' + (i + 1));
  const sel = manual && p.tahunAjaran ? p.tahunAjaran : akt.tahunAjaran;
  const [a, b] = akt.tahunAjaran.split('/').map(Number);
  const next = akt.semester === 'Ganjil' ? { ta: akt.tahunAjaran, sm: 'Genap' } : { ta: (a + 1) + '/' + (b + 1), sm: 'Ganjil' };
  halaman(admHead('Tahun Ajaran') + '<div class="hero"><div class="lbl">Tahun ajaran aktif</div><div class="big">' + esc(akt.tahunAjaran) + '</div><div class="lbl">Semester ' + esc(akt.semester) + ' • ' + (manual ? 'diatur manual' : 'otomatis mengikuti kalender') + '</div></div>' +
    '<form class="card mt" id="f-ta" novalidate><h3>Pengaturan</h3>' +
    '<label class="check"><input type="radio" name="mode" value="auto"' + (manual ? '' : ' checked') + '> Otomatis <span class="muted small">(Juli–Des: Ganjil, Jan–Jun: Genap → ' + esc(oto.tahunAjaran) + ' ' + esc(oto.semester) + ')</span></label>' +
    '<label class="check"><input type="radio" name="mode" value="manual"' + (manual ? ' checked' : '') + '> Manual</label>' +
    '<div class="grid gr2" id="ta-man" style="' + (manual ? '' : 'opacity:.5') + '"><div><label class="f" for="ta-t">Tahun ajaran</label><select class="inp" id="ta-t" name="ta">' + opsi.map(o => '<option' + (o === sel ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div>' +
    '<div><label class="f" for="ta-s">Semester</label><select class="inp" id="ta-s" name="sm"><option' + (akt.semester === 'Ganjil' ? ' selected' : '') + '>Ganjil</option><option' + (akt.semester === 'Genap' ? ' selected' : '') + '>Genap</option></select></div></div>' +
    '<button class="btn block mt" type="submit">Simpan</button><button type="button" class="btn soft block mt" data-act="tanext" data-ta="' + next.ta + '" data-sm="' + next.sm + '">' + ic('skip_next', 'sm') + 'Pindah ke ' + next.ta + ' • ' + next.sm + '</button></form>' +
    '<div class="banner info mt">' + ic('info') + '<div><b>Berganti tahun ajaran?</b> Riwayat presensi lama tetap tersimpan dan dapat dilihat lewat rentang tanggal di menu Rekap. Perbarui kelas, wali kelas, dan murid (naik kelas) di menu Data Master; murid lulus bisa dipindah ke “Tanpa kelas” atau dihapus.</div></div>', rid);
  $('#f-ta').addEventListener('change', ev => { if (ev.target.name === 'mode') $('#ta-man').style.opacity = ev.target.value === 'manual' ? 1 : .5; });
  $('#f-ta').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    const mode = f.mode.value;
    const r = await apiT('apiSimpanPengaturan', { tahunAjaranMode: mode, tahunAjaran: mode === 'manual' ? f.ta.value : '', semester: mode === 'manual' ? f.sm.value : '' });
    toast(r.message, r.success ? 'ok' : 'err'); if (r.success) { await reloadBoot(); go('admin', { sub: 'tahun' }); }
  });
}

// ── Running text ──
async function aRunning(rid) {
  const r = await apiT('apiGetPengaturan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data;
  const pre = [['#ffffff', '#1d4ed8'], ['#2a1700', '#fea619'], ['#ffffff', '#15803d'], ['#ffffff', '#b91c1c'], ['#fef08a', '#172554'], ['#111827', '#e2e8f0']];
  halaman(admHead('Running Text') + '<div class="card"><h3>Pratinjau</h3><div id="rt-prev"></div></div>' +
    '<form class="card mt" id="f-rt" novalidate><label class="check"><input type="checkbox" name="aktif"' + (p.marqueeAktif !== 'false' ? ' checked' : '') + '> Tampilkan running text</label>' +
    '<label class="f" for="rt-t">Teks (maks. 300 karakter)</label><textarea class="inp" id="rt-t" name="text" maxlength="300">' + esc(p.marqueeText) + '</textarea>' +
    '<div class="grid gr2"><div><label class="f" for="rt-c">Warna huruf</label><input class="inp colorinp" type="color" id="rt-c" name="color" value="' + esc(p.marqueeColor || '#ffffff') + '"></div><div><label class="f" for="rt-b">Warna latar</label><input class="inp colorinp" type="color" id="rt-b" name="bg" value="' + esc(p.marqueeBg || '#1d4ed8') + '"></div></div>' +
    '<label class="f">Pilihan cepat</label><div class="row wrap">' + pre.map(c => '<button type="button" class="swatch" data-act="rtpre" data-c="' + c[0] + '" data-b="' + c[1] + '" style="color:' + c[0] + ';background:' + c[1] + '" aria-label="Warna huruf ' + c[0] + ' latar ' + c[1] + '">Aa</button>').join('') + '</div>' +
    '<label class="f" for="rt-s">Kecepatan: <span id="rt-sv">' + esc(p.marqueeSpeed || '5') + '</span> <span class="muted">(1 lambat – 10 cepat)</span></label><input type="range" id="rt-s" name="speed" min="1" max="10" step="1" value="' + esc(p.marqueeSpeed || '5') + '" style="width:100%;accent-color:var(--primary)">' +
    '<button class="btn block mt" type="submit">Simpan Running Text</button></form>', rid);
  const f = $('#f-rt');
  const nilai = () => ({ aktif: f.aktif.checked, text: f.text.value, color: f.color.value, bg: f.bg.value, speed: +f.speed.value });
  const pv = () => { $('#rt-sv').textContent = f.speed.value; const m = nilai(); $('#rt-prev').innerHTML = marqueeHtml(Object.assign({}, m, { aktif: true })) || '<div class="muted small">Teks kosong.</div>'; };
  f.addEventListener('input', pv); f.addEventListener('change', pv); pv();
  f.addEventListener('submit', async ev => {
    ev.preventDefault(); const m = nilai();
    const rr = await apiT('apiSimpanPengaturan', { marqueeAktif: m.aktif, marqueeText: m.text, marqueeColor: m.color, marqueeBg: m.bg, marqueeSpeed: String(m.speed) });
    toast(rr.message, rr.success ? 'ok' : 'err');
    if (rr.success) { await reloadBoot(); reRenderAll(); }
  });
}

// ── Mode demo Alpa otomatis ──
function demoTampil(d) {
  const box = $('#demo-hasil'); if (!box) return;
  if (!d || !d.ada) { box.innerHTML = '<div class="small muted">Belum ada data demo.</div>'; return; }
  const chip = s => s.indexOf('Hadir') === 0 ? 'ok' : s === 'Alpa' ? 'err' : s === 'Belum ada catatan' ? 'warn' : '';
  box.innerHTML = '<div class="small bold">Hasil untuk tanggal ' + esc(d.tanggal) + '</div><div class="list">' + d.baris.map(b => '<div class="item"><div class="grow"><div class="bold small">' + esc(b.nama) + '</div><div class="small muted">' + esc(b.ket || '—') + (b.oleh ? ' • ' + esc(b.oleh) : '') + '</div></div><span class="chip ' + chip(b.status) + '">' + esc(b.status) + '</span></div>').join('') + '</div>' +
    '<div class="banner ' + (d.kirim ? 'ok' : 'info') + ' mt">' + (d.kirim ? '<div><b>Kelas terkirim (' + esc(d.kirim.status) + ')</b> oleh ' + esc(d.kirim.oleh) + ' • ' + esc(d.kirim.jumlah) + ' tidak masuk</div>' : '<div>Kelas belum terkirim. Tekan “Jalankan Pergantian Hari”.</div>') + '</div>';
}
async function demoMuat(aksi) {
  const r = await api('apiDemo', { aksi: aksi });
  if (!r.success) { toast(r.message, 'err'); return; }
  if (aksi !== 'status') toast(r.message, 'ok');
  demoTampil(r.data);
}

// ── Pengingat WhatsApp ──
async function aWA(rid) {
  const [r, ri, rl] = await Promise.all([apiT('apiGetPengaturan'), apiT('apiStatusIntegrasi'), apiT('apiLogPengingat', 30)]);
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const p = r.data, st = ri.data || {};
  const fld = (k, l, tipe, extra) => '<label class="f" for="wa-' + k + '">' + l + '</label><input class="inp" id="wa-' + k + '" name="' + k + '" type="' + (tipe || 'text') + '" value="' + esc(p[k]) + '" ' + (extra || '') + '>';
  let h = admHead('Pengingat WhatsApp');
  h += '<div class="card"><h3>Status Integrasi</h3><div class="list"><div class="item"><div class="grow">Gateway WhatsApp</div><span class="chip ' + (st.wa && st.wa.siap ? 'ok' : 'err') + '">' + (st.wa && st.wa.siap ? 'Token terisi' : 'Belum diisi') + '</span></div>' +
    '<div class="item"><div class="grow">Pengingat otomatis (trigger)</div><span class="chip ' + (st.trigger && st.trigger.jumlah > 0 ? 'ok' : 'warn') + '">' + (st.trigger && st.trigger.jumlah > 0 ? 'Aktif' : 'Belum dipasang') + '</span></div>' +
    (st.spreadsheet ? '<div class="item"><div class="grow">Database</div><a class="small" target="_blank" rel="noopener" href="' + esc(st.spreadsheet.url) + '">' + esc(st.spreadsheet.nama) + '</a></div>' : '') + '</div>' +
    '<div class="row wrap mt"><button class="btn soft grow" data-act="trigger" data-on="1">' + ic('alarm_on', 'sm') + 'Pasang Trigger</button><button class="btn ghost grow" data-act="trigger" data-on="0">Matikan</button></div></div>';
  h += '<form class="card" id="f-wa" novalidate><h3>Pengaturan Pengingat</h3>' +
    '<label class="check"><input type="checkbox" name="pengingatAktif"' + (p.pengingatAktif !== 'false' ? ' checked' : '') + '> Aktifkan pengingat otomatis</label>' +
    '<div class="grid gr2"><div>' + fld('jamPengingatPagi', 'Jam shift Pagi', 'time') + '</div><div>' + fld('jamPengingatSiang', 'Jam shift Siang', 'time') + '</div></div>' +
    '<label class="f" for="wa-prov">Penyedia gateway</label><select class="inp" id="wa-prov" name="waProvider"><option value="fonnte"' + (p.waProvider !== 'wablas' ? ' selected' : '') + '>Fonnte</option><option value="wablas"' + (p.waProvider === 'wablas' ? ' selected' : '') + '>Wablas</option></select>' +
    '<label class="f" for="wa-token">Token API' + (p.waTokenSet ? ' <span class="muted">(tersimpan ' + esc(p.waTokenMask) + ')</span>' : '') + '</label><input class="inp" id="wa-token" name="waToken" type="password" autocomplete="off" placeholder="' + (p.waTokenSet ? 'Kosongkan jika tidak diubah' : 'Tempel token gateway') + '">' +
    fld('waDomain', 'Domain Wablas (khusus Wablas)', 'text', 'placeholder="https://pati.wablas.com"') +
    '<label class="f" for="wa-tpl">Templat pesan</label><textarea class="inp" id="wa-tpl" name="waTemplate" maxlength="600">' + esc(p.waTemplate) + '</textarea><div class="hint">Gunakan {kelas}, {shift}, {wali}, {tanggal}.</div>' +
    '<button class="btn block mt" type="submit">Simpan Pengaturan</button></form>';
  h += '<div class="card" id="demo-card"><h3>Mode Demo — Uji Alpa Otomatis</h3><div class="small muted">Membuat kelas contoh <b>DEMO 1A</b> (8 murid) dengan data kemarin: 4 murid scan, 1 Sakit berketerangan, 1 Izin tanpa keterangan, 2 tanpa catatan. Lalu simulasikan pergantian hari. Kelas asli tidak disentuh. Hapus data demo setelah selesai.</div>' +
    '<div class="row wrap mt"><button class="btn soft grow" data-act="demo" data-a="buat">1. Buat Data Demo</button><button class="btn grow" data-act="demo" data-a="jalankan">2. Jalankan Pergantian Hari</button><button class="btn ghost grow" data-act="demo" data-a="hapus">Hapus Data Demo</button></div><div id="demo-hasil" class="mt"></div></div>';
  h += '<div class="card"><h3>Uji Koneksi</h3><div class="row"><input class="inp" id="wa-tes" inputmode="tel" placeholder="Nomor tujuan, mis. 08123456789"><button class="btn soft" data-act="tes">Kirim</button></div></div>';
  h += '<div class="card"><h3>Log Pengingat Terakhir</h3>' + (rl.success && rl.data.length ? '<div class="list">' + rl.data.map(x => '<div class="item"><div class="grow"><div class="bold small">Kelas ' + esc(x.kelas) + ' • ' + esc(x.guru) + '</div><div class="small muted">' + esc(x.waktu) + (x.galat ? ' — ' + esc(x.galat) : '') + '</div></div><span class="chip ' + (x.status === 'Terkirim' ? 'ok' : 'err') + '">' + esc(x.status) + '</span></div>').join('') + '</div>' : '<div class="empty small">Belum ada log.</div>') + '</div>';
  halaman(h, rid);
  demoMuat('status');
  $('#f-wa').addEventListener('submit', async ev => {
    ev.preventDefault();
    const f = ev.target, o = {};
    new FormData(f).forEach((v, k) => { o[k] = v; });
    o.pengingatAktif = f.elements.pengingatAktif.checked;
    const rr = await apiT('apiSimpanPengaturan', o);
    toast(rr.message, rr.success ? 'ok' : 'err'); if (rr.success) go('admin', { sub: 'wa' });
  });
}

// ── Akun superadmin ──
async function aAkun(rid) {
  halaman(admHead('Data & Sandi Admin') + '<div class="grid gr2">' + fotoCard() + '<form class="card" id="f-akun" novalidate><h3>Data Admin</h3><label class="f" style="margin-top:0" for="ak-n">Nama admin</label><input class="inp" id="ak-n" name="nama" maxlength="60" value="' + esc(S.user.nama) + '" required>' +
    '<label class="f" for="ak-u">Username</label><input class="inp" id="ak-u" name="username" autocomplete="username" value="' + esc(S.user.username || 'admin') + '">' +
    '<div class="sec-h">Ubah Sandi (opsional)</div><label class="f" for="ak-b" style="margin-top:0">Sandi baru (min. 8 karakter)</label><input class="inp" id="ak-b" name="baru" type="password" autocomplete="new-password" placeholder="Kosongkan jika tidak diubah">' +
    '<label class="f" for="ak-c">Ulangi sandi baru</label><input class="inp" id="ak-c" name="ulang" type="password" autocomplete="new-password">' +
    '<label class="f" for="ak-l">Sandi saat ini (wajib untuk menyimpan)</label><input class="inp" id="ak-l" name="lama" type="password" autocomplete="current-password" required><button class="btn block mt" type="submit">Simpan Perubahan</button></form></div>', rid);
  $('#f-akun').addEventListener('submit', async ev => {
    ev.preventDefault(); const f = ev.target;
    if (f.baru.value && f.baru.value !== f.ulang.value) return toast('Konfirmasi sandi baru tidak sama.', 'err');
    if (!f.lama.value) return toast('Masukkan sandi saat ini.', 'err');
    const r = await apiT('apiGantiSandi', { nama: f.nama.value, username: f.username.value, lama: f.lama.value, baru: f.baru.value });
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { S.user.nama = f.nama.value.trim(); S.user.username = f.username.value.trim(); f.lama.value = f.baru.value = f.ulang.value = ''; renderShell(); setNavAktif(); }
  });
}

// ── Reset data (kehadiran, murid, guru) ──
async function aReset(rid) {
  const r = await apiT('apiResetRingkasan');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const d = S.adm.reset = r.data, n = v => Number(v || 0).toLocaleString('id-ID');
  const kartu = (jenis, ikon, judul, info, tombol) =>
    '<div class="card rst"><div class="row"><div class="avatar err">' + ic(ikon) + '</div><div class="grow"><div class="bold">' + judul + '</div><div class="small muted">' + info + '</div></div></div>' +
    '<button class="btn danger block mt" data-act="reset" data-j="' + jenis + '">' + ic('delete_forever', 'sm') + tombol + '</button></div>';
  halaman(admHead('Reset Data') +
    '<div class="banner err mb">' + ic('warning') + '<div><b>Zona berbahaya.</b> Reset menghapus data secara permanen dan tidak dapat dibatalkan. Sebelum melanjutkan, buat salinan Google Sheets <b>DB_SIPMUR_EDU</b> (Berkas → Buat salinan) sebagai cadangan.</div></div>' +
    '<div class="grid gr2">' +
    kartu('presensi', 'event_busy', 'Data Kehadiran Murid',
      n(d.presensi) + ' catatan tidak masuk • ' + n(d.kirim) + ' pengiriman kelas' + (d.awal ? '<br>Periode ' + fTgl(d.awal) + ' s.d. ' + fTgl(d.akhir) : ''), 'Reset Kehadiran') +
    kartu('murid', 'groups', 'Data Murid', n(d.murid) + ' murid terdaftar. Data kelas tidak ikut terhapus.', 'Reset Data Murid') +
    kartu('guru', 'badge', 'Data Guru',
      n(d.guru) + ' guru • ' + n(d.wali) + ' kelas punya wali • ' + n(d.piket) + ' jadwal piket • ' + n(d.mapel) + ' jadwal mapel', 'Reset Data Guru') +
    '</div><div class="mt">' + kartu('pabrik', 'restart_alt', 'Reset Pabrik — Kembali ke Setup Awal',
      'Menghapus <b>SEMUA</b> data: murid, guru, kelas, kehadiran, scan QR, pengaturan, logo, tanda tangan, dan akun Superadmin. Aplikasi kosong seperti baru dibeli dan menampilkan Setup Awal. Kartu QR lama tidak berlaku lagi.', 'Reset ke Pabrik') + '</div>', rid);
}
// ── Naik Kelas & Alumni ──
async function aNaik(rid) {
  const r = await apiT('apiNaikKelasRencana');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  const d = S.adm.naik = r.data, n = v => Number(v || 0).toLocaleString('id-ID');
  let h = admHead('Naik Kelas') +
    '<div class="banner info mb">' + ic('info') + '<div>Cukup <b>1x klik</b>: seluruh murid naik ke tingkat berikutnya (mis. 1A → 2A), kelas tujuan dibuat otomatis bila belum ada, dan murid kelas <b>' + d.akhir + '</b> dipindahkan ke menu <b>Alumni</b>. Tidak perlu input ulang data murid. Kartu QR tidak perlu dicetak ulang.</div></div>';
  if (!d.baris.length) {
    h += '<div class="card center muted">' + ic('info') + '<div>Belum ada kelas yang bisa dinaikkan. Nama kelas harus diawali angka tingkat, mis. <b>1A</b>, <b>2B</b>.</div></div>';
  } else {
    h += '<div class="card"><div class="row" style="gap:16px;flex-wrap:wrap"><div><div class="small muted">Naik kelas</div><div class="bold">' + n(d.totalNaik) + ' murid</div></div><div><div class="small muted">Lulus ke Alumni</div><div class="bold">' + n(d.totalLulus) + ' murid</div></div></div></div>' +
      '<div class="sec-h">Rencana perpindahan</div><div class="list">' + d.baris.map(b =>
        '<div class="item"><div class="grow"><div class="bold">' + esc(b.dari) + ' <span class="muted">→</span> ' + (b.lulus ? 'Alumni' : esc(b.ke)) + '</div><div class="small muted">' + n(b.jumlah) + ' murid' + (b.baru ? ' • kelas baru dibuat otomatis' : '') + '</div></div>' +
        (b.lulus ? '<span class="chip">Lulus</span>' : '') + '</div>').join('') + '</div>';
  }
  if (d.dilewati.length) h += '<div class="sec-h">Tidak diproses</div><div class="list">' + d.dilewati.map(b =>
    '<div class="item"><div class="grow"><div class="bold">' + esc(b.nama) + '</div><div class="small muted">' + n(b.jumlah) + ' murid • ' + esc(b.alasan) + '</div></div></div>').join('') + '</div>';
  h += '<div class="banner warn mt">' + ic('warning') + '<div>Sebelum naik kelas, <b>unduh rekap kehadiran</b> tahun ajaran ini dan buat salinan Google Sheets <b>DB_SIPMUR_EDU</b>. Rekap lama membaca daftar murid terbaru, sehingga susunan kelas lama tidak dapat direkonstruksi setelah naik kelas. Tahun ajaran dan wali kelas kelas baru perlu diperiksa kembali.</div></div>';
  if (d.baris.length) h += '<button class="btn block mt" data-act="naikgo">' + ic('upgrade', 'sm') + 'Naikkan Kelas Sekarang</button>';
  halaman(h, rid);
}
function bukaNaikKelas() {
  const d = S.adm.naik || {}, n = v => Number(v || 0).toLocaleString('id-ID');
  modal({
    title: 'Konfirmasi Naik Kelas', ok: 'Naik Kelas', danger: true,
    body: '<div class="banner warn">' + ic('warning') + '<div><b>' + n(d.totalNaik) + ' murid</b> akan naik kelas dan <b>' + n(d.totalLulus) + ' murid</b> kelas ' + d.akhir + ' dipindahkan ke Alumni. Proses ini tidak dapat dibatalkan otomatis (alumni dapat dikembalikan manual dari menu Alumni).</div></div>' +
      '<label class="f" for="nk-t">Tahun lulus</label><input class="inp" id="nk-t" name="tahun" value="' + esc(d.tahunLulus || '') + '" inputmode="numeric" maxlength="9">' +
      '<label class="f" for="nk-k">Ketik <b>NAIK</b> untuk konfirmasi</label><input class="inp" id="nk-k" name="konfirmasi" autocomplete="off" placeholder="NAIK">' +
      '<label class="f" for="nk-s">Sandi Superadmin</label><input class="inp" id="nk-s" name="sandi" type="password" autocomplete="current-password">',
    onOk: async f => {
      if (f.konfirmasi.value.trim().toUpperCase() !== 'NAIK') { toast('Ketik kata NAIK untuk melanjutkan.', 'err'); return false; }
      if (!f.sandi.value) { toast('Masukkan sandi Superadmin.', 'err'); return false; }
      const r = await apiT('apiNaikKelas', { konfirmasi: f.konfirmasi.value.trim(), sandi: f.sandi.value, tahunLulus: f.tahun.value.trim() });
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: 'naik' });
    }
  });
}
async function aAlumni(rid) {
  const r = await apiT('apiAlumniList');
  if (!aktif(rid)) return; if (!r.success) return galat(r, rid);
  S.adm.alumni = r.data || []; S.adm.alPilih = {}; S.adm.alq = ''; S.adm.alk = '';
  const tahun = [...new Set(S.adm.alumni.map(a => a.tahun))].sort().reverse();
  halaman(admHead('Alumni', '<button class="btn sm soft" data-act="alxls">' + ic('table_view', 'sm') + 'Excel</button>') +
    '<div class="card"><div class="grid gr2"><input class="inp" data-inp="alq" placeholder="Cari nama atau NISN" aria-label="Cari alumni" autocomplete="off">' +
    '<select class="inp" data-chg="alk" aria-label="Tahun lulus"><option value="">Semua tahun lulus</option>' + tahun.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('') + '</select></div>' +
    '<div class="row mt" style="gap:8px;flex-wrap:wrap"><button class="btn sm ghost" data-act="alpilihsemua">Pilih semua</button><button class="btn sm soft" data-act="alkembali">' + ic('undo', 'sm') + 'Kembalikan ke kelas</button><button class="btn sm danger" data-act="alhapus">' + ic('delete', 'sm') + 'Hapus</button><span class="small muted" id="al-info"></span></div></div>' +
    '<div id="al-list" class="mt"></div>', rid);
  alRender();
}
function alRender() {
  const A = S.adm, q = (A.alq || '').toLowerCase(), t = A.alk || '';
  A.alF = (A.alumni || []).filter(a => (!t || a.tahun === t) && (!q || a.nama.toLowerCase().indexOf(q) >= 0 || a.nisn.indexOf(q) >= 0));
  const box = $('#al-list'); if (!box) return;
  box.innerHTML = '<div class="small muted" style="margin-bottom:6px">' + A.alF.length + ' alumni</div>' + (A.alF.length ? '<div class="list">' + A.alF.slice(0, 200).map(a =>
    '<label class="item" style="cursor:pointer"><input type="checkbox" data-chg="alpilih" data-id="' + esc(a.nisn) + '"' + (A.alPilih[a.nisn] ? ' checked' : '') + ' style="width:20px;height:20px;accent-color:var(--primary)">' +
    '<div class="grow"><div class="bold">' + esc(a.nama) + '</div><div class="small muted">NISN ' + esc(a.nisn) + ' • Kelas terakhir ' + esc(a.kelas) + ' • Lulus ' + esc(a.tahun) + '</div></div></label>').join('') + '</div>' +
    (A.alF.length > 200 ? '<div class="small muted mt">Menampilkan 200 pertama. Gunakan pencarian atau filter tahun.</div>' : '') :
    '<div class="card center muted">Belum ada alumni.</div>');
  alInfoPilih();
}
function alInfoPilih() { const el = $('#al-info'); if (el) { const n = alTerpilih().length; el.textContent = n ? n + ' dipilih' : ''; } }
function alTerpilih() { return Object.keys(S.adm.alPilih || {}).filter(k => S.adm.alPilih[k]); }
function alumniKembali() {
  const pil = alTerpilih(); if (!pil.length) return toast('Pilih alumni terlebih dahulu.', 'err');
  const kelas = (S.boot && S.boot.kelas || []).filter(k => k.aktif !== false);
  if (!kelas.length) return toast('Belum ada kelas.', 'err');
  modal({
    title: 'Kembalikan ke Kelas', ok: 'Kembalikan',
    body: '<div class="banner info">' + ic('info') + '<div>' + pil.length + ' alumni akan dikembalikan ke data murid.</div></div><label class="f" for="ak-k">Kelas tujuan</label><select class="inp" id="ak-k" name="kelas">' + kelas.map(k => '<option value="' + esc(k.nama) + '">' + esc(k.nama) + '</option>').join('') + '</select>',
    onOk: async f => {
      const r = await apiT('apiAlumniKembalikan', { nisn: pil, kelas: f.kelas.value });
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: 'alumni' });
    }
  });
}
function alumniHapus() {
  const pil = alTerpilih(); if (!pil.length) return toast('Pilih alumni terlebih dahulu.', 'err');
  modal({
    title: 'Hapus Data Alumni', ok: 'Hapus Permanen', danger: true,
    body: '<div class="banner err">' + ic('warning') + '<div><b>' + pil.length + ' data alumni</b> akan dihapus permanen.</div></div>' +
      '<label class="f" for="ah-k">Ketik <b>HAPUS</b> untuk konfirmasi</label><input class="inp" id="ah-k" name="konfirmasi" autocomplete="off" placeholder="HAPUS">' +
      '<label class="f" for="ah-s">Sandi Superadmin</label><input class="inp" id="ah-s" name="sandi" type="password" autocomplete="current-password">',
    onOk: async f => {
      if (f.konfirmasi.value.trim().toUpperCase() !== 'HAPUS') { toast('Ketik kata HAPUS untuk melanjutkan.', 'err'); return false; }
      if (!f.sandi.value) { toast('Masukkan sandi Superadmin.', 'err'); return false; }
      const r = await apiT('apiAlumniHapus', { nisn: pil, konfirmasi: f.konfirmasi.value.trim(), sandi: f.sandi.value });
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); go('admin', { sub: 'alumni' });
    }
  });
}
async function alumniXls() {
  const rows = [['NISN', 'Nama', 'Kelas Terakhir', 'Tahun Lulus']].concat((S.adm.alF || []).map(a => [a.nisn, a.nama, a.kelas, a.tahun]));
  try { await simpanXLSX([{ name: 'Alumni', rows: rows }], 'Alumni_SIPMUREDU.xlsx'); } catch (e) { toast(e.message, 'err'); }
}
function bukaReset(jenis) {
  const d = S.adm.reset || {}, n = v => Number(v || 0).toLocaleString('id-ID');
  let judul, isi;
  if (jenis === 'presensi') {
    judul = 'Reset Data Kehadiran';
    isi = '<div class="banner err">' + ic('warning') + '<div>Catatan kehadiran (Sakit/Izin/Alpa) dan status pengiriman kelas akan dihapus permanen. Data murid, guru, dan kelas <b>tidak</b> berubah.</div></div>' +
      '<div class="grid gr2"><div><label class="f" for="rs-dari">Dari tanggal (opsional)</label><input class="inp" type="date" id="rs-dari" name="dari"></div>' +
      '<div><label class="f" for="rs-sampai">Sampai tanggal (opsional)</label><input class="inp" type="date" id="rs-sampai" name="sampai"></div></div>' +
      '<div class="hint">Kosongkan kedua tanggal untuk menghapus <b>seluruh</b> data kehadiran (' + n(d.presensi) + ' catatan, ' + n(d.kirim) + ' pengiriman kelas).</div>';
  } else if (jenis === 'murid') {
    judul = 'Reset Data Murid';
    isi = '<div class="banner err">' + ic('warning') + '<div>Seluruh <b>' + n(d.murid) + ' murid</b> akan dihapus. Data kelas tetap ada, sehingga murid baru dapat diimpor kembali dari Excel.</div></div>' +
      '<label class="row mt" style="gap:10px;cursor:pointer"><input type="checkbox" name="denganPresensi" style="width:22px;height:22px;accent-color:var(--primary)"><span>Hapus juga seluruh data kehadiran murid</span></label>' +
      '<div class="hint">Disarankan saat pergantian tahun ajaran. Jika tidak dicentang, riwayat kehadiran lama tetap tersimpan.</div>';
  } else if (jenis === 'pabrik') {
    judul = 'Reset Pabrik';
    isi = '<div class="banner err">' + ic('warning') + '<div><b>Seluruh isi aplikasi akan dihapus</b> (' + n(d.murid) + ' murid, ' + n(d.guru) + ' guru, ' + n(d.presensi) + ' catatan kehadiran, pengaturan, logo, dan akun Superadmin). Setelah ini aplikasi kembali ke layar <b>Setup Awal</b> dan memerlukan kode lisensi lagi.</div></div>' +
      '<div class="hint">Buat salinan Google Sheets <b>DB_SIPMUR_EDU</b> terlebih dahulu bila data masih dibutuhkan. Proses ini hanya memengaruhi aplikasi SIPMUR EDU ini.</div>';
  } else {
    judul = 'Reset Data Guru';
    isi = '<div class="banner err">' + ic('warning') + '<div><b>' + n(d.guru) + ' akun guru</b> akan dihapus dan tidak bisa masuk lagi sampai diimpor/ditambah ulang.<ul style="margin:6px 0 0;padding-left:18px">' +
      '<li>' + n(d.wali) + ' wali kelas dilepas dari kelasnya</li><li>' + n(d.piket) + ' jadwal piket dikosongkan</li><li>' + n(d.mapel) + ' jadwal guru mapel dikosongkan</li><li>Foto dan tanda tangan guru dihapus (tanda tangan kepala sekolah tetap)</li></ul></div></div>' +
      '<div class="hint">Data kehadiran murid tidak berubah.</div>';
  }
  isi += '<label class="f" for="rs-k">Ketik <b>RESET</b> untuk konfirmasi</label><input class="inp" id="rs-k" name="konfirmasi" autocomplete="off" placeholder="RESET">' +
    '<label class="f" for="rs-s">Sandi Superadmin</label><input class="inp" id="rs-s" name="sandi" type="password" autocomplete="current-password">';
  modal({
    title: judul, body: isi, ok: 'Reset Sekarang', danger: true, onOk: async f => {
      if (f.konfirmasi.value.trim().toUpperCase() !== 'RESET') { toast('Ketik kata RESET untuk melanjutkan.', 'err'); return false; }
      if (!f.sandi.value) { toast('Masukkan sandi Superadmin.', 'err'); return false; }
      const opt = { jenis: jenis, konfirmasi: f.konfirmasi.value.trim(), sandi: f.sandi.value };
      if (jenis === 'presensi') {
        opt.dari = f.dari.value; opt.sampai = f.sampai.value;
        if (!!opt.dari !== !!opt.sampai) { toast('Isi kedua tanggal, atau kosongkan keduanya.', 'err'); return false; }
      }
      if (jenis === 'murid') opt.denganPresensi = f.denganPresensi.checked;
      const r = await apiT('apiResetData', opt);
      if (!r.success) { toast(r.message, 'err'); return false; }
      if (jenis === 'pabrik') { toast(r.message, 'ok'); tutupModal(); qrHenti(); cacheBersih(); S.token = null; S.user = null; S.boot = null; hapusSesi(); init(); return; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: 'reset' });
    }
  });
}

// ── Impor Excel ──
async function bukaImpor(e) {
  S.impRows = null; S.impE = e;
  modal({
    title: 'Impor ' + JUDUL[e] + ' dari Excel', ok: 'Impor Sekarang',
    body: '<div class="banner info">' + ic('info') + '<div>Unduh templat, isi data mulai baris ke-2, lalu unggah. Data diperiksa dulu sebelum disimpan.' + (e === 'murid' ? ' Murid yang <b>belum punya NISN</b> (mis. kelas 1 baru): kosongkan kolom NISN atau isi tanda <b>-</b>, sistem membuatkan ID sementara.' : '') + '</div></div><button type="button" class="btn soft block mt" data-act="templat" data-e="' + e + '">' + ic('download', 'sm') + 'Unduh Templat Excel</button>' +
      '<div class="mt">' + dz('impor', 'Pilih / lepas berkas Excel', '.xlsx,.xls,.csv', 'upload_file') + '</div><div id="imp-prev" class="mt"></div>',
    onOk: async () => {
      if (!S.impRows || !S.impRows.length) { toast('Pilih berkas Excel terlebih dahulu.', 'err'); return false; }
      const r = await apiT('apiMasterImpor', S.impE, S.impRows, true);
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); await reloadBoot(); go('admin', { sub: S.params.sub });
    }
  });
}
async function unduhTemplat(e) {
  try {
    if (e === 'murid') await simpanXLSX([{ name: 'Murid', rows: [['NISN', 'Nama', 'Kelas'], ['0123456789', 'Contoh Murid', (S.boot.kelas[0] || {}).nama || '1A']] }], 'Templat_Murid_SIPMUREDU.xlsx');
    else await simpanXLSX([{ name: 'Guru', rows: [['Nama Lengkap', 'NIP/NIKKI', 'No. WhatsApp'], ['Contoh Guru, S.Pd.', '198001012005011001', '081234567890']] }], 'Templat_Guru_SIPMUREDU.xlsx');
  } catch (er) { toast(er.message, 'err'); }
}
async function bacaImporFile(f) {
  const box = $('#imp-prev'); box.innerHTML = '<div class="center"><span class="spin"></span></div>';
  try {
    await muatXLSX();
    const buf = await f.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: false });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' }).slice(1);
    const e = S.impE;
    S.impRows = rows.map(r => e === 'murid' ? { nisn: String(r[0]).trim(), nama: r[1], kelas: r[2] } : { nama: r[0], nip: r[1], wa: r[2] });
    const r = await apiT('apiMasterImpor', e, S.impRows, false);
    if (!r.success) { S.impRows = null; box.innerHTML = '<div class="banner err">' + esc(r.message) + '</div>'; return; }
    const d = r.data;
    box.innerHTML = '<div class="banner ' + (d.valid ? 'ok' : 'err') + '">' + ic(d.valid ? 'check_circle' : 'error') + '<div><b>' + d.valid + ' baris valid</b>, ' + d.jumlahInvalid + ' baris bermasalah.</div></div>' +
      (d.invalid.length ? '<div class="small mt" style="max-height:160px;overflow:auto">' + d.invalid.map(x => '<div style="padding:2px 0">Baris ' + x.baris + ': ' + esc(x.alasan) + '</div>').join('') + (d.jumlahInvalid > d.invalid.length ? '<div class="muted">… dan lainnya</div>' : '') + '</div>' : '');
  } catch (er) { S.impRows = null; box.innerHTML = '<div class="banner err">' + esc(er.message) + '</div>'; }
}

/* ============================================================
   EVENT DELEGATION
   ============================================================ */
const A = {
  go: el => go(el.dataset.r),
  adm: el => go('admin', { sub: el.dataset.s }),
  tema: () => terapkanTema(),
  keluar: async () => { if (await konfirmasi({ title: 'Keluar dari SIPMUR EDU?', msg: 'Anda perlu masuk kembali untuk memakai aplikasi.', ok: 'Keluar' })) keluar(); },
  reload: () => { cacheBersih(); go(S.route, S.params); },
  mclose: () => tutupModal(),
  // Tutup hanya bila tekan DAN lepas sama-sama di latar gelap. Memblok teks di isian lalu melepas mouse di luar form tidak lagi menutup modal.
  ovl: (el, ev) => { const awal = OVL_DOWN; OVL_DOWN = null; if (ev.target === el && awal === el && !teksTerpilih()) tutupModal(); },
  logtab: el => {
    $$('.tabs2 button').forEach(b => b.classList.toggle('on', b === el));
    $('#f-guru').classList.toggle('hidden', el.dataset.t !== 'guru'); $('#f-admin').classList.toggle('hidden', el.dataset.t !== 'admin');
  },
  pkshift: el => { S.piketShift = el.dataset.s; go('piket'); },
  pkall: () => { (S.piketData.kelas || []).forEach(k => { if (!k.terkirim && (S.piketShift === 'Semua' || k.shift === S.piketShift)) S.piketPilih[k.id] = true; }); $$('[data-chg=pkpilih]').forEach(c => { c.checked = true; }); hitungPilih(); },
  pkkirim: () => kirimPengingatTerpilih(),
  pkisi: el => {
    const d = S.piketData || { kelas: [], tanggal: todayStr() };
    let id = el.dataset.id;
    if (!id) {
      const f = d.kelas.filter(k => S.piketShift === 'Semua' || k.shift === S.piketShift);
      const b = f.find(k => !k.terkirim) || f[0] || d.kelas[0];
      id = b ? b.id : '';
    }
    if (!id) return toast('Belum ada kelas aktif.', 'err');
    S.inp = { tanggal: d.tanggal, kelasId: id, marks: {}, terkirim: false, waktu: '', dariPiket: true };
    go('input');
  },
  pkback: () => { tutupModal(); go('piket'); },
  reset: el => bukaReset(el.dataset.j),
  naikgo: () => bukaNaikKelas(),
  alxls: () => alumniXls(),
  alkembali: () => alumniKembali(),
  alhapus: () => alumniHapus(),
  alpilihsemua: el => { const ada = (S.adm.alF || []); const semua = ada.length && ada.every(a => S.adm.alPilih[a.nisn]); ada.forEach(a => { S.adm.alPilih[a.nisn] = !semua; }); alRender(); },
  rekapharian: () => openRekap({ mode: 'harian', cakupan: 'sekolah', tanggal: S.piketData.tanggal, shift: S.piketShift === 'Semua' ? '' : S.piketShift }),
  rekapkelas: () => openRekap({ mode: 'harian', cakupan: 'kelas', tanggal: S.piketData.tanggal, shift: '' }),
  rkcak: el => { S.rekap.cakupan = el.dataset.c; S.rekap.kelasId = ''; go('rekap'); },
  testisemua: () => tampilTestimoni(),
  musik: () => toggleMusik(),
  latup: async () => {
    const fi = $('#lt-f'), f = fi && fi.files && fi.files[0];
    if (!f) return toast('Pilih foto atau video dahulu.', 'err');
    try {
      let mime = f.type, b64;
      const video = f.type.indexOf('video/') === 0;
      if (video && ['video/mp4', 'video/webm'].indexOf(f.type) < 0) return toast('Video harus berformat MP4 atau WebM.', 'err');
      if (video || f.type === 'image/gif') {
        if (f.size > 4 * 1024 * 1024) return toast('Ukuran maksimal sekitar 4 MB.', 'err');
        b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error('Gagal membaca berkas.')); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
      } else { const g = await resizeGambar(f, 1600, f.type === 'image/png'); mime = g.mime; b64 = g.base64; }
      const r = await apiT('apiUploadLoginLatar', { mime: mime, base64: b64 });
      toast(r.message, r.success ? 'ok' : 'err');
      if (r.success) {
        const tipe = mime.indexOf('video/') === 0 ? 'video' : 'gambar';
        S.pub.loginLatar = { uri: 'data:' + mime + ';base64,' + b64, tipe: tipe };
        S.pub.login = Object.assign({}, S.pub.login, { latar: Object.assign({ opacity: '' }, (S.pub.login || {}).latar, { ada: true, tipe: tipe }) });
        go('admin', { sub: S.params.sub || 'sekolah' });
      }
    } catch (e) { toast(e.message, 'err'); }
  },
  latdel: async () => {
    if (!await konfirmasi({ title: 'Hapus latar login?', msg: 'Foto atau video latar halaman login akan dihapus.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiHapusLoginLatar'); toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { S.pub.loginLatar = null; S.pub.login = Object.assign({}, S.pub.login, { latar: Object.assign({}, (S.pub.login || {}).latar, { ada: false }) }); go('admin', { sub: S.params.sub || 'sekolah' }); }
  },
  latop: async () => {
    const v = $('#lt-op').value, r = await apiT('apiSimpanPengaturan', { loginLatarOpacity: v });
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) S.pub.login = Object.assign({}, S.pub.login, { latar: Object.assign({}, (S.pub.login || {}).latar, { opacity: v }) });
  },
  lmup: async () => {
    const fi = $('#lm-f'), f = fi && fi.files && fi.files[0];
    if (!f) return toast('Pilih foto atau GIF dahulu.', 'err');
    try {
      let mime = f.type, b64;
      if (f.type === 'image/gif') {
        if (f.size > 2.2 * 1024 * 1024) return toast('Ukuran GIF maksimal sekitar 2 MB.', 'err');
        b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error('Gagal membaca berkas.')); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); });
      } else { const g = await resizeGambar(f, 900, f.type === 'image/png'); mime = g.mime; b64 = g.base64; }
      const r = await apiT('apiUploadLoginMedia', { mime: mime, base64: b64 });
      toast(r.message, r.success ? 'ok' : 'err');
      if (r.success) { S.pub.loginMediaUri = 'data:' + mime + ';base64,' + b64; S.pub.login = Object.assign({}, S.pub.login, { media: Object.assign({ mode: 'ganti', bentuk: 'membulat', ukuran: '' }, (S.pub.login || {}).media, { ada: true }) }); go('admin', { sub: 'loginui' }); }
    } catch (e) { toast(e.message, 'err'); }
  },
  lmdel: async () => {
    if (!await konfirmasi({ title: 'Hapus gambar login?', msg: 'Foto atau GIF di halaman login akan dihapus.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiHapusLoginMedia'); toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { S.pub.loginMediaUri = ''; S.pub.login = Object.assign({}, S.pub.login, { media: Object.assign({}, (S.pub.login || {}).media, { ada: false }) }); go('admin', { sub: 'loginui' }); }
  },
  pkbulan: async () => { const t = await apiT('apiPiketTemplate'); bukaFormPiketBulan(t.success ? t.data : {}); },
  ttdup: el => {
    const d = S.adm.ttd, id = el.dataset.id, nama = id === 'kepsek' ? (d.kepsek.nama || 'Kepala Sekolah') : ((d.guru.find(g => g.id === id) || {}).nama || 'Guru');
    bukaEditorTtd(id, nama);
  },
  ttddel: async el => {
    if (!await konfirmasi({ title: 'Hapus tanda tangan?', msg: 'Tanda tangan digital ini akan dihapus dari lembar rekap.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiTtdHapus', el.dataset.id); toast(r.message, r.success ? 'ok' : 'err'); if (r.success) go('admin', { sub: 'ttd' });
  },
  mpadd: () => bukaFormMapelBanyak(),
  mpedit: el => bukaFormMapel((S.adm.mapel.assign || []).find(x => x.id === el.dataset.id)),
  mpdel: async el => {
    if (!await konfirmasi({ title: 'Hapus jadwal?', msg: 'Jadwal mengajar ini akan dihapus.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiMapelHapus', el.dataset.id); toast(r.message, r.success ? 'ok' : 'err'); if (r.success) go('admin', { sub: 'mapel' });
  },
  musikup: async () => {
    const f = ($('#mu-f') || {}).files && $('#mu-f').files[0];
    if (!f) return toast('Pilih berkas musik dahulu.', 'err');
    if (f.size > 4 * 1024 * 1024) return toast('Ukuran musik maksimal 4 MB.', 'err');
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const mime = f.type || { mp3: 'audio/mpeg', m4a: 'audio/mp4', ogg: 'audio/ogg', wav: 'audio/wav', aac: 'audio/aac' }[ext] || '';
    const b64 = await new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = () => rej(new Error('Gagal membaca berkas.')); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(f); }).catch(e => { toast(e.message, 'err'); return ''; });
    if (!b64) return;
    const r = await apiT('apiUploadMusik', { mime: mime, base64: b64, nama: f.name });
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { await reloadBoot(); mulaiMusik(); go('admin', { sub: 'musik' }); }
  },
  musikdel: async () => {
    if (!await konfirmasi({ title: 'Hapus musik latar?', msg: 'Berkas musik akan dihapus.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiHapusMusik'); toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { hentiMusik(); await reloadBoot(); go('admin', { sub: 'musik' }); }
  },
  kelogin: () => tampilLogin(),
  kemasuk: () => { const c = $('#login-card'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = $('input', c); if (i && window.innerWidth > 700) i.focus(); } },
  tadd: () => bukaFormTesti(null),
  tedit: el => bukaFormTesti((S.adm.testi || []).find(x => x.id === el.dataset.id)),
  tdel: async el => {
    if (!await konfirmasi({ title: 'Hapus testimoni?', msg: 'Testimoni ini akan hilang dari halaman login.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiTestimoniHapus', el.dataset.id); toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { refreshTestiPub(); go('admin', { sub: 'testi' }); }
  },
  mark: el => {
    const n = el.dataset.n, s = el.dataset.s, cur = S.inp.marks[n];
    if (cur && cur.status === s) delete S.inp.marks[n]; else S.inp.marks[n] = { status: s, ket: cur ? cur.ket : '' };
    refreshInput();
  },
  tandai: el => tandaiCepat(el.dataset.n, el.dataset.s),
  inpsimpan: () => simpanInput(false),
  inpkirim: () => simpanInput(true),
  rktab: el => { S.rekap.tab = el.dataset.t; go('rekap'); },
  rkpdf: () => openRekap({ mode: 'periode', bulan: S.rekap.bulan, cakupan: S.rekap.cakupan, dari: S.rekap.dari, sampai: S.rekap.sampai, kelasId: S.rekap.kelasId }),
  rkxls: () => unduhExcel(),
  pdfunduh: () => unduhPdf(),
  pdfcetak: () => { const f = $('#pdf-fr'); if (f && f.contentWindow) { f.contentWindow.focus(); f.contentWindow.print(); } },
  madd: el => bukaFormMaster(el.dataset.e, null),
  medit: el => { const rec = cariRec(el.dataset.e, el.dataset.id); if (rec) bukaFormMaster(el.dataset.e, rec); },
  mmore: () => { S.adm.mlim = (S.adm.mlim || 60) + 60; $('#mlist').innerHTML = listMurid(); },
  mdel: async el => {
    const e = el.dataset.e, id = el.dataset.id;
    if (!await konfirmasi({ title: 'Hapus ' + JUDUL[e].toLowerCase() + '?', msg: 'Tindakan ini tidak dapat dibatalkan.', ok: 'Hapus', danger: true })) return;
    let r = await apiT('apiMasterDelete', e, id, {});
    if (r.success && r.data && r.data.perluKonfirmasi) {
      if (!await konfirmasi({ title: 'Kelas masih memiliki data', msg: r.data.murid + ' murid akan dilepas dari kelas ini dan ' + r.data.riwayat + ' catatan pengiriman terkait. Lanjutkan hapus?', ok: 'Hapus Tetap', danger: true })) return;
      r = await apiT('apiMasterDelete', e, id, { force: true });
    }
    toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { await reloadBoot(); go('admin', { sub: S.params.sub }); }
  },
  mimpor: el => bukaImpor(el.dataset.e),
  czoom: el => { const c = window.cropState; if (!c) return; c.st.z = Math.max(1, Math.min(4, c.st.z + +el.dataset.d)); c.zr.value = c.st.z; c.redraw(); },
  fotohapus: async () => {
    if (!await konfirmasi({ title: 'Hapus foto profil?', msg: 'Foto akan diganti inisial nama.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiHapusFoto'); toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { S.user.foto = ''; reRenderAll(); }
  },
  asethapus: async el => {
    const j = el.dataset.j;
    if (!await konfirmasi({ title: 'Hapus ' + ({ logo: 'logo sekolah', logoJaya: 'logo Jaya Raya', pattern: 'pattern' }[j] || 'gambar') + '?', msg: 'Tindakan ini tidak dapat dibatalkan.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiHapusAset', j); toast(r.message, r.success ? 'ok' : 'err');
    if (r.success) { S.pub[j] = ''; if (j === 'logo' || j === 'logoKiri') { renderShell(); setNavAktif(); } go('admin', { sub: S.params.sub || 'sekolah' }); }
  },
  tanext: async el => {
    const r = await apiT('apiSimpanPengaturan', { tahunAjaranMode: 'manual', tahunAjaran: el.dataset.ta, semester: el.dataset.sm });
    toast(r.message, r.success ? 'ok' : 'err'); if (r.success) { await reloadBoot(); go('admin', { sub: 'tahun' }); }
  },
  rtpre: el => { const f = $('#f-rt'); f.color.value = el.dataset.c; f.bg.value = el.dataset.b; f.dispatchEvent(new Event('input')); },
  templat: el => unduhTemplat(el.dataset.e),
  pkadd: () => bukaFormPiket(null),
  pkedit: el => { const j = (S.adm.jadwal || []).find(x => x.tanggal === el.dataset.id); if (j) bukaFormPiket(j); },
  pkdel: async el => {
    if (!await konfirmasi({ title: 'Hapus jadwal piket tanggal ini?', msg: 'Guru terkait tidak lagi mendapat menu Piket pada hari tersebut.', ok: 'Hapus', danger: true })) return;
    const r = await apiT('apiHapusJadwalPiket', el.dataset.id);
    toast(r.message, r.success ? 'ok' : 'err'); if (r.success) { await reloadBoot(); go('admin', { sub: 'piket' }); }
  },
  demo: async el => {
    if (el.dataset.a === 'hapus' && !await konfirmasi({ title: 'Hapus semua data demo?', msg: 'Kelas DEMO 1A beserta murid, scan, dan presensinya dihapus.', ok: 'Hapus' })) return;
    await demoMuat(el.dataset.a); if (typeof cacheBersih === 'function') cacheBersih();
  },
  trigger: async el => {
    const on = el.dataset.on === '1';
    const r = await apiT('apiPasangTrigger', on);
    toast(r.message, r.success ? 'ok' : 'err'); if (r.success) go('admin', { sub: 'wa' });
  },
  tes: async () => {
    const r = await apiT('apiTesWA', ($('#wa-tes') || {}).value);
    toast(r.message, r.success ? 'ok' : 'err');
  }
};
// Catat di mana tombol mouse/jari mulai ditekan (dipakai A.ovl agar modal tidak tertutup saat memblok teks)
let OVL_DOWN = null;
document.addEventListener('pointerdown', ev => { OVL_DOWN = ev.target; }, true);
function teksTerpilih() {
  try { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.selectionStart !== a.selectionEnd) return true; return !!String(window.getSelection() || ''); } catch (e) { return false; }
}
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]'); if (!el) return;
  const fn = A[el.dataset.act]; if (fn) fn(el, ev);
});
const C = {
  pkpilih: el => { S.piketPilih[el.dataset.id] = el.checked; hitungPilih(); },
  inkelas: el => { S.inp.kelasId = el.value; go('input'); },
  intgl: el => { if (!el.value) return; S.inp.tanggal = el.value; go('input'); },
  rkbulan: el => { const R = S.rekap; R.bulan = el.value; if (el.value) { const t = todayStr(), y = +el.value.substr(0, 4), m = +el.value.substr(5, 2), akhir = el.value + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); R.dari = el.value + '-01'; R.sampai = akhir > t ? t : akhir; } go('rekap'); },
  keefektif: () => go('admin', { sub: 'efektif' }),
  rkf: el => { S.rekap.bulan = ''; S.rekap[el.dataset.k] = el.value; if (!S.rekap.dari || !S.rekap.sampai) return; if (S.rekap.dari > S.rekap.sampai) S.rekap.dari = S.rekap.sampai; go('rekap'); },
  tema: () => terapkanTema(),
  alpilih: el => { S.adm.alPilih[el.dataset.id] = el.checked; alInfoPilih(); },
  alk: el => { S.adm.alk = el.value; alRender(); },
  fmsem: el => { const i = $('#fm-i'); if (!i) return; i.disabled = el.checked; i.required = !el.checked; if (el.checked) { i.dataset.lama = i.value; i.value = ''; i.placeholder = 'Dibuat otomatis, contoh SM' + todayStr().substr(0, 4) + '001'; } else { i.value = i.dataset.lama || ''; i.placeholder = ''; } },
  mk: el => { S.adm.mk = el.value; S.adm.mlim = 60; $('#mlist').innerHTML = listMurid(); }
};
document.addEventListener('change', ev => { const el = ev.target.closest('[data-chg]'); if (el && C[el.dataset.chg]) C[el.dataset.chg](el); });
const INP = {
  ket: el => { const m = S.inp.marks[el.dataset.n]; if (m) m.ket = el.value; },
  cari: el => cariMurid(el.value),
  mq: debounce(el => { S.adm.mq = el.value; S.adm.mlim = 60; const l = $('#mlist'); if (l) l.innerHTML = listMurid(); }, 200),
  alq: debounce(el => { S.adm.alq = el.value; alRender(); }, 200),
  gq: debounce(el => { S.adm.gq = el.value; const l = $('#glist'); if (l) l.innerHTML = listGuru(); }, 200)
};
document.addEventListener('input', ev => { const el = ev.target.closest('[data-inp]'); if (el && INP[el.dataset.inp]) INP[el.dataset.inp](el); });
// Dropzone: klik, keyboard, drag & drop
document.addEventListener('click', ev => {
  const z = ev.target.closest('.dz'); if (!z || ev.target.tagName === 'INPUT') return;
  $('input', z).click();
});
document.addEventListener('change', ev => {
  const z = ev.target.closest('.dz'); if (!z) return;
  const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; pakaiBerkas(z, f);
});
['dragenter', 'dragover'].forEach(t => document.addEventListener(t, ev => {
  const z = ev.target.closest && ev.target.closest('.dz');
  if (z) { ev.preventDefault(); z.classList.add('over'); } else if (ev.dataTransfer && ev.dataTransfer.types && Array.from(ev.dataTransfer.types).indexOf('Files') >= 0) ev.preventDefault();
}));
document.addEventListener('dragleave', ev => { const z = ev.target.closest && ev.target.closest('.dz'); if (z) z.classList.remove('over'); });
document.addEventListener('drop', ev => {
  const z = ev.target.closest && ev.target.closest('.dz');
  $$('.dz.over').forEach(x => x.classList.remove('over'));
  if (!z) { if (ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files.length) ev.preventDefault(); return; }
  ev.preventDefault();
  pakaiBerkas(z, ev.dataTransfer.files && ev.dataTransfer.files[0]);
});
document.addEventListener('keydown', ev => {
  if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('dz')) { ev.preventDefault(); $('input', ev.target).click(); return; } if (ev.key === 'Escape') { if ($('#confirm-root').innerHTML) $('#confirm-root').innerHTML = ''; else tutupModal(); } });

/* ============================================================
   INISIALISASI
   ============================================================ */
/* ============================================================
   v1.3 — PRESENSI QR • CETAK KARTU • SETUP AWAL
   ============================================================ */
/* QRCode for JavaScript — Copyright (c) 2009 Kazuhiko Arase — MIT License (http://www.opensource.org/licenses/mit-license.php).
   "QR Code" is a registered trademark of DENSO WAVE INCORPORATED. Dibundel agar kartu QR dapat dibuat tanpa internet. */
const SipQR = (function () {
  const M = {};
  function req(n) { n = n.replace('./', ''); const m = M[n]; if (!m.l) { m.l = true; m.mod = { exports: {} }; m.f(m.mod, m.mod.exports, req); } return m.mod.exports; }
  M['QR8bitByte'] = { f: function (module, exports, require) {
var QRMode = require('./QRMode');

function QR8bitByte(data) {
	this.mode = QRMode.MODE_8BIT_BYTE;
	this.data = data;
}

QR8bitByte.prototype = {

	getLength : function() {
		return this.data.length;
	},
	
	write : function(buffer) {
		for (var i = 0; i < this.data.length; i++) {
			// not JIS ...
			buffer.put(this.data.charCodeAt(i), 8);
		}
	}
};

module.exports = QR8bitByte;

  } };
  M['QRBitBuffer'] = { f: function (module, exports, require) {
function QRBitBuffer() {
	this.buffer = [];
	this.length = 0;
}

QRBitBuffer.prototype = {

	get : function(index) {
		var bufIndex = Math.floor(index / 8);
		return ( (this.buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
	},
	
	put : function(num, length) {
		for (var i = 0; i < length; i++) {
			this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
		}
	},
	
	getLengthInBits : function() {
		return this.length;
	},
	
	putBit : function(bit) {
	
		var bufIndex = Math.floor(this.length / 8);
		if (this.buffer.length <= bufIndex) {
			this.buffer.push(0);
		}
	
		if (bit) {
			this.buffer[bufIndex] |= (0x80 >>> (this.length % 8) );
		}
	
		this.length++;
	}
};

module.exports = QRBitBuffer;

  } };
  M['QRErrorCorrectLevel'] = { f: function (module, exports, require) {
module.exports = {
	L : 1,
	M : 0,
	Q : 3,
	H : 2
};


  } };
  M['QRMaskPattern'] = { f: function (module, exports, require) {
module.exports = {
	PATTERN000 : 0,
	PATTERN001 : 1,
	PATTERN010 : 2,
	PATTERN011 : 3,
	PATTERN100 : 4,
	PATTERN101 : 5,
	PATTERN110 : 6,
	PATTERN111 : 7
};

  } };
  M['QRMath'] = { f: function (module, exports, require) {
var QRMath = {

	glog : function(n) {
	
		if (n < 1) {
			throw new Error("glog(" + n + ")");
		}
		
		return QRMath.LOG_TABLE[n];
	},
	
	gexp : function(n) {
	
		while (n < 0) {
			n += 255;
		}
	
		while (n >= 256) {
			n -= 255;
		}
	
		return QRMath.EXP_TABLE[n];
	},
	
	EXP_TABLE : new Array(256),
	
	LOG_TABLE : new Array(256)

};
	
for (var i = 0; i < 8; i++) {
	QRMath.EXP_TABLE[i] = 1 << i;
}
for (var i = 8; i < 256; i++) {
	QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4]
		^ QRMath.EXP_TABLE[i - 5]
		^ QRMath.EXP_TABLE[i - 6]
		^ QRMath.EXP_TABLE[i - 8];
}
for (var i = 0; i < 255; i++) {
	QRMath.LOG_TABLE[QRMath.EXP_TABLE[i] ] = i;
}

module.exports = QRMath;

  } };
  M['QRMode'] = { f: function (module, exports, require) {
module.exports = {
    MODE_NUMBER :       1 << 0,
    MODE_ALPHA_NUM :    1 << 1,
    MODE_8BIT_BYTE :    1 << 2,
    MODE_KANJI :        1 << 3
};

  } };
  M['QRPolynomial'] = { f: function (module, exports, require) {
var QRMath = require('./QRMath');

function QRPolynomial(num, shift) {
	if (num.length === undefined) {
		throw new Error(num.length + "/" + shift);
	}

	var offset = 0;

	while (offset < num.length && num[offset] === 0) {
		offset++;
	}

	this.num = new Array(num.length - offset + shift);
	for (var i = 0; i < num.length - offset; i++) {
		this.num[i] = num[i + offset];
	}
}

QRPolynomial.prototype = {

	get : function(index) {
		return this.num[index];
	},
	
	getLength : function() {
		return this.num.length;
	},
	
	multiply : function(e) {
	
		var num = new Array(this.getLength() + e.getLength() - 1);
	
		for (var i = 0; i < this.getLength(); i++) {
			for (var j = 0; j < e.getLength(); j++) {
				num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i) ) + QRMath.glog(e.get(j) ) );
			}
		}
	
		return new QRPolynomial(num, 0);
	},
	
	mod : function(e) {
	
		if (this.getLength() - e.getLength() < 0) {
			return this;
		}
	
		var ratio = QRMath.glog(this.get(0) ) - QRMath.glog(e.get(0) );
	
		var num = new Array(this.getLength() );
		
		for (var i = 0; i < this.getLength(); i++) {
			num[i] = this.get(i);
		}
		
		for (var x = 0; x < e.getLength(); x++) {
			num[x] ^= QRMath.gexp(QRMath.glog(e.get(x) ) + ratio);
		}
	
		// recursive call
		return new QRPolynomial(num, 0).mod(e);
	}
};

module.exports = QRPolynomial;

  } };
  M['QRRSBlock'] = { f: function (module, exports, require) {
var QRErrorCorrectLevel = require('./QRErrorCorrectLevel');

function QRRSBlock(totalCount, dataCount) {
	this.totalCount = totalCount;
	this.dataCount  = dataCount;
}

QRRSBlock.RS_BLOCK_TABLE = [

	// L
	// M
	// Q
	// H

	// 1
	[1, 26, 19],
	[1, 26, 16],
	[1, 26, 13],
	[1, 26, 9],
	
	// 2
	[1, 44, 34],
	[1, 44, 28],
	[1, 44, 22],
	[1, 44, 16],

	// 3
	[1, 70, 55],
	[1, 70, 44],
	[2, 35, 17],
	[2, 35, 13],

	// 4		
	[1, 100, 80],
	[2, 50, 32],
	[2, 50, 24],
	[4, 25, 9],
	
	// 5
	[1, 134, 108],
	[2, 67, 43],
	[2, 33, 15, 2, 34, 16],
	[2, 33, 11, 2, 34, 12],
	
	// 6
	[2, 86, 68],
	[4, 43, 27],
	[4, 43, 19],
	[4, 43, 15],
	
	// 7		
	[2, 98, 78],
	[4, 49, 31],
	[2, 32, 14, 4, 33, 15],
	[4, 39, 13, 1, 40, 14],
	
	// 8
	[2, 121, 97],
	[2, 60, 38, 2, 61, 39],
	[4, 40, 18, 2, 41, 19],
	[4, 40, 14, 2, 41, 15],
	
	// 9
	[2, 146, 116],
	[3, 58, 36, 2, 59, 37],
	[4, 36, 16, 4, 37, 17],
	[4, 36, 12, 4, 37, 13],
	
	// 10		
	[2, 86, 68, 2, 87, 69],
	[4, 69, 43, 1, 70, 44],
	[6, 43, 19, 2, 44, 20],
	[6, 43, 15, 2, 44, 16],

	// 11
	[4, 101, 81],
	[1, 80, 50, 4, 81, 51],
	[4, 50, 22, 4, 51, 23],
	[3, 36, 12, 8, 37, 13],

	// 12
	[2, 116, 92, 2, 117, 93],
	[6, 58, 36, 2, 59, 37],
	[4, 46, 20, 6, 47, 21],
	[7, 42, 14, 4, 43, 15],

	// 13
	[4, 133, 107],
	[8, 59, 37, 1, 60, 38],
	[8, 44, 20, 4, 45, 21],
	[12, 33, 11, 4, 34, 12],

	// 14
	[3, 145, 115, 1, 146, 116],
	[4, 64, 40, 5, 65, 41],
	[11, 36, 16, 5, 37, 17],
	[11, 36, 12, 5, 37, 13],

	// 15
	[5, 109, 87, 1, 110, 88],
	[5, 65, 41, 5, 66, 42],
	[5, 54, 24, 7, 55, 25],
	[11, 36, 12],

	// 16
	[5, 122, 98, 1, 123, 99],
	[7, 73, 45, 3, 74, 46],
	[15, 43, 19, 2, 44, 20],
	[3, 45, 15, 13, 46, 16],

	// 17
	[1, 135, 107, 5, 136, 108],
	[10, 74, 46, 1, 75, 47],
	[1, 50, 22, 15, 51, 23],
	[2, 42, 14, 17, 43, 15],

	// 18
	[5, 150, 120, 1, 151, 121],
	[9, 69, 43, 4, 70, 44],
	[17, 50, 22, 1, 51, 23],
	[2, 42, 14, 19, 43, 15],

	// 19
	[3, 141, 113, 4, 142, 114],
	[3, 70, 44, 11, 71, 45],
	[17, 47, 21, 4, 48, 22],
	[9, 39, 13, 16, 40, 14],

	// 20
	[3, 135, 107, 5, 136, 108],
	[3, 67, 41, 13, 68, 42],
	[15, 54, 24, 5, 55, 25],
	[15, 43, 15, 10, 44, 16],

	// 21
	[4, 144, 116, 4, 145, 117],
	[17, 68, 42],
	[17, 50, 22, 6, 51, 23],
	[19, 46, 16, 6, 47, 17],

	// 22
	[2, 139, 111, 7, 140, 112],
	[17, 74, 46],
	[7, 54, 24, 16, 55, 25],
	[34, 37, 13],

	// 23
	[4, 151, 121, 5, 152, 122],
	[4, 75, 47, 14, 76, 48],
	[11, 54, 24, 14, 55, 25],
	[16, 45, 15, 14, 46, 16],

	// 24
	[6, 147, 117, 4, 148, 118],
	[6, 73, 45, 14, 74, 46],
	[11, 54, 24, 16, 55, 25],
	[30, 46, 16, 2, 47, 17],

	// 25
	[8, 132, 106, 4, 133, 107],
	[8, 75, 47, 13, 76, 48],
	[7, 54, 24, 22, 55, 25],
	[22, 45, 15, 13, 46, 16],

	// 26
	[10, 142, 114, 2, 143, 115],
	[19, 74, 46, 4, 75, 47],
	[28, 50, 22, 6, 51, 23],
	[33, 46, 16, 4, 47, 17],

	// 27
	[8, 152, 122, 4, 153, 123],
	[22, 73, 45, 3, 74, 46],
	[8, 53, 23, 26, 54, 24],
	[12, 45, 15, 28, 46, 16],

	// 28
	[3, 147, 117, 10, 148, 118],
	[3, 73, 45, 23, 74, 46],
	[4, 54, 24, 31, 55, 25],
	[11, 45, 15, 31, 46, 16],

	// 29
	[7, 146, 116, 7, 147, 117],
	[21, 73, 45, 7, 74, 46],
	[1, 53, 23, 37, 54, 24],
	[19, 45, 15, 26, 46, 16],

	// 30
	[5, 145, 115, 10, 146, 116],
	[19, 75, 47, 10, 76, 48],
	[15, 54, 24, 25, 55, 25],
	[23, 45, 15, 25, 46, 16],

	// 31
	[13, 145, 115, 3, 146, 116],
	[2, 74, 46, 29, 75, 47],
	[42, 54, 24, 1, 55, 25],
	[23, 45, 15, 28, 46, 16],

	// 32
	[17, 145, 115],
	[10, 74, 46, 23, 75, 47],
	[10, 54, 24, 35, 55, 25],
	[19, 45, 15, 35, 46, 16],

	// 33
	[17, 145, 115, 1, 146, 116],
	[14, 74, 46, 21, 75, 47],
	[29, 54, 24, 19, 55, 25],
	[11, 45, 15, 46, 46, 16],

	// 34
	[13, 145, 115, 6, 146, 116],
	[14, 74, 46, 23, 75, 47],
	[44, 54, 24, 7, 55, 25],
	[59, 46, 16, 1, 47, 17],

	// 35
	[12, 151, 121, 7, 152, 122],
	[12, 75, 47, 26, 76, 48],
	[39, 54, 24, 14, 55, 25],
	[22, 45, 15, 41, 46, 16],

	// 36
	[6, 151, 121, 14, 152, 122],
	[6, 75, 47, 34, 76, 48],
	[46, 54, 24, 10, 55, 25],
	[2, 45, 15, 64, 46, 16],

	// 37
	[17, 152, 122, 4, 153, 123],
	[29, 74, 46, 14, 75, 47],
	[49, 54, 24, 10, 55, 25],
	[24, 45, 15, 46, 46, 16],

	// 38
	[4, 152, 122, 18, 153, 123],
	[13, 74, 46, 32, 75, 47],
	[48, 54, 24, 14, 55, 25],
	[42, 45, 15, 32, 46, 16],

	// 39
	[20, 147, 117, 4, 148, 118],
	[40, 75, 47, 7, 76, 48],
	[43, 54, 24, 22, 55, 25],
	[10, 45, 15, 67, 46, 16],

	// 40
	[19, 148, 118, 6, 149, 119],
	[18, 75, 47, 31, 76, 48],
	[34, 54, 24, 34, 55, 25],
	[20, 45, 15, 61, 46, 16]
];

QRRSBlock.getRSBlocks = function(typeNumber, errorCorrectLevel) {
	
	var rsBlock = QRRSBlock.getRsBlockTable(typeNumber, errorCorrectLevel);
	
	if (rsBlock === undefined) {
		throw new Error("bad rs block @ typeNumber:" + typeNumber + "/errorCorrectLevel:" + errorCorrectLevel);
	}

	var length = rsBlock.length / 3;
	
	var list = [];
	
	for (var i = 0; i < length; i++) {

		var count = rsBlock[i * 3 + 0];
		var totalCount = rsBlock[i * 3 + 1];
		var dataCount  = rsBlock[i * 3 + 2];

		for (var j = 0; j < count; j++) {
			list.push(new QRRSBlock(totalCount, dataCount) );	
		}
	}
	
	return list;
};

QRRSBlock.getRsBlockTable = function(typeNumber, errorCorrectLevel) {

	switch(errorCorrectLevel) {
	case QRErrorCorrectLevel.L :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
	case QRErrorCorrectLevel.M :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
	case QRErrorCorrectLevel.Q :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
	case QRErrorCorrectLevel.H :
		return QRRSBlock.RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
	default :
		return undefined;
	}
};

module.exports = QRRSBlock;

  } };
  M['QRUtil'] = { f: function (module, exports, require) {
var QRMode = require('./QRMode');
var QRPolynomial = require('./QRPolynomial');
var QRMath = require('./QRMath');
var QRMaskPattern = require('./QRMaskPattern');

var QRUtil = {

    PATTERN_POSITION_TABLE : [
        [],
        [6, 18],
        [6, 22],
        [6, 26],
        [6, 30],
        [6, 34],
        [6, 22, 38],
        [6, 24, 42],
        [6, 26, 46],
        [6, 28, 50],
        [6, 30, 54],        
        [6, 32, 58],
        [6, 34, 62],
        [6, 26, 46, 66],
        [6, 26, 48, 70],
        [6, 26, 50, 74],
        [6, 30, 54, 78],
        [6, 30, 56, 82],
        [6, 30, 58, 86],
        [6, 34, 62, 90],
        [6, 28, 50, 72, 94],
        [6, 26, 50, 74, 98],
        [6, 30, 54, 78, 102],
        [6, 28, 54, 80, 106],
        [6, 32, 58, 84, 110],
        [6, 30, 58, 86, 114],
        [6, 34, 62, 90, 118],
        [6, 26, 50, 74, 98, 122],
        [6, 30, 54, 78, 102, 126],
        [6, 26, 52, 78, 104, 130],
        [6, 30, 56, 82, 108, 134],
        [6, 34, 60, 86, 112, 138],
        [6, 30, 58, 86, 114, 142],
        [6, 34, 62, 90, 118, 146],
        [6, 30, 54, 78, 102, 126, 150],
        [6, 24, 50, 76, 102, 128, 154],
        [6, 28, 54, 80, 106, 132, 158],
        [6, 32, 58, 84, 110, 136, 162],
        [6, 26, 54, 82, 110, 138, 166],
        [6, 30, 58, 86, 114, 142, 170]
    ],

    G15 : (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0),
    G18 : (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0),
    G15_MASK : (1 << 14) | (1 << 12) | (1 << 10)    | (1 << 4) | (1 << 1),

    getBCHTypeInfo : function(data) {
        var d = data << 10;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) >= 0) {
            d ^= (QRUtil.G15 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G15) ) );    
        }
        return ( (data << 10) | d) ^ QRUtil.G15_MASK;
    },

    getBCHTypeNumber : function(data) {
        var d = data << 12;
        while (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) >= 0) {
            d ^= (QRUtil.G18 << (QRUtil.getBCHDigit(d) - QRUtil.getBCHDigit(QRUtil.G18) ) );    
        }
        return (data << 12) | d;
    },

    getBCHDigit : function(data) {

        var digit = 0;

        while (data !== 0) {
            digit++;
            data >>>= 1;
        }

        return digit;
    },

    getPatternPosition : function(typeNumber) {
        return QRUtil.PATTERN_POSITION_TABLE[typeNumber - 1];
    },

    getMask : function(maskPattern, i, j) {
        
        switch (maskPattern) {
            
        case QRMaskPattern.PATTERN000 : return (i + j) % 2 === 0;
        case QRMaskPattern.PATTERN001 : return i % 2 === 0;
        case QRMaskPattern.PATTERN010 : return j % 3 === 0;
        case QRMaskPattern.PATTERN011 : return (i + j) % 3 === 0;
        case QRMaskPattern.PATTERN100 : return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 === 0;
        case QRMaskPattern.PATTERN101 : return (i * j) % 2 + (i * j) % 3 === 0;
        case QRMaskPattern.PATTERN110 : return ( (i * j) % 2 + (i * j) % 3) % 2 === 0;
        case QRMaskPattern.PATTERN111 : return ( (i * j) % 3 + (i + j) % 2) % 2 === 0;

        default :
            throw new Error("bad maskPattern:" + maskPattern);
        }
    },

    getErrorCorrectPolynomial : function(errorCorrectLength) {

        var a = new QRPolynomial([1], 0);

        for (var i = 0; i < errorCorrectLength; i++) {
            a = a.multiply(new QRPolynomial([1, QRMath.gexp(i)], 0) );
        }

        return a;
    },

    getLengthInBits : function(mode, type) {

        if (1 <= type && type < 10) {

            // 1 - 9

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 10;
            case QRMode.MODE_ALPHA_NUM  : return 9;
            case QRMode.MODE_8BIT_BYTE  : return 8;
            case QRMode.MODE_KANJI      : return 8;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 27) {

            // 10 - 26

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 12;
            case QRMode.MODE_ALPHA_NUM  : return 11;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 10;
            default :
                throw new Error("mode:" + mode);
            }

        } else if (type < 41) {

            // 27 - 40

            switch(mode) {
            case QRMode.MODE_NUMBER     : return 14;
            case QRMode.MODE_ALPHA_NUM  : return 13;
            case QRMode.MODE_8BIT_BYTE  : return 16;
            case QRMode.MODE_KANJI      : return 12;
            default :
                throw new Error("mode:" + mode);
            }

        } else {
            throw new Error("type:" + type);
        }
    },

    getLostPoint : function(qrCode) {
        
        var moduleCount = qrCode.getModuleCount();
        var lostPoint = 0;
        var row = 0; 
        var col = 0;

        
        // LEVEL1
        
        for (row = 0; row < moduleCount; row++) {

            for (col = 0; col < moduleCount; col++) {

                var sameCount = 0;
                var dark = qrCode.isDark(row, col);

                for (var r = -1; r <= 1; r++) {

                    if (row + r < 0 || moduleCount <= row + r) {
                        continue;
                    }

                    for (var c = -1; c <= 1; c++) {

                        if (col + c < 0 || moduleCount <= col + c) {
                            continue;
                        }

                        if (r === 0 && c === 0) {
                            continue;
                        }

                        if (dark === qrCode.isDark(row + r, col + c) ) {
                            sameCount++;
                        }
                    }
                }

                if (sameCount > 5) {
                    lostPoint += (3 + sameCount - 5);
                }
            }
        }

        // LEVEL2

        for (row = 0; row < moduleCount - 1; row++) {
            for (col = 0; col < moduleCount - 1; col++) {
                var count = 0;
                if (qrCode.isDark(row,     col    ) ) count++;
                if (qrCode.isDark(row + 1, col    ) ) count++;
                if (qrCode.isDark(row,     col + 1) ) count++;
                if (qrCode.isDark(row + 1, col + 1) ) count++;
                if (count === 0 || count === 4) {
                    lostPoint += 3;
                }
            }
        }

        // LEVEL3

        for (row = 0; row < moduleCount; row++) {
            for (col = 0; col < moduleCount - 6; col++) {
                if (qrCode.isDark(row, col) && 
                        !qrCode.isDark(row, col + 1) && 
                         qrCode.isDark(row, col + 2) && 
                         qrCode.isDark(row, col + 3) && 
                         qrCode.isDark(row, col + 4) && 
                        !qrCode.isDark(row, col + 5) && 
                         qrCode.isDark(row, col + 6) ) {
                    lostPoint += 40;
                }
            }
        }

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount - 6; row++) {
                if (qrCode.isDark(row, col) &&
                        !qrCode.isDark(row + 1, col) &&
                         qrCode.isDark(row + 2, col) &&
                         qrCode.isDark(row + 3, col) &&
                         qrCode.isDark(row + 4, col) &&
                        !qrCode.isDark(row + 5, col) &&
                         qrCode.isDark(row + 6, col) ) {
                    lostPoint += 40;
                }
            }
        }

        // LEVEL4
        
        var darkCount = 0;

        for (col = 0; col < moduleCount; col++) {
            for (row = 0; row < moduleCount; row++) {
                if (qrCode.isDark(row, col) ) {
                    darkCount++;
                }
            }
        }
        
        var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
        lostPoint += ratio * 10;

        return lostPoint;       
    }

};

module.exports = QRUtil;

  } };
  M['index'] = { f: function (module, exports, require) {


















var QR8bitByte = require('./QR8bitByte');
var QRUtil = require('./QRUtil');
var QRPolynomial = require('./QRPolynomial');
var QRRSBlock = require('./QRRSBlock');
var QRBitBuffer = require('./QRBitBuffer');

function QRCode(typeNumber, errorCorrectLevel) {
	this.typeNumber = typeNumber;
	this.errorCorrectLevel = errorCorrectLevel;
	this.modules = null;
	this.moduleCount = 0;
	this.dataCache = null;
	this.dataList = [];
}

QRCode.prototype = {
	
	addData : function(data) {
		var newData = new QR8bitByte(data);
		this.dataList.push(newData);
		this.dataCache = null;
	},
	
	isDark : function(row, col) {
		if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
			throw new Error(row + "," + col);
		}
		return this.modules[row][col];
	},

	getModuleCount : function() {
		return this.moduleCount;
	},
	
	make : function() {
		// Calculate automatically typeNumber if provided is < 1
		if (this.typeNumber < 1 ){
			var typeNumber = 1;
			for (typeNumber = 1; typeNumber < 40; typeNumber++) {
				var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, this.errorCorrectLevel);

				var buffer = new QRBitBuffer();
				var totalDataCount = 0;
				for (var i = 0; i < rsBlocks.length; i++) {
					totalDataCount += rsBlocks[i].dataCount;
				}

				for (var x = 0; x < this.dataList.length; x++) {
					var data = this.dataList[x];
					buffer.put(data.mode, 4);
					buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
					data.write(buffer);
				}
				if (buffer.getLengthInBits() <= totalDataCount * 8)
					break;
			}
			this.typeNumber = typeNumber;
		}
		this.makeImpl(false, this.getBestMaskPattern() );
	},
	
	makeImpl : function(test, maskPattern) {
		
		this.moduleCount = this.typeNumber * 4 + 17;
		this.modules = new Array(this.moduleCount);
		
		for (var row = 0; row < this.moduleCount; row++) {
			
			this.modules[row] = new Array(this.moduleCount);
			
			for (var col = 0; col < this.moduleCount; col++) {
				this.modules[row][col] = null;//(col + row) % 3;
			}
		}
	
		this.setupPositionProbePattern(0, 0);
		this.setupPositionProbePattern(this.moduleCount - 7, 0);
		this.setupPositionProbePattern(0, this.moduleCount - 7);
		this.setupPositionAdjustPattern();
		this.setupTimingPattern();
		this.setupTypeInfo(test, maskPattern);
		
		if (this.typeNumber >= 7) {
			this.setupTypeNumber(test);
		}
	
		if (this.dataCache === null) {
			this.dataCache = QRCode.createData(this.typeNumber, this.errorCorrectLevel, this.dataList);
		}
	
		this.mapData(this.dataCache, maskPattern);
	},

	setupPositionProbePattern : function(row, col)  {
		
		for (var r = -1; r <= 7; r++) {
			
			if (row + r <= -1 || this.moduleCount <= row + r) continue;
			
			for (var c = -1; c <= 7; c++) {
				
				if (col + c <= -1 || this.moduleCount <= col + c) continue;
				
				if ( (0 <= r && r <= 6 && (c === 0 || c === 6) ) || 
                     (0 <= c && c <= 6 && (r === 0 || r === 6) ) || 
                     (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
					this.modules[row + r][col + c] = true;
				} else {
					this.modules[row + r][col + c] = false;
				}
			}		
		}		
	},
	
	getBestMaskPattern : function() {
	
		var minLostPoint = 0;
		var pattern = 0;
	
		for (var i = 0; i < 8; i++) {
			
			this.makeImpl(true, i);
	
			var lostPoint = QRUtil.getLostPoint(this);
	
			if (i === 0 || minLostPoint >  lostPoint) {
				minLostPoint = lostPoint;
				pattern = i;
			}
		}
	
		return pattern;
	},
	
	createMovieClip : function(target_mc, instance_name, depth) {
	
		var qr_mc = target_mc.createEmptyMovieClip(instance_name, depth);
		var cs = 1;
	
		this.make();

		for (var row = 0; row < this.modules.length; row++) {
			
			var y = row * cs;
			
			for (var col = 0; col < this.modules[row].length; col++) {
	
				var x = col * cs;
				var dark = this.modules[row][col];
			
				if (dark) {
					qr_mc.beginFill(0, 100);
					qr_mc.moveTo(x, y);
					qr_mc.lineTo(x + cs, y);
					qr_mc.lineTo(x + cs, y + cs);
					qr_mc.lineTo(x, y + cs);
					qr_mc.endFill();
				}
			}
		}
		
		return qr_mc;
	},

	setupTimingPattern : function() {
		
		for (var r = 8; r < this.moduleCount - 8; r++) {
			if (this.modules[r][6] !== null) {
				continue;
			}
			this.modules[r][6] = (r % 2 === 0);
		}
	
		for (var c = 8; c < this.moduleCount - 8; c++) {
			if (this.modules[6][c] !== null) {
				continue;
			}
			this.modules[6][c] = (c % 2 === 0);
		}
	},
	
	setupPositionAdjustPattern : function() {
	
		var pos = QRUtil.getPatternPosition(this.typeNumber);
		
		for (var i = 0; i < pos.length; i++) {
		
			for (var j = 0; j < pos.length; j++) {
			
				var row = pos[i];
				var col = pos[j];
				
				if (this.modules[row][col] !== null) {
					continue;
				}
				
				for (var r = -2; r <= 2; r++) {
				
					for (var c = -2; c <= 2; c++) {
					
						if (Math.abs(r) === 2 || 
                            Math.abs(c) === 2 ||
                            (r === 0 && c === 0) ) {
							this.modules[row + r][col + c] = true;
						} else {
							this.modules[row + r][col + c] = false;
						}
					}
				}
			}
		}
	},
	
	setupTypeNumber : function(test) {
	
		var bits = QRUtil.getBCHTypeNumber(this.typeNumber);
        var mod;
	
		for (var i = 0; i < 18; i++) {
			mod = (!test && ( (bits >> i) & 1) === 1);
			this.modules[Math.floor(i / 3)][i % 3 + this.moduleCount - 8 - 3] = mod;
		}
	
		for (var x = 0; x < 18; x++) {
			mod = (!test && ( (bits >> x) & 1) === 1);
			this.modules[x % 3 + this.moduleCount - 8 - 3][Math.floor(x / 3)] = mod;
		}
	},
	
	setupTypeInfo : function(test, maskPattern) {
	
		var data = (this.errorCorrectLevel << 3) | maskPattern;
		var bits = QRUtil.getBCHTypeInfo(data);
        var mod;
	
		// vertical		
		for (var v = 0; v < 15; v++) {
	
			mod = (!test && ( (bits >> v) & 1) === 1);
	
			if (v < 6) {
				this.modules[v][8] = mod;
			} else if (v < 8) {
				this.modules[v + 1][8] = mod;
			} else {
				this.modules[this.moduleCount - 15 + v][8] = mod;
			}
		}
	
		// horizontal
		for (var h = 0; h < 15; h++) {
	
			mod = (!test && ( (bits >> h) & 1) === 1);
			
			if (h < 8) {
				this.modules[8][this.moduleCount - h - 1] = mod;
			} else if (h < 9) {
				this.modules[8][15 - h - 1 + 1] = mod;
			} else {
				this.modules[8][15 - h - 1] = mod;
			}
		}
	
		// fixed module
		this.modules[this.moduleCount - 8][8] = (!test);
	
	},
	
	mapData : function(data, maskPattern) {
		
		var inc = -1;
		var row = this.moduleCount - 1;
		var bitIndex = 7;
		var byteIndex = 0;
		
		for (var col = this.moduleCount - 1; col > 0; col -= 2) {
	
			if (col === 6) col--;
	
			while (true) {
	
				for (var c = 0; c < 2; c++) {
					
					if (this.modules[row][col - c] === null) {
						
						var dark = false;
	
						if (byteIndex < data.length) {
							dark = ( ( (data[byteIndex] >>> bitIndex) & 1) === 1);
						}
	
						var mask = QRUtil.getMask(maskPattern, row, col - c);
	
						if (mask) {
							dark = !dark;
						}
						
						this.modules[row][col - c] = dark;
						bitIndex--;
	
						if (bitIndex === -1) {
							byteIndex++;
							bitIndex = 7;
						}
					}
				}
								
				row += inc;
	
				if (row < 0 || this.moduleCount <= row) {
					row -= inc;
					inc = -inc;
					break;
				}
			}
		}
		
	}

};

QRCode.PAD0 = 0xEC;
QRCode.PAD1 = 0x11;

QRCode.createData = function(typeNumber, errorCorrectLevel, dataList) {
	
	var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectLevel);
	
	var buffer = new QRBitBuffer();
	
	for (var i = 0; i < dataList.length; i++) {
		var data = dataList[i];
		buffer.put(data.mode, 4);
		buffer.put(data.getLength(), QRUtil.getLengthInBits(data.mode, typeNumber) );
		data.write(buffer);
	}

	// calc num max data.
	var totalDataCount = 0;
	for (var x = 0; x < rsBlocks.length; x++) {
		totalDataCount += rsBlocks[x].dataCount;
	}

	if (buffer.getLengthInBits() > totalDataCount * 8) {
		throw new Error("code length overflow. (" + 
            buffer.getLengthInBits() + 
            ">" +  
            totalDataCount * 8 + 
            ")");
	}

	// end code
	if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
		buffer.put(0, 4);
	}

	// padding
	while (buffer.getLengthInBits() % 8 !== 0) {
		buffer.putBit(false);
	}

	// padding
	while (true) {
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD0, 8);
		
		if (buffer.getLengthInBits() >= totalDataCount * 8) {
			break;
		}
		buffer.put(QRCode.PAD1, 8);
	}

	return QRCode.createBytes(buffer, rsBlocks);
};

QRCode.createBytes = function(buffer, rsBlocks) {

	var offset = 0;
	
	var maxDcCount = 0;
	var maxEcCount = 0;
	
	var dcdata = new Array(rsBlocks.length);
	var ecdata = new Array(rsBlocks.length);
	
	for (var r = 0; r < rsBlocks.length; r++) {

		var dcCount = rsBlocks[r].dataCount;
		var ecCount = rsBlocks[r].totalCount - dcCount;

		maxDcCount = Math.max(maxDcCount, dcCount);
		maxEcCount = Math.max(maxEcCount, ecCount);
		
		dcdata[r] = new Array(dcCount);
		
		for (var i = 0; i < dcdata[r].length; i++) {
			dcdata[r][i] = 0xff & buffer.buffer[i + offset];
		}
		offset += dcCount;
		
		var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
		var rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);

		var modPoly = rawPoly.mod(rsPoly);
		ecdata[r] = new Array(rsPoly.getLength() - 1);
		for (var x = 0; x < ecdata[r].length; x++) {
            var modIndex = x + modPoly.getLength() - ecdata[r].length;
			ecdata[r][x] = (modIndex >= 0)? modPoly.get(modIndex) : 0;
		}

	}
	
	var totalCodeCount = 0;
	for (var y = 0; y < rsBlocks.length; y++) {
		totalCodeCount += rsBlocks[y].totalCount;
	}

	var data = new Array(totalCodeCount);
	var index = 0;

	for (var z = 0; z < maxDcCount; z++) {
		for (var s = 0; s < rsBlocks.length; s++) {
			if (z < dcdata[s].length) {
				data[index++] = dcdata[s][z];
			}
		}
	}

	for (var xx = 0; xx < maxEcCount; xx++) {
		for (var t = 0; t < rsBlocks.length; t++) {
			if (xx < ecdata[t].length) {
				data[index++] = ecdata[t][xx];
			}
		}
	}

	return data;

};

module.exports = QRCode;

  } };
  return req('index');
})();


function qrSvg(teks) {
  const q = new SipQR(0, 0); q.addData(teks); q.make();
  const n = q.getModuleCount(); let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-3 -3 ' + (n + 6) + ' ' + (n + 6) + '" shape-rendering="crispEdges"><rect x="-3" y="-3" width="' + (n + 6) + '" height="' + (n + 6) + '" fill="#fff"/><path d="' + d + '" fill="#000"/></svg>';
}

// ── Status halaman QR (tetap hidup walau pindah menu agar antrean scan tetap terkirim) ──
const QS = { tab: 'scan', peta: {}, tgl: '', log: [], antre: [], kirim: false, seq: 0, stream: null, timer: 0, det: null, jsqr: false, cv: null, audio: null, lastKode: '', lastT: 0, kartu: null, galatBeruntun: 0, aturan: null, rekap: null, rfilter: 'semua', rtgl: '', rkelas: '', popId: '', popT: 0, popTipe: '' };
const POLA_QR = /^SIPEDU-(.+)-[0-9A-Fa-f]{10}$/i;

function bacaAntreQr() {
  try {
    const a = JSON.parse(localStorage.getItem('sipedu_scanq') || '[]'), t = todayStr();
    return a.filter(x => x && x.kode && new Date(x.t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }) === t);
  } catch (e) { return []; }
}
function simpanAntreQr() { try { localStorage.setItem('sipedu_scanq', JSON.stringify(QS.antre)); } catch (e) { /* abaikan */ } }

async function pQr(rid) {
  const t = todayStr();
  const r = await apiT('apiScanHari', { tanggal: t });
  if (!aktif(rid)) return;
  if (!r.success) return galat(r, rid);
  QS.peta = r.data.peta; QS.tgl = r.data.tanggal; QS.urlApp = r.data.urlApp || QS.urlApp; QS.aturan = r.data.aturan || QS.aturan;
  if (!QS.antre.length) QS.antre = bacaAntreQr();
  QS.antre.forEach(x => { if (x.nisn && !QS.peta[x.nisn]) QS.peta[x.nisn] = jamLokal(x.t); });
  renderQr(rid);
  if (QS.antre.length) qrKirim();
}
function jamLokal(ms) { return new Date(ms || Date.now()).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' }); }
function boleh() { return S.user.role === 'admin' || S.user.isPiket; }

function renderQr(rid) {
  let h = '<h1 class="page-title">Presensi QR</h1><div class="page-sub">Scan kartu QR murid — kehadiran tercatat otomatis beserta jamnya.</div>';
  h += '<div class="seg mb"><button type="button" class="' + (QS.tab === 'scan' ? 'on' : '') + '" data-act="qrtab" data-t="scan">Scan</button><button type="button" class="' + (QS.tab === 'rekap' ? 'on' : '') + '" data-act="qrtab" data-t="rekap">Rekap Waktu</button><button type="button" class="' + (QS.tab === 'telat' ? 'on' : '') + '" data-act="qrtab" data-t="telat">Rekap Telat</button><button type="button" class="' + (QS.tab === 'kartu' ? 'on' : '') + '" data-act="qrtab" data-t="kartu">Cetak Kartu</button></div>';
  h += '<div id="qr-isi">' + (QS.tab === 'scan' ? qrScanHtml() : QS.tab === 'rekap' ? qrRekapHtml() : QS.tab === 'telat' ? qrTelatHtml() : qrKartuHtml()) + '</div>';
  halaman(h, rid);
  if (QS.tab === 'scan') { qrSegarkan(); fokusQr(); } else if (QS.tab === 'rekap') qrRekapMuat(); else if (QS.tab === 'telat') qrTelatMuat();
}
function fokusQr() { if (window.innerWidth > 700) setTimeout(() => { const i = $('#qr-in'); if (i && !QS.stream) i.focus(); }, 80); }

function qrScanHtml() {
  return qrAturanHtml() + '<div class="card"><div class="between"><b>Hari ini • ' + esc(fTgl(todayStr())) + '</b><span class="chip ok" id="qr-total">0</span></div>' +
    '<div class="row mt"><button type="button" class="btn sm ghost" id="qr-suara" data-act="qrsuara">' + qrSuaraLabel() + '</button><button type="button" class="btn sm ghost" data-act="qrtessuara">' + ic('campaign', 'sm') + 'Tes Suara</button><button type="button" class="btn sm ghost" id="qr-cepat" data-act="qrcepat">' + qrCepatLabel() + '</button></div>' +
    '<div class="qr-cam" id="qr-cam" hidden><video id="qr-vid" playsinline muted></video><div class="qr-frame"></div></div>' +
    '<div class="small muted mt" id="qr-pesan"></div>' +
    '<div class="row mt"><button type="button" class="btn grow" id="qr-btn" data-act="qrcam">' + ic('photo_camera', 'sm') + 'Nyalakan Kamera</button><label class="btn ghost" style="margin:0;cursor:pointer">' + ic('add_a_photo', 'sm') + 'Foto QR<input type="file" id="qr-foto" accept="image/*" capture="environment" hidden></label></div>' +
    '<label class="f" for="qr-in">Scanner USB' + (boleh() ? ' / ketik NISN' : '') + '</label><input class="inp" id="qr-in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Arahkan scanner ke sini lalu scan kartu…"></div>' +
    '<div id="qr-antre"></div>' + (boleh() ? qrBantuHtml() : '') +
    '<div class="card mt"><h3>Scan terakhir</h3><div id="qr-log"></div></div>' +
    '<div class="card mt"><h3>Progres per kelas</h3><div id="qr-kelas"></div></div>' +
    '<div class="card mt"><h3>Halaman Scanner (opsional)</h3><div class="small muted">Kamera kini bisa dipakai langsung lewat tombol <b>Nyalakan Kamera</b>. Halaman Scanner terpisah hanya diperlukan bila sekolah memakai perangkat scan khusus. Data tetap masuk ke database yang sama.</div>' +
    '<label class="f" for="qr-surl">Alamat Halaman Scanner</label><input class="inp" id="qr-surl" placeholder="https://…/scanner.html" autocomplete="off" value="' + esc(scannerUrl()) + '">' +
    '<button type="button" class="btn block mt" data-act="qrscanner">' + ic('open_in_new', 'sm') + 'Buka Scanner</button></div>';
}
function scannerUrl() { try { return localStorage.getItem('sipedu_scanner_url') || ''; } catch (e) { return ''; } }
async function qrFoto(file) {
  if (!file) return;
  qrPesan('Membaca foto…');
  try {
    if (!await qrSiapDecoder()) return qrPesan('Pemindai QR gagal dimuat (perlu internet).', 'err');
    const bmp = await createImageBitmap(file), skala = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * skala); c.height = Math.round(bmp.height * skala);
    const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, c.width, c.height);
    let kode = '';
    if (QS.det) { const h = await QS.det.detect(c); if (h && h[0]) kode = h[0].rawValue; }
    else { const d = x.getImageData(0, 0, c.width, c.height), r = window.jsQR(d.data, c.width, c.height, { inversionAttempts: 'attemptBoth' }); if (r) kode = r.data; }
    if (!kode) { qrPesan('QR tidak terbaca. Dekatkan kartu, pastikan terang dan tidak buram, lalu ulangi.', 'err'); bunyi('err'); return; }
    qrPesan(''); qrMasuk(kode);
  } catch (e) { qrPesan('Foto tidak dapat dibaca: ' + (e && e.message || e), 'err'); }
}

function qrSegarkan() {
  const tot = $('#qr-total'); if (!tot) return;
  const kelas = kelasInput();
  let sudah = 0, jml = 0;
  const bar = kelas.map(k => {
    const r = muridKelas(k.nama), s = r.filter(m => QS.peta[m[0]]).length; sudah += s; jml += r.length;
    const p = r.length ? Math.round(s * 100 / r.length) : 0;
    return '<div class="qr-kls"><div class="between"><b>' + esc(k.nama) + '</b><span class="small muted">' + s + '/' + r.length + '</span></div><div class="progress"><i style="width:' + p + '%"></i></div></div>';
  }).join('');
  tot.textContent = sudah + ' / ' + jml + ' murid sudah scan';
  $('#qr-kelas').innerHTML = bar || '<div class="small muted">Belum ada kelas.</div>';
  const ik = { ok: 'check_circle', dup: 'info', pending: 'hourglass_top' };
  $('#qr-log').innerHTML = QS.log.length ? QS.log.map(e => '<div class="qr-item ' + (e.st === 'ok' ? 'ok' : e.st === 'dup' ? 'warn' : e.st === 'pending' ? 'pend' : 'err') + '">' + ic(ik[e.st] || 'error', 'fill') +
    '<div class="grow"><b>' + esc(e.nama || 'Tidak dikenal') + '</b>' + (e.kelas ? ' <span class="small muted">Kelas ' + esc(e.kelas) + '</span>' : '') +
    '<div class="small ' + (e.st === 'ok' || e.st === 'pending' ? 'muted' : '') + '">' + (e.st === 'ok' ? 'Hadir • ' + esc(e.waktu || '') : e.st === 'pending' ? 'Memproses…' : e.st === 'dup' ? 'Sudah scan pukul ' + esc(e.waktu || '') : esc(e.pesan || 'Gagal')) + (e.peringatan ? ' • ⚠ ' + esc(e.peringatan) : '') + '</div></div></div>').join('') : '<div class="small muted">Belum ada scan.</div>';
  if ($('#qr-cari-hasil') && ($('#qr-cari') || {}).value) qrCari();
  const an = $('#qr-antre');
  if (an) an.innerHTML = QS.antre.length ? '<div class="banner warn mt">' + ic('sync_problem') + '<div><b>' + QS.antre.length + ' scan menunggu terkirim.</b> Tersimpan di perangkat dan dikirim otomatis saat koneksi tersedia.' + (QS.kirim ? '' : ' <a href="#" data-act="qrkirimulang" style="font-weight:700">Kirim sekarang</a>') + '</div></div>' : '';
}
function qrLog(e) { e.id = e.id || ('l' + (++QS.seq)); QS.log.unshift(e); if (QS.log.length > 30) QS.log.pop(); qrSegarkan(); return e; }
// ── Suara pengumuman: ucapan Indonesia (suara bawaan perangkat) + nada khas tiap hasil ──
// "Berhasil" = presensi tercatat, "Sudah Scan" = scan lebih dari 1x, "Coba Lagi" = gagal/ditolak.
const SUARA = { on: true, voice: null, ac: null, tm: 0 };
// Mode Cepat (antrean murid): popup kecil & singkat, bunyi "tik" pendek, tanpa konfeti/suara bicara. Bawaan AKTIF; dapat dimatikan lewat tombol di menu Scan.
const CEPAT = { on: (function () { try { return localStorage.getItem('sipmur_cepat') !== '0'; } catch (e) { return true; } })() };
try { SUARA.on = localStorage.getItem('sipedu_suara') !== '0'; } catch (e) { /* abaikan */ }
const SUARA_KATA = { ok: 'Berhasil', dup: 'Sudah Scan', gagal: 'Coba Lagi' };
function suaraPilih() {
  try {
    const v = window.speechSynthesis.getVoices() || [];
    SUARA.voice = v.find(x => /^id([-_]|$)/i.test(x.lang)) || v.find(x => /^in[-_]/i.test(x.lang)) || v.find(x => /indonesia/i.test(x.name)) || null;
  } catch (e) { /* abaikan */ }
}
try { if ('speechSynthesis' in window) { suaraPilih(); window.speechSynthesis.addEventListener('voiceschanged', suaraPilih); } } catch (e) { /* abaikan */ }
function suaraCtx() {
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  if (!SUARA.ac) SUARA.ac = new AC();
  if (SUARA.ac.state === 'suspended') SUARA.ac.resume();
  return SUARA.ac;
}
function suaraNada(c, f0, f1, t0, dur, tipe, vol) {
  const o = c.createOscillator(), g = c.createGain(); o.type = tipe; o.connect(g); g.connect(c.destination);
  o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
function suaraUcap(teks) {
  try {
    const ss = window.speechSynthesis; if (!ss || !SUARA.on) return;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(teks); u.lang = 'id-ID'; if (SUARA.voice) u.voice = SUARA.voice; u.rate = 1; u.pitch = 1.05; u.volume = 1;
    ss.speak(u);
  } catch (e) { /* abaikan */ }
}
/** jenis: tick (scan terbaca, menunggu server) | ok | dup | gagal */
function suara(jenis) {
  if (CEPAT.on && jenis === 'ok') jenis = 'tick';
  try { if (navigator.vibrate) navigator.vibrate(jenis === 'ok' || jenis === 'tick' ? 40 : jenis === 'dup' ? [60, 40, 60] : [90, 50, 90]); } catch (e) { /* abaikan */ }
  if (!SUARA.on) return;
  try {
    const c = suaraCtx();
    if (c) {
      const t = c.currentTime + 0.01;
      if (jenis === 'tick') suaraNada(c, 880, 880, t, 0.08, 'sine', 0.14);
      else if (jenis === 'ok') [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => suaraNada(c, f, f, t + i * 0.085, 0.2, 'triangle', 0.22));
      else if (jenis === 'dup') [587.33, 587.33].forEach((f, i) => suaraNada(c, f, f, t + i * 0.16, 0.13, 'sine', 0.22));
      else suaraNada(c, 233, 117, t, 0.42, 'sawtooth', 0.14);
    }
  } catch (e) { /* abaikan */ }
  if (SUARA_KATA[jenis]) { clearTimeout(SUARA.tm); SUARA.tm = setTimeout(() => suaraUcap(SUARA_KATA[jenis]), jenis === 'ok' ? 330 : 280); }
}
/** Suara sesuai jawaban server untuk satu scan. */
function suaraHasil(h) { if (h.st === 'ok') return; suara(h.st === 'ok' ? 'ok' : h.st === 'dup' ? 'dup' : 'gagal'); }
function bunyi(t) { suara(t === 'ok' ? 'tick' : t === 'warn' ? 'dup' : 'gagal'); }
function suaraToggle() {
  SUARA.on = !SUARA.on;
  try { localStorage.setItem('sipedu_suara', SUARA.on ? '1' : '0'); } catch (e) { /* abaikan */ }
  if (!SUARA.on) { try { window.speechSynthesis.cancel(); } catch (e) { /* abaikan */ } }
  return SUARA.on;
}
function suaraTes() {
  if (!SUARA.on) suaraToggle();
  suara('ok'); setTimeout(() => suara('dup'), 1900); setTimeout(() => suara('gagal'), 3800);
}
// Browser baru mengizinkan suara setelah ada sentuhan/ketikan pertama: siapkan pada saat itu.
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, function buka() {
  document.removeEventListener(ev, buka, true);
  try { suaraCtx(); suaraPilih(); const ss = window.speechSynthesis; if (ss) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; ss.speak(u); } } catch (e) { /* abaikan */ }
}, true));

// ── Masuknya satu kode (dari kamera, scanner USB, atau ketik manual) ──
function qrMasuk(mentah) {
  const kode = String(mentah || '').trim(); if (!kode) return;
  const m = POLA_QR.exec(kode);
  if (!m && boleh() && /\D/.test(kode) && !isSementara(kode.toUpperCase())) { qrCariIsi(kode); return; }   // bukan kode kartu & bukan NISN → dianggap nama lengkap
  const manual = !m;
  if (manual && !boleh()) {
    qrLog({ st: 'invalid', pesan: 'Kode QR tidak dikenali.' });
    qrPop({ tipe: 'err', judul: 'Kode Tidak Dikenali', pesan: 'Ini bukan kartu presensi sekolah. Silakan minta bantuan Guru Piket.' });
    bunyi('err'); return;
  }
  const al = S.boot.alias || {};
  let nisn = manual ? kode.toUpperCase() : m[1];
  for (let i = 0; i < 10 && al[nisn]; i++) nisn = al[nisn]; // kartu/ID lama yang NISN-nya sudah diganti
  const mur = S.boot.murid.find(x => x[0] === nisn);
  if (QS.peta[nisn]) {
    qrLog({ st: 'dup', nama: mur ? mur[1] : nisn, kelas: mur ? mur[2] : '', waktu: QS.peta[nisn] });
    qrPop({ tipe: 'warn', judul: 'Sudah Presensi', nama: mur ? mur[1] : nisn, kelas: mur ? mur[2] : '', waktu: QS.peta[nisn], pesan: 'Presensi hanya dapat dilakukan 1 kali per hari.' });
    bunyi('warn'); return;
  }
  if (!mur && manual) {
    qrLog({ st: 'tidak_ada', pesan: 'NISN tidak terdaftar.' });
    qrPop({ tipe: 'err', judul: 'NISN Tidak Terdaftar', pesan: 'Periksa kembali NISN, atau cari dengan nama lengkap.' });
    bunyi('err'); return;
  }
  let nj = { st: 'tepat', telat: 0 };
  if (mur) {
    const shK = qrShiftKelas(mur[2]);
    nj = qrNilai(shK, qrNow().hm);
    if (nj.st === 'belum_buka') {
      const msg = 'Presensi Shift ' + shK + ' baru dibuka pukul ' + qrTitik(QS.aturan[shK].buka) + ' WIB.';
      qrLog({ st: 'belum_buka', nama: mur[1], kelas: mur[2], pesan: msg });
      qrPop({ tipe: 'err', judul: 'Presensi Belum Dibuka', nama: mur[1], kelas: mur[2], pesan: msg });
      bunyi('err'); return;
    }
  }
  const id = 'q' + (++QS.seq);
  QS.antre.push({ id: id, kode: kode, manual: manual, t: Date.now(), nisn: nisn });
  simpanAntreQr();
  QS.peta[nisn] = jamLokal();
  qrLog({ id: id, st: 'pending', nama: mur ? mur[1] : '', kelas: mur ? mur[2] : '' });
  if (mur) qrPop({ id: id, tipe: 'ok', judul: 'Presensi Berhasil', nama: mur[1], kelas: mur[2], waktu: qrNow().hms, chip: nj.st === 'terlambat' ? 'Terlambat ' + nj.telat + ' menit' : 'Tepat Waktu', chipTipe: nj.st === 'terlambat' ? 'late' : 'ok' });
  QS.popOpt = id; suara('ok');   // langsung berhasil di layar & suara; server hanya mengoreksi bila ada penolakan
  clearTimeout(QS.tk); QS.tk = setTimeout(qrKirim, 120);
}

// ── Aturan jam, pop up hasil presensi, bantuan Guru Piket, rekap waktu ──
function qrNow() {
  const hms = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return { hms: hms, hm: hms.substr(0, 5) };
}
function qrMnt(t) { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? (+m[1]) * 60 + (+m[2]) : null; }
function qrTitik(t) { return String(t || '').replace(':', '.'); }
function qrShiftKelas(nama) { const k = (S.boot.kelas || []).find(x => x.nama === nama); return k ? k.shift : 'Pagi'; }
/** Nilai satu jam: belum_buka | tepat | terlambat. Sama dengan aturan di server (server tetap yang menentukan). */
function qrNilai(shift, hm) {
  const a = QS.aturan && QS.aturan[shift]; if (!a) return { st: 'tepat', telat: 0 };
  const m = qrMnt(hm), b = qrMnt(a.buka), t = qrMnt(a.batas);
  if (m === null || b === null || t === null) return { st: 'tepat', telat: 0 };
  if (m < b) return { st: 'belum_buka', telat: 0 };
  return m > t ? { st: 'terlambat', telat: m - t } : { st: 'tepat', telat: 0 };
}
function qrCepatLabel() { return ic('bolt', 'sm') + (CEPAT.on ? 'Mode Cepat: Aktif' : 'Mode Cepat: Mati'); }
function qrSuaraLabel() { return ic(SUARA.on ? 'volume_up' : 'volume_off', 'sm') + (SUARA.on ? 'Suara: Aktif' : 'Suara: Mati'); }
function qrAturanHtml() {
  const a = QS.aturan; if (!a) return '';
  return '<div class="banner info mb">' + ic('schedule') + '<div><b>Jam presensi QR (WIB)</b><br>' + ['Pagi', 'Siang'].filter(sh => a[sh]).map(sh => 'Shift ' + sh + ': dibuka <b>' + qrTitik(a[sh].buka) + '</b>, tepat waktu sampai <b>' + qrTitik(a[sh].batas) + '</b>').join('<br>') + '<br>Setelah batas, presensi tetap tercatat sebagai <b>terlambat</b>. Setiap murid hanya bisa presensi <b>1 kali</b> per hari.</div></div>';
}

// Pop up hasil presensi
// ── Konfeti perayaan (kanvas ringan, otomatis berhenti) ──
let _cfRaf = 0;
function konfetiStop() { if (_cfRaf) cancelAnimationFrame(_cfRaf); _cfRaf = 0; }
function konfetiMulai(cv) {
  konfetiStop();
  if (!cv || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.width = Math.round(innerWidth * dpr), H = cv.height = Math.round(innerHeight * dpr), g = cv.getContext('2d');
  const warna = ['#22c55e', '#facc15', '#3b82f6', '#ec4899', '#f97316', '#a855f7', '#06b6d4', '#ef4444'];
  const kecil = innerWidth < 600, P = [];
  const semburan = (x, y, n, arah, kuat) => { for (let i = 0; i < n; i++) P.push({ x: x, y: y, vx: ((Math.random() - .5) * 12 + arah * kuat) * dpr, vy: (-Math.random() * 15 - 7) * dpr, g: .42 * dpr, w: (6 + Math.random() * 8) * dpr, h: (4 + Math.random() * 7) * dpr, r: Math.random() * 6.28, vr: (Math.random() - .5) * .45, c: warna[(Math.random() * warna.length) | 0], bulat: Math.random() < .25 }); };
  semburan(W / 2, H * .42, kecil ? 80 : 140, 0, 0);
  semburan(0, H * .75, kecil ? 40 : 70, 1, 7);
  semburan(W, H * .75, kecil ? 40 : 70, -1, 7);
  const t0 = performance.now();
  (function bingkai(t) {
    const dt = t - t0; g.clearRect(0, 0, W, H); let hidup = 0;
    P.forEach(p => {
      p.vy += p.g; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      if (p.y > H + 30) return; hidup++;
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.globalAlpha = Math.max(0, 1 - Math.max(0, dt - 2200) / 900);
      if (p.bulat) { g.beginPath(); g.arc(0, 0, p.w / 2, 0, 6.28); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      g.restore();
    });
    if (dt < 3200 && hidup) _cfRaf = requestAnimationFrame(bingkai); else { g.clearRect(0, 0, W, H); _cfRaf = 0; }
  })(t0);
}
const QP_IK = {
  ok: '<svg class="qpop-svg" viewBox="0 0 52 52" aria-hidden="true"><circle class="c" cx="26" cy="26" r="23"/><path class="k" d="M14 27l8 8 16-17"/></svg>',
  warn: '<svg class="qpop-svg" viewBox="0 0 52 52" aria-hidden="true"><circle class="c" cx="26" cy="26" r="23"/><path class="k" d="M26 14v16M26 37v.5"/></svg>',
  err: '<svg class="qpop-svg" viewBox="0 0 52 52" aria-hidden="true"><circle class="c" cx="26" cy="26" r="23"/><path class="k" d="M18 18l16 16M34 18L18 34"/></svg>',
  pend: '<span class="qpop-spin" aria-hidden="true"></span>'
};
function qrPop(o) {
  QS.popId = o.id || ''; QS.popTipe = o.tipe;
  let el = $('#qr-pop');
  if (!el) {
    el = document.createElement('div'); el.id = 'qr-pop';
    el.addEventListener('click', ev => { if (ev.target === el || ev.target.closest('[data-pop]')) qrPopTutup(); });
    document.body.appendChild(el);
  }
  el.className = 'qpop t-' + o.tipe + (CEPAT.on && o.tipe === 'ok' ? ' cepat' : '');
  const tgl = o.tanggal || (o.waktu ? todayStr() : '');
  const dur = o.tipe === 'ok' ? (CEPAT.on ? 900 : 2200) : o.tipe === 'pend' ? 15000 : 3500;
  const diam = !!(o.diam && (CEPAT.on || el.querySelector('.qpop-cf')));   // pembaruan senyap dari server: konfeti & animasi tidak diulang
  const html = (o.tipe === 'ok' && !diam && !CEPAT.on ? '<canvas class="qpop-cf" aria-hidden="true"></canvas>' : '') +
    '<div class="qpop-card' + (diam ? ' diam' : '') + '" role="alertdialog" aria-live="assertive" aria-label="' + esc(o.judul) + '"><div class="qpop-top"><div class="qpop-ico">' + (QP_IK[o.tipe] || QP_IK.warn) + '</div><div class="qpop-h">' + esc(o.judul) + '</div></div>' +
    '<div class="qpop-body">' + (o.nama ? '<div class="qpop-nm">' + esc(o.nama) + '</div>' : '') + (o.kelas ? '<div class="qpop-kls">Kelas ' + esc(o.kelas) + '</div>' : '') +
    (o.waktu ? '<div class="qpop-lbl">Jam Hadir</div><div class="qpop-time">' + esc(o.waktu) + '<small>WIB</small></div>' : '') +
    (tgl ? '<div class="qpop-tgl">' + esc(fTgl(tgl)) + '</div>' : '') +
    (o.chip ? '<div class="qpop-chip c-' + (o.chipTipe || 'ok') + '">' + esc(o.chip) + '</div>' : '') +
    (o.pesan ? '<div class="qpop-msg">' + esc(o.pesan) + '</div>' : '') +
    '<button type="button" class="btn block" data-pop="x">Tutup</button></div>' +
    '</div>';
  if (diam && el.querySelector('.qpop-card')) { el.querySelector('.qpop-card').outerHTML = html; return; }
  el.innerHTML = html;
  if (o.tipe === 'ok' && !CEPAT.on) konfetiMulai(el.querySelector('.qpop-cf')); else konfetiStop();
  clearTimeout(QS.popT);
  QS.popT = setTimeout(qrPopTutup, dur);
  if (S.route === 'qr' && QS.tab === 'scan') fokusQr();
}
function qrPopTutup() {
  clearTimeout(QS.popT); konfetiStop(); const el = $('#qr-pop'); if (el) el.remove(); QS.popId = ''; QS.popTipe = '';
  if (S.route === 'qr' && QS.tab === 'scan') fokusQr();
}
/** Perbarui pop up sesuai jawaban server untuk satu scan. */
function qrPopHasil(h) {
  const cur = QS.popId === h.id;
  if (h.st === 'ok') {
    if (cur) qrPop({ id: h.id, diam: QS.popOpt === h.id, tipe: 'ok', judul: 'Presensi Berhasil', nama: h.nama, kelas: h.kelas, waktu: h.waktuLengkap || h.waktu, tanggal: h.tanggal, chip: h.terlambat ? 'Terlambat ' + h.telat + ' menit' : 'Tepat Waktu', chipTipe: h.terlambat ? 'late' : 'ok', pesan: h.peringatan || '' });
    return;
  }
  if (h.st === 'dup') { if (cur) qrPop({ id: h.id, tipe: 'warn', judul: 'Sudah Presensi', nama: h.nama, kelas: h.kelas, waktu: h.waktu, pesan: 'Presensi hanya dapat dilakukan 1 kali per hari.' }); return; }
  qrPop({ id: h.id, tipe: 'err', judul: h.st === 'belum_buka' ? 'Presensi Belum Dibuka' : 'Presensi Ditolak', nama: h.nama, kelas: h.kelas, pesan: h.pesan || 'Presensi tidak dapat dicatat.' });
}
function qrPopOffline() {
  if (QS.popTipe === 'pend' || (QS.popOpt && QS.popId === QS.popOpt)) { QS.popOpt = ''; qrPop({ id: QS.popId, tipe: 'warn', judul: 'Tersimpan di Perangkat', pesan: 'Koneksi bermasalah. Presensi akan dikirim otomatis saat koneksi tersedia.' }); }
}

// Bantuan Guru Piket: presensi lewat nama lengkap (kartu rusak / sulit discan / lupa membawa kartu)
function qrNorm(t) { return String(t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function qrBantuHtml() {
  return '<div class="card mt"><h3>' + ic('support_agent', 'sm') + ' Bantu Presensi (Guru Piket)</h3>' +
    '<div class="small muted">Kartu sulit discan atau lupa dibawa? Ketik <b>nama lengkap</b> murid seperti tertulis di kartu, lalu ketuk <b>Hadirkan</b>. Aturan jam &amp; 1× presensi tetap berlaku.</div>' +
    '<label class="f" for="qr-cari">Nama lengkap murid</label><input class="inp" id="qr-cari" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Contoh: Aisyah Putri Ramadhani">' +
    '<div id="qr-cari-hasil" class="mt"></div></div>';
}
function qrCariIsi(q) { const i = $('#qr-cari'); if (!i) return; i.value = q; qrCari(); try { i.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* abaikan */ } }
function qrCari() {
  const box = $('#qr-cari-hasil'), inp = $('#qr-cari'); if (!box || !inp) return [];
  const q = qrNorm(inp.value);
  if (q.length < 3) { box.innerHTML = q ? '<div class="small muted">Ketik minimal 3 huruf.</div>' : ''; return []; }
  const toks = q.split(' ');
  let hit = S.boot.murid.filter(m => { const n = qrNorm(m[1]); return toks.every(t => n.indexOf(t) >= 0); });
  hit.sort((a, b) => ((qrNorm(a[1]) === q ? 0 : 1) - (qrNorm(b[1]) === q ? 0 : 1)) || a[1].localeCompare(b[1], 'id'));
  const total = hit.length; hit = hit.slice(0, 10);
  box.innerHTML = hit.length ? hit.map(m => {
    const w = QS.peta[m[0]];
    return '<div class="qr-item ' + (w ? 'warn' : '') + '">' + ic(w ? 'check_circle' : 'person', 'fill') + '<div class="grow"><b>' + esc(m[1]) + '</b><div class="small muted">Kelas ' + esc(m[2]) + ' • NISN ' + esc(m[0]) + '</div></div>' +
      (w ? '<span class="chip ok">Hadir ' + esc(w) + '</span>' : '<button type="button" class="btn sm" data-act="qrmanual" data-n="' + esc(m[0]) + '">Hadirkan</button>') + '</div>';
  }).join('') + (total > hit.length ? '<div class="small muted mt">Menampilkan 10 dari ' + total + ' hasil. Ketik nama lebih lengkap.</div>' : '') : '<div class="small muted">Tidak ada murid dengan nama itu. Periksa ejaan sesuai kartu.</div>';
  return hit;
}

// Rekap berdasarkan waktu kehadiran
// ── Rekap Telat bulanan (menit:detik) + Reset Semester ──
const QT = { periode: '', kelas: '', data: null };
function bulanIni() { return todayStr().substr(0, 7); }
function fDurasi(d) { d = Math.round(+d || 0); if (d <= 0) return '–'; const m = Math.floor(d / 60), s = d % 60; return (m ? m + ' mnt ' : '') + s + ' dtk'; }
function fMMSS(d) { d = Math.round(+d || 0); return Math.floor(d / 60) + ':' + ('0' + (d % 60)).slice(-2); }
function fPeriode(p) { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? BL[+m[2] - 1] + ' ' + m[1] : (p || ''); }
function qrTelatHtml() {
  const opsi = kelasInput();
  return '<div class="card"><div class="grid gr2"><div><label class="f" style="margin-top:0" for="tl-bln">Bulan</label><input type="month" class="inp" id="tl-bln" max="' + bulanIni() + '" value="' + esc(QT.periode || bulanIni()) + '"></div>' +
    '<div><label class="f" style="margin-top:0" for="tl-kelas">Kelas</label><select class="inp" id="tl-kelas"><option value="">Semua kelas</option>' + opsiKelasHtml(opsi, QT.kelas) + '</select></div></div>' +
    '<button type="button" class="btn block mt" data-act="qrtelat">' + ic('analytics', 'sm') + 'Tampilkan Rekap Keterlambatan</button></div><div id="tl-hasil"></div>' +
    (S.user.role === 'admin' ? '<div class="card mt"><h3>' + ic('restart_alt', 'sm') + ' Reset Semester (Log Scan)</h3>' +
      '<div class="small muted">Mengosongkan <b>hanya log scan masuk</b> pada rentang tanggal semester. Sebelum dikosongkan, rekap waktu hadir &amp; keterlambatan tiap murid per bulan <b>disimpan permanen</b>, jadi riwayatnya tetap bisa dilihat di tab ini. Data Presensi (Sakit/Izin/Alpa), murid, guru, dan lainnya tidak berubah.</div>' +
      '<button type="button" class="btn danger block mt" data-act="qrresetsem">' + ic('restart_alt', 'sm') + 'Reset Semester…</button></div>' : '');
}
async function qrTelatMuat() {
  const box = $('#tl-hasil'); if (!box) return;
  QT.periode = ($('#tl-bln') || {}).value || bulanIni(); QT.kelas = ($('#tl-kelas') || {}).value || '';
  box.innerHTML = '<div class="center mt"><span class="spin"></span></div>';
  const r = await apiT('apiRekapTelat', { periode: QT.periode, kelasId: QT.kelas });
  if (!$('#tl-hasil')) return;
  if (!r.success) { box.innerHTML = '<div class="banner mt">' + ic('error') + '<div>' + esc(r.message) + '</div></div>'; return; }
  QT.data = r.data; qrTelatTampil();
}
function qrTelatTampil() {
  const d = QT.data, box = $('#tl-hasil'); if (!d || !box) return;
  const R = d.ringkas, rows = d.baris;
  box.innerHTML = '<div class="rk-sum mt"><button type="button" class="rk-f"><b>' + R.murid + '</b><span>Murid</span></button><button type="button" class="rk-f"><b>' + R.pernahTelat + '</b><span>Pernah terlambat</span></button><button type="button" class="rk-f"><b>' + R.kejadian + '</b><span>Kali terlambat</span></button><button type="button" class="rk-f"><b>' + fDurasi(R.totalTelat) + '</b><span>Total telat</span></button></div>' +
    '<div class="card mt"><div class="between"><h3 style="margin:0">' + esc(fPeriode(d.periode)) + ' (' + rows.length + ' murid)</h3><button type="button" class="btn sm ghost" data-act="qrtelatxls">' + ic('download', 'sm') + 'Excel</button></div>' +
    (d.sumber !== 'live' ? '<div class="small muted mt">Sebagian/seluruh data berasal dari arsip rekap bulanan (log scan semester lalu sudah di-reset).</div>' : '') +
    (rows.length ? '<div class="scrollx mt"><table class="tb"><thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>Hadir</th><th>Terlambat</th><th>Total Telat</th><th></th></tr></thead><tbody>' +
      rows.map((b, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(b.nama) + '</td><td>' + esc(b.kelas) + '</td><td>' + b.hadir + '</td><td>' + (b.telat ? '<span class="chip warn">' + b.telat + '×</span>' : '0') + '</td><td>' + fDurasi(b.totalTelat) + '</td><td><button type="button" class="btn sm ghost" data-act="qrtd" data-n="' + esc(b.nisn) + '">Detail</button></td></tr>').join('') + '</tbody></table></div>' :
      '<div class="empty">' + ic('inbox') + 'Belum ada data kehadiran pada bulan ini.</div>') + '</div>';
}
async function qrTelatXls() {
  const d = QT.data; if (!d) return;
  const r1 = [['No', 'Nama', 'Kelas', 'NISN', 'Hari Hadir', 'Jumlah Terlambat', 'Total Telat (menit:detik)', 'Rata-rata Telat (menit:detik)']];
  const r2 = [['Nama', 'Kelas', 'NISN', 'Tanggal', 'Jam Hadir (WIB)', 'Status', 'Telat (menit:detik)']];
  d.baris.forEach((b, i) => {
    r1.push([i + 1, b.nama, b.kelas, b.nisn, b.hadir, b.telat, fMMSS(b.totalTelat), b.telat ? fMMSS(b.totalTelat / b.telat) : '0:00']);
    b.detail.forEach(x => r2.push([b.nama, b.kelas, b.nisn, d.periode + '-' + ('0' + x[0]).slice(-2), x[1], x[2] > 0 ? 'Terlambat' : 'Tepat waktu', x[2] > 0 ? fMMSS(x[2]) : '']));
  });
  try { await simpanXLSX([{ name: 'Rekap Bulanan', rows: r1 }, { name: 'Detail Waktu', rows: r2 }], 'Rekap-Telat-' + d.periode + '.xlsx'); } catch (e) { toast(e.message || 'Gagal membuat Excel.', 'err'); }
}
function qrTelatDetail(nisn) {
  const d = QT.data, b = d && d.baris.find(x => x.nisn === nisn); if (!b) return;
  modal({
    title: b.nama + ' • ' + b.kelas, ok: false,
    body: '<div class="small muted">' + esc(fPeriode(d.periode)) + ' — ' + b.hadir + ' hari hadir, ' + b.telat + ' kali terlambat (total ' + esc(fDurasi(b.totalTelat)) + ')</div>' +
      (b.detail.length ? '<div class="scrollx mt"><table class="tb"><thead><tr><th>Tanggal</th><th>Jam Hadir</th><th>Keterangan</th></tr></thead><tbody>' +
        b.detail.map(x => '<tr><td>' + x[0] + ' ' + esc(fPeriode(d.periode)) + '</td><td><b>' + esc(x[1]) + '</b></td><td>' + (x[2] > 0 ? '<span class="chip warn">Terlambat ' + esc(fDurasi(x[2])) + '</span>' : '<span class="chip ok">Tepat waktu</span>') + '</td></tr>').join('') + '</tbody></table></div>' :
        '<div class="empty">' + ic('inbox') + 'Tidak ada catatan hadir bulan ini.</div>')
  });
}
function qrResetSem() {
  const t = todayStr(), y = +t.substr(0, 4), m = +t.substr(5, 2);
  let dari = m >= 7 ? y + '-07-01' : y + '-01-01', sampai = m >= 7 ? y + '-12-31' : y + '-06-30';
  if (sampai > t) sampai = t;
  modal({
    title: 'Reset Semester — Log Scan', ok: 'Reset Semester', danger: true,
    body: '<div class="banner err">' + ic('warning') + '<div>Log scan masuk pada rentang tanggal di bawah akan <b>dikosongkan</b>. Rekap waktu hadir &amp; keterlambatan per bulan disimpan permanen terlebih dahulu. Presensi (Sakit/Izin/Alpa) dan data lain tidak berubah. Tindakan ini tidak dapat dibatalkan.</div></div>' +
      '<div class="grid gr2"><div><label class="f" for="rsm-d">Dari tanggal</label><input type="date" class="inp" id="rsm-d" name="dari" max="' + t + '" value="' + dari + '"></div>' +
      '<div><label class="f" for="rsm-s">Sampai tanggal</label><input type="date" class="inp" id="rsm-s" name="sampai" max="' + t + '" value="' + sampai + '"></div></div>' +
      '<label class="f" for="rsm-k">Ketik <b>RESET</b> untuk konfirmasi</label><input class="inp" id="rsm-k" name="konfirmasi" autocomplete="off" placeholder="RESET">' +
      '<label class="f" for="rsm-p">Sandi Superadmin</label><input class="inp" id="rsm-p" name="sandi" type="password" autocomplete="current-password">',
    onOk: async f => {
      if (!f.dari.value || !f.sampai.value) { toast('Isi tanggal awal dan akhir semester.', 'err'); return false; }
      if (f.konfirmasi.value.trim().toUpperCase() !== 'RESET') { toast('Ketik kata RESET untuk melanjutkan.', 'err'); return false; }
      if (!f.sandi.value) { toast('Masukkan sandi Superadmin.', 'err'); return false; }
      const r = await apiT('apiResetSemester', { dari: f.dari.value, sampai: f.sampai.value, konfirmasi: f.konfirmasi.value.trim(), sandi: f.sandi.value });
      if (!r.success) { toast(r.message, 'err'); return false; }
      toast(r.message, 'ok'); tutupModal(); QT.data = null; if (QS.tab === 'telat') qrTelatMuat();
    }
  });
}

function qrRekapHtml() {
  const opsi = kelasInput();
  return '<div class="card"><div class="grid gr2"><div><label class="f" style="margin-top:0" for="rk-tgl">Tanggal</label><input type="date" class="inp" id="rk-tgl" max="' + todayStr() + '" value="' + esc(QS.rtgl || todayStr()) + '"></div>' +
    '<div><label class="f" style="margin-top:0" for="rk-kelas">Kelas</label><select class="inp" id="rk-kelas"><option value="">Semua kelas</option>' + opsiKelasHtml(opsi, QS.rkelas) + '</select></div></div>' +
    '<button type="button" class="btn block mt" data-act="qrrekap">' + ic('analytics', 'sm') + 'Tampilkan Rekap</button></div><div id="rk-hasil"></div>';
}
async function qrRekapMuat() {
  const box = $('#rk-hasil'); if (!box) return;
  QS.rtgl = ($('#rk-tgl') || {}).value || todayStr(); QS.rkelas = ($('#rk-kelas') || {}).value || '';
  box.innerHTML = '<div class="center mt"><span class="spin"></span></div>';
  const r = await apiT('apiRekapWaktu', { tanggal: QS.rtgl, kelasId: QS.rkelas });
  if (!$('#rk-hasil')) return;
  if (!r.success) { box.innerHTML = '<div class="banner mt">' + ic('error') + '<div>' + esc(r.message) + '</div></div>'; return; }
  QS.rekap = r.data; QS.aturan = r.data.aturan || QS.aturan; qrRekapTampil();
}
function qrRekapTampil() {
  const d = QS.rekap, box = $('#rk-hasil'); if (!d || !box) return;
  const R = d.ringkas, f = QS.rfilter, rows = d.baris.filter(b => f === 'semua' || b.st === f);
  const kot = (k, l, n) => '<button type="button" class="rk-f ' + (f === k ? 'on' : '') + '" data-act="qrfilter" data-f="' + k + '"><b>' + n + '</b><span>' + l + '</span></button>';
  const chipSt = b => b.st === 'tepat' ? '<span class="chip ok">Tepat waktu</span>' : b.st === 'terlambat' ? '<span class="chip warn">Terlambat ' + b.telat + ' mnt</span>' : b.ket ? '<span class="chip ' + (b.ket === 'Sakit' ? 's' : b.ket === 'Izin' ? 'i' : 'a') + '">' + esc(b.ket) + '</span>' : '<span class="chip">Belum hadir</span>';
  box.innerHTML = '<div class="rk-sum mt">' + kot('semua', 'Semua', R.total) + kot('tepat', 'Tepat waktu', R.tepat) + kot('terlambat', 'Terlambat', R.terlambat) + kot('belum', 'Belum hadir', R.belum) + '</div>' +
    '<div class="small muted mt">' + esc(fTgl(d.tanggal)) + ' • ' + ['Pagi', 'Siang'].filter(sh => d.aturan[sh]).map(sh => 'Shift ' + sh + ': buka ' + qrTitik(d.aturan[sh].buka) + ', batas ' + qrTitik(d.aturan[sh].batas)).join(' • ') + ' WIB</div>' +
    '<div class="card mt"><h3>Per kelas</h3>' + (d.kelas.length ? d.kelas.map(k => {
      const hadir = k.tepat + k.terlambat, p = k.total ? Math.round(hadir * 100 / k.total) : 0;
      return '<div class="qr-kls"><div class="between"><b>' + esc(k.nama) + '</b><span class="small muted">' + hadir + '/' + k.total + ' hadir • tepat ' + k.tepat + ' • terlambat ' + k.terlambat + ' • belum ' + k.belum + '</span></div><div class="progress"><i style="width:' + p + '%"></i></div></div>';
    }).join('') : '<div class="small muted">Tidak ada kelas.</div>') + '</div>' +
    '<div class="card mt"><div class="between"><h3 style="margin:0">Daftar murid (' + rows.length + ')</h3><button type="button" class="btn sm ghost" data-act="qrrekapxls">' + ic('download', 'sm') + 'Excel</button></div>' +
    (rows.length ? '<div class="scrollx mt"><table class="tb"><thead><tr><th>No</th><th>Nama</th><th>Kelas</th><th>Jam</th><th>Status</th></tr></thead><tbody>' +
      rows.map((b, i) => '<tr><td>' + (i + 1) + '</td><td>' + esc(b.nama) + '</td><td>' + esc(b.kelas) + '</td><td>' + (b.waktu ? esc(b.waktu) : '–') + '</td><td>' + chipSt(b) + '</td></tr>').join('') + '</tbody></table></div>' : '<div class="empty">' + ic('inbox') + 'Tidak ada data pada filter ini.</div>') + '</div>';
}
async function qrRekapXls() {
  const d = QS.rekap; if (!d) return;
  const lbl = b => b.st === 'tepat' ? 'Tepat waktu' : b.st === 'terlambat' ? 'Terlambat ' + b.telat + ' menit' : (b.ket || 'Belum hadir');
  const rows = [['No', 'Nama', 'Kelas', 'NISN', 'Jam Hadir (WIB)', 'Status']].concat(d.baris.map((b, i) => [i + 1, b.nama, b.kelas, b.nisn, b.waktu || '', lbl(b)]));
  try { await simpanXLSX([{ name: 'Rekap Waktu Hadir', rows: rows }], 'Rekap-Waktu-Hadir-' + d.tanggal + '.xlsx'); } catch (e) { toast(e.message || 'Gagal membuat Excel.', 'err'); }
}

async function qrKirim() {
  if (QS.kirim || !QS.antre.length || !S.token) return;
  QS.kirim = true; qrSegarkan();
  const paket = QS.antre.slice(0, 40), t0q = Date.now();
  const r = await apiT('apiScanBatch', { items: paket.map(x => ({ id: x.id, kode: x.kode, manual: x.manual, t: x.t })) });
  QS.kirim = false;
  if (!r.success) {
    if (r.code === 'SESSION') return;
    QS.galatBeruntun++;
    qrSegarkan(); qrPopOffline();
    if (/^Koneksi/.test(r.message || '') && QS.galatBeruntun < 30) setTimeout(qrKirim, 5000);
    else toast(r.message || 'Gagal mengirim scan.', 'err');
    return;
  }
  QS.galatBeruntun = 0;
  QS.antre = QS.antre.filter(x => !paket.some(p => p.id === x.id)); simpanAntreQr();
  try { console.log('[SIPMUR EDU] scan terkirim: server ' + (r.data.ms || '?') + ' ms, total ' + (Date.now() - t0q) + ' ms'); } catch (e) { /* abaikan */ }
  const baru = {};
  r.data.hasil.forEach(h => {
    const e = QS.log.find(l => l.id === h.id);
    if (e) { const pend = e.st === 'pending'; Object.assign(e, h); if (pend && h.st === 'dup') e.st = 'ok'; }   // dup karena tercatat oleh perangkat lain beberapa detik sebelumnya: tetap hadir
    suaraHasil(h);
    qrPopHasil(h);
  });
  QS.peta = r.data.peta;
  QS.antre.forEach(x => { if (x.nisn && !QS.peta[x.nisn]) QS.peta[x.nisn] = jamLokal(x.t); });
  qrSegarkan();
  if (QS.antre.length) qrKirim();
}

// ── Kamera ──
function qrPesan(t, tipe) { const e = $('#qr-pesan'); if (e) { e.textContent = t || ''; e.style.color = tipe === 'err' ? 'var(--err)' : ''; } }
function muatSkrip(src) { return new Promise(res => { const s = document.createElement('script'); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); }); }
async function qrSiapDecoder() {
  if (QS.det || QS.jsqr) return true;
  try {
    if ('BarcodeDetector' in window) {
      const f = await window.BarcodeDetector.getSupportedFormats();
      if (f.indexOf('qr_code') >= 0) { QS.det = new window.BarcodeDetector({ formats: ['qr_code'] }); return true; }
    }
  } catch (e) { /* lanjut ke jsQR */ }
  if (!window.jsQR) await muatSkrip('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');
  QS.jsqr = !!window.jsQR;
  return QS.jsqr;
}
async function qrKamera() {
  if (QS.stream) return qrStop();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return qrPesan('Browser ini tidak mendukung kamera. Gunakan scanner USB' + (boleh() ? ' atau ketik NISN' : '') + '.', 'err');
  qrPesan('Meminta izin kamera…');
  try { bunyiSiap(); QS.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }); }
  catch (e) {
    QS.stream = null;
    return qrPesan(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      ? 'Izin kamera ditolak. Ketuk ikon gembok di bilah alamat → Izin → Kamera → Izinkan, lalu coba lagi. Bisa juga memakai “Foto QR” atau scanner USB' + (boleh() ? ' / ketik NISN.' : '.')
      : 'Kamera tidak dapat dibuka: ' + (e && (e.message || e.name) || 'kesalahan tidak diketahui'), 'err');
  }
  const v = $('#qr-vid'); if (!v) return qrStop();
  v.srcObject = QS.stream; try { await v.play(); } catch (e) { /* abaikan */ }
  $('#qr-cam').hidden = false; $('#qr-btn').innerHTML = ic('videocam_off', 'sm') + 'Matikan Kamera';
  qrPesan('Menyiapkan pemindai…');
  if (!await qrSiapDecoder()) { qrStop(); return qrPesan('Pemindai QR gagal dimuat (perlu internet). Gunakan scanner USB' + (boleh() ? ' atau ketik NISN' : '') + '.', 'err'); }
  qrPesan('Arahkan kartu QR murid ke dalam bingkai.');
  qrLoop();
}
function bunyiSiap() { try { const AC = window.AudioContext || window.webkitAudioContext; if (AC && !QS.audio) QS.audio = new AC(); } catch (e) { /* abaikan */ } }
function qrLoop() {
  if (!QS.stream) return;
  const v = $('#qr-vid'), lanjut = () => { QS.timer = setTimeout(qrLoop, 130); };
  if (!v || v.readyState < 2 || !v.videoWidth) return lanjut();
  if (QS.det) { QS.det.detect(v).then(h => { if (h && h[0] && h[0].rawValue) qrDariKamera(h[0].rawValue); lanjut(); }).catch(lanjut); return; }
  try {
    const c = QS.cv || (QS.cv = document.createElement('canvas')), w = Math.min(640, v.videoWidth), hh = Math.round(w * v.videoHeight / v.videoWidth);
    c.width = w; c.height = hh;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(v, 0, 0, w, hh);
    const d = x.getImageData(0, 0, w, hh), res = window.jsQR(d.data, w, hh, { inversionAttempts: 'dontInvert' });
    if (res && res.data) qrDariKamera(res.data);
  } catch (e) { /* frame gagal dibaca: lewati */ }
  lanjut();
}
function qrDariKamera(kode) { const t = Date.now(); if (kode === QS.lastKode && t - QS.lastT < 3500) return; QS.lastKode = kode; QS.lastT = t; qrMasuk(kode); }
function qrStop() {
  clearTimeout(QS.timer);
  if (QS.stream) { QS.stream.getTracks().forEach(t => t.stop()); QS.stream = null; }
  const cam = $('#qr-cam'); if (cam) cam.hidden = true;
  const b = $('#qr-btn'); if (b) b.innerHTML = ic('photo_camera', 'sm') + 'Nyalakan Kamera';
  qrPesan('');
}
function qrHenti() { qrStop(); }

// ── Cetak kartu ──
function qrKartuHtml() {
  const opsi = kelasInput();
  return '<div class="card"><div class="banner info mb">' + ic('badge') + '<div>Setiap murid mendapat <b>satu kartu QR</b> berisi NISN yang ditandatangani sistem. Kartu <b>tidak memuat kelas</b>, jadi cukup dicetak 1x dan tetap berlaku saat murid naik kelas sampai lulus. Ukuran kartu <b>85,6 × 54 mm</b> (sama dengan KTP/ATM). Cetak, potong mengikuti tepi kartu, lalu laminasi.</div></div>' +
    '<div class="grid gr2"><div><label class="f" style="margin-top:0" for="qk-kelas">Kelas</label><select class="inp" id="qk-kelas">' + (boleh() ? '<option value="">Semua kelas</option>' : '') + opsiKelasHtml(opsi, boleh() ? '' : (opsi.length ? opsi[0].id : '')) + '</select></div>' +
    '<div><label class="f" style="margin-top:0" for="qk-cari">Cari murid (opsional)</label><input class="inp" id="qk-cari" placeholder="Nama atau NISN" autocomplete="off"></div></div>' +
    '<button type="button" class="btn block mt" data-act="qrsiap">' + ic('qr_code_2', 'sm') + 'Siapkan Kartu</button>' +
    (window.aOrtu ? '<button type="button" class="btn ghost block mt" data-act="ortusurat">' + ic('family_restroom', 'sm') + 'Cetak Surat Aktivasi Orang Tua (kelas terpilih)</button>' : '') + '</div><div id="qk-hasil"></div>';
}
function kartuHtml(k, sek) {
  return '<div class="kartu"><div class="kc">' +
    '<div class="kh"><span class="kl' + (S.pub.logo ? '' : ' x') + '"><i></i></span><div class="kht"><b>' + esc(sek.nama) + '</b><span>Kartu Presensi Murid</span></div></div>' +
    '<div class="kb"><div class="kd">' +
      '<div><small>Nama</small><strong class="kn">' + esc(k.nama) + '</strong></div>' +
      '<div class="kr"><div><small>' + (isSementara(k.nisn) ? 'ID MURID' : 'NISN') + '</small><strong class="kv">' + esc(k.nisn) + '</strong></div></div>' +
    '</div><div class="kq">' + qrSvg(k.kode) + '</div></div>' +
    '<div class="kfo"><span>' + (sek.npsn ? 'NPSN <b>' + esc(sek.npsn) + '</b>' : '') + '</span><span>Scan untuk presensi</span></div>' +
    '</div></div>';
}
async function qrSiapKartu() {
  const box = $('#qk-hasil'); if (!box) return;
  box.innerHTML = '<div class="center mt"><span class="spin"></span></div>';
  const r = await apiT('apiQrKartu', { kelasId: $('#qk-kelas').value, cari: $('#qk-cari').value.trim() });
  if (!$('#qk-hasil')) return;
  if (!r.success) { box.innerHTML = '<div class="banner mt">' + ic('error') + '<div>' + esc(r.message) + '</div></div>'; return; }
  QS.kartu = r.data;
  const n = r.data.kartu.length;
  if (!n) { box.innerHTML = '<div class="empty">' + ic('group_off') + 'Tidak ada murid yang cocok.</div>'; return; }
  box.innerHTML = '<div class="banner ok mt">' + ic('check_circle', 'fill') + '<div><b>' + n + ' kartu siap dicetak.</b> Kertas A4, 2 kolom × 5 baris per lembar (±' + Math.ceil(n / 10) + ' lembar). Pada jendela cetak pilih “Simpan sebagai PDF” bila ingin mengirim ke percetakan.</div></div>' +
    '<button type="button" class="btn block accent mt" data-act="qrcetak">' + ic('print', 'sm') + 'Cetak / Simpan PDF</button>' +
    '<div class="small muted mt">Pratinjau' + (n > 4 ? ' (4 dari ' + n + ' kartu)' : '') + ':</div><div class="kartu-grid mt" style="--logo:' + (S.pub.logo ? "url('" + S.pub.logo + "')" : 'none') + '">' + r.data.kartu.slice(0, 4).map(k => kartuHtml(k, r.data.sekolah)).join('') + '</div>';
}
function qrCetak() {
  const d = QS.kartu; if (!d || !d.kartu.length) return;
  let root = $('#print-root'); if (!root) { root = document.createElement('div'); root.id = 'print-root'; document.body.appendChild(root); }
  root.style.setProperty('--logo', S.pub.logo ? "url('" + S.pub.logo + "')" : 'none');
  root.innerHTML = '<div class="kartu-grid">' + d.kartu.map(k => kartuHtml(k, d.sekolah)).join('') + '</div>';
  document.body.classList.add('print-kartu');
  const selesai = () => { document.body.classList.remove('print-kartu'); root.innerHTML = ''; window.removeEventListener('afterprint', selesai); };
  window.addEventListener('afterprint', selesai);
  setTimeout(() => { try { window.print(); } catch (e) { selesai(); toast('Pencetakan tidak tersedia di tampilan ini. Buka aplikasi langsung di tab browser lalu coba lagi.', 'err'); } }, 200);
}

// ── Integrasi ke halaman Input Presensi ──
function qrBarHtml(roster) {
  const I = S.inp; if (!S.scan || S.scanTgl !== I.tanggal) return '';
  const sudah = roster.filter(r => S.scan[r[0]]).length; if (!sudah) return '';
  const belum = roster.filter(r => !S.scan[r[0]] && !I.marks[r[0]]).length;
  return '<div class="banner ok mb">' + ic('qr_code_scanner') + '<div><b>' + sudah + ' dari ' + roster.length + ' murid sudah scan QR.</b> ' + (sudah === roster.length ? 'Semua murid hadir lewat QR.' : belum ? belum + ' murid belum scan &amp; belum diberi keterangan — isi Sakit/Izin + alasan, atau akan otomatis Alpa saat pergantian hari.' : 'Semua murid yang belum scan sudah ditandai.') + '</div></div>' +
    (belum && I.tanggal === todayStr() ? '<button type="button" class="btn ghost block mb" data-act="belumscan">' + ic('person_off', 'sm') + 'Tandai ' + belum + ' murid yang belum scan sebagai Alpa sekarang</button>' : '');
}

// ── Setup awal (wizard) ──
function tampilSetup(d) {
  hentiMusik && hentiMusik();
  const st = d.setup || {};
  const f = (id, label, ph, extra) => '<label class="f" for="sf-' + id + '">' + label + '</label><input class="inp" id="sf-' + id + '" placeholder="' + esc(ph || '') + '" autocomplete="off" ' + (extra || '') + '>';
  $('#app-container').innerHTML = '<div class="wiz"><div class="center" style="margin-bottom:14px"><div class="avatar" style="width:56px;height:56px;margin:0 auto 8px;border-radius:16px">' + ic('rocket_launch', 'lg') + '</div><h1 class="page-title" style="margin:0">Pengaturan Awal ' + esc(S.pub.app || 'SIPMUR EDU') + '</h1><div class="page-sub">Selesaikan 4 langkah berikut untuk menyiapkan aplikasi di perangkat ini.</div></div>' +
    '<div class="banner info mb">' + ic('info') + '<div>Aplikasi ini belum diaktifkan di akun Google ini. Instalasi baru memerlukan <b>izin (lisensi) dari pengembang</b>.</div></div>' +
    (st.kunciPengembang === false ? '<div class="banner mb">' + ic('error') + '<div><b>Kunci pengembang belum dipasang pada Kode.gs.</b> Pengembang perlu mengisi <code>DEV_PUB_N</code> sebelum instalasi baru dapat diaktifkan.</div></div>' : '') +
    '<div class="card"><h3>1. Izin dari pengembang</h3><div class="small muted">Kirim <b>ID Perangkat</b> di bawah ini kepada pengembang, lalu tempel kode lisensi yang Anda terima.</div>' +
    '<label class="f" for="sf-id">ID Perangkat</label><div class="row"><input class="inp grow" id="sf-id" readonly value="' + esc(st.scriptId || '') + '"><button type="button" class="btn ghost" data-act="setupsalin">' + ic('content_copy', 'sm') + 'Salin</button></div>' +
    '<label class="f" for="sf-lisensi">Kode lisensi</label><textarea class="inp" id="sf-lisensi" rows="3" placeholder="SIPEDU1.…" spellcheck="false" autocomplete="off"></textarea></div>' +
    '<div class="card mt"><h3>2. Data sekolah</h3>' + f('nama', 'Nama sekolah *', 'Contoh: SDN Melati 01') + '<div class="grid gr2"><div>' + f('npsn', 'NPSN', '8 digit') + '</div><div>' + f('alamat', 'Alamat', 'Jalan, kelurahan, kota') + '</div></div>' +
    f('kop1', 'Kop surat baris 1', 'Contoh: PEMERINTAH KOTA …') + f('kop2', 'Kop surat baris 2', 'Contoh: DINAS PENDIDIKAN') + '<div class="grid gr2"><div>' + f('kepsek', 'Kepala sekolah', 'Nama lengkap') + '</div><div>' + f('nip', 'NIP kepala sekolah', '') + '</div></div></div>' +
    '<div class="card mt"><h3>3. Jam presensi</h3><div class="small muted">Jam buka dan batas tepat waktu tiap shift. Bisa diubah kapan saja di Admin → Jam Presensi. Sekolah dengan satu shift cukup memakai Shift Pagi (biarkan Siang).</div>' +
    '<div class="grid gr2"><div>' + f('bp', 'Shift Pagi — dibuka', '', 'type="time" value="05:30"') + '</div><div>' + f('tp', 'Shift Pagi — batas tepat waktu', '', 'type="time" value="06:30"') + '</div></div>' +
    '<div class="grid gr2"><div>' + f('bs', 'Shift Siang — dibuka', '', 'type="time" value="10:30"') + '</div><div>' + f('ts', 'Shift Siang — batas tepat waktu', '', 'type="time" value="12:00"') + '</div></div></div>' +
    '<div class="card mt"><h3>4. Akun Superadmin</h3>' + f('user', 'Username *', 'minimal 3 karakter', 'autocapitalize="off"') + f('pass', 'Sandi * (minimal 8 karakter)', '', 'type="password" autocomplete="new-password"') + f('pass2', 'Ulangi sandi *', '', 'type="password" autocomplete="new-password"') + '</div>' +
    '<button type="button" class="btn block accent mt" id="sf-btn" data-act="setupkirim">' + ic('check', 'sm') + 'Aktifkan &amp; Buat Database</button><div class="small muted center mt" id="sf-info">Proses pembuatan database memerlukan sekitar 20–40 detik.</div></div>';
}
async function setupKirim() {
  const v = id => ($('#sf-' + id) || {}).value || '';
  const b = $('#sf-btn'), info = $('#sf-info');
  b.disabled = true; b.innerHTML = '<span class="spin"></span> Menyiapkan…'; info.textContent = 'Membuat database, mohon tunggu dan jangan tutup halaman ini…';
  const r = await api('apiSetupAwal', { lisensi: v('lisensi'), namaSekolah: v('nama'), npsn: v('npsn'), alamat: v('alamat'), kop1: v('kop1'), kop2: v('kop2'), kepsek: v('kepsek'), nipKepsek: v('nip'), adminUser: v('user'), adminPass: v('pass'), adminPass2: v('pass2'), jamBukaP: v('bp'), jamBatasP: v('tp'), jamBukaS: v('bs'), jamBatasS: v('ts') });
  if (!r.success) { b.disabled = false; b.innerHTML = ic('check', 'sm') + 'Aktifkan &amp; Buat Database'; info.textContent = r.message; info.style.color = 'var(--err)'; toast(r.message, 'err'); return; }
  toast(r.message, 'ok'); init();
}

Object.assign(A, {
  qrtab: el => { QS.tab = el.dataset.t; if (QS.tab !== 'scan') qrStop(); renderQr(S.rid); },
  qrtelat: () => { qrTelatMuat(); },
  qrtelatxls: () => { qrTelatXls(); },
  qrtd: el => { qrTelatDetail(el.dataset.n); },
  qrresetsem: () => { qrResetSem(); },
  qrcam: () => qrKamera(),
  qrkirimulang: (el, ev) => { if (ev) ev.preventDefault(); QS.galatBeruntun = 0; qrKirim(); },
  qrsiap: () => qrSiapKartu(),
  qrcetak: () => qrCetak(),
  qrscanner: () => {
    const i = $('#qr-surl'), u = (i ? i.value : '').trim();
    if (!/^https:\/\//.test(u)) { toast('Isi alamat Halaman Scanner (diawali https://).', 'err'); return; }
    try { localStorage.setItem('sipedu_scanner_url', u); } catch (e) { /* abaikan */ }
    const app = QS.urlApp || '';
    window.open(u.split('#')[0] + (app ? '#u=' + encodeURIComponent(app) : ''), '_blank', 'noopener');
  },
  belumscan: async () => {
    const I = S.inp, kelas = S.boot.kelas.find(k => k.id === I.kelasId), roster = muridKelas(kelas.nama);
    const target = roster.filter(r => !S.scan[r[0]] && !I.marks[r[0]]);
    if (!target.length) return;
    if (!await konfirmasi({ title: 'Tandai ' + target.length + ' murid sebagai Alpa?', msg: 'Murid yang belum scan QR hari ini akan ditandai Alpa. Anda masih dapat mengubah satu per satu (Sakit/Izin) sebelum mengirim.', ok: 'Tandai Alpa' })) return;
    target.forEach(r => { I.marks[r[0]] = { status: 'Alpa', ket: 'Tidak hadir (tidak scan QR)' }; });
    refreshInput();
  },
  setupsalin: async () => {
    const i = $('#sf-id'); if (!i) return;
    try { await navigator.clipboard.writeText(i.value); toast('ID Perangkat disalin.', 'ok'); } catch (e) { i.select(); try { document.execCommand('copy'); toast('ID Perangkat disalin.', 'ok'); } catch (e2) { toast('Tekan lama pada kolom ID lalu pilih Salin.', 'err'); } }
  },
  setupkirim: () => setupKirim()
});
Object.assign(A, {
  qrmanual: el => { qrMasuk(el.dataset.n); },
  qrrekap: () => qrRekapMuat(),
  qrfilter: el => { QS.rfilter = el.dataset.f; qrRekapTampil(); },
  qrrekapxls: () => qrRekapXls(),
  qrsuara: el => { suaraToggle(); el.innerHTML = qrSuaraLabel(); },
  qrcepat: el => { CEPAT.on = !CEPAT.on; try { localStorage.setItem('sipmur_cepat', CEPAT.on ? '1' : '0'); } catch (e) { /* abaikan */ } el.innerHTML = qrCepatLabel(); toast(CEPAT.on ? 'Mode Cepat aktif: popup kecil & singkat.' : 'Mode Cepat mati: popup besar dengan konfeti.', 'ok'); },
  qrtessuara: () => { suaraTes(); const b = $('#qr-suara'); if (b) b.innerHTML = qrSuaraLabel(); toast('Memutar contoh suara: Berhasil, Sudah Scan, Coba Lagi.', 'ok'); }
});
document.addEventListener('input', ev => { if (ev.target && ev.target.id === 'qr-cari') qrCari(); });
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && $('#qr-pop')) qrPopTutup();
  if (ev.target && ev.target.id === 'qr-cari' && ev.key === 'Enter') {   // satu nama persis cocok → langsung hadirkan
    ev.preventDefault();
    const q = qrNorm(ev.target.value), tepat = S.boot.murid.filter(m => qrNorm(m[1]) === q);
    if (tepat.length === 1 && !QS.peta[tepat[0][0]]) { qrMasuk(tepat[0][0]); ev.target.value = ''; qrCari(); }
  }
});
document.addEventListener('change', ev => { if (ev.target && ev.target.id === 'qr-foto') { const f = ev.target.files && ev.target.files[0]; ev.target.value = ''; qrFoto(f); } });
document.addEventListener('keydown', ev => {
  if (ev.target && ev.target.id === 'qr-in' && ev.key === 'Enter') { ev.preventDefault(); const v = ev.target.value; ev.target.value = ''; qrMasuk(v); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) qrStop(); });
window.addEventListener('online', () => { if (QS.antre.length) qrKirim(); });

// ── Prefetch: siapkan data menu yang paling sering dibuka segera setelah masuk ──
function prefetchData() {
  if (!S.token || !S.user || !S.boot) return;
  const t = todayStr();
  try {
    if (S.user.isPiket || S.user.role === 'admin') apiT('apiPiket', { tanggal: S.tgl || t });
    const o = kelasInput(); if (o.length) apiT('apiPresensiKelas', { tanggal: t, kelasId: o[0].id });
    apiT('apiScanHari', { tanggal: t });
  } catch (e) { /* abaikan */ }
}


async function mulaiApp(fresh) {
  const r = await apiT('apiBootstrap');
  if (!r.success) {
    if (!fresh) { S.token = null; hapusSesi(); }
    if (r.code !== 'SESSION') toast(r.message, 'err');
    return tampilLogin();
  }
  S.boot = r.data; S.user = r.data.user; S.tgl = null; S.inp = null; S.piketPilih = {};
  S.route = 'beranda'; S.params = {};
  if (fresh) cacheBersih();
  renderShell(); go('beranda');
  setTimeout(prefetchData, 900);   // siapkan menu Piket/Input/QR di latar belakang
  setTimeout(mulaiMusik, 5000);    // musik dimuat belakangan agar tidak bersaing dengan data utama
}
async function init() {
  if (!gasSiap()) {
    $('#app-container').innerHTML = '<div class="wiz"><div class="card"><h3>' + ic('settings_alert') + ' Backend belum terhubung</h3><div class="muted">Buka file <code>js/config.js</code>, lalu isi <code>GAS_URL</code> dengan URL aplikasi web Apps Script (berakhiran <code>/exec</code>). Simpan, lalu unggah ulang ke GitHub.</div></div></div>';
    return;
  }
  $('#app-container').innerHTML = '<div style="padding:24px 16px;max-width:520px;margin:0 auto">' + skeleton() + '</div>';
  const p = await api('apiPublicInfo');
  if (p.success && p.data) {
    S.pub = { nama: p.data.nama, app: p.data.app, appFull: p.data.appFull, tagline: p.data.tagline, logo: p.data.logo, pattern: p.data.pattern, marquee: p.data.marquee, login: p.data.login, logoKiri: p.data.logoKiri, testimoni: p.data.testimoni, testiOpacity: p.data.testiOpacity };
    if (p.data.ready === false) { tampilSetup(p.data); return; }
  }
  if (window.Ortu && Ortu.aktif()) { Ortu.mulai(); return; } // Portal Orang Tua (tautan ?ortu= atau pernah dipilih di HP ini)
  S.token = bacaSesi();
  if (S.token) { apiT('apiDashboard', { tanggal: todayStr() }); await mulaiApp(false); } else tampilLogin(); // dashboard diminta paralel dengan bootstrap
}
init();
