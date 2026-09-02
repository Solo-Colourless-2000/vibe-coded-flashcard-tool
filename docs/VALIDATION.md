# Validation Record — RECALL 0.2.1

再監査日: 2026-08-31。対象は `D:\vibe-coded-quizlet-ripoff` の現行ソースです。

## 合格した検査

- Node.js 22.14.0とNode.js 24.19.0の双方で、Node source/unit/regression testsは76/76合格。
- TypeScript: `tsc --noEmit --incremental false` 合格。
- ESLint: error 0、warning 0。
- Node.js 22.14.0とNode.js 24.19.0の双方で本番ビルド合格。
- Node.js 24.19.0で一時loopbackサーバーを起動し、HTMLはHTTP 200。本番ブラウザーでは約0.32秒でloading表示が消え、操作可能なホーム画面へ遷移。
- 本番画面で「半角カッコ内の省略を許可」が表示され、省略可／入力必須の説明へ切り替わることを確認。
- 本番CSPがsame-origin scriptに限定し、script属性を禁止しつつ、Vinext生成bootstrapを実行できることを確認。
- Worker bundleに再監査後のExcel結果検証が含まれることを確認。
- HTMLマニュアル検証: 25 sections、旧本編849ページ相当、差し替え注意119ページ、現行ソース45ファイルを確認。
- HTMLマニュアルの目次順、重複IDなし、操作用inline script構文、全文検索・コピー・文字サイズ・集中表示・モバイル・印刷用要素を確認。
- HTMLマニュアル本文は英字用`Segoe UI`を日本語フォントより先に、コードは`Cascadia Mono`／`Consolas`をCJK等幅フォントより先に指定し、PDFで発生した英字崩れを持ち越さないことを確認。
- HTMLマニュアルが外部script、外部stylesheet、外部画像、CSS import、PDFリンクを使用せず、単体でHTTP 200 / `text/html`として取得できることを確認。
- 旧PDFマニュアル4ファイルとPDF専用の生成・検証処理3ファイルが残っていないことを確認。
- source release検証: 57 manifested files + manifest。HTML本体、HTML用基礎データ、template、生成・検証処理を含み、PDFを含まない。
- CycloneDX SBOM: lockfileから687 componentsを生成。
- third-party notices: lockfile/node_modules metadataから687 package entriesを生成。

## 再監査で固定した回帰条件

- 回答比較は行末水平空白だけを除去し、Unicode NFC/NFDを同一視しない。
- 対応の取れた半角カッコ内は、設定オンなら省略可、オフなら全文入力必須。
- カッコ省略設定はStudyProgress version 3へ保存し、version 1/2は省略可として移行する。
- 入れ子の半角カッコは省略候補ではなく通常文字として扱う。
- 0.2.1バックアップの`appVersion`は`0.2.1`。
- timeout/blocked後に遅れて開いたIndexedDB接続を閉じる。
- timeoutになったIndexedDB transactionをabortする。
- 初回フォルダー作成中に外部作成された`sets.json`を上書きしない。
- フォルダー接続解除時もブラウザーrevision競合を無視しない。
- Excel結果をWorker内で検証し、全シート合計文字数を上限内に収めてからUIへ渡す。
- Node.js対応範囲は`>=22.13.0 <25`で、Node.js 24を含む。
- 本番CSPはVinextのインラインbootstrapを遮断せず、`script-src-attr 'none'`を維持する。
- マニュアルはUTF-8の単一HTMLだけを配布し、PDFを再生成しない。
- `npm run manual:build`で現行ソースを反映し、`npm run manual:verify`で849ページ相当・119差し替え注意・45ソースと外部依存なしを固定する。
- source releaseは`__pycache__`、`.pyc`、`.pyo`およびOS生成cacheを除外する。

## 実行環境上の補足

Node.js 22.14.0はNode.js公式配布ZIPを使用し、公式`SHASUMS256.txt`のSHA-256 `55B639295920B219BB2ACBCFA00F90393A2789095B7323F79475C9F34795F217`と一致することを確認してから検査しました。

Node.js 24の最終HTTP/browser smoke testは、製品コードの既定値かつcanonical originである`127.0.0.1:3000`で実施しました。操作画面とカッコ省略設定を確認後に試験用サーバーを停止し、同ポートに待受プロセスが残っていないことも確認しています。

HTMLマニュアルは参考HTMLの構成に合わせ、固定目次、全文検索、文字サイズ変更、集中表示、コードコピー、モバイルナビゲーション、印刷用表示を内蔵しました。旧PDF本編の選択可能文字は`foundation_pages.json`へUTF-8で移し、付録は現行プロジェクトファイルから再生成します。

0.2.1ソース適用後の再監査では、依存versionの追加・更新や`package-lock.json`の依存グラフ変更は行っていません。外部registryへの依存メタデータ送信を伴うオンライン監査は、この再監査では実行結果へ含めていません。
