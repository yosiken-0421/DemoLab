// End-to-end OCR benchmark: feeds synthetic receipts into the REAL app (index.html) through the
// high-resolution photo input, then scores extracted fields, line recall and overlay placement.
// Usage: node ocr-bench.mjs [--browser chromium|webkit] [--only id1,id2] [--out results.json] [--app path/to/index.html]
import { chromium, webkit } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServer } from './lib/server.mjs';
import { FIXTURES, CONTENTS } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]]] : a), []));
const browserType = args.browser === 'webkit' ? webkit : chromium;
const only = args.only ? String(args.only).split(',') : null;
const appPage = args.app || 'index.html';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-bench-'));

const norm = s => String(s || '').normalize('NFKC').replace(/\s+/g, '').replace(/[，]/g, ',');
function lev(a, b) {
  const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
// approximate substring match: best edit distance of `needle` against any window of `hay`
function fuzzyFind(needle, hay) {
  const m = needle.length, n = hay.length; if (!m) return 0;
  let prev = new Array(n + 1).fill(0), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) { cur[0] = i; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (needle[i - 1] === hay[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return Math.min(...prev) / m;
}

const { server, url } = await startServer();
const userDataDir = path.join(os.tmpdir(), `receipt-bench-profile-${args.browser || 'chromium'}`); // keeps the traineddata cache between runs
const context = await browserType.launchPersistentContext(userDataDir, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: args.browser === 'webkit' ? false : true, locale: 'ja-JP' });
const gen = await context.newPage();
await gen.goto(url + 'tests/lib/blank.html');
await gen.addScriptTag({ path: path.join(here, 'lib', 'fixture-gen.js') });
const page = await context.newPage();
page.on('pageerror', e => console.error('[pageerror]', e.message));
page.on('dialog', d => d.accept());
await page.goto(url + appPage);
if (args.cfg) await page.evaluate(c => Object.assign(window.__receiptNoteOCRConfig || {}, c), JSON.parse(String(args.cfg)));

const results = [];
for (const fx of FIXTURES) {
  if (only && !only.includes(fx.id)) continue;
  const spec = { ...fx, content: CONTENTS[fx.content] };
  const made = await gen.evaluate(s => window.ReceiptFixtureGen.makeReceipt(s), spec);
  const ext = made.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png';
  const file = path.join(tmp, `${fx.id}.${ext}`);
  fs.writeFileSync(file, Buffer.from(made.dataUrl.split(',')[1], 'base64'));
  if (args.keep) fs.copyFileSync(file, path.join(String(args.keep), `${fx.id}.${ext}`));

  const t0 = Date.now();
  await page.evaluate(() => { document.getElementById('scanStatus').textContent = ''; });
  await page.setInputFiles('#highResFile', file);
  await page.waitForFunction(() => /文字をカメラ上に表示|文字を認識できません|読み取りエラー|認識できる文字|再撮影/.test(document.getElementById('scanStatus').textContent) && !document.getElementById('scanNow').disabled, null, { timeout: 240000 });
  const ms = Date.now() - t0;
  const dom = await page.evaluate(() => {
    const stage = document.getElementById('cameraStage').getBoundingClientRect();
    const boxes = [...document.querySelectorAll('#ocrOverlay .ocr-box')].map(el => { const r = el.getBoundingClientRect(); return { text: el.dataset.text || el.title || el.textContent, x: r.left - stage.left, y: r.top - stage.top, w: r.width, h: r.height }; });
    return { stage: { w: stage.width, h: stage.height }, boxes, status: document.getElementById('scanStatus').textContent, raw: document.getElementById('rawText').textContent, canUse: !document.getElementById('scanUsePartial').hidden };
  });
  let form = null;
  if (dom.canUse) {
    await page.click('#scanUsePartial');
    form = await page.evaluate(() => ({ date: entryDate.value, store: entryStore.value, amount: entryAmount.value, rate: entryTaxRate.value, taxAmount: entryTaxAmount.value, notice: ocrNotice.textContent }));
    await page.evaluate(() => document.getElementById('editDialog').close());
  } else {
    await page.evaluate(() => document.getElementById('cameraDialog').close());
  }

  // ---- scoring ----
  const t = made.truth;
  const totalVisible = t.lines.filter(l => l.role === 'total-value').every(l => l.visible);
  const expAmount = totalVisible ? String(t.amount) : '';
  const field = {
    date: form ? form.date === t.date : false,
    store: form ? norm(form.store) === norm(t.store) : false,
    amount: form ? form.amount === expAmount : false,
    amountWrong: form ? (form.amount !== '' && form.amount !== String(t.amount)) : false, // a wrong number auto-filled = dangerous
    rate: form ? form.rate === t.rate : false,
  };
  const hay = norm(dom.raw);
  const visLines = t.lines.filter(l => l.visible);
  const lineRecall = visLines.filter(l => fuzzyFind(norm(l.text), hay) <= 0.2).length / Math.max(1, visLines.length);
  // overlay: map truth boxes (image px) into stage px with object-fit: contain
  const sc = Math.min(dom.stage.w / made.width, dom.stage.h / made.height), ox = (dom.stage.w - made.width * sc) / 2, oy = (dom.stage.h - made.height * sc) / 2;
  const tb = visLines.map(l => ({ text: norm(l.text), x0: ox + l.x0 * sc, y0: oy + l.y0 * sc, x1: ox + l.x1 * sc, y1: oy + l.y1 * sc }));
  let placed = 0, textOk = 0; const dy = [];
  for (const b of dom.boxes) {
    const cy = b.y + b.h / 2, bx = b.x;
    // the truth line whose text best matches this label among lines vertically near it
    let best = null, bestScore = Infinity;
    for (const l of tb) { const s = lev(norm(b.text), l.text) / Math.max(1, l.text.length); if (s < bestScore) { bestScore = s; best = l; } }
    if (!best) continue;
    const lh = best.y1 - best.y0, mid = (best.y0 + best.y1) / 2;
    dy.push(Math.abs(cy - mid) / Math.max(1, lh));
    if (Math.abs(cy - mid) <= Math.max(lh, 4) && bx >= best.x0 - Math.max(lh * 1.5, 6) && bx <= best.x1) placed++;
    if (bestScore <= 0.25) textOk++;
  }
  dy.sort((a, b) => a - b);
  const r = { id: fx.id, ms, form, field, lineRecall: +lineRecall.toFixed(3), overlay: { count: dom.boxes.length, placedRatio: dom.boxes.length ? +(placed / dom.boxes.length).toFixed(3) : 0, textOkRatio: dom.boxes.length ? +(textOk / dom.boxes.length).toFixed(3) : 0, medianDyPerLine: dy.length ? +dy[Math.floor(dy.length / 2)].toFixed(2) : null }, status: dom.status };
  results.push(r);
  console.log(`${fx.id.padEnd(18)} ${String(ms).padStart(6)}ms date:${field.date ? 'OK' : '--'} store:${field.store ? 'OK' : '--'} amount:${field.amount ? 'OK' : field.amountWrong ? 'WRONG' : '--'} rate:${field.rate ? 'OK' : '--'} lines:${(lineRecall * 100).toFixed(0)}% overlay:${r.overlay.count} placed:${(r.overlay.placedRatio * 100).toFixed(0)}% | ${form ? JSON.stringify({ d: form.date, s: form.store, a: form.amount, r: form.rate }) : 'no-form'}`);
}
const sum = k => results.filter(r => r.field[k]).length;
const summary = { browser: args.browser || 'chromium', app: appPage, cfg: args.cfg || null, n: results.length, date: sum('date'), store: sum('store'), amount: sum('amount'), amountWrong: sum('amountWrong'), rate: sum('rate'), meanLineRecall: +(results.reduce((a, r) => a + r.lineRecall, 0) / Math.max(1, results.length)).toFixed(3), meanPlaced: +(results.reduce((a, r) => a + r.overlay.placedRatio, 0) / Math.max(1, results.length)).toFixed(3), totalMs: results.reduce((a, r) => a + r.ms, 0) };
console.log('SUMMARY', JSON.stringify(summary));
if (args.out) fs.writeFileSync(String(args.out), JSON.stringify({ summary, results }, null, 2));
await context.close(); server.close();
fs.rmSync(tmp, { recursive: true, force: true });
