import React, { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Button, Card, colors, exportFile, localIso, Muted, Notice, Screen, sizes, XLSX_MIME } from '@demolab/shared';
import { buildXlsx, Cell } from '@demolab/shared/src/xlsx/writer';
import { useApp } from '@/lib/AppContext';
import { pickFromLibrary } from '@/lib/capture';
import { extractWithClaude } from '@/lib/claude';
import { prepareForOcr } from '@/lib/image';
import { deviceOcr, DEVICE_OCR_NAME } from '@/lib/ocr';
import { parseReceiptText } from '@/lib/parse';
import type { ExtractResult, FieldKey } from '@/lib/types';
import { FIELD_LABEL } from '@/lib/types';

interface Row {
  name: string;
  uri: string;
  results: { engine: string; ms: number; result?: ExtractResult; error?: string }[];
}

const KEYS: FieldKey[] = ['date', 'vendor', 'total', 'regNo', 'amount10', 'tax10', 'amount8', 'tax8', 'payment'];

export default function OcrTestScreen() {
  const { settings, apiKey } = useApp();
  const [rows, setRows] = useState<Row[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  const timed = async (engine: string, fn: () => Promise<ExtractResult>): Promise<Row['results'][number]> => {
    const t = Date.now();
    try {
      const result = await fn();
      return { engine, ms: Date.now() - t, result };
    } catch (e) {
      return { engine, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) };
    }
  };

  const run = async () => {
    const uris = await pickFromLibrary();
    if (!uris.length) return;
    const out: Row[] = [];
    for (const [i, uri] of uris.entries()) {
      setProgress(`${i + 1} / ${uris.length} 枚目を読み取り中…`);
      const prepared = await prepareForOcr(uri);
      const results: Row['results'] = [];
      results.push(await timed(DEVICE_OCR_NAME, async () => parseReceiptText(await deviceOcr(prepared.uri), settings.categories)));
      if (apiKey) results.push(await timed('Claude API', () => extractWithClaude(apiKey, prepared.base64, settings.categories)));
      out.push({ name: `画像${i + 1}`, uri, results });
      setRows([...out]);
    }
    setProgress(null);
  };

  const exportXlsx = async () => {
    const header: Cell[] = ['画像', '方式', '所要時間(秒)', ...KEYS.map((k) => FIELD_LABEL[k]), 'エラー', '認識テキスト'].map((v) => ({ v, s: 'header' as const }));
    const truthRow = (name: string): Cell[] => [name, '正解（手で記入）', '', ...KEYS.map(() => '')];
    const body: Cell[][] = rows.flatMap((r) => [
      ...r.results.map((x): Cell[] => [r.name, x.engine, Math.round(x.ms / 100) / 10, ...KEYS.map((k) => x.result?.fields[k] ?? ''), x.error ?? '', { v: x.result?.rawText ?? '', s: 'wrap' }]),
      truthRow(r.name),
    ]);
    const bytes = await buildXlsx([{ name: 'OCR精度テスト', rows: [header, ...body], freezeHeader: true, widths: [8, 26, 10, 12, 20, 10, 17, 10, 10, 10, 10, 12, 20, 60] }]);
    await exportFile(`OCR精度テスト_${localIso(new Date()).slice(0, 16).replace(/[T:]/g, '-')}.xlsx`, bytes, XLSX_MIME);
  };

  return (
    <Screen>
      <Card title="使い方">
        <Muted>
          1. 実際のレシート・領収書の写真を何枚か選びます。{'\n'}2. 同じ写真を {DEVICE_OCR_NAME}{apiKey ? ' と Claude API' : ''} で読み取り、結果を並べて表示します（ここでは登録しません）。{'\n'}3. 「Excelに出力」すると「正解」行が空欄で入るので、領収書を見ながら記入すると項目ごとの正解率を数えられます。
        </Muted>
        {!apiKey ? <Notice tone="warn">Claude API キーが未設定のため、端末内OCRだけで比較します。</Notice> : null}
        <Button label="写真を選んでテストする" onPress={run} disabled={!!progress} />
        {progress ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: sizes.font }}>{progress}</Text>
          </View>
        ) : null}
        {rows.length && !progress ? <Button label="結果をExcelに出力" variant="secondary" onPress={exportXlsx} /> : null}
      </Card>
      {rows.map((r) => (
        <Card key={r.name} title={r.name}>
          <Image source={{ uri: r.uri }} resizeMode="contain" style={{ width: '100%', height: 180, backgroundColor: '#0d1726', borderRadius: 10 }} />
          {r.results.map((x) => (
            <View key={x.engine} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 8, gap: 2 }}>
              <Text style={{ fontSize: sizes.font - 1, fontWeight: '700', color: colors.ink }}>
                {x.engine}（{(x.ms / 1000).toFixed(1)}秒）
              </Text>
              {x.error ? <Text style={{ color: colors.danger }}>{x.error}</Text> : null}
              {x.result
                ? KEYS.map((k) => (
                    <Text key={k} style={{ fontSize: sizes.small, color: x.result!.confidence[k] === 'high' ? colors.ink : x.result!.confidence[k] === 'low' ? '#7a5210' : colors.danger }}>
                      {FIELD_LABEL[k]}：{x.result!.fields[k] || '—'}
                    </Text>
                  ))
                : null}
            </View>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
