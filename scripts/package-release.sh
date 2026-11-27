#!/usr/bin/env bash
# Build on the publisher's machine. The extracted service uses only Node.js.
set -euo pipefail
cd "$(dirname "$0")/.."
output=$(realpath -m "${1:-release}")
mkdir -p "$output"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
bundle="$stage/remote-viewer"
mkdir -p "$bundle"

npm ci --no-audit --no-fund
npm run build
cp -R dist "$bundle/"
cp server.mjs gpu-server.mjs checkpoint.mjs transcode.mjs inspect_checkpoint.py \
  README.md package.json package-lock.json "$bundle/"
npm ci --prefix "$bundle" --omit=dev --ignore-scripts --no-audit --no-fund
git rev-parse HEAD > "$bundle/REVISION"

# Preserve notices for the client libraries embedded in the Vite bundles.
mkdir -p "$bundle/licenses"
(cd node_modules && find . -type f \( -iname 'license*' -o -iname 'notice*' -o -iname 'copying*' \) \
  -exec cp --parents -t "$bundle/licenses" '{}' +)

tar -C "$stage" -czf "$output/remote-viewer.tar.gz" remote-viewer
(cd "$output" && sha256sum remote-viewer.tar.gz > remote-viewer.tar.gz.sha256)
