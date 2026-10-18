import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, sizes } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scroll, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {body}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Card({ title, children, right, style }: { title?: string; children: ReactNode; right?: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {(title || right) && (
        <View style={styles.cardHead}>
          {title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';

export function Button({
  label,
  onPress,
  variant = 'primary',
  big = false,
  disabled = false,
  loading = false,
  style,
  sub,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: Variant;
  big?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  sub?: string;
  accessibilityLabel?: string;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: '#fff', border: colors.primary },
    accent: { bg: colors.accent, fg: '#fff', border: colors.accent },
    secondary: { bg: '#fff', fg: colors.primaryDark, border: colors.primary },
    danger: { bg: '#fff', fg: colors.danger, border: colors.danger },
    ghost: { bg: 'transparent', fg: colors.primaryDark, border: 'transparent' },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        big && styles.bigButton,
        { backgroundColor: palette.bg, borderColor: palette.border, opacity: off ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          <Text style={[styles.buttonText, big && styles.bigButtonText, { color: palette.fg }]}>{label}</Text>
          {sub ? <Text style={[styles.buttonSub, { color: palette.fg }]}>{sub}</Text> : null}
        </>
      )}
    </Pressable>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <Text style={styles.label}>
      {children}
      {hint ? <Text style={styles.hint}>{`  ${hint}`}</Text> : null}
    </Text>
  );
}

export function Field({
  label,
  hint,
  style,
  highlight,
  error,
  ...props
}: TextInputProps & { label?: string; hint?: string; highlight?: 'warn' | 'danger'; error?: string }) {
  const bg = highlight === 'danger' ? colors.dangerSoft : highlight === 'warn' ? colors.warnSoft : '#fff';
  const border = error || highlight === 'danger' ? colors.danger : highlight === 'warn' ? colors.warn : colors.line;
  return (
    <View style={{ marginBottom: sizes.gap, flex: (style as ViewStyle)?.flex }}>
      {label ? <Label hint={hint}>{label}</Label> : null}
      <TextInput
        placeholderTextColor={colors.disabled}
        {...props}
        style={[styles.input, props.multiline && styles.multiline, { backgroundColor: bg, borderColor: border }, style]}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
  allowEmpty = false,
  labels,
}: {
  labels?: Partial<Record<T, string>>;
  options: readonly T[];
  value: T | '' | null | undefined;
  onChange: (v: T | '') => void;
  allowEmpty?: boolean;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = value === o;
        return (
          <Pressable
            key={o}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(on && allowEmpty ? '' : o)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{labels?.[o] ?? o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: object }) {
  return <Text style={[styles.muted, style]}>{children}</Text>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'danger' }) {
  const bg = tone === 'danger' ? colors.dangerSoft : tone === 'warn' ? colors.warnSoft : colors.accentSoft;
  const fg = tone === 'danger' ? colors.danger : tone === 'warn' ? '#7a5210' : colors.accent;
  return (
    <View style={[styles.notice, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: sizes.small, lineHeight: 22 }}>{children}</Text>
    </View>
  );
}

export function IconButton({ label, onPress, accessibilityLabel, color = colors.primaryDark, disabled }: { label: string; onPress: () => void; accessibilityLabel: string; color?: string; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.iconButton, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Text style={{ fontSize: 20, color, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, paddingBottom: 48, gap: sizes.gap },
  card: { backgroundColor: colors.card, borderRadius: sizes.radius, padding: 16, borderWidth: 1, borderColor: colors.line, gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: sizes.title - 2, fontWeight: '700', color: colors.ink },
  button: {
    minHeight: sizes.button,
    borderRadius: sizes.radius,
    borderWidth: 2,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigButton: { minHeight: sizes.bigButton },
  buttonText: { fontSize: sizes.font, fontWeight: '700' },
  bigButtonText: { fontSize: 26 },
  buttonSub: { fontSize: sizes.small, marginTop: 2 },
  row: { flexDirection: 'row', gap: sizes.gap, alignItems: 'center' },
  label: { fontSize: sizes.small, fontWeight: '700', color: colors.ink, marginBottom: 6 },
  hint: { fontWeight: '400', color: colors.muted },
  input: {
    minHeight: sizes.button,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: sizes.font,
    color: colors.ink,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  error: { color: colors.danger, fontSize: sizes.small, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 48, paddingHorizontal: 16, borderRadius: 24, borderWidth: 1.5, borderColor: colors.line, justifyContent: 'center', backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: sizes.font - 1, color: colors.ink },
  chipTextOn: { color: '#fff', fontWeight: '700' },
  muted: { color: colors.muted, fontSize: sizes.small, lineHeight: 22 },
  notice: { borderRadius: 12, padding: 12 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24 },
});
