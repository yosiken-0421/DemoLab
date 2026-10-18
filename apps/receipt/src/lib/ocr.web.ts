// Web版の端末内OCR：Tesseract.js（日本語）。ML Kit はブラウザでは使えないため代替。
// エンジンと日本語データ（約2MB）はアプリと一緒に配置し、外部CDNに頼らない。
import { publicUrl } from '@demolab/shared/src/files/publicUrl';

export const DEVICE_OCR_NAME = 'ブラウザ内OCR（Tesseract.js・日本語）';

// Worker 内で解決されるため絶対URLにする
const abs = (p: string) => new URL(publicUrl(p), window.location.href).href;

// WebAssembly SIMD が使えるブラウザでは高速版のエンジンを使う
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

type Worker = { recognize(img: string): Promise<{ data: { text: string } }> };
declare global {
  interface Window {
    Tesseract?: { createWorker(langs: string[], oem?: number, options?: Record<string, unknown>): Promise<Worker> };
  }
}

let workerPromise: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  workerPromise ??= new Promise<void>((resolve, reject) => {
    if (window.Tesseract) return resolve();
    const s = document.createElement('script');
    s.src = abs('tesseract/tesseract.min.js');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('OCRエンジン（Tesseract.js）を読み込めませんでした。ページを再読み込みしてください'));
    document.head.appendChild(s);
  })
    .then(() => {
      const simd = typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_TEST);
      return window.Tesseract!.createWorker(['jpn'], 1, {
        workerPath: abs('tesseract/worker.min.js'),
        corePath: abs(simd ? 'tesseract/tesseract-core-simd-lstm.wasm.js' : 'tesseract/tesseract-core-lstm.wasm.js'),
        langPath: abs('tesseract/lang'),
      });
    })
    .catch((e) => {
      workerPromise = null;
      throw e;
    });
  return workerPromise;
}

export async function deviceOcr(uri: string): Promise<string> {
  const worker = await getWorker();
  const r = await worker.recognize(uri);
  // Tesseract は日本語の文字間に空白を入れることがあるので詰める
  return r.data.text.replace(/(?<=[^\x00-\x7F]) (?=[^\x00-\x7F])/g, '');
}
