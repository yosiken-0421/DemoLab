import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, colors, Field, IconButton, Row, sizes } from '@demolab/shared';

/** 勘定科目・支払方法などの候補リストの追加・削除・並べ替え */
export function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [text, setText] = useState('');
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <View>
      {items.map((t, i) => (
        <View key={`${t}${i}`} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderColor: colors.line, minHeight: 52 }}>
          <Text style={{ flex: 1, fontSize: sizes.font, color: colors.ink }}>{t}</Text>
          <IconButton label="↑" accessibilityLabel={`${t}を上へ`} disabled={i === 0} onPress={() => move(i, -1)} />
          <IconButton label="↓" accessibilityLabel={`${t}を下へ`} disabled={i === items.length - 1} onPress={() => move(i, 1)} />
          <IconButton label="✕" color={colors.danger} accessibilityLabel={`${t}を削除`} onPress={() => onChange(items.filter((_, j) => j !== i))} />
        </View>
      ))}
      <Row style={{ marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Field value={text} onChangeText={setText} placeholder={placeholder} />
        </View>
        <Button
          label="追加"
          variant="secondary"
          disabled={!text.trim() || items.includes(text.trim())}
          style={{ marginBottom: 12 }}
          onPress={() => {
            onChange([...items, text.trim()]);
            setText('');
          }}
        />
      </Row>
    </View>
  );
}
