const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader(),m=load('src/music.ts'),d=load('src/arrangementDiagnostics.ts');
const p=m.blankProject({sections:1,measuresPerSection:3,beats:4,bpm:120});
p.bars.forEach(b=>b.chord='Dm');p.roles.A.Piano='chords';p.profile='darienzo';
const score=m.generate(p);
const before=JSON.stringify({p,score});
const findings=d.diagnoseArrangement(p,score);
assert.equal(JSON.stringify({p,score}),before,'scan must be read-only');
assert.ok(d.diagnoseArrangement(p,score,{instrument:'Piano',from:0,to:0}).every(x=>x.instrument==='Piano'&&x.measure===0));
assert.equal(d.refineArrangement(p,score,[]),p);
const noteIndex=score.Piano.findIndex(n=>n.start>=0&&n.start<4);
assert.ok(noteIndex>=0);
const issue={id:'test',category:'dynamics',severity:'suggestion',instrument:'Piano',measure:0,message:'test',noteIndex,patch:{velocity:63}};
const protectedProject={...p,protectedBars:{...p.protectedBars,'Piano:0':true}};
assert.equal(d.refineArrangement(protectedProject,score,[issue]),protectedProject);
const next=d.refineArrangement(p,score,[issue]);
assert.equal(JSON.stringify({p,score}),before,'correction must not mutate source');
assert.deepEqual(next.generatedScore.Piano.map(n=>[n.pitch,n.start,n.duration]),score.Piano.map(n=>[n.pitch,n.start,n.duration]));
if(findings.length){
 const dismissed={...p,dismissedArrangementFindings:[findings[0].id]};
 assert.ok(!d.diagnoseArrangement(dismissed,score).some(x=>x.id===findings[0].id));
 assert.ok(d.diagnoseArrangement(dismissed,score,{showDismissed:true}).some(x=>x.id===findings[0].id));
}
assert.ok(!d.diagnoseArrangement(p,score).some(x=>x.voicing||x.patch?.pitch!==undefined||x.patch?.start!==undefined));
console.log('PASS arrangement review read-only scan, scope, protected measures, expression preservation and dismissal');
