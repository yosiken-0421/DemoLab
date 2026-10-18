import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ZIP_MIME = 'application/zip';

const UTI: Record<string, string> = {
  [XLSX_MIME]: 'org.openxmlformats.spreadsheetml.sheet',
  [ZIP_MIME]: 'public.zip-archive',
};

/** バイト列をファイルにして、共有シート（保存・メール・LINE など）を開く */
export async function exportFile(fileName: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('この端末では共有機能が使えません');
  }
  await Sharing.shareAsync(file.uri, { mimeType, UTI: UTI[mimeType], dialogTitle: fileName });
}

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

/** ファイルを選ぶ（複数可）。キャンセル時は空配列 */
export async function pickFiles(mimeTypes: string[], multiple = true): Promise<PickedFile[]> {
  const result = await DocumentPicker.getDocumentAsync({ type: mimeTypes, multiple, copyToCacheDirectory: true });
  if (result.canceled) return [];
  return Promise.all(
    result.assets.map(async (a) => ({ name: a.name, bytes: new Uint8Array(await new File(a.uri).bytes()) })),
  );
}
