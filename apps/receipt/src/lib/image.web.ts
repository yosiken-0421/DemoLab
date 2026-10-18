// Web版：canvas で縮小・明るさ補正・回転
import { enhancePixels, fitSize } from './enhance';

export const OCR_MAX_EDGE = 2000;

export interface PreparedImage {
  uri: string;
  base64: string;
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした'));
    img.src = uri;
  });
}

export async function prepareForOcr(uri: string): Promise<PreparedImage> {
  const img = await loadImage(uri);
  const { width, height } = fitSize(img.naturalWidth, img.naturalHeight, OCR_MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height);
  enhancePixels(data.data);
  ctx.putImageData(data, 0, 0);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { uri: dataUrl, base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

export async function rotateImage(uri: string, degrees: number): Promise<string> {
  const img = await loadImage(uri);
  const quarter = ((degrees % 360) + 360) % 360;
  const swap = quarter === 90 || quarter === 270;
  const canvas = document.createElement('canvas');
  canvas.width = swap ? img.naturalHeight : img.naturalWidth;
  canvas.height = swap ? img.naturalWidth : img.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarter * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', 0.92));
  return URL.createObjectURL(blob);
}
