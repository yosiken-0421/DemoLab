export type Confidence = 'high' | 'low' | 'missing';
export type OcrEngine = 'device' | 'claude' | 'manual';
export type OcrMode = 'device' | 'claude' | 'auto';

/** 入力欄の値（金額も文字列で持ち、保存時に数値化する） */
export interface ReceiptFields {
  date: string; // YYYY-MM-DD
  vendor: string;
  total: string;
  regNo: string; // T+13桁
  description: string;
  amount10: string; // 10%対象（税込）
  tax10: string;
  amount8: string; // 8%対象（税込）
  tax8: string;
  payment: string;
  category: string;
  memo: string;
}

export type FieldKey = keyof ReceiptFields;
export type ConfidenceMap = Partial<Record<FieldKey, Confidence>>;

export interface ExtractResult {
  fields: Partial<ReceiptFields>;
  confidence: ConfidenceMap;
  rawText: string;
  engine: OcrEngine;
  note?: string;
}

export interface Receipt {
  id: string;
  date: string;
  vendor: string;
  total: number;
  reg_no: string;
  description: string;
  amount10: number | null;
  tax10: number | null;
  amount8: number | null;
  tax8: number | null;
  payment: string;
  category: string;
  memo: string;
  photo: string | null; // 保存した写真の参照名
  ocr_engine: OcrEngine;
  ocr_text: string;
  status: 'unsettled' | 'settled';
  settled_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ReceiptHistory {
  id: number;
  receipt_id: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'settle' | 'unsettle';
  changes: string; // JSON: { 項目: [変更前, 変更後] }
  at: string;
}

export interface Settings {
  ocrMode: OcrMode;
  categories: string[];
  payments: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  ocrMode: 'device',
  categories: ['交通費', '会議費', '接待交際費', '消耗品費', '通信費', '新聞図書費', '事務用品費', '福利厚生費', '雑費'],
  payments: ['現金', 'クレジットカード', '電子マネー', 'QRコード決済', '銀行振込', 'その他'],
};

export const FIELD_LABEL: Record<FieldKey, string> = {
  date: '取引年月日',
  vendor: '取引先（発行事業者名）',
  total: '金額（税込）',
  regNo: '登録番号（適格請求書発行事業者）',
  description: '取引内容',
  amount10: '10%対象（税込）',
  tax10: '10%消費税額',
  amount8: '8%対象（税込）',
  tax8: '8%消費税額',
  payment: '支払方法',
  category: '勘定科目',
  memo: 'メモ',
};

export function emptyFields(): ReceiptFields {
  return { date: '', vendor: '', total: '', regNo: '', description: '', amount10: '', tax10: '', amount8: '', tax8: '', payment: '', category: '', memo: '' };
}

export const OCR_MODE_LABEL: Record<OcrMode, string> = { device: '端末内OCR', claude: 'Claude API（精度重視）', auto: '自動（端末内→必要時Claude）' };
