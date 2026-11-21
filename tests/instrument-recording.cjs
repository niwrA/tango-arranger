const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const {createDomainLoader}=require('./load-domain.cjs');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const script=app.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'App.vue script is available');
const ast=ts.createSourceFile('App.ts',script,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);

// Run the actual editor event handlers and session state. Simulate only the
// browser/audio boundaries; timing, tap handling and violin classification use
// their production modules so these checks cover the integration as well.
const functions=['stopPlayback','startCaptureTransport','beginMelodyPassOnNote',
 'prepareInstrumentCapture','updateInstrumentCaptureDraft','recordInstrumentCapture','reprocessInstrumentTiming',
 'captureGrid','captureElapsedBeats','capturedMelodyForBar','ensureCaptureKeySynth',
 'heldCaptureKeysHasPitch','updateCaptureHeldDisplay','monitorCapturePitch','releaseCaptureMonitorPitch',
 'capturePianoKey','releaseCapturePianoKey','capturePianoKeyClick','captureTap',
 'captureViolinFingerDown','captureViolinFingerMove','auditionDraft','playDraftMeasure','playDraftAll'];
const states=['capturePlaying','captureRecording','captureLoopEnabled','rhythmCaptureTaps','melodyCaptureTaps','captureTaps',
 'captureFrom','captureTo','captureLatency','captureMetronome','captureCountIn','captureCountingIn',
 'captureSpeed','captureTranspose','captureQuantize','captureDurationQuantize','captureTakeMode','captureRecordedPass',
 'instrumentCaptureEvents','instrumentCaptureBase','instrumentCaptureSession','instrumentCaptureRangeMatches',
 'heldCaptureKeys','captureMonitorPitches','captureHeldDisplay','captureViolinMode','captureViolinTraces','captureLastExpression',
 'capturePlayBar','capturePlayBeat','captureFeedback','capturePitch','captureEditedRhythms',
 'captureSession','captureSynth','captureKeySynth','captureClickSynth','rhythmAuditionPlaying','captureKind','captureFirst','captureLast',
 'captureBarNumbers','captureInputSource','captureMuteBacking'];
const extracted=[],found=new Set();
for(const statement of ast.statements){
 if(ts.isFunctionDeclaration(statement)&&functions.includes(statement.name?.text)){
  extracted.push(statement.getText(ast));found.add(statement.name.text);
 }else if(ts.isVariableStatement(statement)){
  const kind=statement.declarationList.flags&ts.NodeFlags.Const?'const':'let';
  for(const declaration of statement.declarationList.declarations){
   if(ts.isIdentifier(declaration.name)&&states.includes(declaration.name.text)){
    extracted.push(`${kind} ${declaration.getText(ast)};`);found.add(declaration.name.text);
   }
  }
 }
}
for(const name of [...functions,...states])assert.ok(found.has(name),'Extract production declaration '+name);
const code=ts.transpileModule(extracted.join('\n')+`\nmodule.exports={${functions.join(',')},state:()=>({${states.join(',')}})};`,
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const load=createDomainLoader();
const {quantizeInstrumentCapture}=load('src/instrumentCaptureTiming.ts');
const {classifyViolinCapture}=load('src/violinCapture.ts');
const {capturePosition,addCapturedTap,melodyFromTaps}=load('src/tapCapture.ts');
const {demoProject,measureArticulation,chordAt,chordTones,midiName}=load('src/music.ts');
const {measureLoopEvents}=load('src/measureLoop.ts');
const ref=value=>({value});
const computed=definition=>({get value(){return typeof definition==='function'?definition():definition.get();},
 set value(value){assert.equal(typeof definition.set,'function');definition.set(value);}});
const plain=value=>JSON.parse(JSON.stringify(value));
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-6,`${actual} should equal ${expected}`);
async function settle(){await Promise.resolve();await Promise.resolve();}

function harness(){
 const transport={seconds:0,position:0,bpm:{value:120},repeats:[],once:[],starts:0,stops:0,
  stop(){this.stops++;},cancel(){this.repeats=[];this.once=[];},start(){this.starts++;},
  scheduleRepeat(callback,interval,at){this.repeats.push({callback,interval,at});},
  scheduleOnce(callback,at){this.once.push({callback,at});}};
 class Synth{
  constructor(){this.volume={value:0};this.calls=[];this.attacks=[];this.releases=[];this.allReleases=0;}
  toDestination(){return this;}
  triggerAttack(pitch){this.attacks.push(pitch);}
  triggerRelease(pitch){this.releases.push(pitch);}
  triggerAttackRelease(pitch,duration,time,velocity){this.calls.push({pitch,duration,time,velocity});}
  releaseAll(){this.allReleases++;}
 }
 const tone={Synth,PolySynth:Synth,getTransport:()=>transport,getContext:()=>({rawContext:{}}),now:()=>100,
  getDraw:()=>({schedule:callback=>callback()}),Frequency:pitch=>({toFrequency:()=>pitch})};
 const project=demoProject();project.bpm=120;project.beats=4;project.bars=project.bars.slice(0,4);
 const ctx={console,module:{exports:{}},ref,computed,project:ref(project),
  active:ref('notes'),noteInst:ref('Piano'),noteLoopFrom:ref(1),noteLoopTo:ref(1),
  plannedPhrasesByMeasure:ref({}),score:ref({Piano:[],'Violin I':[]}),INSTRUMENTS:['Piano','Violin I'],Tone:tone,
  startAudioFromGesture:async()=>tone,stopMicrophoneCapture(){},playExpressiveEvent(){},
  quantizeInstrumentCapture,classifyViolinCapture,capturePosition,addCapturedTap,melodyFromTaps,
  measureArticulation,measureLoopEvents,chordAt,chordTones,midiName,
  auditionPitch:async()=>{},clearInterval(){},performanceTicker:null,noteLoopSession:0,rhythmLoopSession:0,
  synth:null,loopSynth:null,rhythmLoopSynth:null,instrumentSynths:new Map(),samplePlayers:new Map(),
  hit:null,document:{elementFromPoint:()=>({closest:()=>ctx.hit})}};
 for(const [name,value] of Object.entries({playing:false,playbackOrigin:null,audioStatus:'',noteLoopPlaying:false,
  noteLoopBeat:-1,rhythmLoopPlaying:false,rhythmLoopBeat:-1}))ctx[name]=ref(value);
 vm.runInNewContext(code,ctx,{filename:'App.instrument-recording-test.js'});
 const api=ctx.module.exports,state=api.state;
 state().captureQuantize.value='0.25';state().captureDurationQuantize.value='auto';
 function beat(value){
  const s=state(),lead=s.captureRecording.value&&s.captureCountIn.value?ctx.project.value.beats:0;
  transport.seconds=(value+lead)*60/(ctx.project.value.bpm*s.captureSpeed.value)+s.captureLatency.value/1000;
 }
 const event=(id,type='pointerdown',extra={})=>({pointerId:id,button:0,type,clientX:10,clientY:0,timeStamp:0,
  currentTarget:{setPointerCapture(){}},...extra});
 function down(id,pitch,at){beat(at);api.capturePianoKey(event(id),pitch);}
 function up(id,at,type='pointerup',extra={}){beat(at);api.releaseCapturePianoKey(event(id,type,extra));}
 function move(id,pitch,stringMidi,at,timeStamp,x){
  beat(at);ctx.hit={dataset:{pitch:String(pitch),stringMidi:String(stringMidi)},disabled:false};
  api.captureViolinFingerMove(event(id,'pointermove',{timeStamp,clientX:x}));
 }
 function notes(){return plain(state().melodyCaptureTaps.value);}
 return {api,state,ctx,transport,tone,beat,event,down,up,move,notes};
}

(async()=>{
 let count=0;
 async function check(name,run){await run();count++;console.log('PASS '+name);}
 await check('held keyboard notes use independent onset and duration grids',async()=>{
  const h=harness();h.state().captureQuantize.value='0.5';h.state().captureDurationQuantize.value='0.25';
  await h.api.startCaptureTransport(true);h.down(1,60,1.14);h.up(1,1.81);
  assert.deepEqual(h.notes(),[{bar:0,beat:1,pitch:60,duration:0.75}]);
  h.api.stopPlayback();h.state().captureQuantize.value='0.25';h.api.reprocessInstrumentTiming();
  assert.deepEqual(h.notes(),[{bar:0,beat:1.25,pitch:60,duration:0.75}]);
  h.state().captureDurationQuantize.value='0.5';h.api.reprocessInstrumentTiming();
  assert.deepEqual(h.notes(),[{bar:0,beat:1.25,pitch:60,duration:0.5}]);
 });
 await check('coarse timing can be restored from original attacks without changing the score',async()=>{
  const h=harness(),originalProject=plain(h.ctx.project.value),originalScore=plain(h.ctx.score.value);
  h.state().captureQuantize.value='1';h.state().captureDurationQuantize.value='1';
  await h.api.startCaptureTransport(true);h.down(1,60,1.14);h.up(1,1.81);h.api.stopPlayback();
  assert.deepEqual(h.notes(),[{bar:0,beat:1,pitch:60,duration:1}]);
  const source=plain(h.state().instrumentCaptureEvents.value);
  h.api.reprocessInstrumentTiming(true);
  assert.deepEqual(h.notes(),[{bar:0,beat:1.14,pitch:60,duration:0.67}]);
  assert.deepEqual(plain(h.state().instrumentCaptureEvents.value),source);
  assert.deepEqual(plain(h.ctx.project.value),originalProject);assert.deepEqual(plain(h.ctx.score.value),originalScore);
 });
 await check('piano chords retain independent overlapping note lengths',async()=>{
  const h=harness();await h.api.startCaptureTransport(true);
  h.down(1,60,0.97);h.down(2,64,1.02);h.down(3,67,1.04);
  h.up(2,1.51);h.up(3,2.06);h.up(1,2.49);
  assert.deepEqual(h.notes(),[{bar:0,beat:1,pitch:60,duration:1.5},
   {bar:0,beat:1,pitch:64,duration:0.5},{bar:0,beat:1,pitch:67,duration:1}]);
  assert.equal(h.state().instrumentCaptureEvents.value.length,3);
 });
 await check('count-in is excluded and speed plus latency are expressed in written beats',async()=>{
  const h=harness();h.state().captureQuantize.value='0';h.state().captureDurationQuantize.value='0';
  h.state().captureSpeed.value=0.5;h.state().captureLatency.value=120;
  await h.api.startCaptureTransport(true);
  h.transport.seconds=3.9;h.api.capturePianoKey(h.event(1),60);
  assert.equal(h.state().heldCaptureKeys.size,0);assert.equal(h.state().instrumentCaptureSession.value,null);
  h.transport.seconds=4.72;h.api.capturePianoKey(h.event(1),60);
  h.transport.seconds=5.39;h.api.releaseCapturePianoKey(h.event(1,'pointerup'));
  assert.deepEqual(h.notes(),[{bar:0,beat:0.6,pitch:60,duration:0.67}]);
 });
 await check('pointer cancellation discards a note and duplicate releases do not add notes',async()=>{
  const h=harness();await h.api.startCaptureTransport(true);
  h.down(1,60,0.5);h.up(1,1,'pointercancel');h.up(1,1.1,'lostpointercapture');
  assert.equal(h.state().instrumentCaptureEvents.value.length,0);assert.deepEqual(h.notes(),[]);
  h.down(2,64,1.25);h.up(2,1.75);h.up(2,1.8,'lostpointercapture');
  assert.equal(h.state().instrumentCaptureEvents.value.length,1);
  assert.deepEqual(h.notes(),[{bar:0,beat:1.25,pitch:64,duration:0.5}]);
 });
 await check('manual Stop finalizes active held notes before resetting the transport',async()=>{
  const h=harness();h.state().captureQuantize.value='0';h.state().captureDurationQuantize.value='0';
  await h.api.startCaptureTransport(true);h.down(1,60,0.36);h.beat(1.23);h.api.stopPlayback();
  assert.deepEqual(h.notes(),[{bar:0,beat:0.36,pitch:60,duration:0.87}]);
  assert.equal(h.state().captureRecording.value,false);assert.equal(h.state().capturePlaying.value,false);
  assert.equal(h.state().heldCaptureKeys.size,0);h.api.stopPlayback();
  assert.equal(h.state().instrumentCaptureEvents.value.length,1);
 });
 await check('one-shot transport end clips late held notes without wrapping to the first measure',async()=>{
  const h=harness();h.ctx.noteLoopTo.value=2;await h.api.startCaptureTransport(true);
  h.down(1,60,7.97);
  const end=h.transport.once[0];assert.ok(end,'One-shot end is scheduled');
  h.transport.seconds=end.at;end.callback(end.at);
  assert.deepEqual(h.notes(),[{bar:1,beat:3.75,pitch:60,duration:0.25}]);
  assert.equal(h.state().captureRecording.value,false);assert.equal(h.state().heldCaptureKeys.size,0);
 });
 await check('replaced loop passes ignore a key from the old pass when it is released later',async()=>{
  const h=harness();h.state().captureLoopEnabled.value=true;await h.api.startCaptureTransport(true);
  h.down(1,60,0.1);h.up(1,0.6);h.down(2,64,3.5);
  h.down(3,67,4.2);assert.deepEqual(h.notes(),[]);
  h.up(3,4.7);h.up(2,4.9);
  assert.deepEqual(h.notes(),[{bar:0,beat:0.25,pitch:67,duration:0.5}]);
  assert.equal(h.state().instrumentCaptureEvents.value.length,1);
  near(h.state().instrumentCaptureEvents.value[0].startBeat,4.2);
 });
 await check('overdub preserves the existing draft and accumulates voices across passes',async()=>{
  const h=harness();h.state().captureLoopEnabled.value=true;h.state().captureTakeMode.value='overdub';
  h.state().melodyCaptureTaps.value=[{bar:0,beat:2,pitch:55,duration:1}];
  await h.api.startCaptureTransport(true);h.down(1,60,0.36);h.up(1,1.03);h.down(2,64,4.6);h.up(2,5.2);
  assert.deepEqual(h.notes(),[{bar:0,beat:2,pitch:55,duration:1,held:true},
   {bar:0,beat:0.25,pitch:60,duration:0.75},{bar:0,beat:0.5,pitch:64,duration:0.5}]);
  h.api.stopPlayback();h.api.reprocessInstrumentTiming(true);
  assert.deepEqual(h.notes(),[{bar:0,beat:2,pitch:55,duration:1,held:true},
   {bar:0,beat:0.36,pitch:60,duration:0.67},{bar:0,beat:0.6,pitch:64,duration:0.6}]);
 });
 await check('string slides keep ending pitch and string identity while crossing a bar',async()=>{
  const h=harness();h.ctx.noteInst.value='Violin I';h.ctx.noteLoopTo.value=2;
  h.state().captureQuantize.value='0';h.state().captureDurationQuantize.value='0';
  await h.api.startCaptureTransport(true);h.beat(3.7);
  h.api.captureViolinFingerDown(h.event(1,'pointerdown',{clientX:40,timeStamp:0}),69,69);
  h.move(1,71,69,3.9,80,55);h.move(1,72,69,4.1,160,70);h.move(1,74,69,4.3,240,86);
  h.up(1,4.6,'pointerup',{clientX:86,timeStamp:320});
  assert.deepEqual(h.notes(),[{bar:0,beat:3.7,pitch:74,duration:0.3,stringMidi:69,approachSlideFrom:69},
   {bar:1,beat:0,pitch:74,duration:0.6,stringMidi:69}]);
  h.api.stopPlayback();h.state().captureQuantize.value='0.5';h.api.reprocessInstrumentTiming();
  assert.equal(h.notes()[0].pitch,74);assert.equal(h.notes()[0].approachSlideFrom,69);
  assert.ok(h.notes().every(n=>n.stringMidi===69));
 });
 await check('raw keyboard activation keeps fractional onsets with provisional tap durations',async()=>{
  const h=harness();h.state().captureQuantize.value='0';h.state().captureDurationQuantize.value='0';
  await h.api.startCaptureTransport(true);h.beat(0.36);h.api.capturePianoKeyClick({detail:0},60);
  h.beat(0.91);h.api.captureTap(64);
  assert.deepEqual(h.notes(),[{bar:0,beat:0.36,pitch:60,duration:0.55,provisional:true},
   {bar:0,beat:0.91,pitch:64,duration:1,provisional:true}]);
  assert.equal(h.state().instrumentCaptureEvents.value[0].durationBeats,undefined);
  h.beat(1.2);h.api.capturePianoKeyClick({detail:1},67);
  assert.equal(h.state().instrumentCaptureEvents.value.length,2);
 });
 await check('recording settings cannot reprocess another range, instrument, or active take',async()=>{
  const h=harness();await h.api.startCaptureTransport(true);h.down(1,60,0.36);h.up(1,0.91);
  const recorded=h.notes();h.api.reprocessInstrumentTiming(true);assert.deepEqual(h.notes(),recorded);
  assert.equal(h.state().captureQuantize.value,'0.25');h.api.stopPlayback();
  h.ctx.noteLoopTo.value=2;h.api.reprocessInstrumentTiming(true);assert.deepEqual(h.notes(),recorded);
  h.ctx.noteLoopTo.value=1;h.ctx.noteInst.value='Violin I';h.api.reprocessInstrumentTiming(true);
  assert.deepEqual(h.notes(),recorded);h.ctx.noteInst.value='Piano';h.api.reprocessInstrumentTiming(true);
  assert.deepEqual(h.notes(),[{bar:0,beat:0.36,pitch:60,duration:0.55}]);
 });
 await check('input monitoring transposes playback without changing captured score pitches',async()=>{
  const h=harness();h.ctx.project.value.transposeSemitones=2;h.state().captureTranspose.value=12;
  await h.api.startCaptureTransport(true);h.down(1,60,1);h.up(1,1.5);
  assert.equal(h.state().captureKeySynth.attacks[0],62);assert.equal(h.notes()[0].pitch,60);
 });
 await check('draft audition keeps opening rests, chords and silent measures at their recorded positions',async()=>{
  const h=harness();h.ctx.noteLoopFrom.value=2;h.ctx.noteLoopTo.value=4;
  h.state().melodyCaptureTaps.value=[{bar:1,beat:0.5,pitch:60,duration:0.25},
   {bar:1,beat:0.5,pitch:64,duration:1},{bar:3,beat:1.25,pitch:67,duration:0.5}];
  h.api.playDraftAll();await settle();
  const calls=h.state().captureKeySynth.calls;assert.equal(calls.length,3);
  near(calls[0].time,100.05+0.5*0.5);near(calls[1].time,calls[0].time);
  near(calls[2].time,100.05+9.25*0.5);
  near(calls[0].duration,0.25*0.5*0.9);near(calls[1].duration,1*0.5*0.9);
  h.state().captureKeySynth.calls=[];h.api.playDraftMeasure(3);await settle();
  near(h.state().captureKeySynth.calls[0].time,100.05+1.25*0.5);
 });
 console.log(`${count} instrument recording integration checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1;});
