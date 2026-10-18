// Web版：sql.js（WebAssembly版SQLite）を使い、DBファイルを IndexedDB に保存する。
// expo-sqlite の Web 版は COOP/COEP ヘッダーが必須で GitHub Pages / iPhone Safari で
// 動かない恐れがあるため採用しない。
import type { DB, SqlValue } from './types';
import { idbGet, idbSet } from './idb';
import { publicUrl } from '../files/publicUrl';

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};
type SqlJsStatement = {
  bind(values: SqlValue[]): boolean;
  step(): boolean;
  getAsObject(): Record<string, SqlValue>;
  free(): void;
};
type SqlJsDatabase = {
  exec(sql: string): unknown;
  run(sql: string, params?: SqlValue[]): void;
  prepare(sql: string): SqlJsStatement;
  export(): Uint8Array;
};

declare global {
  interface Window {
    initSqlJs?: (config: { locateFile: (file: string) => string }) => Promise<SqlJsStatic>;
  }
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJsPromise) return sqlJsPromise;
  sqlJsPromise = new Promise<void>((resolve, reject) => {
    if (window.initSqlJs) return resolve();
    const script = document.createElement('script');
    script.src = publicUrl('sqljs/sql-wasm-browser.js');
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('sql.js の読み込みに失敗しました'));
    document.head.appendChild(script);
  }).then(() => window.initSqlJs!({ locateFile: (file) => publicUrl(`sqljs/${file}`) }));
  return sqlJsPromise;
}

export async function openDatabase(name: string): Promise<DB> {
  const SQL = await loadSqlJs();
  const saved = await idbGet<Uint8Array>('sqlite', name);
  const db = new SQL.Database(saved);

  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    return idbSet('sqlite', name, db.export());
  };
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 150);
  };
  window.addEventListener('pagehide', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) void flush();
  });

  const all = async <T,>(sql: string, params: SqlValue[] = []): Promise<T[]> => {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  };

  return {
    exec: async (sql) => {
      db.exec(sql);
      scheduleSave();
    },
    run: async (sql, params = []) => {
      db.run(sql, params);
      scheduleSave();
    },
    all,
    first: async <T,>(sql: string, params: SqlValue[] = []) => (await all<T>(sql, params))[0] ?? null,
  };
}
