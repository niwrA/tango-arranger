<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import type {Note} from './music';
import {detectMonophonicPitch} from './microphonePitch';
import {deviationCents,expectedFrequency,sensitivityThresholdDb} from './learnPitch';
import MeasureRangeControl from './MeasureRangeControl.vue';

const props=defineProps<{
 instrument:string;notes:Note[];beatsPerMeasure:number;totalMeasures:number;
 measures:ReadonlyArray<{section:string}>;
 initialMeasure:number;concertTranspose:number;
}>();
const emit=defineEmits<{(event:'exit'):void}>();
const from=ref(props.initialMeasure);
const to=ref(props.initialMeasure);
const referenceHz=ref(props.instrument.startsWith('Violin')?442:440);
const sensitivity=ref(55);
const inputDb=ref<number|null>(null);
const inputThreshold=computed(()=>sensitivityThresholdDb(sensitivity.value));
const settingsOpen=ref(false);
const tolerance=ref(20);
const holdMs=ref(400);
const autoAdvance=ref(true);
const layout=ref<'notes'|'diagram'|'both'>('both');
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
function pitchLabel(midi:number){
 const labels=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
 const p=Math.round(midi);
 return labels[((p%12)+12)%12]+(Math.floor(p/12)-1);
}
function setRange(start:number,end:number){
 const first=Math.max(1,Math.min(props.totalMeasures,Math.round(start)||1));
 const last=Math.max(first,Math.min(props.totalMeasures,Math.round(end)||first));
 from.value=first;to.value=last;cursor.value=0;
 accepted.value=false;stableSince=0;armed=true;
}
watch(()=>props.instrument,()=>{stopMicrophone();cursor.value=0;referenceHz.value=props.instrument.startsWith('Violin')?442:440;setRange(from.value,to.value);});
watch(targets,()=>{cursor.value=0;accepted.value=false;stableSince=0;armed=true;});
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
function moveCursor(direction:number){
 cursor.value=Math.max(0,Math.min(targets.value.length,cursor.value+direction));
 stableSince=0;armed=false;accepted.value=false;
}
function restart(){
 cursor.value=0;stableSince=0;armed=true;accepted.value=false;
}
function stopMicrophone(){
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
    const normalized=new Float32Array(samples.length);
    if(gain)for(let i=0;i<samples.length;i++)normalized[i]=samples[i]*gain;
    const reading=gain?detectMonophonicPitch(normalized,audio!.sampleRate,65,2000):null;
    frequency.value=reading?.frequency??null;
    detectedMidi.value=reading&&reading.clarity>=0.7?reading.midi:null;
    detectedClarity.value=reading?.clarity??null;
    if(!current.value){stableSince=0;}
    else if(detectedMidi.value===null||!nearTarget.value){
     stableSince=0;armed=true;accepted.value=false;
    }else if(armed){
     if(!stableSince)stableSince=time;
     if(time-stableSince>=holdMs.value){
      accepted.value=true;stableSince=0;armed=false;
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
onBeforeUnmount(stopMicrophone);
</script>
<template>
 <section class="learn-workspace" aria-label="Learn instrument notes">
  <div class="learn-topline">
   <div><strong>Learn · {{instrument}}</strong><small>One note at a time, without accompaniment</small></div>
   <button type="button" class="secondary learn-settings-toggle" :aria-expanded="settingsOpen" aria-controls="learn-settings" @click="settingsOpen=!settingsOpen"><span aria-hidden="true">⚙</span> Settings</button>
  </div>
  <div v-if="settingsOpen" id="learn-settings" class="learn-settings" role="group" aria-label="Learn settings">
   <div class="learn-settings-range"><MeasureRangeControl :from="from" :to="to" :measures="measures" presets @change="setRange"/></div>
   <label>Intonation tolerance<select v-model.number="tolerance"><option :value="35">Getting started · ±35¢</option><option :value="20">Normal · ±20¢</option><option :value="10">Precise · ±10¢</option><option :value="5">Very precise · ±5¢</option></select></label>
   <label>Reference pitch (A4)<select v-model.number="referenceHz"><option v-for="hz in [438,440,441,442,443,444,445]" :key="hz" :value="hz">{{hz}} Hz</option></select></label>
   <label>Input sensitivity <strong>{{sensitivity}}% · {{inputThreshold.toFixed(0)}} dBFS</strong><input v-model.number="sensitivity" type="range" min="0" max="100" step="5" aria-label="Microphone input sensitivity"/></label>
   <label>Stable pitch<select v-model.number="holdMs"><option :value="300">300 ms</option><option :value="400">400 ms</option><option :value="650">650 ms</option><option :value="1000">1 second</option></select></label>
   <label>View<select v-model="layout"><option value="notes">Note guide</option><option value="diagram">Instrument diagram</option><option value="both">Both</option></select></label>
   <label class="learn-check"><input v-model="autoAdvance" type="checkbox"/> Advance after a stable correct note</label>
   <small>Pitch accuracy is checked first. Timing and note durations are not yet graded. This session never edits the song.</small>
  </div>
  <div class="learn-display" :class="{'learn-display-both':layout==='both'}">
   <div v-if="layout!=='diagram'" class="learn-guide" aria-label="Expected notes">
    <div class="learn-progress">{{done?'Pass complete':'Note '+Math.min(cursor+1,targets.length)+' of '+targets.length}} · measures {{from}}–{{to}}</div>
    <div class="learn-target" aria-live="polite">
     <template v-if="done"><strong>Pass complete</strong><span>Review or restart to practise again.</span></template>
     <template v-else-if="current"><small>PLAY NOW</small><strong>{{pitchLabel(targetMidi??current.pitch)}}</strong><span>Measure {{Math.floor(current.start/beatsPerMeasure)+1}} · beat {{Number(current.start%beatsPerMeasure+1).toFixed(2)}} · {{current.duration}} beats</span></template>
     <template v-else><strong>No written notes</strong><span>Choose another range in Settings.</span></template>
    </div>
    <div v-if="targets.length" class="learn-note-strip" aria-label="Written note sequence">
     <span v-for="(note,i) in targets.slice(0,80)" :key="i" :class="{current:i===cursor,complete:i<cursor}" :title="'Measure '+(Math.floor(note.start/beatsPerMeasure)+1)+' · '+pitchLabel(note.pitch)">{{pitchLabel(note.pitch)}}</span>
     <small v-if="targets.length>80">Showing first 80 of {{targets.length}} notes</small>
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
   <div v-if="layout!=='notes'" class="learn-diagram">
    <slot name="diagram" :target-pitch="current?.pitch??null" :current-beat="current?Math.floor(current.start%beatsPerMeasure)+1:1"/>
   </div>
  </div>
  <div class="learn-navigation">
   <button type="button" class="secondary" :disabled="cursor===0" @click="moveCursor(-1)">← Previous note</button>
   <button type="button" class="secondary" :disabled="cursor>=targets.length" @click="moveCursor(1)">Next note →</button>
   <button type="button" class="secondary" @click="restart">Restart</button>
  </div>
  <p class="learn-footnote">This first version uses note names and the existing instrument diagram. Traditional engraved notation, generated chord exercises, and recorded-take comparison will be added separately.</p>
 </section>
</template>
<style scoped>
.learn-workspace{width:100%;max-width:1100px;margin:0 auto;min-width:0;display:flex;flex-direction:column;gap:10px;color:#ebf2f7}
.learn-topline,.learn-tuner-title,.learn-navigation,.learn-mic-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.learn-topline{justify-content:space-between}
.learn-topline>div{display:flex;flex-direction:column;gap:2px}
.learn-topline strong{font-size:18px;color:#f4d49e}
.learn-topline small,.learn-footnote{font-size:12px;color:#b7cbd8}
.learn-settings-toggle{min-height:40px}
.learn-settings{display:flex;align-items:end;flex-wrap:wrap;gap:9px;padding:10px;border:1px solid #607787;background:#1d303f;border-radius:9px}
.learn-settings label{display:flex;flex-direction:column;gap:5px;flex:1 1 135px;font-size:12px;min-width:105px}
.learn-settings input[type=number],.learn-settings select{min-height:40px;width:100%;min-width:0;box-sizing:border-box}
.learn-settings .learn-settings-range{flex:1 1 100%;min-width:0}
.learn-settings label strong{font-size:11px;color:#f1d69e}
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
.learn-target{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-height:95px;text-align:center}
.learn-target strong{font-size:clamp(30px,5vw,58px);color:#f4cf95;line-height:1.1}
.learn-target small,.learn-target span{font-size:12px;color:#c6d5dd}
.learn-note-strip{display:flex;align-items:center;flex-wrap:wrap;gap:5px;max-height:95px;overflow-y:auto}
.learn-note-strip>span{font-size:12px;padding:5px 7px;border:1px solid #587080;border-radius:5px}
.learn-note-strip>span.current{border-color:#e1b576;background:#635039;color:#fff2d5}
.learn-note-strip>span.complete{color:#a3dec8;background:#204638;border-color:#539c7f}
.learn-note-strip>small{font-size:11px}
.learn-diagram{display:flex;align-items:center;justify-content:center;min-height:125px}
.learn-diagram :deep(.performance-chord-diagram){max-width:100%}
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
.learn-footnote{margin:0}
@media(max-width:760px){
.learn-workspace{gap:5px}
.learn-topline>div>small{display:none}
.learn-topline strong{font-size:15px}
.learn-topline .learn-settings-toggle{min-height:38px}
.learn-display{gap:5px}
.learn-display-both{grid-template-columns:minmax(0,1fr)}
.learn-display-both>.learn-guide,.learn-display-both>.learn-tuner,.learn-display-both>.learn-diagram{grid-column:1;grid-row:auto}
.learn-guide,.learn-diagram{padding:6px}
.learn-progress{font-size:11px}
.learn-target{min-height:54px;gap:2px}
.learn-target strong{font-size:clamp(25px,7vw,38px)}
.learn-target span{font-size:10px}
.learn-note-strip{max-height:40px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden}
.learn-note-strip>span{flex:0 0 auto}
.learn-settings{padding:7px}
.learn-tuner{padding:6px;gap:3px}
.learn-tuner-title strong{font-size:16px}
.learn-tuner-title .learn-mic-toggle{min-height:42px}
.learn-tuner-meter{height:15px}
.learn-tuner-ends{font-size:10px}
.learn-navigation{gap:4px}
.learn-navigation button{min-height:39px;padding:5px 8px;font-size:12px}
.learn-footnote{display:none}
}
@media(max-width:380px){.learn-mic-row meter{max-width:24%;width:60px;flex-basis:60px}.learn-tuner-title .learn-mic-toggle{min-width:69px;padding:4px 6px}}
</style>
