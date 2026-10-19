'use strict';
// Shared helpers for the oracle-vs-rebuild comparison harness.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
// Configuration (all through the environment; nothing machine- or fixture-specific is hard-coded):
//   OCCT_ORACLE_DIR    directory holding occt-import-js.v2.{js,wasm}, the reference runtime (default ./oracle)
//   OCCT_WORK_DIR      scratch/results directory, keep it OUTSIDE the repo if fixtures are private (default ./work)
//   OCCT_FIXTURES_DIR  directory tree of STEP/IGES/BREP files to test with (required by fixture-driven scripts)
//   CAD_APP_DIR        optional: a consumer checkout providing a sheet-metal analysis module, run by the sheet-metal check
//   FX_SIMPLE_STEP, FX_ASSEMBLY_STEP, FX_IGES, FX_STEP_MEDIUM  individual files used by conformance/bench/trap repro
const ORACLE_DIR = path.resolve(process.env.OCCT_ORACLE_DIR || path.join(ROOT, 'oracle'));
const WORK = path.resolve(process.env.OCCT_WORK_DIR || path.join(ROOT, 'work'));
function requireEnv(name) { const v = process.env[name]; if (!v) { console.error('Set ' + name + ' (see compare/lib.js)'); process.exit(2); } return v; }
const VARIANTS = {
  // reference runtime to compare against (never modified)
  oracle: { js: path.join(ORACLE_DIR, 'occt-import-js.v2.js'), wasm: path.join(ORACLE_DIR, 'occt-import-js.v2.wasm') },
  // rebuilt from this repo (docker build --output dist)
  rebuilt: { js: path.join(ROOT, 'dist/occt-import-js.js'), wasm: path.join(ROOT, 'dist/occt-import-js.wasm') },
};

async function loadModule(variant) {
  const v = VARIANTS[variant];
  if (!v) throw new Error('unknown variant ' + variant);
  const factory = require(v.js);
  const t0 = process.hrtime.bigint();
  const mod = await factory({ locateFile: () => v.wasm });
  const loadMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { mod, loadMs };
}

// Test meshing parameters: coarser for bigger files so the whole corpus stays fast. (Our own choice;
// any values work as long as both runtimes get the same ones.)
function testDeflections(byteLength) {
  const lin = byteLength > 10e6 ? 0.5 : byteLength > 2e6 ? 0.1 : 0.03;
  return { linearDeflection: lin, angularDeflection: 0.4 };
}
function testReadParams(byteLength) {
  const d = testDeflections(byteLength);
  return { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', ...d };
}

function extOf(file) { return path.extname(file).slice(1).toLowerCase(); }
function canonExt(ext) {
  if (ext === 'step' || ext === 'stp') return 'step';
  if (ext === 'iges' || ext === 'igs') return 'iges';
  if (ext === 'brep' || ext === 'brp') return 'brep';
  return null;
}

function sha(buf) { return crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16); }
function hashNums(arr, Ctor) {
  if (!arr) return null;
  const t = Ctor.from(arr);
  return sha(Buffer.from(t.buffer, t.byteOffset, t.byteLength));
}
function bbox(pos) {
  const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
    if (pos[i + k] < b[k]) b[k] = pos[i + k];
    if (pos[i + k] > b[3 + k]) b[3 + k] = pos[i + k];
  }
  return pos.length ? b : [0, 0, 0, 0, 0, 0];
}

// Summarise a Read*File / TessellateWithTopology mesh set into comparable scalars.
function summariseMeshes(meshes) {
  return meshes.map((m) => {
    const pos = m.attributes.position.array;
    const idx = m.index.array;
    const nrm = m.attributes.normal ? m.attributes.normal.array : null;
    return {
      name: m.name,
      partId: m.partId === undefined ? undefined : m.partId,
      color: m.color || null,
      nVerts: pos.length / 3,
      nTris: idx.length / 3,
      nNormals: nrm ? nrm.length / 3 : 0,
      nBrepFaces: (m.brep_faces || []).length,
      bbox: bbox(pos),
      hPos: hashNums(pos, Float64Array),
      hIdx: hashNums(idx, Uint32Array),
      hNrm: nrm ? hashNums(nrm, Float64Array) : null,
      hFaces: sha(Buffer.from(JSON.stringify(m.brep_faces || []))),
    };
  });
}
function stripPartIds(node) {
  const o = { name: node.name, meshes: node.meshes, children: (node.children || []).map(stripPartIds) };
  return o;
}
function collectPartIds(node, out = []) {
  out.push(node.partId === undefined ? null : node.partId);
  (node.children || []).forEach((c) => collectPartIds(c, out));
  return out;
}

module.exports = { ROOT, WORK, ORACLE_DIR, requireEnv, VARIANTS, loadModule, testDeflections, testReadParams, extOf, canonExt, summariseMeshes, stripPartIds, collectPartIds, sha, bbox };
