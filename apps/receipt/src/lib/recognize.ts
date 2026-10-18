import { ClaudeOcrError, extractWithClaude } from './claude';
import { prepareForOcr } from './image';
import { deviceOcr } from './ocr';
import { needsFallback, parseReceiptText } from './parse';
import type { ExtractResult, Settings } from './types';

/**
 * 写真1枚を読み取る。前処理（縮小・明るさ補正）→ 設定に応じて端末内OCR／Claude。
 * 「自動」は端末内OCRで日付か金額の自信が低いときだけ Claude に回す（通信・費用を節約）。
 */
export async function recognize(uri: string, settings: Settings, apiKey: string): Promise<ExtractResult> {
  const prepared = await prepareForOcr(uri);
  const cats = settings.categories;
  if (settings.ocrMode === 'claude') return extractWithClaude(apiKey, prepared.base64, cats);

  let device: ExtractResult | null = null;
  let deviceError: string | null = null;
  try {
    device = parseReceiptText(await deviceOcr(prepared.uri), cats);
  } catch (e) {
    deviceError = e instanceof Error ? e.message : String(e);
  }
  const wantClaude = settings.ocrMode === 'auto' && !!apiKey && (!device || needsFallback(device));
  if (wantClaude) {
    try {
      const r = await extractWithClaude(apiKey, prepared.base64, cats);
      return { ...r, note: device ? '端末内OCRの結果に自信が低い項目があったため、Claude API で読み取りました' : undefined };
    } catch (e) {
      if (device) return { ...device, note: `Claude API での再読み取りに失敗したため、端末内OCRの結果を表示しています（${e instanceof ClaudeOcrError ? e.message : String(e)}）` };
      throw e;
    }
  }
  if (!device) throw new Error(deviceError ?? '読み取りに失敗しました');
  return device;
}
