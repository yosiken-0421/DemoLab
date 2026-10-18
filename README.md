# DemoLab

アプリやWebサイトの試作品を置くリポジトリです。

| フォルダ | 内容 |
|---|---|
| `apps/nippo` | 日報アプリ（Expo：iPhone／Android／Web） |
| `apps/receipt` | 領収書・経費精算アプリ（Expo：iPhone／Android／Web） |
| `packages/shared` | 2つのアプリで共通の部品（SQLite、Excel書き出し・読み込み、音声入力、画面部品） |
| `nippo/`・`keihi/` | GitHub Pages で公開する Web版（`scripts/build-web.sh` で生成） |
| `receipt-note/` | 以前の Web 版レシートノート（そのまま残しています） |

## 開発の始め方

```bash
npm install                 # リポジトリ直下で1回
npm test                    # 計算・読み取り・Excel出力のテスト
npm run typecheck           # 型チェック
cd apps/nippo && npx expo start --web     # Web版を手元で動かす（receipt も同様）
```

## Web版の公開（GitHub Pages）

```bash
scripts/build-web.sh nippo          # → nippo/
scripts/build-web.sh receipt keihi  # → keihi/
```

ビルド結果をコミットして main に入れると、`https://yosiken-0421.github.io/DemoLab/nippo/` と `…/keihi/` で開けます。
Web版のデータはそのブラウザの中だけに保存されます（スマホ版とは同期しません）。

## iPhone／Android に入れる（EAS Build）

音声入力・端末内OCR・書類スキャナは Expo Go（お試し用アプリ）では動かないため、EAS Build でアプリを作ります。

1. Expo のアカウントを作る：https://expo.dev/signup
2. パソコンで `npx eas-cli@latest login`
3. アプリのフォルダで初回だけ `npx eas-cli@latest init`（Expo 上にプロジェクトが作られます）
4. ビルド
   - Android：`npx eas-cli@latest build -p android --profile preview` → 完成後に表示されるURL／QRコードから APK をインストール
   - iPhone（社内配布）：
     1. `npx eas-cli@latest device:create` で自分の iPhone を登録（表示されるURLを iPhone の Safari で開いて登録）
     2. `npx eas-cli@latest build -p ios --profile preview`
     3. 途中で Apple ID でのログインを求められます。証明書とプロビジョニングプロファイルは EAS が自動で作ります（Apple Developer Program の登録が必要）
     4. 完成後のURLを iPhone で開いてインストール。iOS 16以降は「設定 → プライバシーとセキュリティ → デベロッパモード」をオンにする必要があります
   - Apple Developer のアカウント画面：https://developer.apple.com/account
5. `app.json` の `ios.bundleIdentifier`／`android.package`（`jp.demolab.nippo` など）は仮の値です。正式に配布する前に、自社のドメインに合わせて変更してください。

## 領収書OCRの精度テスト

- **Claude API・Web版のOCR（Tesseract）**：パソコンで測れます。
  1. フォルダにレシート写真と `truth.json`（正解）を置く。書式は `apps/receipt/scripts/ocr-eval.ts` の先頭に記載
  2. `ANTHROPIC_API_KEY=… npx tsx apps/receipt/scripts/ocr-eval.ts <フォルダ>`
  3. `<フォルダ>/ocr-eval-result.xlsx` に、項目ごとの正解率と写真ごとの結果が出ます
  - 前処理に Python の Pillow を使います（`pip install pillow`）
- **スマホの端末内OCR（ML Kit）**：アプリの「設定 → OCR精度テスト」で写真を選ぶと、端末内OCRと Claude API の結果を並べて表示し、Excelに出力できます（「正解」行に手で記入して比べます）。
