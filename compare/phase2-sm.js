'use strict';
// usage: node phase2-sm.js <rebuiltDir> [conc]  -> external sheet-metal detection + unfold identical on all fixtures?
// Oracle results are cached in work/oracle-sm/ (computed once from the live oracle).
const fs = require('fs'); const path = require('path');
const L = require('./lib'); const { runPool } = require('./pool'); const { makeStats, diff } = require('./deepdiff');
const [dir = 'dist', conc = '4'] = process.argv.slice(2);
const files = JSON.parse(fs.readFileSync(path.join(L.WORK, 'oracle-twt/index.json')));
const oDir = path.join(L.WORK, 'oracle-sm'), rDir = path.join(L.WORK, 'rebuilt-sm'); fs.mkdirSync(oDir, { recursive: true }); fs.mkdirSync(rDir, { recursive: true });
const name = (i) => String(i).padStart(3, '0') + '.json';
const jobs = [];
files.forEach((f, i) => {
  if (!fs.existsSync(path.join(oDir, name(i)))) jobs.push({ cmd: 'node', args: [path.join(__dirname, 'sm-run.js'), 'oracle', String(i), path.join(oDir, name(i))], timeoutMs: 3600000 });
  jobs.push({ cmd: 'node', args: [path.join(__dirname, 'sm-run.js'), dir, String(i), path.join(rDir, name(i))], timeoutMs: 3600000 });
});
runPool(jobs, +conc, () => process.stderr.write('.')).then(() => {
  let same = 0, sheet = 0, unfolded = 0, bad = []; const rows = [];
  files.forEach((f, i) => {
    let o, r; try { o = JSON.parse(fs.readFileSync(path.join(oDir, name(i)))); r = JSON.parse(fs.readFileSync(path.join(rDir, name(i)))); } catch (e) { bad.push([path.basename(f), 'missing result']); return; }
    const st = makeStats(); diff(o, r, 'sm', st);
    const k = o.results && o.results['0.44']; const isSm = k && k.detection && k.detection.isSheetMetal; if (isSm) sheet++; if (isSm && k.unfold && k.unfold.ok) unfolded++;
    if (st.total === 0) same++; else bad.push([path.basename(f), [...st.paths.entries()].slice(0, 3).map(([p, v]) => p + ' x' + v.count)]);
    rows.push({ f: path.basename(f), isSheetMetal: !!isSm, unfoldOk: !!(isSm && k.unfold && k.unfold.ok), reason: k && k.detection && k.detection.reason, identical: st.total === 0, err: o.fatal || r.fatal });
  });
  fs.writeFileSync(path.join(L.WORK, 'phase2-sm-results.json'), JSON.stringify(rows, null, 1));
  console.log('\nfixtures', files.length, 'identical', same, 'sheetMetal(oracle)', sheet, 'unfolded', unfolded, 'differences', bad.length);
  bad.forEach((b) => console.log('DIFF', JSON.stringify(b)));
});
