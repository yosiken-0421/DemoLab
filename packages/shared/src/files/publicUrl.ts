import Constants from 'expo-constants';

/** Web版で public/ 配下のファイルURLを作る（GitHub Pages のサブパス対応） */
export function publicUrl(path: string): string {
  // baseUrl は本番ビルド（expo export）でのみ有効
  const base = (__DEV__ ? '' : Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
