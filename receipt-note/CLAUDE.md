# Receipt Note / レシートノート — Claude Code project instructions

## Scope / source
- GitHub repository: https://github.com/yosiken-0421/DemoLab
- Work only under `receipt-note/` unless explicitly authorized. This public repo hosts unrelated demos.
- Main current code: `receipt-note/index.html` on `main`. Do not replace it with an older HTML attachment.
- Demo: https://yosiken-0421.github.io/DemoLab/receipt-note/
- Git blob SHA verified on 2026-11-09: `fa5cb534da1b4c473c5790d264cc5a1645001cd5`. Always check current main before editing.

## Features to preserve
- Single static HTML/CSS/JavaScript Web app, currently NOT a native iOS app.
- Browser camera via getUserMedia; high-resolution still photo input fallback; Tesseract.js 5.1.1 Japanese/English (jpn, eng) from CDN.
- Best-of-three captured frames, contrast enhancement, small-text mode with two enlarged vertical tiles.
- OCR recognized text mapped as overlays onto a frozen camera frame (not continuously live-tracked AR). Results require user confirmation and correction before saving.
- Date, store, amount, tax rate/tax amount, expense category, note; manual add/edit/delete/reorder; automatic monthly grouping.
- In-browser workbook generation with 13 sheets: annual summary plus Jan–Dec; JSON backup and restore.
- Records in browser localStorage under `receipt-note-records-v1`. Preserve data compatibility and provide migrations for any schema change.
- Do not accumulate photos in the iPhone Photos app or add raw receipt images to a public repo.

## Highest-priority issues and validation
1. User-reported small Japanese receipt print often fails OCR. Measure with privacy-safe fixtures and test capture resolution, focus, preprocessing and OCR settings; avoid unproven accuracy claims.
2. Verify bounding-box output from the installed **Tesseract.js 5.1.1** version, including `lines`, `blocks`, `tsv`; validate `locateTextLines`, coordinate mapping in `object-fit: contain`, tiled regions, rotation and crop.
3. Keep recognized text visible above the frozen receipt image until manual confirmation; never invent unread amounts.
4. Regress mobile layout, permissions, camera lifecycle, performance, persistence, category/order edits, monthly grouping and xlsx/JSON exports.
5. Document which tests ran, which passed, and what requires real iPhone Safari verification. No one has confirmed reliable real-device OCR performance yet.

## Privacy / instructions
- Repository is PUBLIC. Never commit real user receipts, personal expense records, API credentials, certificates, secrets or personal identifiers.
- Do not send receipts to third-party OCR services without explicit prior approval.
- Browser localStorage is not a tax-compliant retention scheme or cloud sync. Do not represent the current build as compliant with Japan's electronic bookkeeping laws.
- User is a beginner and prefers maximum automation. User interaction only for login, 2FA, permissions and final confirmation when necessary; **do not request screenshots**.
- Do not push consequential public changes without required authorization. Keep progress and final reports concise, in Japanese, and distinguish verified from unverified outcomes.

## Reference
Tesseract.js v5.1.1 API: https://raw.githubusercontent.com/naptha/tesseract.js/v5.1.1/docs/api.md
