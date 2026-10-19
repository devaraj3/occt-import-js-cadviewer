'use strict';
// Reference defect repro: a run of TessellateWithTopology / ExportPart calls on ONE module instance makes the
// reference wasm trap in a later ExportPart ("null function or function signature mismatch" or
// "table index is out of bounds"). The rebuilt module survives the identical sequence.
// usage: FX_SIMPLE_STEP=.. FX_ASSEMBLY_STEP=.. FX_IGES=.. FX_STEP_MEDIUM=.. node reference-trap-repro.js [rebuiltDir]
// (whether the reference traps depends on heap layout, e.g. the length of this script's path)
const L=require(require('path').join(__dirname,'lib.js'));const fs=require('fs');const path=require('path');
L.VARIANTS.rebuilt={js:path.resolve(process.argv[2] || 'dist', 'occt-import-js.js'),wasm:path.resolve(process.argv[2] || 'dist', 'occt-import-js.wasm')};
(async()=>{
 const files=['FX_SIMPLE_STEP','FX_ASSEMBLY_STEP','FX_IGES','FX_STEP_MEDIUM'].map(n=>L.requireEnv(n));
 const mods={oracle:(await L.loadModule('oracle')).mod,rebuilt:(await L.loadModule('rebuilt')).mod};
 const dead={}; const log=[];
 const call=(v,what,fn)=>{ if(dead[v])return; try{fn()}catch(e){dead[v]=what; log.push(`${v} DIED at ${what}: ${String(e&&e.message).slice(0,50)}`)} };
 for (const f of files) { const ext=L.extOf(f); const b=new Uint8Array(fs.readFileSync(f)); const d=L.testDeflections(b.length); const name=path.basename(f);
  const opt={ext,mesh:{linearDeflection:d.linearDeflection,angularDeflection:d.angularDeflection}};
  for(const v of ['oracle','rebuilt']) call(v,name+' TWT warm',()=>mods[v].TessellateWithTopology(b,opt));
  for(let i=0;i<5;i++) for(const v of ['oracle','rebuilt']) call(v,name+' TWT '+i,()=>mods[v].TessellateWithTopology(b,opt));
  let pid; try{ pid=mods.rebuilt.TessellateWithTopology(b,opt).meshes[0].partId }catch(e){}
  for(let i=0;i<5;i++) for(const v of ['oracle','rebuilt']) call(v,name+' EXPORT '+i,()=>mods[v].ExportPart(b,{inputExt:ext,partId:pid,format:'step'}));
 }
 console.log(log.join('\n')||'no deaths'); console.log('dead:',JSON.stringify(dead));
})();
