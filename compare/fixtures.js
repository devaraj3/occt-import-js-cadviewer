'use strict';
const fs = require('fs'); const path = require('path'); const os = require('os');
const L = require('./lib');
function walk(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, out); else if (L.canonExt(L.extOf(p))) out.push(p);
  }
  return out;
}
function listFixtures() {
  const roots = [L.requireEnv('OCCT_FIXTURES_DIR'), path.join(L.WORK, 'fixtures-extra')].filter(fs.existsSync);
  return roots.flatMap((r) => walk(r)).sort();
}
module.exports = { listFixtures };
if (require.main === module) { const f = listFixtures(); console.log(f.length); f.forEach((x) => console.log(x)); }
