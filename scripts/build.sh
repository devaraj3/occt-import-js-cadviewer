#!/usr/bin/env bash
# Bit-for-bit reproducible build (Mac/Linux, needs Docker only).
#
#   scripts/build.sh                 # clean build -> dist/
#   OUT=work/other scripts/build.sh  # choose the output dir
#   INCREMENTAL=1 scripts/build.sh   # keep the build tree in a docker volume (dev loop)
#
# Why not plain `docker build`: Emscripten's clang emits slightly different
# (equivalent) code from run to run in a few translation units because the
# wasm backend has pointer-address-dependent ordering, i.e. it depends on the
# kernel's ASLR. We therefore compile with ASLR disabled (setarch -R), which
# needs the `personality` syscall; Docker's default seccomp profile blocks it,
# so this step runs with seccomp relaxed. Only the pinned sources fetched by
# the Dockerfile are built in that container.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT="${OUT:-dist}"
JOBS="${JOBS:-$( (nproc 2>/dev/null || sysctl -n hw.ncpu) )}"
IMAGE="${IMAGE:-occt-engine:sources}"

docker build --target sources -t "$IMAGE" .

mkdir -p "$OUT"
VOL=()
if [ "${INCREMENTAL:-0}" = "1" ]; then
  VOL=(-v occt-engine-build:/src/occt-import-js/build)
fi

docker run --rm --security-opt seccomp=unconfined \
  -e JOBS="$JOBS" -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$PWD/$OUT":/out ${VOL[@]+"${VOL[@]}"} \
  "$IMAGE" \
  bash -c 'setarch "$(uname -m)" -R build-wasm.sh && chown "$HOST_UID:$HOST_GID" /out/*'

shasum -a 256 "$OUT"/occt-import-js.js "$OUT"/occt-import-js.wasm 2>/dev/null || sha256sum "$OUT"/occt-import-js.*
