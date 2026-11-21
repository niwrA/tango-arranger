const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.vue'),'utf8');
const script=app.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'App.vue script is available');
const ast=ts.createSourceFile('App.ts',script,ts.ScriptTarget.ES2022,true,ts.ScriptKind.TS);

// Execute the production functions, not copies of their control flow. Only
// browser/audio boundaries and Vue's ref/watch scheduling are simulated here.
const functionNames=['stopPlayback','startCaptureTransport','recordFromMicrophone',
 'stopMicrophoneCapture','finishMicrophoneNote','beginMelodyPassOnNote','captureGrid','captureElapsedBeats'];
const stateNames=['capturePlaying','captureRecording','captureLoopEnabled','melodyCaptureTaps',
 'captureFrom','captureTo','captureLatency','captureMetronome','captureCountIn','captureCountingIn',
 'captureSpeed','captureTranspose','captureQuantize','captureTakeMode','captureRecordedPass',
 'heldCaptureKeys','captureMonitorPitches','captureHeldDisplay','captureViolinTraces',
 'capturePlayBar','capturePlayBeat','captureFeedback','captureSession','captureSynth','captureKeySynth','captureClickSynth',
 'captureKind','captureFirst','captureLast','captureInputSource','captureMuteBacking',
 'microphoneStatus','microphoneEstimate','microphoneSensitivity','microphoneInputDb',
 'microphoneMonitoring','microphoneListening','microphoneStarting','microphoneSessionShift',
 'microphoneThresholdDb','microphoneScoreShift','microphoneDisplayShift','microphoneStream',
 'microphoneContext','microphoneFrame','microphoneActive','microphoneCandidate','microphoneGeneration',
 'rawPitchFrameInterval','rawPitchFrameLimit','rawPitchFrames','rawPitchSession','rawPitchTruncated','rawPitchExport','rawPitchCopyStatus'];
const extracted=[];
const found=new Set();
for(const statement of ast.statements){
 if(ts.isFunctionDeclaration(statement)&&functionNames.includes(statement.name?.text)){
  extracted.push(statement.getText(ast));found.add(statement.name.text);
 }else if(ts.isVariableStatement(statement)){
  const kind=statement.declarationList.flags&ts.NodeFlags.Const?'const':'let';
  for(const declaration of statement.declarationList.declarations){
   if(ts.isIdentifier(declaration.name)&&stateNames.includes(declaration.name.text)){
    extracted.push(`${kind} ${declaration.getText(ast)};`);found.add(declaration.name.text);
   }
  }
 }else if(ts.isExpressionStatement(statement)&&ts.isCallExpression(statement.expression)){
  const call=statement.expression;
  if(call.expression.getText(ast)==='watch'&&['captureInputSource','noteEditorTab'].includes(call.arguments[0]?.getText(ast))
    &&statement.getText(ast).includes('stopPlayback'))extracted.push(statement.getText(ast));
 }
}
for(const name of [...functionNames,...stateNames])assert.ok(found.has(name),'Extract production declaration '+name);
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const productionCode=compile(extracted.join('\n')+`\nmodule.exports={${functionNames.join(',')},state:()=>({${stateNames.join(',')}})};`);
const modules=new Map();
function loadModule(name){
 const filename=path.join(root,'src',name+'.ts');
 if(modules.has(filename))return modules.get(filename).exports;
 const mod={exports:{}};modules.set(filename,mod);
 const execute=vm.runInNewContext(`(function(require,module,exports){${compile(fs.readFileSync(filename,'utf8'))}\n})`,{console},{filename});
 execute(request=>{
  assert.ok(request.startsWith('./'),'Only local production dependencies are expected');
  return loadModule(path.join(path.dirname(name),request));
 },mod,mod.exports);
 return mod.exports;
}
const {measureLoopEvents}=loadModule('measureLoop');
const {chordAt,chordTones}=loadModule('music');
const {addCapturedTap}=loadModule('tapCapture');
const {microphoneScoreMidi}=loadModule('microphoneTuner');
const ref=value=>({value});
const computed=get=>({get value(){return get();}});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function settle(){await Promise.resolve();await Promise.resolve();}

function harness(){
 const permissions=[],unlocks=[],resumes=[],streams=[],contexts=[],frames=new Map(),watches=[];
 const expressive=[];let frameId=0,permissionCalls=0,unlockCalls=0;
 const transport={seconds:0,position:0,bpm:{value:120},repeats:[],once:[],starts:0,
  stop(){},cancel(){this.repeats=[];this.once=[];},start(){this.starts++;},
  scheduleRepeat(callback,interval,at){this.repeats.push({callback,interval,at});},
  scheduleOnce(callback,at){this.once.push({callback,at});}};
 class Synth{
  constructor(){this.volume={value:0};this.calls=[];}
  toDestination(){return this;}
  triggerAttackRelease(pitch,duration,time,velocity){this.calls.push({pitch,duration,time,velocity});}
  releaseAll(){} triggerRelease(){}
 }
 const tone={Synth,PolySynth:Synth,getTransport:()=>transport,getContext:()=>({rawContext:{}}),
  getDraw:()=>({schedule:callback=>callback()}),Frequency:pitch=>({toFrequency:()=>pitch})};
 const ctx={console,module:{exports:{}},ref,computed,watch:(target,callback)=>watches.push({target,callback}),
  project:ref({bars:[{chord:'C',section:'A'}],beats:4,bpm:120,transposeSemitones:0,melodyDucking:{enabled:false}}),
  active:ref('notes'),noteInst:ref('Voice'),noteEditorTab:ref('capture'),noteLoopFrom:ref(1),noteLoopTo:ref(1),
  score:ref({Voice:[]}),INSTRUMENTS:['Voice'],Tone:tone,
  startAudioFromGesture:()=>{unlockCalls++;return unlocks.length?unlocks.shift():Promise.resolve(tone);},
  measureLoopEvents,chordAt,chordTones,addCapturedTap,microphoneScoreMidi,
  playExpressiveEvent:(_audio,event,time)=>expressive.push({event,time}),
  detectMonophonicPitch:()=>ctx.estimate,
  estimate:{midi:69,frequency:440,clarity:0.99},sampleAmplitude:0.1,
  clearInterval(){},performanceTicker:null,noteLoopSession:0,rhythmLoopSession:0,
  synth:null,loopSynth:null,rhythmLoopSynth:null,instrumentSynths:new Map(),samplePlayers:new Map(),
  releaseCapturePianoKey(){throw Error('No held keyboard keys are part of these microphone cases');},
  requestAnimationFrame:callback=>{frames.set(++frameId,callback);return frameId;},
  cancelAnimationFrame:id=>frames.delete(id),
  navigator:{mediaDevices:{getUserMedia:()=>{permissionCalls++;return permissions.length?permissions.shift():Promise.resolve(makeStream());}}}};
 for(const [name,value] of Object.entries({playing:false,playbackOrigin:null,audioStatus:'',noteLoopPlaying:false,
  noteLoopBeat:-1,rhythmLoopPlaying:false,rhythmLoopBeat:-1}))ctx[name]=ref(value);
 function makeStream(){
  const track={stopped:false,stop(){this.stopped=true;}};
  const stream={track,getTracks:()=>[track]};streams.push(stream);return stream;
 }
 ctx.AudioContext=class{
  constructor(){this.sampleRate=48000;this.currentTime=100;this.closed=false;this.state=resumes.length?'suspended':'running';contexts.push(this);}
  resume(){return resumes.length?resumes.shift():Promise.resolve();}
  close(){this.closed=true;return Promise.resolve();}
  createMediaStreamSource(){return {connect(){}};}
  createAnalyser(){return {fftSize:4096,getFloatTimeDomainData:samples=>samples.fill(ctx.sampleAmplitude)};}
 };
 vm.runInNewContext(productionCode,ctx,{filename:'App.microphone-test.js'});
 const api=ctx.module.exports,state=api.state;
 state().captureInputSource.value='microphone';
 state().captureQuantize.value='0.25';
 state().captureMuteBacking.value=false;
 function change(target,value){target.value=value;for(const item of watches)if(item.target===target)item.callback(value);}
 function frame(beat,audioSeconds){
  const s=state(),lead=s.captureCountIn.value&&s.captureRecording.value?ctx.project.value.beats:0;
  transport.seconds=(beat+lead)*60/(ctx.project.value.bpm*s.captureSpeed.value);
  assert.ok(s.microphoneContext,'Microphone context is active');
  s.microphoneContext.currentTime=audioSeconds===undefined?s.microphoneContext.currentTime+0.05:100+audioSeconds;
  const entry=frames.entries().next().value;assert.ok(entry,'An animation frame is scheduled');
  frames.delete(entry[0]);entry[1]();
 }
 return {api,state,ctx,tone,transport,expressive,permissions,unlocks,resumes,streams,contexts,frames,
  makeStream,change,frame,get permissionCalls(){return permissionCalls;},get unlockCalls(){return unlockCalls;}};
}

(async()=>{
 let checks=0;
 async function check(name,run){await run();checks++;console.log('PASS '+name);}
 await check('permission rejection leaves no running transport, stream or tuner',async()=>{
  const h=harness();h.permissions.push(Promise.reject(Error('Microphone permission denied')));
  await h.api.recordFromMicrophone();
  assert.match(h.state().microphoneStatus.value,/permission denied/);
  assert.equal(h.state().microphoneStarting.value,false);
  assert.equal(h.state().microphoneListening.value,false);assert.equal(h.state().capturePlaying.value,false);
  assert.equal(h.contexts.length,0);assert.equal(h.frames.size,0);
 });
 await check('a second action cancels a pending permission request',async()=>{
  const h=harness(),permission=deferred();h.permissions.push(permission.promise);
  const starting=h.api.recordFromMicrophone(true);
  assert.equal(h.state().microphoneStarting.value,true);
  await h.api.recordFromMicrophone(true);
  const stream=h.makeStream();permission.resolve(stream);await starting;
  assert.equal(h.permissionCalls,1);assert.equal(stream.track.stopped,true);
  assert.equal(h.state().microphoneStarting.value,false);assert.equal(h.state().microphoneListening.value,false);
 });
 await check('stale permission success and failure cannot revive or stop a newer test',async()=>{
  for(const outcome of ['resolve','reject']){
   const h=harness(),old=deferred();h.permissions.push(old.promise);
   const pending=h.api.recordFromMicrophone(true);h.api.stopPlayback();
   await h.api.recordFromMicrophone(true);
   const current=h.state().microphoneStream,status=h.state().microphoneStatus.value;
   const oldStream=outcome==='resolve'?h.makeStream():null;
   if(outcome==='resolve')old.resolve(oldStream);else old.reject(Error('old permission denied'));
   await pending;
   assert.equal(h.state().microphoneStream,current);assert.equal(current.track.stopped,false);
   assert.equal(h.state().microphoneListening.value,true);assert.equal(h.state().microphoneStatus.value,status);
   if(outcome==='resolve')assert.equal(oldStream.track.stopped,true);
   h.api.stopPlayback();
  }
 });
 await check('Test microphone transitions to recording with one Record action',async()=>{
  const h=harness();await h.api.recordFromMicrophone(true);
  const tested=h.state().microphoneStream;
  for(const beat of [0,0.2,0.4,0.6])h.frame(beat);
  assert.equal(h.state().melodyCaptureTaps.value.length,0);
  await h.api.recordFromMicrophone(false);
  assert.equal(tested.track.stopped,true);assert.equal(h.state().microphoneMonitoring.value,false);
  assert.equal(h.state().captureRecording.value,true);assert.equal(h.state().microphoneListening.value,true);
  assert.equal(h.transport.starts,1);assert.equal(h.permissionCalls,2);
  h.api.stopPlayback();assert.ok(h.contexts.every(context=>context.closed));assert.equal(h.frames.size,0);
 });
 await check('source and subtab changes cancel deferred transport startup',async()=>{
  for(const target of ['source','subtab']){
   const h=harness(),unlock=deferred();h.unlocks.push(unlock.promise);
   const starting=h.api.recordFromMicrophone();await settle();
   assert.equal(h.unlockCalls,1);
   h.change(target==='source'?h.state().captureInputSource:h.ctx.noteEditorTab,target==='source'?'instrument':'notes');
   unlock.resolve(h.tone);await starting;
   assert.equal(h.transport.starts,0);assert.equal(h.state().captureRecording.value,false);
   assert.equal(h.state().microphoneListening.value,false);assert.equal(h.state().microphoneStarting.value,false);
   assert.ok(h.streams.every(stream=>stream.track.stopped));assert.equal(h.frames.size,0);
  }
 });
 await check('canceling a suspended audio context cannot restart the tuner after resume',async()=>{
  const h=harness(),resume=deferred();h.resumes.push(resume.promise);
  const starting=h.api.recordFromMicrophone(true);await settle();
  assert.equal(h.contexts.length,1);assert.equal(h.state().microphoneListening.value,false);
  h.api.stopPlayback();resume.resolve();await starting;
  assert.equal(h.contexts[0].closed,true);assert.equal(h.streams[0].track.stopped,true);
  assert.equal(h.state().microphoneListening.value,false);assert.equal(h.frames.size,0);
 });
 await check('a canceled transport startup failure cannot stop a newer microphone test',async()=>{
  const h=harness(),unlock=deferred();h.unlocks.push(unlock.promise);
  const old=h.api.recordFromMicrophone();await settle();h.api.stopPlayback();
  await h.api.recordFromMicrophone(true);
  const current=h.state().microphoneStream,status=h.state().microphoneStatus.value;
  unlock.reject(Error('old audio unlock failed'));await old;
  assert.equal(h.state().microphoneStream,current);assert.equal(current.track.stopped,false);
  assert.equal(h.state().microphoneListening.value,true);assert.equal(h.state().microphoneStatus.value,status);
  h.api.stopPlayback();
 });
 await check('recording uses one frozen key for backing, tuner and saved score notes',async()=>{
  const h=harness(),unlock=deferred();h.unlocks.push(unlock.promise);
  h.ctx.project.value.transposeSemitones=2;h.state().captureTranspose.value=12;
  h.ctx.score.value.Voice=[{pitch:60,start:0,duration:1}];
  const starting=h.api.recordFromMicrophone();await settle();
  h.ctx.project.value.transposeSemitones=-5;h.state().captureTranspose.value=-12;
  unlock.resolve(h.tone);await starting;
  assert.equal(h.state().microphoneSessionShift.value,14);assert.equal(h.state().microphoneDisplayShift.value,14);
  assert.equal(h.state().rawPitchSession.value.recordingTransposeSemitones,12);
  assert.equal(h.state().rawPitchSession.value.songTransposeSemitones,2);
  assert.equal(h.state().rawPitchSession.value.soundingTransposeSemitones,14);
  h.transport.repeats.find(item=>item.interval==='1m').callback(0);
  assert.equal(h.state().captureSynth.calls[0].pitch,74);
  h.ctx.estimate={midi:83.12,frequency:990,clarity:0.99};
  for(const beat of [0,0.1,0.2,0.4,0.7])h.frame(beat);
  assert.equal(h.state().microphoneEstimate.value.midi,83.12);
  h.api.stopPlayback();
  assert.equal(h.state().melodyCaptureTaps.value.length,1);
  assert.equal(h.state().melodyCaptureTaps.value[0].pitch,69);
 });
 await check('backing notes, slides, gesture contours and count-in share microphone transposition',async()=>{
  const h=harness();h.ctx.project.value.transposeSemitones=2;h.state().captureTranspose.value=12;
  h.ctx.score.value.Voice=[{pitch:60,start:0,duration:1},{pitch:65,start:1,duration:1,slideTo:67},
   {pitch:62,start:2,duration:1,gesture:{kind:'sirena',contour:'up',points:[{at:0,pitch:62},{at:1,pitch:64}],partner:[{at:0,pitch:50},{at:1,pitch:52}]}}];
  assert.equal(await h.api.startCaptureTransport(true),14);
  h.transport.repeats.find(item=>item.interval==='1m').callback(0);
  assert.equal(h.state().captureSynth.calls[0].pitch,74);
  assert.equal(h.expressive[0].event.pitch,79);assert.equal(h.expressive[0].event.slideTo,81);
  assert.deepEqual(Array.from(h.expressive[1].event.gesture.points,point=>point.pitch),[76,78]);
  assert.deepEqual(Array.from(h.expressive[1].event.gesture.partner,point=>point.pitch),[64,66]);
  h.transport.repeats.find(item=>item.interval==='4n').callback(0);
  assert.equal(h.state().captureKeySynth.calls[0].pitch,74);h.api.stopPlayback();
 });
 await check('instrument and rhythm recording ignore the microphone key shift',async()=>{
  for(const [editor,source] of [['notes','instrument'],['rhythm','microphone']]){
   const h=harness();h.ctx.active.value=editor;h.state().captureInputSource.value=source;
   h.ctx.project.value.transposeSemitones=2;h.state().captureTranspose.value=12;
   h.ctx.score.value.Voice=[{pitch:60,start:0,duration:1}];
   assert.equal(await h.api.startCaptureTransport(true),2);
   h.transport.repeats.find(item=>item.interval==='1m').callback(0);
   assert.equal(h.state().captureSynth.calls[0].pitch,62);h.api.stopPlayback();
  }
 });
 await check('raw pitch records fractional estimates, silence and unlocked signal in microphone tests',async()=>{
  const h=harness();h.ctx.estimate={midi:47.12345,frequency:129.875,clarity:0.913};
  await h.api.recordFromMicrophone(true);
  h.frame(0,0);h.frame(0,0.016);
  assert.equal(h.state().rawPitchFrames.value.length,1);
  const first=h.state().rawPitchFrames.value[0];
  assert.equal(first.timeSeconds,0);assert.equal(first.beat,null);
  assert.equal(first.frequencyHz,129.875);assert.equal(first.midi,47.12345);assert.equal(first.clarity,0.913);
  h.ctx.sampleAmplitude=0;h.frame(0,0.05);
  const silent=h.state().rawPitchFrames.value[1];
  assert.equal(silent.frequencyHz,null);assert.equal(silent.midi,null);assert.equal(silent.clarity,null);assert.equal(silent.levelDbfs,-90);
  h.ctx.sampleAmplitude=0.1;h.ctx.estimate=null;h.frame(0,0.1);
  const unlocked=h.state().rawPitchFrames.value[2];
  assert.equal(unlocked.midi,null);assert.ok(unlocked.levelDbfs>-21);
  assert.equal(h.state().melodyCaptureTaps.value.length,0);
  h.api.stopPlayback();
  const exported=JSON.parse(h.state().rawPitchExport.value);
  assert.equal(exported.mode,'test');assert.equal(exported.sampleRateHz,48000);assert.equal(exported.frames.length,3);
  assert.equal(exported.frames.every(frame=>frame.beat===null),true);
  assert.equal(h.state().microphoneContext,null);assert.equal(h.state().rawPitchFrames.value.length,3);
 });
 await check('raw timeline samples audio-clock buckets without inventing missing frames and remains bounded',async()=>{
  const h=harness();await h.api.recordFromMicrophone(true);
  for(const time of [0,0.01,0.02,0.049,0.05,0.099,0.1,0.35,0.2])h.frame(0,time);
  assert.deepEqual(Array.from(h.state().rawPitchFrames.value,frame=>frame.timeSeconds),[0,0.05,0.1,0.35]);
  for(let i=8;i<h.state().rawPitchFrameLimit+10;i++)h.frame(0,i*0.05);
  assert.equal(h.state().rawPitchFrames.value.length,12000);assert.equal(h.state().rawPitchTruncated.value,true);
  const first=h.state().rawPitchFrames.value[0],last=h.state().rawPitchFrames.value.at(-1);
  h.frame(0,1000);
  assert.equal(h.state().rawPitchFrames.value[0],first);assert.equal(h.state().rawPitchFrames.value.at(-1),last);
  h.api.stopPlayback();assert.equal(JSON.parse(h.state().rawPitchExport.value).truncated,true);
 });
 await check('only a successful new microphone session resets the previous raw timeline',async()=>{
  const h=harness();await h.api.recordFromMicrophone(true);h.frame(0,0);h.api.stopPlayback();
  const previous=h.state().rawPitchExport.value;
  h.permissions.push(Promise.reject(Error('Permission denied')));await h.api.recordFromMicrophone(false);
  assert.equal(h.state().rawPitchExport.value,previous);
  const permission=deferred();h.permissions.push(permission.promise);
  const deniedStart=h.api.recordFromMicrophone(true);h.api.stopPlayback();permission.resolve(h.makeStream());await deniedStart;
  assert.equal(h.state().rawPitchExport.value,previous);
  const resume=deferred();h.resumes.push(resume.promise);
  const cancelledStart=h.api.recordFromMicrophone(true);await settle();h.api.stopPlayback();resume.resolve();await cancelledStart;
  assert.equal(h.state().rawPitchExport.value,previous);
  await h.api.recordFromMicrophone(false);
  assert.equal(h.state().rawPitchFrames.value.length,0);assert.equal(h.state().rawPitchSession.value.mode,'recording');
  h.frame(-1,0);h.frame(0,0.05);
  assert.deepEqual(Array.from(h.state().rawPitchFrames.value,frame=>frame.beat),[-1,0]);
  h.api.stopPlayback();await h.api.recordFromMicrophone(true);
  assert.equal(h.state().rawPitchFrames.value.length,0);assert.equal(h.state().rawPitchSession.value.mode,'test');
  assert.equal(h.state().rawPitchTruncated.value,false);h.api.stopPlayback();
 });
 await check('raw export retains session settings after stopping or changing editor and records live sensitivity',async()=>{
  const h=harness();
  h.ctx.project.value.bars=Array.from({length:9},()=>({chord:'C',section:'A'}));
  h.ctx.project.value.bpm=124;h.ctx.project.value.transposeSemitones=2;
  h.ctx.noteLoopFrom.value=6;h.ctx.noteLoopTo.value=9;
  h.state().captureTranspose.value=12;h.state().captureSpeed.value=0.75;h.state().captureLatency.value=20;
  await h.api.recordFromMicrophone();h.frame(-1,0);
  h.state().microphoneSensitivity.value=100;h.ctx.project.value.bpm=130;h.state().captureLatency.value=40;h.frame(0,0.05);
  h.api.stopPlayback();
  const snapshot=h.state().rawPitchExport.value,exported=JSON.parse(snapshot);
  assert.equal(exported.instrument,'Voice');assert.equal(exported.mode,'recording');
  assert.deepEqual(exported.measures,{from:6,to:9});assert.equal(exported.beatsPerMeasure,4);
  assert.equal(exported.tempoBpm,124);assert.equal(exported.recordingSpeed,0.75);assert.equal(exported.latencyCorrectionMs,20);
  assert.equal(exported.sampleRateHz,48000);assert.equal(exported.countInBeats,4);
  assert.equal(exported.recordingTransposeSemitones,12);assert.equal(exported.songTransposeSemitones,2);assert.equal(exported.soundingTransposeSemitones,14);
  assert.equal(exported.sensitivityPercent,70);
  assert.deepEqual(exported.frames.map(frame=>frame.sensitivityPercent),[70,100]);
  assert.deepEqual(exported.frames.map(frame=>frame.tempoBpm),[124,130]);
  assert.deepEqual(exported.frames.map(frame=>frame.latencyCorrectionMs),[20,40]);
  h.ctx.noteInst.value='Piano';h.ctx.noteLoopFrom.value=1;h.ctx.noteLoopTo.value=1;
  h.state().captureTranspose.value=-7;h.state().microphoneSensitivity.value=10;h.ctx.project.value.bpm=90;
  h.change(h.state().captureInputSource,'instrument');h.change(h.ctx.noteEditorTab,'notes');
  assert.equal(h.state().rawPitchExport.value,snapshot);
 });
 console.log(checks+' microphone recording, raw pitch and transposition checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
