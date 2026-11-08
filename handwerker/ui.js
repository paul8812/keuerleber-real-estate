// Gemeinsame Helfer für Handwerker- und Verwaltungsansicht.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const eur = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n || 0);
export const dt = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const dtm = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'gerade eben' : m < 60 ? `vor ${m} Min.` : m < 1440 ? `vor ${Math.round(m / 60)} Std.` : `vor ${Math.round(m / 1440)} Tg.`; };
/** ISO-Kalenderwoche als {y, w} */
export function kwOf(t = Date.now()) {
  const x = new Date(t), d = new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate()));
  const day = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - day);
  const y = d.getUTCFullYear(); return { y, w: Math.ceil(((d - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7) };
}
export const kwKey = (k) => `${k.y}-${String(k.w).padStart(2, '0')}`;
export const lsGet = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
export const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* privater Modus */ } };

export const logo = (cls) => `<img src="../partner/logo-weiss.svg" alt="Norderfranken Haus & Grund" class="${cls} logo-w"><img src="../partner/logo.svg" alt="Norderfranken Haus & Grund" class="${cls} logo-d">`;

export const dlg = (id, cls) => {
  let d = document.getElementById(id);
  if (!d) { d = document.createElement('dialog'); d.id = id; d.className = cls; document.body.append(d); }
  return d;
};
export function confirmBox({ title, text = '', ok = 'OK', danger = false }) {
  return new Promise((res) => {
    const d = dlg('mini', 'mini'); let out = false;
    d.innerHTML = `<form class="mini-b"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      <div class="acts"><button class="btn ${danger ? 'dark' : 'fill'}">${esc(ok)}</button><button type="button" class="btn ghost" id="mNo">Abbrechen</button></div></form>`;
    d.onclose = () => res(out);
    d.querySelector('#mNo').onclick = () => d.close();
    d.querySelector('form').onsubmit = (e) => { e.preventDefault(); out = true; d.close(); };
    d.showModal();
  });
}
export function askBox({ title, label, value = '', ok = 'Speichern', hint = '', type = 'text', check }) {
  return new Promise((res) => {
    const d = dlg('mini', 'mini'); let out = null;
    d.innerHTML = `<form class="mini-b"><h3>${esc(title)}</h3>
      <label class="f"><span>${esc(label)}</span><input name="v" type="${type}" value="${esc(value)}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
      ${hint ? `<p class="hint">${esc(hint)}</p>` : ''}<p class="lg-err hidden" id="mErr" role="alert"></p>
      <div class="acts"><button class="btn fill">${esc(ok)}</button><button type="button" class="btn ghost" id="mNo">Abbrechen</button></div></form>`;
    d.onclose = () => res(out);
    d.querySelector('#mNo').onclick = () => d.close();
    d.querySelector('form').onsubmit = (e) => {
      e.preventDefault();
      const v = e.target.v.value.trim(), er = check?.(v);
      if (er) { const p = d.querySelector('#mErr'); p.textContent = er; p.classList.remove('hidden'); return; }
      out = v; d.close();
    };
    d.showModal();
    const i = d.querySelector('input'); i.focus(); i.select();
  });
}
let toastTimer = 0;
export function toast(text, ok = true) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.className = 'toast ' + (ok ? 'ok' : 'err'); t.textContent = text;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 4500);
}

/** Foto verkleinern (längste Seite 1600 px, JPEG) – spart Speicher und Datenvolumen auf der Baustelle. */
export async function shrinkImage(file, max = 1600) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) throw new Error(`„${file.name}“ ist kein lesbares Bild.`);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
  return new Uint8Array(await blob.arrayBuffer());
}

export function themaWechseln() {
  const h = document.documentElement, hell = h.getAttribute('data-theme') !== 'light';
  if (hell) h.setAttribute('data-theme', 'light'); else h.removeAttribute('data-theme');
  try { localStorage.setItem('cockpit-thema', hell ? 'light' : 'dark'); } catch { /* privater Modus */ }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', hell ? '#F1F1F2' : '#0E0E0F');
  document.querySelectorAll('.thema').forEach((b) => b.setAttribute('aria-checked', String(hell)));
}
