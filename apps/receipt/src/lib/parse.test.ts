import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amountsIn, findRegNo, needsFallback, parseReceiptText } from './parse';
import { amountsConsistent, normalizeVendor, regNoError, taxFromInclusive, toYen } from './validate';
import { emptyFields } from './types';

const CATS = ['交通費', '会議費', '接待交際費', '消耗品費', '通信費'];

// OCRが返しそうな文字列（全角・空白・改行の揺れを含む）で検証する
const convenience = `ファミリーストア 新宿西口店
東京都新宿区西新宿1-1-1
TEL 03-1234-5678
登録番号 T１２３４５６７８９０１２３
2026年10月05日(月) 12:34
領 収 書
おにぎり           ¥150 軽
お茶               ¥130 軽
ボールペン         ¥220
小  計             ¥500
(10%対象 ¥220 内消費税 ¥20)
(8%対象 ¥280 内消費税 ¥20)
合  計             ¥500
お預り             ¥1,000
お釣               ¥500
`;

test('コンビニのレシート', () => {
  const r = parseReceiptText(convenience, CATS);
  assert.equal(r.fields.date, '2026-10-05');
  assert.equal(r.confidence.date, 'high');
  assert.equal(r.fields.total, '500');
  assert.equal(r.confidence.total, 'high');
  assert.equal(r.fields.amount10, '220');
  assert.equal(r.fields.tax10, '20');
  assert.equal(r.fields.amount8, '280');
  assert.equal(r.fields.tax8, '20');
  assert.equal(r.confidence.tax10, 'high');
  assert.equal(r.fields.regNo, 'T1234567890123');
  assert.equal(r.confidence.regNo, 'high');
  assert.equal(r.fields.payment, '現金');
  assert.equal(r.fields.vendor, 'ファミリーストア 新宿西口店');
  assert.equal(needsFallback(r), false);
});

const taxi = `領収書
上様
令和8年10月6日
金 ３,４８０円也
但し タクシー代として
上記正に領収いたしました
日本交通株式会社
登録番号 T-9876-5432-1098-7
10%対象 3,480円 (うち消費税 316円)
`;

test('手書き風の領収書（和暦・金〇〇円也・但し書き）', () => {
  const r = parseReceiptText(taxi, CATS);
  assert.equal(r.fields.date, '2026-10-06');
  assert.equal(r.fields.total, '3480');
  assert.equal(r.confidence.total, 'high');
  assert.equal(r.fields.vendor, '日本交通株式会社');
  assert.equal(r.fields.description, 'タクシー代');
  assert.equal(r.fields.regNo, 'T9876543210987');
  assert.equal(r.fields.category, '交通費');
  assert.equal(r.fields.tax10, '316');
  assert.equal(r.confidence.tax10, 'high');
  assert.equal(r.confidence.amount8, undefined, '8%の記載が無いときは警告しない');
});

test('読み取れない項目は missing になり、自動モードでは Claude へ回す', () => {
  const r = parseReceiptText('ぼやけて読めない\n???', CATS);
  assert.equal(r.confidence.total, 'missing');
  assert.equal(r.confidence.date, 'missing');
  assert.equal(needsFallback(r), true);
});

test('カード払い・2桁年の日付は自信「低」', () => {
  const r = parseReceiptText('喫茶 珈琲館\n26/10/07 15:00\nブレンド 2 ¥1,100\n合計 ¥1,100\nVISA ****1234', CATS);
  assert.equal(r.fields.date, '2026-10-07');
  assert.equal(r.confidence.date, 'low');
  assert.equal(r.fields.payment, 'クレジットカード');
  assert.equal(r.fields.category, '会議費');
});

test('金額の抽出：電話番号・時刻・税率は金額にしない', () => {
  assert.deepEqual(amountsIn('TEL 03-1234-5678 12:34 10% ¥1,234'), [1234]);
});

test('登録番号：T の誤認識（丁）は自信「低」', () => {
  assert.deepEqual(findRegNo('丁1234567890123'), { value: 'T1234567890123', confident: false });
});

test('入力チェック', () => {
  assert.equal(regNoError('T1234567890123'), null);
  assert.ok(regNoError('T123'));
  assert.ok(regNoError('1234567890123'));
  assert.equal(regNoError('ｔ１２３４５６７８９０１２３'), null);
  assert.equal(toYen('￥１,２３４円'), 1234);
  assert.equal(toYen('abc'), null);
  assert.equal(taxFromInclusive(1100, 10), 100);
  assert.equal(taxFromInclusive(1080, 8), 80);
  assert.equal(normalizeVendor('株式会社 ＡＢＣ'), normalizeVendor('ABC(株)'));
  assert.equal(amountsConsistent({ ...emptyFields(), total: '500', amount10: '220', amount8: '280' }), true);
});
