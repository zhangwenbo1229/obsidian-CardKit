#!/usr/bin/env bash
# Bundle and run the grammar smoke test (src/dev/grammar-smoke.ts).
#
# The bundle is written into node_modules/.cache, which is already ignored by
# git and by eslint, so running the test leaves nothing behind.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
out="node_modules/.cache/cardkit/grammar-smoke.mjs"
esbuild_bin="./node_modules/@esbuild/win32-x64/esbuild.exe"
if [ ! -x "$esbuild_bin" ]; then
	esbuild_bin="./node_modules/.bin/esbuild"
fi
"$esbuild_bin" src/dev/grammar-smoke.ts \
	--bundle --platform=node --format=esm --log-level=warning --outfile="$out"
node "$out"
