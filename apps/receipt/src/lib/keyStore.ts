import * as SecureStore from 'expo-secure-store';

const KEY = 'anthropic_api_key';
export const KEY_STORAGE_NOTE = 'APIキーは端末の安全な保管領域（iOS: キーチェーン／Android: Keystore）に保存されます。';
export const getApiKey = async () => (await SecureStore.getItemAsync(KEY)) ?? '';
export const setApiKey = (v: string) => (v ? SecureStore.setItemAsync(KEY, v) : SecureStore.deleteItemAsync(KEY));
