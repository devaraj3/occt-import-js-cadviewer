'use strict';
// usage: node conformance.js <rebuiltDir>
// Replays option / error / edge-case probes on a fresh oracle module and a fresh rebuilt module
// and compares the observable outcome of each call.
const fs = require('fs'); const path = require('path'); const os = require('os');
const L = require('./lib');
const dir = process.argv[2] || 'dist';
L.VARIANTS.rebuilt = { js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') };
// Inputs: FX_SIMPLE_STEP (single-solid STEP), FX_ASSEMBLY_STEP (STEP assembly with >= 5 components), FX_IGES (IGES).
// A BREP input is derived from the assembly's first component with the reference's own ExportPart (see main()).
const readFx = (name) => new Uint8Array(fs.readFileSync(L.requireEnv(name)));
const flange = readFx('FX_SIMPLE_STEP');
const knuckle = readFx('FX_ASSEMBLY_STEP');
const part89 = readFx('FX_IGES');
let brep = new Uint8Array(0);
const garbage = new Uint8Array([1, 2, 3, 4]);
const summ = (r) => {
  if (!r || typeof r !== 'object') return { raw: String(r) };
  const o = { success: r.success, error: r.error, keys: Object.keys(r).join() };
  if (r.format !== undefined) o.format = r.format;
  if (r.bytes) { o.bytesCtor = r.bytes.constructor.name; o.bytesNonEmpty = r.bytes.length > 0; }
  if (r.meshes) { o.meshes = r.meshes.map((m) => [m.name, m.partId, m.attributes.position.array.length, m.index.array.length]); o.root = JSON.stringify(r.root);
    if (r.topology) o.topo = [r.topology.vertices.length, r.topology.edges.length, r.topology.faces.length, JSON.stringify(r.topology.faces.slice(0, 2)), JSON.stringify(r.topology.edges[0] && r.topology.edges[0].kind)]; }
  return o;
};
const cases = [];
function buildCases() {
const twt = (name, buf, opts) => cases.push({ name: 'TWT ' + name, run: (m) => m.TessellateWithTopology(buf, opts) });
const exp = (name, buf, opts) => cases.push({ name: 'EXP ' + name, run: (m) => m.ExportPart(buf, opts) });
const base = { ext: 'step', linearDeflection: 0.04, angularDeflection: 0.028 };
twt('ok step', flange, base);
twt('inputExt only', flange, { inputExt: 'step', linearDeflection: 0.04, angularDeflection: 0.028 });
twt('ext wins over inputExt', flange, { ext: 'step', inputExt: 'iges' });
twt('inputExt used when ext missing/null', flange, { ext: null, inputExt: 'step' });
for (const e of ['STEP', 'Step', 'stp', 'STP', 'igs', 'iges', 'brep', 'brp', 'xt', '', ' step', '.step']) twt('ext=' + JSON.stringify(e), flange, { ext: e });
twt('iges data as igs', part89, { ext: 'igs' }); twt('iges data as IGES', part89, { ext: 'IGES' }); twt('brep data', brep, { ext: 'brep' });
twt('ext 5 (non-string)', flange, { ext: 5 }); twt('ext array', flange, { ext: ['step'] }); twt('ext object', flange, { ext: {} });
twt('no options', flange, undefined); twt('null options', flange, null); twt('string options', flange, 'step'); twt('empty options', flange, {});
twt('garbage bytes', garbage, { ext: 'step' }); twt('empty bytes', new Uint8Array(0), { ext: 'step' }); twt('Array bytes', Array.from(flange.slice(0, 40)), { ext: 'step' });
twt('ArrayBuffer bytes', flange.buffer.slice(flange.byteOffset, flange.byteOffset + flange.byteLength), { ext: 'step' });
twt('undefined bytes', undefined, { ext: 'step' }); twt('step data as iges', flange, { ext: 'iges' }); twt('step data as brep', flange, { ext: 'brep' });
twt('defaults (no deflection)', flange, { ext: 'step' });
twt('only lin .04', flange, { ext: 'step', linearDeflection: 0.04 }); twt('only ang .028', flange, { ext: 'step', angularDeflection: 0.028 });
twt('string deflection', flange, { ext: 'step', linearDeflection: '0.04', angularDeflection: 0.028 });
twt('mesh only', flange, { ext: 'step', mesh: { linearDeflection: 0.04, angularDeflection: 0.028 } });
twt('mesh replaces top-level', flange, { ext: 'step', linearDeflection: 0.04, angularDeflection: 0.028, mesh: { linearDeflection: 0.2, angularDeflection: 0.3 } });
twt('mesh null', flange, { ext: 'step', linearDeflection: 0.04, mesh: null }); twt('mesh string', flange, { ext: 'step', linearDeflection: 0.04, mesh: 'x' });
twt('mesh lin only', flange, { ext: 'step', linearDeflection: 0.04, mesh: { linearDeflection: 0.2 } }); twt('mesh ang only', flange, { ext: 'step', mesh: { angularDeflection: 0.1 } });
twt('lin null', flange, { ext: 'step', angularDeflection: 2, linearDeflection: null }); twt('lin 0', flange, { ext: 'step', angularDeflection: 2, linearDeflection: 0 });
twt('lin -1', flange, { ext: 'step', angularDeflection: 2, linearDeflection: -1 }); twt('lin true', flange, { ext: 'step', angularDeflection: 2, linearDeflection: true });
twt('lin NaN string (oracle traps)', flange, { ext: 'step', angularDeflection: 2, linearDeflection: 'abc' }); twt('lin {} (oracle traps)', flange, { ext: 'step', angularDeflection: 2, linearDeflection: {} });
twt('absolute_value', flange, { ext: 'step', linearDeflection: 0.04, angularDeflection: 0.028, linearDeflectionType: 'absolute_value' });
twt('mesh absolute_value', flange, { ext: 'step', mesh: { linearDeflectionType: 'absolute_value', linearDeflection: 0.04, angularDeflection: 0.028 } });
twt('unit inch', flange, { ext: 'step', linearUnit: 'inch' }); twt('unit meter', flange, { ext: 'step', linearUnit: 'meter' }); twt('mesh unit inch', flange, { ext: 'step', mesh: { linearUnit: 'inch' } });
twt('unit centimeter top + mesh mm', flange, { ext: 'step', linearUnit: 'centimeter', mesh: { linearUnit: 'millimeter' } });
twt('assembly', knuckle, base); twt('iges parts', part89, { ext: 'iges', linearDeflection: 0.04, angularDeflection: 0.028 });
const okx = { inputExt: 'step', partId: 'xcf:0:1:1:1', format: 'step' };
exp('ok', flange, okx); exp('ext instead of inputExt', flange, { ext: 'step', partId: 'xcf:0:1:1:1', format: 'step' });
exp('missing inputExt', flange, { partId: 'xcf:0:1:1:1', format: 'step' }); exp('missing partId', flange, { inputExt: 'step', format: 'step' }); exp('missing format', flange, { inputExt: 'step', partId: 'xcf:0:1:1:1' });
for (const k of ['inputExt', 'partId', 'format']) exp('null ' + k, flange, { ...okx, [k]: null });
exp('no options', flange, undefined); exp('null options', flange, null); exp('string options', flange, 'x');
exp('empty partId', flange, { ...okx, partId: '' }); exp('padded partId', flange, { ...okx, partId: ' xcf:0:1:1:1 ' });
exp('numeric partId', flange, { ...okx, partId: 5 }); exp('numeric format', flange, { ...okx, format: 3 }); exp('numeric inputExt', flange, { ...okx, inputExt: 7 });
for (const f of ['STEP', 'stp', 'igs', 'iges', 'IGES', 'brep', 'BREP', 'brp', 'stl', '', 'xyz']) exp('format=' + JSON.stringify(f), flange, { ...okx, format: f });
exp('bad ext', flange, { ...okx, inputExt: 'xyz' }); exp('empty ext', flange, { ...okx, inputExt: '' }); exp('ext iges on step', flange, { ...okx, inputExt: 'iges' }); exp('ext brep on step', flange, { ...okx, inputExt: 'brep' });
exp('garbage bytes', garbage, okx); exp('empty bytes', new Uint8Array(0), okx); exp('Array bytes', [1, 2, 3], okx);
exp('junk fmt + garbage bytes', garbage, { ...okx, format: 'stl' }); exp('junk fmt + bad part', flange, { ...okx, format: 'stl', partId: 'nope' }); exp('bad part + garbage', garbage, { ...okx, partId: 'nope' });
exp('bad ext + numeric part', flange, { ...okx, inputExt: 'xyz', partId: 5 });
for (const p of ['xcf:root', 'xcf:', 'xcf', '0:1:1:1', 'XCF:0:1:1:1', 'xcf:0:1:1', 'xcf:0:1', 'xcf:0', 'xcf:0:1:2', 'xcf:0:1:1:2', 'xcf:0:1:1:1:1', 'xcf:0:1:1:1:', 'xcf:garbage', 'xcf:0:1:1:1:x', 'brep:root', 'brep:solid:0']) exp('flange part ' + p, flange, { ...okx, partId: p });
for (const p of ['xcf:0:1:1:1', 'xcf:0:1:1:1:1', 'xcf:0:1:1:1:2', 'xcf:0:1:1:2', 'xcf:0:1:1:6', 'xcf:0:1:1:7', 'xcf:0:1:1', 'xcf:0:1:1:1:5', 'xcf:0:1:1:1:6']) exp('knuckle part ' + p, knuckle, { ...okx, partId: p });
for (const p of ['brep:root', 'brep:solid:0', 'brep:solid:00', 'brep:solid:1', 'brep:solid:-1', 'brep:solid:x', 'brep:solid', 'brep:solid:', 'brep:shell:0', 'brep:faces:0', 'brep:faces:1', 'xcf:0:1:1:1:1', 'BREP:ROOT']) for (const f of ['step', 'brep']) exp(`brep input ${p} ${f}`, brep, { inputExt: 'brep', partId: p, format: f });
exp('part89 iges input', part89, { inputExt: 'iges', partId: 'xcf:0:1:1:1', format: 'iges' }); exp('part89 iges input to brep', part89, { inputExt: 'igs', partId: 'xcf:0:1:1:2', format: 'brep' });

}

(async () => {
  {
    const { mod } = await L.loadModule('oracle');
    const r = mod.TessellateWithTopology(knuckle, { ext: path.extname(process.env.FX_ASSEMBLY_STEP).slice(1), linearDeflection: 0.1, angularDeflection: 0.5 });
    brep = new Uint8Array(mod.ExportPart(knuckle, { inputExt: path.extname(process.env.FX_ASSEMBLY_STEP).slice(1), partId: r.meshes[0].partId, format: 'brep' }).bytes);
  }
  buildCases();
  let same = 0; const diffs = [];
  for (const c of cases) {
    const out = {};
    for (const v of ['oracle', 'rebuilt']) {
      const { mod } = await L.loadModule(v);
      let r; try { r = summ(c.run(mod)); } catch (e) { r = { threw: String(e && e.message || e).replace(/\s+/g, ' ').slice(0, 80) }; }
      out[v] = r;
    }
    const a = JSON.stringify(out.oracle), b = JSON.stringify(out.rebuilt);
    if (a === b) same++; else diffs.push({ name: c.name, oracle: out.oracle, rebuilt: out.rebuilt });
  }
  console.log(`cases ${cases.length}, identical ${same}, different ${diffs.length}`);
  for (const d of diffs) console.log('DIFF', d.name, '\n  oracle ', JSON.stringify(d.oracle).slice(0, 400), '\n  rebuilt', JSON.stringify(d.rebuilt).slice(0, 400));
})();
