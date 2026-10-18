import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  addDays,
  Button,
  Card,
  Chips,
  colors,
  DateNav,
  Field,
  formatDayJa,
  isValidYmd,
  minutesToHm,
  Muted,
  Notice,
  Row,
  Screen,
  sizes,
  VoiceField,
  ymd,
} from '@demolab/shared';
import { useApp } from '@/lib/AppContext';
import { summarizeDay } from '@/lib/attendance';
import { getManualBreak, loadReport, punchesOfDay, saveReport } from '@/lib/db';
import { CONDITIONS, emptyReport, ReportData, SECTION_LABEL, SectionKey, WEATHERS } from '@/lib/types';

export default function ReportScreen() {
  const params = useLocalSearchParams<{ date?: string }>();
  const { settings } = useApp();
  const [date, setDate] = useState(ymd(new Date()));
  const [data, setData] = useState<ReportData>(emptyReport());
  const [exists, setExists] = useState(false);
  const [workMinutes, setWorkMinutes] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ date, data });
  latest.current = { date, data };

  useEffect(() => {
    if (params.date && isValidYmd(params.date)) setDate(params.date);
  }, [params.date]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    await saveReport(latest.current.date, latest.current.data);
    setExists(true);
    setSavedAt(new Date().toTimeString().slice(0, 5));
  }, []);

  const load = useCallback(
    async (d: string) => {
      const saved = await loadReport(d);
      setExists(!!saved);
      setSavedAt(null);
      setData(
        saved ?? {
          ...emptyReport(),
          workType: settings.workTypes[0] ?? '',
          metrics: settings.metricTemplates.map((t) => ({ ...t, actual: '' })),
          nextPlans: [],
        },
      );
      const ps = await punchesOfDay(d);
      setWorkMinutes(ps.some((p) => !p.canceled) ? summarizeDay(ps, await getManualBreak(d)).workMinutes : null);
    },
    [settings],
  );

  useFocusEffect(
    useCallback(() => {
      void load(date);
      return () => void flush();
    }, [date, load, flush]),
  );

  const update = (patch: Partial<ReportData>) => {
    setData((d) => ({ ...d, ...patch }));
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 800);
  };

  const go = async (d: string) => {
    await flush();
    setDate(d);
    router.setParams({ date: d });
  };

  const taskTotal = data.tasks.reduce((n, t) => n + (parseInt(t.minutes, 10) || 0), 0);

  const sections: Record<SectionKey, React.ReactNode> = {
    tasks: (
      <Card title={SECTION_LABEL.tasks} key="tasks">
        <Muted>作業ごとに1行ずつ「作業内容」と「所要時間」を入力します。</Muted>
        {data.tasks.map((t, i) => (
          <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.line, paddingTop: i ? 10 : 0 }}>
            <VoiceField
              label={`作業 ${i + 1}`}
              value={t.content}
              onChangeText={(v) => update({ tasks: data.tasks.map((x, j) => (j === i ? { ...x, content: v } : x)) })}
              placeholder="例：A社へ新商品の提案（担当：田中部長）"
            />
            <Row>
              <View style={{ flex: 1 }}>
                <Field label="所要時間（分）" keyboardType="number-pad" value={t.minutes} onChangeText={(v) => update({ tasks: data.tasks.map((x, j) => (j === i ? { ...x, minutes: v.replace(/[^0-9]/g, '') } : x)) })} placeholder="60" />
              </View>
              <Button label="この行を削除" variant="danger" onPress={() => update({ tasks: data.tasks.filter((_, j) => j !== i) })} />
            </Row>
          </View>
        ))}
        <Button label="＋ 作業を追加" variant="secondary" onPress={() => update({ tasks: [...data.tasks, { content: '', minutes: '' }] })} />
        {data.tasks.length ? (
          <Muted>
            作業時間の合計：{minutesToHm(taskTotal)}
            {workMinutes !== null ? `（勤務時間 ${minutesToHm(workMinutes)}）` : ''}
          </Muted>
        ) : null}
      </Card>
    ),
    metrics: (
      <Card title={SECTION_LABEL.metrics} key="metrics">
        <Muted>件数・金額など、自由に項目を作れます。よく使う項目は「設定」でひな形にできます。</Muted>
        {data.metrics.map((m, i) => {
          const t = parseFloat(m.target);
          const a = parseFloat(m.actual);
          const rate = Number.isFinite(t) && t !== 0 && Number.isFinite(a) ? Math.round((a / t) * 100) : null;
          const set = (patch: Partial<typeof m>) => update({ metrics: data.metrics.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.line, paddingTop: i ? 10 : 0 }}>
              <Row>
                <View style={{ flex: 2 }}>
                  <Field label="項目名" value={m.name} onChangeText={(v) => set({ name: v })} placeholder="例：訪問件数" />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="単位" value={m.unit} onChangeText={(v) => set({ unit: v })} placeholder="件" />
                </View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}>
                  <Field label="目標" keyboardType="decimal-pad" value={m.target} onChangeText={(v) => set({ target: v })} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="実績" keyboardType="decimal-pad" value={m.actual} onChangeText={(v) => set({ actual: v })} />
                </View>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text style={{ fontSize: sizes.font, fontWeight: '700', color: rate === null ? colors.muted : rate >= 100 ? colors.primary : colors.warn }}>
                  {rate === null ? '達成率：—' : `達成率：${rate}%`}
                </Text>
                <Button label="削除" variant="danger" onPress={() => update({ metrics: data.metrics.filter((_, j) => j !== i) })} />
              </Row>
            </View>
          );
        })}
        <Button label="＋ 数値項目を追加" variant="secondary" onPress={() => update({ metrics: [...data.metrics, { name: '', unit: '', target: '', actual: '' }] })} />
      </Card>
    ),
    progress: (
      <Card title={SECTION_LABEL.progress} key="progress">
        <VoiceField value={data.progress} onChangeText={(v) => update({ progress: v })} placeholder="例：月間目標20件に対し、現在12件（60%）。残り8件は…" />
      </Card>
    ),
    issues: (
      <Card title={SECTION_LABEL.issues} key="issues">
        <VoiceField value={data.issues} onChangeText={(v) => update({ issues: v })} placeholder="例：在庫不足でB商品の納期が遅れそう。購買部へ確認が必要" />
      </Card>
    ),
    reflection: (
      <Card title={SECTION_LABEL.reflection} key="reflection">
        <VoiceField label="良かった点" value={data.reflectionGood} onChangeText={(v) => update({ reflectionGood: v })} />
        <VoiceField label="改善点" value={data.reflectionImprove} onChangeText={(v) => update({ reflectionImprove: v })} />
        <VoiceField label="次に活かすこと" value={data.reflectionNext} onChangeText={(v) => update({ reflectionNext: v })} />
      </Card>
    ),
    nextPlans: (
      <Card title={SECTION_LABEL.nextPlans} key="nextPlans">
        <Muted>誰が・何を・いつまでに、を1行ずつ入力します。</Muted>
        {data.nextPlans.map((p, i) => {
          const set = (patch: Partial<typeof p>) => update({ nextPlans: data.nextPlans.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
          return (
            <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: colors.line, paddingTop: i ? 10 : 0 }}>
              <Field label="誰が" value={p.who} onChangeText={(v) => set({ who: v })} placeholder="例：自分／山田さん" />
              <VoiceField label="何を" value={p.what} onChangeText={(v) => set({ what: v })} placeholder="例：A社へ見積書を送付" />
              <Row>
                <View style={{ flex: 1 }}>
                  <Field label="いつまでに" value={p.due} onChangeText={(v) => set({ due: v })} placeholder="例：明日15時" />
                </View>
                <Button label="削除" variant="danger" onPress={() => update({ nextPlans: data.nextPlans.filter((_, j) => j !== i) })} />
              </Row>
            </View>
          );
        })}
        <Button label="＋ 予定を追加" variant="secondary" onPress={() => update({ nextPlans: [...data.nextPlans, { who: settings.name, what: '', due: '' }] })} />
      </Card>
    ),
    notes: (
      <Card title={SECTION_LABEL.notes} key="notes">
        <VoiceField value={data.notes} onChangeText={(v) => update({ notes: v })} placeholder="例：C社担当者より「競合が値下げした」との情報あり" />
      </Card>
    ),
  };

  return (
    <Screen>
      <DateNav label={formatDayJa(date)} onPrev={() => go(addDays(date, -1))} onNext={() => go(addDays(date, 1))} onToday={() => go(ymd(new Date()))} isToday={date === ymd(new Date())} />
      <Text style={{ textAlign: 'center', color: colors.muted, fontSize: sizes.small }}>
        {savedAt ? `自動保存しました（${savedAt}）` : exists ? '保存済みの日報です' : '新しい日報（入力すると自動保存されます）'}
      </Text>

      <Card title="基本情報">
        <InfoLine label="日付" value={formatDayJa(date)} />
        <InfoLine label="氏名" value={settings.name || '未設定（「設定」で入力してください）'} />
        <InfoLine label="勤務時間" value={workMinutes === null ? '打刻なし' : `${minutesToHm(workMinutes)}（出退勤から自動）`} />
        <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink, marginTop: 6 }}>勤務区分</Text>
        <Chips options={settings.workTypes} value={data.workType} onChange={(v) => update({ workType: v })} />
        {settings.showCondition ? (
          <>
            <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink, marginTop: 6 }}>体調（任意）</Text>
            <Chips options={CONDITIONS} value={data.condition as (typeof CONDITIONS)[number]} onChange={(v) => update({ condition: v })} allowEmpty />
          </>
        ) : null}
        {settings.showWeather ? (
          <>
            <Text style={{ fontSize: sizes.small, fontWeight: '700', color: colors.ink, marginTop: 6 }}>天候（任意）</Text>
            <Chips options={WEATHERS} value={data.weather as (typeof WEATHERS)[number]} onChange={(v) => update({ weather: v })} allowEmpty />
          </>
        ) : null}
      </Card>

      {settings.sections.filter((s) => s.enabled).map((s) => sections[s.key])}

      <Notice>🎤ボタンを押して話すと文字になり、そのまま編集できます。音声認識が使えない環境では、キーボードのマイクボタンで音声入力できます。</Notice>
      <Button label="保存する" onPress={() => { dirty.current = true; void flush(); }} />
    </Screen>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, minHeight: 32, alignItems: 'center' }}>
      <Text style={{ width: 80, fontSize: sizes.small, color: colors.muted }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: sizes.font, color: colors.ink, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
