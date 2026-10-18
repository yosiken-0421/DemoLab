import { DB, localIso, migrate, openDatabase, uid } from '@demolab/shared';
import { DEFAULT_SETTINGS, emptyReport, Punch, PunchHistory, PunchType, ReportData, Settings } from './types';
import { resolveWorkDate } from './attendance';

let dbPromise: Promise<DB> | null = null;

export function getDb(): Promise<DB> {
  dbPromise ??= (async () => {
    const db = await openDatabase('nippo.db');
    await migrate(db, [
      {
        version: 1,
        sql: `
          CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS punches (
            id TEXT PRIMARY KEY NOT NULL,
            work_date TEXT NOT NULL,
            type TEXT NOT NULL,
            at TEXT NOT NULL,
            canceled INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_punches_date ON punches(work_date);
          CREATE TABLE IF NOT EXISTS punch_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            punch_id TEXT NOT NULL,
            action TEXT NOT NULL,
            old_at TEXT,
            new_at TEXT,
            reason TEXT NOT NULL DEFAULT '',
            changed_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_history_punch ON punch_history(punch_id);
          CREATE TABLE IF NOT EXISTS days (
            work_date TEXT PRIMARY KEY NOT NULL,
            break_minutes INTEGER
          );
          CREATE TABLE IF NOT EXISTS reports (
            work_date TEXT PRIMARY KEY NOT NULL,
            data TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
        `,
      },
    ]);
    return db;
  })();
  return dbPromise;
}

// ---------- 設定 ----------
export async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const row = await db.first<{ value: string }>("SELECT value FROM settings WHERE key = 'app'");
  if (!row) return structuredCloneSafe(DEFAULT_SETTINGS);
  const saved = JSON.parse(row.value) as Partial<Settings>;
  const merged = { ...structuredCloneSafe(DEFAULT_SETTINGS), ...saved };
  // 将来項目が増えたときも欠けないように補完
  for (const s of DEFAULT_SETTINGS.sections) {
    if (!merged.sections.some((x) => x.key === s.key)) merged.sections.push({ ...s });
  }
  return merged;
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await getDb();
  await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('app', ?)", [JSON.stringify(s)]);
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------- 打刻 ----------
export async function punchesOfDay(workDate: string): Promise<Punch[]> {
  const db = await getDb();
  return db.all<Punch>('SELECT * FROM punches WHERE work_date = ? ORDER BY at, created_at', [workDate]);
}

export async function punchesBetween(from: string, to: string): Promise<Punch[]> {
  const db = await getDb();
  return db.all<Punch>('SELECT * FROM punches WHERE work_date BETWEEN ? AND ? ORDER BY work_date, at', [from, to]);
}

export async function historyOf(punchIds: string[]): Promise<PunchHistory[]> {
  if (!punchIds.length) return [];
  const db = await getDb();
  return db.all<PunchHistory>(
    `SELECT * FROM punch_history WHERE punch_id IN (${punchIds.map(() => '?').join(',')}) ORDER BY id`,
    punchIds,
  );
}

async function addHistory(db: DB, punchId: string, action: PunchHistory['action'], oldAt: string | null, newAt: string | null, reason = '') {
  await db.run('INSERT INTO punch_history (punch_id, action, old_at, new_at, reason, changed_at) VALUES (?, ?, ?, ?, ?, ?)', [
    punchId,
    action,
    oldAt,
    newAt,
    reason,
    localIso(new Date()),
  ]);
}

/** ボタンを押した瞬間の打刻。勤務日は自動判定（日をまたぐ勤務に対応） */
export async function punchNow(type: PunchType, now = new Date()): Promise<Punch> {
  const db = await getDb();
  const at = localIso(now);
  const today = at.slice(0, 10);
  const recent = await db.all<Punch>("SELECT * FROM punches WHERE canceled = 0 AND at >= ? ORDER BY at DESC LIMIT 20", [
    localIso(new Date(now.getTime() - 24 * 3600 * 1000)),
  ]);
  const workDate = resolveWorkDate(type, at, today, recent);
  return addPunch(workDate, type, at, '', false);
}

/** 打ち忘れ用の後から追加 */
export async function addPunch(workDate: string, type: PunchType, at: string, reason = '', manual = true): Promise<Punch> {
  const db = await getDb();
  const p: Punch = { id: uid(), work_date: workDate, type, at, canceled: 0, created_at: localIso(new Date()) };
  await db.run('INSERT INTO punches (id, work_date, type, at, canceled, created_at) VALUES (?, ?, ?, ?, 0, ?)', [p.id, p.work_date, p.type, p.at, p.created_at]);
  await addHistory(db, p.id, manual ? 'add' : 'create', null, at, reason);
  return p;
}

export async function editPunch(p: Punch, newAt: string, reason: string): Promise<void> {
  if (newAt === p.at) return;
  const db = await getDb();
  await db.run('UPDATE punches SET at = ? WHERE id = ?', [newAt, p.id]);
  await addHistory(db, p.id, 'edit', p.at, newAt, reason);
}

export async function setPunchCanceled(p: Punch, canceled: boolean, reason: string): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE punches SET canceled = ? WHERE id = ?', [canceled ? 1 : 0, p.id]);
  await addHistory(db, p.id, canceled ? 'cancel' : 'restore', p.at, p.at, reason);
}

// ---------- 休憩（手入力） ----------
export async function getManualBreak(workDate: string): Promise<number | null> {
  const db = await getDb();
  const row = await db.first<{ break_minutes: number | null }>('SELECT break_minutes FROM days WHERE work_date = ?', [workDate]);
  return row?.break_minutes ?? null;
}

export async function setManualBreak(workDate: string, minutes: number | null): Promise<void> {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO days (work_date, break_minutes) VALUES (?, ?)', [workDate, minutes]);
}

export async function manualBreaksBetween(from: string, to: string): Promise<Map<string, number | null>> {
  const db = await getDb();
  const rows = await db.all<{ work_date: string; break_minutes: number | null }>('SELECT * FROM days WHERE work_date BETWEEN ? AND ?', [from, to]);
  return new Map(rows.map((r) => [r.work_date, r.break_minutes]));
}

// ---------- 日報 ----------
export async function loadReport(workDate: string): Promise<ReportData | null> {
  const db = await getDb();
  const row = await db.first<{ data: string }>('SELECT data FROM reports WHERE work_date = ?', [workDate]);
  return row ? { ...emptyReport(), ...(JSON.parse(row.data) as Partial<ReportData>) } : null;
}

export async function saveReport(workDate: string, data: ReportData): Promise<void> {
  const db = await getDb();
  await db.run('INSERT OR REPLACE INTO reports (work_date, data, updated_at) VALUES (?, ?, ?)', [workDate, JSON.stringify(data), localIso(new Date())]);
}

export async function reportsBetween(from: string, to: string): Promise<{ work_date: string; data: ReportData }[]> {
  const db = await getDb();
  const rows = await db.all<{ work_date: string; data: string }>('SELECT work_date, data FROM reports WHERE work_date BETWEEN ? AND ? ORDER BY work_date', [from, to]);
  return rows.map((r) => ({ work_date: r.work_date, data: { ...emptyReport(), ...(JSON.parse(r.data) as Partial<ReportData>) } }));
}

/** 日付範囲＋キーワード（全項目を対象、スペース区切りでAND）で日報を検索 */
export async function searchReports(from: string, to: string, keyword: string): Promise<{ work_date: string; data: ReportData }[]> {
  const all = await reportsBetween(from, to);
  const words = keyword.trim().toLowerCase().split(/[\s　]+/).filter(Boolean);
  if (!words.length) return all.reverse();
  return all
    .filter((r) => {
      const text = reportText(r.data).toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .reverse();
}

export function reportText(d: ReportData): string {
  return [
    d.workType,
    d.condition,
    d.weather,
    ...d.tasks.map((t) => t.content),
    ...d.metrics.map((m) => `${m.name} ${m.unit}`),
    d.progress,
    d.issues,
    d.reflectionGood,
    d.reflectionImprove,
    d.reflectionNext,
    ...d.nextPlans.map((p) => `${p.who} ${p.what} ${p.due}`),
    d.notes,
  ].join('\n');
}
