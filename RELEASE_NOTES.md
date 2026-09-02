# RECALL 0.2.1

This maintenance release preserves the original study, editing, import, code-answer, flashcard, browser-storage, and project-folder features while hardening durability, large-data behavior, accessibility, import handling, and release hygiene.

Highlights include IndexedDB primary storage with revisions and backup generations, durable save feedback, safer folder conflict/rollback handling, full backup export/restore, bounded large-set editing, cancellable spreadsheet parsing, broader text-encoding support, invisible-character diagnostics, browser history support, fullscreen editor accessibility fixes, and reproducible source-release preparation.

The source release intentionally excludes preinstalled `node_modules` and stale build artifacts. Run `npm ci` on the target operating system before building or starting RECALL.

The 2026-08-30 re-audit also removes unintended NFC normalization from answer matching, treats nested parentheses literally, corrects backup metadata to `appVersion: 0.2.1`, closes late IndexedDB connections, aborts timed-out IndexedDB writes, preserves newly appeared folder files during first-time setup, keeps folder-disconnect saves revision-safe, and validates aggregate spreadsheet results inside the Worker before structured cloning.

The 2026-08-31 follow-up fixes production hydration so the application leaves its loading shell under Vinext's generated inline bootstrap, while retaining same-origin script loading and blocking script attributes. It also adds a per-session choice for allowing or requiring balanced ASCII-parenthetical text. The choice is stored with study progress, and version 1/2 progress migrates to the former default of allowing omission.

The former main and appendix PDFs are retired and replaced by one self-contained UTF-8 HTML manual. It preserves the 849-page-equivalent beginner foundation, regenerates the 46-file source appendix from the current project, and provides an offline table of contents, full-text search, font controls, focus mode, code copying, mobile navigation, and print styling. `manual:build` and `manual:verify` are now the only manual authoring workflow.

The supported runtime range is now Node.js `>=22.13.0 <25`, including Node.js 24. Installation and local production startup reject only versions outside that range.

Source-release preparation now also filters Python bytecode/cache directories and common operating-system metadata files before hashing the allowlisted release tree.
