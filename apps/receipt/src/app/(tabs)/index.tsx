import React, { useState } from 'react';
import { Text } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, colors, Muted, Notice, Screen, sizes } from '@demolab/shared';
import { useApp } from '@/lib/AppContext';
import { pickFromLibrary, scanReceipts, SCANNER_NOTE } from '@/lib/capture';
import { enqueue, runQueue, useQueue } from '@/lib/queue';
import { DEVICE_OCR_NAME } from '@/lib/ocr';
import { OCR_MODE_LABEL } from '@/lib/types';

export default function RegisterScreen() {
  const { settings, apiKey } = useApp();
  const queue = useQueue();
  const [error, setError] = useState<string | null>(null);

  const start = async (get: () => Promise<string[]>) => {
    setError(null);
    try {
      const uris = await get();
      if (!uris.length) return;
      enqueue(uris);
      void runQueue(settings, apiKey);
      router.push('/confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pending = queue.length;
  const needsKey = settings.ocrMode === 'claude' && !apiKey;

  return (
    <Screen>
      <Card>
        <Button big label="📷 撮影して読み取る" sub="続けて何枚でも撮影できます" onPress={() => start(scanReceipts)} />
        <Muted>{SCANNER_NOTE}</Muted>
        <Button big variant="secondary" label="🖼 写真から選ぶ" sub="カメラロールから複数選択できます" onPress={() => start(pickFromLibrary)} />
        <Button big variant="secondary" label="✍️ 手入力で登録" onPress={() => router.push('/new')} />
      </Card>

      {error ? <Notice tone="danger">{error}</Notice> : null}
      {needsKey ? <Notice tone="warn">読み取り方式が「Claude API」ですが、APIキーが未設定です。「設定」で入力するか、方式を「端末内OCR」に変更してください。</Notice> : null}

      {pending ? (
        <Card title={`確認待ち ${pending}枚`}>
          <Muted>読み取った内容を確認して登録してください。</Muted>
          <Button label="確認画面を開く" variant="accent" onPress={() => router.push('/confirm')} />
        </Card>
      ) : null}

      <Card title="読み取り方式">
        <Text style={{ fontSize: sizes.font, fontWeight: '700', color: colors.ink }}>{OCR_MODE_LABEL[settings.ocrMode]}</Text>
        <Muted>{settings.ocrMode === 'claude' ? '写真をインターネット経由で Anthropic 社に送信して読み取ります。' : `${DEVICE_OCR_NAME}${settings.ocrMode === 'auto' ? '。日付・金額の読み取りに自信がないときだけ Claude API を使います。' : '。'}`}</Muted>
        <Button label="設定で変更する" variant="ghost" onPress={() => router.navigate('/settings')} />
      </Card>
    </Screen>
  );
}
