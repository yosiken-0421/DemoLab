import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Card, Chips, colors, Field, isValidYmd, monthRange, Muted, Row, Screen, sizes, yearRange } from '@demolab/shared';
import { ReceiptRow } from '@/components/ReceiptRow';
import { searchReceipts } from '@/lib/db';
import type { Receipt } from '@/lib/types';
import { formatYen, toYen } from '@/lib/validate';

const PERIODS = ['今月', '先月', '今年', 'すべて', '期間指定'] as const;
const STATUSES = ['すべて', '未精算', '精算済'] as const;

export default function ListScreen() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>('今月');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [vendor, setVendor] = useState('');
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('すべて');
  const [deleted, setDeleted] = useState(false);
  const [rows, setRows] = useState<Receipt[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async () => {
    const now = new Date();
    let range: [string, string] | null = null;
    if (period === '今月') range = monthRange(now.getFullYear(), now.getMonth() + 1);
    else if (period === '先月') {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      range = monthRange(d.getFullYear(), d.getMonth() + 1);
    } else if (period === '今年') range = yearRange(now.getFullYear());
    else if (period === '期間指定') {
      if ((from && !isValidYmd(from)) || (to && !isValidYmd(to))) {
        setError('日付は「2026-10-01」の形式で入力してください');
        return;
      }
      range = [from, to];
    }
    if ((min && toYen(min) === null) || (max && toYen(max) === null)) {
      setError('金額は数字で入力してください');
      return;
    }
    setError(null);
    setRows(
      await searchReceipts({
        from: range?.[0] || undefined,
        to: range?.[1] || undefined,
        min: min ? toYen(min) : null,
        max: max ? toYen(max) : null,
        vendor,
        status: status === '未精算' ? 'unsettled' : status === '精算済' ? 'settled' : '',
        includeDeleted: deleted,
      }),
    );
  }, [period, from, to, min, max, vendor, status, deleted]);

  useFocusEffect(
    useCallback(() => {
      void search();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const total = (rows ?? []).filter((r) => !r.deleted_at).reduce((n, r) => n + r.total, 0);

  return (
    <Screen>
      <Card title="検索">
        <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink }}>取引年月日</Text>
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
        <Row>
          <View style={{ flex: 1 }}>
            <Field label="金額（以上）" value={min} onChangeText={setMin} keyboardType="number-pad" placeholder="0" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="金額（以下）" value={max} onChangeText={setMax} keyboardType="number-pad" placeholder="上限なし" />
          </View>
        </Row>
        <Field label="取引先" hint="一部だけでも可" value={vendor} onChangeText={setVendor} placeholder="例：交通" onSubmitEditing={search} returnKeyType="search" />
        <Chips options={STATUSES} value={status} onChange={(v) => v && setStatus(v)} />
        <Chips options={['削除済みも表示'] as const} value={deleted ? '削除済みも表示' : ''} onChange={(v) => setDeleted(!!v)} allowEmpty />
        {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
        <Button label="検索する" onPress={search} />
      </Card>

      {rows ? (
        <Card title={`${rows.length}件`} right={<Text style={{ fontSize: sizes.font, fontWeight: '800', color: colors.primaryDark }}>合計 {formatYen(total)}</Text>}>
          {rows.length === 0 ? <Muted>該当する領収書はありません。</Muted> : null}
          {rows.map((r) => (
            <ReceiptRow key={r.id} r={r} />
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
