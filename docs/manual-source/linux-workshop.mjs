// Documentation only. These commands are displayed, never executed by the app.
export const linuxGuide = [
  {
    id: "environment",
    title: "作業するLinuxとBashを確認する",
    paragraphs: [
      "この章はUbuntu/Debian系のデスクトップLinuxとBashを例にします。Windowsの準備2〜4にあるPowerShellコマンドの代わりに、この章を順に実行します。準備1の実習用コピーとブラウザープロファイルの考え方、準備5の保存方式、準備6のコードの読み方は両OSで共通です。",
      "ターミナルを開いて下の確認コマンドを一行ずつ実行します。Ubuntuではアプリ一覧から「端末」や「Terminal」を開きます。表示されるユーザー名、$、>は入力しません。コマンドはターミナル、.tsや.tsxのコードはエディターへ入力するという区別も同じです。",
      "WSLを使う場合はUbuntuなどLinux側のターミナルと、その環境に接続したエディターを使います。NodeとnpmもLinux側へ用意します。Windowsのnode_modulesを流用せず、実習先はLinux側のホーム内に置きます。通常のLinuxではF:\\というドライブ表記は使いません。",
    ],
    blocks: [{ id: "linux-identify", title: "Bash：OS、シェル、現在地を調べる", value: "cat /etc/os-release\nprintf 'shell=%s\\n' \"$SHELL\"\nprintf 'bash=%s\\n' \"${BASH_VERSION:-not-bash}\"\npwd\nid -un" }],
    expected: "OS名が想定したLinuxで、bash=の後ろにBashの版番号が出ます。bashの版番号が出ればBashで実行しています。not-bashならbashと入力してBashへ入り、以後の変数設定から同じターミナルでやり直します。SHELLはログイン時のシェルで、bashへ入っても値が変わらない場合があります。pwdは現在地、id -unは現在のユーザーを表示します。通常の作業は一般ユーザーで行います。",
  },
  {
    id: "tools",
    title: "準備の道具と、対応するNode.jsを用意する",
    paragraphs: [
      "下のaptコマンドはUbuntu/Debian系専用です。FedoraやArchなどでは、そのディストリビューションの公式手順でcurl、ca-certificates、rsync、gitを用意し、Nodeの手順へ進みます。apt updateは取得先の一覧を更新し、apt installは指定した道具を導入します。sudoのパスワード入力中に文字や●が出ないのは正常です。",
      "このアプリのNode条件は22.13.0以上25未満です。再現しやすいよう、この章では24.20.0を指定します。すでに条件に合うLinux版Nodeが使えるなら、nvmの導入は省略し、バージョンと実行ファイルの確認へ進めます。nvmはユーザーごとにNodeの版を選ぶ道具で、アプリのファイルを変更しません。",
      "nvmをまだ使っていない場合だけ、公式のv0.40.8の導入スクリプトを一時フォルダーへ取得します。取得と実行は別のコード欄です。curlの終了直後にprintf 'exit=%s\\n' \"$?\"で0を確認してからbashの欄へ進みます。失敗したら進みません。導入スクリプトはホーム内のnvmとBashの設定を用意します。sudoを付けません。導入後に現在のターミナルへnvmを読み込みます。",
    ],
    blocks: [
      { id: "linux-apt", title: "Bash：Ubuntu/Debian系で道具を導入（未導入の場合）", value: "sudo apt update\nsudo apt install curl ca-certificates rsync git" },
      { id: "linux-nvm-download", title: "Bash：nvmの公式スクリプトを取得（nvm未導入の場合）", value: "recall_nvm_installer=\"$(mktemp)\"\ncurl --fail --show-error --location \\\n  --output \"$recall_nvm_installer\" \\\n  https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh" },
      { id: "linux-nvm-install", title: "Bash：取得成功を確認してからスクリプトを実行", value: "bash \"$recall_nvm_installer\"" },
      { id: "linux-nvm-load", title: "Bash：このターミナルでnvmを読み込み、Nodeを選ぶ", value: "export NVM_DIR=\"$HOME/.nvm\"\n. \"$NVM_DIR/nvm.sh\"\ncommand -v nvm\nnvm install 24.20.0\nnvm use 24.20.0" },
      { id: "linux-node-version", title: "Bash：実際に使うLinux版の実行ファイルを確認する", value: "node --version\nnpm --version\ncommand -v node\ncommand -v npm\ncommand -v rsync" },
    ],
    expected: "nvmを使う例ではnode --versionがv24.20.0、command -v nodeがホーム内の.nvm以下を示します。npmの版はNode同梱の値でも構いません。次の依存導入だけは指定のnpm 12.0.2で実行します。/mnt/c/...のWindows版npmが出たらLinux版Nodeの選択を直します。nvmが見つからなければ導入結果とNVM_DIR/nvm.shの存在を確認してから読み込み直します。",
    references: [
      { title: "nvm公式：導入とLinuxでの読み込み", url: "https://github.com/nvm-sh/nvm" },
      { title: "Node.js公式：配布版", url: "https://nodejs.org/en/download" },
      { title: "Ubuntu公式：パッケージ管理", url: "https://ubuntu.com/server/docs/how-to/software/package-management/" },
    ],
  },
  {
    id: "paths",
    title: "コピー元と、まだ存在しない実習先を決める",
    paragraphs: [
      "完成プロジェクトをLinuxへ用意してから始めます。例は$HOME/learning-tool/vibe-coded-flashcard-toolです。$HOMEは現在のユーザーのホームを指し、変更する変数ではありません。コピー元を別の場所に置いた場合はrecall_sourceの右側だけを実在する絶対パスへ変更します。最初のmkdir -pは実習先の親となるlearning-toolを必要な場合だけ作ります。実習先そのものはまだ作りません。コピー先はrecall-practiceとし、元の中には作りません。",
      "コピーするのはコードと設定です。別OSで作ったnode_modulesやビルド結果は、OSごとの実行ファイルを含むため持ち込まず、Linux上で入れ直します。recall-data、sets.json、sets.backup.jsonは学習データとして除外します。.envから始まる秘密情報とGit履歴もこの練習用コピーへ持ち込みません。実データを別名で置いている場合は、その名前も次の除外一覧へ加えてください。",
      "まず変数を設定し、testの直後の結果を読みます。0は条件成立、1は不成立です。コピー元のpackage.jsonがない場合やコピー先が既にある場合は、パスまたは別の未使用の実習先名を選び直します。既存の実習先を削除したり上書きしたりしません。",
    ],
    blocks: [{ id: "linux-copy-paths", title: "Bash：例のパスを確認する（同じターミナルで続ける）", value: "mkdir -p -- \"$HOME/learning-tool\"\nrecall_source=\"$HOME/learning-tool/vibe-coded-flashcard-tool\"\nrecall_practice=\"$HOME/learning-tool/recall-practice\"\nprintf 'source=%s\\npractice=%s\\n' \"$recall_source\" \"$recall_practice\"\ntest -f \"$recall_source/package.json\"\nprintf 'source check exit=%s\\n' \"$?\"\ntest ! -e \"$recall_practice\" && test ! -L \"$recall_practice\"\nprintf 'destination check exit=%s\\n' \"$?\"" }],
    expected: "source check exit=0、destination check exit=0です。1なら次へ進まず、変数の値を直します。変数はそのターミナル内だけにあるため、閉じたり別のターミナルへ移ったりした場合はこの設定からやり直します。",
  },
  {
    id: "copy-plan",
    title: "除外対象とコピー一覧を先に確認する",
    paragraphs: [
      "下の関数はコピー元の存在、コピー先の未使用、コピー先が元の中にないことを確認してからrsyncを呼びます。括弧内は別の処理のまとまりなので、確認失敗のexit 1で現在のターミナル全体を閉じません。この関数定義を含むコード欄だけは、全体をまとめてターミナルへ入力します。途中の>はBashが関数の続きを待つ表示です。",
      "最初の呼び出しは--dry-runです。コピー予定を表示するだけで、実習先へまだ書き込みません。--itemize-changesで対象を列挙します。rsync -aはフォルダーの構造と設定ファイルを保ってコピーし、コピー元末尾の/はそのフォルダーの中身をコピー先へ入れる意味です。--excludeは同名のフォルダーやファイルを対象から外します。",
      "package.json、package-lock.json、.npmrc、.gitignore、app、docs、testsが予定にあり、node_modules、dist、recall-data、.env、.gitが予定にないことを確認します。隠しファイルの.npmrcも必要です。このファイルはNodeの条件や依存導入時の制約を指定します。",
    ],
    blocks: [{ id: "linux-copy-function", title: "Bash：確認付きコピー関数を定義し、予定だけ表示する", value: "copy_recall_practice() (\n  set -e\n  test -n \"${recall_source:-}\" && test -n \"${recall_practice:-}\" || exit 1\n  test -f \"$recall_source/package.json\" || {\n    printf '%s\\n' 'コピー元のpackage.jsonがありません。' >&2; exit 1;\n  }\n  if test -e \"$recall_practice\" || test -L \"$recall_practice\"; then\n    printf '%s\\n' '実習先が既にあります。別の名前を選びます。' >&2\n    exit 1\n  fi\n  recall_source_abs=\"$(realpath -- \"$recall_source\")\"\n  recall_practice_abs=\"$(realpath -m -- \"$recall_practice\")\"\n  case \"$recall_practice_abs/\" in\n    \"$recall_source_abs/\"*)\n      printf '%s\\n' 'コピー元の内部は実習先にできません。' >&2; exit 1;;\n  esac\n  if test -e \"$recall_practice_abs\" || test -L \"$recall_practice_abs\"; then\n    printf '%s\\n' '実習先が既にあります。別の名前を選びます。' >&2\n    exit 1\n  fi\n  rsync -a \"$@\" \\\n    --exclude='node_modules/' --exclude='dist/' \\\n    --exclude='.next/' --exclude='.vinext/' --exclude='.wrangler/' \\\n    --exclude='release/' --exclude='.git/' --exclude='.env*' \\\n    --exclude='recall-data/' --exclude='sets.json' \\\n    --exclude='sets.backup.json' --exclude='*.tsbuildinfo' \\\n    \"$recall_source_abs/\" \"$recall_practice_abs/\"\n)\ncopy_recall_practice --dry-run --itemize-changes" }],
    expected: "予定の一覧が出てエラーがありません。この時点では実習先が作られていないことも確認します。空白を含むパスを一つの値として扱うため、変数を囲む半角の二重引用符を残します。行末の\\はBashの行継続記号です。フォントによって¥に見える場合でも、コピーする実際の文字は半角のバックスラッシュです。全角の￥を代わりに入力せず、記号の後ろへ空白を入れません。",
    references: [{ title: "rsync公式：dry-run、exclude、コピー元末尾の/", url: "https://download.samba.org/pub/rsync/rsync.1" }],
  },
  {
    id: "copy-run",
    title: "実習コピーを作り、エディターで開く",
    paragraphs: [
      "同じBashのターミナルで、確認した関数を--dry-runなしで一度だけ呼びます。関数がまだ定義されている必要があります。成功後の再実行は既存先の検査で止まります。もしコピーが途中で失敗したら、その先を上書きせず原因を確認し、別の未使用名を設定して予定表示からやり直します。",
      "cdは現在地を変えるコマンドです。コピーが成功した後だけcdの欄へ進みます。pwdが実習先であること、隠し設定もあることを確認し、エディターの「フォルダーを開く」から同じ実習先を開きます。VS Codeのcodeコマンドを導入済みならcode .でも開けますが、未導入ならメニュー操作で構いません。",
      "ファイル名は大文字小文字を含めて一致させます。PracticeCardView.tsxとpracticeCardView.tsxを別の名前として扱う環境があります。Ctrl+P、Ctrl+F、Ctrl+Shift+F、Ctrl+Sは本文と同じVS Codeの操作です。コードはUTF-8で保存します。LFは改行コードの一種で、エディターのステータスバーから選べます。後でBash用.shを自分で作るならLFで保存します。",
    ],
    blocks: [
      { id: "linux-copy-run", title: "Bash：コピーを実行し、その終了結果をすぐ表示する", value: "copy_recall_practice --itemize-changes\nprintf 'copy exit=%s\\n' \"$?\"" },
      { id: "linux-copy-open", title: "Bash：copy exit=0を確認してから実習先へ移る", value: "cd -- \"$recall_practice\"\npwd\nls -a\ntest -f package.json && test -f package-lock.json && test -f .npmrc\nprintf 'files check exit=%s\\n' \"$?\"" },
    ],
    expected: "copy exit=0、files check exit=0です。pwdが実習先を示し、app、docs、tests、package.json、package-lock.json、.npmrcが存在します。.gitは除外したため、このコピーはまだGitリポジトリーではありません。差分管理を使う場合だけ、最後の確認章の任意手順で初期化します。",
  },
  {
    id: "dependencies",
    title: "Linux上で依存を導入し、変更前の検査を通す",
    paragraphs: [
      "package.jsonのpackageManagerはnpm@12.0.2です。npx --yes npm@12.0.2 ciは、その版のnpmを使ってpackage-lock.jsonどおりに依存を導入します。--yesは指定したnpmパッケージの取得確認に答える指定で、sudoや管理者権限を与える指定ではありません。Nodeに同梱されたnpm全体を入れ替える必要はありません。",
      "npxによるnpmの取得と、未導入の依存の取得にはインターネット接続が必要です。Linux用の依存はLinuxで導入します。npm ciは既存のnode_modulesを入れ直すため、編集中のコードや学習データをこのフォルダーへ置きません。package-lock.jsonと.npmrcは保ちます。",
      "下のコマンドは一行ずつ実行し、その都度終了を確認します。manual:buildはこのコピーの現物をHTMLへ反映し、checkはテスト→型検査→lint→マニュアル検証を行います。buildは本番用に変換できるかの検査です。失敗したら次の行へ進みません。Gitを使う場合だけ、ここで変更前の成功を確認した後、目次の「確認・配布」にある任意の初回記録を行い、この章へ戻ります。",
    ],
    blocks: [{ id: "linux-dependencies", title: "Bash：実習用ルートで、一行ずつ成功を確認する", value: "npx --yes npm@12.0.2 ci\nnpm run manual:build\nnpm run check\nnpm run build" }],
    expected: "各コマンドがエラーなく終了します。終了直後にprintf 'exit=%s\\n' \"$?\"で0を確認できます。変更前のアプリのテストは85件・fail 0です。実習テストを足した後は件数が変わります。Node条件外のEBADENGINEではNodeを選び直し、導入中の権限エラーでは所有者と実習先を確認します。npmやnpxへsudoを付けて回避しません。",
    references: [
      { title: "npm公式：npm ci", url: "https://docs.npmjs.com/cli/v12/commands/npm-ci/" },
      { title: "npm公式：npxとnpm exec", url: "https://docs.npmjs.com/cli/v12/commands/npm-exec/" },
    ],
  },
  {
    id: "terminals",
    title: "ターミナルAで起動し、Bで確認する",
    paragraphs: [
      "ターミナルAは今の実習用ルートでnpm run devを実行し、起動したままにします。テスト用にはターミナルBを新しく開きます。Aで設定した変数やnvmの選択はBへ自動で移りません。BではLinux版Nodeと実習先をもう一度確認します。",
      "例のcdは$HOME/learning-tool/recall-practiceです。実習先を別名にした場合はBのcdも同じ絶対パスに置き換えます。nvmを導入しなかった場合はBの最初の読み込み2行とnvm useを省略し、node --versionとcommand -v nodeで対応するLinux版Nodeを確認します。",
      "自分のパソコンの実習用ブラウザープロファイルでhttp://127.0.0.1:3000を開きます。devは終了待ちのサーバーなのでコマンド待ちに戻らないのが正常です。3000番が利用中なら、利用者と用途を確認し、競合している自分のサーバーをそのターミナルでCtrl+Cで止めます。別ポートに変えるとこのアプリの許可設定と合わなくなります。",
    ],
    blocks: [
      { id: "linux-dev", title: "Bash・ターミナルA：開発サーバーを起動する", value: "npm run dev" },
      { id: "linux-terminal-b", title: "Bash・ターミナルB：Nodeと実習先を確認する（nvmの例）", value: "export NVM_DIR=\"$HOME/.nvm\"\n. \"$NVM_DIR/nvm.sh\"\nnvm use 24.20.0\ncd -- \"$HOME/learning-tool/recall-practice\"\npwd\nnode --version\ncommand -v node\ntest -f package.json\nprintf 'root check exit=%s\\n' \"$?\"" },
      { id: "linux-http", title: "Bash・ターミナルB：サーバーの応答を確認する", value: "curl --silent --show-error --fail --output /dev/null \\\n  --write-out 'HTTP %{http_code}\\n' http://127.0.0.1:3000/" },
    ],
    expected: "Aに起動表示、Bのroot check exit=0とHTTP 200を確認し、ブラウザーにホーム画面が出ます。curlの成功だけでは入力や保存の動作までは分からないため、ブラウザーでも確認します。403はURLと許可設定、Failed to connectはAの起動状態を調べます。",
    references: [{ title: "curl公式：fail、output、write-out", url: "https://curl.se/docs/manpage.html" }],
  },
  {
    id: "browser",
    title: "保存領域を分け、基礎実習へ進む",
    paragraphs: [
      "ブラウザーのIndexedDBはコードのコピー先で分かれません。実習用の新しいプロファイルを用意します。Firefoxではアドレス欄へabout:profilesと入力し、「新しいプロファイルを作成」を選び、recall-practiceなどの名前を付けます。保存場所は既定のままにし、プロジェクトや学習データのフォルダーをプロファイル保存先に指定しません。作成したプロファイルを新しいブラウザーで起動します。",
      "ChromeやEdgeを使う場合も、そのブラウザーのプロフィール追加から実習専用のものを作り、そこでアプリを開きます。学習に使っているプロファイルのタブを閉じ、実習用であることを毎回確認します。ログインや同期を使わずに実習できます。",
      "Linuxでも、FirefoxにshowDirectoryPicker()がない場合は保存先の選択・変更ボタンを表示しません。IndexedDB保存とバックアップJSONは使えます。フォルダー保存も試す場合は必要なAPIのあるデスクトップ版Chrome/Edgeで、新しい空の実習用フォルダーだけを選びます。対応の調べ方は準備5と実装19へ戻ります。",
      "ここまで成功したら「基礎語句」→「基礎実習」へ進みます。基礎実習1でapp/practice/page.tsxを作るまで/practiceは404で正常です。F:\\learning-tool\\recall-practiceというWindowsの例が本文に出たら、自分のLinux実習先に読み替えます。.ts/.tsxのコード、相対import、型検査とテストのコマンドは共通です。全文検索のCtrl+KもLinuxで使えます。",
    ],
    blocks: [{ id: "linux-data-folder", title: "Bash・ターミナルB：フォルダー保存も試す場合だけ空の実習用フォルダーを作る", value: "mkdir -- \"$HOME/learning-tool/recall-practice-data\"" }],
    expected: "実習用ブラウザーでホームが開きます。mkdirは既存フォルダーならエラーで止まり、既存データへ重ねません。別の空フォルダー名を選んだらブラウザーでもその場所を選びます。Firefoxの未対応表示は設定ミスではありません。WSLでWindows側ブラウザーを使う場合、フォルダー選択はWindows側の場所です。このLinux用mkdirと別に、Windowsで空の実習用フォルダーを用意します。",
    references: [{ title: "Mozilla公式：about:profilesと新しいプロファイル", url: "https://support.mozilla.org/en-US/kb/profile-manager-create-remove-switch-firefox-profiles" }],
  },
  {
    id: "finish",
    title: "検査、本番起動、停止と再開もLinuxで行う",
    paragraphs: [
      "各実習の確認コマンドは、Aを動かしたままBで一行ずつ実行します。どのコマンドもプロジェクトのルートで実行します。本文の矢印は実行順を表す説明で、矢印文字をBashへ入力する指示ではありません。",
      "章の区切りではmanual:buildの後にcheckを行います。本番表示を確かめるときはAでCtrl+Cを押してdevを止め、Bの検査が成功した後、Aでbuild、startを一行ずつ実行します。startは直前に作った本番コードを起動するため、編集後はbuildが必要です。同じ3000番でdevとstartを重ねません。",
      "作業を終えるときはAでCtrl+C、エディターでCtrl+Sです。次回はNodeの選択、実習ルートとプロファイルの確認、最後に通った対象検査を行ってから、記録した工程の続きへ戻ります。Linuxのブラウザーでも学習データは自動で別OSへ共有されないため、必要な移動はバックアップの復元確認を通します。",
    ],
    blocks: [
      { id: "linux-target-check", title: "Bash・ターミナルB：変更に合う対象検査の例", value: "node --experimental-strip-types --test tests/model.test.mjs\nnpm run typecheck\nnpx eslint app/recall/library/useSetLibrary.ts" },
      { id: "linux-chapter-check", title: "Bash・ターミナルB：章の区切りの確認", value: "npm run manual:build\nnpm run check" },
      { id: "linux-production", title: "Bash・ターミナルA：devをCtrl+Cで止めてから本番確認", value: "npm run build\nnpm run start" },
    ],
    expected: "対象検査とcheckが成功し、buildの終了後にstartで同じURLの画面を操作できます。停止するとコマンド待ちへ戻ります。配布手順は「確認・配布」の章で共通のreleaseコマンドを使います。",
  },
];
