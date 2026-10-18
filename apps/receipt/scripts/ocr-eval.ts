/**
 * 実物のレシート写真で OCR の精度を測るスクリプト（開発用）。
 *
 * 使い方:
 *   1. フォルダにレシート写真（.jpg/.jpeg/.png）と、正解を書いた truth.json を置く
 *      truth.json の例:
 *        { "IMG_0001.jpg": { "date": "2026-10-05", "vendor": "ファミリーストア", "total": "500",
 *                            "regNo": "T1234567890123", "amount10": "220", "tax10": "20", "amount8": "280", "tax8": "20" } }
 *      （分からない項目は書かなくてよい。書いた項目だけ採点する）
 *   2. ANTHROPIC_API_KEY=... npx tsx apps/receipt/scripts/ocr-eval.ts <フォルダ>
 *      キーが無ければ Tesseract（Web版の端末内OCR）だけで測る。
 *   3. <フォルダ>/ocr-eval-result.xlsx に、写真ごと・項目ごとの結果と正解率が出る。
 *
 * ※ スマホ版の ML Kit はスマホの中でしか動かないため、アプリの「設定 → OCR精度テスト」で測る。
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';
import { buildXlsx, Cell } from '@demolab/shared/src/xlsx/writer';
import { extractWithClaude } from '../src/lib/claude';
import { parseReceiptText } from '../src/lib/parse';
import { DEFAULT_SETTINGS, ExtractResult, FieldKey, FIELD_LABEL } from '../src/lib/types';
import { normalizeRegNo, normalizeVendor } from '../src/lib/validate';

const here = path.dirname(fileURLToPath(import.meta.url));
const KEYS: FieldKey[] = ['date', 'vendor', 'total', 'regNo', 'amount10', 'tax10', 'amount8', 'tax8'];

function same(k: FieldKey, got: string | undefined, want: string): boolean {
  const g = (got ?? '').trim();
  if (k === 'vendor') {
    const a = normalizeVendor(g);
    const b = normalizeVendor(want);
    return !!a && (a.includes(b) || b.includes(a));
  }
  if (k === 'regNo') return normalizeRegNo(g) === normalizeRegNo(want);
  if (k === 'date') return g === want.trim();
  return g.replace(/[^\d]/g, '') === want.replace(/[^\d]/g, '');
}

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error('フォルダを指定してください');
  const truthPath = path.join(dir, 'truth.json');
  const truth: Record<string, Partial<Record<FieldKey, string>>> = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, 'utf8')) : {};
  const files = readdirSync(dir).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
  const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
  const cats = DEFAULT_SETTINGS.categories;
  const work = mkdtempSync(path.join(tmpdir(), 'ocr-eval-'));
  const langPath = path.dirname(require.resolve('@tesseract.js-data/jpn/4.0.0_best_int/jpn.traineddata.gz'));
  const worker = await createWorker(['jpn'], 1, { langPath, cacheMethod: 'none' });

  const engines = ['Tesseract（Web版）', ...(apiKey ? ['Claude API'] : [])];
  const score: Record<string, Record<string, [number, number]>> = Object.fromEntries(engines.map((e) => [e, Object.fromEntries(KEYS.map((k) => [k, [0, 0]]))]));
  const rows: Cell[][] = [];

  for (const f of files) {
    const prepared = path.join(work, `${f}.jpg`);
    execFileSync('python3', ['-I', path.join(here, 'preprocess.py'), path.join(dir, f), prepared]);
    const results: [string, ExtractResult | string, number][] = [];
    let t = Date.now();
    try {
      const { data } = await worker.recognize(prepared);
      const text = data.text.replace(/(?<=[^\x00-\x7F]) (?=[^\x00-\x7F])/g, '');
      results.push([engines[0], parseReceiptText(text, cats), Date.now() - t]);
    } catch (e) {
      results.push([engines[0], String(e), Date.now() - t]);
    }
    if (apiKey) {
      t = Date.now();
      try {
        results.push([engines[1], await extractWithClaude(apiKey, readFileSync(prepared).toString('base64'), cats), Date.now() - t]);
      } catch (e) {
        results.push([engines[1], e instanceof Error ? e.message : String(e), Date.now() - t]);
      }
    }
    const want = truth[f] ?? {};
    for (const [engine, r, ms] of results) {
      const row: Cell[] = [f, engine, Math.round(ms / 100) / 10];
      for (const k of KEYS) {
        const got = typeof r === 'string' ? '' : (r.fields[k] ?? '');
        if (want[k] !== undefined) {
          const ok = same(k, got, want[k]!);
          score[engine][k][0] += ok ? 1 : 0;
          score[engine][k][1] += 1;
          row.push(`${got || '—'} ${ok ? '○' : `× (正解 ${want[k]})`}`);
        } else row.push(got || '—');
      }
      row.push(typeof r === 'string' ? r : '', { v: typeof r === 'string' ? '' : r.rawText, s: 'wrap' });
      rows.push(row);
      console.log(`${f} [${engine}] ${(ms / 1000).toFixed(1)}s`, typeof r === 'string' ? `エラー: ${r}` : KEYS.map((k) => `${k}=${r.fields[k] ?? ''}`).join(' '));
    }
  }
  await worker.terminate();

  const summary: Cell[][] = [['方式', ...KEYS.map((k) => FIELD_LABEL[k])].map((v) => ({ v, s: 'header' as const }))];
  for (const e of engines) {
    summary.push([e, ...KEYS.map((k) => (score[e][k][1] ? `${score[e][k][0]}/${score[e][k][1]}（${Math.round((score[e][k][0] / score[e][k][1]) * 100)}%）` : '—'))]);
  }
  const header: Cell[] = ['画像', '方式', '秒', ...KEYS.map((k) => FIELD_LABEL[k]), 'エラー', '認識テキスト'].map((v) => ({ v, s: 'header' as const }));
  const out = path.join(dir, 'ocr-eval-result.xlsx');
  writeFileSync(out, await buildXlsx([
    { name: '正解率', rows: summary, widths: [20, 14, 14, 14, 14, 14, 14, 14, 14] },
    { name: '写真ごとの結果', rows: [header, ...rows], freezeHeader: true, widths: [22, 18, 6, 18, 24, 18, 22, 14, 14, 14, 14, 30, 60] },
  ]));
  console.log('\n正解率');
  for (const r of summary.slice(1)) console.log(r.join(' | '));
  console.log(`\n結果: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
