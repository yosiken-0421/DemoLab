import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { Button, styles } from './components';
import { colors, sizes } from './theme';

/** 時:分を大きなボタンで調整できる入力（ネイティブの時刻ピッカーが無いWebでも同じ操作） */
export function TimeEditor({ hour, minute, onChange }: { hour: number; minute: number; onChange: (h: number, m: number) => void }) {
  const total = hour * 60 + minute;
  const set = (t: number) => {
    const v = ((t % 1440) + 1440) % 1440;
    onChange(Math.floor(v / 60), v % 60);
  };
  const num = (s: string, max: number) => Math.max(0, Math.min(max, Number(s.replace(/[^0-9]/g, '')) || 0));
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <TextInput
          accessibilityLabel="時"
          keyboardType="number-pad"
          value={String(hour).padStart(2, '0')}
          onChangeText={(s) => onChange(num(s.slice(-2), 23), minute)}
          style={[styles.input, { width: 90, fontSize: 32, textAlign: 'center' }]}
          selectTextOnFocus
        />
        <Text style={{ fontSize: 32, color: colors.ink }}>:</Text>
        <TextInput
          accessibilityLabel="分"
          keyboardType="number-pad"
          value={String(minute).padStart(2, '0')}
          onChangeText={(s) => onChange(hour, num(s.slice(-2), 59))}
          style={[styles.input, { width: 90, fontSize: 32, textAlign: 'center' }]}
          selectTextOnFocus
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[-60, -10, -1].map((d) => (
          <Button key={d} label={d === -60 ? '−1時間' : `${d}分`} variant="secondary" onPress={() => set(total + d)} style={{ flex: 1, paddingHorizontal: 4 }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[1, 10, 60].map((d) => (
          <Button key={d} label={d === 60 ? '+1時間' : `+${d}分`} variant="secondary" onPress={() => set(total + d)} style={{ flex: 1, paddingHorizontal: 4 }} />
        ))}
      </View>
      <Text style={{ fontSize: sizes.small, color: colors.muted, textAlign: 'center' }}>数字を直接入力することもできます</Text>
    </View>
  );
}
