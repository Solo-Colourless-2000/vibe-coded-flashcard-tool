import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

function read(relativePath) {
  return readFileSync(join(projectRoot, relativePath), 'utf8');
}

function filesBelow(relativeDirectory) {
  const root = join(projectRoot, relativeDirectory);
  if (!existsSync(root)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(root);
  return files;
}

test('runtime and dependency policy remain local-only and allowlisted', () => {
  const packageJson = JSON.parse(read('package.json'));
  assert.equal(packageJson.private, true);
  assert.match(packageJson.scripts.dev, /127\.0\.0\.1/u);
  assert.equal(packageJson.scripts.start, 'node start-local.mjs');
  assert.match(packageJson.packageManager, /^npm@\d+\.\d+\.\d+$/u);
  assert.ok(!JSON.stringify(packageJson.scripts).includes('0.0.0.0'));

  const dependencyVersions = [
    ...Object.values(packageJson.dependencies ?? {}),
    ...Object.values(packageJson.devDependencies ?? {}),
  ];
  assert.ok(dependencyVersions.length > 0);
  assert.ok(dependencyVersions.every((version) => /^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version)));
  assert.ok(Object.keys(packageJson.allowScripts ?? {}).length > 0);
  assert.ok(Object.values(packageJson.allowScripts).every((allowed) => allowed === true));

  const npmConfig = read('.npmrc');
  assert.match(npmConfig, /^strict-allow-scripts=true$/mu);
  assert.match(npmConfig, /^package-lock=true$/mu);
  assert.match(npmConfig, /^save-exact=true$/mu);
});

test('source releases exclude generated Python and operating-system caches', () => {
  const releaseScript = read('scripts/prepare-source-release.mjs');
  assert.match(releaseScript, /"__pycache__"/u);
  assert.match(releaseScript, /"\.pyc"/u);
  assert.match(releaseScript, /"\.pyo"/u);
  assert.match(releaseScript, /filter: includeReleasePath/u);
  assert.match(releaseScript, /hasForbiddenReleasePath\(rel\)/u);
});

test('client source contains no executable HTML sinks or outbound network clients', () => {
  const clientSource = filesBelow('app')
    .filter((path) => ['.ts', '.tsx'].includes(extname(path)))
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(
    clientSource,
    /dangerouslySetInnerHTML|\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function\b/u,
  );
  assert.doesNotMatch(
    clientSource,
    /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/u,
  );
  const webUrls = clientSource.match(/https?:\/\/[^"'\s)]+/gu) ?? [];
  assert.ok(
    webUrls.every(
      (url) => url === 'http://localhost:3000' || url.startsWith('http://127.0.0.1:3000'),
    ),
  );
});

test('public files contain no study database or common private-key formats', () => {
  const forbiddenExtensions = new Set([
    '.cer', '.crt', '.der', '.jks', '.key', '.keystore',
    '.p12', '.p7b', '.p7c', '.pem', '.pfx', '.ppk',
  ]);
  const publicFiles = filesBelow('public');
  assert.ok(
    publicFiles.every((path) => {
      const normalized = path.replaceAll('\\', '/').toLocaleLowerCase('en');
      return (
        !normalized.includes('/recall-data/') &&
        !forbiddenExtensions.has(extname(normalized)) &&
        !normalized.endsWith('/sets.json') &&
        !normalized.endsWith('/sets.backup.json')
      );
    }),
  );
});

test('base headers and CSP retain the required browser protections', () => {
  const headers = read('securityHeaders.ts');
  const proxy = read('proxy.ts');
  for (const expected of [
    "'X-Content-Type-Options': 'nosniff'",
    "'X-Frame-Options': 'DENY'",
    "'X-XSS-Protection': '0'",
    "'Cross-Origin-Embedder-Policy': 'require-corp'",
    "'Cross-Origin-Opener-Policy': 'same-origin'",
    "'Cross-Origin-Resource-Policy': 'same-origin'",
    "'Referrer-Policy': 'no-referrer'",
  ]) {
    assert.ok(headers.includes(expected));
  }
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self' 'unsafe-inline'",
    "script-src-attr 'none'",
    "media-src 'none'",
  ]) {
    assert.ok(proxy.includes(directive));
  }
  assert.doesNotMatch(proxy, /strict-dynamic|'nonce-|x-nonce/u);
  assert.match(proxy, /loading shell visible forever/u);
});

test('development security permits only Vite JavaScript inside its hidden cache', () => {
  const viteConfig = read('vite.config.ts');
  assert.ok(
    viteConfig.includes(
      'const VITE_OPTIMIZED_DEPENDENCY_FILE = /^[a-z0-9@._+-]+\\.js$/u;',
    ),
  );
  assert.match(
    viteConfig,
    /segments\.length === 5[\s\S]*?segments\[1\] === "node_modules"[\s\S]*?segments\[2\] === "\.vite"[\s\S]*?segments\[3\] === "deps"/u,
  );
  assert.match(viteConfig, /const containsTraversal = segments\.includes\("\.\."\)/u);
  assert.doesNotMatch(
    viteConfig,
    /VITE_OPTIMIZED_DEPENDENCY_FILE[^;]*\.(?:json|map)/u,
  );
});
