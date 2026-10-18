import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { colors, sizes } from '@demolab/shared';
import type { Receipt } from '@/lib/types';
import { formatYen } from '@/lib/validate';

export function StatusBadge({ status }: { status: Receipt['status'] }) {
  const done = status === 'settled';
  return (
    <View style={{ backgroundColor: done ? colors.primarySoft : colors.warnSoft, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: done ? colors.primaryDark : '#7a5210' }}>{done ? '精算済' : '未精算'}</Text>
    </View>
  );
}

export function ReceiptRow({ r, right }: { r: Receipt; right?: React.ReactNode }) {
  return (
    <Pressable
      onPress={() => router.push(`/receipt/${r.id}`)}
      accessibilityRole="button"
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.line, opacity: pressed ? 0.6 : 1, minHeight: 64 })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: sizes.small, color: colors.muted }}>
          {r.date}　{r.category || '未分類'}
          {r.photo ? '　📷' : ''}
          {r.deleted_at ? '　（削除済み）' : ''}
        </Text>
        <Text style={{ fontSize: sizes.font, fontWeight: '700', color: colors.ink }} numberOfLines={1}>
          {r.vendor || '（取引先なし）'}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={{ fontSize: sizes.font, fontWeight: '800', color: colors.ink }}>{formatYen(r.total)}</Text>
        {right ?? <StatusBadge status={r.status} />}
      </View>
    </Pressable>
  );
}
