import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const stage = join(root, "release", `recall-${packageJson.version}-source`);
const manifestPath = join(stage, "RELEASE_MANIFEST.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (process.platform !== "win32") {
  const manifestInfo = await stat(manifestPath);
  if ((manifestInfo.mode & 0o777) !== 0o644) {
    throw new Error("Unexpected RELEASE_MANIFEST.json mode");
  }
}
const expected = new Map(manifest.files.map((entry) => [entry.path, entry]));
const forbiddenSegments = new Set(["node_modules", "dist", ".next", ".vinext", ".wrangler", "recall-data", "release"]);
const seen = new Set();

if (process.platform !== "win32") {
  const rootInfo = await stat(stage);
  if ((rootInfo.mode & 0o777) !== 0o755) {
    throw new Error(`Unexpected release root mode: ${(rootInfo.mode & 0o777).toString(8)}`);
  }
}

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const rel = relative(stage, path).split(sep).join("/");
    if (rel === "RELEASE_MANIFEST.json") continue;
    if (rel.split("/").some((segment) => forbiddenSegments.has(segment))) throw new Error(`Forbidden path: ${rel}`);
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${rel}`);
    const info = await stat(path);
    if (process.platform !== "win32") {
      const actualMode = info.mode & 0o777;
      const expectedMode = entry.isDirectory() ? 0o755 : 0o644;
      if (actualMode !== expectedMode) {
        throw new Error(
          `Unexpected release mode ${actualMode.toString(8)} for ${rel}; expected ${expectedMode.toString(8)}`,
        );
      }
    }
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile()) {
      const expectedEntry = expected.get(rel);
      if (!expectedEntry) throw new Error(`Unmanifested file: ${rel}`);
      const data = await readFile(path);
      const digest = createHash("sha256").update(data).digest("hex");
      if (digest !== expectedEntry.sha256 || data.byteLength !== expectedEntry.bytes) throw new Error(`Manifest mismatch: ${rel}`);
      seen.add(rel);
    }
  }
}
await walk(stage);
for (const rel of expected.keys()) if (!seen.has(rel)) throw new Error(`Manifest file missing: ${rel}`);
const sbom = JSON.parse(await readFile(join(stage, "SBOM.cdx.json"), "utf8"));
if (sbom.bomFormat !== "CycloneDX" || !Array.isArray(sbom.components) || sbom.components.length < 1) throw new Error("Invalid or empty SBOM");
console.log(`Release verified: ${seen.size} manifested files + manifest, ${sbom.components.length} SBOM components.`);
