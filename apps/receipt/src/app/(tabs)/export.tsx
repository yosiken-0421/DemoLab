import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Chips, colors, exportFile, IconButton, Muted, Notice, Row, Screen, XLSX_MIME, ZIP_MIME } from '@demolab/shared';
import { useApp } from '@/lib/AppContext';
import { searchReceipts } from '@/lib/db';
import { periodOf } from '@/lib/period';
import { expenseWorkbook, ocrWorkbook } from '@/lib/workbook';
import { buildPhotoZip } from '@/lib/zip';

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

export default function ExportScreen() {
  const { settings } = useApp();
  const now = new Date();
  const [mode, setMode] = useState<'月ごと' | '年ごと'>('月ごと');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(String(now.getMonth() + 1) as (typeof MONTHS)[number]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const p = periodOf(mode, year, Number(month));

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    setMessage(null);
    try {
      setMessage({ tone: 'info', text: await fn() });
    } catch (e) {
      setMessage({ tone: 'danger', text: `出力できませんでした：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const rows = () => searchReceipts({ from: p.range[0], to: p.range[1] });

  return (
    <Screen>
      <Card title="期間">
        <Chips options={['月ごと', '年ごと'] as const} value={mode} onChange={(v) => v && setMode(v)} />
        <Row style={{ justifyContent: 'center' }}>
          <IconButton label="◀" accessibilityLabel="前の年" onPress={() => setYear(year - 1)} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, minWidth: 100, textAlign: 'center' }}>{year}年</Text>
          <IconButton label="▶" accessibilityLabel="次の年" onPress={() => setYear(year + 1)} />
        </Row>
        {mode === '月ごと' ? <Chips options={MONTHS} labels={Object.fromEntries(MONTHS.map((m) => [m, `${m}月`]))} value={month} onChange={(v) => v && setMonth(v)} /> : null}
      </Card>

      <Card title="経費のExcel">
        <Muted>シート：「明細」「科目別集計」「月別集計」</Muted>
        <Button
          label="Excelを出力"
          loading={busy === 'xlsx'}
          onPress={() =>
            run('xlsx', async () => {
              const r = await rows();
              if (!r.length) return 'この期間の領収書はありません。';
              const name = `経費_${p.label}.xlsx`;
              await exportFile(name, await expenseWorkbook(r, p.months, settings.categories), XLSX_MIME);
              return `${name} を出力しました（${r.length}件）`;
            })
          }
        />
      </Card>

      <Card title="OCR結果の一覧">
        <Muted>画像ファイル名と、読み取った文字（認識テキスト）の対応表です。ファイル名は写真ZIP内の名前と一致します。</Muted>
        <Button
          label="OCR結果一覧を出力（Excel）"
          variant="secondary"
          loading={busy === 'ocr'}
          onPress={() =>
            run('ocr', async () => {
              const r = await rows();
              if (!r.length) return 'この期間の領収書はありません。';
              const name = `OCR結果_${p.label}.xlsx`;
              await exportFile(name, await ocrWorkbook(r), XLSX_MIME);
              return `${name} を出力しました（${r.length}件）`;
            })
          }
        />
      </Card>

      <Card title="写真をまとめて出力（ZIP）">
        <Muted>写真と「経費明細.xlsx」を1つのZIPファイルにまとめます。</Muted>
        <Button
          label="写真をZIPで出力"
          variant="secondary"
          loading={busy === 'zip'}
          onPress={() =>
            run('zip', async () => {
              const r = await rows();
              if (!r.length) return 'この期間の領収書はありません。';
              const z = await buildPhotoZip(r, p.months, settings.categories);
              const name = `領収書写真_${p.label}.zip`;
              await exportFile(name, z.bytes, ZIP_MIME);
              return `${name} を出力しました（写真 ${z.photos}枚${z.missing ? `、見つからない写真 ${z.missing}枚` : ''}）`;
            })
          }
        />
      </Card>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Screen>
  );
}
