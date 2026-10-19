const fs=require('fs');const path=require('path');
const dir=process.argv[2];
const cnt=(o,k)=>{o[k]=(o[k]||0)+1};
const S={faceKeys:{},faceKind:{},faceAnalyticKeys:{},edgeKeys:{},edgeKind:{},curveKind:{},closed:{},periodic:{},edgeAnalyticKeys:{},vertexKeys:{},nAdj:{},vidNull:0,tolSet:{},partIdForms:{},meshKeys:{},topKeys:{},faceKindAnalyticPresence:{}, nPtsByCurve:{}};
let files=0,fails=[];
for(const f of fs.readdirSync(dir)){ if(!/^\d+\.json$/.test(f))continue; const o=JSON.parse(fs.readFileSync(path.join(dir,f)));
 if(!o.topology){fails.push([f,o.file,o.threw||o.error||o.fatal]);continue;} files++;
 const t=o.topology; cnt(S.topKeys,Object.keys(t).join(','));
 for(const m of o.meshKeys) cnt(S.meshKeys,m.join(','));
 for(const v of t.vertices){cnt(S.vertexKeys,Object.keys(v).join(',')); cnt(S.tolSet,String(v.tolerance));}
 for(const fc of t.faces){cnt(S.faceKeys,Object.keys(fc).join(','));cnt(S.faceKind,fc.kind);cnt(S.faceAnalyticKeys,fc.kind+':'+(fc.analytic?Object.keys(fc.analytic).join('|'):'none'));}
 for(const e of t.edges){cnt(S.edgeKeys,Object.keys(e).join(','));cnt(S.edgeKind,e.kind);cnt(S.curveKind,e.curveKind);cnt(S.closed,e.closed+'/'+e.periodic+'/'+e.curveKind);
  cnt(S.edgeAnalyticKeys,e.curveKind+':'+(e.analytic?Object.keys(e.analytic).join('|'):'none'));cnt(S.nAdj,e.adjacentFaceIds.length+':'+e.kind); if(!e.vertexIds)S.vidNull++;
  const n=e.samplePositions.length/3; (S.nPtsByCurve[e.curveKind]=S.nPtsByCurve[e.curveKind]||{}); cnt(S.nPtsByCurve[e.curveKind],n);
 }
 for(const m of o.meshSummary){ }
 const pid=[];(function w(n){cnt(S.partIdForms,String(n.partId).replace(/\d+/g,'N'));n.children.forEach(w)})(o.root);
}
console.log('files',files,'fails',JSON.stringify(fails,null,1));
for(const k in S) console.log(k, JSON.stringify(S[k]));
