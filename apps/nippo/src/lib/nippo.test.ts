import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { displayTime, resolveWorkDate, summarizeDay } from './attendance';
import { buildRecords, exportWorkbook, mergeParsed, parseNippoWorkbook } from './workbook';
import { emptyReport, Punch, PunchType } from './types';

const P = (id: string, work_date: string, type: PunchType, at: string, canceled = 0): Punch => ({ id, work_date, type, at, canceled, created_at: at });

test('勤務時間 = 退勤 − 出勤 − 休憩（休憩ボタン）', () => {
  const s = summarizeDay(
    [P('1', '2026-10-01', 'in', '2026-10-01T09:00:00'), P('2', '2026-10-01', 'break_start', '2026-10-01T12:00:00'), P('3', '2026-10-01', 'break_end', '2026-10-01T12:45:00'), P('4', '2026-10-01', 'out', '2026-10-01T18:10:00')],
    null,
  );
  assert.equal(s.grossMinutes, 550);
  assert.equal(s.breakMinutes, 45);
  assert.equal(s.workMinutes, 505);
  assert.equal(s.open, false);
});

test('休憩の手入力はボタン計算より優先、取り消した打刻は無視', () => {
  const s = summarizeDay(
    [P('1', 'd', 'in', '2026-10-01T09:00:00'), P('x', 'd', 'out', '2026-10-01T09:01:00', 1), P('4', 'd', 'out', '2026-10-01T18:00:00')],
    60,
  );
  assert.equal(s.workMinutes, 480);
  assert.equal(s.lastOut, '2026-10-01T18:00:00');
});

test('日をまたぐ勤務：退勤は出勤日に入り、翌表示になる', () => {
  const recent = [P('1', '2026-10-01', 'in', '2026-10-01T22:00:00')];
  assert.equal(resolveWorkDate('out', '2026-10-02T06:00:00', '2026-10-02', recent), '2026-10-01');
  assert.equal(resolveWorkDate('in', '2026-10-02T06:00:00', '2026-10-02', recent), '2026-10-02');
  // 退勤済みなら今日
  assert.equal(resolveWorkDate('out', '2026-10-02T06:00:00', '2026-10-02', [...recent, P('2', '2026-10-01', 'out', '2026-10-02T05:00:00')]), '2026-10-02');
  assert.equal(displayTime('2026-10-02T06:00:00', '2026-10-01'), '翌06:00');
  const s = summarizeDay([...recent, P('2', '2026-10-01', 'out', '2026-10-02T06:00:00')], 60);
  assert.equal(s.workMinutes, 420);
});

test('出勤中・休憩中の状態', () => {
  const s = summarizeDay([P('1', 'd', 'in', '2026-10-01T09:00:00'), P('2', 'd', 'break_start', '2026-10-01T12:00:00')], null);
  assert.equal(s.open, true);
  assert.equal(s.onBreak, true);
});

test('Excel出力 → 読み込み → 統合（往復）', async () => {
  const rep = { ...emptyReport(), workType: '外勤', tasks: [{ content: 'A社訪問 & 見積', minutes: '90' }], metrics: [{ name: '訪問件数', unit: '件', target: '5', actual: '4' }], issues: '<課題>"テスト"', nextPlans: [{ who: '山田', what: '見積送付', due: '10/3' }] };
  const mk = (name: string) =>
    buildRecords({
      name,
      punches: [P('1', '2026-10-01', 'in', '2026-10-01T09:00:00'), P('2', '2026-10-01', 'out', '2026-10-01T18:00:00')],
      history: [{ id: 1, punch_id: '1', action: 'edit', old_at: 'a', new_at: 'b', reason: '', changed_at: '' }],
      manualBreaks: new Map([['2026-10-01', 60]]),
      reports: [{ work_date: '2026-10-01', data: rep }],
    });
  const a = mk('山田太郎');
  assert.equal(a.attendance[0].workMinutes, 480);
  assert.equal(a.attendance[0].edited, 'あり（1件）');
  assert.match(a.reports[0]['数値記録（目標／実績）'], /達成率80%/);
  const bytesA = await exportWorkbook(a.attendance, a.reports);
  const bytesB = await exportWorkbook(mk('佐藤花子').attendance, mk('佐藤花子').reports);
  writeFileSync(process.env.XLSX_OUT ?? '/tmp/nippo-test.xlsx', bytesA);
  const pa = await parseNippoWorkbook('a.xlsx', bytesA);
  const pb = await parseNippoWorkbook('b.xlsx', bytesB);
  const pa2 = await parseNippoWorkbook('a2.xlsx', bytesA);
  assert.equal(pa.error, undefined);
  assert.equal(pa.attendance.length, 1, '合計行は読み込まない');
  assert.equal(pa.attendance[0].workMinutes, 480);
  assert.equal(pa.reports[0]['課題・気づき・申し送り事項'], '<課題>"テスト"');
  const merged = mergeParsed([pa, pb, pa2]);
  assert.equal(merged.attendance.length, 2);
  assert.equal(merged.duplicates, 2);
  const out = await exportWorkbook(merged.attendance, merged.reports, true);
  writeFileSync(process.env.XLSX_MERGED_OUT ?? '/tmp/nippo-merged.xlsx', out);
  // 氏名のスペース違いは同一人物
  const spaced = await parseNippoWorkbook('c.xlsx', await exportWorkbook(mk('山田 太郎').attendance, mk('山田 太郎').reports));
  const m2 = mergeParsed([pa, spaced]);
  assert.equal(m2.attendance.length, 1);
  assert.equal(m2.duplicates, 2);
  const bad = await parseNippoWorkbook('x.xlsx', new Uint8Array([1, 2, 3]));
  assert.ok(bad.error);
});
