#!/usr/bin/env bash
# Read-only corpus check over a vault: bundles src/dev/corpus-check.ts and runs it.
# Nothing is written outside node_modules/.cache.
# Usage: bash scripts/corpus.sh [vault-root]
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
out="node_modules/.cache/cardkit/corpus-check.mjs"
esbuild_bin="./node_modules/@esbuild/win32-x64/esbuild.exe"
if [ ! -x "$esbuild_bin" ]; then
	esbuild_bin="./node_modules/.bin/esbuild"
fi
"$esbuild_bin" src/dev/corpus-check.ts \
	--bundle --platform=node --format=esm --log-level=warning --outfile="$out"
node "$out" "$@"
