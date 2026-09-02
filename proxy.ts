import { NextRequest, NextResponse } from "next/server";
import { BASE_SECURITY_HEADERS } from "./securityHeaders";

const ALLOWED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const SENSITIVE_EXTENSIONS =
  /\.(?:cer|crt|der|jks|key|keystore|p12|p7b|p7c|pem|pfx|ppk)$/iu;
const SENSITIVE_ROOT_FILES = new Set([
  "eslint.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "readme.md",
  "tsconfig.json",
  "vite.config.ts",
]);

function isSensitivePath(pathname: string): boolean {
  let decoded = pathname;
  try {
    for (let depth = 0; depth < 5; depth += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
      if (depth === 4 && decodeURIComponent(decoded) !== decoded) return true;
    }
  } catch {
    return true;
  }
  const normalized = decoded.replaceAll("\\", "/");
  const segments = normalized.toLocaleLowerCase("en").split("/");
  return (
    segments.includes("recall-data") ||
    segments.includes("..") ||
    (segments.length === 2 && SENSITIVE_ROOT_FILES.has(segments[1])) ||
    segments.some(
      (segment) => segment.startsWith(".") && segment !== ".well-known",
    ) ||
    SENSITIVE_EXTENSIONS.test(normalized)
  );
}

function createContentSecurityPolicy(): string {
  const developmentConnections =
    process.env.NODE_ENV === "production"
      ? ""
      : " ws://localhost:* ws://127.0.0.1:*";
  const developmentScripts =
    process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

  return [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "frame-src 'none'",
    // Vinext emits its React Server Components bootstrap as inline script
    // elements without a nonce. Blocking those scripts leaves the static
    // loading shell visible forever because client hydration never starts.
    `script-src 'self' 'unsafe-inline'${developmentScripts}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${developmentConnections}`,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "media-src 'none'",
    "manifest-src 'self'",
    "prefetch-src 'self'",
  ].join("; ");
}

function applyBaseSecurityHeaders(response: NextResponse): NextResponse {
  for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

export function proxy(request: NextRequest): NextResponse {
  if (
    !ALLOWED_HOSTNAMES.has(request.nextUrl.hostname) ||
    isSensitivePath(request.nextUrl.pathname)
  ) {
    return applyBaseSecurityHeaders(new NextResponse(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    }));
  }

  const contentSecurityPolicy = createContentSecurityPolicy();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (
    request.nextUrl.pathname === "/" ||
    request.headers.get("RSC") === "1"
  ) {
    response.headers.set("Cache-Control", "no-store");
  }
  return applyBaseSecurityHeaders(response);
}

export const config = {
  matcher: ["/:path*"],
};
