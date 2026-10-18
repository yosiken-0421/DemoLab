import { monthRange, yearRange } from '@demolab/shared/src/date';

/** 出力・精算で使う期間：月ごと／年ごと */
export function periodOf(mode: '月ごと' | '年ごと', year: number, month: number) {
  const range = mode === '月ごと' ? monthRange(year, month) : yearRange(year);
  const months = mode === '月ごと' ? [`${year}-${String(month).padStart(2, '0')}`] : Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`);
  const label = mode === '月ごと' ? `${year}-${String(month).padStart(2, '0')}` : `${year}`;
  return { range, months, label };
}
