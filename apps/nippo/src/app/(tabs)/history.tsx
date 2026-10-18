import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Button, Card, Chips, colors, Field, formatDayJa, isValidYmd, minutesToHm, monthRange, Muted, Row, Screen, sizes, VoiceField, yearRange } from '@demolab/shared';
import { summarizeDay } from '@/lib/attendance';
import { manualBreaksBetween, punchesBetween, reportText, searchReports } from '@/lib/db';
import type { ReportData } from '@/lib/types';

const PERIODS = ['今月', '先月', '今年', 'すべて', '期間指定'] as const;
type Period = (typeof PERIODS)[number];

function rangeOf(p: Period, from: string, to: string): [string, string] | null {
  const now = new Date();
  if (p === '今月') return monthRange(now.getFullYear(), now.getMonth() + 1);
  if (p === '先月') {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return monthRange(d.getFullYear(), d.getMonth() + 1);
  }
  if (p === '今年') return yearRange(now.getFullYear());
  if (p === 'すべて') return ['0000-01-01', '9999-12-31'];
  if (!isValidYmd(from) || !isValidYmd(to)) return null;
  return from <= to ? [from, to] : [to, from];
}

function snippet(d: ReportData, keyword: string): string {
  const lines = reportText(d).split('\n').map((l) => l.trim()).filter(Boolean);
  const w = keyword.trim().split(/[\s　]+/)[0]?.toLowerCase();
  const hit = w ? lines.find((l) => l.toLowerCase().includes(w)) : undefined;
  const s = hit ?? lines.find((l) => l !== d.workType && l !== d.condition && l !== d.weather) ?? '';
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

export default function HistoryScreen() {
  const [period, setPeriod] = useState<Period>('今月');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [results, setResults] = useState<{ work_date: string; data: ReportData; work: number | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const r = rangeOf(period, from, to);
    if (!r) {
      setError('期間は「2026-10-01」の形式で入力してください');
      return;
    }
    setError(null);
    const reports = await searchReports(r[0], r[1], keyword);
    const punches = await punchesBetween(r[0], r[1]);
    const breaks = await manualBreaksBetween(r[0], r[1]);
    setResults(
      reports.map((x) => {
        const ps = punches.filter((p) => p.work_date === x.work_date);
        return { ...x, work: ps.some((p) => !p.canceled) ? summarizeDay(ps, breaks.get(x.work_date) ?? null).workMinutes : null };
      }),
    );
  }, [period, from, to, keyword]);

  useFocusEffect(
    useCallback(() => {
      void search();
      // 画面に戻ったときだけ再検索する
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <Screen>
      <Card title="日報を検索">
        <VoiceField label="キーワード" hint="スペース区切りで複数指定（すべて含むもの）" multiline={false} value={keyword} onChangeText={setKeyword} placeholder="例：A社 見積" onSubmitEditing={search} returnKeyType="search" />
        <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink }}>期間</Text>
        <Chips options={PERIODS} value={period} onChange={(v) => v && setPeriod(v)} />
        {period === '期間指定' ? (
          <Row>
            <View style={{ flex: 1 }}>
              <Field label="開始日" value={from} onChangeText={setFrom} placeholder="2026-10-01" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="終了日" value={to} onChangeText={setTo} placeholder="2026-10-31" />
            </View>
          </Row>
        ) : null}
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <Button label="検索する" onPress={search} />
      </Card>

      {results ? <Muted>{results.length}件見つかりました（新しい順）</Muted> : null}
      {results?.map((r) => (
        <Pressable
          key={r.work_date}
          accessibilityRole="button"
          onPress={() => router.navigate({ pathname: '/report', params: { date: r.work_date } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: sizes.font, fontWeight: '700', color: colors.ink }}>{formatDayJa(r.work_date)}</Text>
              <Text style={{ fontSize: sizes.small, color: colors.primaryDark, fontWeight: '700' }}>{r.work !== null ? minutesToHm(r.work) : ''}</Text>
            </View>
            {r.data.workType ? <Muted>{r.data.workType}</Muted> : null}
            <Text style={{ fontSize: sizes.small + 1, color: colors.ink, lineHeight: 22 }}>{snippet(r.data, keyword) || '（本文なし）'}</Text>
            <Text style={{ color: colors.accent, fontSize: sizes.small, fontWeight: '700' }}>開いて編集 ›</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
