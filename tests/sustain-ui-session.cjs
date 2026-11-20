const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {createDomainLoader}=require('./load-domain.cjs');
const music=createDomainLoader()('src/music.ts');
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const diagram=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
let count=0;function check(name,fn){fn();console.log('PASS '+name);count++;}
check('sustained notation keeps its sounding gate even if an inherited style is staccato',()=>{
 const note={pitch:76,start:0,duration:3,articulation:'staccato',gate:1,technique:'arco'};
 assert.equal(music.noteSoundingDuration(note),3);
 assert.ok(Math.abs(music.noteSoundingDuration({...note,gate:undefined})-.84)<1e-9);
 assert.ok(app.includes("if(t.held){note.gate=1;if(note.technique==='arco')note.articulation='legato';}"));
 assert.ok(app.includes('held:true'));
});
check('normal score playback does not clip sustained note duration at the measure boundary',()=>{
 const start=app.indexOf('async function play(origin:PlaybackOrigin)');
 const end=app.indexOf('// Contextual previews',start);
 const section=app.slice(start,end);
 assert.ok(section.includes('const defaultDuration=playbackDuration(noteSoundingDuration(n)*60/project.value.bpm,rehearsalSpeed.value)'));
 assert.ok(section.includes('durationSeconds:defaultDuration'));
 assert.ok(section.includes('triggerInstrument(inst,event.pitch,defaultDuration'));
 assert.ok(section.includes('n.technique'));
});
check('bowed violin uses sustained synth fallback while pizzicato may keep short sample attacks',()=>{
 assert.ok(app.includes("const bowedViolin=inst.toLowerCase().includes('violin')&&technique!=='pizzicato';"));
 assert.ok(app.includes("audioEngine.value==='samples'&&!bowedViolin&&!needsSustainingSynth(inst,duration)"));
 assert.ok(app.includes("name.includes('violin')?0.93:0.72"));
 assert.ok(app.includes('sustain:0.9,release:0.23'));
});
check('note-editor capture pointer sustains outside recording and releases on pointerup',()=>{
 const start=app.indexOf('function capturePianoKey(event:PointerEvent');
 const end=app.indexOf('function capturePianoKeyClick(event:MouseEvent',start);
 const section=app.slice(start,end);
 assert.ok(section.includes('heldCaptureKeys.set(id,{pitch,started})'));
 assert.ok(section.includes('startAudioFromGesture().then(tone=>'));
 assert.ok(section.includes('if(!heldCaptureKeys.has(id))return;'));
 assert.ok(section.includes('triggerAttack('));
 assert.ok(section.includes('triggerRelease('));
 assert.ok(section.includes('if(!capturePlaying.value||held.started<0)return;'));
 assert.ok(!section.includes('void auditionPitch(pitch);return;'));
});
check('refresh restores performance and editor location but never restarts playback',()=>{
 for(const token of ['tango-performance-mode','tango-performance-view','tango-note-editor-subtab','tango-last-note-instrument','tango-last-measure','tango-last-performance-measure'])
  assert.ok(app.includes(token),token);
 assert.ok(app.includes('performanceBeat.value=selectedBar.value*saved.beats'));
 assert.ok(app.includes('watch(performanceBar,bar=>'));
 const from=app.indexOf('async function initializeLocalLibrary()');
 const to=app.indexOf('// Keep topical menus',from);
 assert.ok(!app.slice(from,to).includes("void play("));
});
check('compact piano identifies both octaves and uses a single warm upper-note color family',()=>{
 for(const token of ['pianoBassCaption','pianoUpperCaption','class="diagram-piano-register-labels"','LH {{pianoBassCaption}}','RH {{pianoUpperCaption}}','background:#ffe1a1','is-piano-upper'])
   assert.ok(diagram.includes(token),token);
 assert.ok(diagram.includes("isPianoMeasurePitch(midi)||isPlayingPitch(midi)"));
});
check('header is single row with responsive overflow and grouped complete file formats',()=>{
 const from=app.lastIndexOf('/* One-row transport.');
 const tail=app.slice(from);
 assert.ok(tail.includes('flex-wrap:nowrap!important'));
 assert.ok(tail.includes('.app-topbar .topbar-compact-actions{display:flex'));
 assert.ok(app.includes('class="topbar-compact-actions"'));
 assert.ok(app.includes('class="files-organized-panel"')||app.includes('files-organized-panel'));
 for(const token of ['exportXml','exportMxl','exportMscz()','exportDifficultyEditionPack','exportAbcLead','exportForMobileSheets','saveProject(project)','importDialogOpen=true'])
  assert.ok(app.includes(token),token);
});
check('global status is error-only; dynamics editor exposes direct paint, scope and tone level',()=>{
 assert.ok(app.includes('&& actionableError" class="topbar-status topbar-error-only"'));
 assert.ok(app.includes('class="dynamics-quick-paint"'));
 assert.ok(app.includes("applyDynamicsMarkToBar(selectedBar,mark)"));
 assert.ok(app.includes('class="dynamics-timeline-tiles"'));
 assert.ok(app.includes('dynamics-measure-main" :class='));
 assert.ok(app.includes('stageDynamicMeter('));
 assert.ok(app.includes('dynamicsScope'));
 assert.ok(app.includes("noteEditorTab==='expression'"));
});
console.log(count+' sustain, piano, session and toolbar checks passed');
