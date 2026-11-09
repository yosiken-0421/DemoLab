// End-to-end regression tests for receipt-note/index.html in a real browser (Playwright).
// Run: node --test e2e.test.mjs   (BROWSER=webkit to use the WebKit engine)
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';
import { startServer } from './lib/server.mjs';
import { unzipStored } from './lib/unzip.mjs';
import { writeY4M } from './lib/y4m.mjs';
import { FIXTURES, CONTENTS } from './lib/fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const engine = process.env.BROWSER === 'webkit' ? webkit : chromium;
const KEY = 'receipt-note-records-v1';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-e2e-'));
let srv, browser;

before(async () => { srv = await startServer(); browser = await engine.launch(); });
after(async () => { await browser?.close(); srv?.server.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

async function openApp(records, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ja-JP', acceptDownloads: true, ...opts });
  if (records) await context.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(records)]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => (page.__dialogs = [...(page.__dialogs || []), d.message()], d.accept()));
  await page.goto(srv.url + 'index.html');
  return { context, page, errors };
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), KEY);
const selectMonth = async (page, y, m) => { await page.selectOption('#yearSelect', String(y)); await page.selectOption('#monthSelect', String(m)); };
async function addEntry(page, { date, store, amount, category = 'その他' }) {
  await page.click('#newEntry');
  await page.fill('#entryDate', date); await page.fill('#entryStore', store); await page.fill('#entryAmount', String(amount));
  await page.selectOption('#entryCategory', category);
  await page.click('#saveEntry');
}
const listedStores = page => page.$$eval('#recordsList .receipt-store', els => els.map(e => e.textContent));

test('legacy v1 records (no order/taxRate/note fields) load, render and export without "undefined"', async () => {
  const legacy = [{ id: 'old-1', date: '2026-03-04', store: '旧形式の店', amount: 1200, category: '雑費' }];
  const { context, page, errors } = await openApp(legacy);
  await selectMonth(page, 2026, 3);
  assert.deepEqual(await listedStores(page), ['旧形式の店']);
  assert.equal(await page.textContent('#monthTotal'), '¥1,200');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportExcel')]);
  const files = unzipStored(new Uint8Array(fs.readFileSync(await dl.path())));
  assert.ok(files['xl/worksheets/sheet4.xml'].includes('旧形式の店'));
  assert.ok(!Object.values(files).some(x => x.includes('undefined')));
  assert.deepEqual((await stored(page))[0], legacy[0], 'stored data is not rewritten just by viewing');
  assert.deepEqual(errors, []);
  await context.close();
});

test('add / monthly grouping / edit across months / category / reorder / delete persist after reload', async () => {
  const { context, page, errors } = await openApp([]);
  await addEntry(page, { date: '2026-05-10', store: '五月の店A', amount: 1000, category: '消耗品費' });
  await addEntry(page, { date: '2026-05-12', store: '五月の店B', amount: 2000 });
  await addEntry(page, { date: '2026-06-01', store: '六月の店', amount: 300 });
  // a new receipt lands in its own month, and the view follows it
  assert.equal(await page.inputValue('#monthSelect'), '6');
  assert.deepEqual(await listedStores(page), ['六月の店']);
  await selectMonth(page, 2026, 5);
  assert.equal(await page.textContent('#monthTotal'), '¥3,000');
  assert.equal(await page.textContent('#annualTotal'), '¥3,300');
  // manual order: move B above A
  await page.selectOption('#sortSelect', 'custom');
  assert.deepEqual(await listedStores(page), ['五月の店A', '五月の店B']);
  await page.click('#recordsList article:nth-child(2) button[aria-label="1つ上に移動"]');
  assert.deepEqual(await listedStores(page), ['五月の店B', '五月の店A']);
  // edit: change category + amount, and move A from May to April
  await page.click('#recordsList button[aria-label="五月の店Aを編集"]');
  await page.fill('#entryDate', '2026-04-30'); await page.fill('#entryAmount', '1500'); await page.selectOption('#entryCategory', '会議費');
  await page.click('#saveEntry');
  assert.equal(await page.inputValue('#monthSelect'), '4');
  assert.deepEqual(await listedStores(page), ['五月の店A']);
  await page.reload();
  await page.selectOption('#sortSelect', 'custom');
  await selectMonth(page, 2026, 4);
  assert.deepEqual(await listedStores(page), ['五月の店A']);
  assert.match(await page.textContent('#recordsList .category-tag'), /会議費/);
  assert.equal(await page.textContent('#monthTotal'), '¥1,500');
  await selectMonth(page, 2026, 5);
  assert.deepEqual(await listedStores(page), ['五月の店B']);
  // Excel reflects edits: April has A (1500, 会議費), May has B, June has the June receipt
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exportExcel')]);
  const f = unzipStored(new Uint8Array(fs.readFileSync(await dl.path())));
  assert.equal(Object.keys(f).filter(n => n.startsWith('xl/worksheets/')).length, 13);
  assert.ok(f['xl/worksheets/sheet5.xml'].includes('五月の店A') && f['xl/worksheets/sheet5.xml'].includes('会議費') && f['xl/worksheets/sheet5.xml'].includes('<v>1500</v>'));
  assert.ok(f['xl/worksheets/sheet6.xml'].includes('五月の店B') && !f['xl/worksheets/sheet6.xml'].includes('五月の店A'));
  assert.ok(f['xl/worksheets/sheet7.xml'].includes('六月の店'));
  // delete
  await page.click('#recordsList button[aria-label="五月の店Bを削除"]');
  assert.equal((await stored(page)).length, 2);
  assert.deepEqual(errors, []);
  await context.close();
});

test('duplicate warning, JSON backup → restore, malformed and foreign JSON rejected without data loss', async () => {
  const { context, page } = await openApp([]);
  await addEntry(page, { date: '2026-07-01', store: '重複テスト', amount: 500 });
  await addEntry(page, { date: '2026-07-01', store: '重複テスト', amount: 500 });
  assert.ok((page.__dialogs || []).some(m => m.includes('重複')), 'duplicate confirm shown');
  await page.click('#openSettings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#backupJson')]);
  const backup = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  assert.equal(backup.app, 'receipt-note'); assert.equal(backup.records.length, 2);
  const before = await stored(page);
  const bad = path.join(tmp, 'bad.json'); fs.writeFileSync(bad, '{not json');
  await page.setInputFiles('#jsonFile', bad);
  await page.waitForTimeout(300);
  assert.deepEqual(await stored(page), before);
  const foreign = path.join(tmp, 'foreign.json'); fs.writeFileSync(foreign, JSON.stringify({ app: 'receipt-note', records: [{ id: 1, date: 'x', store: '<img onerror=alert(1)>', amount: -5 }] }));
  await page.setInputFiles('#jsonFile', foreign);
  await page.waitForTimeout(300);
  assert.deepEqual(await stored(page), before);
  assert.ok((page.__dialogs || []).filter(m => m.startsWith('読み込み失敗')).length >= 2);
  await page.click('#clearAll');
  assert.equal((await stored(page)).length, 0);
  const good = path.join(tmp, 'good.json'); fs.writeFileSync(good, JSON.stringify(backup));
  await page.click('#openSettings');
  await page.setInputFiles('#jsonFile', good);
  await page.waitForFunction(k => JSON.parse(localStorage.getItem(k) || '[]').length === 2, KEY);
  assert.deepEqual(await stored(page), backup.records);
  await context.close();
});

test('camera permission denied: helpful message, no crash, retry button works', async () => {
  const { context, page, errors } = await openApp([]);
  await page.evaluate(() => { const deny = () => Promise.reject(new DOMException('denied', 'NotAllowedError')); if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = deny; else Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: deny }, configurable: true }); });
  await page.click('#cameraLaunch');
  await page.waitForFunction(() => /許可/.test(document.getElementById('scanStatus').textContent));
  await page.click('#scanNow'); // retry path calls getUserMedia again instead of silently doing nothing
  await page.waitForFunction(() => /許可/.test(document.getElementById('scanStatus').textContent));
  assert.equal(await page.isEnabled('#highResCapture'), true);
  assert.deepEqual(errors, []);
  await context.close();
});

test('OCR library unreachable (offline/CDN failure): error shown and buttons usable again', async () => {
  const { context, page } = await openApp([]);
  await page.route(/cdn\.jsdelivr\.net/, r => r.abort());
  const img = path.join(tmp, 'blank.png');
  const gen = await context.newPage(); await gen.goto(srv.url + 'tests/lib/blank.html');
  const data = await gen.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 300); return c.toDataURL(); });
  fs.writeFileSync(img, Buffer.from(data.split(',')[1], 'base64'));
  await page.setInputFiles('#highResFile', img);
  await page.waitForFunction(() => /エラー/.test(document.getElementById('scanStatus').textContent));
  assert.equal(await page.isEnabled('#scanNow'), true);
  assert.equal(await page.isHidden('#scanUsePartial'), true, 'no candidate offered when nothing was read');
  await context.close();
});

test('blank photo: no fabricated values, explicit "nothing found" message', async () => {
  const { context, page } = await openApp([]);
  const img = path.join(tmp, 'blank2.png');
  const gen = await context.newPage(); await gen.goto(srv.url + 'tests/lib/blank.html');
  const data = await gen.evaluate(() => { const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const x = c.getContext('2d'); x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 900, 1200); return c.toDataURL(); });
  fs.writeFileSync(img, Buffer.from(data.split(',')[1], 'base64'));
  await page.setInputFiles('#highResFile', img);
  await page.waitForFunction(() => /認識できません|表示しました/.test(document.getElementById('scanStatus').textContent) && !document.getElementById('scanNow').disabled, null, { timeout: 180000 });
  assert.equal(await page.isHidden('#scanUsePartial'), true);
  assert.match(await page.textContent('#ocrBadge'), /検出できませんでした/);
  assert.equal((await stored(page)).length, 0);
  await context.close();
});

test('video camera path (fake camera): OCR, overlay aligned to image after resize, images never uploaded, camera stops on close', async (t0) => {
  // Build a fictional receipt frame and feed it as the camera.
  const fx = FIXTURES.find(f => f.id === 'clean-24px');
  const genCtx = await browser.newContext(); const gen = await genCtx.newPage();
  await gen.goto(srv.url + 'tests/lib/blank.html'); await gen.addScriptTag({ path: path.join(here, 'lib', 'fixture-gen.js') });
  const made = await gen.evaluate(async s => { const m = window.ReceiptFixtureGen.makeReceipt(s); const img = new Image(); img.src = m.dataUrl; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, img.width, img.height).data; let str = ''; for (let i = 0; i < d.length; i += 0x8000) str += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000)); return { w: img.width, h: img.height, b64: btoa(str), truth: m.truth }; }, { ...fx, content: CONTENTS[fx.content] });
  await genCtx.close();
  if (engine !== chromium) { t0.skip('fake camera files are a Chromium-only feature'); return; }
  const y4m = path.join(tmp, 'cam.y4m'); writeY4M(y4m, Buffer.from(made.b64, 'base64'), made.w, made.h);
  const camBrowser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${y4m}`] });
  const context = await camBrowser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['camera'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const requests = []; page.on('request', r => requests.push({ url: r.url(), method: r.method() }));
  await page.addInitScript(() => { const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); window.__tracks = []; navigator.mediaDevices.getUserMedia = async c => { const s = await orig(c); window.__tracks.push(...s.getTracks()); return s; }; });
  await page.goto(srv.url + 'index.html');
  await page.click('#cameraLaunch');
  await page.waitForFunction(() => /映像 \d+×\d+/.test(document.getElementById('scanStatus').textContent), null, { timeout: 30000 });
  await page.click('#scanNow');
  await page.waitForFunction(() => /文字をカメラ上に表示|認識できません|エラー/.test(document.getElementById('scanStatus').textContent) && !document.getElementById('scanNow').disabled, null, { timeout: 240000 });
  const boxes = await page.$$eval('#ocrOverlay .ocr-box', els => els.length);
  assert.ok(boxes >= 10, `overlay boxes: ${boxes}`);
  // geometry: frame == object-fit:contain rect of the stage; boxes keep their place relative to the image after a resize
  const geo = () => page.evaluate(() => { const s = cameraStage.getBoundingClientRect(), f = ocrFrame.getBoundingClientRect(), b = [...document.querySelectorAll('#ocrOverlay .ocr-box')].slice(0, 8).map(e => { const r = e.getBoundingClientRect(); return [(r.left + r.width / 2 - f.left) / f.width, (r.top + r.height / 2 - f.top) / f.height]; }); return { s: [s.width, s.height], f: [f.left - s.left, f.top - s.top, f.width, f.height], b }; });
  const g1 = await geo();
  const k = Math.min(g1.s[0] / made.w, g1.s[1] / made.h);
  assert.ok(Math.abs(g1.f[2] - made.w * k) < 1.5 && Math.abs(g1.f[3] - made.h * k) < 1.5, 'frame uses contain size');
  assert.ok(Math.abs(g1.f[0] - (g1.s[0] - made.w * k) / 2) < 1.5 && Math.abs(g1.f[1] - (g1.s[1] - made.h * k) / 2) < 1.5, 'frame centred');
  // the store-name box must sit on the store-name line drawn in the fixture
  const store = await page.evaluate(() => { const f = ocrFrame.getBoundingClientRect(); const e = [...document.querySelectorAll('#ocrOverlay .ocr-box')].find(x => /珈琲/.test(x.dataset.text)); if (!e) return null; const r = e.getBoundingClientRect(); return { cx: (r.left + r.width / 2 - f.left) / f.width, cy: (r.top + r.height / 2 - f.top) / f.height }; });
  const t = made.truth.lines.find(l => l.role === 'store');
  assert.ok(store, 'store line recognised');
  assert.ok(Math.abs(store.cy - (t.y0 + t.y1) / 2 / made.h) < 0.01 && Math.abs(store.cx - (t.x0 + t.x1) / 2 / made.w) < 0.03, `store box at ${JSON.stringify(store)}`);
  await page.setViewportSize({ width: 430, height: 700 });
  await page.waitForTimeout(300);
  const g2 = await geo();
  g1.b.forEach((p, i) => assert.ok(Math.abs(p[0] - g2.b[i][0]) < 0.004 && Math.abs(p[1] - g2.b[i][1]) < 0.004, 'box stays on the same image point after resize'));
  // text toggle hides labels but keeps outlines
  await page.click('#ocrTextToggle');
  assert.equal(await page.$eval('#cameraStage', e => e.classList.contains('ocr-text-hidden')), true);
  // confirmation form
  await page.click('#scanUsePartial');
  assert.equal(await page.inputValue('#entryDate'), '2026-09-30');
  assert.equal(await page.inputValue('#entryAmount'), '1140');
  assert.equal(await page.isVisible('#ocrNotice'), true);
  // camera stopped once the dialog closed; nothing was uploaded
  assert.equal(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended')), true);
  const foreign = requests.filter(r => !r.url.startsWith(srv.url) && !r.url.startsWith('https://cdn.jsdelivr.net/') && !r.url.startsWith('data:') && !r.url.startsWith('blob:'));
  assert.deepEqual(foreign, []);
  assert.deepEqual(requests.filter(r => r.method !== 'GET'), []);
  assert.deepEqual(errors, []);
  await camBrowser.close();
});
