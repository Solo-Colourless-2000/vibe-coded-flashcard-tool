import { readFile, writeFile } from "node:fs/promises";

const lock = JSON.parse(
  await readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
);

function packageNameFromPath(packagePath) {
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  return index >= 0 ? packagePath.slice(index + marker.length) : packagePath;
}

const rows = [];
for (const [packagePath, entry] of Object.entries(lock.packages ?? {})) {
  if (!packagePath || !entry?.version || !packagePath.includes("node_modules/")) continue;
  rows.push({
    name: packageNameFromPath(packagePath),
    version: entry.version,
    license: entry.license ?? "UNKNOWN",
  });
}
rows.sort((a, b) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version, "en"));

const lines = [
  "# Third-Party Dependency Inventory",
  "",
  "This file is generated from `package-lock.json`. It is an inventory aid, not a replacement for each dependency's complete license text or legal review.",
  "",
  "| Package | Version | Declared license |",
  "|---|---:|---|",
  ...rows.map(({ name, version, license }) => `| \`${name.replaceAll("|", "\\|")}\` | ${version} | ${String(license).replaceAll("|", "\\|")} |`),
  "",
];
await writeFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), lines.join("\n"), "utf8");
console.log(`Generated inventory for ${rows.length} package entries.`);
