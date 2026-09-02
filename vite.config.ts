import { sites } from "@openai/sites-vite-plugin";
import tailwindcss from "@tailwindcss/postcss";
import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json" with { type: "json" };
import { BASE_SECURITY_HEADERS } from "./securityHeaders.ts";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const CANONICAL_LOCAL_ORIGIN = "http://127.0.0.1:3000";
const ALLOWED_LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);
const ALLOWED_LOCAL_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
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
const VITE_OPTIMIZED_DEPENDENCY_FILE = /^[a-z0-9@._+-]+\.js$/u;

function hasAllowedLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader || hostHeader.length > 255) return false;
  try {
    const parsed = new URL("http://" + hostHeader);
    return (
      ALLOWED_LOCAL_HOSTNAMES.has(parsed.hostname) &&
      parsed.port === "3000" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function hasCanonicalLocalHost(hostHeader: string | undefined): boolean {
  if (!hostHeader || hostHeader.length > 255) return false;
  try {
    const parsed = new URL("http://" + hostHeader);
    return (
      parsed.hostname === "127.0.0.1" &&
      parsed.port === "3000" &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function isViteOptimizedDependency(segments: string[]): boolean {
  return (
    segments.length === 5 &&
    segments[1] === "node_modules" &&
    segments[2] === ".vite" &&
    segments[3] === "deps" &&
    VITE_OPTIMIZED_DEPENDENCY_FILE.test(segments[4])
  );
}

function denySensitiveProjectFiles() {
  return {
    name: "deny-sensitive-project-files",
    configureServer(server: {
      middlewares: {
        use: (
          handler: (
            request: {
              headers: { host?: string; origin?: string };
              method?: string;
              url?: string;
            },
            response: {
              removeHeader: (name: string) => void;
              statusCode: number;
              setHeader: (name: string, value: string) => void;
              end: () => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((request, response, next) => {
        for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
          response.setHeader(name, value);
        }
        if (!hasAllowedLocalHost(request.headers.host)) {
          response.statusCode = 403;
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }
        if (
          request.headers.origin &&
          !ALLOWED_LOCAL_ORIGINS.has(request.headers.origin)
        ) {
          response.removeHeader("Access-Control-Allow-Credentials");
          response.removeHeader("Access-Control-Allow-Origin");
          response.statusCode = 403;
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }
        if (request.method !== "GET" && request.method !== "HEAD") {
          response.statusCode = 405;
          response.setHeader("Allow", "GET, HEAD");
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }
        if ((request.url?.length ?? 0) > 8_192) {
          response.statusCode = 414;
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }

        let pathname = "/";
        try {
          pathname = new URL(
            request.url ?? "/",
            "http://localhost",
          ).pathname;
          for (let depth = 0; depth < 5; depth += 1) {
            const decoded = decodeURIComponent(pathname);
            if (decoded === pathname) break;
            pathname = decoded;
            if (depth === 4 && decodeURIComponent(pathname) !== pathname) {
              throw new URIError("excessive URL encoding");
            }
          }
        } catch {
          response.statusCode = 400;
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }

        const normalizedPathname = pathname.replaceAll("\\", "/");
        const segments = normalizedPathname.toLocaleLowerCase("en").split("/");
        const containsHiddenSegment =
          !isViteOptimizedDependency(segments) &&
          segments.some(
            (segment) => segment.startsWith(".") && segment !== ".well-known",
          );
        const containsStudyData = segments.includes("recall-data");
        const containsTraversal = segments.includes("..");
        const containsSensitiveExtension =
          SENSITIVE_EXTENSIONS.test(normalizedPathname);
        const isSensitiveRootFile =
          segments.length === 2 && SENSITIVE_ROOT_FILES.has(segments[1]);

        if (
          containsHiddenSegment ||
          containsStudyData ||
          containsTraversal ||
          containsSensitiveExtension ||
          isSensitiveRootFile
        ) {
          response.statusCode = 404;
          response.setHeader("Cache-Control", "no-store");
          response.setHeader("X-Content-Type-Options", "nosniff");
          response.end();
          return;
        }
        if (!hasCanonicalLocalHost(request.headers.host)) {
          const parsed = new URL(request.url ?? "/", CANONICAL_LOCAL_ORIGIN);
          response.statusCode = 307;
          response.setHeader(
            "Location",
            CANONICAL_LOCAL_ORIGIN + parsed.pathname + parsed.search,
          );
          response.setHeader("Cache-Control", "no-store");
          response.end();
          return;
        }
        next();
      });
    },
  };
}

const localBindingConfig = {
  main: "vinext/server/app-router-entry",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const cloudflarePlugins = [];
  if (command === "build") {
    const { cloudflare } = await import("@cloudflare/vite-plugin");
    cloudflarePlugins.push(
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    );
  }

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    build: { sourcemap: false },
    server: {
      host: "127.0.0.1",
      port: 3000,
      strictPort: true,
      allowedHosts: ["localhost", "127.0.0.1"],
      cors: {
        origin: /^http:\/\/(?:localhost|127\.0\.0\.1):3000$/u,
      },
      fs: {
        strict: true,
        deny: [
          "**/recall-data/**",
          "**/.git/**",
          "**/.env*",
          "**/.npmrc",
          "**/.yarnrc.yml",
          "**/*.{cer,crt,der,jks,key,keystore,p12,p7b,p7c,pem,pfx,ppk}",
        ],
      },
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      denySensitiveProjectFiles(),
      vinext(),
      sites(),
      ...cloudflarePlugins,
    ],
  };
});
