const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
let count=0;
function check(label,fn){try{fn();count++;console.log('PASS '+label);}catch(e){console.error('FAIL '+label);throw e;}}
function load(file){
 const source=fs.readFileSync(path.join(root,file),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+js+'\n})',{console})(()=>{throw Error('Unexpected dependency in helper');},module,module.exports);
 return module.exports;
}
const tempo=load('src/playbackSpeed.ts');
const violin=load('src/violinPositions.ts');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const diag=fs.readFileSync(path.join(root,'src/PerformanceChordDiagram.vue'),'utf8');
check('normal speed is 1.0 and only supported values persist',()=>{
 assert.equal(tempo.normalizeRehearsalSpeed(0.8),0.8);
 assert.equal(tempo.normalizeRehearsalSpeed('0.8'),0.8);
 assert.equal(tempo.normalizeRehearsalSpeed(null),1);
 assert.equal(tempo.normalizeRehearsalSpeed(0.33),1);
 assert.equal(tempo.normalizeRehearsalSpeed(Infinity),1);
 assert.equal(tempo.normalizeRehearsalSpeed('invalid'),1);
});
check('rehearsal playback changes effective BPM and duration, not stored song BPM',()=>{
 assert.equal(tempo.effectiveTempo(120,0.8),96);
 assert.equal(tempo.effectiveTempo(120,1.25),150);
 assert.equal(tempo.playbackDuration(.4,.8),.5);
 assert.throws(()=>tempo.effectiveTempo(0,.8));
 assert.ok(app.includes('const effectivePlaybackBpm=computed('));
 assert.ok(app.includes('localStorage.setItem(\'tango-rehearsal-speed\''));
 assert.ok(!app.includes('project.value.bpm=effectivePlaybackBpm.value'));
});
check('beat ticks remain tempo-independent and preserve sub-beat attacks',()=>{
 assert.equal(tempo.beatOffsetTicks(8.5,192),'1632i');
 assert.equal(tempo.beatOffsetTicks(0,192),'0i');
 assert.throws(()=>tempo.beatOffsetTicks(-1,192));
 assert.ok(app.includes('transport.schedule(time=>'));
 assert.ok(app.includes('},whenTicks);'));
 assert.ok(app.includes('playbackStartBeat.value+transport.ticks/transport.PPQ'));
 assert.ok(app.includes('transport.bpm.value=effectivePlaybackBpm.value'));
});
check('tempo control appears in both editor and performance and changes speed in place',()=>{
 assert.ok(app.includes('class="topbar-menu playback-speed-menu"'));
 assert.ok(app.includes('v-for="speed in REHEARSAL_SPEEDS"'));
 assert.ok(app.includes('@click="setRehearsalSpeed(speed)"'));
 assert.ok(app.includes('if(Tone&&(playing.value||noteLoopPlaying.value||rhythmLoopPlaying.value)&&!capturePlaying.value)'));
});
check('open strings and notes up the neck produce plausible string/position suggestions',()=>{
 const open=violin.suggestViolinPosition(76);
 assert.equal(open.stringName,'E');
 assert.equal(open.position,'I');
 assert.equal(open.finger,0);
 const c6=violin.suggestViolinPosition(84);
 assert.equal(c6.stringName,'E');
 assert.equal(c6.position,'III');
 assert.ok(c6.finger>=1&&c6.finger<=4);
 const g6=violin.suggestViolinPosition(91);
 assert.equal(g6.stringName,'E');
 assert.equal(g6.position,'V');
 assert.equal(violin.suggestViolinPosition(40),null);
 assert.equal(violin.suggestViolinPosition(111),null);
});
check('position-specific semitone diagram changes range without changing card height',()=>{
 const c6=violin.suggestViolinPosition(84);
 assert.deepEqual(Array.from(violin.violinStopOffsets(c6)),[5,6,7,8,9,10,11,12]);
 assert.deepEqual(Array.from(violin.violinStopOffsets(null)),[0,1,2,3,4,5,6,7]);
 assert.ok(app.includes('const violinMeasurePitches=instrumentFamily(part.inst)'));
 assert.ok(app.includes(':violin-position="part.violinPosition"'));
 assert.ok(diag.includes('v-for="offset in displayedStops"'));
 assert.ok(diag.includes('class="diagram-violin-position"'));
 assert.ok(diag.includes('padding-top:19px;gap:2px'));
});
console.log(count+' rehearsal tempo and violin position checks passed');
