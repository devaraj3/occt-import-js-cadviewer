'use strict';
// usage: node phase2-twt.js <rebuiltDir> [conc] [live]  -> aggregate TWT comparison over all fixtures
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { runPool } = require('./pool');
const [dir = 'dist', conc = '4', live] = process.argv.slice(2);
const dumpDir = path.join(L.WORK, 'oracle-twt');
const files = JSON.parse(fs.readFileSync(path.join(dumpDir, 'index.json')));
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const idxs = files.map((f, i) => i).filter((i) => !only || only.has(i));
const jobs = idxs.map((i) => ({ cmd: 'node', args: [path.join(__dirname, 'twt-compare.js'), String(i), dumpDir, dir].concat(live && fs.statSync(files[i]).size < 3e6 ? ['live'] : []), timeoutMs: 1800000 }));
runPool(jobs, +conc, () => process.stderr.write('.')).then((res) => {
  const rows = res.map((r, k) => { try { return JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return { file: files[idxs[k]], idx: idxs[k], fatal: 'unparseable ' + r.stderr.slice(0, 200) + (r.timedOut ? ' timeout' : '') }; } });
  const agg = new Map(); let identical = 0;
  for (const r of rows) { if (r.total === 0 && !r.fail && !r.fatal) identical++; for (const p of r.paths || []) { const a = agg.get(p.path) || { files: 0, count: 0, maxAbs: 0, ex: null }; a.files++; a.count += p.count; a.maxAbs = Math.max(a.maxAbs, p.maxAbs); a.ex = a.ex || { f: path.basename(r.file), ...p.examples[0] }; agg.set(p.path, a); } }
  fs.writeFileSync(path.join(L.WORK, 'phase2-twt-results.json'), JSON.stringify(rows, null, 1));
  console.log('\nfixtures', rows.length, 'identical', identical, 'failed', rows.filter((r) => r.fail || r.fatal).length);
  for (const r of rows) if (r.fail || r.fatal) console.log('FAIL', path.basename(r.file || ''), r.fail || r.fatal);
  for (const [k, v] of [...agg.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 40)) console.log(String(v.count).padStart(8), 'in', String(v.files).padStart(3), 'files', 'maxAbs', v.maxAbs.toExponential(2), k, JSON.stringify(v.ex));
});
