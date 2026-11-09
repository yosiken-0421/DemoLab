// Unit tests for the pure modules inside index.html (run: node --test unit.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './lib/load-app.mjs';
import { unzipStored } from './lib/unzip.mjs';

const { ReceiptOCR: O, ReceiptExcel } = loadModules();
const plain = x => JSON.parse(JSON.stringify(x)); // values from the VM realm
const TODAY = new Date(2026, 10, 9); // 2026-11-09

test('normalizeLine: CJK spacing, yen misreads, broken digit groups', () => {
  assert.equal(O.normalizeLine('合 計   ¥1, 053'), '合計 ¥1,053');
  assert.equal(O.normalizeLine('お 預 り \\2,000'), 'お預り ¥2,000');
  assert.equal(O.normalizeLine('付箋 75mm %418'), '付箋 75mm ¥418');
  assert.equal(O.normalizeLine('(10%対象 ¥913)'), '(10%対象 ¥913)'); // real percent untouched
  assert.equal(O.normalizeLine('ＴＥＬ　０００'), 'TEL 000');
  assert.equal(O.normalizeLine('小計 ¥1,O53'), '小計 ¥1,053');
});

test('moneyValues: skips percentages, counts, times, phone numbers, model numbers, units', () => {
  const v = s => plain(O.moneyValues(O.normalizeLine(s)).map(x => x.value));
  assert.deepEqual(v('(10%対象 ¥913)'), [913]);
  assert.deepEqual(v('TEL 000-123-4567'), []);
  assert.deepEqual(v('12:34'), []);
  assert.deepEqual(v('ノート A5 ¥330'), [330]);
  assert.deepEqual(v('お茶 500ml ¥140'), [140]);
  assert.deepEqual(v('ボールペン 3本 ¥495'), [495]);
  assert.deepEqual(v('合計 Z, 937'), []); // fragment, not a price
  assert.deepEqual(v('登録番号 T1234567890123'), []);
});

test('parseDate: Western, slash, dash, Reiwa, two-digit year; rejects impossible and future dates', () => {
  assert.equal(O.parseDate('2026年10月14日(水) 12:34', TODAY), '2026-10-14');
  assert.equal(O.parseDate('2026/09/30 18:05', TODAY), '2026-09-30');
  assert.equal(O.parseDate('2026 年 10 月 14 日 ( 水 )', TODAY), '2026-10-14');
  assert.equal(O.parseDate('2026-08-07 09:41', TODAY), '2026-08-07');
  assert.equal(O.parseDate('令和8年11月2日 10:20', TODAY), '2026-11-02');
  assert.equal(O.parseDate('R8.11.02', TODAY), '2026-11-02');
  assert.equal(O.parseDate('26/10/14 12:00', TODAY), '2026-10-14');
  assert.equal(O.parseDate('2026/02/30', TODAY), null);
  assert.equal(O.parseDate('2027/01/05', TODAY), null); // future
  assert.equal(O.parseDate('TEL 000-123-4567', TODAY), null);
});

const RECEIPT = `みどり文具店 本町店
架空県みどり市本町1-2-3
TEL 000-123-4567
2026年10月14日(水) 12:34
ノート A5 ¥330
お茶 500ml ※ ¥140
小計 ¥1,053
(10%対象 ¥913)
(内消費税等 ¥83)
(8%対象 ¥140)
(内消費税等 ¥10)
合 計 ¥1, 053
お預り ¥2,000
お釣り ¥947`;

test('extractReceipt: fields from a typical receipt, tax rate % never taken as a price', () => {
  const r = O.extractReceipt(RECEIPT, { today: TODAY });
  assert.equal(r.date, '2026-10-14');
  assert.equal(r.store, 'みどり文具店本町店'); // OCR spaces between CJK chars are removed
  assert.equal(r.amount, 1053);
  assert.equal(r.rate, 'mixed');
  assert.equal(r.taxAmount, 93);
});

test('extractReceipt: point counts and labels without amounts are not totals', () => {
  assert.equal(O.extractReceipt('お買上点数 3点\n合計点数 3', { today: TODAY }).amount, null);
  assert.equal(O.extractReceipt('合計 4', { today: TODAY }).amount, null); // single-digit total without cross-check
  assert.equal(O.extractReceipt('お買上計 ¥4,006', { today: TODAY }).amount, 4006);
  assert.equal(O.extractReceipt('税率 10%\n合計\n¥1,100', { today: TODAY }).amount, 1100); // value on next line
});

test('combinePasses: verified total wins; conflicting unverified totals stay blank with candidates', () => {
  const p = t => ({ parsed: O.parsePass(t, { today: TODAY }) });
  const verified = O.combinePasses([p('合計 ¥1,053\nお預り ¥2,000\nお釣り ¥947'), p('合計 ¥1,058')]);
  assert.equal(verified.amount, 1053);
  assert.equal(verified.status.amount, 'verified');
  const conflict = O.combinePasses([p('合計 ¥1,053'), p('合計 ¥1,058')]);
  assert.equal(conflict.amount, null);
  assert.equal(conflict.status.amount, 'conflict');
  assert.deepEqual(plain(conflict.amountCandidates.map(c => c.value).sort()), [1053, 1058]);
});

test('combinePasses: cash paid agreeing with subtotal/tax targets overrides a misread total (regression: 937 vs 2,937)', () => {
  const p = t => ({ parsed: O.parsePass(t, { today: TODAY }) });
  const r = O.combinePasses([p('小計 ¥2,937\n(10%対象 ¥2,689)\n(8%対象 ¥248)\nお預り ¥3,000\nお釣り ¥63'), p('合計 ¥937\nお預り ¥3,000\nお釣り ¥63')]);
  assert.equal(r.amount, 2937);
  assert.equal(r.status.amount, 'verified');
  assert.ok(r.amountCandidates[0].why.includes('お預り−お釣り'));
});

test('combinePasses: arithmetic without cash paid does not auto-fill, and a backed total is not overridden', () => {
  const p = t => ({ parsed: O.parsePass(t, { today: TODAY }) });
  const noCash = O.combinePasses([p('小計 ¥2,937\n(10%対象 ¥2,689)\n(8%対象 ¥248)'), p('合計 ¥937')]);
  assert.equal(noCash.amount, null);
  assert.equal(noCash.status.amount, 'conflict');
  // discount after subtotal: cash paid 900 = total 900 (backed), subtotal 1,000 differs -> 900
  const disc = O.combinePasses([p('小計 ¥1,000\n値引 -¥100\n合計 ¥900\nお預り ¥1,000\nお釣り ¥100')]);
  assert.equal(disc.amount, 900);
});

test('parsePass: large-print amount without a readable label counts only with arithmetic evidence', () => {
  const lines = [{ text: '小計 ¥2,937', h: 20 }, { text: '生計 ¥2,937', h: 44, big: true }, { text: 'お預り ¥3,000', h: 20 }, { text: 'お釣り ¥63', h: 20 }];
  const r = O.combinePasses([{ parsed: O.parsePass(lines, { today: TODAY }) }]);
  assert.equal(r.amount, 2937);
  const lone = O.combinePasses([{ parsed: O.parsePass([{ text: 'XY ¥5,555', h: 44, big: true }], { today: TODAY }) }]);
  assert.equal(lone.amount, null);
});

test('estimateLineHeight: finds the character height of printed rows', () => {
  const w = 200, h = 300, g = new Float32Array(w * h).fill(240);
  for (let row = 0; row < 10; row++) for (let y = 20 + row * 25; y < 20 + row * 25 + 12; y++) for (let x = 20; x < 180; x++) if ((x >> 2) % 2) g[y * w + x] = 30;
  const r = O.estimateLineHeight(g, w, h, null, 0);
  assert.ok(r && Math.abs(r.h - 12) <= 1, JSON.stringify(r));
  assert.equal(O.estimateLineHeight(new Float32Array(w * h).fill(200), w, h, null, 0), null);
});

test('groupRows + pickKeyRows: label/price segments form one row; total, date, large rows are selected', () => {
  const B = (text, cx, cy, h = 20, w = 80) => ({ text, cx, cy, w, h });
  const rows = O.groupRows([B('ひかり薬局', 200, 30, 44, 200), B('2026-08-07 09:41', 120, 90), B('マスク', 60, 130), B('¥698', 330, 131), B('目薬', 60, 160), B('¥1,078', 330, 160),
    B('小計', 60, 200), B('¥2,937', 330, 201), B('生計', 60, 250, 44), B('¥2,937', 330, 250, 44), B('お預り', 60, 300), B('¥3,000', 330, 300), B('ありがとう', 200, 340)], 0);
  assert.equal(rows.length, 8);
  assert.equal(rows[2].segs.length, 2);
  const keys = O.pickKeyRows(rows).map(r => r.text);
  for (const t of ['ひかり薬局', '2026-08-07 09:41', '小計 ¥2,937', '生計 ¥2,937', 'お預り ¥3,000']) assert.ok(keys.includes(t), t + ' in ' + keys);
  assert.ok(!keys.includes('目薬 ¥1,078'));
});

test('planDetail: large print is reduced toward the target character height', () => {
  const lines = Array.from({ length: 8 }, (_, i) => ({ text: '合計 ¥1,000', conf: 90, bbox: { x0: 100, y0: 100 + i * 150, x1: 900, y1: 196 + i * 150 }, slope: 0 }));
  const plan = O.planDetail(lines, { cx: 1500, cy: 2000, angle: 0, scale: 1, cw: 3000, ch: 4000 }, { width: 3000, height: 4000 }, O.DEFAULTS, null);
  assert.ok(plan.scale < 0.5 && plan.scale >= O.DEFAULTS.minScale, String(plan.scale));
});

test('combinePasses: date conflict is left blank', () => {
  const p = t => ({ parsed: O.parsePass(t, { today: TODAY }) });
  const r = O.combinePasses([p('2026/10/14'), p('2026/10/11')]);
  assert.equal(r.date, '');
  assert.equal(r.status.date, 'conflict');
});

test('store: prefers the tallest heading line when line heights are known; skips address/phone', () => {
  const r = O.parsePass([{ text: 'いらっしゃいませ', h: 20 }, { text: '架空県みどり市本町1-2-3', h: 20 }, { text: 'サンプル珈琲 駅前店', h: 34 }, { text: 'TEL 000-1', h: 20 }]);
  assert.equal(r.store, 'サンプル珈琲駅前店');
});

test('geometry: mapPoint inverts the view transform (rotation + crop + scale)', () => {
  const region = { cx: 500, cy: 700, angle: 0.15, scale: 2.5, cw: 800, ch: 600 };
  // forward transform used by makeView: p = c' + s·R(-a)(src − C)
  const fwd = (x, y) => { const dx = x - region.cx, dy = y - region.cy, c = Math.cos(-region.angle), s = Math.sin(-region.angle); return { x: region.cw / 2 + region.scale * (dx * c - dy * s), y: region.ch / 2 + region.scale * (dx * s + dy * c) }; };
  for (const [x, y] of [[500, 700], [380, 650], [620, 760]]) {
    const p = fwd(x, y), back = O.mapPoint(region, p.x, p.y);
    assert.ok(Math.abs(back.x - x) < 1e-9 && Math.abs(back.y - y) < 1e-9);
  }
  const b = O.mapBox({ cx: 50, cy: 50, angle: 0, scale: 2, cw: 200, ch: 200 }, { x0: 100, y0: 100, x1: 140, y1: 120 });
  assert.deepEqual([b.cx, b.cy, b.w, b.h], [60, 55, 20, 10]);
});

test('geometry: containRect matches CSS object-fit: contain', () => {
  const c = O.containRect(1440, 1920, 370, 524), near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
  near(c.k, 370 / 1440); near(c.x, 0); near(c.y, (524 - 1920 * 370 / 1440) / 2); near(c.w, 370); near(c.h, 1920 * 370 / 1440);
  const r = O.containRect(1920, 1440, 370, 524);
  assert.equal(r.x, 0); assert.ok(r.y > 0);
});

test('linesFromData: Tesseract.js 5 lines, blocks-only and tsv-only results; wide gaps split segments', () => {
  const line = { text: '合計 ¥1,053\n', confidence: 90, bbox: { x0: 10, y0: 100, x1: 400, y1: 130 }, baseline: { x0: 10, y0: 128, x1: 400, y1: 128 },
    words: [{ text: '合計', confidence: 92, bbox: { x0: 10, y0: 100, x1: 70, y1: 130 } }, { text: '¥1,053', confidence: 88, bbox: { x0: 300, y0: 100, x1: 400, y1: 130 } }] };
  const a = O.linesFromData({ lines: [line] });
  assert.equal(a.length, 1);
  assert.deepEqual(plain(a[0].segments.map(s => s.text)), ['合計', '¥1,053']);
  assert.equal(a[0].slope, 0);
  const b = O.linesFromData({ lines: [], blocks: [{ paragraphs: [{ lines: [line] }] }] });
  assert.equal(b.length, 1);
  const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t10\t100\t60\t30\t92\t合計\n5\t1\t1\t1\t1\t2\t300\t100\t100\t30\t88\t¥1,053';
  const c = O.linesFromData({ tsv });
  assert.equal(c.length, 1);
  assert.deepEqual(plain(c[0].bbox), { x0: 10, y0: 100, x1: 400, y1: 130 });
  assert.equal(O.linesFromData({}).length, 0);
});

test('planDetail: tiles cover the text area contiguously, respect pixel budget and upscale small print', () => {
  const cfg = { ...O.DEFAULTS };
  const lines = Array.from({ length: 30 }, (_, i) => ({ text: '行テキスト' + i, conf: 80, slope: 0, bbox: { x0: 400, y0: 300 + i * 40, x1: 1000, y1: 312 + i * 40 } }));
  const region = { cx: 720, cy: 960, angle: 0, scale: 1, cw: 1440, ch: 1920 };
  const plan = O.planDetail(lines, region, { width: 1440, height: 1920 }, cfg, null);
  assert.ok(plan.scale > 2.5, 'small text (12px) should be enlarged');
  for (const t of plan.tiles) assert.ok(t.cropW * t.cropH * t.scale * t.scale <= cfg.tileBudget * 1.01);
  assert.ok(plan.tiles.length <= cfg.maxTiles);
  // core ranges must chain without gaps
  let prevBottom = null;
  for (const t of plan.tiles) {
    const top = t.cy - t.cropH / 2 + t.coreTop, bottom = t.cy - t.cropH / 2 + t.coreBottom;
    if (prevBottom !== null) assert.ok(Math.abs(top - prevBottom) < 1e-6);
    prevBottom = bottom;
  }
  const few = O.planDetail([], region, { width: 1440, height: 1920 }, cfg, null);
  assert.equal(few.kind, 'whole');
});

test('estimateSkew: recovers the angle of synthetic text rows', () => {
  const w = 400, h = 400;
  for (const deg of [-9, 0, 4]) {
    const g = new Float32Array(w * h).fill(240), a = deg * Math.PI / 180;
    for (let row = 0; row < 14; row++) for (let x = 40; x < 360; x++) for (let t = 0; t < 4; t++) {
      if ((x >> 3) % 3 === 0) continue; // word gaps
      const y = Math.round(60 + row * 20 + t + (x - 200) * Math.tan(a));
      if (y >= 0 && y < h) g[y * w + x] = 30;
    }
    const est = O.estimateSkew(g, w, h, null) * 180 / Math.PI;
    assert.ok(Math.abs(est - deg) <= 0.6, `expected ${deg}, got ${est}`);
  }
});

test('paperRect: finds a bright receipt on a dark table, null when paper fills the frame', () => {
  const gw = 40, gh = 60, g = new Float32Array(gw * gh).fill(80);
  for (let y = 10; y < 50; y++) for (let x = 12; x < 28; x++) g[y * gw + x] = 245;
  assert.deepEqual(plain(O.paperRect(g, gw, gh)), { x0: 12, y0: 10, x1: 28, y1: 50 });
  assert.equal(O.paperRect(new Float32Array(gw * gh).fill(245), gw, gh), null);
});

test('Excel: 13 sheets (annual + 12 months), month grouping, totals and custom order', async () => {
  const rows = [
    { id: 'a', date: '2026-01-05', store: '店A', amount: 1000, category: '消耗品費', taxRate: '10', taxAmount: 90, note: '', order: 3 },
    { id: 'b', date: '2026-01-20', store: '店B', amount: 500, category: '会議費', taxRate: '8', taxAmount: '', note: 'メモ<&>', order: 1 },
    { id: 'c', date: '2026-12-31', store: '店C', amount: 250, category: '雑費', taxRate: 'mixed', taxAmount: '', note: '', order: 2 },
    { id: 'd', date: '2025-12-31', store: '昨年', amount: 9999, category: '雑費', taxRate: '', taxAmount: '', note: '', order: 4 },
  ];
  const blob = ReceiptExcel.buildExcel(2026, rows, ['消耗品費', '会議費', '雑費'], 'custom');
  const files = unzipStored(new Uint8Array(await blob.arrayBuffer()));
  const wb = files['xl/workbook.xml'];
  const names = [...wb.matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(names, ['年間集計', ...Array.from({ length: 12 }, (_, i) => `${i + 1}月`)]);
  for (let i = 1; i <= 13; i++) assert.ok(files[`xl/worksheets/sheet${i}.xml`], `sheet${i}`);
  const jan = files['xl/worksheets/sheet2.xml'];
  assert.ok(jan.indexOf('店B') < jan.indexOf('店A'), 'custom order is kept (order 1 before 3)');
  assert.match(jan, /<f>SUM\(E6:E7\)<\/f><v>1500<\/v>/);
  assert.match(jan, /メモ&lt;&amp;&gt;/);
  assert.ok(files['xl/worksheets/sheet13.xml'].includes('店C'));
  assert.ok(!Object.values(files).some(x => x.includes('昨年')), 'other years excluded');
  assert.match(files['xl/worksheets/sheet1.xml'], /<f>SUM\(B6:B17\)<\/f><v>1750<\/v>/);
});

test('combinePasses: on a mixed-rate receipt one rate target alone is not evidence for the total', () => {
  const p = t => ({ parsed: O.parsePass(t, { today: TODAY }) });
  const r = O.combinePasses([p('お茶 ¥140\n小計 ¥1,053\n10%対象 ¥913\n8%対象 ¥140\nお預り ¥2,000\nお釣り ¥947'), p('合計 ¥140\n8%対象 ¥140')]);
  assert.equal(r.amount, 1053);
  assert.ok(!r.amountCandidates.find(c => c.value === 140)?.why.length);
});

test('combinePasses: tax figures confirm the rate when the rate label is misread', () => {
  const p = t => ({ parsed: O.parsePass(t, { today: TODAY }) });
  // "10%対象" read as "0% 対象"; 内消費税 83 = floor(913×10/110), 10 = floor(140×8/108)
  const r = O.combinePasses([p('0% 対象 ¥913\n内消費税等 ¥83\n8対象 ¥140\n内消費税等 ¥10\n合計 ¥1,053\nお預り ¥2,000\nお釣り ¥947')]);
  assert.equal(r.rate, 'mixed');
  const only10 = O.combinePasses([p('合計 ¥1,100\n内消費税 ¥100')]);
  assert.equal(only10.rate, '10');
});
