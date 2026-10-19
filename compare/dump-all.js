'use strict';
// usage: node dump-all.js <variant> <outdir> [conc]
const fs = require('fs'); const path = require('path');
const { listFixtures } = require('./fixtures'); const { runPool } = require('./pool');
const [variant, outdir, conc = '4'] = process.argv.slice(2);
fs.mkdirSync(outdir, { recursive: true });
const files = listFixtures();
const jobs = files.map((f, i) => ({ cmd: 'node', args: [path.join(__dirname, 'twt-dump.js'), variant, f, path.join(outdir, String(i).padStart(3, '0') + '.json')], timeoutMs: 900000 }));
runPool(jobs, +conc, (i, r) => { if (r.code !== 0) console.log('FAIL', files[i], r.code, r.timedOut ? 'timeout' : r.stderr.slice(0, 200)); })
  .then(() => { fs.writeFileSync(path.join(outdir, 'index.json'), JSON.stringify(files)); console.log('done', files.length); });
