import React, { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { colors, sizes } from './theme';

/** 画面下からのシート型ダイアログ（Alert が使いにくい Web でも同じ見た目で動く） */
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(16,28,49,0.45)', justifyContent: 'flex-end' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="閉じる" />
        <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', width: '100%', maxWidth: 640, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderColor: colors.line }}>
            <Text style={{ fontSize: sizes.title, fontWeight: '700', color: colors.ink }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="閉じる" style={{ minWidth: 56, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: sizes.font, color: colors.primaryDark, fontWeight: '700' }}>閉じる</Text>
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function DateNav({ label, onPrev, onNext, onToday, isToday }: { label: string; onPrev: () => void; onNext: () => void; onToday?: () => void; isToday?: boolean }) {
  const btn = (text: string, onPress: () => void, a11y: string) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({ minWidth: 56, minHeight: 52, borderRadius: 12, borderWidth: 1.5, borderColor: colors.line, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ fontSize: 20, color: colors.primaryDark, fontWeight: '700' }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {btn('◀', onPrev, '前の日')}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text style={{ fontSize: sizes.font, fontWeight: '700', color: colors.ink }}>{label}</Text>
        {onToday && !isToday ? (
          <Pressable onPress={onToday} accessibilityRole="button" style={{ minHeight: 32, justifyContent: 'center' }}>
            <Text style={{ color: colors.accent, fontSize: sizes.small, fontWeight: '700' }}>今日に戻る</Text>
          </Pressable>
        ) : null}
      </View>
      {btn('▶', onNext, '次の日')}
    </View>
  );
}
