// スマホ版：OCRにかける前の画像処理（縮小 → 明るさ・コントラスト補正）
import { File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { enhancePixels, fitSize } from './enhance';

export const OCR_MAX_EDGE = 2000; // Claude の上限（長辺2576px）以内、ML Kit にも十分な解像度

export interface PreparedImage {
  uri: string;
  base64: string; // JPEG
}

async function resizeToJpeg(uri: string, maxEdge: number, rotate = 0) {
  const ctx = ImageManipulator.manipulate(uri);
  if (rotate) ctx.rotate(rotate);
  const probe = await ctx.renderAsync();
  const size = fitSize(probe.width, probe.height, maxEdge);
  const ctx2 = ImageManipulator.manipulate(uri);
  if (rotate) ctx2.rotate(rotate);
  if (size.width !== probe.width) ctx2.resize({ width: size.width });
  const ref = await ctx2.renderAsync();
  return ref.saveAsync({ base64: true, compress: 0.9, format: SaveFormat.JPEG });
}

function skiaEnhance(base64: string): string | null {
  // Skia はネイティブモジュール（開発ビルドが必要）。使えない環境では補正なしで続行する
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Skia, ColorType, AlphaType, ImageFormat } = require('@shopify/react-native-skia');
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(base64));
  if (!img) return null;
  const info = { width: img.width(), height: img.height(), colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul };
  const px = img.readPixels(0, 0, info) as Uint8Array | null;
  if (!px) return null;
  if (!enhancePixels(px).changed) return null;
  const out = Skia.Image.MakeImage(info, Skia.Data.fromBytes(px), info.width * 4);
  return out ? out.encodeToBase64(ImageFormat.JPEG, 90) : null;
}

/** OCR 用に縮小・補正した画像（保存用の写真は元のまま残す） */
export async function prepareForOcr(uri: string): Promise<PreparedImage> {
  const saved = await resizeToJpeg(uri, OCR_MAX_EDGE);
  let base64 = saved.base64 ?? '';
  try {
    const enhanced = skiaEnhance(base64);
    if (enhanced) {
      base64 = enhanced;
      const f = new File(Paths.cache, `ocr-${Date.now()}.jpg`);
      f.create();
      f.write(base64, { encoding: 'base64' });
      return { uri: f.uri, base64 };
    }
  } catch {
    // 補正に失敗しても縮小画像で OCR を続ける
  }
  return { uri: saved.uri, base64 };
}

/** 写真を90°単位で回転（向きが違う写真の手直し用） */
export async function rotateImage(uri: string, degrees: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.rotate(degrees);
  const ref = await ctx.renderAsync();
  return (await ref.saveAsync({ compress: 0.92, format: SaveFormat.JPEG })).uri;
}
