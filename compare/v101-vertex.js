'use strict';
// usage: node v101-vertex.js <fixture> <dir>
// Vertex check: every topology vertex of an edge adjacent to face F must be a node of the mesh triangles
// paired to F by brep_faces[].faceId. Control: the same check when pairing by position (k-th brep_face of
// a part <-> k-th topology face of that part), which is what consumers had to do before v1.0.1.
const fs = require('fs'); const path = require('path'); const L = require('./lib');
const [file, dir] = process.argv.slice(2);
L.VARIANTS.next = { js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') };
(async () => {
  const bytes = new Uint8Array(fs.readFileSync(file)); const d = L.testDeflections(bytes.length);
  const { mod } = await L.loadModule('next');
  const r = mod.TessellateWithTopology(bytes, { ext: L.extOf(file), ...d });
  const T = r.topology; const vById = new Map(T.vertices.map((v) => [v.id, v.point]));
  const need = new Map(); // faceId -> Set(vertexId)
  for (const e of T.edges) for (const f of e.adjacentFaceIds) { if (!need.has(f)) need.set(f, new Set()); for (const v of e.vertexIds) need.get(f).add(v); }
  const tolOK = 1e-4;
  const nodesOf = (m, bf) => { const pos = m.attributes.position.array, idx = m.index.array; const s = []; for (let t = bf.first; t <= bf.last; t++) for (let k = 0; k < 3; k++) { const vi = idx[t * 3 + k] * 3; s.push([pos[vi], pos[vi + 1], pos[vi + 2]]); } return s; };
  const has = (nodes, p) => nodes.some((q) => Math.abs(q[0] - p[0]) < tolOK && Math.abs(q[1] - p[1]) < tolOK && Math.abs(q[2] - p[2]) < tolOK);
  const stat = { faces: 0, byId: { ok: 0, bad: 0 }, byPosition: { ok: 0, bad: 0 }, idsUnique: true };
  const seen = new Set(); const partFaces = new Map();
  for (const f of T.faces) { if (!partFaces.has(f.partId)) partFaces.set(f.partId, []); partFaces.get(f.partId).push(f.id); }
  const cursor = new Map();
  for (const m of r.meshes) for (const bf of m.brep_faces) {
    stat.faces++;
    const nodes = nodesOf(m, bf);
    const check = (fid) => { const vs = need.get(fid); if (!vs || !vs.size) return null; return [...vs].every((v) => has(nodes, vById.get(v))); };
    const a = check(bf.faceId); if (a === true) stat.byId.ok++; else if (a === false) stat.byId.bad++;
    const k = cursor.get(m.partId) || 0; cursor.set(m.partId, k + 1);
    const pid = (partFaces.get(m.partId) || [])[k]; const b = pid ? check(pid) : null;
    if (b === true) stat.byPosition.ok++; else if (b === false) stat.byPosition.bad++;
  }
  console.log(JSON.stringify({ file: path.basename(file), ...stat }));
})();
