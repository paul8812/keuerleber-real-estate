/* Alle Unterlagen eines Interessenten zu EINER PDF zusammenfügen (läuft im Browser).
   PDFs werden seitenweise übernommen, Fotos/Scans als eigene A4-Seite eingefügt. */
const A4 = [595.28, 841.89];

/** Bild (auch WebP/HEIC, soweit der Browser es kann) in JPEG umwandeln */
async function alsJpeg(bytes, type) {
  const bmp = await createImageBitmap(new Blob([bytes], { type }));
  const s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  return new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))).arrayBuffer());
}

/** dateien: [{ name, bytes, type }] in gewünschter Reihenfolge → { bytes, fehler: [Dateinamen] } */
export async function sammelPdf(dateien, titel = 'Unterlagen') {
  const P = await import('./vendor/pdf-lib.esm.min.js');
  const doc = await P.PDFDocument.create(), font = await doc.embedFont(P.StandardFonts.Helvetica), fehler = [];
  doc.setTitle(titel); doc.setCreator('Norderfranken Vermietung');
  const hinweis = (name, text) => {
    const p = doc.addPage(A4);
    p.drawText(text, { x: 60, y: A4[1] - 100, size: 13, font });
    p.drawText(name.slice(0, 90), { x: 60, y: A4[1] - 122, size: 10, font, color: P.rgb(0.4, 0.4, 0.4) });
  };
  for (const { name, bytes, type } of dateien) {
    const ext = name.split('.').pop().toLowerCase();
    try {
      if (type === 'application/pdf' || ext === 'pdf') {
        const src = await P.PDFDocument.load(bytes, { ignoreEncryption: true });
        for (const s of await doc.copyPages(src, src.getPageIndices())) doc.addPage(s);
      } else if (type?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic'].includes(ext)) {
        const img = type === 'image/png' || ext === 'png' ? await doc.embedPng(bytes)
          : type === 'image/jpeg' || ext === 'jpg' || ext === 'jpeg' ? await doc.embedJpg(bytes).catch(async () => doc.embedJpg(await alsJpeg(bytes, type)))
            : await doc.embedJpg(await alsJpeg(bytes, type));
        const quer = img.width > img.height, [pw, ph] = quer ? [A4[1], A4[0]] : A4, m = 24;
        const s = Math.min((pw - 2 * m) / img.width, (ph - 2 * m) / img.height), w = img.width * s, h = img.height * s;
        doc.addPage([pw, ph]).drawImage(img, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
      } else { fehler.push(name); hinweis(name, 'Diese Datei kann nicht in die PDF eingefügt werden:'); }
    } catch { fehler.push(name); hinweis(name, 'Diese Datei konnte nicht eingefügt werden (beschädigt oder geschützt):'); }
  }
  return { bytes: await doc.save(), fehler };
}
