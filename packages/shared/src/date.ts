// 日付は端末のローカル時刻で扱い、文字列 'YYYY-MM-DD' / 'YYYY-MM-DDTHH:mm:ss' で保存する
const pad = (n: number) => String(n).padStart(2, '0');

export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function localIso(d: Date): string {
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseLocal(s: string): Date {
  const [date, time = '00:00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss = 0] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export function addDays(day: string, n: number): string {
  const d = parseLocal(day);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export function weekdayJa(day: string): string {
  return WEEK[parseLocal(day).getDay()];
}

export function formatDayJa(day: string): string {
  const d = parseLocal(day);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEK[d.getDay()]}）`;
}

export function hm(iso: string): string {
  return iso.slice(11, 16);
}

/** 分 → "8:05" */
export function minutesToHm(min: number): string {
  const sign = min < 0 ? '-' : '';
  const a = Math.abs(Math.round(min));
  return `${sign}${Math.floor(a / 60)}:${pad(a % 60)}`;
}

export function monthRange(year: number, month: number): [string, string] {
  const last = new Date(year, month, 0).getDate();
  return [`${year}-${pad(month)}-01`, `${year}-${pad(month)}-${pad(last)}`];
}

export function yearRange(year: number): [string, string] {
  return [`${year}-01-01`, `${year}-12-31`];
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return ymd(parseLocal(s)) === s;
}

export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
