# Reference behaviour that this build reproduces on purpose

The reference wasm (the previously deployed build) has no source we could read, so
`TessellateWithTopology` and `ExportPart` were reverse-engineered from its output. The goal was
*identical output*, so the quirks below are copied as-is. They are listed here so each one can be
fixed deliberately (and consumers adjusted) rather than by accident.

Everything in section 1 looks like a defect in the reference. Section 2 is behaviour that is odd but
plausibly intended. Section 3 lists what no fixture exercised, so equality is unverified.

## 1. Looks like a bug

| # | Behaviour | Evidence |
|---|---|---|
| 1 | Every circle edge reports `analytic.sweepAngleRad = 2π` and `isFullCircle = true`, including arcs. | All 40,666 circle edges in the 113 fixtures; 39,021 of them have distinct start and end vertices. The sample points do trace only the arc. |
| 2 | `closed` is `false` on every edge, including full circles and seam edges. `periodic` is real (`true` for circles, ellipses, periodic B-splines). | 0 of 176k edges had `closed: true`. |
| 3 | `kind` is never `"tangent"` (or `"unknown"`): every two-face edge is `"sharp"`, even tangent fillet edges. | 168,838 `sharp`, 0 `tangent`. |
| 4 | Edges with no adjacent face are labelled `"boundary"` with `adjacentFaceIds: []`. | 4 free circle edges in one large assembly test file. |
| 5 | `topology.faces` follows OCCT traversal order of the node's whole shape, not mesh order. When a node has both a solid mesh and a shell mesh, `faces[]` is not in `brep_faces` order. | A test part with one solid mesh (218 faces) and one shell mesh (96 faces) in the same node: the 96 shell faces come first in `faces[]` but second in the meshes. A consumer that walks `faces[]` and the per-mesh `brep_faces` ranges with one cursor attributes triangle ranges to the wrong faces for such parts; a count-only consistency check does not catch it. Since v1.0.1 `TessellateWithTopology` adds `faceId` (`"f_N"`) to every `brep_faces` entry; pairing by `faceId` is exact and independent of this ordering. |
| 6 | Vertex/edge scope is inconsistent between inputs: per node for STEP/IGES (vertices shared between a node's meshes are listed once), per mesh for BREP (shared vertices duplicated, and entity `partId` is the mesh id). | A 116-shell sheet-metal test part: 192 vertices; the same geometry exported to BREP and re-read: 598. |
| 7 | A non-numeric `linearDeflection` / `angularDeflection` (e.g. `'abc'`, `{}`) makes the wasm trap with `Aborted()` and the module is unusable afterwards. `null` silently becomes `0`. | Probed directly. |
| 8 | `ExportPart` product names (STEP `PRODUCT`) and entity labels (IGES `402` label, `406` property) depend on call history in the process: the same part exports as `SOLID` on the first call and `Colors` (the XCAF colour-table label name) on later ones. | Reproduced on three fresh modules. A fresh XCAF document per call reproduces the first-call behaviour exactly; the later-call names could not be reproduced and are **not** matched. Geometry is unaffected. |
| 9 | When the options object has a `mesh` key, it replaces the top-level mesh options entirely (not merged), so `{ linearDeflection: 0.04, mesh: null }` meshes with the defaults. | Probed. Callers that pass identical values in both places are not affected. |
| 11 | The module is not memory-safe: after a run of calls on one instance a later `ExportPart` can trap (`null function or function signature mismatch`), depending on heap layout (e.g. the launching script's path length). | `compare/reference-trap-repro.js` (copy it to a path 125-132 characters long): the reference traps at those lengths and not at 133-172; the rebuilt module never trapped. |
| 10 | `ExportPart` from a BREP input writes the triangulation the importer created, so the BREP grows (a 29 KB part re-exports at 273 KB). | Same bytes from the reference. |

## 2. Odd but plausibly intended (also reproduced)

* `ext` wins over `inputExt` in `TessellateWithTopology`; `ExportPart` reads `inputExt` only.
* Extensions are case-insensitive and not trimmed; accepted: `step stp iges igs brep`.
* `format` is echoed back lower-cased as given (`stp`, `igs`, `iges`), `stp` and `step` both write STEP, `igs`/`iges` both write IGES.
* `ExportPart` accepts any XCAF label that holds a shape (prototypes, components, assembly roots), but not `xcf:root` or tool labels; BREP ids are `brep:root`, `brep:solid:N`, `brep:shell:N`, `brep:faces:0`.
* `ExportPart` writes STEP/IGES from STEP/IGES sources through the CAF writers on a fresh XCAF document holding the one shape (a located component becomes a two-product assembly, product name = shape type such as `SOLID`/`COMPOUND` or `=>[0:1:1:n]`); BREP sources use the plain `STEPControl_Writer`/`IGESControl_Writer` (flat `ADVANCED_BREP_SHAPE_REPRESENTATION`, default product name `Open CASCADE STEP translator 7.6 <n>`). BREP output is `BRepTools::Write` to a stream (no `DBRep_DrawableShape` header).
* Mesh `partId` equals the owning node's `partId`; ids are `xcf:<label entry>`, `xcf:root`, `brep:root`, `brep:solid|shell|faces:N`.
* Ellipse edges have no `analytic` block; only circles do. Face `analytic` is present for plane, cylinder, cone, sphere, torus only.
* Edge samples per curve type are fixed: line 2, circle 64, ellipse 40, B-spline/Bézier 32, other (incl. degenerated) 20, at `t = first + (last - first) * (i / (n - 1))`.
* Circle `startPoint`/`endPoint` are the edge's vertex coordinates; `midPoint` is the curve point at the mid parameter.
* OCCT console statistics are printed to stdout during STEP export (including `temp_part_export_<n>.step`, `n` counting every export with a valid format).
* Error strings: `Missing required topology options: ext or inputExt`, `Unsupported source extension`, `Failed to load source CAD file`, `Missing required export options`, `Failed to resolve CAD part by partId`, `Failed to export exact CAD shape`. Non-string `ext` / `inputExt` / `partId` / `format` throw `BindingError: Cannot pass non-string to std::string`.

## 3. Not exercised by any fixture (equality unverified)

* Edges shared by more than two faces (non-manifold). This build lists every ancestor face; the reference may cap or reorder.
* Edges with no vertices (`vertexIds` would reference `v_-1` here).
* A BREP containing both a solid and loose faces (`brep:faces:N` numbering beyond `0`, and whether the loose-face unit contains only the loose faces).
* Sources with a non-millimetre unit when `linearUnit` is overridden (checked on one file only).
* STEP exports of parts with colours or names beyond the product name.
