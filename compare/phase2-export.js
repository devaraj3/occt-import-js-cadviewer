'use strict';
// usage: node phase2-export.js <rebuiltDir> [conc]
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { runPool } = require('./pool');
const [dir = 'dist', conc = '3'] = process.argv.slice(2);
const files = JSON.parse(fs.readFileSync(path.join(L.WORK, 'oracle-twt/index.json')));
// plus the derived BREP fixtures
const extra = fs.readdirSync(path.join(L.WORK, 'fixtures-extra')).filter((f) => f.endsWith('.brep')).map((f) => path.join(L.WORK, 'fixtures-extra', f));
const all = files.concat(extra.filter((f) => !files.includes(f)));
fs.writeFileSync(path.join(L.WORK, 'oracle-twt/index.json.all'), JSON.stringify(all));
const outDir = path.join(L.WORK, 'export-results'); fs.mkdirSync(outDir, { recursive: true });
const only = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(Number)) : null;
const idxs = all.map((f, i) => i).filter((i) => !only || only.has(i));
const jobs = idxs.map((i) => ({ cmd: 'node', args: [path.join(__dirname, 'export-run.js'), String(i), dir, path.join(outDir, String(i).padStart(3, '0') + '.json')], timeoutMs: 3600000 }));
runPool(jobs, +conc, () => process.stderr.write('.')).then(() => {
  const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
  const tot = { fixtures: 0, exports: 0, bothOk: 0, errMatch: 0, errDiff: 0, rawIdentical: 0, identicalIgnoringNames: 0, metricsEqual: 0, metricsDiff: 0, byFmt: {} };
  const problems = [];
  for (const i of idxs) {
    let r; try { r = JSON.parse(fs.readFileSync(path.join(outDir, String(i).padStart(3, '0') + '.json'))); } catch { problems.push([i, 'no result']); continue; }
    if (r.fatal) { problems.push([path.basename(all[i]), 'fatal ' + r.fatal.slice(0, 200)]); continue; }
    tot.fixtures++;
    for (const p of r.parts) {
      tot.exports++; const f = tot.byFmt[p.fmt] = tot.byFmt[p.fmt] || { n: 0, raw: 0, noNames: 0, metricsEq: 0, diff: 0 }; f.n++;
      if (p.oracle.ok !== p.rebuilt.ok || p.oracle.error !== p.rebuilt.error || p.oracle.format !== p.rebuilt.format || p.oracle.keys !== p.rebuilt.keys || p.oracle.ctor !== p.rebuilt.ctor) { tot.errDiff++; problems.push([path.basename(all[i]), p.pid, p.fmt, 'result shape differs', JSON.stringify(p.oracle), JSON.stringify(p.rebuilt)]); continue; }
      if (!p.oracle.ok) { tot.errMatch++; continue; }
      tot.bothOk++; if (p.rawIdentical) { tot.rawIdentical++; f.raw++; } if (p.identicalIgnoringNames) { tot.identicalIgnoringNames++; f.noNames++; }
      const a = p.oM, b = p.rM; let eq = !a.error && !b.error && !a.threw && !b.threw;
      if (a.error || b.error || a.threw || b.threw) eq = JSON.stringify(a) === JSON.stringify(b);
      else eq = a.meshes === b.meshes && a.V === b.V && a.E === b.E && a.F === b.F && a.tris === b.tris && near(a.area, b.area, 1e-9) && near(a.volume, b.volume, 1e-9) && a.bbox.every((x, k) => near(x, b.bbox[k], 1e-9)) && JSON.stringify(a.faceKinds) === JSON.stringify(b.faceKinds) && JSON.stringify(a.edgeKinds) === JSON.stringify(b.edgeKinds) && JSON.stringify(a.curveKinds) === JSON.stringify(b.curveKinds);
      if (eq) { tot.metricsEqual++; f.metricsEq++; } else { tot.metricsDiff++; f.diff++; problems.push([path.basename(all[i]), p.pid, p.fmt, 'metrics differ', JSON.stringify(a).slice(0, 300), JSON.stringify(b).slice(0, 300)]); }
    }
  }
  console.log('\n' + JSON.stringify(tot, null, 1)); console.log('problems', problems.length); problems.slice(0, 25).forEach((p) => console.log(JSON.stringify(p)));
  fs.writeFileSync(path.join(L.WORK, 'phase2-export-summary.json'), JSON.stringify({ tot, problems }, null, 1));
});
