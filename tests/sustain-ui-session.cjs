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
 assert.ok(renderer.includes('triggerInstrument(inst,event.pitch,duration,time,velocity/127,technique)'));
 // Exercise the shared renderer with a sustained note and an expressive piano note.
 const body=renderer.slice(renderer.indexOf('{')+1,renderer.lastIndexOf('}'));
 const calls=[];
 const render=new Function('inst','n','event','duration','time','focusGain','preview','focusInstrumentAudible','usesPizzicatoBank','resolveStringTechnique','violinTechnique','plannedViolinTechnique','project','playExpressiveEvent','triggerInstrument','Tone','audioEngine','arcoBank','playSampleGesture','instrumentGainDb','usesModeledAudio','renderModeledPart',body.replaceAll(' as AudioContext','').replaceAll(' as Instrument',''));
 const output={};
 const previewProject={beats:4,technique:'pizzicato'};
 const run=(inst,n,event,preview)=>render(inst,n,event,3.25,10,1,preview,()=>true,()=>false,(_inst,explicit,planned)=>explicit??planned,()=>undefined,p=>p.technique,{value:{beats:4}},(_ctx,e,_time,destination)=>calls.push(['expressive',e.durationSeconds,destination]),(_inst,_pitch,duration,_time,_velocity,technique)=>calls.push(['instrument',duration,technique]),{getContext:()=>({rawContext:{}})},{value:'samples'},name=>name==='Violin I'?{}:undefined,()=>false,()=>0,inst=>inst.startsWith('Voice')||inst.startsWith('Bandoneon'),(inst,event,_time,_staff,destination)=>calls.push(['modeled',inst,event.durationSeconds,event.endVelocity,destination]));
 run('Violin I',{technique:'arco'},{pitch:76,velocity:80,slideTo:79});
 run('Piano',{}, {pitch:60,velocity:80,endVelocity:100});
 run('Violin I',{technique:'arco'},{pitch:76,velocity:80,slideTo:79},{project:previewProject,output});
 run('Violin I',{start:0},{pitch:76,velocity:80},{project:previewProject,output});
 run('Voice II',{start:0},{pitch:60,velocity:80,endVelocity:109},{project:previewProject,output});
 assert.deepEqual(calls,[['expressive',3.25,undefined],['instrument',3.25,undefined],['expressive',3.25,output],['instrument',3.25,'pizzicato'],['modeled','Voice II',3.25,109,output]]);
});
check('bowed strings without a usable sample retain the sustaining synth fallback',()=>{
 const trigger=app.slice(app.indexOf('function triggerInstrument('),app.indexOf('function renderArrangementNote('));
 assert.match(trigger,/!canUseArcoSample\(inst,duration\)&&playArcoSustain\(/);
 assert.match(trigger,/canUseArcoSample\(inst,duration\)\?samplePlayers.get\(inst\):undefined/);
 assert.match(trigger,/else instrumentSynth\(inst\).triggerAttackRelease\(/);
 assert.ok(app.includes("name.includes('violin')?0.93:0.72"));
 const loop=app.slice(app.indexOf('async function toggleNoteLoop('),app.indexOf('watch(active,tab',app.indexOf('async function toggleNoteLoop(')));
 assert.match(loop,/renderArrangementNote\(inst,note,event,playbackDuration\(event.durationSeconds,rehearsalSpeed.value\)/);
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
check('dedicated pizzicato sample banks are routed independently of arco',()=>{
 assert.ok(app.includes('usesPizzicatoBank(inst,technique)?selectPizzicatoPlayer(inst,velocity)'));
 assert.ok(app.includes('loadSamples(inst,true)'));
 assert.ok(app.includes('!usesPizzicatoBank(inst,technique)'));
});

check('imported violin notes inherit pizzicato unless explicitly bowed',()=>{
 const bank=createDomainLoader()('src/pizzicatoSamples.ts');
 assert.equal(bank.resolveStringTechnique('Violin II',undefined,'pizzicato'), 'pizzicato');
 assert.equal(bank.resolveStringTechnique('Violin II',undefined,'pizzicato_arpeggio'), 'pizzicato');
 assert.equal(bank.resolveStringTechnique('Violin II','arco','pizzicato'), 'arco');
 assert.equal(bank.resolveStringTechnique('Violin II',undefined,'pizzicato',true), 'arco');
 assert.equal(bank.resolveStringTechnique('Violin II',undefined,'sustained'), undefined);
});

console.log(count+' sustain, piano, session and toolbar checks passed');
