// This is documentation data. Changes are replayed in memory by manual:verify.
const create = (file, after) => ({ file, kind: "create", after });
const replace = (file, before, after) => ({ file, kind: "replace", before, after });
const route = "app/practice/page.tsx";
const types = "app/practice/types.ts";
const hook = "app/practice/usePracticeCard.ts";
const view = "app/practice/PracticeCardView.tsx";
const rule = "app/practice/checkAnswer.ts";

export const workshopFiles = [route, types, hook, view, rule, "tests/practice-answer.test.mjs"];
export const workshop = [
  {
    title: "入口だけを作り、画面に一行出す",
    change: create(route, 'export default function PracticePage() {\n  return <main><h1>カード開発の実習</h1></main>;\n}\n'),
    how: "実習用コピーのappで、新しいpracticeフォルダーを作ります。その中にpage.tsxを作り、3行だけ入力してCtrl+Sで保存します。既存のapp/page.tsxは編集しません。",
    why: "URLの/practiceに対応するpage.tsxを作ります。export defaultは、このファイルの代表となる部品を外へ渡す書き方です。PracticePageの先頭が大文字なのはReactの画面部品だからです。returnの後のタグはJSXという画面の記述です。",
    check: "ターミナルAでnpm run devを実行し、http://127.0.0.1:3000/practiceを開きます。「カード開発の実習」が出れば成功です。npm run devは動き続けるので、このターミナルでは次のコマンドを入力しません。",
    troubleshoot: "404ならapp/practice/page.tsxの名前を確認します。pagesやpage.tsではありません。接続できなければターミナルのエラーを読み、3000番を使っている別の自分のサーバーをCtrl+Cで止めます。",
  },
  {
    title: "別ファイルにカードの形を決める",
    change: create(types, 'export type PracticeCard = {\n  question: string;\n  answer: string;\n};\n'),
    how: "page.tsxのタブを残したまま、同じpracticeフォルダーにtypes.tsを作ります。上の4行を入力して保存します。",
    why: "typeは、どんなデータを扱うかをTypeScriptへ伝える設計図です。questionとanswerは文字列を表すstringで、まだカードそのものは作っていません。この型は後でフックと画面の両方から参照します。",
    check: "ターミナルBでnpm run typecheckを実行します。終了コード0でコマンド待ちに戻れば合格です。画面は変わりません。型だけの追加では表示が変わらないのが正常です。",
    troubleshoot: "型を画面に出そうとして{PracticeCard}と書かないでください。型は実行時の値ではありません。",
  },
  {
    title: "表示部品を作る前に、受け取るデータを宣言する",
    change: create(view, 'import type { PracticeCard } from "./types";\n\ntype Props = { card: PracticeCard };\n\nexport function PracticeCardView({ card }: Props) {\n  return <p>{card.question}</p>;\n}\n'),
    how: "PracticeCardView.tsxを新規作成します。import type、Props、関数の順に入力します。./typesは今いるpracticeフォルダーのtypes.tsです。",
    why: "Propsは親の画面から受け取る値の形です。{ card }は引数の中からcardを取り出す分割代入です。JSXの{card.question}は、タグの中へJavaScriptの値を表示します。まだ部品を入口で使っていないため、ブラウザーは変わりません。",
    check: "npm run typecheckで型のつながりを確認します。PracticeCardViewにcardを渡し忘れるとエラーになる仕組みをここで作っています。",
    troubleshoot: "importは関数の中へ置かず、ファイルの先頭に置きます。拡張子はtsx、部品名のVは大文字です。",
  },
  {
    title: "入口へ戻り、データを表示部品へ渡す",
    change: replace(route, 'export default function PracticePage() {\n  return <main><h1>カード開発の実習</h1></main>;\n}', 'import { PracticeCardView } from "./PracticeCardView";\n\nexport default function PracticePage() {\n  const card = { question: "暗号化通信の略称は？", answer: "TLS" };\n  return <main><h1>カード開発の実習</h1><PracticeCardView card={card} /></main>;\n}'),
    how: "page.tsxへ戻ります。既存の3行をこの6行へ置き換えます。末尾へもう一つPracticePageを追加する操作ではありません。",
    why: "データを用意する側と表示する側を初めて接続します。card={card}の左側はPropsの名前、右側はこの関数内で作った変数です。<PracticeCardView />で関数を画面部品として使います。",
    check: "見出しの下に「暗号化通信の略称は？」が出ることを確認します。npm run typecheckも実行します。",
    troubleshoot: "Cannot find moduleなら相対パスとファイル名を照合します。PracticeCardViewはnamed exportなので、importの{}を省略できません。",
  },
  {
    title: "操作の状態を、画面から独立したフックへ作る",
    change: create(hook, 'import { useState } from "react";\nimport type { PracticeCard } from "./types";\n\nexport function usePracticeCard() {\n  const card: PracticeCard = { question: "暗号化通信の略称は？", answer: "TLS" };\n  const [revealed, setRevealed] = useState(false);\n  return { card, revealed, reveal: () => setRevealed(true) };\n}\n'),
    how: "usePracticeCard.tsを作ります。先頭のimportを入力した後、関数の枠、その中のcard、useState、returnを順に入力します。",
    why: "useから始まる関数がカスタムフックです。useState(false)は最初は答えを隠す状態を作ります。setRevealed(true)を呼ぶとReactが画面を描き直します。フックはタグを返さず、値と操作だけを返します。",
    check: "npm run typecheckを実行します。まだフックを呼んでいないため、画面には答えが出ません。",
    troubleshoot: "let revealed = falseのような普通の変数へ置き換えると画面更新が起きません。フックはクリック処理の中ではなく、画面関数の先頭で呼びます。",
  },
  {
    title: "表示部品へ戻り、答えと操作を受け取れるようにする",
    change: replace(view, 'type Props = { card: PracticeCard };', 'type Props = {\n  card: PracticeCard;\n  revealed?: boolean;\n  onReveal?: () => void;\n};'),
    how: "PracticeCardView.tsxのPropsだけを置き換えます。importとreturnはそのままです。",
    why: "?は一時的に省略可能という意味です。まだ入口はcardしか渡していないので、移行の途中でも型検査を通すために使います。次の接続後に必須へ戻します。() => voidは、引数も戻り値も必要としない操作の型です。",
    check: "npm run typecheckが通ることを確認します。表示はまだ変わりません。",
    troubleshoot: "省略可能にしただけではボタンも答えも出ません。次の工程でreturnを書き換えます。",
  },
  {
    title: "ボタンを表示し、親から渡された操作を呼ぶ",
    change: replace(view, 'export function PracticeCardView({ card }: Props) {\n  return <p>{card.question}</p>;\n}', 'export function PracticeCardView({ card, revealed, onReveal }: Props) {\n  return (\n    <section>\n      <p>{card.question}</p>\n      <button type="button" onClick={onReveal}>答えを見る</button>\n      {revealed && <p>{card.answer}</p>}\n    </section>\n  );\n}'),
    how: "同じファイルの関数だけを置き換えます。Propsの宣言は重複して入力しません。",
    why: "onClick={onReveal}は関数を渡します。onClick={onReveal()}は描画時に実行してしまうので違います。revealed && ...はtrueのときだけ右側のタグを表示する条件描画です。",
    check: "ボタンが出ます。この段階では入口がonRevealを渡していないため、押しても答えが出ません。これは接続前として予定した状態で、次の工程で完成します。",
    troubleshoot: "buttonはフォーム外でもtype=buttonを明示します。後でフォームに入れても勝手に送信されることを防ぎます。",
  },
  {
    title: "入口へ戻り、フックと表示部品を接続する",
    change: replace(route, 'import { PracticeCardView } from "./PracticeCardView";\n\nexport default function PracticePage() {\n  const card = { question: "暗号化通信の略称は？", answer: "TLS" };\n  return <main><h1>カード開発の実習</h1><PracticeCardView card={card} /></main>;\n}', '"use client";\n\nimport { PracticeCardView } from "./PracticeCardView";\nimport { usePracticeCard } from "./usePracticeCard";\n\nexport default function PracticePage() {\n  const practice = usePracticeCard();\n  return (\n    <main>\n      <h1>カード開発の実習</h1>\n      <PracticeCardView card={practice.card} revealed={practice.revealed} onReveal={practice.reveal} />\n    </main>\n  );\n}'),
    how: "page.tsxの既存部分を置き換えます。use clientはimportより前、ファイルの最初の文として入力します。",
    why: "状態とクリックをブラウザーで使う入口にuse clientが必要です。practiceはフックの戻り値で、画面へ必要な3項目だけを渡します。本番のRecallAppも、このようにフックと画面の組み立てに集中します。",
    check: "ブラウザーで答えを見るを押すとTLSが表示されます。再読み込みすると隠れます。まだ永続保存を作っていないので、このリセットは正常です。",
    troubleshoot: "React HookやuseStateのサーバー側エラーなら、use clientの綴り、引用符、先頭位置を確認します。",
  },
  {
    title: "接続後に、仮の省略可能なPropsを必須へ戻す",
    change: replace(view, '  revealed?: boolean;\n  onReveal?: () => void;', '  revealed: boolean;\n  onReveal: () => void;'),
    how: "PracticeCardView.tsxの2か所の?だけを取り除きます。",
    why: "移行用の仮契約を残さない工程です。今後この部品を使う人が値や操作を渡し忘れたら、TypeScriptが知らせてくれます。",
    check: "npm run typecheckを実行し、ボタンももう一度確認します。",
    troubleshoot: "このタイミングで必須Props不足が出たら、直前のpage.tsxの接続を確認します。安易に?を戻して隠さないようにします。",
  },
  {
    title: "採点だけの純粋な関数を作る",
    change: create(rule, 'export function checkAnswer(value: string, expected: string): boolean {\n  return value === expected;\n}\n'),
    how: "checkAnswer.tsを作ります。画面もuseStateもimportせず、2つの文字列だけを受け取る関数を書きます。",
    why: "純粋な関数は同じ入力なら同じ結果を返し、保存や画面を変更しません。===は大文字小文字を含めた比較です。まず最小の厳密比較を実装し、後で本番の採点関数へ接続します。",
    check: "npm run typecheckが通れば、この工程は完了です。画面はまだ変化しません。",
    troubleshoot: "value.toLowerCase()をここで加えるとTLSとtlsが同じになり、アプリの採点仕様と異なります。",
  },
  {
    title: "フックに入力値と採点結果を追加する",
    change: replace(hook, '  const [revealed, setRevealed] = useState(false);\n  return { card, revealed, reveal: () => setRevealed(true) };', '  const [revealed, setRevealed] = useState(false);\n  const [answer, setAnswer] = useState("");\n  const [result, setResult] = useState<string | null>(null);\n  return { card, revealed, answer, result, setAnswer, reveal: () => setRevealed(true) };'),
    how: "usePracticeCard.tsへ戻り、revealedの宣言からreturnまでの2行を4行へ置き換えます。",
    why: "answerは入力欄の現在値、resultはまだ採点していないときnullです。セットそのもの、入力中の文字、採点結果を別の状態にすることで、後から操作を増やしやすくなります。",
    check: "npm run typecheckを実行します。新しい戻り値がまだ画面で使われていなくても問題ありません。",
    troubleshoot: "useState(null)だけだと型がnullに限定されます。後で文字列も入れるため<string | null>を明示します。",
  },
  {
    title: "採点関数を読み込み、フックに一つの操作を追加する",
    change: replace(hook, 'import type { PracticeCard } from "./types";', 'import type { PracticeCard } from "./types";\nimport { checkAnswer } from "./checkAnswer";'),
    how: "usePracticeCard.tsのimport type行を探し、そのすぐ下へimportを1行加えます。",
    why: "採点の実装場所と呼び出し場所を分けます。画面へ比較ロジックを直接書かないための小さな準備です。",
    check: "まだcheckAnswerを使っていないため、エディターが未使用を薄い色で示す場合があります。次の工程まで続けてからlintします。型検査は通ります。",
    troubleshoot: "この工程の未使用表示は次の接続でなくなります。エラーを消すために関数ごと画面ファイルへ移動しません。",
  },
  {
    title: "採点操作を書き、フックの公開APIへ加える",
    change: replace(hook, '  return { card, revealed, answer, result, setAnswer, reveal: () => setRevealed(true) };', '  function submit() {\n    setResult(checkAnswer(answer, card.answer) ? "正解" : "不正解");\n  }\n  return { card, revealed, answer, result, setAnswer, submit, reveal: () => setRevealed(true) };'),
    how: "同じフックのreturn行を置き換えます。submitはusePracticeCard関数の内側に追加します。",
    why: "submitは今の入力値を読んで結果を更新します。条件 ? 正しい場合 : 違う場合が三項演算子です。returnにsubmitを加えることで、親の入口から呼び出せるようになります。",
    check: "npm run typecheckを実行します。画面のボタンはまだ採点には接続していません。",
    troubleshoot: "関数をusePracticeCardの閉じ括弧の外へ置くとanswerやsetResultが見えません。閉じ括弧の対応を確認します。",
  },
  {
    title: "表示側の契約を、移行中でも壊れない順序で広げる",
    change: replace(view, '  onReveal: () => void;', '  onReveal: () => void;\n  answer?: string;\n  result?: string | null;\n  onAnswerChange?: (value: string) => void;\n  onSubmit?: () => void;'),
    how: "PracticeCardView.tsxへ戻り、PropsのonReveal行の下へ4項目を追加します。",
    why: "値の受け渡しと、操作の受け渡しを区別します。onAnswerChangeは入力文字列を引数として受け取る操作です。入口へ接続する前なので、新項目だけ一時的に省略可能にします。",
    check: "npm run typecheckでPropsを確認します。既存の答えを見るボタンは引き続き使えます。",
    troubleshoot: "onAnswerChangeの引数はDOMイベントではなく文字列です。表示側でevent.target.valueを取り出してから渡します。",
  },
  {
    title: "入力欄と送信フォームを、小さな差分で加える",
    change: replace(view, 'export function PracticeCardView({ card, revealed, onReveal }: Props) {', 'export function PracticeCardView({ card, revealed, onReveal, answer = "", result, onAnswerChange, onSubmit }: Props) {'),
    how: "表示関数の引数行だけを置き換えます。answer = \"\"は、まだ親が入力値を渡さない移行中も空文字を使うための既定値です。",
    why: "Propsで宣言した値を関数の中で使えるようにします。型を増やしただけでは変数は生まれません。",
    check: "この工程と次の工程を続けて入力してから、npm run typecheckを実行します。",
    troubleshoot: "同名の関数を新しく追加せず、既存の引数行を編集します。",
  },
  {
    title: "JSXへ戻って、入力と採点のイベントをつなぐ",
    change: replace(view, '      {revealed && <p>{card.answer}</p>}', '      {revealed && <p>{card.answer}</p>}\n      <form onSubmit={(event) => { event.preventDefault(); onSubmit?.(); }}>\n        <label htmlFor="practice-answer">解答</label>\n        <input id="practice-answer" value={answer} onChange={(event) => onAnswerChange?.(event.target.value)} />\n        <button type="submit">採点する</button>\n      </form>\n      {result && <p role="status">{result}</p>}'),
    how: "revealedの条件描画行を探し、その直後へフォームと結果を追加します。onSubmit?.()は操作が渡されていれば呼ぶ書き方です。",
    why: "preventDefaultはブラウザー既定のフォーム送信による再読み込みを止めます。valueとonChangeで入力値をReactの状態へつなぐ方式を制御された入力と呼びます。labelとinputのidを一致させると、ラベルを押して入力欄へ移れます。",
    check: "フォームが表示されます。この段階では入口に新しいPropsを渡していないため、入力はまだ更新されません。次の工程で接続します。",
    troubleshoot: "入力できない状態はvalueを指定してonChangeが状態へ未接続だからです。valueを削ってごまかさず、次の接続を行います。",
  },
  {
    title: "入口へ戻り、採点までの縦の流れを完成させる",
    change: replace(route, '      <PracticeCardView card={practice.card} revealed={practice.revealed} onReveal={practice.reveal} />', '      <PracticeCardView\n        card={practice.card} revealed={practice.revealed} onReveal={practice.reveal}\n        answer={practice.answer} result={practice.result}\n        onAnswerChange={practice.setAnswer} onSubmit={practice.submit}\n      />'),
    how: "page.tsxのPracticeCardViewの一行を5行に置き換えます。",
    why: "入力 → 表示のイベント → フックのsetAnswer → 採点操作 → 純粋関数 → 結果表示の経路がつながります。この小さな機能一式を縦に通して確認するのが、実際の開発で繰り返す単位です。",
    check: "TLSで正解、tlsで不正解になることを確認します。入力後にEnterでも採点でき、ページ全体が再読み込みされないことを確認します。",
    troubleshoot: "表示される結果が古い場合は、submitを入口から渡したか、inputにpractice.answerを渡したかを確認します。",
  },
  {
    title: "仮の契約を片付ける",
    change: replace(view, '  answer?: string;\n  result?: string | null;\n  onAnswerChange?: (value: string) => void;\n  onSubmit?: () => void;', '  answer: string;\n  result: string | null;\n  onAnswerChange: (value: string) => void;\n  onSubmit: () => void;'),
    how: "Propsの4項目の?を取り除きます。",
    why: "接続を終えた時点で必須契約へ戻します。移行のための一時的な弱い型を、そのまま完成仕様にしない工程です。",
    check: "npm run typecheckを実行します。",
    troubleshoot: "不足を指摘された項目は入口で渡します。",
  },
  {
    title: "表示側も必須契約に合わせる",
    change: replace(view, 'onSubmit?.();', 'onSubmit();'),
    how: "フォームのonSubmit?.()をonSubmit()に変更します。",
    why: "操作が必ず渡される契約になったので、存在するかどうかの検査は不要です。",
    check: "この工程と次の工程の後にlintします。",
    troubleshoot: "?.は小数点ではなくオプショナルチェーンです。必須化の後だけ削除します。",
  },
  {
    title: "入力イベントの仮チェックも取り除く",
    change: replace(view, 'onAnswerChange?.(event.target.value)', 'onAnswerChange(event.target.value)'),
    how: "inputのonChangeにある?.を取り除きます。",
    why: "フックと表示の契約が完成しました。小さな移行を最後まで片付けることで、後の読み手が不要な場合分けを理解する負担を減らせます。",
    check: "npm run typecheckとnpx eslint app/practiceを実行します。TLS/tlsの採点も再確認します。",
    troubleshoot: "npxがインストール許可を尋ねる場合は入力を進めず、プロジェクトのnpm ciが終わっているかを確認します。このプロジェクトに入っているeslintを使います。",
  },
  {
    title: "本番の採点関数へ一か所だけ接続を替える",
    change: replace(rule, 'export function checkAnswer(value: string, expected: string): boolean {\n  return value === expected;\n}', 'import { matchesStudyAnswer } from "../model.ts";\n\nexport function checkAnswer(value: string, expected: string): boolean {\n  return matchesStudyAnswer(value, expected, { allowParentheticalOmission: true });\n}'),
    how: "checkAnswer.tsへ戻り、importを追加してreturnだけを変更します。フック、表示、入口は変更しません。",
    why: "採点を独立させた効果を確かめます。実習だけの厳密比較から、改行と行末空白、半角カッコ省略を扱う本番モデルへ接続します。設定は実習ではtrueを固定し、本番ではStudyReadyViewから選んだ値を渡します。",
    check: "TLSの後ろに半角空白を入れた解答でも正解になること、tlsは引き続き不正解になることを確認します。npm run typecheckとnpx eslint app/practiceを実行します。",
    troubleshoot: "先頭空白や大文字小文字まで同一視する関数へ変えないでください。省略設定のtrueは実習の既定値で、本番の設定を上書きする指示ではありません。",
  },
  {
    title: "採点だけを、画面を開かずに検査する",
    change: create("tests/practice-answer.test.mjs", 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { checkAnswer } from "../app/practice/checkAnswer.ts";\n\ntest("実習の採点は本番ルールに従う", () => {\n  assert.equal(checkAnswer("TLS", "TLS"), true);\n  assert.equal(checkAnswer("tls", "TLS"), false);\n  assert.equal(checkAnswer("TLS   ", "TLS"), true);\n  assert.equal(checkAnswer("TLS", "TLS (Transport Layer Security)"), true);\n});\n'),
    how: "testsフォルダーへ移動し、practice-answer.test.mjsを作ります。まずimportを3行、その下に一つのtestを入力します。これは画面ファイルではありません。",
    why: "assert.equalは、左の実際の結果と右の期待する結果が同じかを確かめます。trueは正解、falseは不正解です。本番モデルへの接続後に行末空白とカッコ省略を固定し、後で誤って大文字小文字を無視しないようにします。",
    check: "ターミナルBでnode --experimental-strip-types --test tests/practice-answer.test.mjsを実行します。pass 1、fail 0なら成功です。その後npm run typecheckとnpx eslint app/practice tests/practice-answer.test.mjsを実行します。",
    troubleshoot: "Cannot find moduleならcheckAnswer.tsのimportが../model.tsであることを確認します。ブラウザー向けの拡張子省略と、Nodeが直接読むTSの指定は同じ条件とは限りません。",
  },
];

export function replayWorkshop() {
  const files = new Map();
  const snapshots = [];
  for (const [index, step] of workshop.entries()) {
    const { file, kind, after, before } = step.change;
    const current = files.get(file) ?? "";
    if (kind === "create") {
      if (files.has(file)) throw new Error(`Workshop step ${index + 1}: file already exists: ${file}`);
      files.set(file, after);
    } else if (kind === "append") {
      if (!files.has(file)) throw new Error(`Workshop step ${index + 1}: missing file: ${file}`);
      files.set(file, current + after);
    } else if (kind === "replace") {
      if (!before || current.split(before).length !== 2) throw new Error(`Workshop step ${index + 1}: replacement anchor is not unique: ${file}`);
      files.set(file, current.replace(before, () => after));
    } else throw new Error(`Unknown workshop change: ${kind}`);
    snapshots.push({ step: index + 1, files: new Map(files) });
  }
  return snapshots;
}
