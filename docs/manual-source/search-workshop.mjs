import { readFile } from "node:fs/promises";
import { join } from "node:path";

const helper = "app/recall/library/matchesSetSearch.ts";
const hook = "app/recall/library/useSetLibrary.ts";
const view = "app/recall/library/LibraryView.tsx";
const testFile = "tests/library-search-practice.test.mjs";
const replace = (file, before, after) => ({ file, kind: "replace", before, after });
const create = (file, after) => ({ file, kind: "create", after });

export const searchWorkshop = [
  {
    title: "検索条件を純粋関数へ作る",
    changes: [create(helper, 'import type { StudySet } from "../../model.ts";\n\nexport function matchesSetSearch(set: StudySet, search: string, titleOnly: boolean): boolean {\n  const normalize = (value: string) => value.normalize("NFC").toLocaleLowerCase("ja");\n  const query = normalize(search.trim());\n  if (!query) return true;\n  if (normalize(set.title).includes(query)) return true;\n  if (titleOnly) return false;\n  return normalize(set.description).includes(query) || set.cards.some(\n    (card) => normalize(card.term).includes(query) || normalize(card.definition).includes(query),\n  );\n}\n')],
    how: "完成プロジェクトの実習用コピーを使います。libraryへmatchesSetSearch.tsを新規作成します。既存の同名ファイルがあれば上書きせず、別の実習コピーで始めます。まず型のimport、次に関数の枠、その中を入力します。",
    why: "検索だけを外へ出すとブラウザーなしで検査できます。titleOnly=trueではタイトル一致を判定した後、説明やカードへ進まずfalseを返します。空の検索はすべて表示する契約です。NFCと小文字化は検索用で、元のカードや採点を変更しません。",
    check: "npm run typecheckを実行します。まだ一覧の動作は変わりません。",
    trouble: "型を読み込むimport typeは実行時に消えます。DOMやuseStateをこの関数へ入れません。",
  },
  {
    title: "表示より先に検索の期待結果を固定する",
    changes: [create(testFile, 'import test from "node:test";\nimport assert from "node:assert/strict";\nimport { matchesSetSearch } from "../app/recall/library/matchesSetSearch.ts";\n\ntest("タイトル限定検索はカード本文を対象にしない", () => {\n  const set = { title: "通信の基礎", description: "安全性", cards: [{ term: "TLS", definition: "暗号化通信" }] };\n  assert.equal(matchesSetSearch(set, "tls", false), true);\n  assert.equal(matchesSetSearch(set, "tls", true), false);\n  assert.equal(matchesSetSearch(set, "通信", true), true);\n  assert.equal(matchesSetSearch(set, "安全", false), true);\n  assert.equal(matchesSetSearch(set, "安全", true), false);\n  assert.equal(matchesSetSearch(set, "   ", true), true);\n});\n')],
    how: "testsへ移り、library-search-practice.test.mjsを作ります。JavaScriptのテストで必要な項目だけを使う入力例を用意します。",
    why: "表示を変える前に、オン・オフ・タイトル一致・本文一致・空文字の仕様を固定します。このNodeテストはTypeScript型の検査とは別です。実アプリの入力はStudySet型で渡され、テストは関数が読む項目の動作を直接調べます。",
    check: "node --experimental-strip-types --test tests/library-search-practice.test.mjsを実行します。pass 1、fail 0を確認します。",
    trouble: "TypeScriptで入力fixtureを作る場合はStudySetのIDや時刻なども必要です。この.mjsのテスト例と型付きfixtureの条件を混同しません。",
  },
  {
    title: "フックへ戻り、状態と公開APIを先に広げる",
    changes: [
      replace(hook, '  const [search, setSearch] = useState("");', '  const [search, setSearch] = useState("");\n  const [titleOnly, setTitleOnly] = useState(false);'),
      replace(hook, '    search,\n    setSearch,', '    search,\n    setSearch,\n    titleOnly,\n    setTitleOnly,'),
    ],
    how: "useSetLibrary.tsへ戻ります。まずsearch宣言の直後へstateを1行追加し、同じファイルのreturnへ2項目を追加します。二つの位置を別々に編集します。",
    why: "新しい設定の既定値はfalseなので、現在の検索仕様を保ちます。SetLibraryはReturnTypeなので新しい戻り値が表示側の型にも反映されます。",
    check: "npm run typecheckを実行します。一覧はまだ従来どおりです。",
    trouble: "returnへ追加せずフックのローカル変数だけ作ると、表示側でlibrary.titleOnlyを読めません。",
  },
  {
    title: "表示へ戻り、切り替えるUIだけを加える",
    changes: [replace(view, '        <span>{filteredSets.length} 件</span>', '        <label>\n          <input\n            type="checkbox"\n            checked={library.titleOnly}\n            onChange={(event) => library.setTitleOnly(event.target.checked)}\n          />\n          セット名だけ検索\n        </label>\n        <span>{filteredSets.length} 件</span>')],
    how: "LibraryView.tsxの件数表示を検索し、その直前へラベル付きチェックボックスを追加します。filter処理はこの画面へ書きません。",
    why: "表示側は値と変更関数だけを使います。チェック値はbooleanなのでevent.target.checkedを渡します。この工程はUIの接続だけで、検索の条件は次の工程で変えます。",
    check: "typecheck後、一覧でチェックが切り替わることを確認します。結果がまだ変わらないのは予定した中間状態です。",
    trouble: "valueを使うとチェック状態でなく文字列を読みます。件数のspanを削除せず残します。",
  },
  {
    title: "処理へ戻り、検索関数を呼び出す差分だけを作る",
    changes: [
      replace(hook, 'import { useState, useMemo } from "react";', 'import { useState, useMemo } from "react";\nimport { matchesSetSearch } from "./matchesSetSearch";'),
      replace(hook, '  const filteredSets = useMemo(() => {\n    const normalizeForSearch = (value: string) =>\n      value.normalize("NFC").toLocaleLowerCase("ja");\n    const query = normalizeForSearch(search.trim());\n    if (!query) return sets;\n    return sets.filter(\n      (set) =>\n        normalizeForSearch(set.title).includes(query) ||\n        normalizeForSearch(set.description).includes(query) ||\n        set.cards.some(\n          (card) =>\n            normalizeForSearch(card.term).includes(query) ||\n            normalizeForSearch(card.definition).includes(query),\n        ),\n    );\n  }, [sets, search]);', '  const filteredSets = useMemo(\n    () => sets.filter((set) => matchesSetSearch(set, search, titleOnly)),\n    [sets, search, titleOnly],\n  );'),
    ],
    how: "useSetLibrary.tsへ戻ります。importへ1行を追加し、filteredSetsのuseMemoだけを置き換えます。状態や削除処理には触れません。この二つの編集を終えてからlintします。",
    why: "先に作った純粋関数をフックへ接続します。titleOnlyが変わったときも再計算するよう依存配列へ加えます。元のsetsは保存用の全データ、filteredSetsは表示用の結果です。",
    check: "node --experimental-strip-types --test tests/library-search-practice.test.mjs、npm run typecheck、npx eslint app/recall/library tests/library-search-practice.test.mjsを実行します。カード本文だけにあるtlsが、オンでは消え、オフで戻ることを確認します。",
    trouble: "依存配列へtitleOnlyを加え忘れるとチェック表示だけ変わります。filterの結果をsetSetsへ入れると、検索が削除操作になってしまいます。",
  },
];

export async function replaySearchWorkshop(root) {
  const files = new Map();
  for (const file of [hook, view]) files.set(file, (await readFile(join(root, file), "utf8")).replace(/\r\n?/gu, "\n"));
  const snapshots = [];
  for (const [index, step] of searchWorkshop.entries()) {
    for (const change of step.changes) {
      const current = files.get(change.file) ?? "";
      if (change.kind === "create") {
        if (files.has(change.file)) throw new Error(`Search workshop file already exists: ${change.file}`);
        files.set(change.file, change.after);
      } else {
        if (!change.before || current.split(change.before).length !== 2) throw new Error(`Search workshop step ${index + 1}: non-unique replacement: ${change.file}`);
        files.set(change.file, current.replace(change.before, () => change.after));
      }
    }
    snapshots.push({ step: index + 1, files: new Map(files) });
  }
  return snapshots;
}
