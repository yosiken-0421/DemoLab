import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/lib/AppContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerTitleStyle: { fontSize: 20, fontWeight: '700' }, headerBackTitle: '戻る', headerTitleAlign: 'center' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="confirm" options={{ title: '読み取り結果の確認' }} />
            <Stack.Screen name="new" options={{ title: '手入力で登録' }} />
            <Stack.Screen name="receipt/[id]" options={{ title: '領収書の詳細' }} />
            <Stack.Screen name="ocr-test" options={{ title: 'OCR精度テスト' }} />
          </Stack>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
