# occt-import-js-cadviewer

WebAssembly build of [Open CASCADE Technology](https://dev.opencascade.org) (OCCT) **7.6.1** with
[occt-import-js](https://github.com/kovacsv/occt-import-js) **0.0.23**, plus a small overlay (`overlay/`)
that adds two exports used by the CAD viewer at **[cadviewer.xyz](https://cadviewer.xyz)**:

* `TessellateWithTopology` - tessellation plus exact B-rep topology (faces, edges, vertices, adjacency, edge curves).
* `ExportPart` - export one part of a loaded STEP/IGES/BREP file as STEP, IGES or BREP.

The stock readers also emit a `partId` on every node and mesh. Everything else is upstream.
This repository is the complete corresponding source of the built module (LGPL-2.1, see below).

## Shipped build

| file | sha256 | bytes |
|---|---|---:|
| `occt-import-js.wasm` | `6c0b52223c47178289eb40c53a3e6b639076b032e4a12d83bd837a748b58d82d` | 7,776,237 |
| `occt-import-js.js` | `7ccb3dca2d792baa31dc2c316622cf42e4ed581dcee3ec154dbc9cdf2d31c95c` | 97,877 |

Produced by `scripts/build.sh` from this commit. The build is bit-for-bit reproducible (verified on
arm64 with three independent cold builds; other architectures may give a different, equally valid hash).

## API

All functions are Embind exports of the module created by `occtimportjs()` (`MODULARIZE`).

* `ReadFile(format, bytes, params)`, `ReadStepFile`, `ReadIgesFile`, `ReadBrepFile` - upstream API.
  Nodes and meshes additionally carry `partId` (`xcf:root`, `xcf:<label entry>`, `brep:root`,
  `brep:solid|shell|faces:N`).
* `TessellateWithTopology(bytes, { ext | inputExt, ...params | mesh: params })` -
  `{ success, root, meshes, topology: { vertices, edges, faces } }` (same `root`/`meshes` as the
  readers, plus exact B-rep topology per node), or `{ success: false, error }`.
* `ExportPart(bytes, { inputExt, partId, format })` - `{ success, format, bytes: Uint8Array }`
  (`format`: `step`/`stp`, `iges`/`igs`, `brep`), or `{ success: false, error }`.

The output schema, including quirks inherited from the module this one replaces and reproduced on
purpose, is documented in `docs/reference-behaviour.md`. `AnalyzeSheetMetal` is intentionally not included.

## Pinned inputs

| Input | Version | Pin |
|---|---|---|
| occt-import-js | tag `0.0.23` | commit `c2148e54b456b571238d35cac037d304053d64b2` |
| OCCT | 7.6.1 | commit `d2abb6d844231cb8f29be6894440874a4700e4a5` (the submodule pin of 0.0.23), fetched from <https://github.com/Open-Cascade-SAS/OCCT> |
| Emscripten | 3.1.74 | emsdk tag `3.1.74`, installed in the Dockerfile |
| Base image | `debian:12-slim` | |

The upstream `emscripten/emsdk` image is amd64-only, so on Apple Silicon it would run under
emulation. The Dockerfile installs emsdk itself on `debian:12-slim`, which builds natively on
both arm64 and x86_64 hosts (Mac and Linux; no `.bat`).

## Build

Requires Docker only (Mac or Linux).

```sh
scripts/build.sh                   # -> dist/occt-import-js.{js,wasm} + licence files
INCREMENTAL=1 scripts/build.sh     # keep the build tree in a docker volume (dev loop)
```

A cold build takes ~11 min on a 10-core Apple Silicon machine (OCCT is ~4,800 translation
units). Build flags are upstream's `CMakeLists.txt` unchanged (`-Oz`, `-fwasm-exceptions`,
`MODULARIZE`, `EXPORT_NAME=occtimportjs`, 10 MB stack, memory growth).

Our changes to upstream live in `overlay/`; its contents are copied over the upstream
checkout before configuring, so the overlay is the complete patch set.

### Bit-for-bit reproducibility

`scripts/build.sh` compiles with ASLR disabled (`setarch -R`) inside the container. This is
needed because the wasm backend of Emscripten's clang orders some code by pointer address:
~18 of 4,775 translation units (e.g. `Plate_Plate.cxx`) compile to different, equivalent objects
from run to run when ASLR is on, so two ordinary `docker build`s give wasm files that differ
by ~8 KB. `setarch -R` needs the `personality` syscall, which Docker's default seccomp profile
blocks during `docker build`, so the script uses `docker run --security-opt seccomp=unconfined`
(only the pinned sources fetched by the Dockerfile are built in that container).

Verified: three independent cold builds (two concurrent) produced identical
`occt-import-js.wasm` (sha256 `6c0b52223c47178289eb40c53a3e6b639076b032e4a12d83bd837a748b58d82d`,
7,776,237 bytes) and identical `occt-import-js.js`. Verified on arm64 only; x86_64 hosts are
untested and may produce a different (equally valid) hash.

`docker build --target artifacts --output type=local,dest=dist .` is a quick path that
yields a functionally equivalent but not bit-identical wasm.

## Verification harness (`compare/`)

The harness loads a *reference* runtime and the rebuilt `dist/` output side by side and compares
them. The reference wasm is **not** part of this repository: point `OCCT_ORACLE_DIR` at a directory
containing `occt-import-js.v2.js` and `occt-import-js.v2.wasm`. The test files are private as well;
none are included.

| variable | meaning |
|---|---|
| `OCCT_ORACLE_DIR` | directory with the reference `occt-import-js.v2.{js,wasm}` (default `./oracle`) |
| `OCCT_FIXTURES_DIR` | tree of STEP/IGES/BREP test files |
| `OCCT_WORK_DIR` | scratch + results directory (default `./work`, git-ignored; results embed file names, keep them private) |
| `CAD_APP_DIR` | optional: checkout of a consumer that provides a sheet-metal analysis module (not in this repo); only the sheet-metal check uses it |
| `FX_SIMPLE_STEP`, `FX_ASSEMBLY_STEP`, `FX_IGES`, `FX_STEP_MEDIUM` | single files for the conformance matrix, benchmark and trap repro |

```sh
node compare/phase1.js 3                         # stock readers vs reference, every fixture
node compare/dump-all.js oracle "$OCCT_WORK_DIR/oracle-twt" 3   # cache the reference's TessellateWithTopology output (once)
node compare/phase2-twt.js dist 4 live           # TessellateWithTopology: full deep diff
node compare/build-sm-harness.js && node compare/phase2-sm.js dist 3   # optional: external sheet-metal analysis on both
node compare/phase2-export.js dist 3             # ExportPart STEP/IGES/BREP, re-imported with the reference
node compare/conformance.js dist                 # options / error-string / edge-case matrix
node compare/brep-twt.js dist                    # BREP-sourced TessellateWithTopology
node compare/bench.js dist                       # size / load / speed
```

Summaries of the results are in `docs/phase1-summary.md` and `docs/phase2-report.md`.
`scripts/overlay-diff.sh` prints our full patch set against upstream 0.0.23.

## License

LGPL-2.1 (`LICENSE`). OCCT is LGPL-2.1 with the Open CASCADE exception (`LICENSE.OCCT`,
`OCCT_LGPL_EXCEPTION.txt`). Third-party notices: `NOTICE.md`.
