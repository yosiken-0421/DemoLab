// Fixed, fictional receipt fixtures. All stores, addresses, numbers are invented.
function content({ store, address, tel, reg, dateText, dateIso, items, paid, totalLabel, totalSize, extraLines }) {
  let t10 = 0, t8 = 0;
  for (const it of items) (it.reduced ? (t8 += it.price) : (t10 += it.price));
  const tax10 = Math.floor(t10 * 10 / 110), tax8 = Math.floor(t8 * 8 / 108);
  const total = t10 + t8;
  return { store, address, tel, reg, dateText, dateIso, items, total, t10, t8, tax10, tax8, taxTotal: tax10 + tax8, rate: t10 && t8 ? 'mixed' : t8 ? '8' : '10', paid, totalLabel, totalSize, extraLines };
}

export const CONTENTS = {
  a: content({ store: 'みどり文具店 本町店', address: '架空県みどり市本町1-2-3', tel: '000-123-4567', reg: '1234567890123', dateText: '2026年10月14日(水) 12:34', dateIso: '2026-10-14',
    items: [{ name: 'ノート A5', price: 330 }, { name: 'ボールペン 黒', price: 165 }, { name: '付箋 75mm', price: 418 }, { name: 'お茶 500ml', price: 140, reduced: true }], paid: 2000 }),
  b: content({ store: 'サンプル珈琲 駅前店', address: '架空県さくら市駅前4-5', tel: '000-987-6543', reg: '9876543210987', dateText: '2026/09/30 18:05', dateIso: '2026-09-30',
    items: [{ name: 'ブレンドコーヒー', price: 480, reduced: true }, { name: 'サンドイッチ', price: 650, reduced: true }, { name: '紙袋', price: 10 }], paid: 1500 }),
  c: content({ store: 'あおば電機', address: '架空県あおば町7-8-9', tel: '000-555-0101', reg: '5555500001111', dateText: '令和8年11月2日 10:20', dateIso: '2026-11-02',
    items: [{ name: 'USBケーブル 1m', price: 1280 }, { name: '単3電池 4本', price: 548 }, { name: '延長コード', price: 2178 }], paid: 5000, totalLabel: 'お買上計' }),
  d: content({ store: 'ひかり薬局', address: '架空県ひかり市中央2-1', tel: '000-222-3333', reg: '2222233333444', dateText: '2026-08-07 09:41', dateIso: '2026-08-07',
    items: [{ name: 'マスク 30枚', price: 698 }, { name: 'のど飴', price: 248, reduced: true }, { name: 'ハンドソープ', price: 385 }, { name: '絆創膏', price: 528 }, { name: '目薬', price: 1078 }], paid: 3000, totalLabel: '合　計' }),
};

const V = { frameW: 1440, frameH: 1920 }; // portrait camera frame (typical getUserMedia 4:3)
export const FIXTURES = [
  { id: 'clean-34px', content: 'a', bodyPx: 34, ...V },
  { id: 'clean-24px', content: 'b', bodyPx: 24, ...V },
  { id: 'small-18px', content: 'c', bodyPx: 18, ...V },
  { id: 'small-15px', content: 'd', bodyPx: 15, ...V },
  { id: 'tiny-12px', content: 'a', bodyPx: 12, ...V },
  { id: 'blur-20px', content: 'b', bodyPx: 20, blur: 1.4, ...V },
  { id: 'dark-20px', content: 'c', bodyPx: 20, brightness: 0.42, contrast: 0.7, ...V },
  { id: 'shadow-20px', content: 'd', bodyPx: 20, shade: 0.55, ...V },
  { id: 'faded-20px', content: 'a', bodyPx: 20, inkColor: '#8a8a8a', ...V },
  { id: 'tilt4-20px', content: 'b', bodyPx: 20, rotateDeg: 4, ...V },
  { id: 'tilt-9-22px', content: 'c', bodyPx: 22, rotateDeg: -9, ...V },
  { id: 'noise-jpeg-18px', content: 'd', bodyPx: 18, noise: 28, jpeg: 0.6, ...V },
  { id: 'cut-bottom-26px', content: 'a', bodyPx: 26, cy: 0.78, ...V },
  { id: 'long-14px', content: 'b', bodyPx: 14, extraLines: 22, ...V },
  { id: 'landscape-16px', content: 'c', bodyPx: 16, frameW: 1920, frameH: 1440 },
  { id: 'still-hires-small', content: 'd', bodyPx: 30, frameW: 3024, frameH: 4032, jpeg: 0.85 },
  // stress set: very small print at video resolution
  { id: 'stress-10px', content: 'b', bodyPx: 10, ...V },
  { id: 'stress-12px-blur', content: 'c', bodyPx: 12, blur: 0.8, ...V },
  { id: 'stress-12px-noise', content: 'd', bodyPx: 12, noise: 22, jpeg: 0.55, shade: 0.3, ...V },
  { id: 'stress-11px-tilt', content: 'a', bodyPx: 11, rotateDeg: 3, inkColor: '#555', ...V },
];

// Thermal-printer receipts photographed by a phone (dot-matrix glyphs, 倍角 store name/total, JPEG, blur).
// These model the failure reported on a real device (large digits not read): dots separate at high resolution.
const PHOTO = { frameW: 3024, frameH: 4032, jpeg: 0.85, thermal: true, cols: 42 };
const VIDEO = { frameW: 1080, frameH: 1920, jpeg: 0.8, thermal: true, cols: 42 };
export const THERMAL = [
  { id: 'th-photo-close', content: 'a', bodyPx: 96, blur: 1.2, rotateDeg: 2, ...PHOTO },
  { id: 'th-photo-mid', content: 'b', bodyPx: 64, blur: 1.5, ...PHOTO },
  { id: 'th-photo-far', content: 'c', bodyPx: 44, blur: 1.5, rotateDeg: -3, ...PHOTO },
  { id: 'th-photo-tall', content: 'd', bodyPx: 72, blur: 1.2, totalStyle: 'tall', ...PHOTO },
  { id: 'th-photo-faded', content: 'a', bodyPx: 64, blur: 1.5, inkGray: 105, totalStyle: 'wide', ...PHOTO },
  { id: 'th-photo-shadow', content: 'b', bodyPx: 80, blur: 1.5, shade: 0.5, ...PHOTO },
  { id: 'th-video-28', content: 'c', bodyPx: 28, blur: 0.8, ...VIDEO },
  { id: 'th-video-22', content: 'd', bodyPx: 22, blur: 0.7, rotateDeg: 3, ...VIDEO },
  { id: 'th-video-18', content: 'a', bodyPx: 18, blur: 0.6, ...VIDEO },
  { id: 'th-video-34-tilt', content: 'b', bodyPx: 34, blur: 1, rotateDeg: -6, ...VIDEO },
];
