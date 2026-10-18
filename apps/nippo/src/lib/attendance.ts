import { parseLocal } from '@demolab/shared/src/date';
import type { Punch, PunchType } from './types';

export interface DaySummary {
  firstIn: string | null;
  lastOut: string | null;
  grossMinutes: number; // 出勤〜退勤の合計
  autoBreakMinutes: number; // 休憩ボタンから計算
  breakMinutes: number; // 実際に差し引く休憩（手入力があればそちら）
  workMinutes: number;
  open: boolean; // 出勤中（退勤していない）
  onBreak: boolean;
}

const diffMin = (a: string, b: string) => Math.max(0, Math.floor((parseLocal(b).getTime() - parseLocal(a).getTime()) / 60000));

/** 取り消されていない打刻から、その日の勤務時間を計算（勤務時間 = 退勤 − 出勤 − 休憩） */
export function summarizeDay(punches: Punch[], manualBreakMinutes: number | null): DaySummary {
  const valid = punches.filter((p) => !p.canceled).sort((a, b) => a.at.localeCompare(b.at));
  let start: string | null = null;
  let breakStart: string | null = null;
  let gross = 0;
  let autoBreak = 0;
  let firstIn: string | null = null;
  let lastOut: string | null = null;
  for (const p of valid) {
    if (p.type === 'in') {
      if (!start) start = p.at;
      firstIn ??= p.at;
    } else if (p.type === 'out') {
      if (start) gross += diffMin(start, p.at);
      if (breakStart) {
        autoBreak += diffMin(breakStart, p.at);
        breakStart = null;
      }
      start = null;
      lastOut = p.at;
    } else if (p.type === 'break_start') {
      if (start && !breakStart) breakStart = p.at;
    } else if (p.type === 'break_end') {
      if (breakStart) autoBreak += diffMin(breakStart, p.at);
      breakStart = null;
    }
  }
  const breakMinutes = manualBreakMinutes ?? autoBreak;
  return {
    firstIn,
    lastOut,
    grossMinutes: gross,
    autoBreakMinutes: autoBreak,
    breakMinutes,
    workMinutes: Math.max(0, gross - breakMinutes),
    open: start !== null,
    onBreak: breakStart !== null,
  };
}

/**
 * ボタンを押したときの打刻を、どの勤務日に入れるかを決める。
 * 出勤は常に今日。退勤・休憩は「出勤したまま」の勤務日が直近（20時間以内）にあればそこへ
 * （夜勤など日付をまたぐ勤務に対応）。
 */
export function resolveWorkDate(type: PunchType, nowIso: string, today: string, recent: Punch[]): string {
  if (type === 'in') return today;
  const valid = recent.filter((p) => !p.canceled).sort((a, b) => a.at.localeCompare(b.at));
  const last = valid[valid.length - 1];
  if (last && last.type !== 'out' && diffMin(last.at, nowIso) <= 20 * 60) return last.work_date;
  return today;
}

/** 退勤が翌日以降なら「翌02:00」のように表示 */
export function displayTime(at: string, workDate: string): string {
  const time = at.slice(11, 16);
  const day = at.slice(0, 10);
  if (day === workDate) return time;
  const days = Math.round((parseLocal(day).getTime() - parseLocal(workDate).getTime()) / 86400000);
  if (days === 1) return `翌${time}`;
  if (days === -1) return `前日${time}`;
  return `${day.slice(5).replace('-', '/')} ${time}`;
}
