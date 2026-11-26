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
 const start=app.indexOf('async function play(');
 const end=app.indexOf('// Contextual previews',start);
 const section=app.slice(start,end);
 assert.ok(section.includes('const defaultDuration=soundingSeconds(project.value,n.start,noteSoundingDuration(n),rehearsalSpeed.value)'));
 assert.ok(section.includes('renderArrangementNote(inst,n,event,defaultDuration,time,focusGain)'));
 const renderer=app.slice(app.indexOf('function renderArrangementNote('),app.indexOf('let synth:PolySynth|null=null;'));
 assert.ok(renderer.includes('durationSeconds:duration'));
 assert.ok(renderer.includes('triggerInstrument(inst,event.pitch,duration,time,velocity/127,n.technique)'));
 // Exercise the shared renderer with a sustained note and an expressive piano note.
 const body=renderer.slice(renderer.indexOf('{\n')+2,renderer.lastIndexOf('}'));
 const calls=[];
 const render=new Function('inst','n','event','duration','time','focusGain','focusInstrumentAudible','usesPizzicatoBank','playExpressiveEvent','triggerInstrument','Tone',body.replace(' as AudioContext',''));
 const run=(inst,n,event)=>render(inst,n,event,3.25,10,1,()=>true,()=>false,(_ctx,e)=>calls.push(['expressive',e.durationSeconds]),(_inst,_pitch,duration,_time,_velocity,technique)=>calls.push(['instrument',duration,technique]),{getContext:()=>({rawContext:{}})});
 run('Violin I',{technique:'arco'},{pitch:76,velocity:80,slideTo:79});
 run('Piano',{}, {pitch:60,velocity:80,endVelocity:100});
 assert.deepEqual(calls,[['expressive',3.25],['instrument',3.25,undefined]]);
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
 assert.ok(section.includes('monitorCapturePitch('));
 assert.ok(section.includes('releaseCaptureMonitorPitch('));
 assert.ok(section.includes("if(event.type==='pointercancel'||!captureRecording.value||held.started<0)return;"));
 assert.ok(app.includes('const captureMonitorPitches=new Set<number>()'));
 assert.ok(app.includes('function heldCaptureKeysHasPitch(pitch:number)'));
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
check('compact piano identifies both hands with actual note ranges and preserves upper-note colors',()=>{
 for(const token of ['pianoBassCaption','pianoUpperCaption','class="diagram-piano-register-badge"','class="diagram-piano diagram-piano-split"',"'LH'","'RH'",'background:#ffe1a1','is-piano-upper'])
   assert.ok(diagram.includes(token),token);
 assert.ok(diagram.includes("hand.id==='bass'?pianoBassCaption:pianoUpperCaption"));
 assert.ok(diagram.includes("isPianoMeasurePitch(midi)||isPlayingPitch(midi)"));
});
check('compact header keeps song selection visible alongside overflow and grouped file formats',()=>{
 const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
 assert.match(app,/<label class="topbar-song-label" for="header-song-picker">Song<\/label>/);
 assert.match(app,/id="header-song-picker"[^>]*@change="chooseSongFromPicker"/);
 assert.doesNotMatch(app,/\.app-topbar \.topbar-song[^{}]*\{display:none!important/);
 assert.ok(css.includes('.shell:not(.performance-live)>.app-topbar{flex-wrap:wrap!important}'));
 assert.match(css,/\.app-topbar \.topbar-song\{\s*display:flex!important/);
 assert.ok(app.includes('.app-topbar .topbar-compact-actions{display:flex'));
 assert.ok(app.includes('class="topbar-compact-actions"'));
 assert.ok(app.includes('class="files-organized-panel"')||app.includes('files-organized-panel'));
 const file=app.split('class="topbar-menu song-menu"')[1].split('class="topbar-group topbar-arrange"')[0];
 for(const token of ['exportXml','exportMxl','exportMscz()','exportDifficultyEditionPack','exportAbcLead','exportForMobileSheets','saveProject(project)',"openContextImport('project')"])
  assert.ok(file.includes(token),token);
 assert.doesNotMatch(app,/class="topbar-menu files-menu"/);
 for(const context of ['lead','arrange','instrument']){
  const action="openContextImport('"+context+"'";
  assert.ok(app.includes(action),action);
  assert.ok(!file.includes(action),action+' must remain outside File');
 }
 assert.match(app,/function openContextImport\([^\n]*importDialogOpen\.value=true/);
});
check('global status is error-only; dynamics editor exposes direct paint, scope and tone level',()=>{
 assert.ok(app.includes('&& actionableError" class="topbar-status topbar-error-only"'));
 assert.ok(app.includes('class="dynamics-quick-paint"'));
 assert.ok(app.includes("applyDynamicsMarkToSelection(mark)"));
 assert.ok(app.includes('class="dynamics-timeline-tiles"'));
 assert.ok(app.includes('dynamics-measure-main" :class='));
 assert.ok(app.includes('stageDynamicMeter('));
 assert.ok(app.includes('dynamicsScope'));
 assert.ok(app.includes("noteEditorTab==='expression'"));
});
console.log(count+' sustain, piano, session and toolbar checks passed');

check('dedicated pizzicato sample banks are routed independently of arco',()=>{
 assert.ok(app.includes('usesPizzicatoBank(inst,technique)?pizzicatoPlayers.get(inst)'));
 assert.ok(app.includes('loadSamples(inst,true)'));
 assert.ok(app.includes('!usesPizzicatoBank(inst,n.technique)'));
});
