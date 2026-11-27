const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/performanceCues.ts'),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const mod={exports:{}};vm.runInNewContext(`(function(module,exports){${js}\n})`,{})(mod,mod.exports);
const split=mod.exports.splitAtMeasureBoundaries;
const sounding=mod.exports.soundingPitchesAtBeat;
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
check('live chord voicing detects overlapping exact pitches without invented notes',()=>{
 const notes=[{pitch:60,start:0,duration:2,gate:1},{pitch:64,start:0,duration:1,gate:.5},{pitch:67,start:.5,duration:2,gate:1}];
 const soundingDuration=n=>n.duration*n.gate;
 assert.deepEqual(Array.from(sounding(notes,.25,soundingDuration)),[60,64]);
 assert.deepEqual(Array.from(sounding(notes,.75,soundingDuration)),[60,67]);
 assert.deepEqual(Array.from(sounding(notes,2.25,soundingDuration)),[67]);
 assert.deepEqual(Array.from(sounding(notes,2.5,soundingDuration)),[]);
});
check('instrument note highlights obey gate, repeated voices, rests and the exact beat',()=>{
 const notes=[{pitch:72,start:2,duration:1,gate:.25},{pitch:72,start:2,duration:.5,gate:1},{pitch:74,start:4,duration:1,gate:1}];
 const soundingDuration=n=>n.duration*n.gate;
 assert.deepEqual(Array.from(sounding(notes,1.999,soundingDuration)),[]);
 assert.deepEqual(Array.from(sounding(notes,2.10,soundingDuration)),[72]);
 assert.deepEqual(Array.from(sounding(notes,2.4,soundingDuration)),[72]);
 assert.deepEqual(Array.from(sounding(notes,2.5,soundingDuration)),[]);
 assert.deepEqual(Array.from(sounding(notes,4,soundingDuration)),[74]);
 assert.deepEqual(Array.from(sounding(notes,NaN,soundingDuration)),[]);
});
check('sounding pitches remain accurate on measure crossings and outside pictured octave',()=>{
 const notes=[{pitch:40,start:2.75,duration:2,gate:1},{pitch:84,start:3,duration:2,gate:1}];
 const actual=Array.from(sounding(notes,4.1,n=>n.duration*n.gate));
 assert.deepEqual(actual,[40,84]);
});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
check('difficulty edition controls live in the instrument context only',()=>{
 assert.doesNotMatch(app,/class="orchestration-editions-bar"/);
 assert.match(app,/class="instrument-context-edition-actions"/);
 assert.match(app,/regenerateCurrentEdition\(instrumentContext!\)/);
 assert.match(app,/exportDifficultyEditionPack\(\);closeInstrumentContext/);
});
check('performance exposes ensemble, karaoke, harmony and split note slices',()=>{
 for(const needle of ["performanceView==='ensemble'","performanceVocalCue.count","performanceChordBeats.current","performanceCueParts","performanceRoll.slices","splitAtMeasureBoundaries(notes,beats,first,length)"])
  assert.ok(app.includes(needle),needle);
});
check('top panel retains compact seek section and shared beat counter',()=>{
 const section=app.slice(app.indexOf('<section v-if="performanceMode"'),app.indexOf('<div v-else class="layout">'));
 assert.ok(section.includes('class="performance-stage-top"'));
 assert.ok(section.includes('class="performance-stage-controls"'));
 assert.ok(section.includes('class="performance-seek-index"'));
 assert.ok(section.includes('class="performance-section-grid"'));
 assert.ok(section.includes('class="performance-top-beat"'));
 assert.ok(section.includes('class="performance-stage-main performance-stage-only"'));
 assert.ok(!section.includes('class="performance-stage-top-title"'));
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
check('instrument diagrams default to per-beat chords and tap to switch to roles',()=>{
 assert.ok(app.includes('cardShowsDiagram(inst:Instrument)'));
 assert.ok(app.includes('flipPerformanceCard(part.inst)'));
 assert.match(app,/<PerformanceChordDiagram v-(?:if|else-if)="cardShowsDiagram\(part\.inst\)"/);
 assert.match(app,/<PerformanceRoleCues v-else[^>]*:same-measure-chord="roleCueHarmony\.sameBar"/);
 assert.ok(app.includes(':current-beats="performanceChordBeats.current"'));
 assert.ok(app.includes(':upcoming-beats="performanceChordBeats.next"'));
 assert.ok(app.includes("'--cue-beat-glow':performanceBeatGlow"));
 assert.ok(!app.includes('class="performance-card-beats"'));
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
check('harmonic cues follow intra-measure changes and current measure beats',()=>{
 const section=app.slice(app.indexOf('const performanceHarmony=computed('),app.indexOf('function performanceDynamic('));
 assert.ok(section.includes('stageHarmonyAt(p,bar,localBeat)'));
 for(const binding of ['chord:cue.current','nextChord:cue.next','nextChordMeasure:cue.nextMeasure','nextChordBeat:cue.nextBeat'])
  assert.ok(section.includes(binding),binding);
 assert.ok(app.includes('const performanceChordBeats=computed('));
 assert.ok(app.includes('return symbol;'));
 assert.ok(app.includes("if(symbol===previous)return '–'"));
 assert.match(app,/<PerformanceChordDiagram[^>]*:chord="performanceHarmony.chord" :next-chord="performanceHarmony.nextChord"/);
 assert.match(app,/<PerformanceRoleCues[^>]*:chord="performanceHarmony.chord" :next-chord="roleCueHarmony.chord"/);
});
check('stage harmony follows actual chord changes, transposition and score boundaries',()=>{
 const {stageHarmonyAt}=require('./load-domain.cjs').createDomainLoader()('src/music.ts');
 const project={beats:4,sectionKeys:{A:'C'},bars:[
  {section:'A',chord:'C,G7'},{section:'A',chord:'G7'},{section:'A',chord:'Am'}
 ]};
 const cue=(p,bar,beat)=>JSON.parse(JSON.stringify(stageHarmonyAt(p,bar,beat)));
 assert.deepEqual(cue(project,0,0),{current:'C',next:'G7',sameBar:true,nextMeasure:1,nextBeat:3});
 assert.deepEqual(cue(project,0,1.99),{current:'C',next:'G7',sameBar:true,nextMeasure:1,nextBeat:3});
 assert.deepEqual(cue(project,0,2),{current:'G7',next:'G7',sameBar:false,nextMeasure:2,nextBeat:1});
 assert.deepEqual(cue(project,1,3),{current:'G7',next:'Am',sameBar:false,nextMeasure:3,nextBeat:1});
 assert.deepEqual(cue(project,2,3),{current:'Am',next:'—',sameBar:false,nextMeasure:null,nextBeat:null});
 assert.deepEqual(cue({...project,transposeSemitones:2},0,0),{current:'D',next:'A7',sameBar:true,nextMeasure:1,nextBeat:3});
 const repeated={...project,bars:[{section:'A',chord:'C,C,G7,G7'},...project.bars.slice(1)]};
 assert.deepEqual(cue(repeated,0,0),{current:'C',next:'G7',sameBar:true,nextMeasure:1,nextBeat:3});
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
check('compact instrument-specific diagram rows retain tone labeling and readable beats',()=>{
 const diag=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
 assert.ok(diag.includes('chordTones(symbol)'));
 assert.ok(diag.includes("family.value==='Violin'"));
 assert.ok(diag.includes('fingerboardStrings(family.value)'));
 const fingerboard=fs.readFileSync(path.join(root,'src/stringFingerboard.ts'),'utf8');
 assert.ok(fingerboard.includes("inst.startsWith('Violin')"));
 assert.ok(fingerboard.includes("inst.startsWith('Contrabass')"));
 assert.ok(fingerboard.includes("inst.startsWith('Guitar')"));
 assert.ok(diag.includes("family==='Piano'"));
 assert.ok(diag.includes('Chord tones · no button fingering inferred'));
 assert.ok(diag.includes('Concert pitches · transpose for written part'));
 assert.ok(diag.includes('diagram-measure-chords'));
 assert.ok(diag.includes('diagram-upcoming-measure'));
 assert.ok(diag.includes('activeBeat===index+1'));
 assert.ok(!diag.includes('<small>Current chord</small>'));
 assert.ok(!diag.includes('class="diagram-footer"'));
});
check('stage title is shortened only in presentation, with full name preserved as tooltip',()=>{
 assert.ok(app.includes('const performanceShortTitle=computed('));
 assert.ok(app.includes("return original.replace(/\\s*[([{].*$/,'').trim()||original"));
 assert.ok(app.includes('class="performance-topbar-song-title" :title="project.title'));
 assert.ok(app.includes('.performance-live .app-topbar .brand{display:none!important}'));
});
check('mixed-case Maj7 chord highlights the major seventh rather than dominant seventh',()=>{
 const {chordTones}=require('./load-domain.cjs').createDomainLoader()('src/music.ts');
 const tones=Array.from(chordTones('GMaj7'));
 assert.deepEqual(tones,[7,11,2,6]);
 assert.deepEqual(Array.from(chordTones('G7')),[7,11,2,5]);
});
check('per-part chord diagrams highlight sounding notes and dim only unplayed chord voicings',()=>{
 const diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
 assert.ok(app.includes('soundingPitchesAtBeat(notes,performanceBeat.value,noteSoundingDuration)'));
 assert.ok(app.includes('activePitches=playing.value?'));
 assert.ok(app.includes("part.role==='chords'&&activePitches.length>0"));
 assert.ok(app.includes(':active-pitches="part.activePitches"'));
 assert.ok(app.includes(':dim-unplayed-chord-tones="part.dimUnplayedChordTones"'));
 assert.match(diagram,/activePitches:number\[\]/);
 assert.match(diagram,/dimUnplayedChordTones:boolean/);
 assert.match(diagram,/activeStringNotes\?:\{pitch:number;stringMidi\?:number\}\[\]/);
 assert.ok(diagram.includes('explicit.some(n=>n.stringMidi===stringMidi)'));
 assert.ok(diagram.includes('class="diagram-live-pitches"'));
 assert.ok(diagram.includes("'is-sounding':isPlayingPitch(midi)"));
 assert.ok(diagram.includes("'is-sounding':isPlayingStringPitch(string.midi,string.midi+offset)"));
 assert.ok(diagram.includes("'is-sounding':isPlayingTone(tone)"));
 assert.ok(diagram.includes("'is-unplayed-chord-tone':shouldDimTone(midi)"));
 assert.ok(diagram.includes("is-unplayed-chord-tone:not(.is-sounding)"));
});
check('out-of-range sounding pitches stay in a fixed overlay, never new layout rows',()=>{
 const diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
 assert.ok(diagram.includes('class="diagram-visual-stage"'));
 assert.ok(diagram.includes('visibleUnmappedPitches=computed(()=>unmappedSoundingPitches.value.slice(0,3))'));
 assert.ok(diagram.includes('extraUnmappedCount=computed('));
 assert.ok(diagram.includes('class="diagram-live-pitches"'));
 assert.match(diagram,/\.diagram-live-pitches\s*\{[^}]*position:absolute;[^}]*flex-wrap:nowrap;/s);
 assert.match(diagram,/\.diagram-visual-stage\{position:relative;/);
 assert.match(diagram,/\.diagram-targets\{height:94px;min-height:94px;max-height:94px/);
 assert.match(diagram,/\.diagram-fingerboard\{height:98px;min-height:98px;max-height:98px/);
 assert.match(diagram,/\.diagram-piano\{height:80px;min-height:80px;max-height:80px/);
});
check('ensemble performance cards have a fixed row height while playback advances',()=>{
 assert.match(app,/\.performance-live \.performance-stage-only \.performance-cue-grid\{\s*grid-auto-rows:270px!important;/s);
 assert.match(app,/\.performance-live \.performance-stage-only \.performance-diagram-card\{\s*height:270px!important;min-height:270px!important;max-height:270px!important;/s);
 assert.ok(app.includes('height:282px!important;min-height:282px!important;max-height:282px!important'));
});
check('fullscreen and editor exit are separate equal-size controls with clear iconography',()=>{
 const appIcons=fs.readFileSync(path.join(root,'src/AppIcon.vue'),'utf8');
 assert.ok(appIcons.includes("maximize:'M8 3H5"));
 assert.ok(appIcons.includes("minimize:'M8 8H3"));
 assert.ok(app.includes('class="performance-stage-actions"'));
 assert.match(app,/<\/details>\s*<button v-if="performanceMode"[^>]*class="secondary icon-action performance-editor-button"[^>]*aria-label="Return to editor"/);
 assert.ok(app.includes('class="secondary performance-stage-action performance-fullscreen-button"'));
 assert.ok(app.includes('performanceFullscreenActive||performanceStageCompact?\'minimize\':\'maximize\''));
 assert.ok(app.includes('class="performance-topbar-view-switch"'));
 assert.ok(app.includes('height:42px!important;min-height:42px!important;padding:3px!important;box-sizing:border-box'));
 assert.ok(!app.includes('performanceMode=!performanceMode'));
});
check('rehearsal speed keeps written song BPM unchanged while converting note durations',()=>{
 const code=fs.readFileSync(path.join(root,'src/playbackSpeed.ts'),'utf8');
 const output=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(`(function(module,exports){${output}\n})`,{})(module,module.exports);
 const h=module.exports;
 assert.equal(h.normalizeRehearsalSpeed('0.8'),0.8);
 assert.equal(h.normalizeRehearsalSpeed(0.82),1);
 assert.equal(h.normalizeRehearsalSpeed(1.25),1.25);
 assert.equal(h.effectiveTempo(120,0.8),96);
 assert.equal(h.playbackDuration(1,0.5),2);
 assert.equal(h.beatOffsetTicks(2.5,192),'480i');
});
check('editor and stage speed popup controls the same musical-tick arrangement transport',()=>{
 assert.ok(app.includes('class="topbar-menu playback-speed-menu"'));
 assert.ok(app.includes('v-for="speed in REHEARSAL_SPEEDS"'));
 assert.ok(app.includes('setRehearsalSpeed(speed)'));
 assert.ok(app.includes('tango-rehearsal-speed'));
 assert.ok(app.includes('transport.ticks/transport.PPQ'));
 assert.ok(app.includes('const whenTicks=beatOffsetTicks(n.start-transportStartBeat,transport.PPQ)'));
 assert.ok(app.includes('transport.bpm.value=effectivePlaybackBpm.value'));
 assert.ok(app.includes('playbackDuration(event.durationSeconds,rehearsalSpeed.value)'));
 assert.ok(!app.includes('Tone.getTransport().seconds*project.value.bpm/60'));
});
check('violin high notes get deterministic string-position suggestions',()=>{
 const code=fs.readFileSync(path.join(root,'src/violinPositions.ts'),'utf8');
 const output=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(`(function(module,exports){${output}\n})`,{})(module,module.exports);
 const h=module.exports;
 const open=h.suggestViolinPosition(55);
 assert.equal(open.stringName,'G');assert.equal(open.position,'I');assert.equal(open.finger,0);
 const higher=h.suggestViolinPosition(84);
 assert.equal(higher.stringName,'E');assert.equal(higher.position,'III');
 assert.equal(h.suggestViolinPosition(110),null);
 assert.deepEqual(Array.from(h.violinStopOffsets(higher)),[5,6,7,8,9,10,11,12]);
});
check('violin chart remains fixed-size and displays the measure-level suggested hand position',()=>{
 const diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
 assert.ok(app.includes('const violinPosition=violinMeasurePitches.length?suggestViolinPosition('));
 assert.ok(app.includes(':violin-position="part.violinPosition"'));
 assert.ok(diagram.includes('violinStopOffsets(props.violinPosition??null)'));
 assert.ok(diagram.includes('class="diagram-violin-position"'));
 assert.ok(diagram.includes("'Position '+props.violinPosition.position"));
 assert.ok(diagram.includes('.diagram-fingerboard.diagram-violin-fingerboard{position:relative;padding-top:19px;gap:2px}'));
});
console.log(count+' performance cue checks passed');
