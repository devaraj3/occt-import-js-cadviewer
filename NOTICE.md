# Notices

This repository builds a WebAssembly module from the following third-party works, none of which is
modified here except through the patch set in `overlay/`:

* **occt-import-js** 0.0.23 by Viktor Kovacs, <https://github.com/kovacsv/occt-import-js>,
  LGPL-2.1 (the license text is `LICENSE`). `overlay/occt-import-js/src/` contains modified copies of
  some of its source files and new files; `scripts/overlay-diff.sh` prints the exact difference.
* **Open CASCADE Technology (OCCT)** 7.6.1, <https://dev.opencascade.org>, Copyright Open CASCADE S.A.S.,
  LGPL-2.1 with the Open CASCADE exception (`LICENSE.OCCT`, `OCCT_LGPL_EXCEPTION.txt`). It is fetched
  at build time from the pinned commit and statically linked into the wasm; this module "makes use
  of or is based on facilities provided by the Open CASCADE Technology software".
* **Emscripten** 3.1.74 (MIT / University of Illinois-NCSA), used only as the build toolchain.

The built `occt-import-js.wasm` / `.js` are distributed under the LGPL-2.1 together with the complete
corresponding source: this repository plus the two pinned upstream commits listed in `README.md`.
