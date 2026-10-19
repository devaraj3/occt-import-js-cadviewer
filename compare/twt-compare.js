'use strict';
// usage: node twt-compare.js <fixtureIndex> <oracleDumpDir> <rebuiltDir|'dist'> [live]
// Runs the rebuilt TessellateWithTopology (typical viewer options) and deep-compares
// topology against the cached oracle dump; meshes via exact SHA-1s. With `live` it also runs
// the oracle in-process and deep-compares every mesh array.
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { makeStats, diff } = require('./deepdiff');
const { listFixtures } = require('./fixtures');
(async () => {
  const [idxS, dumpDir, rebuiltDir, live] = process.argv.slice(2);
  const files = JSON.parse(fs.readFileSync(path.join(dumpDir, 'index.json')));
  const file = files[+idxS];
  const o = JSON.parse(fs.readFileSync(path.join(dumpDir, String(idxS).padStart(3, '0') + '.json')));
  const ext = L.extOf(file); const bytes = new Uint8Array(fs.readFileSync(file)); const d = L.testDeflections(bytes.length);
  const opts = () => ({ inputExt: ext, ext, linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection, mesh: { linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection } });
  L.VARIANTS.rebuilt = { js: path.resolve(rebuiltDir, 'occt-import-js.js'), wasm: path.resolve(rebuiltDir, 'occt-import-js.wasm') };
  const t0 = Date.now(); let loadMs;
  const { mod, loadMs: lm } = await L.loadModule('rebuilt'); loadMs = lm;
  let r, threw = null; const t1 = process.hrtime.bigint();
  try { r = mod.TessellateWithTopology(bytes, opts()); } catch (e) { threw = String(e && e.message || e); }
  const ms = Number(process.hrtime.bigint() - t1) / 1e6;
  const out = { file, idx: +idxS, ms, loadMs, threw };
  if (!r || r.success === false) { out.fail = threw || r.error; console.log(JSON.stringify(out)); return; }
  const st = makeStats();
  diff(o.root, r.root, 'root', st);
  diff(o.meshSummary, L.summariseMeshes(r.meshes), 'meshSummary', st);
  diff(o.meshKeys, r.meshes.map((m) => Object.keys(m)), 'meshKeys', st);
  diff(o.topology, r.topology, 'topology', st);
  diff(o.keys, Object.keys(r), 'resultKeys', st);
  if (live === 'live') {
    const { mod: om } = await L.loadModule('oracle');
    const ro = om.TessellateWithTopology(bytes, opts());
    const st2 = makeStats(); diff(ro, r, 'full', st2); out.liveTotal = st2.total;
    out.liveSample = [...st2.paths.entries()].slice(0, 5).map(([k, v]) => k + ' x' + v.count);
  }
  out.total = st.total;
  out.paths = [...st.paths.entries()].map(([k, v]) => ({ path: k, count: v.count, maxAbs: v.maxAbs, examples: v.examples }));
  out.nEdges = r.topology.edges.length; out.nFaces = r.topology.faces.length; out.nVerts = r.topology.vertices.length;
  console.log(JSON.stringify(out));
})().catch((e) => console.log(JSON.stringify({ fatal: String(e && e.stack || e) })));
