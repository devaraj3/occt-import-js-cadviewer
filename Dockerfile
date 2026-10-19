# Build of occt-import-js (CAD Viewer fork) -> wasm.
#
#   scripts/build.sh      bit-for-bit reproducible build into dist/ (recommended)
#   docker build --target artifacts --output type=local,dest=dist .
#                         quick path; functionally equivalent, not bit-identical
#
# Everything upstream is pinned by commit SHA. Our own changes live in
# overlay/ and are copied over the upstream tree before configuring, so
# `diff -r` of overlay/ against the upstream tag is the full patch set.

# Emscripten 3.1.74, installed from the emsdk repo at the matching tag. The
# prebuilt emscripten/emsdk image is amd64-only; installing emsdk ourselves
# keeps this build native (and fast) on both arm64 and x86_64 hosts.
FROM debian:12-slim AS sources

ARG EMSDK_VERSION=3.1.74
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates git python3 xz-utils bzip2 make cmake curl \
 && rm -rf /var/lib/apt/lists/*

RUN git clone -q --depth 1 --branch "$EMSDK_VERSION" https://github.com/emscripten-core/emsdk.git /emsdk \
 && /emsdk/emsdk install "$EMSDK_VERSION" \
 && /emsdk/emsdk activate "$EMSDK_VERSION"
ENV EMSDK=/emsdk
ENV PATH="/emsdk:/emsdk/upstream/emscripten:${PATH}"
RUN emcc --version | head -1

# kovacsv/occt-import-js tag 0.0.23
ARG OIJ_REPO=https://github.com/kovacsv/occt-import-js.git
ARG OIJ_SHA=c2148e54b456b571238d35cac037d304053d64b2
# OCCT 7.6.1 (commit "Update version up to 7.6.1"); the submodule pin of 0.0.23
ARG OCCT_REPO=https://github.com/Open-Cascade-SAS/OCCT.git
ARG OCCT_SHA=d2abb6d844231cb8f29be6894440874a4700e4a5
ARG JOBS=8

WORKDIR /src
RUN git init -q occt-import-js \
 && cd occt-import-js \
 && git remote add origin "$OIJ_REPO" \
 && git fetch -q --depth 1 origin "$OIJ_SHA" \
 && git checkout -q FETCH_HEAD

RUN git init -q occt-import-js/occt \
 && cd occt-import-js/occt \
 && git remote add origin "$OCCT_REPO" \
 && git fetch -q --depth 1 origin "$OCCT_SHA" \
 && git checkout -q FETCH_HEAD

COPY overlay/ /src/occt-import-js/
COPY scripts/build-wasm.sh /usr/local/bin/build-wasm.sh

# --- Quick path: `docker build --target artifacts --output type=local,dest=dist .`
# Functionally equivalent output, but NOT bit-for-bit reproducible: the wasm
# backend of Emscripten's clang has pointer-address-dependent ordering in a few
# translation units (~18 of 4,775), so kernel ASLR changes the object bytes
# (`docker build` cannot disable ASLR; its default seccomp profile blocks it).
# For a bit-for-bit reproducible build use scripts/build.sh.
FROM sources AS build
RUN build-wasm.sh

FROM scratch AS artifacts
COPY --from=build /out/ /
