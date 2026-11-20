const assert=require('node:assert/strict');
const fs=require('node:fs');
const {createDomainLoader}=require('./load-domain.cjs');
const loader=createDomainLoader();
const {blankProject}=loader('src/music.ts');
const {duplicateProjectSection}=loader('src/sectionDuplication.ts');
const app=fs.readFileSync('src/App.vue','utf8');
const visual=fs.readFileSync('src/LeadMelodyGrid.vue','utf8');
let checks=0;
function check(name,fn){fn();checks++;console.log('PASS '+name);}
function example(){
 const p=blankProject({sections:5,measuresPerSection:2,beats:4,title:'Pequeña reprise test'});
 p.bars[8].chord='Am';
 p.bars[8].melody=[{pitch:72,start:0,duration:1}];
 p.bars[9].chord='E7';
 p.generatedScore={Voice:[{pitch:60,start:32,duration:1,lyric:'primera'}],'Bandoneon I':[{pitch:64,start:32,duration:2}]};
 p.importedScore={Voice:[{pitch:60,start:32,duration:1,lyric:'primera'}]};
 p.baseScore={Voice:[{pitch:60,start:32,duration:1}]};
 p.protectedBars['Voice:8']=true;
 p.measureRoles={'Bandoneon I:8':'melody'};
 p.roles.E.Voice='melody';
 p.orchestration.bandoneon.E={'Bandoneon I':{target:'independent',method:'exact'}};
 p.expressionRanges=[{instrument:'Voice',startMeasure:8,endMeasure:8,from:60,to:100}];
 return p;
}
check('duplicate final E into a new independent F without changing original',()=>{
 const p=example(),before=JSON.stringify(p);
 const result=duplicateProjectSection(p,4);
 assert.equal(JSON.stringify(p),before);
 assert.equal(result.label,'F');
 assert.equal(result.sourceLabel,'E');
 assert.equal(result.destination,10);
 assert.equal(result.project.bars.length,12);
 assert.equal(result.project.bars[10].chord,'Am');
 assert.deepEqual(result.project.bars[10].melody,p.bars[8].melody);
 assert.notEqual(result.project.bars[10].melody,p.bars[8].melody);
 result.project.bars[10].melody[0].pitch=79;
 assert.equal(p.bars[8].melody[0].pitch,72);
});
check('duplicate instrument notes, protect copies, retain independent section roles',()=>{
 const p=example(),r=duplicateProjectSection(p,4).project;
 assert.deepEqual(r.generatedScore.Voice.map(n=>n.start),[32,40]);
 assert.deepEqual(r.importedScore.Voice.map(n=>n.start),[32,40]);
 assert.deepEqual(r.baseScore.Voice.map(n=>n.start),[32,40]);
 assert.equal(r.generatedScore.Voice[1].lyric,'primera');
 assert.equal(r.protectedBars['Voice:10'],true);
 assert.equal(r.measureRoles['Bandoneon I:10'],'melody');
 assert.equal(r.roles.F.Voice,'melody');
 r.orchestration.bandoneon.F['Bandoneon I'].method='rhythm';
 assert.equal(r.orchestration.bandoneon.E['Bandoneon I'].method,'exact');
 assert.equal(p.orchestration.bandoneon.E['Bandoneon I'].method,'exact');
});
check('expression markers in the copied section follow the new measures',()=>{
 const r=duplicateProjectSection(example(),4).project;
 assert.deepEqual(r.expressionRanges.map(x=>x.startMeasure),[8,10]);
 assert.deepEqual(r.expressionRanges.map(x=>x.endMeasure),[8,10]);
});
check('reject missing or maximum-count source without modifying song',()=>{
 assert.throws(()=>duplicateProjectSection(example(),99),/not found/);
 const p=blankProject({sections:26,measuresPerSection:1});
 assert.throws(()=>duplicateProjectSection(p,25),/maximum 26 sections/);
});
check('visual lead editor edits source melody and retains advanced notation input',()=>{
 assert.ok(app.includes("import LeadMelodyGrid from './LeadMelodyGrid.vue'"));
 assert.ok(app.includes('@update:notes="setLeadMelodyNotes"'));
 assert.ok(app.includes('function setLeadMelodyNotes(notes:Note[])'));
 assert.ok(app.includes('v-model="melodyText" data-lead-melody'));
 assert.ok(app.includes('@click="regenerate"'));
 assert.ok(visual.includes('@pointerdown="beginDrag($event,entry.index)"'));
 assert.ok(visual.includes('@pointermove="moveDrag"'));
 assert.ok(visual.includes('props.beats*4'));
});
check('section duplicate uses proxy-safe domain helper, not structuredClone',()=>{
 const copy=app.slice(app.indexOf('function duplicateLeadSection(i:number)'),app.indexOf('function copyChordsToSection(i:number)'));
 assert.ok(copy.includes('duplicateProjectSection(project.value,i)'));
 assert.ok(!copy.includes('structuredClone('));
});
console.log(checks+' section reprise and lead editor tests passed');
