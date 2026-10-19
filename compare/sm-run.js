'use strict';
// usage: node sm-run.js <oracle|DIR> <fixtureIdx> <outFile>
// Runs TessellateWithTopology then the external sheet-metal detection + unfold
// (k = 0.33 and 0.44), writing the full plain-data result.
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { listFixtures } = require('./fixtures');
const harness = require(path.join(L.WORK, 'sm-harness.cjs'));
(async () => {
  const [variant, idxS, out] = process.argv.slice(2);
  const file = JSON.parse(fs.readFileSync(path.join(L.WORK, 'oracle-twt/index.json')))[+idxS];
  const ext = L.extOf(file); const bytes = new Uint8Array(fs.readFileSync(file)); const d = L.testDeflections(bytes.length);
  if (variant !== 'oracle') L.VARIANTS.rebuilt = { js: path.resolve(variant, 'occt-import-js.js'), wasm: path.resolve(variant, 'occt-import-js.wasm') };
  const { mod } = await L.loadModule(variant === 'oracle' ? 'oracle' : 'rebuilt');
  const res = { file, results: {} };
  try {
    const raw = mod.TessellateWithTopology(bytes, { inputExt: ext, ext, linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection, mesh: { linearDeflection: d.linearDeflection, angularDeflection: d.angularDeflection } });
    if (!raw.success) throw new Error('TWT failed: ' + raw.error);
    for (const k of [0.33, 0.44]) {
      try { res.results[k] = harness.analyze(raw, k, path.basename(file)); } catch (e) { res.results[k] = { threw: String(e && e.stack || e).slice(0, 400) }; }
    }
  } catch (e) { res.fatal = String(e && e.message || e); }
  fs.writeFileSync(out, JSON.stringify(res));
})();
