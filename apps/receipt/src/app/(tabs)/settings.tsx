import React, { useState } from 'react';
import { Platform, Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, Chips, colors, Field, Muted, Notice, Row, Screen, sizes } from '@demolab/shared';
import { ListEditor } from '@/components/ListEditor';
import { useApp } from '@/lib/AppContext';
import { CLAUDE_MODEL } from '@/lib/claude';
import { KEY_STORAGE_NOTE } from '@/lib/keyStore';
import { DEVICE_OCR_NAME } from '@/lib/ocr';
import { OCR_MODE_LABEL, OcrMode } from '@/lib/types';

const MODES: OcrMode[] = ['device', 'claude', 'auto'];

export default function SettingsScreen() {
  const { settings, updateSettings, apiKey, updateApiKey } = useApp();
  const [keyText, setKeyText] = useState('');
  const [keyMsg, setKeyMsg] = useState<string | null>(null);

  return (
    <Screen>
      <Card title="読み取り方式（OCR）">
        <Chips options={MODES} labels={OCR_MODE_LABEL} value={settings.ocrMode} onChange={(v) => v && updateSettings({ ...settings, ocrMode: v })} />
        <Text style={{ fontSize: sizes.small, color: colors.ink, lineHeight: 22 }}>
          <Text style={{ fontWeight: '700' }}>端末内OCR：</Text>
          {DEVICE_OCR_NAME}。{Platform.OS === 'web' ? '初回のみ準備に時間がかかります。' : 'オフラインで使えます。'}無料。手書きやしわのある領収書は苦手です。{'\n'}
          <Text style={{ fontWeight: '700' }}>Claude API：</Text>精度重視。写真をネット経由で Anthropic 社に送ります。ネット接続とAPIキーが必要で、1枚ごとに利用料がかかります（モデル：{CLAUDE_MODEL}）。{'\n'}
          <Text style={{ fontWeight: '700' }}>自動：</Text>まず端末内OCRで読み、日付か金額に自信がないときだけ Claude API で読み直します。
        </Text>
      </Card>

      <Card title="Claude API キー">
        <Muted>{apiKey ? `設定済み（…${apiKey.slice(-4)}）` : '未設定'}</Muted>
        <Field value={keyText} onChangeText={setKeyText} placeholder="sk-ant-..." secureTextEntry autoCapitalize="none" autoCorrect={false} />
        <Row>
          <Button
            label="保存"
            disabled={!keyText.trim()}
            style={{ flex: 1 }}
            onPress={async () => {
              await updateApiKey(keyText.trim());
              setKeyText('');
              setKeyMsg('保存しました');
            }}
          />
          <Button
            label="削除"
            variant="danger"
            disabled={!apiKey}
            style={{ flex: 1 }}
            onPress={async () => {
              await updateApiKey('');
              setKeyMsg('削除しました');
            }}
          />
        </Row>
        {keyMsg ? <Muted>{keyMsg}</Muted> : null}
        <Muted>{KEY_STORAGE_NOTE} APIキーは Anthropic のコンソール（console.anthropic.com）で発行できます。</Muted>
      </Card>

      <Card title="OCR精度テスト">
        <Muted>手持ちのレシート写真を選び、端末内OCRと Claude API の読み取り結果を並べて比べられます。結果はExcelに出力できます。</Muted>
        <Button label="OCR精度テストを開く" variant="secondary" onPress={() => router.push('/ocr-test')} />
      </Card>

      <Card title="勘定科目">
        <ListEditor items={settings.categories} onChange={(categories) => updateSettings({ ...settings, categories })} placeholder="例：研修費" />
      </Card>

      <Card title="支払方法">
        <ListEditor items={settings.payments} onChange={(payments) => updateSettings({ ...settings, payments })} placeholder="例：法人カード" />
      </Card>

      <Notice>
        {Platform.OS === 'web'
          ? 'Web版のデータと写真は、このブラウザの中だけに保存されます（スマホのアプリとは同期しません）。ブラウザの「閲覧データを削除」で消えるため、定期的に「出力」からExcelと写真ZIPを保存してください。'
          : 'データと写真はこの端末の中だけに保存されます。機種変更やアプリ削除で消えるため、定期的に「出力」からExcelと写真ZIPを保存してください。'}
      </Notice>
      <Notice tone="warn">
        電子帳簿保存法への対応について：このアプリは検索に必要な項目（取引年月日・金額・取引先）と訂正・削除の履歴を記録しますが、事務処理規程の整備など、法令上の要件をすべてアプリ単体で満たすことは保証できません。運用は顧問税理士等にご確認ください。
      </Notice>
    </Screen>
  );
}
