// 連続撮影・複数選択した写真を順番に OCR にかけるための待ち行列（画面をまたいで共有）
import { useSyncExternalStore } from 'react';
import { uid } from '@demolab/shared/src/date';
import { recognize } from './recognize';
import type { ExtractResult, Settings } from './types';

export interface QueueItem {
  key: string;
  uri: string;
  status: 'waiting' | 'reading' | 'done' | 'error';
  result?: ExtractResult;
  error?: string;
}

let items: QueueItem[] = [];
let running = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const set = (next: QueueItem[]) => {
  items = next;
  emit();
};
const patch = (key: string, p: Partial<QueueItem>) => set(items.map((i) => (i.key === key ? { ...i, ...p } : i)));

export function enqueue(uris: string[]): void {
  set([...items, ...uris.map((uri) => ({ key: uid(), uri, status: 'waiting' as const }))]);
}

/** まだ読み取っていない写真を1枚ずつ処理（同時に走らせない） */
export async function runQueue(settings: Settings, apiKey: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const next = items.find((i) => i.status === 'waiting');
      if (!next) break;
      patch(next.key, { status: 'reading' });
      try {
        patch(next.key, { status: 'done', result: await recognize(next.uri, settings, apiKey) });
      } catch (e) {
        patch(next.key, { status: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    running = false;
  }
}

export function retry(key: string, uri?: string): void {
  patch(key, { status: 'waiting', error: undefined, result: undefined, ...(uri ? { uri } : {}) });
}

export function removeItem(key: string): void {
  set(items.filter((i) => i.key !== key));
}

export function clearQueue(): void {
  set([]);
}

export function useQueue(): QueueItem[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => items,
    () => items,
  );
}
