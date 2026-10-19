'use strict';
// Generic deep diff with per-path statistics. Paths normalise array indices to [] so
// thousands of identical failures collapse into one line.
function makeStats() { return { paths: new Map(), total: 0 }; }
function norm(path) { return path.replace(/\[\d+\]/g, '[]'); }
function note(st, path, kind, a, b, exampleLoc) {
  st.total++;
  const k = norm(path) + ' :: ' + kind;
  let e = st.paths.get(k);
  if (!e) { e = { count: 0, maxAbs: 0, examples: [] }; st.paths.set(k, e); }
  e.count++;
  if (kind === 'num') e.maxAbs = Math.max(e.maxAbs, Math.abs(a - b));
  if (e.examples.length < 3) e.examples.push({ at: exampleLoc || path, a: short(a), b: short(b) });
}
function short(v) { const s = typeof v === 'string' ? v : JSON.stringify(v); return s && s.length > 90 ? s.slice(0, 90) + '…' : s; }
function diff(a, b, path, st) {
  if (a === b) return;
  const ta = typeof a, tb = typeof b;
  if (ta === 'number' && tb === 'number') { if (Number.isNaN(a) && Number.isNaN(b)) return; note(st, path, 'num', a, b); return; }
  if (a === null || b === null || ta !== 'object' || tb !== 'object') { note(st, path, ta === tb ? 'value' : 'type', a, b); return; }
  const aa = Array.isArray(a), ab = Array.isArray(b);
  if (aa !== ab) { note(st, path, 'type', a, b); return; }
  if (aa) {
    if (a.length !== b.length) note(st, path, 'length', a.length, b.length);
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) diff(a[i], b[i], path + '[' + i + ']', st);
    return;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  for (const k of ka) if (!(k in b)) note(st, path + '.' + k, 'missing-in-rebuilt', a[k], undefined);
  for (const k of kb) if (!(k in a)) note(st, path + '.' + k, 'extra-in-rebuilt', undefined, b[k]);
  if (ka.join() !== kb.join() && ka.length === kb.length && ka.every((k) => k in b)) note(st, path, 'key-order', ka.join(), kb.join());
  for (const k of ka) if (k in b) diff(a[k], b[k], path + '.' + k, st);
}
module.exports = { makeStats, diff };
