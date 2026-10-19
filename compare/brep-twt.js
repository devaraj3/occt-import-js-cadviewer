'use strict';
// usage: node brep-twt.js <rebuiltDir>  -> full deep diff of TessellateWithTopology on every .brep fixture
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { makeStats, diff } = require('./deepdiff');
const dir = process.argv[2] || 'dist';
L.VARIANTS.rebuilt = { js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') };
(async () => {
  const fx = path.join(L.WORK, 'fixtures-extra');
  const files = fs.readdirSync(fx).filter((f) => f.endsWith('.brep')).sort();
  let same = 0;
  for (const f of files) {
    const b = new Uint8Array(fs.readFileSync(path.join(fx, f)));
    const { mod: O } = await L.loadModule('oracle'); const { mod: R } = await L.loadModule('rebuilt');
    const opt = { ext: 'brep', linearDeflection: 0.05, angularDeflection: 0.5 };
    const a = O.TessellateWithTopology(b, opt), r = R.TessellateWithTopology(b, opt);
    const st = makeStats(); diff(a, r, 'full', st);
    if (st.total === 0) same++;
    console.log(st.total === 0 ? 'IDENTICAL' : 'DIFF ' + st.total, f, a.success ? `V${a.topology.vertices.length} E${a.topology.edges.length} F${a.topology.faces.length} meshes${a.meshes.length}` : a.error);
    if (st.total) for (const [k, v] of [...st.paths.entries()].slice(0, 4)) console.log('   ', v.count, k, JSON.stringify(v.examples[0]));
  }
  console.log(`brep fixtures ${files.length}, identical ${same}`);
})();
