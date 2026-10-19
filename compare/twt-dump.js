'use strict';
// usage: node twt-dump.js <variant> <file> <outFile>
// Runs TessellateWithTopology with typical viewer options and writes topology + mesh summaries.
const fs = require('fs');
const L = require('./lib');
(async () => {
  const [variant, file, out] = process.argv.slice(2);
  const ext = L.extOf(file);
  const bytes = new Uint8Array(fs.readFileSync(file));
  const { mod, loadMs } = await L.loadModule(variant);
  const d = L.testDeflections(bytes.length);
  const t0 = process.hrtime.bigint();
  let r, err = null;
  try {
    r = mod.TessellateWithTopology(bytes, { inputExt: ext, ext, linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection,
      mesh: { linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection } });
  } catch (e) { err = String(e && e.message || e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const o = { file, loadMs, ms, threw: err };
  if (r) {
    o.success = r.success; o.error = r.error; o.keys = Object.keys(r);
    if (r.success !== false) {
      o.root = r.root; o.meshSummary = L.summariseMeshes(r.meshes);
      o.meshKeys = r.meshes.map((m) => Object.keys(m));
      o.topology = r.topology;
    }
  }
  fs.writeFileSync(out, JSON.stringify(o));
})().catch((e) => { fs.writeFileSync(process.argv[4], JSON.stringify({ fatal: String(e && e.stack || e) })); });
