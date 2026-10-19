'use strict';
// The fixtures folder may have no .brep files. Derive some from the oracle's ExportPart(format:'brep')
// (first part of a few small STEP/IGES fixtures) so ReadBrepFile is exercised too.
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { listFixtures } = require('./fixtures');
(async () => {
  const outDir = path.join(L.WORK, 'fixtures-extra'); fs.mkdirSync(outDir, { recursive: true });
  const { mod } = await L.loadModule('oracle');
  const cands = listFixtures().filter((f) => !f.includes('fixtures-extra') && fs.statSync(f).size < 3e6);
  let n = 0;
  for (const f of cands) {
    if (n >= 8) break;
    const ext = L.extOf(f); const bytes = new Uint8Array(fs.readFileSync(f));
    let r; try { r = mod.TessellateWithTopology(bytes, { inputExt: ext, ext, linearDeflection: 0.04, angularDeflection: 0.028 }); } catch (e) { continue; }
    if (!r || !r.success || !r.meshes.length) continue;
    const pid = r.meshes[0].partId;
    const e = mod.ExportPart(bytes, { inputExt: ext, partId: pid, format: 'brep' });
    if (!e.success) continue;
    const name = 'brep_' + String(n).padStart(2, '0') + '_' + path.basename(f).replace(/[^A-Za-z0-9._-]/g, '_') + '.brep';
    fs.writeFileSync(path.join(outDir, name), Buffer.from(e.bytes)); n++;
  }
  console.log('wrote', n, 'brep fixtures to', outDir);
})();
