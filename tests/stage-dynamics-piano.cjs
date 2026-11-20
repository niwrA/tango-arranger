const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const root=path.resolve(__dirname,'..');
function read(file){return fs.readFileSync(path.join(root,file),'utf8')}
const dyn=load('src/stageDynamics.ts');
const piano=load('src/pianoRegisters.ts');
const strings=load('src/stringFingerboard.ts');
const app=read('src/App.vue'),diagram=read('src/PerformanceChordDiagram.vue');
const role=read('src/PerformanceRoleCues.vue');
let count=0;
function check(label,fn){fn();count++;console.log('PASS '+label)}
check('bass is displayed high G to low E without affecting actual tuning pitches',()=>{
 assert.deepEqual(Array.from(strings.fingerboardStrings('Contrabass'),s=>s.name),['G2','D2','A1','E1']);
 assert.deepEqual(Array.from(strings.fingerboardStrings('Contrabass'),s=>s.midi),[43,38,33,28]);
 assert.deepEqual(Array.from(strings.fingerboardStrings('Violin I'),s=>s.name),['E5','A4','D4','G3']);
 assert.ok(diagram.includes('fingerboardStrings(family.value)'));
 assert.ok(app.includes('fingerboardStrings(noteInst.value)'));
});
check('measure dynamics map consistently to restrained background and meter intensity',()=>{
 assert.equal(dyn.stageDynamicMeter('—'),'0%');
 assert.ok(dyn.stageDynamicStrength('ppp')<dyn.stageDynamicStrength('p'));
 assert.ok(dyn.stageDynamicStrength('p')<dyn.stageDynamicStrength('mf'));
 assert.ok(dyn.stageDynamicStrength('f')<dyn.stageDynamicStrength('fff'));
 assert.ok(Number(dyn.stageDynamicAlpha('mf → f'))>Number(dyn.stageDynamicAlpha('mf')));
 assert.ok(Number(dyn.stageDynamicAlpha('fff'))<=.25);
 assert.equal(dyn.stageDynamicAlpha('—'),'0.04');
});
check('current and next dynamics are visible as text and shaded independently in both modes',()=>{
 assert.ok(app.includes('performance-card-dynamic-rail'));
 assert.ok(app.includes('instrument-focus-dynamic-band'));
 assert.ok(app.includes("part.hasNextMeasure?'NEXT · M'+(performanceBar+2):'END OF SCORE'"));
 assert.ok(app.includes('stageDynamicAlpha(part.dynamics)'));
 assert.ok(app.includes("stageDynamicAlpha(part.hasNextMeasure?part.nextDynamics:'—')"));
 assert.ok(app.includes('hasNextMeasure:nextBar>bar'));
 assert.equal((app.match(/<PerformanceRoleCues /g)||[]).length,2);
 assert.ok(role.includes('NOW · M{{currentMeasure}}'));
 assert.ok(role.includes("'NEXT · M'+nextMeasure"));
 assert.ok(role.includes('stageDynamicAlpha(dynamics)'));
 assert.ok(role.includes('stageDynamicAlpha(nextDynamics)'));
 assert.ok(role.includes('stageDynamicMeter(dynamics)'));
 assert.ok(role.includes('stageDynamicMeter(nextDynamics)'));
 assert.ok(!role.includes('<button'));
});
check('expanded role view gives the present measure more space and preserves tap to switch',()=>{
 assert.ok(role.includes('.stage-role-timeline.is-focus{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)'));
 assert.ok(role.includes('is-focus'));
 assert.ok(role.includes('stage-role-articulation'));
 assert.ok(app.includes('class="instrument-focus-switch-area instrument-focus-role-switch" @click="flipPerformanceCard(part.inst)"'));
 assert.ok(app.includes(':current-measure="performanceBar+1"'));
 assert.ok(app.includes(':next-measure="part.hasNextMeasure?performanceBar+2:null"'));
 assert.ok(app.includes('height:270px!important;min-height:270px!important;max-height:270px!important'));
});
check('compact piano window follows current-measure bass and upper pitches, not only fixed C3',()=>{
 assert.ok(diagram.includes("pianoWindow("));
 assert.ok(diagram.includes('props.measurePitches?.length?props.measurePitches'));
 assert.ok(diagram.includes("'all',props.splitPitch??60,23"));
 assert.ok(diagram.includes('const whiteKeys=computed(()=>pianoView.value.whites)'));
 assert.ok(diagram.includes('const blackKeys=computed(()=>pianoView.value.blacks'));
 assert.ok(app.includes(':measure-pitches="part.measurePitches" :register-pitches="part.registerPitches" :split-pitch="pianoSplit"'));
 const window=piano.pianoWindow([40,43,64,72],'all',60,23);
 assert.equal(window.whites.length,23);
 assert.ok(window.start<=40&&window.end>=72);
});
check('piano planned bass and upper notes have separate colors and actual sounding notes keep priority',()=>{
 for(const fragment of ['isPianoBassMidi(midi)','isPianoMeasurePitch(midi)','is-piano-bass','is-piano-upper',
   'diagram-piano-hand-legend','pianoPitchesOutOfView','is-sounding','pianoView.start'])
  assert.ok(diagram.includes(fragment),fragment);
 assert.ok(diagram.includes('.diagram-piano .diagram-white-key.is-piano-bass.is-sounding'));
 assert.ok(diagram.includes('.diagram-piano .diagram-white-key.is-piano-upper.is-sounding'));
 assert.ok(diagram.includes('.diagram-white-keys{grid-template-columns:repeat(var(--piano-white-count,14)'));
 assert.ok(diagram.includes('height:80px;min-height:80px;max-height:80px'));
});
console.log(count+' stage dynamics, role and compact piano checks passed');
