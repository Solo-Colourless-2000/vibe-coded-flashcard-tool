# RECALL Threat Model

## Assets

- Study sets, card text, and study progress.
- Draft edits.
- Browser backup generations.
- The File System Access directory capability when a project folder is connected.
- Integrity of the source/release artifact and dependency graph.

## Trust boundaries

1. **Browser UI → imported file data:** CSV/TSV/TXT/XLSX/XLSM are untrusted input. Size, structure, archive expansion, rows, columns, strings, and identifiers are bounded and validated before persistent use. Spreadsheet sheet count, names, rows, cells, and aggregate characters are revalidated inside the Worker before the result is cloned to the UI thread.
2. **Browser UI → IndexedDB:** browser storage may be corrupted, stale, modified by another tab, blocked, slow, or cleared by the browser. Stored data is validated and revisioned. Late database opens are closed, timed-out transactions are aborted, and folder-disconnect saves retain compare-and-swap revision checks.
3. **Browser → selected local folder:** the folder may be modified externally. Writes use initial-create rechecks, conflict checks, backup generations, verification, rollback, timeouts, and a browser lock when available.
4. **Browser → loopback server:** only loopback access is intended. Host, Origin, method, URL length, sensitive paths, and security headers are checked. `127.0.0.1:3000` is the canonical origin. CSP limits script files to the same origin, prohibits script attributes, and permits the framework-generated inline bootstrap required to hydrate the production UI.
5. **Source → npm dependency/build chain:** package-lock is authoritative. Releases are prepared from an allowlist, carry an SBOM and hash manifest, and exclude `node_modules` and build/deployment caches.

## Trusted assumptions

- The current OS account and browser profile are trusted.
- Malware, administrator/root access, hostile browser extensions, and arbitrary code already running as the same OS user are outside the confidentiality boundary.
- The application is not exposed to LAN/WAN interfaces.

## Key abuse and failure cases

- Oversized or malformed import files attempt CPU/memory exhaustion.
- Two tabs or an external editor update the same saved data concurrently.
- The browser quota is exhausted or IndexedDB is blocked/cleared.
- Folder I/O stalls or fails part-way through an update.
- A stale folder generation attempts to resurrect a deleted set.
- Invisible Unicode characters make a card look blank or make an answer visually misleading.
- Canonically equivalent Unicode sequences look identical but remain distinct answers because grading deliberately performs no Unicode normalization.
- A release archive is modified or contains unnecessary executable/build files.
- Another local application uses `localhost:3000`; users should use only the canonical `127.0.0.1:3000` URL for RECALL.
- A CSP change blocks Vinext's generated bootstrap and leaves only the static loading shell; the production-browser smoke test must prove that the interactive application shell appears.

## Non-goals

- Multi-user authentication/authorization.
- Remote hosting as an internet service.
- Encrypting secrets against the current OS user.
- Executing formulas, macros, or code contained in imported study material.
