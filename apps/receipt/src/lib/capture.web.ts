// Web版：スマホのブラウザではカメラ撮影、PCではファイル選択（自動の傾き補正は無し）
export const SCANNER_NOTE = 'Web版では自動の傾き補正はできません。領収書を真上から、明るい場所で撮影してください（明るさは自動で補正します。向きは確認画面で回転できます）。';

function pick(capture: boolean): Promise<string[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(Array.from(input.files ?? []).map((f) => URL.createObjectURL(f)));
    input.oncancel = () => resolve([]);
    input.click();
  });
}

export const scanReceipts = () => pick(true);
export const pickFromLibrary = () => pick(false);
