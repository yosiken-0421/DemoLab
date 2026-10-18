import React, { useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { Button, Card, colors, Field, IconButton, Muted, Notice, Row, Screen, sizes } from '@demolab/shared';
import { useApp } from '@/lib/AppContext';
import { SECTION_LABEL, Settings } from '@/lib/types';

export default function SettingsScreen() {
  const { settings, updateSettings } = useApp();
  const [newType, setNewType] = useState('');
  const set = (patch: Partial<Settings>) => updateSettings({ ...settings, ...patch });

  const move = (i: number, d: -1 | 1) => {
    const s = [...settings.sections];
    const j = i + d;
    if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]];
    set({ sections: s });
  };

  return (
    <Screen>
      <Card title="氏名">
        <Field value={settings.name} onChangeText={(v) => set({ name: v })} placeholder="例：山田 太郎" />
        <Muted>日報とExcel出力に使います。</Muted>
      </Card>

      <Card title="勤務区分の候補">
        {settings.workTypes.map((t, i) => (
          <Row key={`${t}${i}`} style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontSize: sizes.font, color: colors.ink }}>{t}</Text>
            <IconButton label="✕" color={colors.danger} accessibilityLabel={`${t}を削除`} onPress={() => set({ workTypes: settings.workTypes.filter((_, j) => j !== i) })} />
          </Row>
        ))}
        <Row>
          <View style={{ flex: 1 }}>
            <Field value={newType} onChangeText={setNewType} placeholder="例：夜勤" />
          </View>
          <Button
            label="追加"
            variant="secondary"
            disabled={!newType.trim()}
            onPress={() => {
              set({ workTypes: [...settings.workTypes, newType.trim()] });
              setNewType('');
            }}
            style={{ marginBottom: 12 }}
          />
        </Row>
      </Card>

      <Card title="日報の項目（オン／オフ・並べ替え）">
        <Muted>業種に合わせて、使わない項目はオフにできます。↑↓で順番を変えられます。</Muted>
        <ToggleRow label="基本情報：体調" value={settings.showCondition} onChange={(v) => set({ showCondition: v })} />
        <ToggleRow label="基本情報：天候" value={settings.showWeather} onChange={(v) => set({ showWeather: v })} />
        {settings.sections.map((s, i) => (
          <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}>
            <Switch value={s.enabled} onValueChange={(v) => set({ sections: settings.sections.map((x) => (x.key === s.key ? { ...x, enabled: v } : x)) })} />
            <Text style={{ flex: 1, fontSize: sizes.font - 1, color: s.enabled ? colors.ink : colors.disabled }}>{SECTION_LABEL[s.key]}</Text>
            <IconButton label="↑" accessibilityLabel="上へ" disabled={i === 0} onPress={() => move(i, -1)} />
            <IconButton label="↓" accessibilityLabel="下へ" disabled={i === settings.sections.length - 1} onPress={() => move(i, 1)} />
          </View>
        ))}
      </Card>

      <Card title="数値記録のひな形">
        <Muted>新しい日報を開いたときに、ここの項目と目標値が最初から入ります。</Muted>
        {settings.metricTemplates.map((m, i) => {
          const upd = (patch: Partial<typeof m>) => set({ metricTemplates: settings.metricTemplates.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <View key={i} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}>
              <Row>
                <View style={{ flex: 2 }}>
                  <Field label="項目名" value={m.name} onChangeText={(v) => upd({ name: v })} placeholder="訪問件数" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="単位" value={m.unit} onChangeText={(v) => upd({ unit: v })} placeholder="件" />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field label="目標" keyboardType="decimal-pad" value={m.target} onChangeText={(v) => upd({ target: v })} />
                </View>
                <Button label="削除" variant="danger" onPress={() => set({ metricTemplates: settings.metricTemplates.filter((_, j) => j !== i) })} style={{ marginBottom: 12 }} />
              </Row>
            </View>
          );
        })}
        <Button label="＋ ひな形を追加" variant="secondary" onPress={() => set({ metricTemplates: [...settings.metricTemplates, { name: '', unit: '', target: '' }] })} />
      </Card>

      <Notice>
        {Platform.OS === 'web'
          ? 'Web版のデータは、このブラウザの中だけに保存されます（スマホのアプリとは同期しません）。ブラウザの「閲覧データを削除」で消えるため、定期的にExcel出力して保管してください。'
          : 'データはこの端末の中だけに保存されます。機種変更やアプリ削除で消えるため、定期的にExcel出力して保管してください。'}
      </Notice>
    </Screen>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }}>
      <Switch value={value} onValueChange={onChange} />
      <Text style={{ flex: 1, fontSize: sizes.font - 1, color: colors.ink }}>{label}</Text>
    </View>
  );
}
