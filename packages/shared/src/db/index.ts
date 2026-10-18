import * as SQLite from 'expo-sqlite';
import type { DB, SqlValue } from './types';

export async function openDatabase(name: string): Promise<DB> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync('PRAGMA journal_mode = WAL;');
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlValue[] = []) => {
      await db.runAsync(sql, params);
    },
    all: <T,>(sql: string, params: SqlValue[] = []) => db.getAllAsync<T>(sql, params),
    first: async <T,>(sql: string, params: SqlValue[] = []) => (await db.getFirstAsync<T>(sql, params)) ?? null,
  };
}
