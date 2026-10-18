// スマホ版：撮影（書類スキャナ：輪郭検出・台形補正つき、連続撮影）とカメラロール選択
import * as ImagePicker from 'expo-image-picker';

type Scanner = {
  default: { scanDocument(o: { croppedImageQuality?: number; maxNumDocuments?: number }): Promise<{ scannedImages?: string[]; status?: string }> };
};
let scanner: Scanner | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  scanner = require('react-native-document-scanner-plugin') as Scanner;
} catch {
  scanner = null;
}

export const SCANNER_NOTE = '書類スキャナで撮影します。領収書の四隅を自動で検出し、傾きを補正します。続けて何枚でも撮影でき、最後に「保存」でまとめて読み取ります。';

export async function scanReceipts(): Promise<string[]> {
  if (scanner) {
    try {
      const r = await scanner.default.scanDocument({ croppedImageQuality: 90, maxNumDocuments: 30 });
      return r.status === 'cancel' ? [] : (r.scannedImages ?? []);
    } catch (e) {
      // スキャナが使えない端末（Google Play 開発者サービスが無い Android など）は通常カメラで撮る
      if (!(e instanceof Error) || !/cancel/i.test(e.message)) return cameraFallback();
      return [];
    }
  }
  return cameraFallback();
}

async function cameraFallback(): Promise<string[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('カメラの使用が許可されていません。端末の設定アプリで許可してください');
  const r = await ImagePicker.launchCameraAsync({ quality: 0.9 });
  return r.canceled ? [] : r.assets.map((a) => a.uri);
}

export async function pickFromLibrary(): Promise<string[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 30, quality: 0.9 });
  return r.canceled ? [] : r.assets.map((a) => a.uri);
}
