<script lang="ts">
export type PracticeDisplay='notes'|'diagram'|'both'|'score'|'score-diagram';
</script>

<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import type {Note} from './music';
import {detectMonophonicPitch} from './microphonePitch';
import {deviationCents,expectedFrequency,sensitivityThresholdDb} from './learnPitch';
import {DEFAULT_PITCH_POSTPROCESS,reprocessPitchFrames,type PitchFrame} from './pitchPostprocess';
import {compareLearnTake,type LearnTakeRow} from './learnTake';
import MeasureRangeControl from './MeasureRangeControl.vue';

const props=defineProps<{
 instrument:string;notes:Note[];beatsPerMeasure:number;totalMeasures:number;
 measures:ReadonlyArray<{section:string}>;
 initialMeasure:number;concertTranspose:number;referenceHz:number;bpm:number;display:PracticeDisplay;
}>();
const emit=defineEmits<{(event:'exit'):void;(event:'update:display',display:PracticeDisplay):void}>();
const layout=computed({
 get:()=>props.display,
 set:(value:PracticeDisplay)=>emit('update:display',value),
});
const from=ref(props.initialMeasure);
const to=ref(props.initialMeasure);
const referenceHz=computed(()=>props.referenceHz);
const sensitivity=ref(55);
const inputDb=ref<number|null>(null);
const inputThreshold=computed(()=>sensitivityThresholdDb(sensitivity.value));
const settingsOpen=ref(false);
const tolerance=ref(20);
const holdMs=ref(400);
const autoAdvance=ref(true);
const autoRepeat=ref(true);
const cursor=ref(0);
const micStatus=ref('Microphone off');
const listening=ref(false);
const busy=ref(false);
const frequency=ref<number|null>(null);
const detectedMidi=ref<number|null>(null);
const detectedClarity=ref<number|null>(null);
const accepted=ref(false);
const microphoneSupported=computed(()=>props.instrument.startsWith('Violin')||props.instrument.startsWith('Voice'));
const targets=computed(()=>props.notes
 .filter(n=>n.start>=((from.value-1)*props.beatsPerMeasure)-1e-6&&n.start<(to.value*props.beatsPerMeasure)-1e-6)
 .filter(n=>n.pitch>=0&&n.pitch<=127&&!n.xmlTieContinuation)
 .sort((a,b)=>a.start-b.start||a.pitch-b.pitch));
const current=computed(()=>targets.value[cursor.value]??null);
const targetMidi=computed(()=>current.value===null?null:current.value.pitch+props.concertTranspose);
const cents=computed(()=>frequency.value!==null&&targetMidi.value!==null?Math.round(deviationCents(frequency.value,targetMidi.value,referenceHz.value)??0):null);
const targetHz=computed(()=>targetMidi.value===null?null:expectedFrequency(targetMidi.value,referenceHz.value));
const nearTarget=computed(()=>cents.value!==null&&Math.abs(cents.value)<=tolerance.value);
const done=computed(()=>targets.value.length>0&&cursor.value>=targets.value.length);
const showScore=computed(()=>layout.value==='score'||layout.value==='score-diagram');
const combinedScore=computed(()=>layout.value==='score-diagram');
const showDiagram=computed(()=>layout.value==='diagram'||layout.value==='both'||layout.value==='score-diagram');
const showGuide=computed(()=>layout.value!=='diagram');
const completedTargets=ref(new Set<Note>());
const scorePanel=ref<HTMLElement|null>(null);
const scorePanelWidth=ref(0);
watch(scorePanel,(panel,_,onCleanup)=>{
 if(!panel)return;
 scorePanelWidth.value=panel.clientWidth;
 const observer=new ResizeObserver(([entry])=>{scorePanelWidth.value=entry.contentRect.width;});
 observer.observe(panel);
 onCleanup(()=>observer.disconnect());
},{flush:'post'});
const measuresPerPage=computed(()=>{
 const width=scorePanelWidth.value;
 if(combinedScore.value)return width>=600?6:width>=360?5:3;
 return width>=1000?12:width>=650?10:width>=420?8:6;
});
const takeBeat=ref<number|null>(null);
const demoBeat=ref<number|null>(null);
const scoreMeasure=computed(()=>{
 const timedBeat=demoBeat.value??takeBeat.value;
 if(timedBeat!==null)return Math.min(to.value,from.value+Math.floor(Math.max(0,timedBeat)/props.beatsPerMeasure));
 const note=current.value??targets.value.at(-1);
 return note?Math.floor((note.start+1e-7)/props.beatsPerMeasure)+1:from.value;
});
const scoreFrom=computed(()=>{
 const size=measuresPerPage.value;
 return from.value+Math.floor(Math.max(0,scoreMeasure.value-from.value)/size)*size;
});
const scoreTo=computed(()=>Math.min(to.value,scoreFrom.value+measuresPerPage.value-1));
const scoreCompleted=computed(()=>[...completedTargets.value].filter(note=>
 note.start<scoreTo.value*props.beatsPerMeasure&&note.start+note.duration>(scoreFrom.value-1)*props.beatsPerMeasure));
const scoreDemoNotes=computed(()=>{
 if(demoBeat.value===null)return [];
 const beat=(from.value-1)*props.beatsPerMeasure+demoBeat.value;
 return targets.value.filter(note=>note.start<=beat&&beat<note.start+note.duration);
});
const takeLeadInBeats=0.75;
const takeReleaseBeats=1;
const upcoming=computed(()=>targets.value.slice(cursor.value+1,cursor.value+4));
const demoPlaying=ref(false);
const takeResult=ref<LearnTakeRow[]|null>(null);
const takeStatus=computed(()=>{
 const beat=takeBeat.value;
 if(beat===null)return '';
 if(beat<0)return `Count-in · ${Math.floor(beat+props.beatsPerMeasure)+1} / ${props.beatsPerMeasure}`;
 if(beat>=(to.value-from.value+1)*props.beatsPerMeasure)return 'Finishing recording';
 return `Recording · measure ${from.value+Math.floor(beat/props.beatsPerMeasure)} · beat ${Math.floor(beat%props.beatsPerMeasure)+1}`;
});
const takeSummary=computed(()=>{
 const counts={correct:0,wrong:0,missed:0,extra:0};
 for(const row of takeResult.value??[]){
  if(row.kind==='matched')counts[row.target.pitch===row.played.pitch?'correct':'wrong']++;
  else counts[row.kind]++;
 }
 return counts;
});
function pitchLabel(midi:number){
 const labels=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
 const p=Math.round(midi);
 return labels[((p%12)+12)%12]+(Math.floor(p/12)-1);
}
function setRange(start:number,end:number){
 const first=Math.max(1,Math.min(props.totalMeasures,Math.round(start)||1));
 const last=Math.max(first,Math.min(props.totalMeasures,Math.round(end)||first));
 from.value=first;to.value=last;
}
watch(()=>props.instrument,()=>{stopMicrophone();cursor.value=0;setRange(from.value,to.value);});
let stream:MediaStream|null=null;
let audio:AudioContext|null=null;
let source:MediaStreamAudioSourceNode|null=null;
let analyser:AnalyserNode|null=null;
let silence:GainNode|null=null;
let frame=0;
let generation=0;
let stableSince=0;
let armed=true;
let lastAnalyzed=0;
let repeatTimer:ReturnType<typeof setTimeout>|undefined;
let demoAudio:AudioContext|null=null;
let demoTimer:ReturnType<typeof setTimeout>|undefined;
let demoFrame=0;
let demoTailUntil=0;
let take:{startMs:number;msPerBeat:number;totalBeats:number;frames:PitchFrame[];targetIndex:number}|null=null;

watch([targets,()=>props.referenceHz,()=>props.concertTranspose,()=>props.bpm],()=>{
 stopDemo();cancelTake();takeResult.value=null;restart();
});
watch([done,autoRepeat,demoPlaying],([complete,repeat,preview])=>{
 clearTimeout(repeatTimer);
 if(complete&&repeat&&!preview)repeatTimer=setTimeout(()=>{
  const readyForAttack=armed;
  restart();
  armed=readyForAttack;
 },900);
});
function moveCursor(direction:number){
 cursor.value=Math.max(0,Math.min(targets.value.length,cursor.value+direction));
 stableSince=0;armed=false;accepted.value=false;
}
function restart(){
 clearTimeout(repeatTimer);
 completedTargets.value.clear();
 cursor.value=0;stableSince=0;armed=true;accepted.value=false;
}
function stopDemo(){
 clearTimeout(demoTimer);
 cancelAnimationFrame(demoFrame);
 demoBeat.value=null;
 const previous=demoAudio;
 demoAudio=null;
 if(previous){demoTailUntil=performance.now()+180;void previous.close().catch(()=>{});}
 demoPlaying.value=false;
}
async function listenToNotes(){
 if(demoPlaying.value){stopDemo();return;}
 if(!targets.value.length||take||busy.value)return;
 try{
  const ctx=new AudioContext();
  demoAudio=ctx;demoPlaying.value=true;
  stableSince=0;accepted.value=false;armed=false;
  await ctx.resume();
  if(demoAudio!==ctx)return;
  const secondsPerBeat=60/props.bpm;
  const rangeStart=(from.value-1)*props.beatsPerMeasure;
  const rangeEnd=to.value*props.beatsPerMeasure;
  const start=ctx.currentTime+0.04;
  for(const note of targets.value){
   const at=start+(note.start-rangeStart)*secondsPerBeat;
   const end=at+Math.max(0.01,(Math.min(rangeEnd,note.start+note.duration)-note.start)*secondsPerBeat);
   const fade=Math.min(0.035,(end-at)/3);
   const tone=ctx.createOscillator(),gain=ctx.createGain();
   tone.type='triangle';tone.frequency.value=expectedFrequency(note.pitch+props.concertTranspose,referenceHz.value);
   gain.gain.setValueAtTime(0,at);
   gain.gain.linearRampToValueAtTime(0.08,at+fade);
   gain.gain.setValueAtTime(0.08,end-fade);
   gain.gain.linearRampToValueAtTime(0,end);
   tone.connect(gain);gain.connect(ctx.destination);tone.start(at);tone.stop(end);
   tone.onended=()=>{tone.disconnect();gain.disconnect();};
  }
  const followDemo=()=>{
   if(demoAudio!==ctx)return;
   if(showScore.value)demoBeat.value=(ctx.currentTime-start)/secondsPerBeat;
   demoFrame=requestAnimationFrame(followDemo);
  };
  demoFrame=requestAnimationFrame(followDemo);
  demoTimer=setTimeout(stopDemo,100+(rangeEnd-rangeStart)*secondsPerBeat*1000);
 }catch(error){stopDemo();micStatus.value='Could not play the exercise: '+String(error);}
}
function cancelTake(){take=null;takeBeat.value=null;}
async function startTake(){
 if(take){cancelTake();restart();return;}
 if(!targets.value.length||!microphoneSupported.value||busy.value||demoPlaying.value)return;
 if(!listening.value)await startMicrophone();
 if(!listening.value)return;
 const msPerBeat=60000/props.bpm;
 restart();
 take={startMs:performance.now()+msPerBeat*props.beatsPerMeasure,msPerBeat,
  totalBeats:(to.value-from.value+1)*props.beatsPerMeasure,frames:[],targetIndex:0};
 takeBeat.value=-props.beatsPerMeasure;
}
function finishTake(){
 if(!take)return;
 const {frames,totalBeats}=take;
 const rangeStart=(from.value-1)*props.beatsPerMeasure;
 const performed=reprocessPitchFrames(frames,{
  ...DEFAULT_PITCH_POSTPROCESS,pitchBiasCents:0,onsetGridBeats:0,durationGridBeats:0,
 },props.concertTranspose,totalBeats+takeLeadInBeats+takeReleaseBeats)
  .map(note=>({...note,startBeat:note.startBeat-takeLeadInBeats}));
 const expected=targets.value.map(note=>{
  const startBeat=Math.max(0,note.start-rangeStart);
  return {startBeat,durationBeats:Math.min(note.duration,totalBeats-startBeat),pitch:note.pitch};
 });
 takeResult.value=compareLearnTake(expected,performed);
 cancelTake();restart();armed=false;
}
function scoreLocation(beat:number){
 if(beat<0)return `Before m${from.value}`;
 if(beat>=(to.value-from.value+1)*props.beatsPerMeasure)return `After m${to.value}`;
 const measure=Math.floor(beat/props.beatsPerMeasure);
 return `${from.value+measure} · ${(1+beat-measure*props.beatsPerMeasure).toFixed(2)}`;
}
function signed(value:number,unit:string,precision=2){
 const number=Number(value.toFixed(precision));
 return `${number>0?'+':''}${number.toFixed(precision)}${unit}`;
}
function stopMicrophone(){
 if(take){cancelTake();restart();}
 generation++;
 if(frame)cancelAnimationFrame(frame);
 frame=0;
 stream?.getTracks().forEach(t=>t.stop());stream=null;
 try{source?.disconnect();analyser?.disconnect();silence?.disconnect();}catch{/* Already disconnected. */}
 source=null;analyser=null;silence=null;
 const previous=audio;audio=null;
 if(previous)void previous.close().catch(()=>{});
 listening.value=false;busy.value=false;inputDb.value=null;
 frequency.value=null;detectedMidi.value=null;detectedClarity.value=null;
 stableSince=0;armed=true;accepted.value=false;
 micStatus.value='Microphone off';
}
async function startMicrophone(){
 if(listening.value){stopMicrophone();return;}
 if(!microphoneSupported.value||busy.value)return;
 if(!navigator.mediaDevices?.getUserMedia){micStatus.value='Microphone is unavailable in this browser.';return;}
 const id=++generation;
 busy.value=true;micStatus.value='Requesting microphone permission…';
 let acquired:MediaStream|null=null;
 let ctx:AudioContext|null=null;
 try{
  acquired=await navigator.mediaDevices.getUserMedia({
   audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false
  });
  if(id!==generation){acquired.getTracks().forEach(t=>t.stop());return;}
  ctx=new AudioContext();
  if(ctx.state==='suspended')await ctx.resume();
  if(id!==generation){acquired.getTracks().forEach(t=>t.stop());void ctx.close();return;}
  const input=ctx.createMediaStreamSource(acquired);
  const meter=ctx.createAnalyser();meter.fftSize=4096;meter.smoothingTimeConstant=0;
  const mute=ctx.createGain();mute.gain.value=0;
  input.connect(meter);meter.connect(mute);mute.connect(ctx.destination);
  stream=acquired;acquired=null;audio=ctx;ctx=null;source=input;analyser=meter;silence=mute;
  listening.value=true;busy.value=false;micStatus.value='Listening · no accompaniment';
  const samples=new Float32Array(meter.fftSize);
  const normalized=new Float32Array(samples.length);
  const analysisHalfWindowMs=500*meter.fftSize/input.context.sampleRate;
  const tick=(time:number)=>{
   if(id!==generation||!listening.value)return;
   if(time-lastAnalyzed>=55){
    lastAnalyzed=time;
    meter.getFloatTimeDomainData(samples);
    let rms2=0;
    for(const sample of samples)rms2+=sample*sample;
    const rms=Math.sqrt(rms2/samples.length);
    const levelDb=rms>0?20*Math.log10(rms):-90;
    inputDb.value=Math.max(-90,Math.round(levelDb));
    const gain=levelDb>=inputThreshold.value?Math.min(100,0.08/rms):0;
    if(gain)for(let i=0;i<samples.length;i++)normalized[i]=samples[i]*gain;
    const reading=gain&&!demoPlaying.value&&time>=demoTailUntil?detectMonophonicPitch(normalized,input.context.sampleRate,65,2000):null;
    frequency.value=reading?.frequency??null;
    detectedMidi.value=reading&&reading.clarity>=0.7?reading.midi:null;
    detectedClarity.value=reading?.clarity??null;
    if(take){
     const beat=(time-take.startMs)/take.msPerBeat;
     const sampleBeat=beat-analysisHalfWindowMs/take.msPerBeat;
     if(sampleBeat>=take.totalBeats+takeReleaseBeats)finishTake();
     else{
      takeBeat.value=Math.max(-props.beatsPerMeasure,beat);
      if(sampleBeat>=-takeLeadInBeats)take.frames.push({
       timeSeconds:(time-take.startMs-analysisHalfWindowMs)/1000,beat:sampleBeat+takeLeadInBeats,
       midi:reading?69+12*Math.log2(reading.frequency/referenceHz.value):null,
       clarity:reading?.clarity??null,levelDbfs:levelDb,
      });
      const absoluteBeat=(from.value-1)*props.beatsPerMeasure+Math.max(0,beat);
      while(take.targetIndex+1<targets.value.length&&targets.value[take.targetIndex+1].start<=absoluteBeat+1e-6)take.targetIndex++;
      cursor.value=take.targetIndex;
     }
    }else if(demoPlaying.value||time<demoTailUntil){stableSince=0;}
    else if(!current.value){
     stableSince=0;
     const last=targets.value.at(-1);
     const lastCents=last&&reading?deviationCents(reading.frequency,last.pitch+props.concertTranspose,referenceHz.value):null;
     if(detectedMidi.value===null||lastCents===null||Math.abs(lastCents)>tolerance.value)armed=true;
    }
    else if(detectedMidi.value===null||!nearTarget.value){
     stableSince=0;armed=true;accepted.value=false;
    }else if(armed){
     if(!stableSince)stableSince=time;
     if(time-stableSince>=holdMs.value){
      accepted.value=true;stableSince=0;armed=false;
      completedTargets.value.add(current.value);
      if(autoAdvance.value&&cursor.value<targets.value.length)cursor.value++;
     }
    }
   }
   frame=requestAnimationFrame(tick);
  };
  frame=requestAnimationFrame(tick);
 }catch(error){
  acquired?.getTracks().forEach(t=>t.stop());
  if(ctx)void ctx.close().catch(()=>{});
  if(id===generation){stopMicrophone();micStatus.value='Microphone could not start: '+String(error);}
 }
}
onBeforeUnmount(()=>{clearTimeout(repeatTimer);stopDemo();stopMicrophone();});
</script>
<template>
 <section class="learn-workspace" :class="{'learn-workspace-score':showScore}" aria-label="Learn instrument notes">
  <div class="learn-topline">
   <strong>Learn · {{instrument}}</strong>
   <div class="learn-view-controls">
    <label>Display
     <select v-model="layout">
      <option value="notes">Note guide</option>
      <option value="diagram">Instrument diagram</option>
      <option value="both">Notes and diagram</option>
      <option value="score">Score</option>
      <option value="score-diagram">Score and diagram</option>
     </select>
    </label>
    <button type="button" class="secondary learn-settings-toggle" :aria-expanded="settingsOpen" aria-controls="learn-settings" @click="settingsOpen=!settingsOpen"><span aria-hidden="true">⚙</span> Settings</button>
   </div>
  </div>
  <div v-if="settingsOpen" id="learn-settings" class="learn-settings" role="group" aria-label="Learn settings">
   <div class="learn-settings-range"><MeasureRangeControl :from="from" :to="to" :measures="measures" presets @change="setRange"/></div>
   <label>Intonation tolerance<select v-model.number="tolerance"><option :value="35">Getting started · ±35¢</option><option :value="20">Normal · ±20¢</option><option :value="10">Precise · ±10¢</option><option :value="5">Very precise · ±5¢</option></select></label>
   <div class="learn-reference-readout">A4 tuning: <strong>{{referenceHz}} Hz</strong><small>Change the project reference or this instrument's override under Structure, Keys &amp; Ensemble → Orchestra roster.</small></div>
   <label>Input sensitivity <strong>{{sensitivity}}% · {{inputThreshold.toFixed(0)}} dBFS</strong><input v-model.number="sensitivity" type="range" min="0" max="100" step="5" aria-label="Microphone input sensitivity"/></label>
   <label>Stable pitch<select v-model.number="holdMs"><option :value="300">300 ms</option><option :value="400">400 ms</option><option :value="650">650 ms</option><option :value="1000">1 second</option></select></label>
   <label class="learn-check"><input v-model="autoAdvance" type="checkbox"/> Advance after a stable correct note</label>
   <label class="learn-check"><input v-model="autoRepeat" type="checkbox"/> Restart after the last note</label>
  </div>
  <div class="learn-navigation" role="group" aria-label="Exercise playback and recording">
   <button type="button" class="secondary" :disabled="!targets.length||takeBeat!==null||busy" :aria-pressed="demoPlaying" @click="listenToNotes">{{demoPlaying?'Stop preview':'▶ Listen to notes'}}</button>
   <button v-if="microphoneSupported" type="button" class="primary" :disabled="!targets.length||demoPlaying||busy" @click="startTake">{{takeBeat===null?'Record for feedback':'Cancel recording'}}</button>
  </div>
  <p v-if="takeStatus" class="learn-take-status" role="status">{{takeStatus}} · {{Math.round(bpm)}} BPM</p>
  <div class="learn-display" :class="{'learn-display-both':showGuide&&showDiagram,'learn-display-combined':combinedScore}">
   <div v-if="showGuide" class="learn-guide" aria-label="Expected notes">
    <div class="learn-progress">{{done?'Pass complete':'Note '+Math.min(cursor+1,targets.length)+' of '+targets.length}} · measures {{from}}–{{to}}</div>
    <div v-if="showScore" ref="scorePanel" class="learn-score-panel">
     <slot name="score" :from="scoreFrom" :to="scoreTo" :measure="scoreMeasure" :expected="demoPlaying?undefined:current??undefined" :completed="scoreCompleted" :playing="scoreDemoNotes" />
     <small v-if="demoPlaying" class="learn-score-legend">Listening · measure {{scoreMeasure}}</small>
     <small v-else-if="current" class="learn-score-legend">Expected: {{pitchLabel(targetMidi??current.pitch)}} · completed notes in green</small>
     <small v-else-if="!targets.length" class="learn-score-legend">No written notes in this range.</small>
    </div>
    <div v-else-if="current" class="learn-note-cards">
     <div class="learn-target learn-target-current" aria-live="polite">
      <small>PLAY NOW</small><strong>{{pitchLabel(targetMidi??current.pitch)}}</strong>
      <span>M{{Math.floor(current.start/beatsPerMeasure)+1}} · beat {{(current.start%beatsPerMeasure+1).toFixed(2)}}</span>
      <span>{{current.duration}} beats</span>
     </div>
     <div v-for="(note,index) in upcoming" :key="cursor+index+1" class="learn-target">
      <small>{{index===0?'NEXT':`THEN ${index+1}`}}</small><strong>{{pitchLabel(note.pitch+concertTranspose)}}</strong>
      <span>M{{Math.floor(note.start/beatsPerMeasure)+1}} · beat {{(note.start%beatsPerMeasure+1).toFixed(2)}}</span>
      <span>{{note.duration}} beats</span>
     </div>
    </div>
    <div v-else class="learn-target learn-empty" role="status">
     <template v-if="done"><strong>Pass complete</strong><span>{{autoRepeat?'Starting again…':'Press Restart to practise again.'}}</span></template>
     <template v-else><strong>No written notes</strong><span>Choose another range in Settings.</span></template>
    </div>
   </div>
  <div class="learn-tuner" role="region" aria-label="Target-aware pitch tuner">
   <div class="learn-tuner-title">
    <button v-if="microphoneSupported" type="button" class="learn-mic-toggle" :class="{'is-listening':listening}" :aria-label="busy?'Starting microphone':listening?'Stop microphone':'Start microphone'" :aria-pressed="listening" :disabled="busy" @click="startMicrophone"><span aria-hidden="true">🎙</span> {{busy?'Starting…':listening?'Mic on':'Mic off'}}</button>
    <strong>Intonation · {{current?pitchLabel(targetMidi??current.pitch):'—'}}</strong>
    <span :class="{'learn-in-tune':nearTarget}">{{cents===null?'—':(cents>0?'+':'')+cents+'¢'}}</span>
   </div>
   <div class="learn-tuner-meter" role="meter" aria-label="Pitch deviation from expected note" :aria-valuemin="-50" :aria-valuemax="50" :aria-valuenow="cents===null?undefined:Math.max(-50,Math.min(50,cents))">
    <div class="learn-accuracy-window" :style="{left:(50-tolerance/2)+'%',width:tolerance+'%'}"></div>
    <div class="learn-meter-center"></div>
    <div v-if="cents!==null" class="learn-meter-needle" :style="{left:Math.max(0,Math.min(100,50+cents/2))+'%'}"></div>
   </div>
   <div class="learn-tuner-ends"><span>Flat −50¢</span><span>In tune</span><span>Sharp +50¢</span></div>
   <div class="learn-mic-row">
    <meter v-if="microphoneSupported" min="-90" max="0" :value="inputDb??-90" aria-label="Microphone input level" :aria-valuetext="inputDb===null?'Microphone off':inputDb+' dBFS'"/>
    <small role="status">{{micStatus}}{{inputDb!==null?' · '+inputDb+' dBFS':''}}{{frequency!==null?' · '+frequency.toFixed(1)+' Hz':''}}{{accepted?' · Correct pitch held':''}} · A4={{referenceHz}} Hz<span v-if="targetHz!==null"> · target {{targetHz.toFixed(1)}} Hz</span></small>
   </div>
  </div>
   <div v-if="showDiagram" class="learn-diagram">
    <slot name="diagram" :target-pitch="current?.pitch??null" :current-beat="current?Math.floor(current.start%beatsPerMeasure)+1:1" :show-target-label="!showGuide"/>
   </div>
  </div>
  <div class="learn-navigation">
   <button type="button" class="secondary" :disabled="cursor===0||takeBeat!==null||demoPlaying" @click="moveCursor(-1)">← Previous note</button>
   <button type="button" class="secondary" :disabled="cursor>=targets.length||takeBeat!==null||demoPlaying" @click="moveCursor(1)">Next note →</button>
   <button type="button" class="secondary" :disabled="takeBeat!==null||demoPlaying" @click="restart">Restart</button>
  </div>
  <section v-if="takeResult" class="learn-feedback" aria-label="Feedback from your last recording">
   <h3>Last recording</h3>
   <p>{{takeSummary.correct}} correct pitches · {{takeSummary.wrong}} wrong · {{takeSummary.missed}} missed · {{takeSummary.extra}} extra</p>
   <p class="hint">Timing and duration are estimates in beats. Negative values mean early or short. Intonation is relative to the expected pitch.</p>
   <div class="learn-feedback-scroll">
    <table>
     <thead><tr><th scope="col">Measure · beat</th><th scope="col">Expected</th><th scope="col">Detected</th><th scope="col">Onset</th><th scope="col">Duration</th><th scope="col">Intonation</th></tr></thead>
     <tbody>
      <tr v-for="(row,index) in takeResult" :key="index">
       <td>{{scoreLocation(row.kind==='extra'?row.played.startBeat:row.target.startBeat)}}</td>
       <td>{{row.kind==='extra'?'—':pitchLabel(row.target.pitch+concertTranspose)}}</td>
       <td :class="{'learn-feedback-wrong':row.kind!=='matched'||row.played.pitch!==row.target.pitch}">
        <template v-if="row.kind==='missed'">Missed</template>
        <template v-else>{{pitchLabel(row.played.pitch+concertTranspose)}}{{row.kind==='extra'?' · extra':row.played.pitch!==row.target.pitch?' · wrong':''}}</template>
       </td>
       <td>{{row.kind==='matched'?signed(row.played.startBeat-row.target.startBeat,''):'—'}}</td>
       <td>{{row.kind==='matched'?signed(row.played.durationBeats-row.target.durationBeats,''):row.kind==='extra'?row.played.durationBeats.toFixed(2):'—'}}</td>
       <td>{{row.kind==='matched'&&row.played.pitch===row.target.pitch?signed(row.played.intonationCents,'¢',0):'—'}}</td>
      </tr>
     </tbody>
    </table>
   </div>
  </section>
 </section>
</template>
<style scoped>
.learn-workspace{width:100%;max-width:1100px;margin:0 auto;min-width:0;display:flex;flex-direction:column;gap:10px;color:#ebf2f7}
.learn-topline,.learn-tuner-title,.learn-navigation,.learn-mic-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.learn-topline{justify-content:space-between}
.learn-view-controls,.learn-view-controls label{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}
.learn-view-controls label{margin:0;font-size:12px}
.learn-view-controls select{width:auto;max-width:100%;min-height:40px;margin:0;padding:5px 8px}
.learn-topline strong{font-size:18px;color:#f4d49e}
.learn-settings-toggle{min-height:40px}
.learn-settings{display:flex;align-items:end;flex-wrap:wrap;gap:9px;padding:10px;border:1px solid #607787;background:#1d303f;border-radius:9px}
.learn-settings label{display:flex;flex-direction:column;gap:5px;flex:1 1 135px;font-size:12px;min-width:105px}
.learn-settings input[type=number],.learn-settings select{min-height:40px;width:100%;min-width:0;box-sizing:border-box}
.learn-settings .learn-settings-range{flex:1 1 100%;min-width:0}
.learn-settings label strong{font-size:11px;color:#f1d69e}
.learn-reference-readout{display:flex;align-items:center;flex-wrap:wrap;gap:5px 8px;flex:1 1 100%;font-size:12px;color:#d3e2ea}
.learn-reference-readout small{color:#b8ccda;font-size:11px}
.learn-settings label input[type=range]{min-width:0;width:100%}
.learn-settings .learn-check{flex:1 1 100%;flex-direction:row;align-items:center}
.learn-settings .learn-check input{width:18px;height:18px}
.learn-settings>small{flex-basis:100%;color:#b8cdda}
.learn-display{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;min-width:0}
.learn-display-both{grid-template-columns:repeat(2,minmax(0,1fr))}
.learn-display-both>.learn-guide{grid-column:1;grid-row:1}
.learn-display-both>.learn-diagram{grid-column:2;grid-row:1}
.learn-display-both>.learn-tuner{grid-column:1/-1;grid-row:2}
.learn-guide,.learn-diagram{min-width:0;border:1px solid #4d6678;background:#1a2a36;border-radius:9px;padding:10px}
.learn-progress{font-size:12px;color:#b8cad6}
.learn-score-legend{font-size:12px;color:#d4e4ef}
.learn-note-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:5px}
.learn-target{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:95px;text-align:center;border:1px solid #587080;border-radius:6px;background:#243847;padding:4px 1px}
.learn-target strong{font-size:clamp(22px,4vw,48px);color:#e5eef5;line-height:1.1;white-space:nowrap}
.learn-target-current{background:#50422f;border-color:#d8ad70}
.learn-target-current strong{color:#f4cf95}
.learn-empty{margin-top:5px}
.learn-empty strong{white-space:normal}
.learn-target small,.learn-target span{font-size:12px;color:#c6d5dd}
.learn-diagram{display:flex;align-items:center;justify-content:center;min-height:125px}
.learn-tuner{padding:10px;border-radius:9px;background:#1a2c39;border:1px solid #526c7d;display:flex;flex-direction:column;gap:7px}
.learn-tuner-title{justify-content:space-between;gap:8px;min-width:0}
.learn-tuner-title .learn-mic-toggle{min-height:42px;min-width:82px;border:1px solid #6a8293;background:#344759;color:#e8eff4;border-radius:8px;padding:5px 9px;font-size:12px;font-weight:750;white-space:nowrap;flex:0 0 auto}
.learn-tuner-title .learn-mic-toggle.is-listening{background:#235447;border-color:#86d7aa;color:#e7fff2}
.learn-tuner-title strong{margin-right:auto}
.learn-mic-row meter{width:95px;max-width:30%;height:9px;flex:0 0 95px;accent-color:#80cda9}
.learn-tuner-title strong{font-size:15px}
.learn-tuner-title span{font-variant-numeric:tabular-nums;font-weight:750}
.learn-in-tune{color:#79d7b4}
.learn-tuner-meter{position:relative;height:20px;border-radius:10px;background:#334757;overflow:hidden}
.learn-accuracy-window{position:absolute;height:100%;background:#4d9478;opacity:.55}
.learn-meter-center{position:absolute;left:50%;top:0;height:100%;width:2px;background:#fff7e3}
.learn-meter-needle{position:absolute;top:0;height:100%;width:4px;border-radius:2px;background:#f0bc77;transform:translateX(-50%)}
.learn-tuner-ends{display:flex;justify-content:space-between;color:#afc5d4;font-size:11px}
.learn-mic-row small{color:#b7cddd}
.learn-mic-row button,.learn-navigation button{min-height:42px}
.learn-navigation{justify-content:center}
.learn-take-status{margin:0;text-align:center;font-weight:650;color:#f4d49e}
.learn-feedback{min-width:0;border:1px solid #526c7d;border-radius:9px;background:#1a2c39;padding:10px}
.learn-feedback h3,.learn-feedback p{margin:0 0 5px}
.learn-feedback-scroll{overflow-x:auto;max-height:320px}
.learn-feedback table{width:100%;border-collapse:collapse;white-space:nowrap;font-variant-numeric:tabular-nums}
.learn-feedback td,.learn-feedback th{padding:5px 8px;text-align:left;border-bottom:1px solid #526c7d}
.learn-feedback th{position:sticky;top:0;background:#1a2c39}
.learn-feedback-wrong{color:#ffc2a7}
@media(max-width:760px){
.learn-workspace{gap:5px}
.learn-topline strong{font-size:15px}
.learn-topline .learn-settings-toggle{min-height:38px}
.learn-display{gap:5px}
.learn-display-both{grid-template-columns:minmax(0,1fr)}
.learn-display-both>.learn-guide,.learn-display-both>.learn-tuner,.learn-display-both>.learn-diagram{grid-column:1;grid-row:auto}
.learn-guide,.learn-diagram{padding:6px}
.learn-progress{font-size:11px}
.learn-target{min-height:64px;gap:2px}
.learn-target strong{font-size:clamp(20px,6.8vw,36px)}
.learn-target small{font-size:10px}
.learn-target span{font-size:10px}
.learn-settings{padding:7px}
.learn-tuner{padding:6px;gap:3px}
.learn-tuner-title strong{font-size:16px}
.learn-tuner-title .learn-mic-toggle{min-height:42px}
.learn-tuner-meter{height:15px}
.learn-tuner-ends{font-size:10px}
.learn-navigation{gap:4px}
.learn-navigation button{min-height:39px;padding:5px 8px;font-size:12px}
}
@media(max-width:380px){.learn-mic-row meter{max-width:24%;width:60px;flex-basis:60px}.learn-tuner-title .learn-mic-toggle{min-width:69px;padding:4px 6px}}

.learn-workspace-score{max-width:none;align-self:stretch}
.learn-score-panel{min-width:0}
.learn-display-combined{
 grid-template-columns:minmax(0,1fr);
 grid-template-rows:auto auto auto;
 grid-template-areas:"score" "tuner" "diagram";
}
.learn-display-combined>.learn-guide{grid-area:score}
.learn-display-combined>.learn-tuner{grid-area:tuner;align-self:center}
.learn-display-combined>.learn-diagram{grid-area:diagram;align-items:flex-start}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn){max-width:none;margin:0 auto}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-chord-beat){height:clamp(30px,4dvh,45px)}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-next-chord-beat){height:clamp(24px,3dvh,34px)}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-chord-beat strong),
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-next-chord-beat strong){font-size:clamp(14px,2vw,26px)}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard){
 grid-template-columns:minmax(0,1fr);
 grid-auto-rows:minmax(clamp(30px,4.5dvh,48px),auto);
 padding:clamp(6px,1vw,16px);
}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-string-row){align-items:stretch}
.learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-string-stop),
.learn-display-combined :deep(.is-learn .diagram-open-label){height:auto;min-height:0}
@media(min-width:650px){
 .learn-display-combined :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-string-stop span){font-size:clamp(13px,1.7vw,24px)}
}
@media(min-width:900px) and (orientation:landscape){
 .learn-display-combined{
  grid-template-columns:minmax(0,1fr) clamp(150px,15vw,220px) minmax(0,1fr);
  grid-template-rows:auto;
  grid-template-areas:"score tuner diagram";
 }
 .learn-display-combined .learn-tuner-title{justify-content:center;text-align:center}
 .learn-display-combined .learn-tuner-title strong{margin-right:0}
 .learn-display-combined .learn-mic-row{justify-content:center;text-align:center}
 .learn-display-combined .learn-mic-row meter{max-width:100%}
}
</style>
