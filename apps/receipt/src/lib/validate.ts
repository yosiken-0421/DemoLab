import type { ReceiptFields } from './types';

/** 全角数字・記号を半角に、カンマや円記号を除いて整数化。不正なら null */
export function toYen(s: string): number | null {
  const t = s.normalize('NFKC').replace(/[,，\s¥￥円]/g, '');
  if (!/^-?\d+$/.test(t)) return null;
  return Number(t);
}

export function formatYen(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : `¥${n.toLocaleString('ja-JP')}`;
}

/** 登録番号の正規化（全角→半角、ハイフン・空白除去、小文字 t → T） */
export function normalizeRegNo(s: string): string {
  return s.normalize('NFKC').replace(/[\s\-ー－]/g, '').toUpperCase();
}

/** 登録番号の形式チェック（T＋13桁の数字）。実在確認（国税庁サイト）は行わない */
export function regNoError(s: string): string | null {
  if (!s.trim()) return null;
  const n = normalizeRegNo(s);
  if (!/^T\d{13}$/.test(n)) return '「T」＋13桁の数字で入力してください（例：T1234567890123）';
  return null;
}

/** 税込金額から消費税額を計算（端数切り捨て。領収書に記載の額があればそちらを優先してください） */
export function taxFromInclusive(amount: number, rate: 10 | 8): number {
  return Math.floor((amount * rate) / (100 + rate));
}

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export interface FieldErrors {
  [k: string]: string;
}

export function validateFields(f: ReceiptFields): FieldErrors {
  const e: FieldErrors = {};
  if (!isValidDate(f.date)) e.date = '「2026-10-18」の形式で入力してください';
  if (toYen(f.total) === null) e.total = '金額を数字で入力してください';
  for (const k of ['amount10', 'tax10', 'amount8', 'tax8'] as const) {
    if (f[k].trim() && toYen(f[k]) === null) e[k] = '数字で入力してください';
  }
  const r = regNoError(f.regNo);
  if (r) e.regNo = r;
  return e;
}

/** 税率ごとの金額の合計が総額と合っているか（どちらも入力されている場合のみ判定） */
export function amountsConsistent(f: ReceiptFields): boolean | null {
  const total = toYen(f.total);
  const a10 = toYen(f.amount10);
  const a8 = toYen(f.amount8);
  if (total === null || (a10 === null && a8 === null)) return null;
  return (a10 ?? 0) + (a8 ?? 0) === total;
}

/** 二重登録判定用の取引先名の正規化 */
export function normalizeVendor(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/株式会社|有限会社|合同会社|\(株\)|\(有\)|\(同\)|㈱|㈲/g, '')
    .replace(/[\s・.,、。]/g, '')
    .toLowerCase();
}
