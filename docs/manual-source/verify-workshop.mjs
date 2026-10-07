import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, basename } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import ts from "typescript";
import { ESLint } from "eslint";
import { replayWorkshop } from "./beginner-workshop.mjs";
import { replaySearchWorkshop, replaySearchWorkshopFiles } from "./search-workshop.mjs";

const keyOf = (file) => resolve(file).replaceAll("\\", "/");

async function verifySnapshots(root, snapshots, label, testFile) {
  const configPath = join(root, "tsconfig.json");
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  if (parsed.errors.length) throw new Error(ts.flattenDiagnosticMessageText(parsed.errors[0].messageText, "\n"));
  const options = { ...parsed.options, incremental: false, noEmit: true, plugins: undefined };
  let oldProgram;
  for (const snapshot of snapshots) {
    const virtual = new Map([...snapshot.files].filter(([file]) => /\.tsx?$/u.test(file)).map(([file, content]) => [keyOf(join(root, file)), content]));
    const host = ts.createCompilerHost(options);
    const fileExists = host.fileExists.bind(host);
    const read = host.readFile.bind(host);
    const getSource = host.getSourceFile.bind(host);
    const dirExists = host.directoryExists.bind(host);
    host.fileExists = (file) => virtual.has(keyOf(file)) || fileExists(file);
    host.readFile = (file) => virtual.get(keyOf(file)) ?? read(file);
    host.directoryExists = (dir) => [...virtual.keys()].some((file) => file.startsWith(keyOf(dir) + "/")) || dirExists(dir);
    host.getCurrentDirectory = () => root;
    host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) => virtual.has(keyOf(file))
      ? ts.createSourceFile(file, virtual.get(keyOf(file)), languageVersion, true)
      : getSource(file, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram({ rootNames: [...virtual.keys()], options, host, oldProgram });
    const errors = ts.getPreEmitDiagnostics(program);
    if (errors.length) {
      const diagnostics = ts.formatDiagnosticsWithColorAndContext(errors.slice(0, 8), {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n",
      });
      throw new Error(`${label} step ${snapshot.step} does not typecheck:\n${diagnostics}`);
    }
    oldProgram = program;
  }
  const finalFiles = snapshots.at(-1).files;
  const eslint = new ESLint({ cwd: root });
  for (const [file, content] of finalFiles) {
    const results = await eslint.lintText(content, { filePath: join(root, file) });
    const problems = results.flatMap((result) => result.messages);
    if (problems.length) throw new Error(`${label} final lint error: ${file}: ${problems.map((message) => message.message).join("; ")}`);
  }
  const temporary = await mkdtemp(join(tmpdir(), "recall-manual-workshop-"));
  try {
    for (const [file, content] of finalFiles) {
      const target = join(temporary, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, "utf8");
    }
    for (const file of ["app/model.ts", "app/securityLimits.ts"]) {
      await writeFile(join(temporary, file), await readFile(join(root, file)));
    }
    await writeFile(join(temporary, "package.json"), '{"type":"module"}\n');
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "--test", testFile], {
      cwd: temporary, encoding: "utf8", timeout: 30_000,
    });
    if (result.status !== 0) throw new Error(`${label} tests failed:\n${result.stdout}\n${result.stderr}`);
  } finally {
    if (resolve(dirname(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith("recall-manual-workshop-")) {
      throw new Error("Refusing cleanup outside the temporary workshop directory");
    }
    await rm(temporary, { recursive: true, force: true });
  }
  return { steps: snapshots.length, files: finalFiles.size, gradingTests: 1 };
}

export async function verifyWorkshop(root) {
  return verifySnapshots(root, replayWorkshop(), "Basic workshop", "tests/practice-answer.test.mjs");
}

export async function verifySearchWorkshop(root) {
  const snapshots = await replaySearchWorkshop(root);
  const expected = snapshots.at(-1).files;
  // Verify each partially completed copy, including the final copy, can run
  // the manual checks without applying a state declaration or UI twice.
  for (const snapshot of snapshots) {
    const replayed = replaySearchWorkshopFiles(snapshot.files);
    assert.deepEqual(replayed.at(-1).files, expected, `Search workshop recheck after step ${snapshot.step}`);
  }
  const edited = new Map(expected);
  const hook = "app/recall/library/useSetLibrary.ts";
  edited.set(hook, edited.get(hook).replace("[sets, search, titleOnly]", "[sets, search]"));
  assert.throws(() => replaySearchWorkshopFiles(edited), /differs from the documented before\/after/u,
    "Rechecking must still reject an incomplete search dependency edit");
  const result = await verifySnapshots(root, snapshots, "Search workshop", "tests/library-search-practice.test.mjs");
  return { ...result, recheckStates: snapshots.length, rejectedInvalidStates: 1 };
}
