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
      <Tabs.Screen name="index" options={{ title: '登録', tabBarIcon: icon('📷') }} />
      <Tabs.Screen name="list" options={{ title: '一覧・検索', tabBarIcon: icon('🔍') }} />
      <Tabs.Screen name="settle" options={{ title: '精算', tabBarIcon: icon('🧾') }} />
      <Tabs.Screen name="export" options={{ title: '出力', tabBarIcon: icon('📤') }} />
      <Tabs.Screen name="settings" options={{ title: '設定', tabBarIcon: icon('⚙️') }} />
    </Tabs>
  );
}
