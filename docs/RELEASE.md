# Release Procedure

RECALL 0.2.1 supports Node.js `>=22.13.0 <25`; Node.js 22 and 24 are both verification targets. Because `.npmrc` enables `engine-strict`, `npm ci` stops instead of continuing on an unsupported Node major.

1. Start from a clean checkout. Never build a release from a directory containing an unknown or manually copied `node_modules` tree.
2. Install the exact lockfile graph on the target OS with `npm ci`.
3. Run `npm run manual:build` to synchronize the self-contained HTML manual with the current source.
4. Run `npm run check`; this includes `manual:verify` and rejects stale or incomplete manual content.
5. Run `npm run build` and perform a local `npm run start` smoke test.
6. Run `npm run release:prepare` followed by `npm run release:verify`. Preparation generates the SBOM and third-party license notices before copying the release files.
7. Archive only the prepared `release/recall-<version>-source` directory. Normal files must be 0644 and directories 0755 in Unix-oriented archives; no entry may be world-writable.
8. Publish a SHA-256 digest for the final archive. If a signing identity is available, sign or attest the archive and bind the signature to the digest.
9. Never include `node_modules`, `dist`, `.next`, `.vinext`, `.wrangler`, `.env*`, `recall-data`, credentials, private keys, or a browser profile in the source release.

CI performs the clean-install checks on Linux and Windows so OS-specific native dependency problems are detected before a release is accepted.
