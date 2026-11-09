// Loads the pure modules (ReceiptOCR, ReceiptExcel) straight out of index.html into a Node VM.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const INDEX = path.resolve(here, '..', '..', 'index.html');

export function loadModules(file = INDEX) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const ctx = { console, TextEncoder, Blob: globalThis.Blob, Date, Math, Number, String, Array, Map, Set, JSON, Object, RegExp, Uint8Array, Uint32Array, Float32Array, globalThis: null };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  for (const s of scripts) if (/ReceiptOCR v5|Office Open XML/.test(s)) vm.runInContext(s, ctx, { filename: 'index.html' });
  return { ReceiptOCR: ctx.ReceiptOCR, ReceiptExcel: ctx.ReceiptExcel };
}
