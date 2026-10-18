import JSZip from 'jszip';
import { photoBytes } from './photos';
import type { Receipt } from './types';
import { expenseWorkbook, photoFileName } from './workbook';

/** 写真をまとめた ZIP（明細Excel同梱。写真のファイル名は明細の「画像ファイル名」と一致） */
export async function buildPhotoZip(rows: Receipt[], months: string[], categories: string[]): Promise<{ bytes: Uint8Array; photos: number; missing: number }> {
  const zip = new JSZip();
  let photos = 0;
  let missing = 0;
  for (const r of rows) {
    if (!r.photo) continue;
    const b = await photoBytes(r.photo);
    if (!b) {
      missing++;
      continue;
    }
    zip.file(`写真/${photoFileName(r)}`, b);
    photos++;
  }
  zip.file('経費明細.xlsx', await expenseWorkbook(rows, months, categories));
  return { bytes: await zip.generateAsync({ type: 'uint8array' }), photos, missing };
}
