// スマホ版：領収書の写真をアプリ内（ドキュメントフォルダ）に保存する
import { Directory, File, Paths } from 'expo-file-system';

const dir = () => {
  const d = new Directory(Paths.document, 'receipts');
  if (!d.exists) d.create({ intermediates: true });
  return d;
};

/** 写真をアプリ内にコピーし、参照名（ファイル名）を返す */
export async function savePhoto(srcUri: string, id: string): Promise<string> {
  const name = `${id}.jpg`;
  const dest = new File(dir(), name);
  if (dest.exists) dest.delete();
  new File(srcUri).copy(dest);
  return name;
}

export async function photoUri(ref: string): Promise<string> {
  return new File(dir(), ref).uri;
}

export async function photoBytes(ref: string): Promise<Uint8Array | null> {
  const f = new File(dir(), ref);
  return f.exists ? new Uint8Array(await f.bytes()) : null;
}

export async function deletePhoto(ref: string): Promise<void> {
  const f = new File(dir(), ref);
  if (f.exists) f.delete();
}
