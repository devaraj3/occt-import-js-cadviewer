'use strict';
// usage: node bench.js <rebuiltDir>   (run on a quiet machine)
// Interleaved A/B (oracle, rebuilt) timings: module load, and TessellateWithTopology / ExportPart on a few fixtures.
const fs = require('fs'); const path = require('path'); const os = require('os'); const zlib = require('zlib');
const L = require('./lib');
const dir = process.argv[2] || 'dist';
L.VARIANTS.rebuilt = { js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') };
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const fixtures = ['FX_SIMPLE_STEP', 'FX_ASSEMBLY_STEP', 'FX_IGES', 'FX_STEP_MEDIUM'].map((n) => L.requireEnv(n));
(async () => {
  const out = { sizes: {}, load: {}, twt: {}, exportStep: {} };
  for (const v of ['oracle', 'rebuilt']) {
    const w = fs.readFileSync(L.VARIANTS[v].wasm), j = fs.readFileSync(L.VARIANTS[v].js);
    out.sizes[v] = { wasm: w.length, wasmGzip: zlib.gzipSync(w, { level: 9 }).length, wasmBrotli: zlib.brotliCompressSync(w, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: w.length } }).length, js: j.length };
  }
  // module load (compile + instantiate), alternating
  const loads = { oracle: [], rebuilt: [] };
  for (let i = 0; i < 9; i++) for (const v of ['oracle', 'rebuilt']) loads[v].push((await L.loadModule(v)).loadMs);
  for (const v in loads) out.load[v] = { medianMs: +med(loads[v]).toFixed(1), minMs: +Math.min(...loads[v]).toFixed(1) };
  for (const f of fixtures) {
    // fresh instances per fixture: the reference wasm can corrupt its own state across many calls (see reference-trap-repro.js)
    const mods = { oracle: (await L.loadModule('oracle')).mod, rebuilt: (await L.loadModule('rebuilt')).mod };
    const ext = L.extOf(f); const bytes = new Uint8Array(fs.readFileSync(f)); const d = L.testDeflections(bytes.length);
    const opt = { ext, mesh: { linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection } };
    const t = { oracle: [], rebuilt: [] }, e = { oracle: [], rebuilt: [] };
    mods.oracle.TessellateWithTopology(bytes, opt); mods.rebuilt.TessellateWithTopology(bytes, opt);
    for (let i = 0; i < 5; i++) for (const v of ['oracle', 'rebuilt']) {
      let t0 = process.hrtime.bigint(); mods[v].TessellateWithTopology(bytes, opt); t[v].push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    const r = mods.oracle.TessellateWithTopology(bytes, opt); const pid = r.meshes[0].partId;
    for (let i = 0; i < 5; i++) for (const v of ['oracle', 'rebuilt']) {
      let t0 = process.hrtime.bigint(); mods[v].ExportPart(bytes, { inputExt: ext, partId: pid, format: 'step' }); e[v].push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    const name = path.basename(f);
    out.twt[name] = { oracle: Math.round(med(t.oracle)), rebuilt: Math.round(med(t.rebuilt)) };
    out.exportStep[name] = { oracle: Math.round(med(e.oracle)), rebuilt: Math.round(med(e.rebuilt)) };
  }
  console.log(JSON.stringify(out, null, 1));
})();
