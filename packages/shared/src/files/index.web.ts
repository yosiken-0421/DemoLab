export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ZIP_MIME = 'application/zip';

/** Web版：ブラウザのダウンロードとして保存する */
export async function exportFile(fileName: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  // すぐに消すとファイル名が反映されないブラウザがあるため少し待つ
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 30_000);
}

export interface PickedFile {
  name: string;
  bytes: Uint8Array;
}

export function pickFiles(mimeTypes: string[], multiple = true): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = mimeTypes.join(',');
    input.multiple = multiple;
    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))));
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}
