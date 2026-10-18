// 端末内OCR（ML Kit / Tesseract）が返した文字列から、領収書の項目を推定する。
// 推定の確からしさを Confidence で返し、画面では low / missing を色で目立たせる。
import type { ConfidenceMap, ExtractResult, ReceiptFields } from './types';
import { isValidDate, normalizeRegNo, taxFromInclusive } from './validate';

const pad = (n: number) => String(n).padStart(2, '0');

export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‐‑‒–—―ｰ]/g, '-')
    .replace(/\\(?=\s*\d)/g, '¥') // 円記号が \ と読まれることがある
    .replace(/[ \t]+/g, ' ');
}

// ---------- 日付 ----------
export function findDate(text: string): { value: string; confident: boolean } | null {
  const found: { value: string; strong: boolean }[] = [];
  const push = (y: number, m: number, d: number, strong: boolean) => {
    const v = `${y}-${pad(m)}-${pad(d)}`;
    if (isValidDate(v) && y >= 2000 && y <= 2099) found.push({ value: v, strong });
  };
  for (const m of text.matchAll(/(20\d{2})\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})\s*日?/g)) push(+m[1], +m[2], +m[3], true);
  for (const m of text.matchAll(/(?:令和|R)\s*(\d{1,2}|元)\s*[年/.\-]\s*(\d{1,2})\s*[月/.\-]\s*(\d{1,2})/g)) {
    push(2018 + (m[1] === '元' ? 1 : +m[1]), +m[2], +m[3], true);
  }
  if (!found.length) {
    for (const m of text.matchAll(/(?<![\d])(\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})(?![\d])/g)) {
      const yy = +m[1];
      if (yy >= 15 && yy <= 60) push(2000 + yy, +m[2], +m[3], false);
    }
  }
  if (!found.length) return null;
  const distinct = new Set(found.map((f) => f.value));
  return { value: found[0].value, confident: found[0].strong && distinct.size === 1 };
}

// ---------- 金額 ----------
/** 行の中の金額らしき数値（電話番号・日付・登録番号は除外） */
export function amountsIn(line: string): number[] {
  const cleaned = line
    .replace(/T\s*-?\s*\d[\d\s-]{11,}/g, ' ')
    .replace(/\d{2,4}-\d{2,4}-\d{3,4}/g, ' ') // 電話番号
    .replace(/(20\d{2}|令和\d+|R\d+)\s*[年/.\-]\s*\d{1,2}\s*[月/.\-]\s*\d{1,2}日?/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ') // 時刻
    .replace(/\d+(\.\d+)?\s*%/g, ' '); // 税率
  const out: number[] = [];
  for (const m of cleaned.matchAll(/(¥\s*)?(\d{1,3}(?:[,.]\d{3})+|\d+)(\s*円|\s*-)?/g)) {
    const n = Number(m[2].replace(/[,.]/g, ''));
    const marked = !!(m[1] || m[3]);
    if (!Number.isFinite(n)) continue;
    if (!marked && n < 10 && m[2].length === 1) continue; // 数量などの1桁
    out.push(n);
  }
  return out;
}

const TOTAL_KEY = /合\s*計|総\s*額|お?買\s*上\s*げ?\s*(?:計|金額|額)?|ご?請求\s*額|領収\s*金額|お?支\s*払\s*い?\s*(?:金額|額|合計)?|税込\s*(?:合計|金額)|金\s*額/;
const NOT_TOTAL = /小\s*計|対象|内\s*税|消費\s*税|税\s*額|お?釣|釣\s*銭|お?預\s*り?|預\s*かり|ポイント|値引|割引|点数|数量/;

export function findTotal(lines: string[]): { value: number; confident: boolean } | null {
  const candidates: { value: number; weight: number }[] = [];
  lines.forEach((line, i) => {
    if (NOT_TOTAL.test(line)) return;
    if (TOTAL_KEY.test(line)) {
      let nums = amountsIn(line);
      if (!nums.length && lines[i + 1] && !NOT_TOTAL.test(lines[i + 1])) nums = amountsIn(lines[i + 1]);
      if (nums.length) candidates.push({ value: nums[nums.length - 1], weight: /合\s*計|税込/.test(line) ? 3 : 2 });
    }
    // 手書き領収書の「金 12,000円也」「¥12,000-」
    const m = line.match(/(?:金|¥)\s*(\d{1,3}(?:[,.]\d{3})+|\d{3,})\s*(?:円|-|也|※)/);
    if (m) candidates.push({ value: Number(m[1].replace(/[,.]/g, '')), weight: /^\s*金/.test(line) || /也/.test(line) ? 3 : 1 });
  });
  if (!candidates.length) {
    const all = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap((l) => (/¥|円/.test(l) ? amountsIn(l) : []));
    if (!all.length) return null;
    return { value: Math.max(...all), confident: false };
  }
  const best = Math.max(...candidates.map((c) => c.weight));
  const top = candidates.filter((c) => c.weight === best);
  const value = Math.max(...top.map((c) => c.value));
  return { value, confident: best >= 3 && new Set(top.map((c) => c.value)).size === 1 };
}

// ---------- 税率ごとの金額 ----------
export function findTaxBreakdown(lines: string[]) {
  const r: { amount10?: number; tax10?: number; amount8?: number; tax8?: number } = {};
  lines.forEach((line, i) => {
    const rate = /(?<!\d)10\s*%/.test(line) ? 10 : /(?<!\d)8\s*%|軽減/.test(line) ? 8 : null;
    if (!rate) return;
    let nums = amountsIn(line);
    if (!nums.length && lines[i + 1]) nums = amountsIn(lines[i + 1]);
    if (!nums.length) return;
    const isBase = /対象|課税|計/.test(line);
    const isTax = /税/.test(line.replace(/課税|税込|税率/g, ''));
    const aKey = rate === 10 ? 'amount10' : 'amount8';
    const tKey = rate === 10 ? 'tax10' : 'tax8';
    if (isBase) {
      r[aKey] ??= nums[0];
      if (isTax && nums.length > 1) r[tKey] ??= nums[1];
    } else if (isTax) {
      r[tKey] ??= nums[nums.length - 1];
    }
  });
  return r;
}

// ---------- 登録番号 ----------
export function findRegNo(text: string): { value: string; confident: boolean } | null {
  const compact = text.replace(/\n/g, ' ');
  const m = compact.match(/(?<![A-Za-z0-9])([T丁Т])\s*[:：\-]?\s*(\d(?:[\s-]?\d){12})(?!\d)/);
  if (m) return { value: normalizeRegNo(`T${m[2]}`), confident: m[1] === 'T' };
  const label = compact.match(/登録番号\s*[:：]?\s*(\d(?:[\s-]?\d){12})(?!\d)/);
  if (label) return { value: normalizeRegNo(`T${label[1]}`), confident: false };
  return null;
}

// ---------- 取引先 ----------
const LEGAL_FORM = /株式会社|有限会社|合同会社|\(株\)|\(有\)|\(同\)/;
const SHOP_WORD = /店|堂|屋|商店|ストア|マート|ホテル|タクシー|交通|鉄道|薬局|カフェ|café|cafe|レストラン|食堂|書店|書房|郵便局/i;
const NOT_VENDOR = /領\s*収\s*書|領\s*収\s*証|レシート|お客様|上\s*様|様$|いらっしゃいませ|ありがと|毎度|^\d|^¥|TEL|電話|〒|登録番号|但|^No|伝票|担当|レジ/;

export function findVendor(lines: string[]): { value: string; confident: boolean } | null {
  const head = lines.slice(0, 10);
  const legal = lines.find((l) => LEGAL_FORM.test(l) && !NOT_VENDOR.test(l) && l.length <= 40);
  if (legal) return { value: legal.trim(), confident: true };
  const shop = head.find((l) => SHOP_WORD.test(l) && !NOT_VENDOR.test(l) && l.length <= 30);
  if (shop) return { value: shop.trim(), confident: false };
  const first = head.find((l) => !NOT_VENDOR.test(l) && /[ぁ-んァ-ヶ一-龠A-Za-z]{2,}/.test(l) && l.length <= 30);
  return first ? { value: first.trim(), confident: false } : null;
}

// ---------- 支払方法・内容・勘定科目 ----------
export function findPayment(text: string): string | null {
  if (/VISA|Master|JCB|AMEX|American Express|Diners|クレジット|カード払|CREDIT/i.test(text) && !/ポイントカード/.test(text.replace(/クレジットカード/g, ''))) return 'クレジットカード';
  if (/PayPay|d払い|楽天ペイ|au\s*PAY|メルペイ|LINE\s*Pay|QR|コード決済/i.test(text)) return 'QRコード決済';
  if (/電子マネー|Suica|PASMO|ICOCA|iD|QUICPay|nanaco|WAON|楽天Edy|Edy|交通系/i.test(text)) return '電子マネー';
  if (/お?預\s*り|お?釣|現\s*金/.test(text)) return '現金';
  return null;
}

export function findDescription(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(/但\s*し?\s*[:：]?\s*(.+)$/);
    if (m && m[1].trim()) return m[1].replace(/として.*$/, '').trim();
  }
  return null;
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/タクシー|交通|鉄道|JR|運賃|乗車|駐車|パーキング|高速|ETC|バス/i, '交通費'],
  [/カフェ|café|cafe|珈琲|コーヒー|喫茶|スターバックス|ドトール|タリーズ|コメダ/i, '会議費'],
  [/郵便|切手|はがき|レターパック/, '通信費'],
  [/書店|書房|ブックス|本屋|新聞/, '新聞図書費'],
  [/文具|文房具|事務用品/, '事務用品費'],
  [/ホームセンター|ヨドバシ|ビックカメラ|ダイソー|100円|ニトリ|アスクル|Amazon/i, '消耗品費'],
  [/居酒屋|酒場|料亭|寿司|焼肉|ダイニング|バル/, '接待交際費'],
];

export function guessCategory(text: string, categories: string[]): string | null {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(text) && categories.includes(cat)) return cat;
  return null;
}

// ---------- まとめ ----------
export function parseReceiptText(raw: string, categories: string[] = []): ExtractResult {
  const text = normalizeText(raw);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const fields: Partial<ReceiptFields> = {};
  const confidence: ConfidenceMap = {};

  const date = findDate(text);
  if (date) fields.date = date.value;
  confidence.date = !date ? 'missing' : date.confident ? 'high' : 'low';

  const total = findTotal(lines);
  const tax = findTaxBreakdown(lines);
  if (total) fields.total = String(total.value);
  if (tax.amount10 !== undefined) fields.amount10 = String(tax.amount10);
  if (tax.tax10 !== undefined) fields.tax10 = String(tax.tax10);
  if (tax.amount8 !== undefined) fields.amount8 = String(tax.amount8);
  if (tax.tax8 !== undefined) fields.tax8 = String(tax.tax8);

  // 税率ごとの金額の合計と総額が一致すれば、両方とも確からしい
  const sum = (tax.amount10 ?? 0) + (tax.amount8 ?? 0);
  const consistent = !!total && sum > 0 && sum === total.value;
  confidence.total = !total ? 'missing' : total.confident || consistent ? 'high' : 'low';
  const taxOk = (a?: number, t?: number, rate?: 10 | 8) => a !== undefined && t !== undefined && Math.abs(taxFromInclusive(a, rate!) - t) <= 1;
  for (const [a, t, rate] of [['amount10', 'tax10', 10], ['amount8', 'tax8', 8]] as const) {
    const av = tax[a];
    const tv = tax[t];
    confidence[a] = av === undefined ? 'missing' : consistent ? 'high' : 'low';
    confidence[t] = tv === undefined ? 'missing' : taxOk(av, tv, rate) ? 'high' : 'low';
  }
  // 8%の記載がまったく無い場合、8%欄は「該当なし」とみなして警告しない
  if (tax.amount8 === undefined && tax.tax8 === undefined) {
    delete confidence.amount8;
    delete confidence.tax8;
  }

  const reg = findRegNo(text);
  if (reg) fields.regNo = reg.value;
  confidence.regNo = !reg ? 'missing' : reg.confident ? 'high' : 'low';

  const vendor = findVendor(lines);
  if (vendor) fields.vendor = vendor.value;
  confidence.vendor = !vendor ? 'missing' : vendor.confident ? 'high' : 'low';

  const payment = findPayment(text);
  if (payment) fields.payment = payment;
  confidence.payment = payment ? 'low' : 'missing';

  const desc = findDescription(lines);
  if (desc) fields.description = desc;
  confidence.description = desc ? 'low' : 'missing';

  const cat = guessCategory(text, categories);
  if (cat) fields.category = cat;
  confidence.category = cat ? 'low' : 'missing';

  return { fields, confidence, rawText: raw, engine: 'device' };
}

/** 「自動」モードで Claude に回すかどうか：日付か金額の自信が低い／無いとき */
export function needsFallback(r: ExtractResult): boolean {
  return r.confidence.total !== 'high' || r.confidence.date !== 'high';
}
