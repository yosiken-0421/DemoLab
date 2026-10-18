import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Card, colors, Muted, Notice, Row, Screen, sizes, uid } from '@demolab/shared';
import { PhotoThumb } from '@/components/PhotoViewer';
import { ConfidenceLegend, ReceiptForm } from '@/components/ReceiptForm';
import { useSaveFlow } from '@/components/SaveFlow';
import { useApp } from '@/lib/AppContext';
import { createReceipt } from '@/lib/db';
import { rotateImage } from '@/lib/image';
import { savePhoto } from '@/lib/photos';
import { removeItem, retry, runQueue, useQueue } from '@/lib/queue';
import { ConfidenceMap, emptyFields, FieldKey, ReceiptFields } from '@/lib/types';

const ENGINE_LABEL = { device: '端末内OCR', claude: 'Claude API', manual: '手入力' } as const;

export default function ConfirmScreen() {
  const { settings, apiKey } = useApp();
  const queue = useQueue();
  const item = queue[0];
  const [fields, setFields] = useState<ReceiptFields>(emptyFields());
  const [confidence, setConfidence] = useState<ConfidenceMap>({});
  const [manual, setManual] = useState(false);
  const [showText, setShowText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const { errors, setErrors, trySave, sheet } = useSaveFlow();

  // 写真が切り替わったら、その読み取り結果で入力欄を埋める
  useEffect(() => {
    setManual(false);
    setShowText(false);
    setErrors({});
    if (item?.status === 'done' && item.result) {
      setFields({ ...emptyFields(), ...item.result.fields });
      setConfidence(item.result.confidence);
    } else {
      setFields(emptyFields());
      setConfidence({});
    }
  }, [item?.key, item?.status, item?.result, setErrors]);

  if (!item) {
    return (
      <Screen>
        <Card>
          <Text style={{ fontSize: sizes.title, fontWeight: '700', color: colors.ink }}>{savedCount ? `${savedCount}件を登録しました` : '確認待ちの写真はありません'}</Text>
          <Button label="続けて撮影・登録する" onPress={() => router.back()} />
          <Button label="一覧を見る" variant="secondary" onPress={() => router.navigate('/list')} />
        </Card>
      </Screen>
    );
  }

  const confirmField = (k: FieldKey) => setConfidence((c) => ({ ...c, [k]: 'high' }));
  const remaining = queue.length;
  const showForm = item.status === 'done' || manual;

  const save = () =>
    trySave(fields, async () => {
      setSaving(true);
      try {
        const id = uid();
        const photo = await savePhoto(item.uri, id);
        await createReceipt(fields, { id, photo, engine: manual || !item.result ? 'manual' : item.result.engine, ocrText: item.result?.rawText ?? '' });
        removeItem(item.key);
        setSavedCount((n) => n + 1);
      } finally {
        setSaving(false);
      }
    });

  const rotate = async () => {
    const uri = await rotateImage(item.uri, 90);
    retry(item.key, uri);
    void runQueue(settings, apiKey);
  };

  return (
    <Screen>
      <Text style={{ textAlign: 'center', fontSize: sizes.font, fontWeight: '700', color: colors.ink }}>残り {remaining}枚{savedCount ? `（${savedCount}件登録済み）` : ''}</Text>
      <Card>
        <PhotoThumb uri={item.uri} height={260} />
        <Row>
          <Button label="↻ 90°回転して読み直す" variant="secondary" onPress={rotate} style={{ flex: 1 }} />
        </Row>
      </Card>

      {item.status === 'waiting' || item.status === 'reading' ? (
        <Card>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ textAlign: 'center', fontSize: sizes.font, color: colors.ink }}>{item.status === 'reading' ? '読み取り中…（明るさ補正 → 文字認識）' : '順番待ち…'}</Text>
          <Button label="待たずに手入力する" variant="ghost" onPress={() => setManual(true)} />
        </Card>
      ) : null}

      {item.status === 'error' && !manual ? (
        <Card>
          <Notice tone="danger">読み取れませんでした：{item.error}</Notice>
          <Button label="もう一度読み取る" onPress={() => { retry(item.key); void runQueue(settings, apiKey); }} />
          <Button label="手入力で登録する" variant="secondary" onPress={() => setManual(true)} />
        </Card>
      ) : null}

      {showForm ? (
        <Card title="内容の確認・修正">
          {item.result && !manual ? <Muted>読み取り方式：{ENGINE_LABEL[item.result.engine]}</Muted> : null}
          {item.result?.note ? <Notice tone="warn">{item.result.note}</Notice> : null}
          {item.result && !manual ? <ConfidenceLegend /> : null}
          <Muted>色の付いた欄をタップして直すか、合っていれば「✓ 正しい」を押してください。</Muted>
          <ReceiptForm fields={fields} onChange={setFields} confidence={manual ? {} : confidence} onConfirm={confirmField} errors={errors} categories={settings.categories} payments={settings.payments} />
          {Object.keys(errors).length ? <Notice tone="danger">入力内容を確認してください（赤い欄）。</Notice> : null}
          <Button label={remaining > 1 ? '保存して次へ' : '保存する'} onPress={save} loading={saving} />
          {item.result?.rawText ? (
            <>
              <Button label={showText ? '読み取った文字を隠す' : '読み取った文字を見る'} variant="ghost" onPress={() => setShowText(!showText)} />
              {showText ? (
                <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 10 }}>
                  <Text selectable style={{ fontSize: 14, color: colors.ink, lineHeight: 20 }}>{item.result.rawText}</Text>
                </View>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <Button label="この写真は登録しない" variant="danger" onPress={() => removeItem(item.key)} />
      {sheet}
    </Screen>
  );
}
