#!/usr/bin/env bash
# Web版をビルドして GitHub Pages 用のフォルダ（リポジトリ直下）に書き出す。
#   使い方: scripts/build-web.sh nippo   → ./nippo/ に出力（https://<user>.github.io/DemoLab/nippo/）
set -euo pipefail
APP="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/$APP"
cd "$ROOT/apps/$APP"
rm -rf dist
EXPO_OFFLINE=1 CI=1 npx expo export -p web --output-dir dist
rm -rf "$OUT"
cp -R dist "$OUT"
# GitHub Pages は SPA のサブページを直接開くと 404 になるため、各画面に index.html を置く
for route in $(ls src/app/\(tabs\) src/app | grep -E '\.tsx$' | grep -vE '^_|^index\.tsx$' | sed 's/\.tsx$//' | sort -u); do
  mkdir -p "$OUT/$route"
  cp "$OUT/index.html" "$OUT/$route/index.html"
done
touch "$ROOT/.nojekyll" # _expo フォルダを Jekyll に無視させない
echo "built: $OUT"
