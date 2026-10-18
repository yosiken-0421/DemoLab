import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button, Card, colors, exportFile, IconButton, Muted, Notice, Row, Screen, Sheet, sizes, XLSX_MIME } from '@demolab/shared';
import { ReceiptRow, StatusBadge } from '@/components/ReceiptRow';
import { useApp } from '@/lib/AppContext';
import { searchReceipts, setSettled } from '@/lib/db';
import { periodOf } from '@/lib/period';
import type { Receipt } from '@/lib/types';
import { formatYen } from '@/lib/validate';
import { categoryTotals, expenseWorkbook } from '@/lib/workbook';

export default function SettleScreen() {
  const { settings } = useApp();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [rows, setRows] = useState<Receipt[]>([]);
  const [ask, setAsk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const p = periodOf('月ごと', ym.y, ym.m);

  const load = useCallback(async () => {
    setRows(await searchReceipts({ from: p.range[0], to: p.range[1] }));
  }, [p.range[0], p.range[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shift = (d: number) => {
    const t = new Date(ym.y, ym.m - 1 + d, 1);
    setYm({ y: t.getFullYear(), m: t.getMonth() + 1 });
    setMessage(null);
  };

  const total = rows.reduce((n, r) => n + r.total, 0);
  const unsettled = rows.filter((r) => r.status === 'unsettled');
  const unsettledTotal = unsettled.reduce((n, r) => n + r.total, 0);

  return (
    <Screen>
      <Row style={{ justifyContent: 'center' }}>
        <IconButton label="◀" accessibilityLabel="前の月" onPress={() => shift(-1)} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, minWidth: 150, textAlign: 'center' }}>
          {ym.y}年{ym.m}月
        </Text>
        <IconButton label="▶" accessibilityLabel="次の月" onPress={() => shift(1)} />
      </Row>

      <Card title="精算書">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Stat label={`合計（${rows.length}件）`} value={formatYen(total)} strong />
          <Stat label={`未精算（${unsettled.length}件）`} value={formatYen(unsettledTotal)} />
          <Stat label={`精算済（${rows.length - unsettled.length}件）`} value={formatYen(total - unsettledTotal)} />
        </View>
        <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink, marginTop: 6 }}>勘定科目別の合計</Text>
        {categoryTotals(rows).map((c) => (
          <View key={c.category} style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.line, paddingVertical: 8 }}>
            <Text style={{ fontSize: sizes.font - 1, color: colors.ink }}>
              {c.category}（{c.count}件）
            </Text>
            <Text style={{ fontSize: sizes.font - 1, fontWeight: '700', color: colors.ink }}>{formatYen(c.total)}</Text>
          </View>
        ))}
        {rows.length === 0 ? <Muted>この月の領収書はありません。</Muted> : null}
        <Button label={`未精算 ${unsettled.length}件をすべて精算済みにする`} variant="accent" disabled={!unsettled.length} onPress={() => setAsk(true)} />
        <Button
          label="この月の精算書をExcelで出力"
          variant="secondary"
          disabled={!rows.length}
          onPress={async () => {
            const name = `経費精算書_${p.label}.xlsx`;
            await exportFile(name, await expenseWorkbook(rows, p.months, settings.categories), XLSX_MIME);
            setMessage(`${name} を出力しました`);
          }}
        />
        {message ? <Notice>{message}</Notice> : null}
      </Card>

      <Card title="明細（タップで詳細／右の札で精算状況を切り替え）">
        {rows.map((r) => (
          <ReceiptRow
            key={r.id}
            r={r}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={r.status === 'settled' ? '未精算に戻す' : '精算済みにする'}
                onPress={async () => {
                  await setSettled([r.id], r.status !== 'settled');
                  await load();
                }}
                style={{ minHeight: 40, justifyContent: 'center' }}
              >
                <StatusBadge status={r.status} />
              </Pressable>
            }
          />
        ))}
      </Card>

      <Sheet visible={ask} title="精算済みにする" onClose={() => setAsk(false)}>
        <Text style={{ fontSize: sizes.font, lineHeight: 28 }}>
          {ym.y}年{ym.m}月の未精算 {unsettled.length}件（{formatYen(unsettledTotal)}）を精算済みにします。
        </Text>
        <Button
          label="精算済みにする"
          onPress={async () => {
            await setSettled(unsettled.map((r) => r.id), true);
            setAsk(false);
            await load();
          }}
        />
      </Sheet>
    </Screen>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexBasis: strong ? '100%' : '47%', flexGrow: 1, backgroundColor: strong ? colors.primarySoft : colors.bg, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontSize: sizes.small, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: strong ? 30 : 22, fontWeight: '800', color: strong ? colors.primaryDark : colors.ink }}>{value}</Text>
    </View>
  );
}
