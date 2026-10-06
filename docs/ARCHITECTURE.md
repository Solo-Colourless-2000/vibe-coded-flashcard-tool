# アプリの構成と保守ガイド

2026-10-07のリファクタリングで、`app/page.tsx`に集まっていた画面・編集・学習・保存処理を、`app/recall/`配下の機能別モジュールへ分離しました。画面の操作、採点ルール、保存スキーマ、IndexedDBのキー、フォルダー内のJSONファイル形式は従来と同じです。

## 入口と依存関係

`app/page.tsx`はルートの入口として`RecallApp`を描画します。`RecallApp.tsx`は各機能のフックと画面を組み合わせ、画面移動やバックアップ復元後のリセットを連携します。各画面は型付きのpropsを受け取って表示し、操作を担当フックへ渡します。

```text
app/
├─ page.tsx                     ルートの入口
├─ recall/
│  ├─ RecallApp.tsx             機能フックと画面の組み立て
│  ├─ types.ts                  UIと機能間の型契約
│  ├─ shell/AppSidebar.tsx      共通ナビゲーションと保存状態表示
│  ├─ navigation/
│  │  ├─ useAppNavigation.ts    URLハッシュ、戻る・進む、画面移動
│  │  └─ views.ts              有効な画面名の検証
│  ├─ library/
│  │  ├─ DashboardView.tsx      ホームと学習状況
│  │  ├─ LibraryView.tsx        セット一覧と検索UI
│  │  ├─ useSetLibrary.ts       検索、集計、セット削除
│  │  └─ DeleteSetDialog.tsx    削除確認
│  ├─ editor/
│  │  ├─ EditorView.tsx         セット・カード編集UI
│  │  ├─ useSetEditor.ts        編集操作、下書き保存、保存確定
│  │  ├─ draft.ts              下書きの初期値とデータ検証
│  │  ├─ draftStorage.ts        IndexedDB・旧下書きの読み込み
│  │  └─ prepareDraftSave.ts    保存前検証と保存するセットの生成
│  ├─ study/
│  │  ├─ StudyReadyView.tsx     出題設定と途中再開UI
│  │  ├─ StudyView.tsx          問題、正答再入力、習得・結果画面
│  │  ├─ StudyMessage.tsx       学習エラー表示
│  │  └─ useStudySession.ts     回答、再入力、再出題、進捗、キーボード
│  ├─ flashcards/
│  │  ├─ FlashcardsView.tsx     カード表示UI
│  │  └─ useFlashcards.ts       表裏、移動、シャッフル
│  ├─ storage/
│  │  ├─ useStudyStorage.ts     保存機能の公開APIと組み立て
│  │  ├─ useStorageState.ts     保存状態と保存キューの内部参照
│  │  ├─ useStorageHydration.ts 起動時復元、旧データ移行、タイムアウト
│  │  ├─ usePersistence.ts      保存キュー、自動保存、競合、削除IDの確定
│  │  ├─ useFolderStorage.ts    フォルダー接続・解除、永続化要求
│  │  ├─ useBackupManagement.ts 予備コピー・JSONバックアップの操作
│  │  ├─ mergeStudySets.ts      接続時のセット統合
│  │  ├─ backupFiles.ts         バックアップファイルの読み込みと命名
│  │  ├─ folderWriteLock.ts     Web Locksによるフォルダー書き込みの直列化
│  │  ├─ constants.ts          従来の保存キーと復元タイムアウト
│  │  ├─ StorageDialog.tsx     保存先とバックアップのUI
│  │  └─ BackupRestoreDialog.tsx バックアップ復元確認
│  └─ shared/
│     ├─ ModalDialog.tsx        共通モーダル枠とフォーカス制御
│     ├─ Toast.tsx              通知UI
│     ├─ useNotifications.ts    通知の状態と表示時間
│     ├─ LoadingScreen.tsx      起動時の読み込み表示
│     └─ setHelpers.ts          日付、カード比較、シャッフルなど
├─ model.ts                    採点・学習状態遷移・保存/取込データ検証
├─ browserStorage.ts           IndexedDB、revision、予備コピーの入出力
├─ fileStorage.ts              フォルダーJSONの入出力と競合・書込検証
├─ backupFile.ts               全体バックアップのスキーマ
├─ ImportDialog.tsx            インポートUI
├─ spreadsheetReader.ts        Excel Workerの呼び出しとキャンセル
├─ spreadsheetWorker.ts        Excel解析と解析結果の上限検証
├─ CodeAnswerEditor.tsx         CodeMirror入力部品
├─ useModalDialog.ts           フォーカス復元、inert、Escape、Tab制御
└─ globals.css                 既存の共通スタイル
```

## データと操作の流れ

学習セットの状態は`useStudyStorage`が所有します。編集・学習・一覧のフックはそのセットと更新関数を受け取り、必要な変更を行います。画面コンポーネントはIndexedDBやフォルダーへ直接書き込みません。

編集時は`useSetEditor`が入力中の下書きを保持し、`prepareDraftSave`が必須項目・片側だけ入力されたカード・保存上限を検査します。問題や解答の内容を変更した場合だけ、既存の学習進捗と成績を破棄します。セット名・説明・カード順の変更では進捗を維持します。検証した内容の永続保存に成功してから、画面上のセットを更新します。

学習時は`useStudySession`が入力値や現在のセッションを保持し、`model.ts`の判定・状態遷移関数を呼び出します。回答ごとにセット内の`studyProgress`を更新し、保存フックが従来の形式で永続化します。再読み込み後は保存済み進捗から再開します。

保存時のrevision、フォルダーハンドル、世代番号、削除済みセットIDは保存機能の内部で管理します。セット削除とバックアップ復元は同じ確定保存処理を通り、保存できなかった場合は削除済みIDも元の状態へ戻します。既存の競合検知、保存キュー、予備コピー、書き込み後検証を引き継いでいます。

バックアップ復元確認中は保存設定を一時的に非表示にして、一つのモーダルだけが背景の操作とフォーカスを制御します。キャンセルすると保存設定へ戻り、復元に成功すると両方を閉じて一覧へ移動します。

## 変更内容から探すファイル

| 変更したい内容 | 主な変更先 |
| --- | --- |
| ホームの文言やセット一覧の見た目 | `library/DashboardView.tsx`、`library/LibraryView.tsx` |
| 検索対象、集計、セット削除 | `library/useSetLibrary.ts` |
| 編集画面、カードの追加・並べ替え・削除・元に戻す | `editor/EditorView.tsx`、`editor/useSetEditor.ts` |
| 保存前の必須項目や進捗を保持する条件 | `editor/prepareDraftSave.ts` |
| 下書きの形式や旧下書きの復元 | `editor/draft.ts`、`editor/draftStorage.ts` |
| 学習設定、問題表示、正答再入力、結果表示 | `study/StudyReadyView.tsx`、`study/StudyView.tsx` |
| 学習操作、入力処理、フォーカス、Enter操作 | `study/useStudySession.ts` |
| 採点ルール、出題グループ、学習状態遷移 | `app/model.ts` |
| 起動時復元の順序とタイムアウト | `storage/useStorageHydration.ts` |
| 自動保存や明示的保存の順序、複数タブの競合 | `storage/usePersistence.ts` |
| フォルダーの接続・解除 | `storage/useFolderStorage.ts` |
| 全体バックアップの書き出しと復元 | `storage/useBackupManagement.ts`、`app/backupFile.ts` |
| 保存領域への低レベル入出力 | `app/browserStorage.ts`、`app/fileStorage.ts` |
| 全画面共通のメニュー、通知、ダイアログ | `shell/AppSidebar.tsx`、`shared/` |

新しい画面は、その機能フォルダーに表示コンポーネントと必要なフックを追加し、`RecallApp.tsx`で接続します。純粋な検証・変換処理はフックから分離すると、ブラウザーを起動せずにテストできます。

## 検証とマニュアル更新

`tests/editor-draft.test.mjs`で下書きの検証・保存前の進捗扱い・フォルダー統合を実際の入力データから検証します。既存の学習・保存・レイアウト・セキュリティ回帰テストは、対応する分割先を参照します。

```bash
npm run manual:build
npm run check
npm run build
```

ファイルを追加したら、`docs/manual-source/source_catalog.json`の収録対象と役割を更新してHTMLを再生成します。

現在の教材は [TOTAL RECALL 機能別開発 初心者向け完全開発マニュアル（2026-10-07改訂）](TOTAL_RECALL_機能別開発_初心者向け完全開発マニュアル_20261007.html) です。準備と22工程の基礎実習から始め、24章・100工程で機能別のファイルを往復して実装を理解し、検索設定を追加する5工程の保守実習へ進みます。コード抜粋は実ファイルの検索アンカーと照合し、一度に36行以下に分けています。

完成ソースは照合用の付録です。分割前の説明849ページ相当は末尾の旧版資料として保存し、現在の実習と通常検索から分けています。手順を直す場合は`docs/manual-source/development-guide.json`、実習差分を直す場合は`beginner-workshop.mjs`または`search-workshop.mjs`を編集します。`manual:verify`で実習の全途中状態を型検査し、最終段階のlint・採点・検索テストも確認します。
