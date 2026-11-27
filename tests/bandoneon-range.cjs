const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const JSZip=require('jszip');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader({imports:{'./el-choclo-source.json':{default:require('../src/presets/el-choclo-source.json')}}});
const m=load('src/music.ts'),b=load('src/bandoneon.ts');
const {executeMusicalEdit}=load('src/musicalEdit.ts');
const {copyMeasureRange,pasteMeasureRange}=load('src/measureClipboard.ts');
const {scoreSourceSignature}=load('src/editions.ts');
const inst='Bandoneon I',part={...m.blankProject({sections:1,measuresPerSection:4,beats:4,bpm:120})};
const note=(pitch,start=0)=>({pitch,start,duration:1});
assert.equal(b.DEFAULT_BANDONEON_MODEL,'rheinische-142');
assert.deepEqual(m.instrumentRange(inst),[36,95]);
assert.deepEqual(m.instrumentRange('Violin I',part),[55,96]);
for(const [id,expected] of Object.entries({'rheinische-142':[36,95],'rheinische-152-gutjahr':[35,95],'einheits-144':[36,93],'peguri-146':[42,95]})){
 const project={...part,bandoneonModels:{[inst]:id}};
 assert.deepEqual(m.instrumentRange(inst,project),expected,id);
 assert.ok(expected.every(pitch=>m.instrumentPitchPlayable(inst,pitch,project)),id);
 assert.ok(!m.instrumentPitchPlayable(inst,expected[0]-1,project),id);
 assert.ok(!m.instrumentPitchPlayable(inst,expected[1]+1,project),id);
 assert.deepEqual(m.editablePitchRange(inst,[note(26)],project),[26,expected[1]],'legacy material stays visible');
}
assert.deepEqual(m.instrumentRange(inst,{bandoneonModels:{[inst]:'unrecognized'}}),[36,95]);
assert.ok(!b.isBandoneonPitchPlayable(94),'standard 142 has no B-flat 6');
assert.ok(b.isBandoneonPitchPlayable(94,'peguri-146'));
assert.ok(!b.isBandoneonPitchPlayable(70,'rheinische-142','left'));
assert.ok(b.isBandoneonPitchPlayable(70,'rheinische-142','right'));
assert.equal(b.bandoneonHandForPitch(38),'left');
assert.equal(b.bandoneonHandForPitch(70),'right');
assert.equal(b.bandoneonHandForPitch(60),undefined,'overlap does not imply fingering');
assert.equal(m.partStaffForNote(note(58),inst,60,0,'rheinische-142'),2,'overlap uses the display split');
assert.equal(m.partStaffForNote(note(58),inst,60,0,'peguri-146'),2);
assert.equal(m.partStaffForNote(note(70),inst,72,0,'rheinische-142'),1,'only available on right');
assert.equal(m.partStaffForNote({...note(70),xmlStaff:2},inst,72,0,'rheinische-142'),2,'imported staff stays explicit');
assert.equal(m.partStaffForNote({...note(38),xmlStaff:2,staffOverride:1},inst),1,'manual staff wins');
console.log('PASS bandoneon layouts recognize valid bass, known gaps, exclusive hands and staff metadata');

assert.equal(m.suggestedEditorNote(part,inst,0,0,38).pitch,38);
assert.throws(()=>m.suggestedEditorNote(part,inst,0,0,26),/range/);
assert.throws(()=>m.suggestedEditorNote(part,inst,0,0,94),/range/);
const peguri={...part,bandoneonModels:{[inst]:'peguri-146'}};
assert.equal(m.suggestedEditorNote(peguri,inst,0,0,94).pitch,94);
assert.throws(()=>m.suggestedEditorNote(peguri,inst,0,0,38),/range/);
const shifted={...part,transposeSemitones:2};
assert.deepEqual(m.instrumentRange(inst,shifted),[36,95],'concert bounds stay fixed');
assert.deepEqual(m.writtenInstrumentRange(inst,shifted),[34,93]);
assert.deepEqual(m.editablePitchRange(inst,[note(26)],shifted),[26,93]);
assert.deepEqual(m.noteEditorContext(shifted,inst,0).range,[34,93]);
assert.equal(m.suggestedEditorNote(shifted,inst,0,0,34).pitch,34,'written B-flat 1 sounds as C2');
assert.throws(()=>m.suggestedEditorNote(shifted,inst,0,0,33),/range/);
assert.throws(()=>m.suggestedEditorNote(shifted,inst,0,0,92),/range/,'sounding B-flat 6 is still absent');
assert.deepEqual(m.editablePitchRange('Violin I',[],shifted),[55,96],'unchanged other instrument ranges');
assert.notEqual(scoreSourceSignature(part,inst),scoreSourceSignature(peguri,inst));
assert.equal(scoreSourceSignature(part,'Piano'),scoreSourceSignature(peguri,'Piano'));
assert.equal(m.setProjectRoster(peguri,['Piano',inst]).bandoneonModels[inst],'peguri-146','roster edits retain the per-part model');
const p=m.blankProject({sections:1,measuresPerSection:4,beats:4,bpm:120});
p.roles.A[inst]='melody';p.orchestration.bandoneon.A={[inst]:{target:'independent',method:'exact'}};
p.bars[0]={...p.bars[0],chord:'Dm',melody:[note(94)]};
assert.equal(m.generate(p)[inst][0].pitch,82,'generator finds a reachable octave instead of inventing the missing pitch');
const pShifted={...p,transposeSemitones:-2};
assert.equal(m.generate(pShifted)[inst][0].pitch,94,'the same written pitch is valid when it sounds a whole tone lower');
p.bars[0]={...p.bars[0],melody:[note(26)]};
assert.equal(m.generate(p)[inst][0].pitch,38,'a generated out-of-range pitch keeps its pitch class');
const plan=m.planRegisterTransposition({[inst]:[note(93)]},p,1);
assert.equal(plan.decisions[0].outOfRange,1);
assert.equal(plan.corrections[0].suggestedPitch,82,'register planning honors the missing note');
const clip=copyMeasureRange(part,{[inst]:[note(38)]},{start:0,end:0},[inst],{notes:true});
assert.throws(()=>pasteMeasureRange(peguri,{},clip,1,'overwrite',{notes:true}),/playable range/);
assert.throws(()=>executeMusicalEdit({project:part,score:{},instrument:inst,selection:{kind:'measures',from:0,to:0},entry:{bar:0,beat:0,pitch:94}},'create','insert'),/range/);
console.log('PASS model-specific editing, same-pitch-class generation, register plans and clipboard bounds');

function audit(p){
 const check=(score,outer)=>{
  for(const [part,notes] of Object.entries(score||{}))if(part.startsWith('Bandoneon')){
   for(const n of notes)assert.ok(m.instrumentPitchPlayable(part,n.pitch,p),[p.title,outer,part,n.pitch,n.start].join('/'));
  }
 };
 for(const key of ['importedScore','generatedScore','baseScore'])check(p[key],key);
 for(const [part,editions] of Object.entries(p.partEditions||{}))if(part.startsWith('Bandoneon')){
  for(const [level,edition] of Object.entries(editions)){
   check({[part]:edition.notes},level);
   check({[part]:edition.importedNotes||[]},level+' imported');
  }
 }
 if(p.importMergeBackup?.project)audit(p.importMergeBackup.project);
}
async function main(){
 const dir=path.join(__dirname,'../src/presets');
 const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));
 const hasta=read('hasta-siempre-amor.json');
 for(const key of ['importedScore','generatedScore','baseScore'])
  for(const part of ['Bandoneon I','Bandoneon II']){
   assert.ok(!hasta[key][part].some(n=>n.pitch===26&&n.start===4),'remove both unsupported D1 events');
   assert.ok(hasta[key][part].some(n=>n.pitch===38&&n.start===292),'leave both legitimate D2 events');
  }
 assert.ok(hasta.importedScore.Piano.some(n=>n.pitch===38&&n.start===4),'leave the piano bass untouched');
 for(const p of [hasta,read('la-melodia-de-nuestros-adios.json'),read('pequena-2.json'),load('src/presets/el-choclo.ts').createElChocloStudy()])audit(p);
 const zip=await JSZip.loadAsync(fs.readFileSync(path.join(dir,'tigre-viejo-bowed-expression.tango.zip')));
 audit(JSON.parse(await zip.file('project.json').async('string')));
 console.log('PASS all five bundled arrangements across active scores and stored editions');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
