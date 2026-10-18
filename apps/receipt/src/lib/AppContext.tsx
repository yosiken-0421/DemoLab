import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { loadSettings, saveSettings } from './db';
import { getApiKey, setApiKey } from './keyStore';
import { DEFAULT_SETTINGS, Settings } from './types';

interface Ctx {
  settings: Settings;
  updateSettings: (next: Settings) => void;
  apiKey: string;
  updateApiKey: (key: string) => Promise<void>;
}

const AppCtx = createContext<Ctx>({ settings: DEFAULT_SETTINGS, updateSettings: () => {}, apiKey: '', updateApiKey: async () => {} });

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadSettings(), getApiKey()]).then(
      ([s, k]) => {
        setSettings(s);
        setKey(k);
      },
      (e) => setError(String(e?.message ?? e)),
    );
  }, []);

  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    void saveSettings(next);
  }, []);

  const updateApiKey = useCallback(async (k: string) => {
    setKey(k);
    await setApiKey(k);
  }, []);

  if (error || !settings) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 18 }}>{error ? `データの読み込みに失敗しました：${error}` : '読み込み中…'}</Text>
      </View>
    );
  }
  return <AppCtx.Provider value={{ settings, updateSettings, apiKey, updateApiKey }}>{children}</AppCtx.Provider>;
}

export const useApp = () => useContext(AppCtx);
