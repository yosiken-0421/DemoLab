// OCR用の明るさ・コントラスト補正（スマホ版・Web版で共通の計算）。
// RGBA の画素をグレースケールにし、暗い1%〜明るい1%の範囲を 0〜255 に引き伸ばす。
// 影で暗い・露出不足・感熱紙が薄い、といった写真で文字と背景の差を広げる。
export function enhancePixels(rgba: Uint8Array | Uint8ClampedArray): { changed: boolean; low: number; high: number } {
  const hist = new Uint32Array(256);
  const n = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    hist[(rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8]++;
  }
  const cut = Math.max(1, Math.floor(n * 0.01));
  let low = 0;
  for (let acc = 0; low < 255 && (acc += hist[low]) < cut; ) low++;
  let high = 255;
  for (let acc = 0; high > 0 && (acc += hist[high]) < cut; ) high--;
  if (high - low < 24) return { changed: false, low, high }; // ほぼ単色の画像は触らない
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round(((v - low) * 255) / (high - low))));
  for (let i = 0; i < rgba.length; i += 4) {
    const g = lut[(rgba[i] * 77 + rgba[i + 1] * 150 + rgba[i + 2] * 29) >> 8];
    rgba[i] = g;
    rgba[i + 1] = g;
    rgba[i + 2] = g;
  }
  return { changed: true, low, high };
}

/** 長辺を maxEdge 以下にするための縮小後サイズ */
export function fitSize(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const s = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.round(w * s), height: Math.round(h * s) };
}
