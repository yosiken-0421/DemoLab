import { DB, localIso, migrate, openDatabase, uid } from '@demolab/shared';
import { DEFAULT_SETTINGS, OcrEngine, Receipt, ReceiptFields, ReceiptHistory, Settings, FIELD_LABEL, FieldKey } from './types';
import { normalizeRegNo, normalizeVendor, toYen } from './validate';

let dbPromise: Promise<DB> | null = null;

export function getDb(): Promise<DB> {
  dbPromise ??= (async () => {
    const db = await openDatabase('receipt.db');
    await migrate(db, [
      {
        version: 1,
        sql: `
          CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS receipts (
            id TEXT PRIMARY KEY NOT NULL,
            date TEXT NOT NULL,
            vendor TEXT NOT NULL DEFAULT '',
            total INTEGER NOT NULL,
            reg_no TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            amount10 INTEGER, tax10 INTEGER, amount8 INTEGER, tax8 INTEGER,
            payment TEXT NOT NULL DEFAULT '',
            category TEXT NOT NULL DEFAULT '',
            memo TEXT NOT NULL DEFAULT '',
            photo TEXT,
            ocr_engine TEXT NOT NULL DEFAULT 'manual',
            ocr_text TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'unsettled',
            settled_at TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            deleted_at TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_receipts_date ON receipts(date);
          CREATE TABLE IF NOT EXISTS receipt_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            receipt_id TEXT NOT NULL,
            action TEXT NOT NULL,
            changes TEXT NOT NULL DEFAULT '{}',
            at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_rhistory ON receipt_history(receipt_id);
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
  return { ...DEFAULT_SETTINGS, ...(row ? (JSON.parse(row.value) as Partial<Settings>) : {}) };
}

export async function saveSettings(s: Settings): Promise<void> {
  const db = await getDb();
  await db.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('app', ?)", [JSON.stringify(s)]);
}

// ---------- 領収書 ----------
type Columns = Omit<Receipt, 'id' | 'photo' | 'ocr_engine' | 'ocr_text' | 'status' | 'settled_at' | 'created_at' | 'updated_at' | 'deleted_at'>;

export function fieldsToColumns(f: ReceiptFields): Columns {
  const opt = (s: string) => (s.trim() ? toYen(s) : null);
  return {
    date: f.date,
    vendor: f.vendor.trim(),
    total: toYen(f.total) ?? 0,
    reg_no: f.regNo.trim() ? normalizeRegNo(f.regNo) : '',
    description: f.description.trim(),
    amount10: opt(f.amount10),
    tax10: opt(f.tax10),
    amount8: opt(f.amount8),
    tax8: opt(f.tax8),
    payment: f.payment,
    category: f.category,
    memo: f.memo,
  };
}

export function receiptToFields(r: Receipt): ReceiptFields {
  const s = (n: number | null) => (n === null || n === undefined ? '' : String(n));
  return {
    date: r.date,
    vendor: r.vendor,
    total: String(r.total),
    regNo: r.reg_no,
    description: r.description,
    amount10: s(r.amount10),
    tax10: s(r.tax10),
    amount8: s(r.amount8),
    tax8: s(r.tax8),
    payment: r.payment,
    category: r.category,
    memo: r.memo,
  };
}

const COLS: (keyof Columns)[] = ['date', 'vendor', 'total', 'reg_no', 'description', 'amount10', 'tax10', 'amount8', 'tax8', 'payment', 'category', 'memo'];
const COL_TO_FIELD: Record<keyof Columns, FieldKey> = {
  date: 'date', vendor: 'vendor', total: 'total', reg_no: 'regNo', description: 'description', amount10: 'amount10', tax10: 'tax10', amount8: 'amount8', tax8: 'tax8', payment: 'payment', category: 'category', memo: 'memo',
};

async function addHistory(db: DB, receiptId: string, action: ReceiptHistory['action'], changes: Record<string, [unknown, unknown]> = {}) {
  await db.run('INSERT INTO receipt_history (receipt_id, action, changes, at) VALUES (?, ?, ?, ?)', [receiptId, action, JSON.stringify(changes), localIso(new Date())]);
}

export async function createReceipt(f: ReceiptFields, opts: { id?: string; photo: string | null; engine: OcrEngine; ocrText: string }): Promise<string> {
  const db = await getDb();
  const id = opts.id ?? uid();
  const c = fieldsToColumns(f);
  const now = localIso(new Date());
  await db.run(
    `INSERT INTO receipts (id, ${COLS.join(', ')}, photo, ocr_engine, ocr_text, status, created_at, updated_at) VALUES (?, ${COLS.map(() => '?').join(', ')}, ?, ?, ?, 'unsettled', ?, ?)`,
    [id, ...COLS.map((k) => c[k]), opts.photo, opts.engine, opts.ocrText, now, now],
  );
  await addHistory(db, id, 'create');
  return id;
}

/** 変更した項目だけを「変更前→変更後」で履歴に残す（電子帳簿保存法の訂正履歴を意識） */
export async function updateReceipt(before: Receipt, f: ReceiptFields): Promise<number> {
  const db = await getDb();
  const c = fieldsToColumns(f);
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of COLS) if ((before[k] ?? null) !== (c[k] ?? null)) changes[FIELD_LABEL[COL_TO_FIELD[k]]] = [before[k], c[k]];
  if (!Object.keys(changes).length) return 0;
  await db.run(`UPDATE receipts SET ${COLS.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...COLS.map((k) => c[k]), localIso(new Date()), before.id]);
  await addHistory(db, before.id, 'update', changes);
  return Object.keys(changes).length;
}

export async function setDeleted(id: string, deleted: boolean): Promise<void> {
  const db = await getDb();
  await db.run('UPDATE receipts SET deleted_at = ?, updated_at = ? WHERE id = ?', [deleted ? localIso(new Date()) : null, localIso(new Date()), id]);
  await addHistory(db, id, deleted ? 'delete' : 'restore');
}

export async function setSettled(ids: string[], settled: boolean): Promise<void> {
  const db = await getDb();
  const now = localIso(new Date());
  for (const id of ids) {
    await db.run('UPDATE receipts SET status = ?, settled_at = ?, updated_at = ? WHERE id = ?', [settled ? 'settled' : 'unsettled', settled ? now : null, now, id]);
    await addHistory(db, id, settled ? 'settle' : 'unsettle');
  }
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const db = await getDb();
  return db.first<Receipt>('SELECT * FROM receipts WHERE id = ?', [id]);
}

export async function historyOf(id: string): Promise<ReceiptHistory[]> {
  const db = await getDb();
  return db.all<ReceiptHistory>('SELECT * FROM receipt_history WHERE receipt_id = ? ORDER BY id DESC', [id]);
}

export interface SearchQuery {
  from?: string;
  to?: string;
  min?: number | null;
  max?: number | null;
  vendor?: string;
  status?: 'unsettled' | 'settled' | '';
  includeDeleted?: boolean;
}

/** 取引年月日（範囲）・金額（範囲）・取引先で検索 */
export async function searchReceipts(q: SearchQuery): Promise<Receipt[]> {
  const db = await getDb();
  const where: string[] = [];
  const p: (string | number)[] = [];
  if (!q.includeDeleted) where.push('deleted_at IS NULL');
  if (q.from) (where.push('date >= ?'), p.push(q.from));
  if (q.to) (where.push('date <= ?'), p.push(q.to));
  if (q.min !== null && q.min !== undefined) (where.push('total >= ?'), p.push(q.min));
  if (q.max !== null && q.max !== undefined) (where.push('total <= ?'), p.push(q.max));
  if (q.status) (where.push('status = ?'), p.push(q.status));
  let rows = await db.all<Receipt>(`SELECT * FROM receipts ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY date DESC, created_at DESC`, p);
  if (q.vendor?.trim()) {
    const v = normalizeVendor(q.vendor);
    rows = rows.filter((r) => normalizeVendor(r.vendor).includes(v));
  }
  return rows;
}

/** 二重登録チェック：日付・金額・取引先（表記ゆれを吸収）が一致する既存データ */
export async function findDuplicates(f: ReceiptFields, excludeId?: string): Promise<Receipt[]> {
  const db = await getDb();
  const total = toYen(f.total);
  if (!f.date || total === null) return [];
  const rows = await db.all<Receipt>('SELECT * FROM receipts WHERE deleted_at IS NULL AND date = ? AND total = ?', [f.date, total]);
  const v = normalizeVendor(f.vendor);
  return rows.filter((r) => r.id !== excludeId && normalizeVendor(r.vendor) === v);
}
