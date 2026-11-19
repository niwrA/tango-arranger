const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/performanceCues.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports){${js}\n})`,{})(mod,mod.exports);
const split=mod.exports.splitAtMeasureBoundaries;
let count=0;function check(name,fn){fn();count++;console.log('PASS',name);}
check('one note crossing a bar boundary is sliced without shortening',()=>{
 const n={start:3.5,duration:1.25,pitch:60};
 const output=split([n],4,0,8);
 assert.equal(output.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(output.map(s=>[s.start,s.duration,s.continued,s.continues]))),[[3.5,0.5,false,true],[4,0.75,true,false]]);
 assert.equal(output[0].note,n);assert.equal(n.duration,1.25);
});
check('visible window clips a spanning note and preserves continuation',()=>{
 const output=split([{start:1,duration:12}],4,4,4);
 assert.equal(output.length,1);
 assert.deepEqual([output[0].start,output[0].duration,output[0].continued,output[0].continues],[4,4,true,true]);
});
check('note exactly at measure boundary remains in its own bar',()=>{
 const output=split([{start:4,duration:2}],4,0,12);
 assert.equal(output.length,1);assert.equal(output[0].start,4);assert.equal(output[0].duration,2);
});
check('out of window and invalid notes are ignored',()=>{
 const output=split([{start:10,duration:2},{start:0,duration:-1},{start:1,duration:1}],4,0,4);
 assert.equal(output.length,1);assert.equal(output[0].start,1);
 assert.equal(split([{start:0,duration:2}],0,0,4).length,0);
});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
check('difficulty edition controls live in the instrument context only',()=>{
 assert.doesNotMatch(app,/class="orchestration-editions-bar"/);
 assert.match(app,/class="instrument-context-edition-actions"/);
 assert.match(app,/regenerateCurrentEdition\(instrumentContext!\)/);
 assert.match(app,/exportDifficultyEditionPack\(\);closeInstrumentContext/);
});
check('performance exposes ensemble, karaoke, harmony and split note slices',()=>{
 for(const needle of ["performanceView==='ensemble'","performanceVocalCue.count","performanceHarmony.upcomingKey","performanceCueParts","performanceRoll.slices","splitAtMeasureBoundaries(notes,beats,first,length)"])
  assert.ok(app.includes(needle),needle);
});
check('performance stage contains one combined navigation, section grid and beat panel',()=>{
 const section=app.slice(app.indexOf('<section v-if="performanceMode"'),app.indexOf('<div v-else class="layout">'));
 assert.ok(section.includes('class="performance-stage-top"'));
 assert.ok(section.includes('class="performance-stage-controls"'));
 assert.ok(section.includes('class="performance-section-grid"'));
 assert.ok(section.includes('class="performance-top-beat"'));
 assert.ok(section.includes('class="performance-stage-main performance-stage-only"'));
 assert.ok(!section.includes('<aside class="performance-harmony-sidebar"'));
 assert.ok(section.indexOf('class="performance-stage-top"')<section.indexOf('class="performance-cue-grid'));
});
check('view switch and fullscreen are in topbar and browser limitations are handled',()=>{
 const header=app.slice(app.indexOf('<header class="app-topbar">'),app.indexOf('</header>'));
 assert.ok(header.includes('class="performance-topbar-actions"'));
 assert.ok(header.includes('Notes &amp; karaoke'));
 assert.ok(header.includes('togglePerformanceFullscreen'));
 assert.ok(app.includes('typeof root.requestFullscreen'));
 assert.ok(app.includes('performanceStageCompact.value=true'));
});
check('instrument diagrams are default and a tap switches to roles and dynamics',()=>{
 assert.ok(app.includes('cardShowsDiagram(inst:Instrument)'));
 assert.ok(app.includes('flipPerformanceCard(part.inst)'));
 assert.ok(app.includes('<PerformanceChordDiagram v-if="cardShowsDiagram(part.inst)"'));
 assert.ok(app.includes("'--cue-beat-glow':performanceBeatGlow"));
 assert.ok(app.includes('class="performance-card-beats"'));
 assert.ok(!app.includes('class="performance-cue-activity"'));
 assert.ok(!app.includes('class="performance-cue-entry">Next entry'));
});
check('tablet stage prevents seek control from acquiring a vertical flex basis',()=>{
 const style=app.slice(app.lastIndexOf('/* iPad performance-stage layout correction'));
 assert.match(style,/\.performance-stage-main \.performance-compact-bar\s*\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\) auto/s);
 assert.match(style,/\.performance-stage-main \.performance-compact-seek\s*\{[^}]*flex:none/s);
 assert.match(style,/\.performance-stage-main \.performance-cue-grid\s*\{[^}]*flex:0 0 auto/s);
});
check('stage cards remain same height at each responsive size',()=>{
 assert.ok(app.includes('.performance-stage-only .performance-cue-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(287px,auto)'));
 assert.ok(app.includes('.performance-stage-only .performance-diagram-card{min-height:287px'));
 assert.ok(app.includes('class="performance-card-mode-hint"'));
});
check('ensemble activity remains fixed throughout each measure instead of toggling every attack',()=>{
 assert.ok(app.includes('const playingInMeasure=notes.some('));
 assert.ok(app.includes("const cueStatus=playingInMeasure?'ACTIVE':nextMeasureHasNotes?'NEXT BAR':'REST'"));
 assert.ok(app.includes('performanceBeatGlow'));
 assert.ok(app.includes("'--cue-beat-glow':performanceBeatGlow"));
 assert.ok(!app.includes("cueStatus=part.sounding?'PLAYING'"));
});
check('harmonic cue follows intra-measure changes and gives chords priority',()=>{
 const section=app.slice(app.indexOf('const performanceHarmony=computed('),app.indexOf('function performanceDynamic('));
 assert.ok(section.includes('chordAt(current?.chord'));
 assert.ok(section.includes('parseChordSequence(p.bars[i].chord,p.beats)'));
 assert.ok(section.includes('nextChordMeasure'));
 assert.ok(app.includes(':chord="performanceHarmony.chord" :next-chord="performanceHarmony.nextChord"'));
 assert.ok(app.includes('Key {{performanceHarmony.key}}'));
});
check('upright stage cards retain reduced-motion option',()=>{
 assert.ok(app.includes('container-name:performance-parts'));
 assert.ok(app.includes('grid-template-columns:repeat(4,minmax(0,1fr))'));
 assert.ok(app.includes('@media(prefers-reduced-motion:reduce)'));
});
check('orchestration controls are available in the menu without redundant top panels',()=>{
 const start=app.indexOf("<section v-else-if=\"active==='arrange'\"");
 const end=app.indexOf('<div v-if="measureSettingsOpen" class="note-properties-backdrop"',start);
 const area=app.slice(start,end);
 assert.ok(area.includes('class="orchestration-top-row"'));
 assert.ok(area.includes('class="orchestration-tools-popup"'));
 assert.ok(area.includes('showOrchestrationPhrasePlanner'));
 assert.ok(area.includes('<PhrasePlanEditor :project="project" :start-open="true" v-if="phrasePlannerVisible"'));
 assert.ok(area.includes('class="overview-legend orchestration-right-legend"'));
 assert.ok(!area.includes('class="map-context-toolbar"'));
});
check('instrument-aware diagrams expose exact note locations only where safe',()=>{
 const diag=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
 assert.ok(diag.includes('chordTones(symbol)'));
 assert.ok(diag.includes("family.value==='Violin'"));
 assert.ok(diag.includes("family.value==='Contrabass'"));
 assert.ok(diag.includes("family.value==='Guitar'"));
 assert.ok(diag.includes("family==='Piano'"));
 assert.ok(diag.includes('Chord tones · no button fingering inferred'));
 assert.ok(diag.includes('Concert pitches · transpose for written part'));
 assert.ok(diag.includes('Coming chord'));
});
console.log(count+' performance cue checks passed');
