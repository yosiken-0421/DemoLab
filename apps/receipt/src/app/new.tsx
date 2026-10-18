import React, { useState } from 'react';
import { router } from 'expo-router';
import { Button, Card, Muted, Notice, Row, Screen, uid } from '@demolab/shared';
import { PhotoThumb } from '@/components/PhotoViewer';
import { ReceiptForm } from '@/components/ReceiptForm';
import { useSaveFlow } from '@/components/SaveFlow';
import { useApp } from '@/lib/AppContext';
import { pickFromLibrary, scanReceipts } from '@/lib/capture';
import { createReceipt } from '@/lib/db';
import { savePhoto } from '@/lib/photos';
import { emptyFields, ReceiptFields } from '@/lib/types';
import { ymd } from '@demolab/shared';

export default function NewReceiptScreen() {
  const { settings } = useApp();
  const [fields, setFields] = useState<ReceiptFields>({ ...emptyFields(), date: ymd(new Date()) });
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { errors, trySave, sheet } = useSaveFlow();

  const attach = async (get: () => Promise<string[]>) => {
    const uris = await get();
    if (uris[0]) setPhoto(uris[0]);
  };

  const save = () =>
    trySave(fields, async () => {
      setSaving(true);
      try {
        const id = uid();
        const ref = photo ? await savePhoto(photo, id) : null;
        await createReceipt(fields, { id, photo: ref, engine: 'manual', ocrText: '' });
        router.back();
      } finally {
        setSaving(false);
      }
    });

  return (
    <Screen>
      <Card title="写真（任意）">
        {photo ? <PhotoThumb uri={photo} /> : <Muted>写真を添付しておくと、あとで見返せます。</Muted>}
        <Row>
          <Button label="撮影" variant="secondary" onPress={() => attach(scanReceipts)} style={{ flex: 1 }} />
          <Button label="写真から選ぶ" variant="secondary" onPress={() => attach(pickFromLibrary)} style={{ flex: 1 }} />
        </Row>
      </Card>
      <Card title="内容">
        <ReceiptForm fields={fields} onChange={setFields} errors={errors} categories={settings.categories} payments={settings.payments} />
        {Object.keys(errors).length ? <Notice tone="danger">入力内容を確認してください（赤い欄）。</Notice> : null}
        <Button label="保存する" onPress={save} loading={saving} />
      </Card>
      {sheet}
    </Screen>
  );
}
