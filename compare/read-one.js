'use strict';
// usage: node read-one.js <oracle|rebuilt> <file> [paramsMode: app|default]
// Prints one JSON line summarising ReadStep/Iges/BrepFile for the file.
const fs = require('fs');
const L = require('./lib');
(async () => {
  const [variant, file, pmode = 'sized'] = process.argv.slice(2);
  const ext = L.canonExt(L.extOf(file));
  const bytes = new Uint8Array(fs.readFileSync(file));
  const { mod, loadMs } = await L.loadModule(variant);
  const params = pmode === 'default' ? null : L.testReadParams(bytes.length);
  const fn = { step: 'ReadStepFile', iges: 'ReadIgesFile', brep: 'ReadBrepFile' }[ext];
  const t0 = process.hrtime.bigint();
  let res, err = null;
  try { res = mod[fn](bytes, params); } catch (e) { err = String(e && e.message || e); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (err || !res) { console.log(JSON.stringify({ file, ok: false, threw: err, ms })); return; }
  if (!res.success) { console.log(JSON.stringify({ file, ok: false, success: false, keys: Object.keys(res), ms })); return; }
  const meshes = L.summariseMeshes(res.meshes);
  console.log(JSON.stringify({
    file, ok: true, ms, loadMs, keys: Object.keys(res),
    nMeshes: meshes.length,
    root: L.stripPartIds(res.root),
    rootPartIds: L.collectPartIds(res.root),
    meshes,
  }));
})().catch((e) => { console.log(JSON.stringify({ ok: false, fatal: String(e && e.stack || e) })); });
