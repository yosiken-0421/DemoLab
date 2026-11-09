# レシートノート 自動テスト

`receipt-note/index.html` を変更せずにそのまま読み込んで検証します。テスト画像はすべて実行時に生成する**架空の合成レシート**で、実在の領収書・個人情報は使いません。公開アプリの動作には影響しません（このフォルダはアプリから読み込まれません）。

```bash
cd receipt-note/tests
npm install                 # playwright 1.65.0 / tesseract.js 5.1.1（ソース確認用）
npx playwright install chromium webkit
npm test                    # 単体 + E2E(Chromium) + E2E(WebKit)
node run-all.mjs --bench    # 上記 + OCRベンチマーク
node ocr-bench.mjs [--browser webkit] [--only id1,id2] [--cfg '{"targetLineHeight":30}'] [--app path/to/other.html]
```

| ファイル | 内容 |
|---|---|
| `unit.test.mjs` | 文字正規化・金額/日付/税率抽出・検算・座標変換・傾き/用紙検出・Excel 13シート |
| `e2e.test.mjs` | 月別分類・編集・並べ替え・再読込後の保持・Excel・JSON復元/不正JSON拒否・旧形式データ・カメラ拒否・CDN障害・空白画像・疑似カメラ映像OCRと重ね表示位置・外部送信なし |
| `ocr-bench.mjs` | 合成レシート20種（小文字・ぼけ・暗所・影・薄印字・傾き・ノイズ・切れ・長尺・横向き・高解像度）を実アプリの高画質入力に投入し、日付/店名/金額/税率の正否、金額の誤入力、行の読取率、重ね表示の位置一致率を採点 |

注意：ここでの結果はPC上のブラウザエンジン（Chromium / Windows版WebKit）と合成画像によるものです。iPhone実機のSafari・実カメラ・感熱紙レシートでの精度は別途確認が必要です。
