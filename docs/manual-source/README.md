# RECALL HTML manual source

RECALLの本編と完成ソース付録は、`docs/RECALL_コードエディター版_初心者向け完全開発マニュアル_20260831.html`へ統合されています。2026-08-31以降、PDFマニュアルは生成・更新しません。

## 構成

- `foundation_pages.json`: 旧本編849ページ分の選択可能文字をUTF-8で保持する、PDF非依存の基礎解説データ。
- `source_catalog.json`: 完成ソース付録へ収録する45ファイルと、それぞれの責務。
- `manual-template.html`: 固定ヘッダー、目次、全文検索、文字サイズ、集中表示、コピー、モバイルナビ、印刷表示を含む自己完結型テンプレート。
- `generate_manual_html.mjs`: 基礎解説、最新差分、現行ソース・SHA-256・行番号・逐次解説を1つのHTMLへ統合する生成処理。
- `verify_manual_html.mjs`: 生成結果との完全一致、849ページ相当、差し替え注意119ページ、45ソース、目次、重複ID、操作script構文、外部依存なし、PDF残存なしを検証する処理。

## 更新

```bash
npm run manual:build
npm run manual:verify
```

アプリのコード、対応Node.js、テスト件数、検証記録、収録ソースを変更した場合は、HTMLを手作業で部分修正せず、必ず上記の順で再生成します。`npm run check`にも`manual:verify`が含まれます。

HTMLは外部CDN・外部フォント・外部JavaScriptを使用しません。印刷または保存が必要な場合は、HTMLに内蔵した印刷用スタイルを使用します。
