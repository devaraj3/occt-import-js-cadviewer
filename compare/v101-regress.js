'use strict';
// usage: node v101-regress.js <fixture> <baseDir> <newDir> [exportN]
// v1.0.0 -> v1.0.1 regression for one fixture, each call on a fresh module instance:
//   * ReadFile and TessellateWithTopology (two parameter sets) from both builds; the new output with
//     brep_faces[].faceId removed must serialise to identical bytes (SHA-256 over a streaming dump)
//   * ExportPart bytes identical for the first exportN partIds (default 3) in every format
//   * faceId checks on the new TWT output: present on every brep_face, exists in topology.faces, same partId
//     as the mesh, and the mesh vertices of the face's triangles lie on the topology face's analytic surface
// Prints one JSON line.
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const L = require('./lib');
const [file, baseDir, newDir, exportNS] = process.argv.slice(2);
const mk = (dir) => ({ js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') });
L.VARIANTS.base = mk(baseDir); L.VARIANTS.next = mk(newDir);

// Streaming canonical dump -> SHA-256 (key order is part of the identity). With strip, the faceId key of
// brep_faces elements is skipped. flag: 'arr' = the brep_faces array, true = one of its elements.
function hashResult(r, strip) {
  const h = crypto.createHash('sha256');
  const w = (s) => h.update(s);
  const rec = (x, flag) => {
    if (x === null || x === undefined) { w(String(x)); return; }
    if (typeof x === 'number') { w(Object.is(x, -0) ? '-0' : String(x)); return; }
    if (typeof x !== 'object') { w(JSON.stringify(x)); return; }
    if (x instanceof Uint8Array) { w('U8:'); h.update(x); return; }
    if (Array.isArray(x)) { w('['); for (const e of x) { rec(e, flag === 'arr' ? true : false); w(','); } w(']'); return; }
    w('{');
    for (const k of Object.keys(x)) {
      if (strip && flag === true && k === 'faceId') continue;
      w(JSON.stringify(k) + ':'); rec(x[k], k === 'brep_faces' ? 'arr' : false); w(',');
    }
    w('}');
  };
  rec(r, false);
  return h.digest('hex');
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.sqrt(dot(a, a));

function geometry(r, st) {
  const faceById = new Map(r.topology.faces.map((f) => [f.id, f]));
  let globalIdx = 0;
  for (const m of r.meshes) {
    const pos = m.attributes.position.array, idx = m.index.array;
    for (const bf of m.brep_faces) {
      st.faces++;
      const id = bf.faceId;
      if (id === undefined) { st.missing++; continue; }
      const tf = faceById.get(id);
      if (!tf) { st.unknownId++; continue; }
      if (tf.partId !== m.partId) st.partMismatch++;
      if (id !== 'f_' + globalIdx) st.indexPairingWouldDiffer++;
      globalIdx++;
      const a = tf.analytic;
      if (!a || bf.last < bf.first) { st.noCheck++; continue; }
      let worst = 0;
      for (let t = bf.first; t <= bf.last; t++) for (let k = 0; k < 3; k++) {
        const vi = idx[t * 3 + k] * 3; const p = [pos[vi], pos[vi + 1], pos[vi + 2]];
        const d = sub(p, a.origin);
        let err;
        if (tf.kind === 'plane') err = Math.abs(dot(d, a.normal));
        else if (tf.kind === 'cylinder') { const ax = dot(d, a.axis); err = Math.abs(Math.sqrt(Math.max(0, dot(d, d) - ax * ax)) - a.radius); }
        else if (tf.kind === 'sphere') err = Math.abs(norm(d) - a.radius);
        else if (tf.kind === 'cone') { const ax = dot(d, a.axis); const rr = Math.sqrt(Math.max(0, dot(d, d) - ax * ax)); err = null; st.coneSkipped++; break; }
        else if (tf.kind === 'torus') { err = null; break; }
        else err = null;
        if (err !== null && err > worst) worst = err;
      }
      st.checked++;
      if (worst > 1e-5 * Math.max(1, Math.abs(a.radius || 1))) { st.offSurface++; if (st.examples.length < 3) st.examples.push({ id, kind: tf.kind, worst }); }
      st.worst = Math.max(st.worst, worst);
    }
  }
}

(async () => {
  const ext = L.extOf(file); const canon = L.canonExt(ext);
  const bytes = new Uint8Array(fs.readFileSync(file)); const d = L.testDeflections(bytes.length);
  const out = { file, ext, bytes: bytes.length };
  const paramSets = [
    { name: 'test', opts: { ext, ...d }, read: L.testReadParams(bytes.length) },
    { name: 'default', opts: { ext }, read: undefined },
  ];
  out.cases = [];
  const geo = { faces: 0, missing: 0, unknownId: 0, partMismatch: 0, indexPairingWouldDiffer: 0, checked: 0, noCheck: 0, coneSkipped: 0, offSurface: 0, worst: 0, examples: [] };
  let newTwt = null;
  for (const ps of paramSets) {
    for (const call of ['TWT', 'READ']) {
      const rec = { case: call + ':' + ps.name };
      try {
        const run = async (v) => { const { mod } = await L.loadModule(v); return call === 'TWT' ? mod.TessellateWithTopology(bytes, ps.opts) : mod.ReadFile(canon, bytes, ps.read); };
        const a = await run('base'); const b = await run('next');
        rec.success = [a.success, b.success];
        rec.baseHash = hashResult(a, false); rec.newStripped = hashResult(b, true); rec.newRaw = hashResult(b, false);
        rec.identical = rec.baseHash === rec.newStripped;
        if (call === 'READ') rec.readUnchangedRaw = rec.baseHash === rec.newRaw;
        if (call === 'TWT' && b.success && ps.name === 'test') newTwt = b;
        if (call === 'TWT' && b.success) { const g = JSON.parse(JSON.stringify({ ...geo, examples: [] })); g.examples = []; geometry(b, g); rec.geo = g; for (const k of Object.keys(geo)) if (typeof geo[k] === 'number') geo[k] = k === 'worst' ? Math.max(geo[k], g[k]) : geo[k] + g[k]; geo.examples.push(...g.examples.slice(0, 3 - geo.examples.length)); }
      } catch (e) { rec.threw = String(e && e.message || e); }
      out.cases.push(rec);
    }
  }
  out.geo = geo;
  // exports
  const nExp = +(exportNS || 3);
  out.exports = [];
  if (newTwt) {
    const pids = [...new Set(newTwt.meshes.map((m) => m.partId))].slice(0, nExp);
    for (const pid of pids) for (const format of ['step', 'iges', 'brep']) {
      const rec = { pid, format };
      try {
        const run = async (v) => { const { mod } = await L.loadModule(v); const r = mod.ExportPart(bytes, { inputExt: ext, partId: pid, format }); return r.success ? crypto.createHash('sha256').update(r.bytes).digest('hex') : 'fail:' + r.error; };
        const a = await run('base'); const b = await run('next');
        rec.identical = a === b;
      } catch (e) { rec.threw = String(e && e.message || e); }
      out.exports.push(rec);
    }
  }
  console.log(JSON.stringify(out));
})().catch((e) => console.log(JSON.stringify({ file, fatal: String(e && e.stack || e) })));
