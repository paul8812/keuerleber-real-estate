/* Kundenangebot – Modellrechnung für eine oder mehrere Wohnungen (einzeln oder als Paket).
   Eigenständig, ohne Abhängigkeiten: läuft im CRM (Vorschau/Präsentation) und in der exportierten HTML-Datei.
   Aufruf: KreAngebot.starte(daten, { onChange(stand), merken: true|false })
   daten: { id, stand, name, termin, st, ek, tilg, nk, start: 'paket'|0…, logo, absender: {name, titel, adresse, tel, email},
            objs: [{ id, n, e, ort, t, d, qm, zi, bj, kp, miete, nu, hg, zins, afa, geb, stat, verm, gut, mn, en, pl: [], im: [{ src, plan }] }] } */
(function () {
  'use strict';
  var D, STD, akt, opt, erst = true, KEY, letzteJ = 0, tasten = false;
  var $ = function (s, r) { return (r || document).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var kopie = function (o) { return JSON.parse(JSON.stringify(o)); };
  var fin = function (n, ers) { return isFinite(n) ? n : (ers || 0); };
  function z(n, d) { return Math.abs(fin(n)).toLocaleString('de-DE', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function eur(n, d) { return (fin(n) < 0 ? '− ' : '') + z(n, d) + ' €'; }
  function eurV(n, d) { return (fin(n) < 0 ? '− ' : '+ ') + z(n, d) + ' €'; }
  function pz(n, d) { return fin(n).toLocaleString('de-DE', { minimumFractionDigits: d == null ? 2 : d, maximumFractionDigits: d == null ? 2 : d }) + ' %'; }
  function pzK(n) { return fin(n).toLocaleString('de-DE', { maximumFractionDigits: 2 }) + ' %'; }
  function qm(n) { return fin(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²'; }
  /** „174.300“, „174300“, „4,5“, „4.5“, „5,26 %“ → Zahl (Punkt nur dann Tausenderpunkt, wenn er so aussieht) */
  function zahl(s) {
    s = String(s == null ? '' : s).replace(/[\s€% ]/g, ''); if (!s) return NaN;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
  }
  var GRENZE = { kp: [1000, 50000000], miete: [0, 100000], nu: [0, 10000], zins: [0, 15], afa: [0.5, 25], geb: [1, 100] };
  var FELDER = ['kp', 'miete', 'nu', 'zins', 'afa', 'geb'], GLOBAL = ['st', 'ek', 'tilg', 'nk'];
  var paket = function () { return akt === 'paket'; };
  var drin = function (o) { return !D.aus[o.id]; };
  var kurz = function (o) { return String(o.n).replace('straße', 'str.') + (o.e ? ', ' + o.e : ''); };

  /* ---------------- Rechnung (wie im Exposé) ---------------- */
  function rechne(o) {
    var r = {}; r.kp = o.kp; r.nk = o.kp * D.nk / 100; r.ges = o.kp + r.nk; r.darl = o.kp * (1 - D.ek / 100); r.ek = r.ges - r.darl;
    r.rate = r.darl * (o.zins + D.tilg) / 100 / 12; r.miete = o.miete; r.nu = o.nu; r.vor = o.miete - r.rate - o.nu;
    r.gebE = o.kp * o.geb / 100; r.afaE = Math.round(r.gebE * o.afa / 100); r.afaStd = Math.round(r.gebE * .02);
    r.mietJ = Math.round(o.miete * 12); r.zinsJ = Math.round(r.darl * o.zins / 100); r.nuJ = Math.round(o.nu * 12);
    r.erg = r.mietJ - r.afaE - r.zinsJ - r.nuJ; r.tax = Math.round(-r.erg * D.st / 100); r.nach = r.vor + r.tax / 12;
    var rest = r.darl, ann = r.rate * 12, ct = 0, cs = 0; r.jahr = [];
    for (var j = 1; j <= 10; j++) { var zi = rest * o.zins / 100, tg = Math.max(0, Math.min(rest, ann - zi)); rest -= tg; var tx = Math.round(-(r.mietJ - r.afaE - Math.round(zi) - r.nuJ) * D.st / 100); ct += tg; cs += tx; r.jahr.push({ tx: tx, tilg: ct, tax: cs, rest: rest }); }
    return r;
  }
  function summe(R) {
    var S = { n: 0, v: 0, qm: 0, jahr: [] }, K = ['kp', 'nk', 'ges', 'darl', 'ek', 'rate', 'miete', 'nu', 'vor', 'gebE', 'afaE', 'afaStd', 'mietJ', 'zinsJ', 'nuJ', 'erg', 'tax', 'nach'];
    K.forEach(function (k) { S[k] = 0; }); for (var j = 0; j < 10; j++) S.jahr.push({ tx: 0, tilg: 0, tax: 0, rest: 0 });
    D.objs.forEach(function (o, i) { if (!drin(o)) return; var r = R[i]; S.n++; S.v += o.verm ? 1 : 0; S.qm += fin(o.qm); K.forEach(function (k) { S[k] += r[k]; }); r.jahr.forEach(function (y, k) { ['tx', 'tilg', 'tax', 'rest'].forEach(function (q) { S.jahr[k][q] += y[q]; }); }); });
    return S;
  }

  /* ---------------- Stand merken ---------------- */
  function stand() { return { name: D.name, st: D.st, ek: D.ek, tilg: D.tilg, nk: D.nk, aus: D.aus, akt: akt, objs: D.objs.map(function (o) { var x = { id: o.id }; FELDER.forEach(function (k) { x[k] = o[k]; }); return x; }) }; }
  function uebernehmen(s) {
    if (!s || typeof s !== 'object') return;
    if (typeof s.name === 'string' && s.name) D.name = s.name;
    GLOBAL.forEach(function (k) { if (isFinite(s[k])) D[k] = +s[k]; });
    if (s.aus && typeof s.aus === 'object') { D.aus = {}; D.objs.forEach(function (o) { if (s.aus[o.id]) D.aus[o.id] = 1; }); if (!D.objs.some(drin)) D.aus = {}; }
    (s.objs || []).forEach(function (x) { var o = D.objs.filter(function (y) { return y.id === x.id; })[0]; if (o) FELDER.forEach(function (k) { if (isFinite(x[k]) && x[k] !== null && x[k] !== '') o[k] = +x[k]; }); });
    if (s.akt === 'paket' && D.objs.length > 1) akt = 'paket'; else if (isFinite(s.akt) && D.objs[+s.akt]) akt = +s.akt;
  }
  function merken() {
    if (opt.merken !== false) { try { localStorage.setItem(KEY, JSON.stringify(stand())); } catch (e) { /* privater Modus */ } }
    if (opt.onChange) { try { opt.onChange(stand()); } catch (e) { /* egal */ } }
  }

  /* Zahlen weich umblenden */
  var werte = new WeakMap();
  function setze(el, ziel, fmt) {
    ziel = fin(ziel); var von = werte.has(el) ? werte.get(el) : 0; werte.set(el, ziel); var t0 = performance.now(), dau = erst ? 1300 : 600;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { el.innerHTML = fmt(ziel); return; }
    (function f(now) { var p = Math.min(1, Math.max(0, (now - t0) / dau)), e = 1 - Math.pow(1 - p, 3); if (werte.get(el) !== ziel) return; el.innerHTML = fmt(von + (ziel - von) * e); if (p < 1) requestAnimationFrame(f); })(t0);
  }

  /* ---------------- Gerüst ---------------- */
  function geruest() {
    var a = D.absender || {}, mehr = D.objs.length > 1, logo = D.logo ? '<img src="' + esc(D.logo) + '" alt="">' : '';
    var marke = '<a class="lk" href="#top">' + logo + '<div><b>Keuerleber</b><span>Immobilien</span></div></a>';
    document.body.innerHTML =
      '<header><div class="w hd">' + marke + '<div class="hd-r"><p><span id="hd1"></span><small id="hd2"></small></p><button class="tbtn" type="button" id="annBtn">Annahmen</button></div></div></header>' +
      (mehr ? '<nav class="pick" aria-label="Wohnung wählen"><div class="w" id="pick"></div></nav>' : '') +
      '<main id="top">' +
      '<section class="hero"><div class="w"><p class="lab in1">Persönlich erstellt für <span data-name></span></p><h1 class="in2"><span>Herzlich willkommen,</span><em data-name></em></h1><p class="p in3" id="intro"></p>' +
      '<div class="card res in4" id="res"><div class="res-h"><p class="lab" id="resLab" style="margin:0"></p><span id="resStat"></span></div>' +
      '<div class="bigs"><div><small>Steuerersparnis</small><p class="big g" id="bTax"></p><em>pro Jahr, im ersten Jahr</em></div><div><small>Monatlich nach Steuern</small><p class="big" id="bNach"></p><em>Miete minus Rate und Hausgeld, plus Steuer</em></div><div><small>Eigenkapital</small><p class="big" id="bEk"></p><em id="bEkS"></em></div></div>' +
      '<div class="smalls"><div><small id="s1L"></small><b id="sKp"></b></div><div><small id="s2L"></small><b id="sQm"></b></div><div><small>Kaltmiete im Monat</small><b id="sMiete"></b></div><div><small>Brutto-Mietrendite</small><b id="sRend"></b></div><div><small>Abschreibung pro Jahr*</small><b id="sAfa"></b></div></div></div>' +
      (mehr ? '<div class="kombi" id="kombi"><span id="kombiL"></span><div id="kombiB"></div></div>' : '') + '</div></section>' +
      '<section class="blk" id="wohnung"><div class="w"><p class="lab">Die Wohnung</p><h2 id="wH"></h2><p class="p" id="wP"></p><div class="two"><div><div class="gal" id="gal"></div><div class="thumbs" id="thumbs"></div></div><div class="card pad"><ul class="kv" id="wKv"></ul><div class="pills" id="wPills"></div></div></div></div></section>' +
      '<section class="blk" id="paket"><div class="w"><p class="lab">Ihre Auswahl</p><h2 id="pH"></h2><p class="p">Mit dem Schalter nehmen Sie eine Wohnung in die Rechnung hinein oder wieder heraus. Alle Zahlen rechnen sofort neu.</p><div class="cards" id="cards"></div></div></section>' +
      '<section class="blk" id="invest"><div class="w"><p class="lab">Die Investition</p><h2>Was der Kauf <em>kostet.</em></h2><div class="flow five" id="inv"></div></div></section>' +
      '<section class="blk" id="afa"><div class="w"><p class="lab">Der Steuerhebel</p><h2>So funktioniert <em>die Abschreibung.</em></h2><p class="p">Ein Gebäude nutzt sich ab. Diesen Wertverlust ziehen Sie als Vermieter jedes Jahr von den Mieteinnahmen ab, ohne dafür Geld auszugeben. Üblich sind <b>2 % über 50 Jahre</b>. Ein Gutachten über die tatsächliche Restnutzungsdauer verteilt denselben Betrag auf weniger Jahre.*</p>' +
      '<div class="flow" id="aflow"></div><div class="card tl" id="tl"><div class="tl-row"><span>Üblich<small>2 % über 50 Jahre</small></span><div class="track"><u id="tU1"></u><s style="left:100%" data-t="50 Jahre"></s></div><b id="tStd"></b></div><div class="tl-row g"><span>Mit Gutachten<small id="tGS"></small></span><div class="track"><u id="tU2"></u><s id="tS2" data-t=""></s></div><b id="tHoch"></b></div><p class="merk" id="merk"></p></div></div></section>' +
      '<section class="blk" id="steuer"><div class="w"><p class="lab">Die Rechnung</p><h2>Woher die <em>Steuerersparnis</em> kommt.</h2><p class="p">Links die Rechnung für das Finanzamt, rechts das, was monatlich auf Ihrem Konto passiert.</p><div class="two"><div class="card pad"><h3 style="margin-bottom:10px">Für das Finanzamt, pro Jahr</h3><div id="wf"></div><div class="wf-sum"><span>Steuerersparnis pro Jahr<small id="wfMal"></small></span><b id="wfBig"></b></div></div><div class="card pad"><h3 style="margin-bottom:10px">Auf Ihrem Konto, pro Monat</h3><ul class="kv" id="mon"></ul></div></div></div></section>' +
      '<section class="blk" id="zehn"><div class="w"><p class="lab">Jahr für Jahr</p><h2>Was in <em>zehn Jahren</em> zusammenkommt.</h2><p class="p">Aufgelaufene Steuerersparnis und getilgtes Darlehen, bei gleichbleibender Miete, gleichem Zins und ohne Wertsteigerung.</p><div class="leg"><span><i style="background:#c9a96e"></i>Steuerersparnis, aufgelaufen</span><span><i style="background:#5f5b53"></i>Darlehen getilgt, aufgelaufen</span></div>' +
      '<div class="scroll"><table class="yt" id="yt"><thead><tr><th>Jahr</th><th class="bar"></th><th>Steuer im Jahr</th><th>Steuer gesamt</th><th>Getilgt gesamt</th><th>Restschuld</th></tr></thead><tbody></tbody></table></div></div></section>' +
      (mehr ? '<section class="blk" id="vergleich"><div class="w"><p class="lab">Überblick</p><h2 id="vH"></h2><p class="p">Ein Klick auf eine Zeile zeigt die Wohnung einzeln.</p><div class="scroll"><table class="cmp" id="cmp"><thead><tr><th>Wohnung</th><th>Kaufpreis</th><th>Eigenkapital</th><th>AfA*</th><th>Steuer / Jahr</th><th>Monatlich nach Steuern</th><th>Vermietung</th></tr></thead><tbody></tbody></table></div></div></section>' : '') +
      '<div class="w"><details class="card ann" id="ann"><summary><span><b style="font:700 19px var(--sans);letter-spacing:-.02em;color:#fff">Annahmen anpassen</b><small id="annS"></small></span></summary><div class="ann-in"><div class="tool-g">' +
      '<div class="fld"><label for="gName">Name des Kunden</label><input type="text" id="gName" autocomplete="off"></div>' +
      '<div class="fld"><label for="gSt">Steuersatz <b id="gStO"></b></label><input type="range" id="gSt" min="0" max="45" step="1"></div>' +
      '<div class="fld"><label for="gEk">Eigenkapital <b id="gEkO"></b></label><input type="range" id="gEk" min="0" max="60" step="1"></div>' +
      '<div class="fld"><label for="gZi">Zins für alle <b id="gZiO"></b></label><input type="range" id="gZi" min="1" max="7" step="0.05"></div>' +
      '<div class="fld"><label for="gTi">Tilgung <b id="gTiO"></b></label><input type="range" id="gTi" min="1" max="4" step="0.25"></div>' +
      '<div class="fld"><label for="gNk">Nebenkosten <b id="gNkO"></b></label><input type="range" id="gNk" min="3" max="12" step="0.5"></div></div>' +
      '<div class="scroll"><table class="tbl" id="tbl"><thead><tr><th>Wohnung</th><th>Kaufpreis €</th><th>Kaltmiete €</th><th>Hausgeld n. uml. €</th><th>Zins %</th><th>AfA %</th><th>Gebäudeanteil %</th></tr></thead><tbody></tbody></table></div>' +
      '<div class="tool-b"><button class="tbtn" id="reset" type="button">Auf Ausgangswerte zurücksetzen</button><button class="tbtn" type="button" id="druck">Drucken oder als PDF speichern</button></div></div></details><div class="notes" id="notes"></div></div></main>' +
      '<footer><div class="w">' + marke + '<p>' + esc([a.name, a.titel, a.adresse].filter(Boolean).join(' · ')) + '<br>' + esc([a.tel, a.email].filter(Boolean).join(' · ')) + '</p></div></footer>';
  }
  function bilder(o, cls) {
    return (o.im || []).map(function (b, j) { return '<img src="' + esc(b.src) + '" alt="' + esc(o.n) + ', Bild ' + (j + 1) + '" class="' + (j ? '' : 'on ') + (b.plan ? 'plan' : '') + '"' + (b.plan ? ' data-plan' : '') + (j ? ' loading="lazy"' : '') + '>'; }).join('');
  }
  function aufbau() {
    geruest();
    if ($('#pick')) {
      $('#pick').innerHTML = D.objs.map(function (o, i) { return '<button type="button" data-i="' + i + '"><b>' + esc(o.n) + '</b><span>' + esc([o.e, o.zi ? o.zi + ' Zimmer' : '', o.qm ? fin(o.qm).toLocaleString('de-DE') + ' m²' : ''].filter(Boolean).join(' · ')) + '</span></button>'; }).join('') + '<button type="button" class="alle" data-i="paket"><b>Zusammen kaufen</b><span id="pickS"></span></button>';
      $$('#pick button').forEach(function (b) { b.onclick = function () { waehle(b.dataset.i === 'paket' ? 'paket' : +b.dataset.i); }; });
      $('#cmp tbody').innerHTML = D.objs.map(function (o, i) { return '<tr data-i="' + i + '" tabindex="0"><td><b>' + esc(o.n) + '</b><span>' + esc([o.e, o.zi ? o.zi + ' Zimmer' : ''].filter(Boolean).join(' · ')) + '</span></td><td></td><td></td><td></td><td class="g"></td><td></td><td>' + esc(o.stat || '') + '</td></tr>'; }).join('') + '<tr class="sum"><td><b>Zusammen</b><span id="cmpS"></span></td><td></td><td></td><td></td><td class="g"></td><td></td><td></td></tr>';
      $$('#cmp tbody tr[data-i]').forEach(function (tr) { var los = function () { waehle(+tr.dataset.i); window.scrollTo({ top: 0, behavior: 'smooth' }); }; tr.onclick = los; tr.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); los(); } }; });
      var n = D.objs.length; $('#cards').className = 'cards' + (n < 4 ? ' n' + n : '');
      $('#cards').innerHTML = D.objs.map(function (o, i) {
        var im = o.im || [];
        return '<article class="oc" data-i="' + i + '">' + (im.length ? '<button class="oc-img" type="button" aria-label="Nächstes Bild: ' + esc(o.n) + '">' + bilder(o) + '<span class="tag' + (o.gut ? ' g' : '') + '">' + (o.gut ? 'Gutachten liegt vor' : 'Gutachten in Vorbereitung') + '</span><span class="dots">' + im.map(function (b, j) { return '<i' + (j ? '' : ' class="on"') + '></i>'; }).join('') + '</span></button>' : '<div class="oc-img leer">Kein Bild hinterlegt</div>') +
          '<div class="oc-b"><h3>' + esc(o.n) + '</h3><p class="oc-s">' + esc([o.e, o.zi ? o.zi + ' Zimmer' : '', o.qm ? qm(o.qm) : '', o.stat].filter(Boolean).join(' · ')) + '</p><ul class="kv"><li><span>Kaufpreis</span><b data-f="kp"></b></li><li><span>Kaltmiete</span><b data-f="mi"></b></li><li><span>Steuer / Jahr</span><b data-f="tx" style="color:var(--gl)"></b></li><li><span>nach Steuern / Monat</span><b data-f="mo"></b></li></ul>' +
          '<button class="auf" type="button">Einzeln ansehen →</button><button class="sw" type="button" role="switch" aria-checked="true"><i></i><span></span></button></div></article>';
      }).join('');
      $$('.oc').forEach(function (c) {
        var imgs = $$('.oc-img img', c), dots = $$('.dots i', c), k = 0, i = +c.dataset.i;
        if (imgs.length) $('.oc-img', c).onclick = function () { k = (k + 1) % imgs.length; imgs.forEach(function (im, j) { im.classList.toggle('on', j === k); }); dots.forEach(function (d, j) { d.classList.toggle('on', j === k); }); };
        $('.auf', c).onclick = function () { waehle(i); window.scrollTo({ top: 0, behavior: 'smooth' }); };
        $('.sw', c).onclick = function () { var o = D.objs[i]; if (D.aus[o.id]) delete D.aus[o.id]; else { if (D.objs.filter(drin).length < 2) return; D.aus[o.id] = 1; } merken(); zeichne(); };
      });
    }
    $('#yt tbody').innerHTML = Array(11).join('<tr><td></td><td class="bar"><div class="b"><u></u><s></s></div></td><td></td><td class="g"></td><td></td><td></td></tr>');
    $('#tbl tbody').innerHTML = D.objs.map(function (o, i) { return '<tr><td>' + esc(kurz(o)) + '</td>' + FELDER.map(function (k) { return '<td><input type="text" inputmode="decimal" data-i="' + i + '" data-k="' + k + '" aria-label="' + esc(kurz(o)) + ': ' + k + '"></td>'; }).join('') + '</tr>'; }).join('');
    $$('#tbl input').forEach(function (inp) {
      var los = function () {
        var v = zahl(inp.value), g = GRENZE[inp.dataset.k], okk = isFinite(v) && v >= g[0] && v <= g[1];
        inp.classList.toggle('falsch', !okk && inp.value.trim() !== '');
        if (okk) { D.objs[+inp.dataset.i][inp.dataset.k] = v; merken(); zeichne(); }
      };
      inp.addEventListener('input', los);
      inp.addEventListener('blur', function () { inp.classList.remove('falsch'); tool(); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') inp.blur(); });
    });
    $('#wf').innerHTML = Array(6).join('<div class="wf-row"><span></span><i><u></u></i><b></b></div>');
    $('#gName').addEventListener('input', function () { D.name = this.value.trim() || STD.name; merken(); zeichne(); });
    [['gSt', 'st'], ['gEk', 'ek'], ['gTi', 'tilg'], ['gNk', 'nk']].forEach(function (p) { $('#' + p[0]).addEventListener('input', function () { D[p[1]] = +this.value; merken(); tool(); zeichne(); }); });
    $('#gZi').addEventListener('input', function () { var v = Math.round(+this.value * 100) / 100; D.objs.forEach(function (o) { o.zins = v; }); merken(); tool(); zeichne(); });
    $('#reset').onclick = function () { var n = D.name, a = akt; D = kopie(STD); D.name = n; D.aus = {}; akt = a; merken(); tool(); zeichne(); balken(); };
    $('#druck').onclick = function () { $('#ann').open = false; window.print(); };
    $('#annBtn').onclick = function () { var a = $('#ann'); a.open = true; a.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $$('a.lk').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }; });
  }
  function waehle(i) {
    if (i === akt) return; akt = i; galerie(); zeichne(); merken();
    ['res', paket() ? 'paket' : 'wohnung', 'afa', 'steuer', 'zehn'].forEach(function (id) { var el = $('#' + id); if (!el) return; el.classList.remove('wechsel', 'in1', 'in2', 'in3', 'in4'); void el.offsetWidth; el.classList.add('wechsel'); });
    balken();
  }
  function galerie() {
    if (paket()) return; var o = D.objs[akt], im = o.im || [], g = $('#gal');
    g.className = 'gal' + (im.length ? '' : ' leer');
    g.innerHTML = (im.length ? bilder(o) : 'Kein Bild hinterlegt') + '<span class="tag ' + (o.gut ? 'g' : '') + '">' + (o.gut ? 'Gutachten liegt vor' : 'Gutachten in Vorbereitung') + '</span>' + (o.stat ? '<span class="tag r">' + esc(o.stat) + '</span>' : '');
    $('#thumbs').innerHTML = im.length > 1 ? im.map(function (b, j) { return '<button type="button" data-j="' + j + '"' + (j ? '' : ' class="on"') + ' aria-label="Bild ' + (j + 1) + '"><img src="' + esc(b.src) + '" alt=""' + (b.plan ? ' class="plan"' : '') + ' loading="lazy"></button>'; }).join('') : '';
    var zeig = function (k) { $$('#gal img').forEach(function (x, j) { x.classList.toggle('on', j === k); }); $$('#thumbs button').forEach(function (x, j) { x.classList.toggle('on', j === k); }); g.dataset.k = k; };
    g.dataset.k = 0; g.onclick = im.length > 1 ? function () { zeig((+g.dataset.k + 1) % im.length); } : null;
    $$('#thumbs button').forEach(function (b) { b.onclick = function () { zeig(+b.dataset.j); }; });
  }
  function tool() {
    if (document.activeElement !== $('#gName')) $('#gName').value = D.name;
    [['gSt', 'st'], ['gEk', 'ek'], ['gTi', 'tilg'], ['gNk', 'nk']].forEach(function (p) { var el = $('#' + p[0]); el.value = D[p[1]]; el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); });
    var zs = D.objs.map(function (o) { return o.zins; }), gl = zs.every(function (x) { return x === zs[0]; }), gz = $('#gZi');
    if (document.activeElement !== gz || gl) gz.value = gl ? zs[0] : zs.reduce(function (a, b) { return a + b; }, 0) / zs.length;
    gz.style.setProperty('--p', ((gz.value - gz.min) / (gz.max - gz.min) * 100) + '%');
    $('#gZiO').textContent = gl ? pz(zs[0]) : 'verschieden'; $('#gStO').textContent = pz(D.st, 0); $('#gEkO').textContent = pz(D.ek, 0); $('#gTiO').textContent = pzK(D.tilg); $('#gNkO').textContent = pzK(D.nk);
    $('#annS').textContent = 'Steuersatz ' + pz(D.st, 0) + ' · Eigenkapital ' + pz(D.ek, 0) + ' · Tilgung ' + pzK(D.tilg) + ' · Kaufnebenkosten ' + pzK(D.nk) + ' · Zins ' + (gl ? pz(zs[0]) : 'je Wohnung verschieden');
    $$('#tbl input').forEach(function (inp) { if (document.activeElement === inp) return; inp.value = fin(D.objs[+inp.dataset.i][inp.dataset.k]).toLocaleString('de-DE', { maximumFractionDigits: 2 }); });
  }
  function balken() {
    var J = Math.min(50, Math.max(1, letzteJ || 50));
    ['tU1', 'tU2'].forEach(function (id) { var u = $('#' + id); u.style.transitionDuration = '0s'; u.style.width = '0'; }); void $('#tU1').offsetWidth;
    $('#tU1').style.transitionDuration = '2.4s'; $('#tU2').style.transitionDuration = (2.4 * J / 50).toFixed(2) + 's'; $('#tU1').style.width = '100%'; $('#tU2').style.width = (J / 50 * 100) + '%';
  }
  function hinweise() {
    var mit = D.objs.filter(function (o) { return o.gut; }), ohne = D.objs.filter(function (o) { return !o.gut; }), frei = D.objs.filter(function (o) { return !o.verm; });
    var liste = function (L) { return L.map(function (o) { return o.n + (D.objs.filter(function (x) { return x.n === o.n; }).length > 1 && o.e ? ' (' + o.e + ')' : ''); }).filter(function (x, i, a) { return a.indexOf(x) === i; }).join(', ').replace(/, ([^,]*)$/, ' und $1'); };
    var afas = D.objs.map(function (o) { return o.afa; }), gleich = afas.every(function (x) { return x === afas[0]; });
    var N = ['* Die erhöhte Abschreibung setzt ein Restnutzungsdauer-Gutachten eines vereidigten Sachverständigen voraus und gilt nur bei Vermietung. ' +
      (gleich ? (D.objs.length > 1 ? 'Alle Wohnungen sind' : 'Die Wohnung ist') + ' mit einer Restnutzungsdauer von ' + Math.round(100 / afas[0]) + ' Jahren gerechnet, das entspricht ' + pz(afas[0]) + ' Abschreibung pro Jahr. ' : 'Gerechnet ist je Wohnung mit der oben genannten Abschreibung. ') +
      (mit.length ? 'Für ' + liste(mit) + ' liegt das Gutachten vor' + (ohne.length ? ', für ' + liste(ohne) + ' ist es in Vorbereitung. ' : '. ') : 'Das Gutachten ist in Vorbereitung. ') + 'Ob das Finanzamt die verkürzte Restnutzungsdauer anerkennt, prüft Ihr Steuerberater.'];
    if (frei.length) N.push('Für ' + (frei.length === D.objs.length && D.objs.length === 1 ? 'die unvermietete Wohnung' : 'unvermietete Wohnungen (' + liste(frei) + ')') + ' ist die im Exposé angesetzte Miete gerechnet.');
    if (D.hinweis) N.push(D.hinweis);
    N.push('Gerechnet wie im Exposé: Darlehen = Kaufpreis minus Eigenkapitalanteil, Kaufnebenkosten aus Eigenkapital, Zinsen des ersten Jahres auf das volle Darlehen. In der Zehn-Jahres-Liste sinken die Zinsen mit der Restschuld, deshalb sinkt die Steuerersparnis leicht.');
    N.push('Alle Angaben beruhen auf Unterlagen des Verkäufers. Die Kalkulation ist ein unverbindliches Rechenbeispiel und keine Zusicherung. Sie ersetzt keine Steuer-, Rechts- oder Anlageberatung. Zwischenverkauf und Irrtum vorbehalten. Für Käufer fällt keine Provision an.');
    $('#notes').innerHTML = N.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join('');
  }
  var WORT = ['', 'Eine', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn'];
  function zeichne() {
    var R = D.objs.map(rechne), S = summe(R), P = paket(), o = P ? null : D.objs[akt], r = P ? S : R[akt], ort = D.ort || 'Hof', nAll = D.objs.length;
    document.title = 'Für ' + D.name + ' · ' + 'Wohnungsangebot' + ' ' + ort;
    $$('[data-name]').forEach(function (e) { e.textContent = D.name; });
    $('#hd1').textContent = 'Wohnungsangebot'; $('#hd2').textContent = 'Modellrechnung' + (D.termin ? ' · Termin am ' + D.termin : P ? ' · ' + S.n + ' Wohnung' + (S.n === 1 ? '' : 'en') + ' in ' + ort : '');
    $$('#pick button').forEach(function (b) { b.classList.toggle('on', b.dataset.i === String(akt)); });
    if ($('#pickS')) $('#pickS').textContent = S.n + ' von ' + nAll + ' Wohnungen gerechnet';
    if ($('#kombi')) {
      /* Einzelansicht: „noch eine dazu“ – Paketansicht: zurück zur einzelnen Wohnung */
      var andere = D.objs.map(function (x, i) { return i; }).filter(function (i) { return P ? drin(D.objs[i]) : i !== akt; });
      $('#kombiL').textContent = P ? 'Zusammen gerechnet:' : 'Zwei oder mehr kaufen? Dazu nehmen:';
      $('#kombiB').innerHTML = P ? andere.map(function (i) { return '<button type="button" class="an" data-raus="' + i + '" aria-label="' + esc(kurz(D.objs[i])) + ' aus der Rechnung nehmen">' + esc(kurz(D.objs[i])) + (andere.length > 1 ? ' <i>×</i>' : '') + '</button>'; }).join('') + D.objs.map(function (x, i) { return drin(x) ? '' : '<button type="button" data-rein="' + i + '">+ ' + esc(kurz(x)) + '</button>'; }).join('')
        : andere.map(function (i) { return '<button type="button" data-dazu="' + i + '">+ ' + esc(kurz(D.objs[i])) + '</button>'; }).join('');
      $$('#kombiB [data-dazu]').forEach(function (b) { b.onclick = function () { var a = akt, z2 = +b.dataset.dazu; D.aus = {}; D.objs.forEach(function (x, i) { if (i !== a && i !== z2) D.aus[x.id] = 1; }); waehle('paket'); }; });
      $$('#kombiB [data-rein]').forEach(function (b) { b.onclick = function () { delete D.aus[D.objs[+b.dataset.rein].id]; merken(); zeichne(); }; });
      $$('#kombiB [data-raus]').forEach(function (b) { b.onclick = function () { var L = D.objs.filter(drin); if (L.length < 2) return; D.aus[D.objs[+b.dataset.raus].id] = 1; L = D.objs.filter(drin); if (L.length === 1) waehle(D.objs.indexOf(L[0])); else { merken(); zeichne(); } }; });
    }
    ['wohnung'].forEach(function (id) { $('#' + id).hidden = P; }); ['paket', 'invest'].forEach(function (id) { $('#' + id).hidden = !P; });
    $('#intro').innerHTML = P ? esc(WORT[S.n] || S.n) + ' ' + (S.n === 1 ? 'sanierte Eigentumswohnung' : 'sanierte Eigentumswohnungen') + ' in ' + esc(ort) + (S.n === 1 ? '.' : ', zusammen gekauft.') + ' Alle Zahlen sind zusammen gerechnet, mit Ihrem Steuersatz von <b>' + pz(D.st, 0) + '</b>.'
      : 'So rechnet sich ' + (nAll > 1 ? 'eine sanierte Eigentumswohnung' : 'diese sanierte Eigentumswohnung') + ' in ' + esc(ort) + ' bei Ihrem Steuersatz von <b>' + pz(D.st, 0) + '</b>.' + (nAll > 1 ? ' Oben wählen Sie die Wohnung. Wenn Sie zwei oder mehr kaufen möchten, nehmen Sie weitere dazu – dann wird alles zusammen gerechnet.' : '');
    /* Ergebnis */
    $('#resLab').textContent = P ? 'Ergebnis · ' + (S.n === 1 ? 'eine Wohnung' : S.n + ' Wohnungen zusammen') : 'Ergebnis · ' + o.n + (o.e ? ', ' + o.e : '');
    $('#resStat').textContent = P ? S.v + ' von ' + S.n + ' vermietet · ' + ort : [o.stat, o.gut ? 'Gutachten liegt vor' : 'Gutachten in Vorbereitung'].filter(Boolean).join(' · ');
    setze($('#bTax'), r.tax, function (n) { return (n < 0 ? '− ' : '') + z(n) + '<i>€</i>'; });
    setze($('#bNach'), r.nach, function (n) { return (n < 0 ? '− ' : '+ ') + z(n) + '<i>€</i>'; }); $('#bNach').style.color = r.nach < 0 ? 'var(--neg)' : '';
    setze($('#bEk'), r.ek, function (n) { return z(n) + '<i>€</i>'; });
    $('#bEkS').textContent = pz(D.ek, 0) + ' vom Kaufpreis plus ' + pzK(D.nk) + ' Kaufnebenkosten';
    var afaP = r.gebE ? r.afaE / r.gebE * 100 : 0, J = afaP > 0 ? Math.round(100 / afaP) : 50; letzteJ = J;
    $('#s1L').textContent = P ? 'Kaufpreis gesamt' : 'Kaufpreis'; $('#s2L').textContent = P ? 'Wohnfläche gesamt' : 'Wohnfläche';
    $('#sKp').textContent = eur(r.kp); $('#sQm').textContent = P ? qm(S.qm) : qm(o.qm) + (o.zi ? ' · ' + o.zi + ' Zimmer' : ''); $('#sMiete').textContent = eur(r.miete, 2); $('#sRend').textContent = pz(r.kp ? r.mietJ / r.kp * 100 : 0); $('#sAfa').textContent = pz(afaP) + ' · ' + eur(r.afaE);
    /* Wohnung */
    if (!P) {
      $('#wH').textContent = o.t || (o.n + (o.e ? ', ' + o.e : '')); $('#wP').textContent = o.d || '';
      $('#wKv').innerHTML = [['Adresse', o.n + (o.plzOrt ? ' · ' + o.plzOrt : '')], o.e ? ['Etage', String(o.e).replace('OG', 'Obergeschoss')] : null, o.bj ? ['Baujahr', o.bj] : null, o.qm ? ['Wohnfläche', qm(o.qm)] : null, ['Kaufpreis', eur(o.kp) + (o.qm ? ' · ' + eur(o.kp / o.qm) + ' je m²' : '')], [o.mn || 'Kaltmiete', eur(o.miete, 2) + ' / Monat'], o.hg ? ['Hausgeld gesamt', eur(o.hg, 2) + ' / Monat'] : null, ['davon nicht umlagefähig', eur(o.nu, 2) + ' / Monat'], o.stat ? ['Vermietung', o.stat] : null, o.en ? ['Energieklasse', o.en] : null, ['Provision für Käufer', 'keine']].filter(Boolean).map(function (x) { return '<li><span>' + esc(x[0]) + '</span><b>' + esc(x[1]) + '</b></li>'; }).join('');
      $('#wPills').innerHTML = (o.pl || []).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
    } else {
      $('#pH').innerHTML = esc(WORT[S.n] || S.n) + ' Wohnung' + (S.n === 1 ? '' : 'en') + ', <em>zusammen gerechnet.</em>';
      $$('.oc').forEach(function (c) { var i = +c.dataset.i, ob = D.objs[i], rr = R[i], an = drin(ob); c.classList.toggle('aus', !an);
        $('[data-f=kp]', c).textContent = eur(ob.kp); $('[data-f=mi]', c).textContent = eur(ob.miete, 2); $('[data-f=tx]', c).textContent = eur(rr.tax); $('[data-f=mo]', c).textContent = eurV(rr.nach, 2);
        var sw = $('.sw', c); sw.setAttribute('aria-checked', an ? 'true' : 'false'); $('span', sw).textContent = an ? 'Wird mitgekauft' : 'Nicht dabei'; });
      $('#inv').innerHTML = [['Kaufpreis', eur(S.kp), S.n + ' Wohnung' + (S.n === 1 ? '' : 'en')], ['Kaufnebenkosten', eur(S.nk), pzK(D.nk) + ' vom Kaufpreis'], ['Gesamtinvestition', eur(S.ges), 'Kaufpreis plus Nebenkosten'], ['Darlehen', eur(S.darl), pz(100 - D.ek, 0) + ' vom Kaufpreis'], ['Eigenkapital', eur(S.ek), 'das bringen Sie mit']].map(function (x, i) { return (i ? '<i>' + (i === 2 ? '=' : i === 3 ? '−' : i === 4 ? '=' : '+') + '</i>' : '') + '<div' + (i === 4 ? ' class="g"' : '') + '><small>' + x[0] + '</small><b>' + x[1] + '</b><em>' + x[2] + '</em></div>'; }).join('');
    }
    /* Abschreibung */
    $('#aflow').innerHTML = [['Kaufpreis', eur(r.kp), P ? 'aller Wohnungen im Paket' : 'der Wohnung'], ['davon Gebäude', eur(r.gebE), P ? 'ohne Grund und Boden' : pz(o.geb, 0) + ' vom Kaufpreis'], ['Restnutzungsdauer', J + ' Jahre', (P ? S.n && D.objs.filter(drin).every(function (x) { return x.gut; }) : o.gut) ? 'laut Gutachten' : 'laut Gutachten erwartet'], ['Abschreibung pro Jahr', eur(r.afaE), pz(afaP) + ' vom Gebäudeanteil']].map(function (x, i) { return (i ? '<i>→</i>' : '') + '<div' + (i === 3 ? ' class="g"' : '') + '><small>' + x[0] + '</small><b>' + x[1] + '</b><em>' + x[2] + '</em></div>'; }).join('');
    $('#tStd').textContent = eur(r.afaStd) + ' / Jahr'; $('#tHoch').textContent = eur(r.afaE) + ' / Jahr'; $('#tGS').textContent = pz(afaP) + ' über ' + J + ' Jahre';
    var s2 = $('#tS2'); s2.style.left = Math.min(100, J / 50 * 100) + '%'; s2.dataset.t = J + ' Jahre';
    $('#merk').innerHTML = r.afaE > r.afaStd ? 'Das sind <b>' + eur(r.afaE - r.afaStd) + '</b> mehr Abschreibung pro Jahr. Bei ' + pz(D.st, 0) + ' Steuersatz bringt allein dieser Unterschied <b>' + eur((r.afaE - r.afaStd) * D.st / 100) + '</b> weniger Steuer im Jahr.' : 'Mit diesen Annahmen entspricht die Abschreibung dem üblichen Satz.';
    /* Finanzamt */
    var max = Math.max(r.mietJ, r.afaE + r.zinsJ + r.nuJ, 1), min = Math.min(0, r.erg), span = (max - min) || 1;
    [['Mieteinnahmen', '', r.mietJ, 'pos', 0, r.mietJ], ['− Abschreibung', pz(afaP) + ' auf ' + eur(r.gebE) + ' Gebäudeanteil', -r.afaE, 'neg', r.mietJ - r.afaE, r.afaE], ['− Schuldzinsen', (P ? '' : pzK(o.zins) + ' ') + 'auf ' + eur(r.darl) + ' Darlehen', -r.zinsJ, 'neg', r.mietJ - r.afaE - r.zinsJ, r.zinsJ], ['− Hausgeld, nicht umlagefähig', '', -r.nuJ, 'neg', r.erg, r.nuJ], ['= steuerliches Ergebnis', r.erg < 0 ? 'Verlust aus Vermietung' : 'Überschuss aus Vermietung', r.erg, 'res', Math.min(0, r.erg), Math.abs(r.erg)]].forEach(function (x, i) {
      var row = $('#wf').children[i]; row.className = 'wf-row ' + x[3]; row.children[0].innerHTML = esc(x[0]) + (x[1] ? '<small>' + esc(x[1]) + '</small>' : ''); row.children[2].textContent = eurV(x[2]); var u = row.querySelector('u'); u.style.left = Math.max(0, (x[4] - min) / span * 100) + '%'; u.style.width = Math.max(0, x[5] / span * 100) + '%';
    });
    $('#wfMal').textContent = eur(Math.abs(r.erg)) + ' × ' + pz(D.st, 0) + ' Steuersatz'; setze($('#wfBig'), r.tax, function (n) { return eur(n); });
    /* Konto */
    $('#mon').innerHTML = [[P ? 'Kaltmiete' : (o.mn || 'Kaltmiete'), r.miete, 1], ['Kreditrate (' + (P ? 'Zins + Tilgung' : 'Zins ' + pzK(o.zins) + ' + Tilgung ' + pzK(D.tilg)) + ')', -r.rate, 1], ['Hausgeld, nicht umlagefähig', -r.nu, 1], ['= vor Steuern', r.vor, 0], ['Steuerwirkung', r.tax / 12, 1]].map(function (x) { return '<li><span>' + esc(x[0]) + '</span><b class="' + (x[2] ? (x[1] < 0 ? 'neg' : 'pos') : '') + '">' + eurV(x[1], 2) + '</b></li>'; }).join('') + '<li class="sum"><span>Monatlich nach Steuern</span><b>' + eurV(r.nach, 2) + '</b></li>' +
      '<li style="border:0;padding-top:14px;font-size:13.5px;color:var(--mu)"><span>Darlehen ' + eur(r.darl) + ' · Eigenkapital ' + eur(r.ek) + ' · Gesamtinvestition ' + eur(r.ges) + '</span></li>';
    /* Zehn Jahre */
    var top = (r.jahr[9].tilg + Math.max(0, r.jahr[9].tax)) || 1;
    $$('#yt tbody tr').forEach(function (tr, k) { var y = r.jahr[k], c = tr.children; c[0].textContent = k + 1; c[2].textContent = eur(y.tx); c[3].textContent = eur(y.tax); c[4].textContent = eur(y.tilg); c[5].textContent = eur(y.rest);
      var b = tr.querySelector('.b'), ges = (Math.max(0, y.tax) + y.tilg) || 1; b.style.width = (ges / top * 100) + '%'; b.children[0].style.width = (Math.max(0, y.tax) / ges * 100) + '%'; b.children[1].style.width = (y.tilg / ges * 100) + '%'; });
    /* Vergleich */
    if ($('#cmp')) {
      $('#vH').innerHTML = 'Alle ' + esc((WORT[nAll] || String(nAll)).toLowerCase()) + ' <em>im Vergleich.</em>';
      $$('#cmp tbody tr[data-i]').forEach(function (tr) { var i = +tr.dataset.i, ob = D.objs[i], rr = R[i], c = tr.children; tr.classList.toggle('on', i === akt); tr.classList.toggle('aus', !drin(ob)); c[1].textContent = eur(ob.kp); c[2].textContent = eur(rr.ek); c[3].textContent = pz(ob.afa); c[4].textContent = eur(rr.tax); c[5].textContent = eurV(rr.nach, 2); });
      var sc = $('#cmp tr.sum').children; $('#cmpS').textContent = S.n + ' von ' + nAll + ' Wohnungen'; sc[1].textContent = eur(S.kp); sc[2].textContent = eur(S.ek); sc[3].textContent = pz(S.gebE ? S.afaE / S.gebE * 100 : 0); sc[4].textContent = eur(S.tax); sc[5].textContent = eurV(S.nach, 2);
    }
    hinweise();
  }

  function vorbereiten(daten) {
    var STD = kopie(daten);
    STD.objs = (STD.objs || []).map(function (x, i) { x.id = x.id || 'o' + i; FELDER.forEach(function (k) { x[k] = fin(+x[k], k === 'afa' ? 2 : k === 'geb' ? 80 : k === 'zins' ? 4 : 0); }); if (!(x.afa > 0)) x.afa = 2; if (!(x.geb > 0)) x.geb = 80; x.im = (x.im || []).filter(function (b) { return b && b.src; }); return x; });
    GLOBAL.forEach(function (k) { STD[k] = fin(+STD[k], { st: 42, ek: 20, tilg: 1, nk: 5.5 }[k]); });
    STD.name = STD.name || 'Interessent'; STD.aus = {};
    return STD;
  }
  function starte(daten, o) {
    opt = o || {}; STD = vorbereiten(daten);
    if (!STD.objs.length) { document.body.innerHTML = '<p style="padding:40px;font-family:sans-serif;color:#fff">Dieses Angebot enthält keine Wohnung.</p>'; D = null; return; }
    erst = true; D = kopie(STD); akt = D.objs.length > 1 ? (STD.start === 'paket' ? 'paket' : (D.objs[+STD.start] ? +STD.start : 0)) : 0;
    KEY = 'kre-angebot-' + (STD.id || 'x') + '-' + (STD.stand || '');
    if (STD.angepasst) uebernehmen(STD.angepasst);   // im CRM gespeicherte Anpassungen für diese Person
    if (opt.merken !== false) { try { uebernehmen(JSON.parse(localStorage.getItem(KEY))); } catch (e) { /* nichts gemerkt */ } }
    aufbau(); galerie(); tool(); zeichne(); setTimeout(function () { balken(); erst = false; }, 700);
    if (!tasten) { tasten = true; document.addEventListener('keydown', function (e) { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || D.objs.length < 2) return; var L = D.objs.map(function (x, i) { return i; }).concat(['paket']), p = L.indexOf(akt); if (e.key === 'ArrowRight') waehle(L[(p + 1) % L.length]); if (e.key === 'ArrowLeft') waehle(L[(p + L.length - 1) % L.length]); }); }
  }
  /** Neue Werte übernehmen, ohne die Seite neu aufzubauen (Bildlauf und Auswahl bleiben) – bei geänderter Auswahl, Bildern oder Texten kompletter Neuaufbau */
  function aktualisiere(daten) {
    var neu = vorbereiten(daten), fest = ['id', 'n', 'e', 'stat', 'zi', 'qm', 'gut', 't', 'd', 'mn', 'hg', 'verm'];
    var gleich = D && neu.objs.length === D.objs.length && neu.objs.every(function (o, i) { var a = D.objs[i]; return fest.every(function (k) { return String(o[k]) === String(a[k]); }) && String(o.pl) === String(a.pl) && o.im.length === a.im.length && o.im.every(function (b, j) { return b.src === a.im[j].src; }); });
    if (!gleich || !$('#res')) { var y = window.scrollY; starte(daten, opt); erst = false; window.scrollTo(0, y); return; }
    var aus = D.aus, a = akt, startNeu = neu.start !== STD.start; STD = neu; D = kopie(STD); D.aus = aus; akt = a;
    if (startNeu) { akt = D.objs.length > 1 && STD.start === 'paket' ? 'paket' : 0; galerie(); }
    tool(); zeichne();
  }
  window.KreAngebot = { starte: starte, aktualisiere: aktualisiere, zahl: zahl, stand: function () { return stand(); } };
})();
