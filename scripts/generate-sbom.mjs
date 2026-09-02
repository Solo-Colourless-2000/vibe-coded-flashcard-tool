import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const lockText = await readFile(new URL("../package-lock.json", import.meta.url), "utf8");
const lock = JSON.parse(lockText);
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);

function packageNameFromPath(packagePath) {
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  return index >= 0 ? packagePath.slice(index + marker.length) : packagePath;
}

function npmPurl(name, version) {
  const encodedName = name.startsWith("@")
    ? name.split("/").map(encodeURIComponent).join("/")
    : encodeURIComponent(name);
  return `pkg:npm/${encodedName}@${encodeURIComponent(version)}`;
}

function sriHashes(integrity) {
  if (typeof integrity !== "string") return undefined;
  const hashes = [];
  for (const token of integrity.split(/\s+/u)) {
    const match = /^(sha256|sha384|sha512)-(.+)$/u.exec(token);
    if (!match) continue;
    try {
      hashes.push({
        alg: match[1].toUpperCase().replace("SHA", "SHA-"),
        content: Buffer.from(match[2], "base64").toString("hex"),
      });
    } catch {
      // Ignore malformed optional integrity tokens; package-lock remains the source of truth.
    }
  }
  return hashes.length ? hashes : undefined;
}

const directDependencies = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
]);

const components = [];
for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
  if (!packagePath || !entry?.version || !packagePath.includes("node_modules/")) continue;
  const name = packageNameFromPath(packagePath);
  const component = {
    type: "library",
    "bom-ref": `${name}@${entry.version}:${packagePath}`,
    name,
    version: entry.version,
    purl: npmPurl(name, entry.version),
    scope: directDependencies.has(name) ? "required" : "optional",
    licenses: entry.license ? [{ license: { id: entry.license } }] : undefined,
    hashes: sriHashes(entry.integrity),
    properties: [
      { name: "npm:package-lock:path", value: packagePath },
      ...(entry.resolved ? [{ name: "npm:resolved", value: entry.resolved }] : []),
    ],
  };
  components.push(component);
}
components.sort((a, b) => a["bom-ref"].localeCompare(b["bom-ref"], "en"));

const digest = createHash("sha256").update(lockText).digest("hex");
const serial = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${serial}`,
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
      "bom-ref": `${packageJson.name}@${packageJson.version}`,
    },
    properties: [
      { name: "recall:package-lock-sha256", value: digest },
    ],
  },
  components,
};

const output = new URL("../SBOM.cdx.json", import.meta.url);
await writeFile(output, JSON.stringify(sbom, null, 2) + "\n", "utf8");
console.log(`Generated ${components.length} SBOM components.`);
