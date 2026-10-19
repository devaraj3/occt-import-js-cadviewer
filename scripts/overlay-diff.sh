#!/usr/bin/env bash
# Shows our complete patch set: overlay/ against the pinned upstream occt-import-js tag.
# (Needs git and network access.)
set -euo pipefail
cd "$(dirname "$0")/.."
OIJ_REPO="${OIJ_REPO:-https://github.com/kovacsv/occt-import-js.git}"
OIJ_SHA="${OIJ_SHA:-c2148e54b456b571238d35cac037d304053d64b2}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
git init -q "$tmp/upstream"
git -C "$tmp/upstream" remote add origin "$OIJ_REPO"
git -C "$tmp/upstream" fetch -q --depth 1 origin "$OIJ_SHA"
git -C "$tmp/upstream" checkout -q FETCH_HEAD
diff -ruN "$tmp/upstream/occt-import-js" overlay/occt-import-js "$@" || true
