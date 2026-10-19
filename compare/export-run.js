'use strict';
// usage: node export-run.js <fixtureIdx> <rebuiltDir> <outJson>
// For a sample of parts of one fixture: ExportPart in STEP/IGES/BREP on the oracle and the rebuilt
// module, re-import every result with the REFERENCE module, compare topology counts, bounds,
// area, volume; also compare the raw files (timestamps normalised).
const fs = require('fs'); const path = require('path');
const L = require('./lib');
(async () => {
  const [idxS, dir, out] = process.argv.slice(2);
  const files = JSON.parse(fs.readFileSync(path.join(L.WORK, 'oracle-twt/index.json.all')));
  const file = files[+idxS]; const ext = L.extOf(file); const bytes = new Uint8Array(fs.readFileSync(file));
  L.VARIANTS.rebuilt = { js: path.resolve(dir, 'occt-import-js.js'), wasm: path.resolve(dir, 'occt-import-js.wasm') };
  const { mod: O } = await L.loadModule('oracle'); const { mod: R } = await L.loadModule('rebuilt');
  const big = bytes.length > 3e6;
  const tw = O.TessellateWithTopology(bytes, { ext, mesh: { linearDeflection: 0.05, angularDeflection: 0.5 } });
  const meshParts = [...new Set(tw.meshes.map((m) => m.partId))];
  const allNodes = []; (function w(n) { allNodes.push(n.partId); n.children.forEach(w); })(tw.root);
  const nonMesh = allNodes.filter((p) => p && p !== 'xcf:root' && !meshParts.includes(p) && p !== 'brep:root');
  const pick = (a, k) => { if (a.length <= k) return a; const o = new Set([0, a.length - 1]); for (let i = 1; o.size < k; i++) o.add(Math.floor((i * a.length) / k)); return [...o].sort((x, y) => x - y).map((i) => a[i]); };
  const parts = [...pick(meshParts, big ? 2 : 5), ...nonMesh.slice(0, big ? 0 : 1)];
  if (ext === 'brep') parts.push('brep:root');
  const res = { file, idx: +idxS, parts: [], errors: [] };
  const norm = (buf, fmt) => {
    let s = Buffer.from(buf).toString('latin1');
    s = s.replace(/'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d'/g, "'T'").replace(/\d{8}\.\d{6}/g, 'T');
    return s;
  };
  // Product names (STEP) / entity labels and the 406 name property (IGES) depend on per-process state in the
  // reference runtime; mask them to test everything else.
  const stripNames = (s, fmt) => {
    if (fmt === 'step' || fmt === 'stp') return s.replace(/PRODUCT\([^;]*?\)\);/gs, 'PRODUCT();');
    if (fmt === 'iges' || fmt === 'igs') return s.split('\n').map((l) => {
      if (l[72] === 'D' && Number(l.slice(73)) % 2 === 0) return (l.slice(0, 56) + l.slice(64)).trimEnd();
      if (l[72] === 'P') return l.slice(0, 64).replace(/406,1,\d+H[^;]*;/, '406,1,H;').trimEnd() + l.slice(64);
      return l;
    }).join('\n');
    return s;
  };
  const metrics = (buf, fmt) => {
    const rext = fmt === 'stp' || fmt === 'step' ? 'step' : fmt === 'brep' ? 'brep' : 'iges';
    let r; try { r = O.TessellateWithTopology(new Uint8Array(buf), { ext: rext, mesh: { linearDeflection: 0.01, angularDeflection: 0.2 } }); } catch (e) { return { threw: String(e && e.message || e) }; }
    if (!r.success) return { error: r.error };
    let area = 0, vol = 0, bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], tris = 0;
    for (const m of r.meshes) {
      const p = m.attributes.position.array, ix = m.index.array; tris += ix.length / 3;
      for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], p[i + k]); bb[3 + k] = Math.max(bb[3 + k], p[i + k]); }
      for (let t = 0; t < ix.length; t += 3) { const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
        const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx; area += 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
        vol += (p[a] * cx + p[a + 1] * cy + p[a + 2] * cz) / 6; } }
    const kinds = (a) => a.reduce((o, x) => (o[x.kind] = (o[x.kind] || 0) + 1, o), {});
    return { meshes: r.meshes.length, V: r.topology.vertices.length, E: r.topology.edges.length, F: r.topology.faces.length, tris, bbox: bb, area, volume: vol, faceKinds: kinds(r.topology.faces), edgeKinds: kinds(r.topology.edges), curveKinds: r.topology.edges.reduce((o, x) => (o[x.curveKind] = (o[x.curveKind] || 0) + 1, o), {}) };
  };
  for (const pid of parts) for (const fmt of ['step', 'iges', 'brep']) {
    const rec = { pid, fmt };
    let eo, er; const opt = { inputExt: ext, partId: pid, format: fmt };
    try { eo = O.ExportPart(bytes, opt); } catch (e) { eo = { success: false, error: 'THROW ' + e.message }; }
    try { er = R.ExportPart(bytes, opt); } catch (e) { er = { success: false, error: 'THROW ' + e.message }; }
    rec.oracle = { ok: eo.success, error: eo.error, format: eo.format, keys: Object.keys(eo).join(), size: eo.bytes && eo.bytes.length, ctor: eo.bytes && eo.bytes.constructor.name };
    rec.rebuilt = { ok: er.success, error: er.error, format: er.format, keys: Object.keys(er).join(), size: er.bytes && er.bytes.length, ctor: er.bytes && er.bytes.constructor.name };
    if (eo.success && er.success) {
      const a = norm(eo.bytes, fmt), b = norm(er.bytes, fmt);
      rec.rawIdentical = a === b; rec.identicalIgnoringNames = rec.rawIdentical || stripNames(a, fmt) === stripNames(b, fmt);
      rec.oM = metrics(eo.bytes, fmt); rec.rM = metrics(er.bytes, fmt);
      if (!rec.rawIdentical && process.env.KEEP) { const d = path.join(L.WORK, 'export-diffs'); fs.mkdirSync(d, { recursive: true }); const n = `${idxS}_${pid.replace(/\W/g, '_')}.${fmt}`; fs.writeFileSync(path.join(d, 'o_' + n), Buffer.from(eo.bytes)); fs.writeFileSync(path.join(d, 'r_' + n), Buffer.from(er.bytes)); }
    }
    res.parts.push(rec);
  }
  fs.writeFileSync(out, JSON.stringify(res));
})().catch((e) => { fs.writeFileSync(process.argv[4], JSON.stringify({ fatal: String(e && e.stack || e) })); });
