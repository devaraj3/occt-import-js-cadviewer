# Phase 1 verification summary (stock readers)

The stock readers (`ReadStepFile`, `ReadIgesFile`, `ReadBrepFile`) were compared with the reference
runtime on a private corpus (121 STEP/IGES files and 14 BREP files; with size-adaptive parameters and,
for files under 1.5 MB, with default parameters): 235 comparisons.

Compared per file: success flag, result keys, node tree (names, mesh indices, part ids), mesh count,
per-mesh name / colour / vertex / normal / triangle / face-range counts, per-mesh bounding box
(tolerance 1e-6), and SHA-1 of the raw position, index, normal and face-range arrays.

Result: 235 of 235 identical, all bit-identical, none failing in either build.
The per-file table is not published (the corpus is private); `compare/phase1.js` regenerates it.
