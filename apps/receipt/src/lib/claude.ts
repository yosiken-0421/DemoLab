// Claude API による領収書の読み取り（精度重視・ネット必須）。
// アプリ（iOS/Android/Web）と、精度測定スクリプト（Node）の両方から使う。
import Anthropic from '@anthropic-ai/sdk';
import type { Confidence, ConfidenceMap, ExtractResult, FieldKey, ReceiptFields } from './types';
import { normalizeRegNo } from './validate';

export const CLAUDE_MODEL = 'claude-opus-5-5';

const CONF = { type: 'string', enum: ['high', 'low'] } as const;
const str = (description: string) => ({ type: 'string', description }) as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['date', 'vendor', 'total', 'registration_number', 'description', 'amount_10', 'tax_10', 'amount_8', 'tax_8', 'payment_method', 'category', 'raw_text', 'confidence'],
  properties: {
    date: str('取引年月日。YYYY-MM-DD（和暦は西暦に変換）。読めなければ空文字'),
    vendor: str('発行事業者名（店名・会社名）。宛名（上様など）ではない。読めなければ空文字'),
    total: str('支払総額（税込）を数字のみで。例 "1234"。読めなければ空文字'),
    registration_number: str('適格請求書発行事業者の登録番号。"T"＋13桁の数字のみ（区切り記号は除く）。記載が無ければ空文字'),
    description: str('取引内容（但し書き、または品目の要約。例 "タクシー代" "文房具"）。不明なら空文字'),
    amount_10: str('税率10%対象の金額（税込）を数字のみで。記載が無ければ空文字'),
    tax_10: str('税率10%の消費税額を数字のみで。記載が無ければ空文字'),
    amount_8: str('税率8%（軽減税率）対象の金額（税込）を数字のみで。記載が無ければ空文字'),
    tax_8: str('税率8%の消費税額を数字のみで。記載が無ければ空文字'),
    payment_method: { type: 'string', enum: ['現金', 'クレジットカード', '電子マネー', 'QRコード決済', '銀行振込', 'その他', ''] },
    category: str('勘定科目の候補（指定の候補から1つ。判断できなければ空文字）'),
    raw_text: str('画像内の文字を上から順に1行ずつ書き起こしたもの'),
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['date', 'vendor', 'total', 'registration_number', 'amounts', 'payment_method'],
      properties: { date: CONF, vendor: CONF, total: CONF, registration_number: CONF, amounts: CONF, payment_method: CONF },
    },
  },
} as const;

interface ClaudeReceipt {
  date: string;
  vendor: string;
  total: string;
  registration_number: string;
  description: string;
  amount_10: string;
  tax_10: string;
  amount_8: string;
  tax_8: string;
  payment_method: string;
  category: string;
  raw_text: string;
  confidence: Record<'date' | 'vendor' | 'total' | 'registration_number' | 'amounts' | 'payment_method', 'high' | 'low'>;
}

function instructions(categories: string[]): string {
  return [
    '添付は日本の領収書またはレシートの写真です。記載内容を読み取り、指定のJSON形式で返してください。',
    '・推測で値を作らないでください。印字・手書きされていない項目は空文字にします。',
    '・かすれ、手書き、しわ、影などで読み取りに少しでも迷った項目は confidence を "low" にします。',
    '・金額は「,」「¥」「円」を除いた数字のみにします。',
    '・登録番号は「T」と13桁の数字です。桁数が合わない場合も読めたとおりに記入し、confidence を "low" にします。',
    `・category は次の候補から最も適切なものを1つ選びます：${categories.join('、') || '（候補なし）'}`,
  ].join('\n');
}

const digits = (s: string) => s.normalize('NFKC').replace(/[^\d]/g, '');

export class ClaudeOcrError extends Error {}

/** 画像（JPEG の base64）を Claude に送り、項目を取り出す */
export async function extractWithClaude(apiKey: string, jpegBase64: string, categories: string[]): Promise<ExtractResult> {
  if (!apiKey.trim()) throw new ClaudeOcrError('Claude API キーが設定されていません（設定画面で入力してください）');
  // ブラウザ／アプリから直接呼ぶため dangerouslyAllowBrowser を有効にする（キーは利用者自身のもの）
  const client = new Anthropic({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120_000 });
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 16000,
      // 安全判定で断られた場合に、推奨の代替モデルでサーバー側が自動で再実行する
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpegBase64 } },
            { type: 'text', text: instructions(categories) },
          ],
        },
      ],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeOcrError('APIキーが正しくありません（設定画面で確認してください）');
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeOcrError('利用上限に達しました。しばらく待ってからもう一度お試しください');
    if (e instanceof Anthropic.APIConnectionError) throw new ClaudeOcrError('インターネットに接続できません（Claude API はネット接続が必要です）');
    if (e instanceof Anthropic.APIError) throw new ClaudeOcrError(`Claude API エラー（${e.status ?? '不明'}）：${e.message}`);
    throw e;
  }
  if (response.stop_reason === 'refusal') throw new ClaudeOcrError('この画像は読み取りを断られました。手入力してください');
  const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let data: ClaudeReceipt;
  try {
    data = JSON.parse(text) as ClaudeReceipt;
  } catch {
    throw new ClaudeOcrError(response.stop_reason === 'max_tokens' ? '読み取り結果が長すぎて途中で切れました' : '読み取り結果を解釈できませんでした');
  }
  return toExtractResult(data, categories);
}

export function toExtractResult(d: ClaudeReceipt, categories: string[]): ExtractResult {
  const fields: Partial<ReceiptFields> = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : '',
    vendor: d.vendor.trim(),
    total: digits(d.total),
    regNo: d.registration_number ? normalizeRegNo(d.registration_number) : '',
    description: d.description.trim(),
    amount10: digits(d.amount_10),
    tax10: digits(d.tax_10),
    amount8: digits(d.amount_8),
    tax8: digits(d.tax_8),
    payment: d.payment_method,
    category: categories.includes(d.category) ? d.category : '',
  };
  const c = (v: string | undefined, conf: 'high' | 'low'): Confidence => (!v ? 'missing' : conf);
  const confidence: ConfidenceMap = {
    date: c(fields.date, d.confidence.date),
    vendor: c(fields.vendor, d.confidence.vendor),
    total: c(fields.total, d.confidence.total),
    regNo: c(fields.regNo, d.confidence.registration_number),
    payment: c(fields.payment, d.confidence.payment_method),
    description: fields.description ? 'low' : 'missing',
    category: fields.category ? 'low' : 'missing',
  };
  for (const k of ['amount10', 'tax10', 'amount8', 'tax8'] as FieldKey[]) {
    confidence[k] = c(fields[k], d.confidence.amounts);
  }
  if (!fields.amount8 && !fields.tax8) {
    delete confidence.amount8;
    delete confidence.tax8;
  }
  return { fields, confidence, rawText: d.raw_text, engine: 'claude' };
}
