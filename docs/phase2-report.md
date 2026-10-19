# Phase 2 report: `TessellateWithTopology` + `ExportPart`

Artifact under test: `scripts/build.sh` output, wasm sha256
`6c0b52223c47178289eb40c53a3e6b639076b032e4a12d83bd837a748b58d82d` (7,776,237 bytes).
Three independent cold builds (two concurrent, one from the final trimmed tree) produced identical wasm and js.
Reference: the previously deployed `occt-import-js.v2.wasm` build (never modified).
Machine: Apple Silicon, Node 20. Fixtures: 113 private STEP/IGES test files (1,268 meshes; not published) plus 14 BREP files
derived from the reference's own `ExportPart`. Per-file reports are kept privately.

There was no source for the two custom exports anywhere, so both were reverse-engineered from the
reference's output. The schema in `docs/reference-behaviour.md` is what the comparisons below pin down.

## Results

| Check | Scope | Result |
|---|---|---|
| Stock readers (Phase 1 re-run, now incl. `partId`) | 235 comparisons (all fixtures, size-adaptive + default params, BREP incl.) | 235 identical, all bit-identical (positions, indices, normals, face ranges, colours, tree, part ids) |
| `TessellateWithTopology`, full output | 113 fixtures; 116,803 vertices, 176,987 edges, 62,883 faces | **113 identical**: every field of `root`, `meshes` (exact hashes) and `topology` (ids, `partId`, adjacency, kinds, curve kinds, tolerances, all sample arrays, analytic blocks), 0 numeric deviation, same key order. 105 of them additionally diffed live, element by element, over every mesh array: 0 differences |
| `TessellateWithTopology`, BREP sources | 14 BREP files (single/multi solid, shells, loose faces, solid+shell, whole assembly) | 14 identical |
| Sheet-metal detection + unfold | an external sheet-metal analysis module (detect, unfold, flat pattern, blank report, DXF) run on both outputs, k = 0.33 and 0.44 | **113 identical**. 24 fixtures detected as sheet metal (22 unfolded, 2 rejected the same way), 44 DXF documents (2.4 M chars) identical |
| `ExportPart` re-import | 127 sources, 693 exports (231 each of STEP, IGES, BREP), parts sampled per file (first, last, spread, plus one assembly node), each export re-imported with the **reference** wasm | **693 identical**: mesh/vertex/edge/face/triangle counts, bounding box, area, volume, face/edge/curve-kind histograms (tolerance 1e-9, in practice exact) |
| `ExportPart` file bytes | same 693 exports | BREP 231/231 byte-identical; STEP 94/231 and IGES 122/231 byte-identical; all remaining STEP/IGES files are identical once timestamps and product names / entity labels are masked (see difference 1) |
| Options / error strings / edge cases | 148 calls (extension aliases, `mesh` precedence, units, deflection oddities, part-id matrix, bad input) on fresh modules | 148 identical, including thrown `BindingError`s and result keys |
| Console output | STEP/IGES import, failed import, STEP/IGES/BREP exports | identical text (including `temp_part_export_<n>` numbering) |

## Size and load time (quiet machine, interleaved, medians)

| | reference | rebuilt |
|---|---:|---:|
| wasm | 7,776,754 | 7,776,237 (-517 B) |
| wasm gzip -9 | 3,171,059 | 3,169,292 |
| wasm brotli -11 | 2,357,341 | 2,354,056 |
| js glue | 97,767 | 97,877 (+110 B) |
| module load (compile + instantiate), Node | 9.9 ms (min 9.6) | 11.0 ms (min 9.8) |
| `TessellateWithTopology`, four test files (simple STEP part, small assembly, IGES surface model, medium STEP part) | 107 / 416 / 111 / 515 ms | 107 / 419 / 110 / 517 ms |
| `ExportPart` STEP, same four files | 19 / 128 / 44 / 222 ms | 19 / 127 / 44 / 221 ms |

Load time is within noise. Browser load time was not measured (Node only).

## Every difference found, however small

1. **`ExportPart` product names and entity labels (cosmetic, history-dependent in the reference).**
   For STEP/IGES sources the reference names the STEP `PRODUCT` / IGES `402` label + `406` property
   `SOLID`/`COMPOUND`/`FACE` on the first export in a module, but later exports of the same part get
   `Colors` or `=>[0:1:1:n]` depending on earlier calls. This build always gives the first-call names.
   Affects 137/231 STEP and 109/231 IGES sampled exports; geometry is identical in all of them.
   BREP sources and BREP output are unaffected.
2. **Timestamps** in STEP `FILE_NAME` and IGES global section differ by the export time (inherent).
3. **`AnalyzeSheetMetal` is not exported** (requested). All other Embind exports are present; the
   export order is the same.
4. **Binary**: wasm is 517 bytes smaller, js glue 110 bytes larger (different bindings and
   toolchain build).
5. **Reference memory-safety defect not reproduced**: see item 7 in the bug list below.

That is all: no field, array element, id, ordering, error string or console line differed in any other
comparison.

## Reference behaviour that looks like a bug (reproduced, NOT fixed)

Full detail and evidence in `docs/reference-behaviour.md`.

1. Every circle edge: `sweepAngleRad = 2π`, `isFullCircle = true`, even for arcs (40,666 of 40,666).
2. `closed` is `false` on every edge (176,987 of 176,987).
3. `kind: "tangent"` is never produced; all two-face edges are `"sharp"`.
4. Free edges are `"boundary"` with `adjacentFaceIds: []`.
5. `topology.faces` is in node-traversal order, not mesh order: for a part with a solid
   and a shell in one node, a consumer that pairs `faces[]` with per-mesh triangle ranges by position
   mis-attributes faces, and a count-only consistency check does not notice because the counts agree.
6. Entity scope differs between sources: shared vertices are listed once per node for STEP/IGES but
   duplicated per mesh for BREP (192 vs 598 vertices for the same geometry).
7. The reference wasm is not memory-safe. A run of `TessellateWithTopology`/`ExportPart` calls on one
   module instance ends in `null function or function signature mismatch` /
   `table index is out of bounds` inside a later `ExportPart`, but only for some heap layouts. The
   layout shifts with the length of the launching script's path (Emscripten copies `process.argv[1]`
   into the environment strings). Observed: the same sequence trapped in the reference for script
   paths of 125-132 characters (8 of 8) and in the benchmark script (6 of 6 runs), and did not trap
   at lengths 133-172 (40 of 40) or from `compare/reference-trap-repro.js` (74 characters). The
   rebuilt module never trapped in any of ~70 runs. Repro: `node compare/reference-trap-repro.js`
   copied to a path of the right length. Very likely the same root cause as the history-dependent
   names in difference 1.
8. Non-numeric deflection (`'abc'`, `{}`) traps the module; `null` deflection is silently `0`.
9. A `mesh` key replaces the top-level options entirely instead of merging.
10. BREP-sourced `ExportPart` re-exports the importer's triangulation (29 KB -> 273 KB).

## Not exercised by any fixture (equality unverified)

Edges shared by more than two faces; edges without vertices; BREP with a solid plus loose faces;
non-millimetre units beyond one probe; browser (non-Node) behaviour.
