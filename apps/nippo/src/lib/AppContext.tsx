import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { loadSettings, saveSettings } from './db';
import { DEFAULT_SETTINGS, Settings } from './types';

interface Ctx {
  settings: Settings;
  updateSettings: (next: Settings) => void;
}

const AppCtx = createContext<Ctx>({ settings: DEFAULT_SETTINGS, updateSettings: () => {} });

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings, (e) => setError(String(e?.message ?? e)));
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  }, []);

  if (error) return <Boot message={`データの読み込みに失敗しました：${error}`} />;
  if (!settings) return <Boot message="読み込み中…" />;
  return <AppCtx.Provider value={{ settings, updateSettings }}>{children}</AppCtx.Provider>;
}

function Boot({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 18 }}>{message}</Text>
    </View>
  );
}

export const useApp = () => useContext(AppCtx);
