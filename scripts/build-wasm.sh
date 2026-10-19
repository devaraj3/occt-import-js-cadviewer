#!/usr/bin/env bash
# Runs inside the container: configure + build + collect artifacts into /out.
set -euo pipefail
cd /src/occt-import-js
JOBS="${JOBS:-8}"
BUILD_DIR="${BUILD_DIR:-build/wasm}"

# Our sources are few and fast to compile; always rebuild them. Without this, an incremental build
# volume could keep objects that are newer than (but built from different) layer-cached sources.
find occt-import-js/src -type f -exec touch {} +

emcmake cmake -B "$BUILD_DIR" -G "Unix Makefiles" -DEMSCRIPTEN=1 -DCMAKE_BUILD_TYPE=Release .
emmake make -C "$BUILD_DIR" -j"$JOBS"

mkdir -p /out
cp "$BUILD_DIR/Release/occt-import-js.js" "$BUILD_DIR/Release/occt-import-js.wasm" /out/
cp occt/LICENSE_LGPL_21.txt /out/license.occt.txt
cp LICENSE.md /out/license.occt-import-js.txt
