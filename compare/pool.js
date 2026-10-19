'use strict';
const { spawn } = require('child_process');
// Run jobs [{cmd,args,timeoutMs}] with limited concurrency; resolves [{code,stdout,stderr,timedOut,ms}].
function runPool(jobs, conc, onDone) {
  const results = new Array(jobs.length); let next = 0, active = 0;
  return new Promise((resolve) => {
    const pump = () => {
      while (active < conc && next < jobs.length) {
        const i = next++; const j = jobs[i]; active++;
        const t0 = Date.now(); let so = '', se = '', timedOut = false;
        const p = spawn(j.cmd, j.args, { stdio: ['ignore', 'pipe', 'pipe'] });
        const to = setTimeout(() => { timedOut = true; p.kill('SIGKILL'); }, j.timeoutMs || 600000);
        p.stdout.on('data', (d) => (so += d)); p.stderr.on('data', (d) => (se += d));
        p.on('close', (code) => { clearTimeout(to); active--; results[i] = { code, stdout: so, stderr: se, timedOut, ms: Date.now() - t0 }; if (onDone) onDone(i, results[i]); if (next >= jobs.length && active === 0) resolve(results); else pump(); });
      }
    };
    if (!jobs.length) resolve(results); else pump();
  });
}
module.exports = { runPool };
