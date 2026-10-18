import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '@demolab/shared';

const icon = (emoji: string) => () => <Text style={{ fontSize: 22 }}>{emoji}</Text>;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontSize: 13, fontWeight: '700' },
        tabBarStyle: { height: 68, paddingTop: 6 },
        headerTitleStyle: { fontSize: 20, fontWeight: '700' },
        headerTitleAlign: 'center',
      }}
    >
      <Tabs.Screen name="index" options={{ title: '出退勤', tabBarIcon: icon('🕘') }} />
      <Tabs.Screen name="report" options={{ title: '日報', tabBarIcon: icon('📝') }} />
      <Tabs.Screen name="history" options={{ title: '履歴・検索', tabBarIcon: icon('🔍') }} />
      <Tabs.Screen name="export" options={{ title: '出力・統合', tabBarIcon: icon('📤') }} />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
