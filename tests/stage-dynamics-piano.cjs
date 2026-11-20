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
check('two compact piano registers cover both hands and sounding pitches',()=>{
 assert.ok(diagram.includes('pianoWindowCovering('));
 assert.ok(diagram.includes('const pianoHands=computed('));
 assert.ok(diagram.includes("pianoWindowCovering(relevant,'lower',split,12)"));
 assert.ok(diagram.includes("pianoWindowCovering(relevant,'upper',split,12)"));
 assert.ok(diagram.includes('class="diagram-piano diagram-piano-split"'));
 assert.ok(diagram.includes('v-for="hand in pianoHands"'));
 assert.ok(diagram.includes('pianoPitchVisible(midi)'));
 assert.ok(!diagram.includes('+{{pianoPitchesOutOfView}} offscreen'));
 assert.ok(app.includes(':measure-pitches="part.measurePitches" :register-pitches="part.registerPitches" :split-pitch="pianoSplit"'));
 for(const part of ['lower','upper']){
   const pitches=part==='lower'?[27,30,40,53,58]:[60,64,72,85,96];
   const view=piano.pianoWindowCovering(pitches,part,60,12);
   const visible=new Set([...view.whites,...view.blacks.map(key=>key.pitch)]);
   for(const pitch of pitches)assert.ok(visible.has(pitch),part+' missing '+pitch);
 }
 const overlap=[34,37,61,64,76,93];
 for(const part of ['lower','upper']){
   const view=piano.pianoWindowCovering(overlap,part,60,12);
   const visible=new Set([...view.whites,...view.blacks.map(key=>key.pitch)]);
   for(const pitch of overlap.filter(p=>part==='lower'?p<60:p>=60))
    assert.ok(visible.has(pitch),part+' missing '+pitch);
 }
 const full=piano.pianoWindowCovering([21,108],'all',60,12);
 assert.equal(full.start,21);
 assert.equal(full.end,108);
});
check('piano planned bass and upper notes retain separate colors and active priorities',()=>{
 for(const fragment of ['isPianoBassMidi(midi)','isPianoMeasurePitch(midi)','is-piano-bass','is-piano-upper',
   'diagram-piano-hand-legend','pianoPitchesOutOfView','is-sounding','pianoHands[0].view.start'])
  assert.ok(diagram.includes(fragment),fragment);
 assert.ok(diagram.includes('.diagram-piano .diagram-white-key.is-piano-bass.is-sounding'));
 assert.ok(diagram.includes('.diagram-piano .diagram-white-key.is-piano-upper.is-sounding'));
 assert.ok(diagram.includes('.diagram-piano-split .diagram-white-keys{grid-template-columns:repeat(var(--piano-white-count,12)'));
 assert.ok(diagram.includes('height:80px;min-height:80px;max-height:80px'));
});
check('dynamics editor is loop-bound and uses explicit multi-selection',()=>{
 for(const fragment of [
  'const dynamicsPreviewBars=computed(()=>focusVisibleMeasures.value)',
  'function clickDynamicsMeasure(bar:number,event:MouseEvent)',
  'dynamicsSelectedBars.value=[...selected].sort',
  'function selectDynamicsLoop()',
  'function clearDynamicsSelection()',
  'function applyDynamicsMarkToSelection(mark:string)',
  'const dynamicsSelectionMark=computed(',
  "'Current: '+dynamicsSelectionMark.value",
  "if(!selected.has(bar))continue;",
  'const dynamicsSelectedSpan=computed(',
  "const dynamicsShapeSuggestion=computed",
  '@click="clickDynamicsMeasure(barIndex,$event)"',
  '@click="selectDynamicsLoop"',
  'Apply to selection:',
  "applyDynamicsGesture('crescendo')"
 ])assert.ok(app.includes(fragment),fragment);
 assert.ok(!app.includes("function clickDynamicsMeasure(bar:number){if(!dynamicsPress.consumeClick())openDynamicPopup(bar);}"));
 assert.ok(app.includes(':aria-pressed="dynamicsSelectedBars.includes(barIndex)"'));
 assert.ok(app.includes(':disabled="!dynamicsSelectedSpan"'));
});
check('speed menu is Files-style and wide iPad layout avoids two transport rows',()=>{
 for(const fragment of [
  'class="playback-speed-list"',
  'class="playback-speed-bpm"',
  'class="files-group-title">Rehearsal speed',
  '@click="setRehearsalSpeed(speed)"',
  'flex-wrap:nowrap!important;min-width:0;column-gap:6px',
  '.app-topbar .playback-speed-options{display:flex;flex-direction:column;',
  '.app-topbar .topbar-playback .playback-speed-menu>summary{box-sizing:border-box;'
 ])assert.ok(app.includes(fragment),fragment);
});
console.log(count+' stage dynamics, role and compact piano checks passed');
