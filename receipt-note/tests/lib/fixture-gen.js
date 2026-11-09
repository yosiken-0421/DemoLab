// Synthetic (fictional) Japanese receipt generator, executed inside a test browser page.
// No real receipt or personal data is used. Output: image data URL + ground truth (fields and line boxes in image pixels).
/* global window, document */
(function () {
  'use strict';
  const yen = n => '¥' + n.toLocaleString('ja-JP');

  function receiptLines(v) {
    // v: content variant
    const L = [];
    L.push({ text: v.store, size: 1.7, bold: true, align: 'center', role: 'store' });
    L.push({ text: v.address, size: 1, align: 'center' });
    L.push({ text: 'TEL ' + v.tel, size: 1, align: 'center' });
    L.push({ text: '登録番号 T' + v.reg, size: 1, align: 'center' });
    L.push({ text: v.dateText, size: 1, align: 'left', role: 'date' });
    L.push({ text: '領収書', size: 1.3, bold: true, align: 'center' });
    for (const it of v.items) L.push({ text: it.name + (it.reduced ? ' ※' : ''), right: yen(it.price), size: 1, align: 'left' });
    L.push({ text: '小計', right: yen(v.total), size: 1, align: 'left' });
    if (v.t10) L.push({ text: '(10%対象', right: yen(v.t10) + ')', size: 1, align: 'left' });
    if (v.t10) L.push({ text: '(内消費税等', right: yen(v.tax10) + ')', size: 1, align: 'left' });
    if (v.t8) L.push({ text: '(8%対象', right: yen(v.t8) + ')', size: 1, align: 'left' });
    if (v.t8) L.push({ text: '(内消費税等', right: yen(v.tax8) + ')', size: 1, align: 'left' });
    L.push({ text: v.totalLabel || '合計', right: yen(v.total), size: v.totalSize || 1.4, bold: true, align: 'left', role: 'total' });
    L.push({ text: 'お預り', right: yen(v.paid), size: 1, align: 'left' });
    L.push({ text: 'お釣り', right: yen(v.paid - v.total), size: 1, align: 'left' });
    for (let i = 0; i < (v.extraLines || 0); i++) L.push({ text: 'ポイント対象外商品があります No.' + (1000 + i), size: 1, align: 'left' });
    L.push({ text: 'ご来店ありがとうございました', size: 1, align: 'center' });
    return L;
  }

  // Render one receipt (paper) at a given body font size (px), then place it into a photo-like frame.
  function makeReceipt(spec) {
    const v = spec.content;
    const font = spec.font || '"BIZ UDGothic","MS Gothic","Yu Gothic",sans-serif';
    const body = spec.bodyPx; // body text glyph size in paper pixels
    const paperW = Math.round(body * (spec.cols || 24));
    const lineGap = body * 0.62;
    const lines = receiptLines(v);
    const pad = body * 1.2;
    let y = pad;
    const laid = [];
    for (const ln of lines) {
      const px = body * ln.size;
      laid.push({ ...ln, px, y });
      y += px + lineGap;
    }
    const paperH = Math.round(y + pad);
    const paper = document.createElement('canvas');
    paper.width = paperW; paper.height = paperH;
    const p = paper.getContext('2d');
    p.fillStyle = spec.paperColor || '#fbfbf7'; p.fillRect(0, 0, paperW, paperH);
    p.fillStyle = spec.inkColor || '#1a1a1a'; p.textBaseline = 'top';
    const truthLines = [];
    for (const ln of laid) {
      p.font = `${ln.bold ? 'bold ' : ''}${ln.px}px ${font}`;
      const w = p.measureText(ln.text).width;
      let x = ln.align === 'center' ? (paperW - w) / 2 : pad;
      p.fillText(ln.text, x, ln.y);
      truthLines.push({ text: ln.text, role: ln.role || '', x0: x, y0: ln.y, x1: x + w, y1: ln.y + ln.px });
      if (ln.right) {
        const rw = p.measureText(ln.right).width, rx = paperW - pad - rw;
        p.fillText(ln.right, rx, ln.y);
        truthLines.push({ text: ln.right, role: ln.role ? ln.role + '-value' : '', x0: rx, y0: ln.y, x1: rx + rw, y1: ln.y + ln.px });
      }
    }
    // Place into frame
    const W = spec.frameW, H = spec.frameH;
    const frame = document.createElement('canvas'); frame.width = W; frame.height = H;
    const f = frame.getContext('2d');
    f.fillStyle = spec.tableColor || '#6b5a4a'; f.fillRect(0, 0, W, H);
    const scale = spec.paperScale || 1; // usually 1 (bodyPx already in frame pixels)
    const cx = W * (spec.cx ?? 0.5), cy = H * (spec.cy ?? 0.5);
    const ang = (spec.rotateDeg || 0) * Math.PI / 180;
    f.save();
    if (spec.blur) f.filter = `blur(${spec.blur}px)`;
    f.translate(cx, cy); f.rotate(ang); f.scale(scale, scale);
    f.shadowColor = 'rgba(0,0,0,.35)'; f.shadowBlur = 12;
    f.drawImage(paper, -paperW / 2, -paperH / 2);
    f.restore();
    const tx = (x, y) => { // paper coords -> frame coords
      const dx = (x - paperW / 2) * scale, dy = (y - paperH / 2) * scale;
      return [cx + dx * Math.cos(ang) - dy * Math.sin(ang), cy + dx * Math.sin(ang) + dy * Math.cos(ang)];
    };
    const boxes = truthLines.map(t => {
      const pts = [tx(t.x0, t.y0), tx(t.x1, t.y0), tx(t.x0, t.y1), tx(t.x1, t.y1)];
      const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
      return { text: t.text, role: t.role, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    });
    // Photometric degradations
    const img = f.getImageData(0, 0, W, H), d = img.data;
    const bright = spec.brightness ?? 1, contrast = spec.contrast ?? 1, noise = spec.noise || 0, shade = spec.shade || 0;
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let yy = 0; yy < H; yy++) {
      const g = 1 - shade * (yy / H); // vertical lighting gradient (shadow toward bottom)
      for (let xx = 0; xx < W; xx++) {
        const i = (yy * W + xx) * 4;
        const lx = 1 - shade * 0.6 * (xx / W);
        for (let c = 0; c < 3; c++) {
          let val = ((d[i + c] - 128) * contrast + 128) * bright * g * lx;
          if (noise) val += (rnd() - 0.5) * noise * 2;
          d[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
    }
    f.putImageData(img, 0, 0);
    const type = spec.jpeg ? 'image/jpeg' : 'image/png';
    const dataUrl = frame.toDataURL(type, spec.jpeg || undefined);
    const inFrame = b => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= W && b.y1 <= H;
    return {
      dataUrl, width: W, height: H,
      truth: { date: v.dateIso, store: v.store, amount: v.total, rate: v.rate, taxAmount: v.taxTotal, lines: boxes.map(b => ({ ...b, visible: inFrame(b) })) }
    };
  }
  window.ReceiptFixtureGen = { makeReceipt };
})();
