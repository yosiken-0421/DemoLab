// 音声入力：expo-speech-recognition（iOS/Android の端末音声認識、Web は Web Speech API）を
// 1つだけ動かすためのコントローラー。Expo Go などネイティブモジュールが無い環境でも
// アプリが落ちないよう、読み込みは try で囲む。
type Listener = { remove(): void };
type SpeechModule = {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  addListener(event: string, cb: (e: any) => void): Listener;
};

let mod: SpeechModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechModule;
} catch {
  mod = null;
}

export const KEYBOARD_FALLBACK_MESSAGE =
  'この環境では音声認識が使えません。キーボードのマイクボタン（音声入力）を使うと、同じように声で入力できます。';

export function isSpeechAvailable(): boolean {
  try {
    return !!mod && mod.isRecognitionAvailable();
  } catch {
    return false;
  }
}

export interface SpeechSession {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onEnd(): void;
  onError(message: string): void;
}

let active: { session: SpeechSession; listeners: Listener[] } | null = null;

function cleanup() {
  active?.listeners.forEach((l) => l.remove());
  active = null;
}

export async function startSpeech(session: SpeechSession): Promise<void> {
  if (!mod || !isSpeechAvailable()) {
    session.onError(KEYBOARD_FALLBACK_MESSAGE);
    session.onEnd();
    return;
  }
  stopSpeech();
  const perm = await mod.requestPermissionsAsync();
  if (!perm.granted) {
    session.onError('マイク／音声認識の許可がありません。端末の設定アプリで許可してください。');
    session.onEnd();
    return;
  }
  const listeners = [
    mod.addListener('result', (e: { results?: { transcript: string }[]; isFinal?: boolean }) => {
      const text = e.results?.[0]?.transcript ?? '';
      if (e.isFinal) session.onFinal(text);
      else session.onInterim(text);
    }),
    mod.addListener('error', (e: { error?: string; message?: string }) => {
      if (e.error === 'aborted' || e.error === 'no-speech') return;
      session.onError(
        e.error === 'not-allowed' || e.error === 'service-not-allowed'
          ? 'マイク／音声認識の許可がありません。端末の設定アプリで許可してください。'
          : e.error === 'language-not-supported'
            ? `日本語の音声認識が使えません。${KEYBOARD_FALLBACK_MESSAGE}`
            : `音声認識でエラーが発生しました（${e.error ?? ''}）。${KEYBOARD_FALLBACK_MESSAGE}`,
      );
    }),
    mod.addListener('end', () => {
      const s = active?.session;
      cleanup();
      s?.onEnd();
    }),
  ];
  active = { session, listeners };
  try {
    mod.start({ lang: 'ja-JP', interimResults: true, continuous: false, addsPunctuation: true });
  } catch (err) {
    cleanup();
    session.onError(`音声認識を開始できませんでした。${KEYBOARD_FALLBACK_MESSAGE}`);
    session.onEnd();
  }
}

export function stopSpeech(): void {
  if (!active) return;
  try {
    mod?.stop();
  } catch {
    const s = active.session;
    cleanup();
    s.onEnd();
  }
}
