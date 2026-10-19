'use strict';
// Phase 1: rebuilt stock readers vs reference oracle on every fixture.
// usage: node phase1.js [conc]
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { listFixtures } = require('./fixtures'); const { runPool } = require('./pool');
const conc = +(process.argv[2] || 4);
const files = listFixtures();
const jobs = [];
for (const f of files) for (const v of ['oracle', 'rebuilt']) {
  jobs.push({ cmd: 'node', args: [path.join(__dirname, 'read-one.js'), v, f, 'sized'], timeoutMs: 900000, meta: { f, v, mode: 'sized' } });
}
// default-params (null) pass on small files, exercising the stock default path
for (const f of files) if (fs.statSync(f).size < 1.5e6) for (const v of ['oracle', 'rebuilt'])
  jobs.push({ cmd: 'node', args: [path.join(__dirname, 'read-one.js'), v, f, 'default'], timeoutMs: 900000, meta: { f, v, mode: 'default' } });

const tol = 1e-6;
function parse(r) { try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { ok: false, fatal: 'unparseable: ' + (r.stderr || '').slice(0, 200) + (r.timedOut ? ' (timeout)' : '') }; } }
function cmp(o, r) {
  const diffs = []; const notes = [];
  if (o.ok !== r.ok) { diffs.push(`ok ${o.ok} vs ${r.ok}`); return { diffs, notes }; }
  if (!o.ok) { if (JSON.stringify(Object.assign({}, o, { ms: 0 })) !== JSON.stringify(Object.assign({}, r, { ms: 0 }))) notes.push('both failed differently'); return { diffs, notes, bothFail: true }; }
  if (o.nMeshes !== r.nMeshes) diffs.push(`meshes ${o.nMeshes} vs ${r.nMeshes}`);
  if (JSON.stringify(o.root) !== JSON.stringify(r.root)) diffs.push('root tree (names/mesh idx) differs');
  const ko = o.keys.join(), kr = r.keys.join(); if (ko !== kr) diffs.push(`result keys ${ko} vs ${kr}`);
  let maxBb = 0, exact = true;
  for (let i = 0; i < Math.min(o.meshes.length, r.meshes.length); i++) {
    const a = o.meshes[i], b = r.meshes[i];
    for (const k of ['name', 'nVerts', 'nTris', 'nNormals', 'nBrepFaces']) if (a[k] !== b[k]) diffs.push(`mesh${i}.${k} ${a[k]} vs ${b[k]}`);
    if (JSON.stringify(a.color) !== JSON.stringify(b.color)) diffs.push(`mesh${i}.color differs`);
    for (let k = 0; k < 6; k++) maxBb = Math.max(maxBb, Math.abs(a.bbox[k] - b.bbox[k]));
    for (const k of ['hPos', 'hIdx', 'hNrm', 'hFaces']) if (a[k] !== b[k]) exact = false;
  }
  if (JSON.stringify(o.rootPartIds) !== JSON.stringify(r.rootPartIds)) {
    const oHasPid = o.rootPartIds.some((x) => x !== null), rHasPid = r.rootPartIds.some((x) => x !== null);
    if (oHasPid !== rHasPid) notes.push(`partId: oracle=${oHasPid} rebuilt=${rHasPid}`); else diffs.push('node partIds differ');
  }
  for (let i = 0; i < Math.min(o.meshes.length, r.meshes.length); i++) if (o.meshes[i].partId !== r.meshes[i].partId) { if (o.meshes[i].partId !== undefined && r.meshes[i].partId === undefined) { if (!notes.some((n) => n.startsWith('mesh partId'))) notes.push('mesh partId: oracle has, rebuilt lacks'); } else diffs.push(`mesh${i}.partId differs`); }
  if (maxBb > tol) diffs.push(`bbox maxdev ${maxBb}`);
  return { diffs, notes, exact, maxBb };
}
runPool(jobs, conc, (i, r) => process.stderr.write('.')).then((res) => {
  const by = new Map();
  jobs.forEach((j, i) => { const k = j.meta.f + '|' + j.meta.mode; if (!by.has(k)) by.set(k, {}); by.get(k)[j.meta.v] = parse(res[i]); });
  const rows = []; const totals = { n: 0, same: 0, bitExact: 0, diff: 0, bothFail: 0 };
  for (const [k, p] of by) {
    const [f, mode] = k.split('|'); const c = cmp(p.oracle, p.rebuilt); totals.n++;
    if (c.bothFail) totals.bothFail++; else if (c.diffs.length) totals.diff++; else { totals.same++; if (c.exact) totals.bitExact++; }
    rows.push({ f, mode, size: fs.statSync(f).size, o: p.oracle, r: p.rebuilt, c });
  }
  fs.writeFileSync(path.join(L.WORK, 'phase1-results.json'), JSON.stringify({ totals, rows }, null, 1));
  const sum = (m) => m.reduce((a, x) => a + x.nVerts, 0), tri = (m) => m.reduce((a, x) => a + x.nTris, 0);
  let md = '| fixture | mode | KB | meshes | verts | tris | bbox max dev | result | ms oracle | ms rebuilt |\n|---|---|---:|---:|---:|---:|---:|---|---:|---:|\n';
  for (const x of rows) {
    const ok = x.o.ok && x.r.ok;
    const res = x.c.bothFail ? 'both fail' : x.c.diffs.length ? 'DIFF: ' + x.c.diffs.slice(0, 3).join('; ') : (x.c.exact ? 'bit-identical' : 'equal (hash differs)');
    md += `| ${path.basename(x.f)} | ${x.mode} | ${Math.round(x.size / 1024)} | ${ok ? x.o.nMeshes : '-'} | ${ok ? sum(x.o.meshes) : '-'} | ${ok ? tri(x.o.meshes) : '-'} | ${ok ? x.c.maxBb.toExponential(1) : '-'} | ${res}${x.c.notes.length ? ' [' + x.c.notes.join('; ') + ']' : ''} | ${x.o.ms ? Math.round(x.o.ms) : '-'} | ${x.r.ms ? Math.round(x.r.ms) : '-'} |\n`;
  }
  fs.writeFileSync(path.join(L.WORK, 'phase1-table.md'), md);
  console.log('\n', JSON.stringify(totals));
});
