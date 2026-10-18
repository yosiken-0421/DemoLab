import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { readXlsx } from '@demolab/shared/src/xlsx/reader';
import { categoryTotals, expenseWorkbook, ocrWorkbook, photoFileName } from './workbook';
import type { Receipt } from './types';

const R = (p: Partial<Receipt>): Receipt => ({
  id: 'abcdef123456',
  date: '2026-10-05',
  vendor: 'テスト商店',
  total: 1000,
  reg_no: 'T1234567890123',
  description: '',
  amount10: 1000,
  tax10: 90,
  amount8: null,
  tax8: null,
  payment: '現金',
  category: '消耗品費',
  memo: '',
  photo: 'x.jpg',
  ocr_engine: 'device',
  ocr_text: '合計 ¥1,000',
  status: 'unsettled',
  settled_at: null,
  created_at: '2026-10-05T10:00:00',
  updated_at: '2026-10-05T10:00:00',
  deleted_at: null,
  ...p,
});

const rows = [
  R({}),
  R({ id: 'id2xxxxxx', date: '2026-10-06', vendor: '日本交通 株式会社', total: 3480, amount10: 3480, tax10: 316, category: '交通費', status: 'settled', settled_at: '2026-10-31T09:00:00' }),
  R({ id: 'id3xxxxxx', date: '2026-11-02', total: 540, amount10: null, tax10: null, amount8: 540, tax8: 40, category: '' }),
];

test('科目別合計（未分類を含む）', () => {
  assert.deepEqual(categoryTotals(rows).map((c) => [c.category, c.total]), [['交通費', 3480], ['消耗品費', 1000], ['（未分類）', 540]]);
});

test('写真ファイル名は記号・空白を除く', () => {
  assert.equal(photoFileName(rows[1]), '2026-10-06_日本交通株式会社_3480円_xxxxxx.jpg');
});

test('経費Excel：明細・科目別集計・月別集計', async () => {
  const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`);
  const bytes = await expenseWorkbook(rows, months, ['交通費', '会議費', '消耗品費']);
  writeFileSync(process.env.KEIHI_OUT ?? '/tmp/keihi-test.xlsx', bytes);
  const sheets = await readXlsx(bytes);
  assert.deepEqual(sheets.map((s) => s.name), ['明細', '科目別集計', '月別集計']);
  const detail = sheets[0].rows;
  assert.equal(detail.length, 1 + 3 + 1);
  assert.equal(detail[4][7], 5020, '合計行の金額');
  const month = sheets[2].rows;
  assert.equal(month.length, 1 + 12 + 1);
  assert.deepEqual(month[10].slice(0, 5), ['2026-10', 2, 4480, 1000, 3480]);
  assert.deepEqual(month[11].slice(0, 3), ['2026-11', 1, 540]);
  const ocr = await readXlsx(await ocrWorkbook(rows));
  assert.equal(ocr[0].rows[1][0], photoFileName(rows[0]));
  assert.equal(ocr[0].rows[1][5], '合計 ¥1,000');
  // ZIP が展開できること（jszip で往復）
  const zip = new JSZip();
  zip.file('写真/a.jpg', new Uint8Array([1, 2, 3]));
  const back = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array' }));
  assert.ok(back.file('写真/a.jpg'));
});
