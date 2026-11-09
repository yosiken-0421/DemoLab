// Writes an RGBA image as a one-frame Y4M (I420) file, the format Chromium's fake camera can play.
import fs from 'node:fs';
export function writeY4M(file, rgba, width, height) {
  const w = width & ~1, h = height & ~1, ySize = w * h, cSize = (w / 2) * (h / 2);
  const frame = Buffer.alloc(ySize + 2 * cSize);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * width + x) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    frame[y * w + x] = Math.max(0, Math.min(255, Math.round(0.257 * r + 0.504 * g + 0.098 * b + 16)));
  }
  for (let y = 0; y < h / 2; y++) for (let x = 0; x < w / 2; x++) {
    let r = 0, g = 0, b = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((y * 2 + dy) * width + x * 2 + dx) * 4; r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; }
    r /= 4; g /= 4; b /= 4;
    frame[ySize + y * (w / 2) + x] = Math.max(0, Math.min(255, Math.round(-0.148 * r - 0.291 * g + 0.439 * b + 128)));
    frame[ySize + cSize + y * (w / 2) + x] = Math.max(0, Math.min(255, Math.round(0.439 * r - 0.368 * g - 0.071 * b + 128)));
  }
  const header = Buffer.from(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\n`);
  fs.writeFileSync(file, Buffer.concat([header, Buffer.from('FRAME\n'), frame]));
}
