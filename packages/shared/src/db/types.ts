export type SqlValue = string | number | null;

/** expo-sqlite（スマホ）と sql.js（Web）の差を吸収する最小限のDBインターフェース */
export interface DB {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
}

export interface Migration {
  version: number;
  sql: string;
}

/** PRAGMA user_version を使って順にマイグレーションを当てる */
export async function migrate(db: DB, migrations: Migration[]): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    await db.exec(m.sql);
    await db.exec(`PRAGMA user_version = ${m.version}`);
    current = m.version;
  }
}
