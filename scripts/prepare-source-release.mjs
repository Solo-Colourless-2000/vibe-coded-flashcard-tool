import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile, chmod } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const releaseRoot = join(root, "release");
const stage = join(releaseRoot, `recall-${packageJson.version}-source`);

for (const script of ["generate-sbom.mjs", "generate-third-party-notices.mjs"]) {
  const result = spawnSync(process.execPath, [join(root, "scripts", script)], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true, mode: 0o755 });

const files = [
  ".gitignore", ".npmrc", "README.md", "RELEASE_NOTES.md", "SECURITY.md",
  "SBOM.cdx.json", "THIRD_PARTY_NOTICES.md", "eslint.config.mjs",
  "next.config.ts", "package-lock.json", "package.json", "proxy.ts", "securityHeaders.mjs",
  "securityHeaders.ts", "start-local.mjs", "tsconfig.json", "vite.config.ts",
];
const directories = [".github", ".openai", "app", "docs", "public", "scripts", "tests"];
const forbiddenSegments = new Set([
  "node_modules", "dist", ".next", ".vinext", ".wrangler", "recall-data", "release",
  "__pycache__",
]);
const forbiddenFileNames = new Set([".ds_store", "thumbs.db", "desktop.ini"]);
const forbiddenFileSuffixes = [".pyc", ".pyo"];

function hasForbiddenReleasePath(relativePath) {
  const segments = relativePath.split("/").map((segment) => segment.toLowerCase());
  const fileName = segments.at(-1) ?? "";
  return (
    segments.some((segment) => forbiddenSegments.has(segment)) ||
    forbiddenFileNames.has(fileName) ||
    forbiddenFileSuffixes.some((suffix) => fileName.endsWith(suffix))
  );
}

function includeReleasePath(source) {
  const rel = relative(root, source).split(sep).join("/");
  return !hasForbiddenReleasePath(rel);
}

for (const name of files) {
  await cp(join(root, name), join(stage, name), { force: true, filter: includeReleasePath });
}
for (const name of directories) {
  await cp(join(root, name), join(stage, name), {
    recursive: true,
    force: true,
    filter: includeReleasePath,
  });
}

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const rel = relative(stage, path).split(sep).join("/");
    if (hasForbiddenReleasePath(rel)) {
      throw new Error(`Forbidden release path: ${rel}`);
    }
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in release: ${rel}`);
    if (entry.isDirectory()) {
      await chmod(path, 0o755).catch(() => {});
      result.push(...await walk(path));
    } else if (entry.isFile()) {
      await chmod(path, 0o644).catch(() => {});
      result.push(path);
    }
  }
  return result;
}

let stagedFiles = await walk(stage);
const manifestRows = [];
for (const path of stagedFiles.sort()) {
  const rel = relative(stage, path).split(sep).join("/");
  const data = await readFile(path);
  manifestRows.push({
    path: rel,
    bytes: data.byteLength,
    sha256: createHash("sha256").update(data).digest("hex"),
  });
}
await writeFile(
  join(stage, "RELEASE_MANIFEST.json"),
  JSON.stringify({
    schemaVersion: 1,
    app: packageJson.name,
    version: packageJson.version,
    files: manifestRows,
  }, null, 2) + "\n",
  "utf8",
);
await chmod(join(stage, "RELEASE_MANIFEST.json"), 0o644).catch(() => {});

console.log(`Prepared ${basename(stage)} with ${manifestRows.length + 1} files.`);
console.log(stage);
