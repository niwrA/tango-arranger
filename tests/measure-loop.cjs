const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {createDomainLoader}=require('./load-domain.cjs');
const root=path.resolve(__dirname,'..');
const load=createDomainLoader();
const music=load('src/music.ts');
const {measureLoopEvents}=load('src/measureLoop.ts',{'./music':music});
const vue=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS',name);}
function equalEvents(actual,expected){assert.deepEqual(JSON.parse(JSON.stringify(actual)),expected);}
test('loop plays only notes in selected instrument-measure, with relative onsets',()=>{
  const notes=[{pitch:40,start:0,duration:1},{pitch:62,start:4,duration:1},{pitch:65,start:5.5,duration:0.5},{pitch:67,start:8,duration:1}];
  const events=measureLoopEvents(notes,1,4,120);
  assert.equal(events.length,2);assert.equal(events[0].pitch,62);assert.equal(events[0].onsetSeconds,0);
  assert.equal(events[1].pitch,65);assert.equal(events[1].onsetSeconds,0.75);
});
test('loop uses note-level staccato and marcato sounding gates and velocities',()=>{
  const notes=[{pitch:60,start:0,duration:1,articulation:'staccato',velocity:80},{pitch:64,start:1,duration:1,articulation:'marcato_staccato',velocity:80}];
  const events=measureLoopEvents(notes,0,4,120);
  assert.equal(events[0].durationSeconds,0.14);assert.equal(events[0].velocity,80);
  assert.equal(events[1].durationSeconds,0.29);assert.equal(events[1].velocity,94);
});
test('loop honors custom sounding gate, tempo and global transposition',()=>{
  const events=measureLoopEvents([{pitch:70,start:2,duration:2,gate:0.5,velocity:92}],0,4,60,3);
  equalEvents(events,[{pitch:73,onsetSeconds:2,durationSeconds:1,velocity:92}]);
});
test('loop clips tails at measure boundary, preserving written note duration',()=>{
  const note={pitch:70,start:3.75,duration:2,gate:1};
  const events=measureLoopEvents([note],0,4,120);
  assert.equal(events[0].durationSeconds,0.125);assert.equal(note.duration,2);
});
test('loop rejects invalid timing and supports empty measures',()=>{
  assert.equal(measureLoopEvents([],0,4,120).length,0);
  assert.throws(()=>measureLoopEvents([],0,4,0),/Tempo/);
  assert.throws(()=>measureLoopEvents([],-1,4,120),/measure index/);
});
test('note editor loop UI has play/stop, beat indicator and shortcut',()=>{
  assert.match(vue,/@click="toggleNoteLoop"/);
  assert.match(vue,/:aria-pressed="noteLoopPlaying" @click="toggleNoteLoop"[^>]*>\{\{noteLoopPlaying\?'■ Stop':'▶ Loop'/);
  assert.match(vue,/note-loop-playhead/);
  assert.match(vue,/action==='loop'\)\{event\.preventDefault\(\);void toggleNoteLoop\(\)/);
  assert.match(vue,/role="status" aria-live="polite"/);
});
test('loop refreshes notes on every measure repeat and stops on navigation',()=>{
  assert.match(vue,/transport\.scheduleRepeat\(time=>\{[\s\S]*?measureLoopEvents\(playbackNotesInRange\(practiceScore\.value\[noteInst\.value\]/);
  assert.match(vue,/\},'1m',0\)/);
  assert.match(vue,/function openNoteEditor\(inst:Instrument=overviewInstrument\.value,b:number=selectedBar\.value\)\{/);
  assert.match(vue,/if\(!keepFocusLoop\)stopNoteLoop\(\)/);
  assert.match(vue,/watch\(active,tab=>\{[\s\S]*?if\(tab!=='notes'&&noteLoopPlaying\.value\)stopNoteLoop\(\)/);
  assert.match(vue,/function selectProjectInEditor\(p:Project\)\{[^}]*?stopPlayback\(\)/);
  assert.match(vue,/function stopPlayback\(\)\{[\s\S]*?noteLoopSession\+\+/);
});
test('Vue script parses and retains audio error handling',()=>{
  const script=vue.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script);
  const out=ts.transpileModule(script,{reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}});
  assert.deepEqual((out.diagnostics??[]).filter(x=>x.category===ts.DiagnosticCategory.Error).map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')),[]);
  assert.match(vue,/Measure loop unavailable:/);
});
console.log(`${passed} measure-loop checks passed`);
