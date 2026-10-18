import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Card, colors, Muted, Notice, Screen, Sheet, sizes } from '@demolab/shared';
import { PhotoThumb } from '@/components/PhotoViewer';
import { ReceiptForm } from '@/components/ReceiptForm';
import { StatusBadge } from '@/components/ReceiptRow';
import { useSaveFlow } from '@/components/SaveFlow';
import { useApp } from '@/lib/AppContext';
import { getReceipt, historyOf, receiptToFields, setDeleted, setSettled, updateReceipt } from '@/lib/db';
import { photoUri } from '@/lib/photos';
import type { Receipt, ReceiptFields, ReceiptHistory } from '@/lib/types';

const ACTION = { create: '登録', update: '修正', delete: '削除', restore: '削除の取り消し', settle: '精算済みにした', unsettle: '未精算に戻した' } as const;

export default function ReceiptDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useApp();
  const [r, setR] = useState<Receipt | null>(null);
  const [fields, setFields] = useState<ReceiptFields | null>(null);
  const [uri, setUri] = useState('');
  const [history, setHistory] = useState<ReceiptHistory[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [askDelete, setAskDelete] = useState(false);
  const { errors, trySave, sheet } = useSaveFlow();

  const load = useCallback(async () => {
    const x = await getReceipt(id);
    setR(x);
    if (!x) return;
    setFields(receiptToFields(x));
    setUri(x.photo ? await photoUri(x.photo) : '');
    setHistory(await historyOf(id));
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!r || !fields) return <Screen><Muted>読み込み中…</Muted></Screen>;

  const save = () =>
    trySave(
      fields,
      async () => {
        const n = await updateReceipt(r, fields);
        setMessage(n ? `${n}項目を修正しました（修正履歴に残ります）` : '変更はありません');
        await load();
      },
      r.id,
    );

  return (
    <Screen>
      {r.deleted_at ? <Notice tone="danger">この領収書は削除済みです（{r.deleted_at.slice(0, 16).replace('T', ' ')}）。集計・出力には含まれません。</Notice> : null}
      <Card title="写真" right={<StatusBadge status={r.status} />}>
        {uri ? <PhotoThumb uri={uri} height={280} /> : <Muted>写真はありません</Muted>}
      </Card>
      <Card title="内容">
        <ReceiptForm fields={fields} onChange={setFields} errors={errors} categories={settings.categories} payments={settings.payments} />
        <Button label="修正を保存" onPress={save} />
        {message ? <Notice>{message}</Notice> : null}
      </Card>
      <Card title="精算">
        <Button
          label={r.status === 'settled' ? '未精算に戻す' : '精算済みにする'}
          variant={r.status === 'settled' ? 'secondary' : 'accent'}
          onPress={async () => {
            await setSettled([r.id], r.status !== 'settled');
            await load();
          }}
        />
      </Card>
      <Card title="履歴（訂正・削除の記録）">
        {history.map((h) => {
          const changes = Object.entries(JSON.parse(h.changes || '{}') as Record<string, [unknown, unknown]>);
          return (
            <View key={h.id} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 6 }}>
              <Text style={{ fontSize: sizes.small, color: colors.ink, fontWeight: '700' }}>
                {h.at.slice(0, 16).replace('T', ' ')}　{ACTION[h.action]}
              </Text>
              {changes.map(([k, [a, b]]) => (
                <Muted key={k}>
                  {k}：{String(a ?? '（空）') || '（空）'} → {String(b ?? '（空）') || '（空）'}
                </Muted>
              ))}
            </View>
          );
        })}
      </Card>
      {r.deleted_at ? (
        <Button label="削除を取り消す" variant="secondary" onPress={async () => { await setDeleted(r.id, false); await load(); }} />
      ) : (
        <Button label="この領収書を削除" variant="danger" onPress={() => setAskDelete(true)} />
      )}
      <Sheet visible={askDelete} title="領収書を削除" onClose={() => setAskDelete(false)}>
        <Text style={{ fontSize: sizes.font, lineHeight: 28 }}>削除すると一覧・集計・出力に含まれなくなります。記録と写真は「削除済み」として残り、あとで取り消せます。</Text>
        <Button
          label="削除する"
          variant="danger"
          onPress={async () => {
            await setDeleted(r.id, true);
            setAskDelete(false);
            router.back();
          }}
        />
      </Sheet>
      {sheet}
    </Screen>
  );
}
