import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, TextInputProps, View } from 'react-native';
import { isSpeechAvailable, KEYBOARD_FALLBACK_MESSAGE, startSpeech, stopSpeech } from '../speech/speech';
import { Label, styles } from './components';
import { colors, sizes } from './theme';

/** 手入力と音声入力の両方ができる文章欄。認識結果はそのまま欄に入り、編集できる */
export function VoiceField({
  label,
  hint,
  value,
  onChangeText,
  multiline = true,
  ...props
}: Omit<TextInputProps, 'value' | 'onChangeText'> & {
  label?: string;
  hint?: string;
  value: string;
  onChangeText: (t: string) => void;
}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  const append = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const cur = valueRef.current;
    const sep = !cur ? '' : multiline ? (cur.endsWith('\n') ? '' : '\n') : ' ';
    onChangeText(cur + sep + t);
  };

  const toggle = async () => {
    if (listening) {
      stopSpeech();
      return;
    }
    setMessage(null);
    if (!isSpeechAvailable()) {
      setMessage(KEYBOARD_FALLBACK_MESSAGE);
      return;
    }
    setListening(true);
    await startSpeech({
      onInterim: setInterim,
      onFinal: (t) => {
        setInterim('');
        append(t);
      },
      onEnd: () => {
        setListening(false);
        setInterim('');
      },
      onError: setMessage,
    });
  };

  return (
    <View style={{ marginBottom: sizes.gap }}>
      {label ? <Label hint={hint}>{label}</Label> : null}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <TextInput
          {...props}
          value={value}
          onChangeText={onChangeText}
          multiline={multiline}
          placeholderTextColor={colors.disabled}
          style={[styles.input, multiline && styles.multiline, { flex: 1, backgroundColor: '#fff', borderColor: listening ? colors.danger : colors.line }]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={listening ? '音声入力を止める' : '音声で入力する'}
          onPress={toggle}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: listening ? colors.danger : colors.primarySoft,
            borderWidth: 2,
            borderColor: listening ? colors.danger : colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text style={{ fontSize: listening ? 18 : 24, color: listening ? '#fff' : colors.primaryDark, fontWeight: '700' }}>
            {listening ? '停止' : '🎤'}
          </Text>
        </Pressable>
      </View>
      {listening ? (
        <Text style={{ color: colors.danger, fontSize: sizes.small, marginTop: 6 }}>
          聞き取り中…{interim ? `「${interim}」` : '話してください（話し終えると自動で入力されます）'}
        </Text>
      ) : null}
      {message ? <Text style={{ color: '#7a5210', fontSize: sizes.small, marginTop: 6, lineHeight: 21 }}>{message}</Text> : null}
    </View>
  );
}
