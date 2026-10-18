// 保存前のチェック（入力エラー・二重登録の警告）を共通化
import React, { useState } from 'react';
import { Text } from 'react-native';
import { Button, Muted, Sheet, sizes } from '@demolab/shared';
import { findDuplicates } from '@/lib/db';
import type { Receipt, ReceiptFields } from '@/lib/types';
import { FieldErrors, formatYen, validateFields } from '@/lib/validate';

export function useSaveFlow() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [dups, setDups] = useState<{ list: Receipt[]; proceed: () => void } | null>(null);

  /** 問題が無ければ save を実行。二重登録の疑いがあれば確認シートを出す */
  const trySave = async (fields: ReceiptFields, save: () => Promise<void>, excludeId?: string) => {
    const e = validateFields(fields);
    setErrors(e);
    if (Object.keys(e).length) return false;
    const list = await findDuplicates(fields, excludeId);
    if (list.length) {
      setDups({ list, proceed: () => void save() });
      return false;
    }
    await save();
    return true;
  };

  const sheet = (
    <Sheet visible={!!dups} title="二重登録の可能性があります" onClose={() => setDups(null)}>
      <Text style={{ fontSize: sizes.font, lineHeight: 28 }}>日付・金額・取引先が同じ領収書がすでに登録されています。</Text>
      {dups?.list.map((r) => (
        <Muted key={r.id}>
          ・{r.date}　{r.vendor || '（取引先なし）'}　{formatYen(r.total)}（登録：{r.created_at.slice(0, 16).replace('T', ' ')}）
        </Muted>
      ))}
      <Button label="登録をやめる" onPress={() => setDups(null)} />
      <Button
        label="別の領収書なので登録する"
        variant="danger"
        onPress={() => {
          const p = dups?.proceed;
          setDups(null);
          p?.();
        }}
      />
    </Sheet>
  );

  return { errors, setErrors, trySave, sheet };
}
