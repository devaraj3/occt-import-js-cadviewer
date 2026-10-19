'use strict';
// usage: node v101-geo.js <fixture> <dir> [lin] [ang]
// For every brep_face: error of its mesh vertices against the analytic surface of topology.faces[faceId]
// (median and max), and against every other analytic face of the same part ("best other"), to separate
// "wrong face paired" from "boundary nodes off the surface within edge tolerance".
const fs = require('fs'); const path = require('path'); const L = require('./lib');
const [file, dir, lin, ang] = process.argv.slice(2);
L.VARIANTS.next = { js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
function err(tf, p) {
  const a = tf.analytic; if (!a) return null; const d = sub(p, a.origin);
  if (tf.kind === 'plane') return Math.abs(dot(d, a.normal));
  if (tf.kind === 'cylinder') { const ax = dot(d, a.axis); return Math.abs(Math.sqrt(Math.max(0, dot(d, d) - ax * ax)) - a.radius); }
  if (tf.kind === 'sphere') return Math.abs(Math.sqrt(dot(d, d)) - a.radius);
  return null;
}
(async () => {
  const bytes = new Uint8Array(fs.readFileSync(file)); const ext = L.extOf(file); const d = L.testDeflections(bytes.length);
  const { mod } = await L.loadModule('next');
  const r = mod.TessellateWithTopology(bytes, { ext, linearDeflection: lin ? +lin : d.linearDeflection, angularDeflection: ang ? +ang : d.angularDeflection });
  const byPart = new Map(); for (const f of r.topology.faces) { if (!f.analytic || f.kind === 'cone' || f.kind === 'torus') continue; if (!byPart.has(f.partId)) byPart.set(f.partId, []); byPart.get(f.partId).push(f); }
  const faceById = new Map(r.topology.faces.map((f) => [f.id, f]));
  let n = 0, ownBest = 0, fitsOwnMedian = 0, worse = [];
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1];
  for (const m of r.meshes) {
    const pos = m.attributes.position.array, idx = m.index.array;
    for (const bf of m.brep_faces) {
      const tf = faceById.get(bf.faceId); if (!tf || !tf.analytic || tf.kind === 'cone' || tf.kind === 'torus' || bf.last < bf.first) continue;
      const pts = []; for (let t = bf.first; t <= bf.last; t++) for (let k = 0; k < 3; k++) { const vi = idx[t * 3 + k] * 3; pts.push([pos[vi], pos[vi + 1], pos[vi + 2]]); }
      const own = pts.map((p) => err(tf, p)); const m0 = med(own.slice());
      let best = Infinity, bestId = null;
      for (const c of byPart.get(tf.partId) || []) { const e = med(pts.map((p) => err(c, p))); if (e < best - 1e-12) { best = e; bestId = c.id; } }
      n++;
      if (m0 <= best + 1e-9) ownBest++;
      if (m0 < 1e-6) fitsOwnMedian++; else if (worse.length < 5) worse.push({ id: bf.faceId, kind: tf.kind, ownMedian: m0, ownMax: Math.max(...own), bestOther: bestId, bestOtherMedian: best });
    }
  }
  console.log(JSON.stringify({ file: path.basename(file), faces: n, ownIsBestFit: ownBest, medianOnSurface: fitsOwnMedian, worse }));
})();
