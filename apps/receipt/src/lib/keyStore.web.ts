const KEY = 'anthropic_api_key';
export const KEY_STORAGE_NOTE = 'Web版ではAPIキーをこのブラウザ内（localStorage）に保存します。共用のパソコンでは入力しないでください。';
export const getApiKey = async () => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
};
export const setApiKey = async (v: string) => {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // 保存できない環境（プライベートブラウズ等）では次回また入力
  }
};
