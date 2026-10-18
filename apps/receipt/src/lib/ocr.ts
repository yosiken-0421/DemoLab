// スマホ版の端末内OCR：Google ML Kit（日本語）。オフラインで動く。
type MlKit = {
  default: { recognize(uri: string, script?: string): Promise<{ text: string; blocks: { lines: { text: string }[] }[] }> };
  TextRecognitionScript: { JAPANESE: string };
};

let mlkit: MlKit | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mlkit = require('@react-native-ml-kit/text-recognition') as MlKit;
} catch {
  mlkit = null;
}

export const DEVICE_OCR_NAME = '端末内OCR（Google ML Kit・日本語）';

export async function deviceOcr(uri: string): Promise<string> {
  if (!mlkit) throw new Error('端末内OCRはこのアプリ環境では使えません（開発ビルドが必要です）。Claude API か手入力をお使いください');
  const r = await mlkit.default.recognize(uri, mlkit.TextRecognitionScript.JAPANESE);
  // ブロック→行の順に1行ずつ並べる（項目の推定は行単位で行う）
  const lines = r.blocks.flatMap((b) => b.lines.map((l) => l.text));
  return lines.length ? lines.join('\n') : r.text;
}
