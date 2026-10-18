// 経費の Excel 出力（明細・科目別集計・月別集計）、OCR結果一覧、写真ファイル名。純粋関数（テスト対象）
import { buildXlsx, Cell, SheetSpec } from '@demolab/shared/src/xlsx/writer';
import type { Receipt } from './types';

const h = (v: string): Cell => ({ v, s: 'header' });
const yen = (n: number | null): Cell => (n === null || n === undefined ? '' : { v: n, s: 'number' });
const STATUS = { unsettled: '未精算', settled: '精算済' } as const;

/** ZIP内・明細シートで共通の写真ファイル名 */
export function photoFileName(r: Receipt): string {
  const vendor = (r.vendor || '取引先不明').replace(/[\\/:*?"<>|\s]/g, '').slice(0, 20);
  return `${r.date}_${vendor}_${r.total}円_${r.id.slice(-6)}.jpg`;
}

export function detailSheet(rows: Receipt[]): SheetSpec {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at));
  return {
    name: '明細',
    freezeHeader: true,
    widths: [5, 12, 24, 17, 20, 12, 14, 12, 12, 11, 12, 11, 20, 8, 12, 40, 18, 18],
    rows: [
      ['No', '取引年月日', '取引先', '登録番号', '取引内容', '勘定科目', '支払方法', '金額(税込)', '10%対象(税込)', '10%消費税', '8%対象(税込)', '8%消費税', 'メモ', '精算状況', '精算日', '画像ファイル名', '登録日時', '最終更新'].map(h),
      ...sorted.map((r, i) => [
        i + 1,
        r.date,
        r.vendor,
        r.reg_no,
        r.description,
        r.category,
        r.payment,
        yen(r.total),
        yen(r.amount10),
        yen(r.tax10),
        yen(r.amount8),
        yen(r.tax8),
        { v: r.memo, s: 'wrap' as const },
        STATUS[r.status],
        r.settled_at?.slice(0, 10) ?? '',
        r.photo ? photoFileName(r) : '',
        r.created_at.replace('T', ' '),
        r.updated_at.replace('T', ' '),
      ]),
      ...(rows.length
        ? [[{ v: '合計', s: 'bold' }, '', `${rows.length}件`, '', '', '', '', yen(sum(rows, 'total')), yen(sum(rows, 'amount10')), yen(sum(rows, 'tax10')), yen(sum(rows, 'amount8')), yen(sum(rows, 'tax8'))] as Cell[]]
        : []),
    ],
  };
}

function sum(rows: Receipt[], k: 'total' | 'amount10' | 'tax10' | 'amount8' | 'tax8'): number {
  return rows.reduce((n, r) => n + (r[k] ?? 0), 0);
}

export function categoryTotals(rows: Receipt[]): { category: string; count: number; total: number }[] {
  const m = new Map<string, Receipt[]>();
  for (const r of rows) m.set(r.category || '（未分類）', [...(m.get(r.category || '（未分類）') ?? []), r]);
  return [...m.entries()].map(([category, rs]) => ({ category, count: rs.length, total: sum(rs, 'total') })).sort((a, b) => b.total - a.total);
}

export function categorySheet(rows: Receipt[], categoryOrder: string[]): SheetSpec {
  const m = new Map<string, Receipt[]>();
  for (const r of rows) m.set(r.category || '（未分類）', [...(m.get(r.category || '（未分類）') ?? []), r]);
  const keys = [...categoryOrder.filter((c) => m.has(c)), ...[...m.keys()].filter((k) => !categoryOrder.includes(k))];
  return {
    name: '科目別集計',
    freezeHeader: true,
    widths: [16, 8, 14, 14, 12, 14, 12, 12, 12],
    rows: [
      ['勘定科目', '件数', '金額合計(税込)', '10%対象(税込)', '10%消費税', '8%対象(税込)', '8%消費税', '未精算', '精算済'].map(h),
      ...keys.map((k) => {
        const rs = m.get(k)!;
        return [k, rs.length, yen(sum(rs, 'total')), yen(sum(rs, 'amount10')), yen(sum(rs, 'tax10')), yen(sum(rs, 'amount8')), yen(sum(rs, 'tax8')), yen(sum(rs.filter((r) => r.status === 'unsettled'), 'total')), yen(sum(rs.filter((r) => r.status === 'settled'), 'total'))];
      }),
      [{ v: '合計', s: 'bold' }, rows.length, yen(sum(rows, 'total')), yen(sum(rows, 'amount10')), yen(sum(rows, 'tax10')), yen(sum(rows, 'amount8')), yen(sum(rows, 'tax8')), yen(sum(rows.filter((r) => r.status === 'unsettled'), 'total')), yen(sum(rows.filter((r) => r.status === 'settled'), 'total'))],
    ],
  };
}

/** months: 'YYYY-MM' の一覧（年ごと出力なら12か月分、データの無い月も0で出す） */
export function monthSheet(rows: Receipt[], months: string[]): SheetSpec {
  return {
    name: '月別集計',
    freezeHeader: true,
    widths: [10, 8, 14, 12, 12, 12, 12],
    rows: [
      ['年月', '件数', '金額合計(税込)', '未精算', '精算済', '10%消費税', '8%消費税'].map(h),
      ...months.map((m) => {
        const rs = rows.filter((r) => r.date.startsWith(m));
        return [m, rs.length, yen(sum(rs, 'total')), yen(sum(rs.filter((r) => r.status === 'unsettled'), 'total')), yen(sum(rs.filter((r) => r.status === 'settled'), 'total')), yen(sum(rs, 'tax10')), yen(sum(rs, 'tax8'))];
      }),
      [{ v: '合計', s: 'bold' }, rows.length, yen(sum(rows, 'total')), yen(sum(rows.filter((r) => r.status === 'unsettled'), 'total')), yen(sum(rows.filter((r) => r.status === 'settled'), 'total')), yen(sum(rows, 'tax10')), yen(sum(rows, 'tax8'))],
    ],
  };
}

export function expenseWorkbook(rows: Receipt[], months: string[], categoryOrder: string[]): Promise<Uint8Array> {
  return buildXlsx([detailSheet(rows), categorySheet(rows, categoryOrder), monthSheet(rows, months)]);
}

const ENGINE = { device: '端末内OCR', claude: 'Claude API', manual: '手入力' } as const;

export function ocrWorkbook(rows: Receipt[]): Promise<Uint8Array> {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return buildXlsx([
    {
      name: 'OCR結果',
      freezeHeader: true,
      widths: [40, 12, 22, 12, 12, 70],
      rows: [
        ['画像ファイル名', '取引年月日', '取引先', '金額(税込)', '読み取り方式', '認識テキスト'].map(h),
        ...sorted.map((r) => [r.photo ? photoFileName(r) : '（写真なし）', r.date, r.vendor, yen(r.total), ENGINE[r.ocr_engine] ?? r.ocr_engine, { v: r.ocr_text, s: 'wrap' as const }]),
      ],
    },
  ]);
}
