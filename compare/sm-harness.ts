// Thin adapter, bundled at runtime with an external sheet-metal analysis module (see build-sm-harness.js).
// This file contains none of that module's code; it only calls its exported functions on an engine result.
// Feeds a raw TessellateWithTopology result to the external module's detect / unfold / export functions.
import {
  buildDxfFileName,
  buildFlatPatternDxf,
  buildRolledRingDxf,
  buildSheetMetalInputFromTopology,
  buildUnfoldEdgesFromTopology,
  computeBlankReport,
  detectSheetMetal,
  unfoldSheetMetal,
} from "@app/utils/sheet-metal";
import { buildFlatDrawModel } from "@app/utils/sheet-metal/flat-draw-model";

const f32 = (x: any) => (x instanceof Float32Array ? x : new Float32Array(x ?? []));
const u32 = (x: any) => (x instanceof Uint32Array ? x : new Uint32Array(x ?? []));

function plain(v: any): any {
  return JSON.parse(
    JSON.stringify(v, (_k, val) => {
      if (val instanceof Map) return { __map: [...val.entries()] };
      if (val instanceof Set) return { __set: [...val.values()] };
      if (ArrayBuffer.isView(val)) return { __ta: val.constructor.name, v: Array.from(val as any) };
      if (typeof val === "number" && !Number.isFinite(val)) return { __num: String(val) };
      return val;
    }),
  );
}

export function analyze(raw: any, kFactor: number, partName = "part") {
  const rawTopo = raw.topology ?? raw;
  const rawFaces = Array.isArray(rawTopo?.faces) ? rawTopo.faces : [];
  const rawEdges = Array.isArray(rawTopo?.edges) ? rawTopo.edges : [];
  const rawVertices = Array.isArray(rawTopo?.vertices) ? rawTopo.vertices : [];
  const rawMeshes = (Array.isArray(raw.meshes) ? raw.meshes : []).map((m: any) => ({
    positions: f32(m?.attributes?.position?.array),
    indices: u32(m?.index?.array),
    brepFaces: (Array.isArray(m?.brep_faces) ? m.brep_faces : []).map((r: any) => ({
      first: Number(r?.first) || 0,
      last: Number(r?.last) || 0,
    })),
  }));

  const built = buildSheetMetalInputFromTopology(rawFaces, rawEdges, rawMeshes);
  const detection = detectSheetMetal(built.faces, built.edges, built.bboxDims, built.raycastGeometry);
  const out: any = { faceAlignmentWarning: built.faceAlignmentWarning, bboxDims: built.bboxDims, detection: plain(detection) };
  if (!detection.isSheetMetal) return out;

  const unfoldEdges = buildUnfoldEdgesFromTopology(rawEdges, rawVertices);
  const unfold = unfoldSheetMetal(built.faces, unfoldEdges, detection, { kFactor, skin: "outer" });
  out.unfold = plain(unfold);
  if (unfold.ok) {
    const meta = { partName, thicknessMM: detection.thicknessMM ?? 0, kFactor };
    const buildDxf = (m: any) => (unfold.kind === "flange_tree" ? buildFlatPatternDxf(unfold, m) : buildRolledRingDxf(unfold, m));
    out.dxf = buildDxf(meta);
    out.dxfCutOnly = buildDxf({ ...meta, layers: "cut_only" });
    out.dxfName = buildDxfFileName(meta);
    out.flat = plain(buildFlatDrawModel(unfold));
    out.report = plain(computeBlankReport(unfold, { thicknessMM: meta.thicknessMM, bendCount: detection.bendCount }));
  }
  return out;
}
