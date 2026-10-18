import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  addDays,
  Button,
  Card,
  Chips,
  colors,
  DateNav,
  Field,
  formatDayJa,
  localIso,
  minutesToHm,
  Muted,
  Notice,
  Row,
  Screen,
  Sheet,
  sizes,
  TimeEditor,
  ymd,
} from '@demolab/shared';
import { displayTime, summarizeDay } from '@/lib/attendance';
import { addPunch, editPunch, getManualBreak, historyOf, punchesOfDay, punchNow, setManualBreak, setPunchCanceled } from '@/lib/db';
import { Punch, PunchHistory, PunchType, PUNCH_LABEL } from '@/lib/types';

type Dialog =
  | { mode: 'edit'; punch: Punch }
  | { mode: 'cancel'; punch: Punch }
  | { mode: 'add' }
  | null;

const ACTION_LABEL: Record<PunchHistory['action'], string> = { create: '打刻', add: '後から追加', edit: '時刻修正', cancel: '取り消し', restore: '取り消しを戻す' };

export default function TodayScreen() {
  const [date, setDate] = useState(ymd(new Date()));
  const [punches, setPunches] = useState<Punch[]>([]);
  const [history, setHistory] = useState<PunchHistory[]>([]);
  const [manualBreak, setManualBreakState] = useState<number | null>(null);
  const [breakText, setBreakText] = useState('');
  const [now, setNow] = useState(new Date());
  const [flash, setFlash] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = ymd(now);

  const reload = useCallback(async (d: string) => {
    const ps = await punchesOfDay(d);
    setPunches(ps);
    setHistory(await historyOf(ps.map((p) => p.id)));
    const b = await getManualBreak(d);
    setManualBreakState(b);
    setBreakText(b === null ? '' : String(b));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload(date);
    }, [date, reload]),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const summary = summarizeDay(punches, manualBreak);
  const isToday = date === today;

  const press = async (type: PunchType) => {
    const p = await punchNow(type);
    setFlash(`${PUNCH_LABEL[type]} ${p.at.slice(11, 16)} を記録しました${p.work_date !== today ? `（${formatDayJa(p.work_date)}の勤務）` : ''}`);
    setNow(new Date());
    if (p.work_date !== date) setDate(p.work_date);
    else await reload(date);
  };

  const commitBreak = async (text: string) => {
    const v = text.trim() === '' ? null : Math.max(0, parseInt(text.replace(/[^0-9]/g, ''), 10) || 0);
    setManualBreakState(v);
    setBreakText(v === null ? '' : String(v));
    await setManualBreak(date, v);
  };

  const status = summary.onBreak ? '休憩中' : summary.open ? '勤務中' : summary.lastOut ? '退勤済み' : '未出勤';

  return (
    <Screen>
      <DateNav label={formatDayJa(date)} onPrev={() => setDate(addDays(date, -1))} onNext={() => setDate(addDays(date, 1))} onToday={() => setDate(today)} isToday={isToday} />

      {isToday ? (
        <Card>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 48, fontWeight: '800', color: colors.ink, fontVariant: ['tabular-nums'] }}>{localIso(now).slice(11, 16)}</Text>
            <Text style={{ fontSize: sizes.font, color: colors.muted }}>現在の状態：<Text style={{ fontWeight: '700', color: colors.primaryDark }}>{status}</Text></Text>
          </View>
          <Row>
            <Button label="出勤" big onPress={() => press('in')} style={{ flex: 1 }} variant={summary.open ? 'secondary' : 'primary'} />
            <Button label="退勤" big onPress={() => press('out')} style={{ flex: 1 }} variant={summary.open ? 'accent' : 'secondary'} />
          </Row>
          <Row>
            <Button label="休憩開始" onPress={() => press('break_start')} variant="secondary" style={{ flex: 1 }} />
            <Button label="休憩終了" onPress={() => press('break_end')} variant="secondary" style={{ flex: 1 }} />
          </Row>
          {flash ? <Notice>{flash}　押し間違いは下のリストから修正・取り消しできます。</Notice> : null}
        </Card>
      ) : (
        <Notice>過去・未来の日を表示中です。打ち忘れは「打刻を追加」から入力できます。</Notice>
      )}

      <Card title="勤怠リスト" right={<Button label="＋ 打刻を追加" variant="ghost" onPress={() => setDialog({ mode: 'add' })} />}>
        {punches.length === 0 ? <Muted>まだ打刻がありません。</Muted> : null}
        {punches.map((p) => {
          const hs = history.filter((h) => h.punch_id === p.id && h.action !== 'create');
          return (
            <View key={p.id} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 10, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: sizes.font, fontWeight: '700', color: p.canceled ? colors.disabled : colors.ink, textDecorationLine: p.canceled ? 'line-through' : 'none' }}>
                    {PUNCH_LABEL[p.type]}　{displayTime(p.at, p.work_date)}
                  </Text>
                  {p.canceled ? <Text style={{ color: colors.danger, fontSize: sizes.small }}>取り消し済み（計算から除外）</Text> : null}
                </View>
                {p.canceled ? (
                  <Button label="元に戻す" variant="secondary" onPress={() => setPunchCanceled(p, false, '').then(() => reload(date))} />
                ) : (
                  <>
                    <Button label="修正" variant="secondary" onPress={() => setDialog({ mode: 'edit', punch: p })} />
                    <Button label="取消" variant="danger" onPress={() => setDialog({ mode: 'cancel', punch: p })} />
                  </>
                )}
              </View>
              {hs.length ? (
                <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.muted }}>修正履歴</Text>
                  {hs.map((h) => (
                    <Text key={h.id} style={{ fontSize: 13, color: colors.muted }}>
                      {h.changed_at.slice(5, 16).replace('T', ' ')} {ACTION_LABEL[h.action]}
                      {h.action === 'edit' && h.old_at && h.new_at ? `：${displayTime(h.old_at, p.work_date)} → ${displayTime(h.new_at, p.work_date)}` : ''}
                      {h.action === 'add' && h.new_at ? `：${displayTime(h.new_at, p.work_date)}` : ''}
                      {h.reason ? `（${h.reason}）` : ''}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Card title="勤務時間">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Stat label="出勤" value={summary.firstIn ? displayTime(summary.firstIn, date) : '—'} />
          <Stat label="退勤" value={summary.lastOut ? displayTime(summary.lastOut, date) : summary.open ? '勤務中' : '—'} />
          <Stat label="休憩" value={`${summary.breakMinutes}分`} />
          <Stat label="勤務時間" value={minutesToHm(summary.workMinutes)} strong />
        </View>
        <Muted>勤務時間 ＝ 退勤 − 出勤 − 休憩 で自動計算しています。</Muted>
      </Card>

      <Card title="休憩時間">
        <Field
          label="休憩（分）"
          hint={manualBreak === null ? `空欄のときは休憩ボタンから自動計算（${summary.autoBreakMinutes}分）` : '手入力の値を使っています'}
          keyboardType="number-pad"
          value={breakText}
          placeholder={`${summary.autoBreakMinutes}`}
          onChangeText={setBreakText}
          onBlur={() => commitBreak(breakText)}
          onSubmitEditing={() => commitBreak(breakText)}
        />
        <Chips options={['30', '45', '60', '90'] as const} value={breakText as '30'} onChange={(v) => commitBreak(v)} />
        {manualBreak !== null ? <Button label="自動計算に戻す" variant="ghost" onPress={() => commitBreak('')} /> : null}
      </Card>

      <Button label="この日の日報を書く" variant="accent" onPress={() => router.navigate({ pathname: '/report', params: { date } })} />

      <PunchDialog dialog={dialog} workDate={date} onClose={() => setDialog(null)} onDone={() => { setDialog(null); void reload(date); }} />
    </Screen>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: strong ? colors.primarySoft : colors.bg, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontSize: sizes.small, color: colors.muted }}>{label}</Text>
      <Text style={{ fontSize: strong ? 30 : 24, fontWeight: '800', color: strong ? colors.primaryDark : colors.ink }}>{value}</Text>
    </View>
  );
}

const OFFSETS = ['前日', '当日', '翌日'] as const;

function PunchDialog({ dialog, workDate, onClose, onDone }: { dialog: Dialog; workDate: string; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState<PunchType>('in');
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  const [offset, setOffset] = useState<(typeof OFFSETS)[number]>('当日');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!dialog) return;
    setReason('');
    if (dialog.mode === 'add') {
      setType('in');
      setH(9);
      setM(0);
      setOffset('当日');
    } else {
      const at = dialog.punch.at;
      setType(dialog.punch.type);
      setH(Number(at.slice(11, 13)));
      setM(Number(at.slice(14, 16)));
      const d = at.slice(0, 10);
      setOffset(d === workDate ? '当日' : d > workDate ? '翌日' : '前日');
    }
  }, [dialog, workDate]);

  if (!dialog) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;

  const newAt = () => {
    const day = offset === '当日' ? workDate : addDays(workDate, offset === '翌日' ? 1 : -1);
    const sec = dialog.mode === 'edit' ? dialog.punch.at.slice(17, 19) : '00';
    return `${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${sec}`;
  };

  if (dialog.mode === 'cancel') {
    return (
      <Sheet visible title="打刻を取り消す" onClose={onClose}>
        <Text style={{ fontSize: sizes.font }}>
          {PUNCH_LABEL[dialog.punch.type]} {displayTime(dialog.punch.at, workDate)} を取り消しますか？{'\n'}記録は消さずに「取り消し済み」として履歴に残ります。
        </Text>
        <Field label="理由（任意）" value={reason} onChangeText={setReason} placeholder="例：押し間違い" />
        <Button label="取り消す" variant="danger" onPress={() => setPunchCanceled(dialog.punch, true, reason).then(onDone)} />
      </Sheet>
    );
  }

  return (
    <Sheet visible title={dialog.mode === 'add' ? '打刻を追加（打ち忘れ）' : `${PUNCH_LABEL[dialog.punch.type]}の時刻を修正`} onClose={onClose}>
      {dialog.mode === 'add' ? (
        <Chips options={['in', 'out', 'break_start', 'break_end'] as const} labels={PUNCH_LABEL} value={type} onChange={(v) => v && setType(v)} />
      ) : null}
      <TimeEditor hour={h} minute={m} onChange={(hh, mm) => { setH(hh); setM(mm); }} />
      <Muted>日付（{formatDayJa(workDate)}の勤務）</Muted>
      <Chips options={OFFSETS} value={offset} onChange={(v) => v && setOffset(v)} />
      <Field label="理由（任意）" value={reason} onChangeText={setReason} placeholder={dialog.mode === 'add' ? '例：打ち忘れ' : '例：押し間違い'} />
      <Button
        label="保存する"
        onPress={async () => {
          if (dialog.mode === 'add') await addPunch(workDate, type, newAt(), reason);
          else await editPunch(dialog.punch, newAt(), reason);
          onDone();
        }}
      />
      <Muted>修正前の時刻は修正履歴として残ります。</Muted>
    </Sheet>
  );
}
