import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chips, colors, exportFile, IconButton, monthRange, Muted, Notice, pickFiles, Row, Screen, sizes, XLSX_MIME, yearRange } from '@demolab/shared';
import { useApp } from '@/lib/AppContext';
import { historyOf, manualBreaksBetween, punchesBetween, reportsBetween } from '@/lib/db';
import { buildRecords, exportWorkbook, mergeParsed, ParsedFile, parseNippoWorkbook } from '@/lib/workbook';

const MONTHS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] as const;

export default function ExportScreen() {
  const { settings } = useApp();
  const now = new Date();
  const [mode, setMode] = useState<'月ごと' | '年ごと'>('月ごと');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(String(now.getMonth() + 1) as (typeof MONTHS)[number]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [includeMine, setIncludeMine] = useState(true);

  const range = mode === '月ごと' ? monthRange(year, Number(month)) : yearRange(year);
  const periodLabel = mode === '月ごと' ? `${year}-${month.padStart(2, '0')}` : `${year}`;
  const name = settings.name || '氏名未設定';

  const myRecords = async () => {
    const punches = await punchesBetween(range[0], range[1]);
    return buildRecords({
      name,
      punches,
      history: await historyOf(punches.map((p) => p.id)),
      manualBreaks: await manualBreaksBetween(range[0], range[1]),
      reports: await reportsBetween(range[0], range[1]),
    });
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ tone: 'info', text: await fn() });
    } catch (e) {
      setMessage({ tone: 'danger', text: `出力できませんでした：${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const exportMine = () =>
    run(async () => {
      const r = await myRecords();
      if (!r.attendance.length && !r.reports.length) return 'この期間のデータはありません。';
      const bytes = await exportWorkbook(r.attendance, r.reports);
      const fileName = `日報_${name}_${periodLabel}.xlsx`;
      await exportFile(fileName, bytes, XLSX_MIME);
      return `${fileName} を出力しました（勤怠 ${r.attendance.length}日／日報 ${r.reports.length}件）。`;
    });

  const addFiles = async () => {
    const picked = await pickFiles([XLSX_MIME, '.xlsx']);
    const parsed = await Promise.all(picked.map((f) => parseNippoWorkbook(f.name, f.bytes)));
    setFiles((cur) => [...cur, ...parsed]);
  };

  const exportMerged = () =>
    run(async () => {
      const ok = files.filter((f) => !f.error);
      const sources = includeMine ? [{ fileName: 'この端末', ...(await myRecords()) }, ...ok] : ok;
      const merged = mergeParsed(sources);
      if (!merged.attendance.length && !merged.reports.length) return '統合するデータがありません。';
      const people = new Set([...merged.attendance.map((r) => r.name), ...merged.reports.map((r) => r.氏名)]);
      const bytes = await exportWorkbook(merged.attendance, merged.reports, true);
      const fileName = `日報統合_${includeMine ? periodLabel : new Date().toISOString().slice(0, 10)}_${people.size}名.xlsx`;
      await exportFile(fileName, bytes, XLSX_MIME);
      return `${fileName} を出力しました（${people.size}名分）。${merged.duplicates ? `同じ氏名・日付の重複 ${merged.duplicates}件は、後から選んだファイルの内容を使いました。` : ''}`;
    });

  return (
    <Screen>
      <Card title="Excelに出力">
        <Muted>シートは「勤怠一覧」「日報一覧」の2つです。</Muted>
        <Chips options={['月ごと', '年ごと'] as const} value={mode} onChange={(v) => v && setMode(v)} />
        <Row style={{ justifyContent: 'center' }}>
          <IconButton label="◀" accessibilityLabel="前の年" onPress={() => setYear(year - 1)} />
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, minWidth: 100, textAlign: 'center' }}>{year}年</Text>
          <IconButton label="▶" accessibilityLabel="次の年" onPress={() => setYear(year + 1)} />
        </Row>
        {mode === '月ごと' ? <Chips options={MONTHS} labels={Object.fromEntries(MONTHS.map((m) => [m, `${m}月`]))} value={month} onChange={(v) => v && setMonth(v)} /> : null}
        <Button label={`${mode === '月ごと' ? `${year}年${month}月` : `${year}年`}分を出力`} onPress={exportMine} loading={busy} />
      </Card>

      <Card title="複数人分を統合">
        <Muted>
          各自がこのアプリで出力したExcelを集めて読み込むと、全員分を1つのExcelにまとめます（氏名の列付き＋「人別集計」シート）。メールやLINE、共有フォルダなどで集めたファイルを選んでください。
        </Muted>
        <Button label="Excelファイルを選ぶ（複数可）" variant="secondary" onPress={addFiles} />
        {files.map((f, i) => (
          <View key={`${f.fileName}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: sizes.font - 1, fontWeight: '700', color: colors.ink }}>{f.fileName}</Text>
              {f.error ? (
                <Text style={{ color: colors.danger, fontSize: sizes.small }}>{f.error}</Text>
              ) : (
                <Muted>
                  {[...new Set(f.attendance.map((r) => r.name))].join('・') || '—'}／勤怠 {f.attendance.length}行・日報 {f.reports.length}行
                </Muted>
              )}
            </View>
            <IconButton label="✕" accessibilityLabel="このファイルを外す" color={colors.danger} onPress={() => setFiles(files.filter((_, j) => j !== i))} />
          </View>
        ))}
        <Chips
          options={['含める', '含めない'] as const}
          value={includeMine ? '含める' : '含めない'}
          onChange={(v) => setIncludeMine(v === '含める')}
        />
        <Muted>この端末のデータ（上で選んだ期間：{periodLabel}）を{includeMine ? '含めます' : '含めません'}。</Muted>
        <Button label="統合したExcelを出力" onPress={exportMerged} loading={busy} disabled={!files.some((f) => !f.error) && !includeMine} />
      </Card>

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
    </Screen>
  );
}
