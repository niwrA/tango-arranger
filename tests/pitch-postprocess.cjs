const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
let ts;try{ts=require('typescript');}catch{const cp=require('node:child_process');ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/pitchPostprocess.ts'),'utf8');
const output=ts.transpileModule(source,{reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
assert.deepEqual((output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error),[]);
const mod={exports:{}};vm.runInNewContext('(function(module,exports){'+output.outputText+'\n})',{})(mod,mod.exports);
const {reprocessPitchFrames,DEFAULT_PITCH_POSTPROCESS}=mod.exports;
const settings=(extra={})=>({...DEFAULT_PITCH_POSTPROCESS,...extra});
const frames=(notes,offset=0)=>notes.map((n,i)=>({timeSeconds:i*0.05,beat:offset+i*0.1,
  midi:n,frequencyHz:null,clarity:n===null?null:0.99,levelDbfs:n===null?-88:-42}));
let count=0;function test(label,fn){fn();count++;console.log('PASS '+label);}
test('count-in tones are excluded and an intentional upbeat rest is retained',()=>{
 const input=[...frames([68,68,72,72],-3.5),...frames([47.49,47.55,47.65,47.6,47.52],3).map(f=>({...f,timeSeconds:f.timeSeconds+2}))];
 const notes=reprocessPitchFrames(input,settings(),0,8);
 assert.equal(notes.length,1);assert.equal(notes[0].startBeat,3);assert.equal(notes[0].pitch,48);
});
test('slightly flat C3 with small oscillations is one note, not B2/C3 fragments',()=>{
 const x=[47.52,47.66,47.55,47.7,47.48,47.61,47.58,47.73,47.56,47.62];
 const notes=reprocessPitchFrames(frames(x),settings(),0,4);
 assert.equal(notes.length,1);assert.equal(notes[0].pitch,48);
 assert.ok(notes[0].intonationCents<=-25);
});
test('pitch changes between C3, C sharp 3 and C3 are preserved',()=>{
 const notes=reprocessPitchFrames(frames([...Array(10).fill(48),...Array(10).fill(49),...Array(10).fill(48)]),settings(),0,4);
 assert.deepEqual(Array.from(notes,n=>n.pitch),[48,49,48]);
});
test('a short consonant-like break can separate two identical notes',()=>{
 const notes=reprocessPitchFrames(frames([...Array(9).fill(48),null,null,...Array(9).fill(48)]),settings(),0,4);
 assert.equal(notes.length,2);assert.deepEqual(Array.from(notes,n=>n.pitch),[48,48]);
});
test('three repeated same-pitch attacks with audible valleys are separated',()=>{
 const input=frames(Array(36).fill(69));
 for(const i of [12,24])input[i].levelDbfs=-61;
 const notes=reprocessPitchFrames(input,settings({onsetGridBeats:0,durationGridBeats:0}),0,5);
 assert.equal(notes.length,3);
 assert.deepEqual(Array.from(notes,n=>n.pitch),[69,69,69]);
});
test('three guitar-like repeated attacks survive transient octave-low pitch estimates',()=>{
 const input=frames(Array(36).fill(69));
 for(const i of [12,24]){
  input[i].midi=null;input[i].clarity=null;input[i].levelDbfs=-66;
  input[i+1].midi=57;input[i+1].levelDbfs=-48;
 }
 const notes=reprocessPitchFrames(input,settings({onsetGridBeats:0,durationGridBeats:0}),0,5);
 assert.deepEqual(Array.from(notes,n=>n.pitch),[69,69,69]);
});
test('isolated octave transient without an amplitude valley does not split a sustain',()=>{
 const input=frames(Array(36).fill(69));
 input[17].midi=57;
 const notes=reprocessPitchFrames(input,settings({onsetGridBeats:0,durationGridBeats:0}),0,5);
 assert.equal(notes.length,1);
 assert.equal(notes[0].pitch,69);
});
test('smooth dynamics on a sustained note do not create false repeats',()=>{
 const input=frames(Array(36).fill(69));
 input.forEach((f,i)=>{f.levelDbfs=-40-10*i/35;});
 assert.equal(reprocessPitchFrames(input,settings({onsetGridBeats:0,durationGridBeats:0}),0,5).length,1);
});
test('brief tracking dropouts without a clear dip can remain one note',()=>{
 const input=frames([...Array(9).fill(48),null,...Array(9).fill(48)]);
 input[9].levelDbfs=-45;
 assert.equal(reprocessPitchFrames(input,settings(),0,4).length,1);
});
test('natural 5Hz vibrato is annotated but does not create extra notes',()=>{
 const pitches=Array.from({length:32},(_,i)=>48+0.28*Math.sin(2*Math.PI*5*i*0.05));
 const on=reprocessPitchFrames(frames(pitches),settings({detectVibrato:true}),0,4);
 const off=reprocessPitchFrames(frames(pitches),settings({detectVibrato:false}),0,4);
 assert.equal(on.length,1);assert.equal(on[0].pitch,48);assert.equal(on[0].vibrato,true);
 assert.equal(off[0].vibrato,false);
});
test('steady sung notes are not flagged as vibrato',()=>{
 const notes=reprocessPitchFrames(frames(Array(28).fill(47.66)),settings({detectVibrato:true}),0,4);
 assert.equal(notes.length,1);assert.equal(notes[0].vibrato,false);
});
test('onset and duration grids are independent and raw timing can be retained',()=>{
 const x=frames(Array(7).fill(48),0.36);
 const free=reprocessPitchFrames(x,settings({onsetGridBeats:0,durationGridBeats:0}),0,4);
 const rounded=reprocessPitchFrames(x,settings({onsetGridBeats:0.5,durationGridBeats:0.25}),0,4);
 assert.equal(free[0].startBeat,0.36);assert.equal(rounded[0].startBeat,0.5);
 assert.ok(rounded[0].durationBeats%0.25===0);
 const startOnly=reprocessPitchFrames(x,settings({onsetGridBeats:0.5,durationGridBeats:0}),0,4);
 assert.equal(startOnly[0].durationBeats,free[0].durationBeats,'moving the start leaves the measured duration unchanged');
});
test('temporary recording key is removed before written pitch estimation',()=>{
 const notes=reprocessPitchFrames(frames(Array(7).fill(50.58)),settings(),3,4);
 assert.equal(notes[0].pitch,48);
});
test('silence and count-in alone do not generate notes',()=>{
 assert.equal(reprocessPitchFrames(frames([null,null,null]),settings(),0,4).length,0);
 assert.equal(reprocessPitchFrames(frames([68,68,68],-2),settings(),0,4).length,0);
});
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
test('raw frames can be processed repeatedly without applying to the score',()=>{
 assert.match(app,/function reprocessPitchTake\(/);assert.match(app,/function usePitchPreviewAsDraft\(/);
 assert.match(app,/function restoreMicrophoneOriginal\(/);assert.match(app,/function splitPitchPreviewNote\(/);
 assert.match(app,/const pitchPreviewNotes=ref<ProcessedPitchNote\[\]>/);
});
test('stopping microphone does not close the shared Tone output context',()=>{
 const begin=app.indexOf('function stopMicrophoneCapture()');const end=app.indexOf('async function recordFromMicrophone',begin);
 const stop=app.slice(begin,end);
 assert.doesNotMatch(stop,/microphoneContext\.close\(/);
 assert.match(app,/Tone\.getContext\(\)\.rawContext as AudioContext/);
});
test('arrangement playback waits for bounded sample loading before starting',()=>{
 const begin=app.indexOf('async function play(');const end=app.indexOf('async function previewPart(',begin);
 const play=app.slice(begin,end);
 assert.match(play,/await prepareSamples\(/);
 assert.ok(play.indexOf('await prepareSamples(')<play.indexOf('transport.start()'));
 assert.match(app,/setTimeout\(\(\)=>finish\(false\),7000\)/);
 assert.match(play,/if\(session!==noteLoopSession\)return;/);
});
test('piano dynamic envelopes retain the piano voice in both playback modes',()=>{
 const render=app.slice(app.indexOf('function renderArrangementNote('),app.indexOf('let synth:PolySynth|null=null;'));
 assert.match(render,/!inst.toLowerCase\(\).includes\('piano'\)/);
 assert.match(render,/triggerInstrument\(inst,event.pitch,duration,time,velocity\/127,n.technique\)/);
 assert.match(app,/renderArrangementNote\(inst,n,event,defaultDuration,time,focusGain\)/);
 assert.match(app,/if\(event\)renderArrangementNote\(inst,n,event,/);
});
console.log(`${count} pitch postprocess and recovery checks passed`);
