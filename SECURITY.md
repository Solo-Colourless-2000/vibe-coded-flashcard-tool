# Security Policy

## Scope

RECALL is a local single-user study application. It is intended to listen only on the loopback interface and to keep study data on the user's device. The supported security boundary assumes that the operating-system account and browser profile used to run RECALL are trusted.

RECALL is **not** intended to protect study data from malware, an administrator/root user, a hostile browser extension, or another person who can use the same OS account or browser profile. Do not store passwords, private keys, government identifiers, or other high-value secrets in study cards.

## Reporting a vulnerability

If this project is published in a repository, use that repository's private security-advisory/reporting feature where available. Do not publish exploit details before a fix is available. A report should include the affected version, reproduction steps, impact, and whether the issue requires a hostile local process, a hostile file, or remote network access.

## Supported version

Only the newest released version is supported. Security fixes should be applied to the current release rather than maintaining multiple old branches.

## Release requirements

A release is expected to pass tests, type checking, lint, a clean production build on supported operating systems, source-release verification, dependency/SBOM generation, and artifact hash verification. `node_modules`, local study data, build caches, and deployment-state directories must never be copied into the source release.
