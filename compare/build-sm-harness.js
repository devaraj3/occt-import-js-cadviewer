'use strict';
// Optional check. Bundles compare/sm-harness.ts together with an external sheet-metal analysis module into
// $OCCT_WORK_DIR/sm-harness.cjs. The module is NOT part of this repository: CAD_APP_DIR must point at a
// checkout that provides src/utils/sheet-metal and node_modules/esbuild. It is only read, at bundle time.
const path = require('path');
const L = require('./lib');
const APP = path.resolve(L.requireEnv('CAD_APP_DIR'));
const { buildSync } = require(path.join(APP, 'node_modules/esbuild'));
buildSync({
  entryPoints: [path.join(__dirname, 'sm-harness.ts')],
  outfile: path.join(L.WORK, 'sm-harness.cjs'),
  bundle: true, platform: 'node', format: 'cjs', logLevel: 'warning',
  alias: { '@app': path.join(APP, 'src') },
  nodePaths: [path.join(APP, 'node_modules')],
});
console.log('built', path.join(L.WORK, 'sm-harness.cjs'));
