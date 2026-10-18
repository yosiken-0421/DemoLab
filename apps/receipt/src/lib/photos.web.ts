// Web版：写真はブラウザの IndexedDB に保存する
import { idbDelete, idbGet, idbSet } from '@demolab/shared/src/db/idb';

const STORE = 'receipt-photos';
const urls = new Map<string, string>();

export async function savePhoto(srcUri: string, id: string): Promise<string> {
  const blob = await (await fetch(srcUri)).blob();
  const name = `${id}.jpg`;
  await idbSet(STORE, name, blob);
  urls.delete(name);
  return name;
}

export async function photoUri(ref: string): Promise<string> {
  const cached = urls.get(ref);
  if (cached) return cached;
  const blob = await idbGet<Blob>(STORE, ref);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  urls.set(ref, url);
  return url;
}

export async function photoBytes(ref: string): Promise<Uint8Array | null> {
  const blob = await idbGet<Blob>(STORE, ref);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
}

export async function deletePhoto(ref: string): Promise<void> {
  await idbDelete(STORE, ref);
}
