// Minimal reader for ZIP files written with the STORED method (what ReceiptExcel produces). Verifies CRC32.
function crc32(bytes) { let c = -1; for (const v of bytes) { c ^= v; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; } return (c ^ -1) >>> 0; }
export function unzipStored(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = {}, dec = new TextDecoder();
  let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (method !== 0) throw new Error('not stored');
    const lnameLen = dv.getUint16(off + 26, true), lextra = dv.getUint16(off + 28, true), data = buf.subarray(off + 30 + lnameLen + lextra, off + 30 + lnameLen + lextra + size);
    if (crc32(data) !== crc) throw new Error('crc mismatch ' + name);
    out[name] = dec.decode(data);
    p += 46 + nameLen + extra + comment;
  }
  return out;
}
