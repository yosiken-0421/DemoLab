// 勤怠・日報の Excel 出力と、複数人分の統合。純粋関数のみ（テスト対象）
import { buildXlsx, Cell, SheetSpec } from '@demolab/shared/src/xlsx/writer';
import { excelSerialToYmd, readXlsx, ReadValue } from '@demolab/shared/src/xlsx/reader';
import { minutesToHm, weekdayJa } from '@demolab/shared/src/date';
import { displayTime, summarizeDay } from './attendance';
import type { Punch, PunchHistory, ReportData } from './types';

export const ATT_SHEET = '勤怠一覧';
export const REP_SHEET = '日報一覧';
export const PERSON_SHEET = '人別集計';

export const ATT_HEADERS = ['日付', '曜日', '氏名', '勤務区分', '出勤', '退勤', '休憩(分)', '勤務時間', '勤務時間(h)', '打刻修正'] as const;
export const REP_HEADERS = [
  '日付',
  '曜日',
  '氏名',
  '勤務区分',
  '勤務時間',
  '体調',
  '天候',
  '業務実績・作業内容',
  '作業時間合計(分)',
  '数値記録（目標／実績）',
  '目標に対する進捗',
  '課題・気づき・申し送り事項',
  '振り返り：良かった点',
  '振り返り：改善点',
  '振り返り：次に活かすこと',
  '翌日の予定・引き継ぎ',
  '特記事項',
] as const;

export interface AttendanceRecord {
  date: string;
  name: string;
  workType: string;
  inTime: string;
  outTime: string;
  breakMinutes: number;
  workMinutes: number;
  edited: string;
}

export type ReportRecord = Record<(typeof REP_HEADERS)[number], string>;

// ---------- この端末のデータ → レコード ----------
export function metricText(m: { name: string; unit: string; target: string; actual: string }): string {
  const t = parseFloat(m.target);
  const a = parseFloat(m.actual);
  const rate = Number.isFinite(t) && t !== 0 && Number.isFinite(a) ? `（達成率${Math.round((a / t) * 100)}%）` : '';
  return `${m.name}：目標${m.target || '-'}${m.unit}／実績${m.actual || '-'}${m.unit}${rate}`;
}

export function buildRecords(input: {
  name: string;
  punches: Punch[];
  history: PunchHistory[];
  manualBreaks: Map<string, number | null>;
  reports: { work_date: string; data: ReportData }[];
}): { attendance: AttendanceRecord[]; reports: ReportRecord[] } {
  const byDate = new Map<string, Punch[]>();
  for (const p of input.punches) byDate.set(p.work_date, [...(byDate.get(p.work_date) ?? []), p]);
  const reportMap = new Map(input.reports.map((r) => [r.work_date, r.data]));
  const editCount = new Map<string, number>();
  for (const h of input.history) if (h.action !== 'create') editCount.set(h.punch_id, (editCount.get(h.punch_id) ?? 0) + 1);

  const dates = new Set<string>([...reportMap.keys()]);
  for (const [d, ps] of byDate) if (ps.some((p) => !p.canceled)) dates.add(d);
  for (const [d, b] of input.manualBreaks) if (b !== null && byDate.has(d)) dates.add(d);

  const attendance: AttendanceRecord[] = [];
  const reports: ReportRecord[] = [];
  const workTime = new Map<string, string>();
  for (const date of [...dates].sort()) {
    const ps = byDate.get(date) ?? [];
    const s = summarizeDay(ps, input.manualBreaks.get(date) ?? null);
    const edits = ps.reduce((n, p) => n + (editCount.get(p.id) ?? 0), 0);
    const hasPunch = ps.some((p) => !p.canceled);
    workTime.set(date, hasPunch ? minutesToHm(s.workMinutes) : '');
    if (hasPunch) {
      attendance.push({
        date,
        name: input.name,
        workType: reportMap.get(date)?.workType ?? '',
        inTime: s.firstIn ? displayTime(s.firstIn, date) : '',
        outTime: s.lastOut ? displayTime(s.lastOut, date) : s.open ? '（未退勤）' : '',
        breakMinutes: s.breakMinutes,
        workMinutes: s.workMinutes,
        edited: edits ? `あり（${edits}件）` : '',
      });
    }
    const d = reportMap.get(date);
    if (d) {
      const taskMin = d.tasks.reduce((n, t) => n + (parseInt(t.minutes, 10) || 0), 0);
      reports.push({
        日付: date,
        曜日: weekdayJa(date),
        氏名: input.name,
        勤務区分: d.workType,
        勤務時間: workTime.get(date) ?? '',
        体調: d.condition,
        天候: d.weather,
        '業務実績・作業内容': d.tasks.filter((t) => t.content.trim()).map((t) => `・${t.content.trim()}${t.minutes ? `（${t.minutes}分）` : ''}`).join('\n'),
        '作業時間合計(分)': taskMin ? String(taskMin) : '',
        '数値記録（目標／実績）': d.metrics.filter((m) => m.name.trim()).map(metricText).join('\n'),
        目標に対する進捗: d.progress,
        '課題・気づき・申し送り事項': d.issues,
        '振り返り：良かった点': d.reflectionGood,
        '振り返り：改善点': d.reflectionImprove,
        '振り返り：次に活かすこと': d.reflectionNext,
        '翌日の予定・引き継ぎ': d.nextPlans
          .filter((p) => p.what.trim())
          .map((p) => `・${p.who ? `${p.who}が` : ''}${p.what}${p.due ? `（${p.due}まで）` : ''}`)
          .join('\n'),
        特記事項: d.notes,
      });
    }
  }
  return { attendance, reports };
}

// ---------- レコード → シート ----------
const h = (v: string): Cell => ({ v, s: 'header' });

function attendanceSheet(rows: AttendanceRecord[]): SheetSpec {
  const sorted = [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.date.localeCompare(b.date));
  const body: Cell[][] = sorted.map((r) => [
    r.date,
    weekdayJa(r.date),
    r.name,
    r.workType,
    r.inTime,
    r.outTime,
    r.breakMinutes,
    minutesToHm(r.workMinutes),
    { v: Math.round((r.workMinutes / 60) * 100) / 100, s: 'decimal' },
    r.edited,
  ]);
  const totalWork = rows.reduce((n, r) => n + r.workMinutes, 0);
  const totalBreak = rows.reduce((n, r) => n + r.breakMinutes, 0);
  const people = new Set(rows.map((r) => r.name)).size;
  const total: Cell[] = [
    { v: '合計', s: 'bold' },
    '',
    people > 1 ? `${people}名` : '',
    `出勤 ${rows.length}日`,
    '',
    '',
    { v: totalBreak, s: 'bold' },
    { v: minutesToHm(totalWork), s: 'bold' },
    { v: Math.round((totalWork / 60) * 100) / 100, s: 'decimal' },
    '',
  ];
  return {
    name: ATT_SHEET,
    rows: [ATT_HEADERS.map(h), ...body, ...(rows.length ? [total] : [])],
    widths: [12, 6, 14, 12, 9, 9, 9, 10, 11, 12],
    freezeHeader: true,
  };
}

function reportSheet(rows: ReportRecord[]): SheetSpec {
  const sorted = [...rows].sort((a, b) => a.氏名.localeCompare(b.氏名, 'ja') || a.日付.localeCompare(b.日付));
  return {
    name: REP_SHEET,
    rows: [
      REP_HEADERS.map(h),
      ...sorted.map((r) =>
        REP_HEADERS.map((k): Cell => (k === '作業時間合計(分)' && /^\d+$/.test(r[k]) ? Number(r[k]) : { v: r[k], s: 'wrap' })),
      ),
    ],
    widths: [12, 6, 14, 12, 10, 8, 8, 40, 10, 32, 30, 30, 26, 26, 26, 32, 30],
    freezeHeader: true,
  };
}

function personSheet(att: AttendanceRecord[], reps: ReportRecord[]): SheetSpec {
  const names = [...new Set([...att.map((r) => r.name), ...reps.map((r) => r.氏名)])].sort((a, b) => a.localeCompare(b, 'ja'));
  const rows: Cell[][] = names.map((name) => {
    const mine = att.filter((r) => r.name === name);
    const work = mine.reduce((n, r) => n + r.workMinutes, 0);
    const br = mine.reduce((n, r) => n + r.breakMinutes, 0);
    return [
      name,
      mine.length,
      minutesToHm(work),
      { v: Math.round((work / 60) * 100) / 100, s: 'decimal' },
      { v: mine.length ? Math.round((work / 60 / mine.length) * 100) / 100 : 0, s: 'decimal' },
      br,
      reps.filter((r) => r.氏名 === name).length,
    ];
  });
  return {
    name: PERSON_SHEET,
    rows: [['氏名', '出勤日数', '総勤務時間', '総勤務時間(h)', '平均勤務時間(h)', '休憩合計(分)', '日報件数'].map(h), ...rows],
    widths: [16, 10, 12, 13, 15, 12, 10],
    freezeHeader: true,
  };
}

export function buildSheets(att: AttendanceRecord[], reps: ReportRecord[], withPersonSummary: boolean): SheetSpec[] {
  const sheets = [attendanceSheet(att), reportSheet(reps)];
  if (withPersonSummary) sheets.push(personSheet(att, reps));
  return sheets;
}

export function exportWorkbook(att: AttendanceRecord[], reps: ReportRecord[], withPersonSummary = false): Promise<Uint8Array> {
  return buildXlsx(buildSheets(att, reps, withPersonSummary));
}

// ---------- 統合（複数人分の Excel を読み込む） ----------
const str = (v: ReadValue | undefined): string => (v === null || v === undefined ? '' : String(v));

function dateCell(v: ReadValue | undefined): string {
  if (typeof v === 'number') return excelSerialToYmd(v);
  const s = str(v).trim().replace(/\//g, '-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
}

function hmToMinutes(s: string): number | null {
  const m = s.match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function headerIndex(row: ReadValue[] | undefined): Map<string, number> {
  return new Map((row ?? []).map((v, i) => [str(v).trim(), i]));
}

export interface ParsedFile {
  fileName: string;
  attendance: AttendanceRecord[];
  reports: ReportRecord[];
  error?: string;
}

export async function parseNippoWorkbook(fileName: string, bytes: Uint8Array): Promise<ParsedFile> {
  try {
    const sheets = await readXlsx(bytes);
    const att = sheets.find((s) => s.name === ATT_SHEET);
    const rep = sheets.find((s) => s.name === REP_SHEET);
    if (!att && !rep) return { fileName, attendance: [], reports: [], error: '「勤怠一覧」「日報一覧」シートが見つかりません（日報アプリで出力したExcelを選んでください）' };
    const fallbackName = fileName.replace(/\.xlsx$/i, '');
    const attendance: AttendanceRecord[] = [];
    if (att) {
      const idx = headerIndex(att.rows[0]);
      const g = (row: ReadValue[], k: string) => row[idx.get(k) ?? -1];
      for (const row of att.rows.slice(1)) {
        const date = dateCell(g(row, '日付'));
        if (!date) continue; // 合計行・空行
        const hours = g(row, '勤務時間(h)');
        const work = typeof hours === 'number' ? Math.round(hours * 60) : (hmToMinutes(str(g(row, '勤務時間'))) ?? 0);
        attendance.push({
          date,
          name: str(g(row, '氏名')) || fallbackName,
          workType: str(g(row, '勤務区分')),
          inTime: str(g(row, '出勤')),
          outTime: str(g(row, '退勤')),
          breakMinutes: Number(g(row, '休憩(分)')) || 0,
          workMinutes: work,
          edited: str(g(row, '打刻修正')),
        });
      }
    }
    const reports: ReportRecord[] = [];
    if (rep) {
      const idx = headerIndex(rep.rows[0]);
      for (const row of rep.rows.slice(1)) {
        const date = dateCell(row[idx.get('日付') ?? -1]);
        if (!date) continue;
        const rec = Object.fromEntries(REP_HEADERS.map((k) => [k, str(row[idx.get(k) ?? -1])])) as ReportRecord;
        rec.日付 = date;
        rec.曜日 = weekdayJa(date);
        rec.氏名 ||= fallbackName;
        reports.push(rec);
      }
    }
    return { fileName, attendance, reports };
  } catch (e) {
    return { fileName, attendance: [], reports: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/** 氏名の比較用（全角・半角スペースの有無は同一人物とみなす） */
export const nameKey = (name: string) => name.replace(/[\s\u3000]/g, '');

/** 同じ氏名・同じ日付の行は、後から選んだファイルの内容を優先して1行にまとめる */
export function mergeParsed(files: ParsedFile[]): { attendance: AttendanceRecord[]; reports: ReportRecord[]; duplicates: number } {
  const att = new Map<string, AttendanceRecord>();
  const rep = new Map<string, ReportRecord>();
  const display = new Map<string, string>(); // 表記ゆれは最初に出てきた表記にそろえる
  const canonical = (name: string) => {
    const k = nameKey(name);
    if (!display.has(k)) display.set(k, name);
    return display.get(k)!;
  };
  let duplicates = 0;
  for (const f of files) {
    for (const r of f.attendance) {
      const name = canonical(r.name);
      const k = `${nameKey(name)}\u0000${r.date}`;
      if (att.has(k)) duplicates++;
      att.set(k, { ...r, name });
    }
    for (const r of f.reports) {
      const name = canonical(r.氏名);
      const k = `${nameKey(name)}\u0000${r.日付}`;
      if (rep.has(k)) duplicates++;
      rep.set(k, { ...r, 氏名: name });
    }
  }
  return { attendance: [...att.values()], reports: [...rep.values()], duplicates };
}
