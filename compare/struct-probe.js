const fs=require('fs');const path=require('path');
const dir=process.argv[2];
const idx=JSON.parse(fs.existsSync(path.join(dir,'index.json'))?fs.readFileSync(path.join(dir,'index.json')):'[]');
let nAlign=0,nMis=0; const sample=[];
for(const f of fs.readdirSync(dir).sort()){ if(!/^\d+\.json$/.test(f))continue; const o=JSON.parse(fs.readFileSync(path.join(dir,f))); if(!o.topology)continue;
 const t=o.topology; const nbf=o.meshSummary.reduce((a,m)=>a+m.nBrepFaces,0);
 if(nbf===t.faces.length)nAlign++; else {nMis++; sample.push([path.basename(o.file),nbf,t.faces.length]);}
 // id sequence check
 const seq=(a,p)=>a.every((x,i)=>x.id===p+'_'+i);
 const ok=seq(t.faces,'f')&&seq(t.edges,'e')&&seq(t.vertices,'v');
 if(!ok) console.log('ids not sequential',o.file);
 // partId contiguity: are faces grouped by part in order of meshes?
 const meshPids=o.meshSummary.map(m=>m.partId); const nodePids=[];(function w(n){nodePids.push(n.partId+'['+n.meshes+']');n.children.forEach(w)})(o.root);
 if(o.meshSummary.length>1 && sample.length<40) console.log(path.basename(o.file),'meshes',o.meshSummary.length,'meshPids',meshPids.slice(0,6).join(' '),'| nodes',nodePids.slice(0,6).join(' '));
}
console.log({nAlign,nMis,sample:sample.slice(0,10)});
