# TOTAL RECALL

TOTAL RECALL 0.2.1 is a local study tool intended for personal use. You read a question and type your answer. If your answer is incorrect, you must re-enter the correct answer before continuing. Questions are repeated within a group of the selected size until you can answer every question correctly on your own. Study data, in-progress sessions, and editing drafts are saved on your device. The application does not send card contents to external services.

## Requirements

- Node.js `22.13.0` or later, but earlier than `25` (Node.js 24 is supported)
- npm and a clean install using `package-lock.json`
- A Chromium-based browser such as Chrome or Edge is recommended
- Saving to a project folder requires a browser that supports the File System Access API

As of October 8, 2026, `window.showDirectoryPicker()`, which is used for folder-based saving, is supported by desktop Chrome and Edge but not by Firefox or Safari. In unsupported browsers, the application displays a message stating that folder-based saving is not supported and hides the buttons for selecting or changing the destination folder. You can still save data in the browser using IndexedDB and export or restore JSON backups. See [MDN: showDirectoryPicker()](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker) for browser compatibility information. The manual explains feature detection and the related UI behavior in “Preparation” and “Implementation 19: Connecting, Integrating, and Disconnecting Folder Storage.”

The distribution intentionally excludes `node_modules`, `.next`, `.vinext`, `.wrangler`, and `dist`. Always run `npm ci` after extracting the project to install the correct native dependencies for your operating system.

The `engine-strict=true` setting in `.npmrc` and a startup check in production mode prevent the application from running with unsupported Node.js versions. Node.js 22 and 24 can use the same lockfile and commands.

## Getting Started

Run the following command in the project directory:

```bash
npm ci
```

For development mode:

```bash
npm run dev
```

For regular use, a production build is recommended:

```bash
npm run build
npm run start
```

Open **`http://127.0.0.1:3000`** in your browser. If you use `http://localhost:3000`, the TOTAL RECALL local server redirects you to the canonical origin, `127.0.0.1:3000`.

The server listens only on `127.0.0.1:3000`. Do not run it with administrator/root privileges or expose it on `0.0.0.0`, a LAN IP address, or the public internet. To stop the server, press `Ctrl+C` in the terminal where it is running.

## HTML Manual

For instructions on building and maintaining the application, see the [TOTAL RECALL Complete Beginner's Feature-Based Development Manual (October 8, 2026 edition)](docs/TOTAL_RECALL_機能別開発_初心者向け完全開発マニュアル_20261008.html). Following the feature-based structure of version 0.2.1, the manual covers preparation, 35 foundational terms, 22 introductory exercises, implementation explanations spanning 24 chapters and 102 steps, five maintenance exercises, verification, and distribution. It includes setup and startup procedures for Windows (PowerShell) and Linux (Bash), explains why responsibilities are separated in each chapter, and provides verification commands. Each step moves between related files, making small changes and checking their behavior along the way. The completed source code is provided as a reference appendix.

The HTML manual does not use external CDNs, fonts, or JavaScript and can be opened as a standalone file. On Windows, the body text prefers `Segoe UI`, while code prefers `Cascadia Mono` or `Consolas`, with appropriate fallbacks for Japanese text. Features include a fixed table of contents, full-text search across all sections, adjustable font size, focus mode, copyable small code snippets, mobile navigation, and print styles.

After changing the application or its documentation, regenerate and verify the manual in this order:

```bash
npm run manual:build
npm run manual:verify
```

`npm run check` also includes HTML manual verification. The checks cover type checking of every intermediate exercise state, linting and grading tests for the final learning materials, locations of excerpts from production source code, included files, the table of contents, HTML/CSS/interactive scripts, and SHA-256 hashes.

## Development and Maintenance Structure

`app/page.tsx` is responsible only for the root entry point. The UI, state management, editing, studying, and persistence logic are separated into feature-specific folders under `app/recall/`. For file responsibilities, data flow, and guidance on which files to inspect for a given change, see the [Application Architecture and Maintenance Guide](docs/ARCHITECTURE.md).

## Key Features

- Typed-answer study mode with mandatory re-entry of the correct answer after an incorrect response
- Code editors for both the answer field and the correct-answer re-entry field, with line numbers, syntax highlighting, bracket completion, Tab indentation equivalent to four spaces, search, and an expanded view
- Language modes for plain text, JavaScript, TypeScript, JSX, TSX, Python, HTML, CSS, JSON, SQL, and Java
- Case-sensitive, strict answer checking that removes only extra trailing whitespace from each line, with an option selected before studying to omit content inside balanced ASCII parentheses `(...)`
- Mastery-based learning in groups of 1, 3, 5, 10, 15, or 20 questions, repeated until every question is answered correctly without assistance
- Progress saved after each answer, with the ability to resume the previous session
- After a correct answer, pressing Enter moves to the next question without requiring the user to focus a button
- Flashcard view
- Creation, editing, reordering, and deletion of study sets and cards
- Undo immediately after deleting a card
- Pagination in batches of 100 cards when editing large sets
- Search across card contents as well as set names and descriptions
- Navigation history compatible with the browser's Back and Forward buttons
- Import from Excel (`.xlsx` / `.xlsm`), CSV, TSV, TXT, and pasted text
- Reading and automatic detection of UTF-8, UTF-16 LE, UTF-16 BE, and Shift_JIS
- Review of potential duplicate cards, with an option to exclude exact duplicates during import
- Warnings for cards containing invisible or control characters
- Automatic saving to IndexedDB, including editing drafts
- Multiple generations of in-browser backup copies
- Export and validated restoration of a full TOTAL RECALL JSON backup
- JSON saving to a chosen local folder, with multiple backup generations
- Display of browser storage usage and persistence status, with the ability to request persistent storage

## Browser Storage

The primary storage backend is **IndexedDB**. It stores study sets, in-progress sessions, editing drafts, and in-browser backup copies. Saved data is restored when you open the application with the same browser profile.

Saving uses revisions to avoid blindly overwriting data that another tab has updated first. When disconnecting folder storage and switching back to browser storage, the application also rechecks the current revision before saving. It creates backup copies as needed before updating the current state and retains up to five generations. If it detects an invalid storage structure, a conflict, or unavailable storage, automatic overwriting stops as a safety measure.

If an IndexedDB connection succeeds only after the open operation has timed out or been blocked and terminated, that late connection is immediately closed. If a write transaction times out, the application attempts to abort it to reduce the risk of a write being committed later after the caller has already treated it as failed.

The storage-status button in the lower-left corner provides the following actions. When no folder is connected, its label is “Local Storage” (`ローカル保存`); once a folder is connected, it displays the selected folder's name.

- Request persistent browser storage
- Restore the latest in-browser backup copy
- Export a TOTAL RECALL JSON backup
- Restore data from a TOTAL RECALL JSON backup
- Connect, change, or disconnect project-folder storage in a supported browser

The backup JSON includes all study sets, learning progress, and IDs of deleted sets. Files exported by version 0.2.1 have an `appVersion` value of `0.2.1`. Before restoring a backup, the application preserves the current state as a backup copy and validates the file contents before applying them.

## Project-Folder Storage

In Chrome or Edge, open the storage-status button in the lower-left corner and click “Select Save Folder” (`保存先フォルダーを選択`). We recommend choosing **a folder dedicated to TOTAL RECALL that contains no other important files**. After connecting a folder, you can select another one using “Change Destination” (`保存先を変更`).

The following files are created under the selected folder:

```text
<selected-folder>/recall-data/sets.json
<selected-folder>/recall-data/sets.backup.json
<selected-folder>/recall-data/sets.backup.1.json
<selected-folder>/recall-data/sets.backup.2.json
...
<selected-folder>/recall-data/sets.backup.5.json
```

`sets.backup.json` and `sets.backup.1.json` are backup copies of the previous saved contents. `sets.backup.2.json` through `sets.backup.5.json` retain successively older saved contents. As saves that create backups accumulate, older copies shift through the generations.

For folder-based saving, the application rechecks whether `sets.json` has appeared after creating the data directory, even during initial setup. For normal updates, it rereads the file before writing, rechecks for conflicts, verifies the result after writing a backup, and performs read-back verification after writing the main file. If verification fails, it attempts to roll back to the previous generation without overwriting legitimate external changes. File I/O operations have timeouts. Within the same browser, the application uses Web Locks, when available, to serialize saving operations.

Browsers that do not support folder-based saving can still use IndexedDB. If folder access must be reauthorized, such as after restarting the browser, the user must click to grant permission again.

## Answer-Checking Rules

Before starting a study session, you can choose whether to allow omission of text inside balanced ASCII parentheses `(...)` using the “Allow Omitting Text in ASCII Parentheses” option (`半角カッコ内の省略を許可`). The option is enabled by default (omission allowed). When disabled, an answer is accepted only if the parentheses and their contents are entered exactly. This setting is stored with in-progress session data and remains unchanged when you resume a session.

Regardless of the setting, submission removes only horizontal whitespace (spaces, tabs, etc.) at the end of each line. All other characters are compared exactly. The application does not lowercase text, apply Unicode normalization, or interpret input as regular expressions.

- `TLS` and `tls` are different answers.
- When omission is allowed, `Centralized governance (集中型ガバナンス)` is accepted either in full or as `Centralized governance` alone.
- When omission is not allowed, entering only `Centralized governance` for the same answer is incorrect.
- When omission is allowed and an answer contains multiple sets of ASCII parentheses, each eligible parenthesized part may be omitted independently.
- Unbalanced parentheses, empty `()`, nested `(A (B))`, and full-width `（...）` parentheses are treated as ordinary characters.
- Strings such as `C++`, `<script>`, `[a-z]*`, and `A+B=C?` are treated as ordinary characters.
- Leading indentation and spaces within each line affect answer checking. Only extra trailing horizontal whitespace is removed before comparison.
- For multiline answers, Enter inserts a newline; `Ctrl+Enter` or `Cmd+Enter` submits the answer for grading.
- In the code editor, Tab indents by four ASCII spaces, and `Ctrl+F` or `Cmd+F` opens search.
- Language modes change only display and editing assistance; they do not modify the string used for grading.
- Standard line endings are normalized to LF when saving.
- Invisible Unicode characters are distinct characters under strict comparison. Review import warnings carefully.

## Question Group Sizes and Resuming Sessions

- Before starting, select a group size of 1, 3, 5, 10, 15, or 20 questions. The default is 15.
- Before starting, choose whether text inside ASCII parentheses `(...)` may be omitted. Omission is allowed by default.
- If fewer cards remain than the selected group size, the final group contains only the remaining cards.
- After an incorrect answer, re-entering the correct answer is mandatory. The card will still be presented again within the current group.
- You cannot move to the next group until you answer every repeated card correctly without looking at the answer.
- After each answer, the application saves question order, the parentheses-omission setting, the current group, cards awaiting repetition, and the screen state following a correct answer or during answer re-entry.
- Even after closing the browser, you can return to the saved point by choosing “Resume” (`続きから再開`) for the same set.
- When folder-based saving is connected, session progress is also synchronized to `recall-data/sets.json`.

## Import Considerations

Delimiters in pasted text and TXT files are treated literally, whereas CSV/TSV files are parsed using standard quoted-field syntax. Before importing, you can review a preview, warnings with line numbers, and potential exact-match duplicates.

- Import file size: up to 10 MiB
- Cards per import: up to 10,000
- Excel: the ZIP structure is checked in advance; encrypted files, ZIP64, unsafe paths, abnormal compression ratios, excessive uncompressed sizes, and excessive entry counts are rejected
- Excel parsing: runs in a dedicated Worker, which validates sheet counts, names, rows, columns, cells, and the total character count across all sheets before passing results to the UI. Parsing is canceled if the file is replaced or the dialog is closed
- TXT/CSV/TSV: selectable UTF-8, UTF-16 LE/BE, and Shift_JIS encodings, with automatic detection based on BOMs and other indicators
- `.xlsm` macros and cell formulas are not executed

Untrusted files can contain parser edge cases even within these limits. In sensitive environments, import only files from verified sources.

## Data Limits

- Maximum of 200 study sets
- Maximum of 10,000 cards per set
- Maximum of 50,000 cards in total
- Set name: 255 characters
- Description: 5,000 characters
- Each side of a card: 20,000 UTF-16 code units
- Browser-storage JSON: up to 25 Mi UTF-16 code units; folder-based `sets.json`: up to 25 MiB in UTF-8

These are safety limits, not recommended dataset sizes for everyday use. When editing large sets, the application displays cards in pages of 100 rather than creating input fields for every card in the DOM at once.

## Security Design

- Both development and production servers listen on loopback only and reject unauthorized Host values.
- The canonical origin is `http://127.0.0.1:3000`. Requests to `localhost:3000` are redirected to the canonical origin.
- Requests with unauthorized Origins, methods other than GET/HEAD, URLs exceeding 8 KiB, excessive layers of URL encoding, or path traversal are rejected.
- Direct serving of `recall-data`, hidden files, private-key formats, and major project configuration files is blocked.
- The Content Security Policy (CSP) limits script sources to the same origin and blocks script execution from HTML attributes. Only the inline bootstrap generated by Vinext for production startup is allowed because it is required to initialize the UI. Additional defense-in-depth headers include `frame-ancestors`/`X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, and COOP/COEP/CORP.
- Source maps are disabled in production builds.
- Card contents are rendered as regular React text rather than through `innerHTML`.
- There are no external analytics tags, ads, sound effects, external fonts, or external APIs that transmit card contents.
- Saved data is validated for type, item counts, character lengths, IDs, timestamps, and learning-progress consistency before use.
- Safety limits for compression ratios, uncompressed sizes, entry counts, and related values are enforced for Excel/ZIP files.
- Dependency versions and the lockfile are pinned, and source releases include an SBOM and a list of third-party licenses.

See `docs/THREAT_MODEL.md` for a detailed description of trust boundaries and non-goals.

### Scope of Protection and Operational Precautions

Although study data is not transmitted to external services, IndexedDB data, backup JSON files, and folder-based JSON files are all stored in plaintext on the device. The application does not protect data from third parties who can access the same OS account, malicious browser extensions, malware on the device, or users with administrator/root privileges.

Do not store sensitive information such as passwords, private keys, or personal identification numbers in cards. Where appropriate, also use operating-system device encryption, screen locking, a dedicated browser profile, and folder access permissions.

File System Access directory handles are associated with the browser origin. Use the canonical origin `127.0.0.1:3000` when running TOTAL RECALL, and do not allow untrusted applications to use the same origin.

## Quality Checks

After ordinary changes, run:

```bash
npm run manual:build
npm run check
npm run build
```

After updating dependencies, also run vulnerability audits:

```bash
npm audit
npm audit --omit=dev
```

To prepare a release:

```bash
npm run release:prepare
npm run release:verify
```

`release:prepare` generates an SBOM and a list of third-party licenses, then creates a source release using an allowlist. It excludes `node_modules`, build caches, `recall-data`, and other non-release content. On Unix-like systems, permissions are normalized to `0644` for regular files and `0755` for directories, and each file's SHA-256 hash is recorded in `RELEASE_MANIFEST.json`.

See `docs/RELEASE.md` for detailed instructions.
