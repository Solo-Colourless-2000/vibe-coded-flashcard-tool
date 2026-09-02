import { resolve } from 'node:path';
import { startProdServer } from 'vinext/server/prod-server';
import { BASE_SECURITY_HEADERS } from './securityHeaders.mjs';

function assertSupportedNodeVersion() {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(process.versions.node);
  const major = Number(match?.[1]);
  const minor = Number(match?.[2]);
  const supported =
    Number.isInteger(major) &&
    Number.isInteger(minor) &&
    (major > 22 || (major === 22 && minor >= 13)) &&
    major < 25;
  if (!supported) {
    throw new Error(
      `Unsupported Node.js ${process.versions.node}. RECALL requires >=22.13.0 <25.`,
    );
  }
}

assertSupportedNodeVersion();

const HOST = '127.0.0.1';
const PORT = 3000;
const CANONICAL_ORIGIN = `http://${HOST}:${PORT}`;
const ALLOWED_HOSTNAMES = new Set(['localhost', HOST]);
const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);
const STARTUP_WARMUP_TIMEOUT_MS = 30_000;
const SENSITIVE_EXTENSIONS =
  /\.(?:cer|crt|der|jks|key|keystore|p12|p7b|p7c|pem|pfx|ppk)$/iu;
const SENSITIVE_ROOT_FILES = new Set([
  'eslint.config.mjs',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'readme.md',
  'tsconfig.json',
  'vite.config.ts',
]);

function hasAllowedHostHeader(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.length > 255) return false;
  try {
    const parsed = new URL('http://' + hostHeader);
    return (
      ALLOWED_HOSTNAMES.has(parsed.hostname) &&
      (parsed.port === '' || parsed.port === String(PORT)) &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}

function hasCanonicalHostHeader(hostHeader) {
  if (typeof hostHeader !== 'string' || hostHeader.length > 255) return false;
  try {
    const parsed = new URL('http://' + hostHeader);
    return (
      parsed.hostname === HOST &&
      (parsed.port === '' || parsed.port === String(PORT)) &&
      parsed.username === '' &&
      parsed.password === ''
    );
  } catch {
    return false;
  }
}

function isSensitivePath(rawUrl) {
  let pathname;
  try {
    pathname = new URL(rawUrl, 'http://localhost').pathname;
    for (let depth = 0; depth < 5; depth += 1) {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) break;
      pathname = decoded;
      if (depth === 4 && decodeURIComponent(pathname) !== pathname) return true;
    }
  } catch {
    return true;
  }

  const normalized = pathname.replaceAll('\\', '/');
  const segments = normalized.toLocaleLowerCase('en').split('/');
  return (
    segments.includes('recall-data') ||
    segments.includes('..') ||
    (segments.length === 2 && SENSITIVE_ROOT_FILES.has(segments[1])) ||
    segments.some(
      (segment) => segment.startsWith('.') && segment !== '.well-known',
    ) ||
    SENSITIVE_EXTENSIONS.test(normalized)
  );
}

function applyBaseSecurityHeaders(response) {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }
}

function endRejectedRequest(response, status, allow) {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Length', '0');
  if (allow) response.setHeader('Allow', allow);
  response.end();
}

const { server } = await startProdServer({
  host: HOST,
  port: PORT,
  outDir: resolve('dist'),
  silent: true,
});

const applicationListeners = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (request, response) => {
  applyBaseSecurityHeaders(response);
  const method = request.method ?? 'GET';
  const rawUrl = request.url ?? '/';
  if (!hasAllowedHostHeader(request.headers.host) || isSensitivePath(rawUrl)) {
    endRejectedRequest(response, 404);
    return;
  }
  if (
    request.headers.origin &&
    !ALLOWED_ORIGINS.has(request.headers.origin)
  ) {
    endRejectedRequest(response, 403);
    return;
  }
  if (!hasCanonicalHostHeader(request.headers.host)) {
    let target;
    try {
      const parsed = new URL(rawUrl, CANONICAL_ORIGIN);
      target = CANONICAL_ORIGIN + parsed.pathname + parsed.search;
    } catch {
      endRejectedRequest(response, 400);
      return;
    }
    response.statusCode = 307;
    response.setHeader('Location', target);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Length', '0');
    response.end();
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    endRejectedRequest(response, 405, 'GET, HEAD');
    return;
  }
  if (rawUrl.length > 8_192) {
    endRejectedRequest(response, 414);
    return;
  }

  for (const listener of applicationListeners) {
    listener.call(server, request, response);
  }
});

try {
  const warmupResponse = await fetch(`${CANONICAL_ORIGIN}/`, {
    cache: 'no-store',
    headers: { Accept: 'text/html' },
    signal: AbortSignal.timeout(STARTUP_WARMUP_TIMEOUT_MS),
  });
  if (!warmupResponse.ok) {
    throw new Error(`startup_warmup_http_${warmupResponse.status}`);
  }
  await warmupResponse.arrayBuffer();
} catch (error) {
  server.close();
  throw new Error('RECALL failed its local startup check', { cause: error });
}

console.log(`[RECALL] Production server running at ${CANONICAL_ORIGIN}`);
