import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { addDays, Button, Chips, colors, Field, Label, Row, sizes, VoiceField, ymd } from '@demolab/shared';
import type { Confidence, ConfidenceMap, FieldKey, ReceiptFields } from '@/lib/types';
import { FIELD_LABEL } from '@/lib/types';
import { amountsConsistent, FieldErrors, formatYen, taxFromInclusive, toYen } from '@/lib/validate';

interface Props {
  fields: ReceiptFields;
  onChange: (f: ReceiptFields) => void;
  confidence?: ConfidenceMap;
  onConfirm?: (k: FieldKey) => void; // 「確認済み」にして色を消す
  errors?: FieldErrors;
  categories: string[];
  payments: string[];
}

const tone = (c?: Confidence) => (c === 'low' ? 'warn' : c === 'missing' ? 'danger' : undefined);

export function ConfidenceLegend() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Badge c="low" />
      <Text style={{ fontSize: sizes.small, color: colors.muted, alignSelf: 'center' }}>＝読み取りに自信がない</Text>
      <Badge c="missing" />
      <Text style={{ fontSize: sizes.small, color: colors.muted, alignSelf: 'center' }}>＝読み取れなかった</Text>
    </View>
  );
}

function Badge({ c }: { c: Confidence }) {
  if (c === 'high') return null;
  const warn = c === 'low';
  return (
    <View style={{ backgroundColor: warn ? colors.warnSoft : colors.dangerSoft, borderColor: warn ? colors.warn : colors.danger, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: warn ? '#7a5210' : colors.danger }}>{warn ? '要確認' : '読み取れず'}</Text>
    </View>
  );
}

export function ReceiptForm({ fields, onChange, confidence = {}, onConfirm, errors = {}, categories, payments }: Props) {
  const set = (k: FieldKey, v: string) => {
    onChange({ ...fields, [k]: v });
    if (confidence[k] && confidence[k] !== 'high') onConfirm?.(k);
  };

  const head = (k: FieldKey, hint?: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
      <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink }}>{FIELD_LABEL[k]}</Text>
      {confidence[k] && confidence[k] !== 'high' ? (
        <>
          <Badge c={confidence[k]!} />
          {confidence[k] === 'low' && onConfirm ? (
            <Pressable onPress={() => onConfirm(k)} accessibilityRole="button" accessibilityLabel={`${FIELD_LABEL[k]}を確認済みにする`} style={{ minHeight: 36, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 18, borderWidth: 1, borderColor: colors.primary }}>
              <Text style={{ color: colors.primaryDark, fontSize: 13, fontWeight: '700' }}>✓ 正しい</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
      {hint ? <Text style={{ fontSize: 13, color: colors.muted }}>{hint}</Text> : null}
    </View>
  );

  const total = toYen(fields.total);
  const consistent = amountsConsistent(fields);

  return (
    <View style={{ gap: 4 }}>
      {head('date')}
      <Field value={fields.date} onChangeText={(v) => set('date', v)} placeholder="2026-10-18" highlight={tone(confidence.date)} error={errors.date} keyboardType="numbers-and-punctuation" />
      <Row style={{ marginTop: -6, marginBottom: 8 }}>
        <Button label="今日" variant="ghost" onPress={() => set('date', ymd(new Date()))} />
        <Button label="昨日" variant="ghost" onPress={() => set('date', addDays(ymd(new Date()), -1))} />
      </Row>

      {head('vendor')}
      <Field value={fields.vendor} onChangeText={(v) => set('vendor', v)} placeholder="例：〇〇商店" highlight={tone(confidence.vendor)} />

      {head('total')}
      <Field value={fields.total} onChangeText={(v) => set('total', v)} placeholder="0" keyboardType="number-pad" highlight={tone(confidence.total)} error={errors.total} style={{ fontSize: 26, fontWeight: '700' }} />

      {head('regNo', 'T＋13桁')}
      <Field value={fields.regNo} onChangeText={(v) => set('regNo', v)} placeholder="T1234567890123" autoCapitalize="characters" highlight={tone(confidence.regNo)} error={errors.regNo} />

      {head('description')}
      <VoiceField value={fields.description} onChangeText={(v) => set('description', v)} multiline={false} placeholder="例：打合せ時のコーヒー代" />

      <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: 12, gap: 4, marginBottom: 12 }}>
        <Label>税率ごとの金額と消費税額</Label>
        <Row>
          <View style={{ flex: 1 }}>
            {head('amount10')}
            <Field value={fields.amount10} onChangeText={(v) => set('amount10', v)} keyboardType="number-pad" highlight={tone(confidence.amount10)} error={errors.amount10} />
          </View>
          <View style={{ flex: 1 }}>
            {head('tax10')}
            <Field value={fields.tax10} onChangeText={(v) => set('tax10', v)} keyboardType="number-pad" highlight={tone(confidence.tax10)} error={errors.tax10} />
          </View>
        </Row>
        <Row>
          <View style={{ flex: 1 }}>
            {head('amount8')}
            <Field value={fields.amount8} onChangeText={(v) => set('amount8', v)} keyboardType="number-pad" highlight={tone(confidence.amount8)} error={errors.amount8} />
          </View>
          <View style={{ flex: 1 }}>
            {head('tax8')}
            <Field value={fields.tax8} onChangeText={(v) => set('tax8', v)} keyboardType="number-pad" highlight={tone(confidence.tax8)} error={errors.tax8} />
          </View>
        </Row>
        {total !== null ? (
          <Row style={{ flexWrap: 'wrap', gap: 8 }}>
            <Button
              label="全額10%で計算"
              variant="secondary"
              onPress={() => onChange({ ...fields, amount10: String(total), tax10: String(taxFromInclusive(total, 10)), amount8: '', tax8: '' })}
            />
            <Button
              label="全額8%で計算"
              variant="secondary"
              onPress={() => onChange({ ...fields, amount8: String(total), tax8: String(taxFromInclusive(total, 8)), amount10: '', tax10: '' })}
            />
          </Row>
        ) : null}
        {consistent === false ? (
          <Text style={{ color: colors.danger, fontSize: sizes.small, marginTop: 6 }}>
            10%と8%の合計（{formatYen((toYen(fields.amount10) ?? 0) + (toYen(fields.amount8) ?? 0))}）が金額（{formatYen(total)}）と一致しません。領収書を確認してください。
          </Text>
        ) : null}
        <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>自動計算の消費税額は端数切り捨てです。領収書に記載の額がある場合はそちらを入力してください。</Text>
      </View>

      {head('payment')}
      <View style={{ marginBottom: 12, padding: confidence.payment && confidence.payment !== 'high' ? 6 : 0, borderRadius: 12, backgroundColor: confidence.payment === 'low' ? colors.warnSoft : 'transparent' }}>
        <Chips options={payments} value={fields.payment} onChange={(v) => set('payment', v)} allowEmpty />
      </View>

      {head('category')}
      <View style={{ marginBottom: 12, padding: confidence.category === 'low' ? 6 : 0, borderRadius: 12, backgroundColor: confidence.category === 'low' ? colors.warnSoft : 'transparent' }}>
        <Chips options={categories} value={fields.category} onChange={(v) => set('category', v)} allowEmpty />
      </View>

      {head('memo')}
      <VoiceField value={fields.memo} onChangeText={(v) => set('memo', v)} placeholder="例：A社 山田様と打合せ（2名）" />
    </View>
  );
}
