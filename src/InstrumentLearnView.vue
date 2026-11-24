<script lang="ts">
export type PracticeDisplay='notes'|'diagram'|'both'|'score'|'score-diagram'|'overlay'|'score-guide'|'overlay-guide';
</script>

<script setup lang="ts">
import {computed,ref,shallowRef,watch,onBeforeUnmount} from 'vue';
import {instrumentFamily,partStaffForNote,noteSoundingDuration,type Instrument,type Note} from './music';
import {detectMonophonicPitch} from './microphonePitch';
import {deviationCents,expectedFrequency,matchesPracticePitch,practiceMidi,sensitivityThresholdDb} from './learnPitch';
import {DEFAULT_PITCH_POSTPROCESS,reprocessPitchFrames,type PitchFrame} from './pitchPostprocess';
import {alignLearnTake} from './learnTake';
import {download} from './io';
import {practiceTargets,bandoneonPracticeHands,practiceNotesSoundingAt,type ChordTarget,type PracticeStaff} from './practiceTargets';
import {suggestStringMeasurePosition} from './stringPositionGuide';
import {suggestViolinPosition} from './violinPositions';
import MeasureRangeControl from './MeasureRangeControl.vue';
import AppIcon from './AppIcon.vue';
import PracticeTakeTimeline from './PracticeTakeTimeline.vue';
import PracticeRecordingBeat from './PracticeRecordingBeat.vue';
import type {PracticeRecordingClock} from './practiceRecordingPulse';

const props=defineProps<{
 instrument:Instrument;songTitle:string;notes:Note[];beatsPerMeasure:number;totalMeasures:number;
 measures:ReadonlyArray<{section:string}>;
 initialMeasure:number;concertTranspose:number;referenceHz:number;bpm:number;display:PracticeDisplay;
 grandStaff:boolean;staffSplit:number;
}>();
const emit=defineEmits<{(event:'exit'):void;(event:'update:display',display:PracticeDisplay):void}>();
const layout=computed({
 get:()=>props.display,
 set:(value:PracticeDisplay)=>emit('update:display',value),
});
const displayOptions=[
 {value:'score',label:'Score',icon:'staff'},
 {value:'diagram',label:'Diagram',icon:'fingerboard'},
 {value:'guide',label:'Note guide',icon:'music'},
] as const;
const scoreEnabled=computed(()=>['score','score-diagram','overlay','score-guide','overlay-guide'].includes(layout.value));
const diagramEnabled=computed(()=>['diagram','both','score-diagram','overlay','overlay-guide'].includes(layout.value));
const guideEnabled=computed(()=>['notes','both','score-guide','overlay-guide'].includes(layout.value));
function toggleDisplay(which:'score'|'diagram'|'guide'){
 let score=scoreEnabled.value,diagram=diagramEnabled.value,guide=guideEnabled.value;
 if(which==='score')score=!score;
 if(which==='diagram')diagram=!diagram;
 if(which==='guide')guide=!guide;
 if(!score&&!diagram&&!guide)return; // Always retain one visible practice surface.
 let next:PracticeDisplay;
 if(score&&diagram)next=guide?'overlay-guide':'overlay';
 else if(score)next=guide?'score-guide':'score';
 else if(diagram)next=guide?'both':'diagram';
 else next='notes';
 layout.value=next;
}
const overlayPaper=ref(60);
function activeSectionRange(measure:number):[number,number]{
 const index=Math.max(0,Math.min(props.measures.length-1,Math.round(measure)-1));
 const section=props.measures[index]?.section;
 let first=index,last=index;
 while(first>0&&props.measures[first-1]?.section===section)first--;
 while(last+1<props.measures.length&&props.measures[last+1]?.section===section)last++;
 return [first+1,last+1];
}
const initialRange=activeSectionRange(props.initialMeasure);
const from=ref(initialRange[0]);
const to=ref(initialRange[1]);
const disableOverlay=ref(false);
const referenceHz=computed(()=>props.referenceHz);
const sensitivity=ref(100);
const inputDb=ref<number|null>(null);
const inputThreshold=computed(()=>sensitivityThresholdDb(sensitivity.value));
const settingsOpen=ref(false);
const tolerance=ref(20);
const holdMs=ref(400); // 0 = written note duration
const previewDuration=ref<'tango'|'written'>('tango');
const autoAdvance=ref(true);
const autoRepeat=ref(true);
const cursor=ref(0);
const micStatus=ref('Microphone off');
const listening=ref(false);
const busy=ref(false);
const frequency=ref<number|null>(null);
const detectedMidi=ref<number|null>(null);
const accepted=ref(false);
const family=computed(()=>instrumentFamily(props.instrument));
const voiceAnyOctave=ref(true);
const allowAnyOctave=computed(()=>family.value==='Voice'&&voiceAnyOctave.value);
const microphoneSupported=computed(()=>['Violin','Voice','Contrabass','Bandoneon','Piano'].includes(family.value));
const staff=ref<PracticeStaff>('all');
const chordTarget=ref<ChordTarget>('highest');
const practiceRange=computed(()=>props.notes.filter(note=>
 note.start>=(from.value-1)*props.beatsPerMeasure-1e-6&&note.start<to.value*props.beatsPerMeasure-1e-6));
const exercise=computed(()=>practiceTargets(practiceRange.value,props.instrument,props.staffSplit,props.grandStaff?staff.value:'all',chordTarget.value));
const targets=computed(()=>exercise.value.targets);
function targetPitch(note:Note){return exercise.value.pitches.get(note)??note.pitch;}
function otherPitches(note:Note){
 return (exercise.value.chords.get(note)??[]).filter(pitch=>pitch!==targetPitch(note))
  .map(pitch=>pitchLabel(pitch+props.concertTranspose)).join(' · ');
}
const current=computed(()=>targets.value[cursor.value]??null);
const targetMidi=computed(()=>current.value===null?null:targetPitch(current.value)+props.concertTranspose);
const detectedPitchMatches=computed(()=>detectedMidi.value!==null&&targetMidi.value!==null&&
 matchesPracticePitch(detectedMidi.value,targetMidi.value,allowAnyOctave.value));
const cents=computed(()=>frequency.value!==null&&targetMidi.value!==null?Math.round(deviationCents(frequency.value,targetMidi.value,referenceHz.value,allowAnyOctave.value)??0):null);
const targetHz=computed(()=>targetMidi.value===null?null:expectedFrequency(targetMidi.value,referenceHz.value));
const nearTarget=computed(()=>cents.value!==null&&Math.abs(cents.value)<=tolerance.value);
const requiredHoldMs=computed(()=>holdMs.value===0&&current.value?Math.max(100,current.value.duration*60000/props.bpm):holdMs.value);
const heldProgress=ref(0);
const intonationFeedback=computed(()=>{
 if(!listening.value||cents.value===null||detectedMidi.value===null)return 'Waiting for note';
 if(!detectedPitchMatches.value)return 'Different note';
 if(cents.value < -tolerance.value)return 'Too low';
 if(cents.value > tolerance.value)return 'Too high';
 return 'In tune';
});
const done=computed(()=>targets.value.length>0&&cursor.value>=targets.value.length);
const overlayScore=computed(()=>scoreEnabled.value&&diagramEnabled.value&&!disableOverlay.value);
const showScore=scoreEnabled;
const combinedScore=computed(()=>scoreEnabled.value&&diagramEnabled.value&&disableOverlay.value);
const showDiagram=diagramEnabled;
const showGuide=computed(()=>guideEnabled.value||scoreEnabled.value);
const completedTargets=ref(new Set<Note>());
const takeBeat=ref<number|null>(null);
const demoBeat=ref<number|null>(null);
const scoreMeasure=computed(()=>{
 const timedBeat=demoBeat.value??takeBeat.value;
 if(timedBeat!==null)return Math.min(to.value,from.value+Math.floor(Math.max(0,timedBeat)/props.beatsPerMeasure));
 const note=current.value??targets.value.at(-1);
 return note?Math.floor((note.start+1e-7)/props.beatsPerMeasure)+1:from.value;
});
const scoreCompleted=computed(()=>[...completedTargets.value]);
const diagramNotes=computed(()=>{
 const start=(scoreMeasure.value-1)*props.beatsPerMeasure;
 const end=start+props.beatsPerMeasure;
 return props.notes.filter(note=>note.start<end&&note.start+note.duration>start);
});
const scoreDemoNotes=computed(()=>{
 if(demoBeat.value===null)return [];
 return practiceNotesSoundingAt(targets.value,(from.value-1)*props.beatsPerMeasure+demoBeat.value);
});
const guideNote=computed(()=>demoPlaying.value?scoreDemoNotes.value.at(-1)??null:current.value);
const guideMidi=computed(()=>guideNote.value?targetPitch(guideNote.value)+props.concertTranspose:null);
const diagramTranspose=computed(()=>['Violin','Contrabass','Bandoneon'].includes(family.value)?props.concertTranspose:0);
const diagramTarget=computed(()=>guideNote.value?targetPitch(guideNote.value)+diagramTranspose.value:null);
const diagramPitches=computed(()=>[...new Set(diagramNotes.value
 .flatMap(note=>[note.pitch,...(note.gesture?.partner?.slice(0,1).map(point=>point.pitch)??[])])
 .map(pitch=>pitch+diagramTranspose.value))]);
const bandoneonHands=computed(()=>family.value==='Bandoneon'
 ?bandoneonPracticeHands(diagramNotes.value,props.instrument,props.staffSplit,props.concertTranspose):undefined);
const bandoneonTargetHand=computed<'right'|'left'|undefined>(()=>family.value==='Bandoneon'&&guideNote.value
 ?partStaffForNote(guideNote.value,props.instrument,props.staffSplit)===1?'right':'left':undefined);
const violinGuide=computed(()=>family.value==='Violin'&&guideMidi.value!==null?suggestViolinPosition(guideMidi.value):null);
const bassGuide=computed(()=>family.value==='Contrabass'&&guideMidi.value!==null
 ?suggestStringMeasurePosition('Contrabass',[{pitch:guideMidi.value}]):null);
const fingeringCue=computed(()=>{
 const violin=violinGuide.value;
 if(violin)return violin.finger===0?'Open '+violin.stringName+' string':
  `Position ${violin.position} · ${violin.stringName} string · finger ${violin.finger}`;
 const bass=bassGuide.value, fingering=bass?.fingerings[0];
 if(bass&&fingering)return fingering.finger==='0'?`Open ${pitchLabel(fingering.openMidi)} string`:
  `Position ${bass.position} · ${pitchLabel(fingering.openMidi)} string · ${fingering.finger==='T'?'thumb':'finger '+fingering.finger}`;
 const hand=bandoneonTargetHand.value;
 return hand?(hand==='right'?'Right hand':'Left hand')+(guideNote.value?.xmlStaff!==1&&guideNote.value?.xmlStaff!==2?' · register guide':''):'';
});
const takePitchOptions={...DEFAULT_PITCH_POSTPROCESS,pitchBiasCents:0,onsetGridBeats:0,durationGridBeats:0};
const takeLeadInBeats=0.75;
const takeReleaseBeats=1;
const upcoming=computed(()=>targets.value.slice(cursor.value+1,cursor.value+4));
const demoPlaying=ref(false);
const takeResult=ref<ReturnType<typeof alignLearnTake>|null>(null);
const feedbackFilter=ref<'all'|'review'>('all');
const feedbackView=ref<'timeline'|'table'>('timeline');
type PracticeTakeExport={
 version:1;song:string;instrument:Instrument;recordedAt:string;build:string;
 measureRange:{from:number;to:number;beatsPerMeasure:number};
 settings:{bpm:number;referenceHz:number;concertTranspose:number;allowAnyOctave:boolean;staff:PracticeStaff;chordTarget:ChordTarget;sensitivity:number};
 timing:{beatZero:string;frameMidi:string;noteMidi:string;leadInBeats:number;releaseBeats:number;analysisHalfWindowMs:number};
 postprocessOptions:typeof takePitchOptions;
 expected:Parameters<typeof alignLearnTake>[0];detected:Parameters<typeof alignLearnTake>[1];
 alignment:ReturnType<typeof alignLearnTake>;pitchFrames:PitchFrame[];
};
const takeExport=shallowRef<PracticeTakeExport|null>(null);
const feedbackRows=computed(()=>(takeResult.value?.rows??[]).filter(row=>
 feedbackFilter.value==='all'||row.kind!=='matched'||!row.pitchMatches));
const takeClockAdjusted=computed(()=>Boolean(takeResult.value&&(
 Math.abs(takeResult.value.clock.offsetBeats)>.005||Math.abs(takeResult.value.clock.tempoScale-1)>.001)));
function exportTake(){
 if(takeExport.value)download(JSON.stringify(takeExport.value,null,2),'tango-arranger-practice-take.json','application/json');
}
const recordingClock=shallowRef<PracticeRecordingClock|null>(null);
const takeSummary=computed(()=>{
 const counts={correct:0,wrong:0,missed:0,extra:0,'unresolved-repeat':0};
 for(const row of takeResult.value?.rows??[]){
  if(row.kind==='matched')counts[row.pitchMatches?'correct':'wrong']++;
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
watch(()=>props.instrument,()=>{stopMicrophone();cursor.value=0;setRange(...activeSectionRange(props.initialMeasure));});
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
 stopDemo();cancelTake();takeResult.value=null;takeExport.value=null;restart();
});
watch(allowAnyOctave,()=>{
 cancelTake();takeResult.value=null;takeExport.value=null;stableSince=0;heldProgress.value=0;armed=true;accepted.value=false;
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
 stableSince=0;heldProgress.value=0;armed=false;accepted.value=false;
}
function restart(){
 clearTimeout(repeatTimer);
 completedTargets.value.clear();
 cursor.value=0;stableSince=0;heldProgress.value=0;armed=true;accepted.value=false;
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
   const soundingBeats=previewDuration.value==='tango'?noteSoundingDuration(note):note.duration;
   const end=at+Math.max(0.01,Math.min(rangeEnd-note.start,soundingBeats)*secondsPerBeat);
   const fade=Math.min(0.035,(end-at)/3);
   const tone=ctx.createOscillator(),gain=ctx.createGain();
   tone.type='triangle';tone.frequency.value=expectedFrequency(targetPitch(note)+props.concertTranspose,referenceHz.value);
   gain.gain.setValueAtTime(0,at);
   gain.gain.linearRampToValueAtTime(0.08,at+fade);
   gain.gain.setValueAtTime(0.08,end-fade);
   gain.gain.linearRampToValueAtTime(0,end);
   tone.connect(gain);gain.connect(ctx.destination);tone.start(at);tone.stop(end);
   tone.onended=()=>{tone.disconnect();gain.disconnect();};
  }
  const followDemo=()=>{
   if(demoAudio!==ctx)return;
   demoBeat.value=(ctx.currentTime-start)/secondsPerBeat;
   demoFrame=requestAnimationFrame(followDemo);
  };
  demoFrame=requestAnimationFrame(followDemo);
  demoTimer=setTimeout(stopDemo,100+(rangeEnd-rangeStart)*secondsPerBeat*1000);
 }catch(error){stopDemo();micStatus.value='Could not play the exercise: '+String(error);}
}
function cancelTake(){take=null;takeBeat.value=null;recordingClock.value=null;}
async function startTake(){
 if(take){cancelTake();restart();return;}
 if(!targets.value.length||!microphoneSupported.value||busy.value||demoPlaying.value)return;
 if(!listening.value)await startMicrophone();
 if(!listening.value||!targets.value.length)return;
 const msPerBeat=60000/props.bpm;
 restart();
 take={startMs:performance.now()+msPerBeat*props.beatsPerMeasure,msPerBeat,
  totalBeats:(to.value-from.value+1)*props.beatsPerMeasure,frames:[],targetIndex:0};
 recordingClock.value={startMs:take.startMs,msPerBeat,totalBeats:take.totalBeats};
 takeBeat.value=-props.beatsPerMeasure;
}
function finishTake(analysisHalfWindowMs:number){
 if(!take)return;
 const {frames,totalBeats}=take;
 const rangeStart=(from.value-1)*props.beatsPerMeasure;
 const performed=reprocessPitchFrames(frames,takePitchOptions,props.concertTranspose,totalBeats+takeLeadInBeats+takeReleaseBeats)
  .map(note=>({...note,startBeat:note.startBeat-takeLeadInBeats}));
 const expected=targets.value.map(note=>{
  const startBeat=Math.max(0,note.start-rangeStart);
  return {startBeat,durationBeats:Math.min(note.duration,totalBeats-startBeat),pitch:targetPitch(note)};
 });
 const alignment=alignLearnTake(expected,performed,allowAnyOctave.value);
 takeResult.value=alignment;
 feedbackFilter.value='all';
 takeExport.value={
  version:1,song:props.songTitle,instrument:props.instrument,recordedAt:new Date().toISOString(),
  build:import.meta.env.VITE_APP_BUILD_SHA||'',
  measureRange:{from:from.value,to:to.value,beatsPerMeasure:props.beatsPerMeasure},
  settings:{bpm:props.bpm,referenceHz:referenceHz.value,concertTranspose:props.concertTranspose,
   allowAnyOctave:allowAnyOctave.value,staff:props.grandStaff?staff.value:'all',
   chordTarget:chordTarget.value,sensitivity:sensitivity.value},
  timing:{beatZero:'Start of selected range after count-in',frameMidi:'Fractional sounding MIDI',
   noteMidi:'Written MIDI',leadInBeats:takeLeadInBeats,releaseBeats:takeReleaseBeats,analysisHalfWindowMs},
  postprocessOptions:takePitchOptions,expected,detected:performed,alignment,
  pitchFrames:frames.map(frame=>({...frame,beat:frame.beat===null?null:frame.beat-takeLeadInBeats})),
 };
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
 frequency.value=null;detectedMidi.value=null;
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
  const lowRegister=family.value==='Contrabass'||family.value==='Piano'||family.value==='Bandoneon'||family.value==='Voice';
  const sampleRate=ctx.sampleRate;
  const stride=lowRegister?Math.max(2,Math.round(sampleRate/24000)):1;
  const meter=ctx.createAnalyser();meter.fftSize=lowRegister&&sampleRate>50000?8192:4096;meter.smoothingTimeConstant=0;
  const mute=ctx.createGain();mute.gain.value=0;
  input.connect(meter);meter.connect(mute);mute.connect(ctx.destination);
  stream=acquired;acquired=null;audio=ctx;ctx=null;source=input;analyser=meter;silence=mute;
  listening.value=true;busy.value=false;micStatus.value='Listening · no accompaniment';
  const samples=new Float32Array(meter.fftSize);
  const normalized=new Float32Array(Math.floor(samples.length/stride));
  const minHz=lowRegister?24:65;
  const maxHz=family.value==='Piano'?4500:2000;
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
    if(gain)for(let i=0;i<normalized.length;i++){
     let sum=0;
     for(let j=0;j<stride;j++)sum+=samples[i*stride+j];
     normalized[i]=sum*gain/stride;
    }
    const reading=gain&&!demoPlaying.value&&time>=demoTailUntil?detectMonophonicPitch(normalized,sampleRate/stride,minHz,maxHz):null;
    frequency.value=reading?.frequency??null;
    const midi=reading?practiceMidi(reading.frequency,referenceHz.value):null;
    detectedMidi.value=midi!==null&&reading&&reading.clarity>=0.7?Math.round(midi):null;
    if(take){
     const beat=(time-take.startMs)/take.msPerBeat;
     const sampleBeat=beat-analysisHalfWindowMs/take.msPerBeat;
     if(sampleBeat>=take.totalBeats+takeReleaseBeats)finishTake(analysisHalfWindowMs);
     else{
      takeBeat.value=Math.max(-props.beatsPerMeasure,beat);
      if(sampleBeat>=-takeLeadInBeats)take.frames.push({
       timeSeconds:(time-take.startMs-analysisHalfWindowMs)/1000,beat:sampleBeat+takeLeadInBeats,
       midi,
       clarity:reading?.clarity??null,levelDbfs:levelDb,
      });
      const absoluteBeat=(from.value-1)*props.beatsPerMeasure+Math.max(0,beat);
      while(take.targetIndex+1<targets.value.length&&targets.value[take.targetIndex+1].start<=absoluteBeat+1e-6)take.targetIndex++;
      cursor.value=take.targetIndex;
     }
    }else if(demoPlaying.value||time<demoTailUntil){stableSince=0;heldProgress.value=0;}
    else if(!current.value){
     stableSince=0;
     const last=targets.value.at(-1);
     const lastCents=last&&reading?deviationCents(reading.frequency,targetPitch(last)+props.concertTranspose,referenceHz.value,allowAnyOctave.value):null;
     if(detectedMidi.value===null||lastCents===null||Math.abs(lastCents)>tolerance.value)armed=true;
    }
    else if(detectedMidi.value===null||!nearTarget.value){
     stableSince=0;armed=true;accepted.value=false;
    }else if(armed){
     if(!stableSince)stableSince=time;
     heldProgress.value=Math.min(1,(time-stableSince)/requiredHoldMs.value);
      if(time-stableSince>=requiredHoldMs.value){
      accepted.value=true;heldProgress.value=1;stableSince=0;armed=false;
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
  <Teleport to="#practice-learn-controls">
  <div class="learn-topline">
   <div class="learn-view-controls">
    <div class="learn-display-options" role="group" aria-label="Practice display">
     <button v-for="option in displayOptions" :key="option.value" type="button"
      :class="(option.value==='score'?scoreEnabled:option.value==='diagram'?diagramEnabled:guideEnabled)?'primary':'secondary'" :aria-pressed="option.value==='score'?scoreEnabled:option.value==='diagram'?diagramEnabled:guideEnabled" :aria-label="option.label" :title="option.label" @click="toggleDisplay(option.value)">
      <AppIcon :name="option.icon"/>
     </button>
    </div>
    <div class="learn-transport-controls" role="group" aria-label="Exercise playback and recording">
      <button type="button" class="secondary" :disabled="!targets.length||takeBeat!==null||busy" :aria-pressed="demoPlaying" :aria-label="demoPlaying?'Stop preview':'Listen to notes'" :title="demoPlaying?'Stop preview':'Listen to notes'" @click="listenToNotes"><AppIcon :name="demoPlaying?'square':'play'"/></button>
      <button v-if="microphoneSupported" type="button" class="secondary learn-record-toggle" :class="{'is-recording':takeBeat!==null}" :disabled="!targets.length||demoPlaying||busy" :aria-pressed="takeBeat!==null" :aria-label="takeBeat===null?'Record for feedback':'Cancel recording'" :title="takeBeat===null?'Record for feedback':'Cancel recording'" @click="startTake"><AppIcon :name="takeBeat===null?'record':'square'"/></button>
     </div>
     <button type="button" class="secondary learn-settings-toggle" :class="{'primary':settingsOpen}" :aria-expanded="settingsOpen" aria-controls="learn-settings" aria-label="Settings" title="Settings" @click="settingsOpen=!settingsOpen"><AppIcon name="settings"/></button>
   </div>
  </div>
  </Teleport>
  <div v-if="settingsOpen" id="learn-settings" class="learn-settings" role="group" aria-label="Learn settings">
   <label class="learn-check"><input v-model="disableOverlay" type="checkbox"/> Disable overlay (separate score and diagram)</label>
   <label v-if="overlayScore">Score opacity <input type="range" min="42" max="92" v-model.number="overlayPaper"/></label>
   <div class="learn-settings-range"><MeasureRangeControl :from="from" :to="to" :measures="measures" presets @change="setRange"/></div>
   <label>Intonation tolerance<select v-model.number="tolerance"><option :value="35">Getting started · ±35¢</option><option :value="20">Normal · ±20¢</option><option :value="10">Precise · ±10¢</option><option :value="5">Very precise · ±5¢</option></select></label>
   <div class="learn-reference-readout">A4 tuning: <strong>{{referenceHz}} Hz</strong><small>Change the project reference or this instrument's override under Structure, Keys &amp; Ensemble → Orchestra roster.</small></div>
   <label>Input sensitivity <strong>{{sensitivity}}% · {{inputThreshold.toFixed(0)}} dBFS</strong><input v-model.number="sensitivity" type="range" min="0" max="100" step="5" aria-label="Microphone input sensitivity"/></label>
   <label>Listen: note lengths<select v-model="previewDuration" aria-label="Preview note duration"><option value="tango">Tango articulation (sounding length)</option><option value="written">Written note lengths</option></select></label>
   <label>Stable pitch<select v-model.number="holdMs"><option :value="300">300 ms</option><option :value="400">400 ms</option><option :value="650">650 ms</option><option :value="1000">1 second</option><option :value="0">Note length (score duration)</option></select></label>
   <label v-if="grandStaff">Practice staff
    <select v-model="staff"><option value="all">Both staves</option><option value="upper">{{family==='Piano'?'Upper staff (usually right hand)':'Upper staff'}}</option><option value="lower">{{family==='Piano'?'Lower staff (usually left hand)':'Lower staff'}}</option></select>
   </label>
   <label>Chord target <select v-model="chordTarget"><option value="highest">Highest note</option><option value="lowest">Lowest note</option></select></label>
   <label v-if="family==='Voice'" class="learn-check"><input v-model="voiceAnyOctave" type="checkbox" :disabled="takeBeat!==null"/> Allow any octave</label>
   <label class="learn-check"><input v-model="autoAdvance" type="checkbox"/> Advance after a stable correct note</label>
   <label class="learn-check"><input v-model="autoRepeat" type="checkbox"/> Restart after the last note</label>
  </div>
  <p v-if="family==='Voice'" class="learn-mic-instructions">{{allowAnyOctave?'Sing the written note in any octave.':'Sing each note in its written octave.'}}</p>
  <p v-else-if="microphoneSupported" class="learn-mic-instructions">Play one note at a time for feedback. Chords and double stops use the {{chordTarget}} note{{grandStaff&&staff!=='all'?' on the '+staff+' staff':''}}. The score shows the full part.</p>
  <Teleport v-if="recordingClock" to="#practice-recording-beat">
   <PracticeRecordingBeat :clock="recordingClock" :beats="beatsPerMeasure" :first-measure="from"/>
  </Teleport>
  <Teleport to="#practice-learn-tuner">
  <div class="learn-tuner" role="region" aria-label="Target-aware pitch tuner">
   <div class="learn-tuner-title"><div class="learn-navigation learn-practice-controls" role="group" aria-label="Note practice controls">
     <button v-if="microphoneSupported" type="button" class="learn-mic-toggle" :class="{'is-listening':listening}" :aria-label="busy?'Starting microphone':listening?'Stop microphone':'Start microphone'" :title="busy?'Starting microphone':listening?'Stop microphone':'Start microphone'" :aria-pressed="listening" :disabled="busy||takeBeat!==null" @click="startMicrophone"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-3 0h6"/></svg></button>
     <button type="button" class="secondary" :disabled="cursor===0||takeBeat!==null||demoPlaying" @click="moveCursor(-1)" aria-label="Previous note" title="Previous note"><AppIcon name="arrow-left"/></button>
     <button type="button" class="secondary" :disabled="cursor>=targets.length||takeBeat!==null||demoPlaying" @click="moveCursor(1)" aria-label="Next note" title="Next note"><span class="learn-arrow-next"><AppIcon name="arrow-left"/></span></button>
     <button type="button" class="secondary" :disabled="takeBeat!==null||demoPlaying" @click="restart" aria-label="Restart" title="Restart"><AppIcon name="refresh-cw"/></button>
    </div>
    
    <strong>Intonation · {{current?pitchLabel(targetMidi??current.pitch):'—'}}</strong>
    <span :class="{'learn-in-tune':nearTarget}">{{cents===null?'—':(cents>0?'+':'')+cents+'¢'}}</span>
   </div>
   <div v-if="listening&&!demoPlaying" class="learn-detected-pitch" :class="{'pitch-matched':detectedPitchMatches}">
    <span>Detected note</span><strong>{{detectedMidi===null?'—':pitchLabel(detectedMidi)}}</strong>
   </div>
   <div v-if="listening&&!demoPlaying" class="learn-live-feedback" :class="{'is-flat':intonationFeedback==='Too low','is-sharp':intonationFeedback==='Too high','is-correct':intonationFeedback==='In tune'}" role="status">
      <strong>{{intonationFeedback}}</strong><span v-if="cents!==null&&detectedPitchMatches">{{cents>0?'+':''}}{{cents}}¢</span>
      <span v-if="current">{{Math.round(requiredHoldMs)}} ms target</span>
     </div>
    <div v-if="listening&&!demoPlaying" class="learn-hold-track" role="progressbar" aria-label="Correct pitch held for required duration" :aria-valuenow="Math.round(heldProgress*100)" aria-valuemin="0" aria-valuemax="100"><span :style="{width:(heldProgress*100)+'%'}"></span></div>
    <div class="learn-tuner-meter" role="meter" aria-label="Pitch deviation from expected note" :aria-valuemin="-50" :aria-valuemax="50" :aria-valuenow="cents===null?undefined:Math.max(-50,Math.min(50,cents))">
    <div class="learn-accuracy-window" :style="{left:(50-tolerance/2)+'%',width:tolerance+'%'}"></div>
    <div class="learn-meter-center"></div>
    <div v-if="cents!==null" class="learn-meter-needle" :style="{left:Math.max(0,Math.min(100,50+cents/2))+'%'}"></div>
   </div>
   <div class="learn-tuner-ends"><span>Flat −50¢</span><span>In tune</span><span>Sharp +50¢</span></div>
   <div class="learn-mic-row">
    <meter v-if="microphoneSupported" min="-90" max="0" :value="inputDb??-90" aria-label="Microphone input level" :aria-valuetext="inputDb===null?'Microphone off':inputDb+' dBFS'"/>
    <small role="status">{{micStatus}}{{inputDb!==null?' · '+inputDb+' dBFS':''}}{{frequency!==null?' · '+frequency.toFixed(1)+' Hz':''}}{{accepted?' · Correct pitch held':''}} · A4={{referenceHz}} Hz<span v-if="targetHz!==null"> · {{allowAnyOctave?'written pitch':'target'}} {{targetHz.toFixed(1)}} Hz</span></small>
   </div>
  </div>
  </Teleport>
  <div class="learn-display" :class="{'learn-display-both':showGuide&&showDiagram,'learn-display-combined':combinedScore,'learn-display-overlay':overlayScore}"
   :style="overlayScore?{'--score-paper':`rgb(248 250 252 / ${overlayPaper/100})`}:undefined">
   <div v-if="showGuide" class="learn-guide" aria-label="Expected notes">
    <div class="learn-progress">{{done?'Pass complete':'Note '+Math.min(cursor+1,targets.length)+' of '+targets.length}} · measures {{from}}–{{to}}</div>
    <div v-if="showScore&&guideEnabled" class="learn-overlay-cue">
     <strong>{{guideMidi!==null?pitchLabel(guideMidi):demoPlaying?'Rest':'—'}}</strong>
     <span v-if="fingeringCue">{{fingeringCue}}</span>
     <span v-if="listening&&!demoPlaying" class="learn-overlay-detected" :class="{'pitch-matched':detectedPitchMatches}">
      Heard <b>{{detectedMidi===null?'—':pitchLabel(detectedMidi)}}</b>
     </span>
    </div>
    <div v-if="showScore" class="learn-score-panel">
     <slot name="score" :from="from" :to="to" :measure="scoreMeasure" :expected="demoPlaying?undefined:current??undefined" :completed="scoreCompleted" :playing="scoreDemoNotes" :feedback-progress="heldProgress" :feedback-state="intonationFeedback" />
     <small class="learn-score-legend">
      <template v-if="demoPlaying">Listening · measure {{scoreMeasure}}</template>
      <template v-else-if="current">Expected: {{pitchLabel(targetMidi??current.pitch)}} · completed notes in green</template>
      <template v-else-if="done">{{autoRepeat?'Starting again…':'Pass complete'}}</template>
      <template v-else>No practice targets in this range.</template>
     </small>
    </div>
    <div v-else-if="current" class="learn-note-cards">
     <div class="learn-target learn-target-current" aria-live="polite">
      <small>PLAY NOW</small><strong>{{pitchLabel(targetMidi??current.pitch)}}</strong>
      <span>M{{Math.floor(current.start/beatsPerMeasure)+1}} · beat {{(current.start%beatsPerMeasure+1).toFixed(2)}}</span>
      <span>{{current.duration}} beats</span>
      <span v-if="otherPitches(current)" class="learn-companion-notes" :aria-label="'Other notes at this attack: '+otherPitches(current)">{{otherPitches(current)}}</span>
     </div>
     <div v-for="(note,index) in upcoming" :key="cursor+index+1" class="learn-target">
      <small>{{index===0?'NEXT':`THEN ${index+1}`}}</small><strong>{{pitchLabel(targetPitch(note)+concertTranspose)}}</strong>
      <span>M{{Math.floor(note.start/beatsPerMeasure)+1}} · beat {{(note.start%beatsPerMeasure+1).toFixed(2)}}</span>
      <span>{{note.duration}} beats</span>
      <span v-if="otherPitches(note)" class="learn-companion-notes" :aria-label="'Other notes at this attack: '+otherPitches(note)">{{otherPitches(note)}}</span>
     </div>
    </div>
    <div v-else class="learn-target learn-empty" role="status">
     <template v-if="done"><strong>Pass complete</strong><span>{{autoRepeat?'Starting again…':'Press Restart to practise again.'}}</span></template>
     <template v-else><strong>No practice targets</strong><span>Choose another range or staff in Settings.</span></template>
    </div>
   </div>
   <div v-if="showDiagram" class="learn-diagram">
    <slot name="diagram" :target-pitch="diagramTarget" :current-beat="guideNote?Math.floor(guideNote.start%beatsPerMeasure)+1:1"
     :show-target-label="!showGuide" :feedback-progress="heldProgress" :feedback-state="intonationFeedback" :feedback-cents="cents" :measure-pitches="diagramPitches" :bass-guide="bassGuide" :violin-guide="violinGuide"
     :bandoneon-hands="bandoneonHands" :bandoneon-target-hand="bandoneonTargetHand"/>
   </div>
  </div>
  <section v-if="takeResult" class="learn-feedback" aria-label="Feedback from your last recording">
   <div class="learn-feedback-actions">
    <h3>Last recording</h3>
    <div class="learn-feedback-switch" role="group" aria-label="Recording feedback view">
     <button type="button" :class="feedbackView==='timeline'?'primary':'secondary'" :aria-pressed="feedbackView==='timeline'" @click="feedbackView='timeline'">Timeline</button>
     <button type="button" :class="feedbackView==='table'?'primary':'secondary'" :aria-pressed="feedbackView==='table'" @click="feedbackView='table'">Note details</button>
    </div>
    <label>Show <select v-model="feedbackFilter"><option value="all">All notes</option><option value="review">Notes to review</option></select></label>
    <button type="button" class="secondary" @click="exportTake">Export take JSON</button>
   </div>
   <p v-if="feedbackView==='table'">{{takeSummary.correct}} correct pitches · {{takeSummary.wrong}} wrong · {{takeSummary.missed}} undetected · {{takeSummary.extra}} extra<span v-if="takeSummary['unresolved-repeat']"> · {{takeSummary['unresolved-repeat']}} unresolved repeats</span></p>
   <p v-if="takeClockAdjusted" class="hint">Alignment estimated a start offset of {{signed(takeResult.clock.offsetBeats,' beats')}} and a take tempo of {{(bpm/takeResult.clock.tempoScale).toFixed(1)}} BPM. The timeline uses the adjusted timing.</p>
   <PracticeTakeTimeline v-if="feedbackView==='timeline'" :rows="takeResult.rows" :clock="takeResult.clock"
    :from="from" :to="to" :beats="beatsPerMeasure" :review-only="feedbackFilter==='review'"
    :transpose="concertTranspose" :pitch-label="pitchLabel" :pitch-frames="takeExport?.pitchFrames"/>
   <template v-else>
   <p class="hint">Timing and duration are in beats. Negative values mean early or short. A sustained detection can cover a repeated pitch without confirming a separate attack.</p>
   <div class="learn-feedback-scroll">
    <table>
     <thead><tr><th scope="col">Measure · beat</th><th scope="col">Expected</th><th scope="col">Detected</th><th scope="col">Raw onset Δ</th><th v-if="takeClockAdjusted" scope="col">Aligned onset Δ</th><th scope="col">Duration Δ</th><th scope="col">Intonation</th></tr></thead>
     <tbody>
      <tr v-for="(row,index) in feedbackRows" :key="index">
       <td>{{scoreLocation(row.kind==='extra'?row.played.startBeat:row.target.startBeat)}}</td>
       <td>{{row.kind==='extra'?'—':pitchLabel(row.target.pitch+concertTranspose)}}</td>
       <td :class="{'learn-feedback-wrong':row.kind!=='matched'||!row.pitchMatches}">
        <template v-if="row.kind==='missed'">No detection</template>
        <template v-else-if="row.kind==='unresolved-repeat'">Repeat unresolved</template>
        <template v-else>{{pitchLabel(row.played.pitch+concertTranspose)}}{{row.kind==='extra'?' · extra':!row.pitchMatches?' · wrong':row.played.pitch!==row.target.pitch?' · octave match':''}}</template>
       </td>
       <td>{{row.kind==='matched'?signed(row.played.startBeat-row.target.startBeat,''):'—'}}</td>
       <td v-if="takeClockAdjusted">{{row.kind==='matched'?signed((row.played.startBeat-takeResult.clock.offsetBeats)/takeResult.clock.tempoScale-row.target.startBeat,''):'—'}}</td>
       <td>{{row.kind==='matched'?signed(row.played.durationBeats/takeResult.clock.tempoScale-row.target.durationBeats,''):row.kind==='extra'?row.played.durationBeats.toFixed(2)+' beats':'—'}}</td>
       <td>{{row.kind==='matched'&&row.pitchMatches?signed(row.played.intonationCents,'¢',0):'—'}}</td>
      </tr>
     </tbody>
    </table>
   </div>
   </template>
  </section>
 </section>
</template>
<style scoped>
.learn-workspace{width:100%;max-width:1100px;margin:0 auto;min-width:0;display:flex;flex-direction:column;gap:10px;color:#ebf2f7}
.learn-topline,.learn-tuner-title,.learn-navigation,.learn-mic-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.learn-topline{justify-content:space-between}
.learn-view-controls,.learn-display-options{display:flex;align-items:center;flex-wrap:wrap;gap:6px;min-width:0}
.learn-display-options button{display:inline-flex;justify-content:center;align-items:center;gap:5px;min-height:40px;padding:5px 8px;font-size:12px}
.learn-display-options .app-icon{width:18px;height:18px;flex:none}
@media(max-width:600px){
 .learn-topline{display:grid;grid-template-columns:minmax(0,1fr) auto}
 .learn-topline>strong{grid-area:1/1}
 .learn-view-controls{display:contents}
 .learn-settings-toggle{grid-area:1/2}
 .learn-display-options{grid-area:2/1/3/-1;display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
 .learn-display-options button{min-height:44px;text-align:left;justify-content:flex-start;line-height:1.15;white-space:normal}
}
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
.learn-mic-instructions{margin:0;text-align:center;font-size:12px;color:#b7cbd8}
.learn-target .learn-companion-notes{max-width:100%;overflow-wrap:anywhere;color:#aebfcd}
.learn-feedback{min-width:0;border:1px solid #526c7d;border-radius:9px;background:#1a2c39;padding:10px}
.learn-feedback-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:6px}
.learn-feedback-actions h3{margin-right:auto}
.learn-feedback-switch{display:flex;gap:4px}
.learn-feedback-actions label{display:flex;align-items:center;gap:6px}
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
.learn-score-panel{min-width:0;--score-follow-height:clamp(285px,54dvh,560px)}
.learn-display-combined .learn-score-panel{--score-follow-height:clamp(225px,36dvh,380px)}
.learn-score-panel .learn-score-legend{display:block;min-height:1.35em}
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
/* Keep the score and diagram in the same sightline while the tuner stays readable. */
.learn-display-overlay{
 grid-template-columns:minmax(0,1fr);
 grid-template-rows:auto auto;
 grid-template-areas:"overlay" "tuner";
 isolation:isolate;
}
.learn-display-overlay>.learn-guide{grid-area:overlay;z-index:1;background:transparent;min-width:0}
.learn-display-overlay>.learn-diagram{
 grid-area:overlay;z-index:0;pointer-events:none;min-width:0;min-height:0;
 overflow:hidden;align-items:center;background:#c5d6e0;padding:clamp(12px,3vw,36px) 8px;
}
.learn-display-overlay>.learn-tuner{grid-area:tuner;align-self:center}
.learn-display-overlay :deep(.diagram-measure-chords),
.learn-display-overlay :deep(.diagram-upcoming-measure){display:none}
.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn){max-width:none}
.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard){
 grid-template-columns:minmax(0,1fr);grid-auto-rows:auto;justify-items:stretch;align-content:center;
 gap:clamp(4px,1dvh,10px);width:100%;min-height:0;padding:clamp(8px,2vw,22px);
 background:transparent;border-color:transparent;
}
.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-string-row){
 width:100%;align-items:stretch;min-height:clamp(35px,6dvh,63px);gap:clamp(3px,1vw,10px);
}
.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-string-stop),
.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-open-label){
 height:auto;align-self:stretch;
}
.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-string-stop span),
.learn-display-overlay :deep(.diagram-open-label strong){font-size:clamp(12px,2.3vw,28px);color:#132f41}
.learn-display-overlay :deep(.diagram-violin-position){display:none}
.learn-overlay-cue{min-height:36px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:#132f41}
.learn-overlay-cue strong{background:#ffe0a2;border:1px solid #9b5a21;border-radius:6px;padding:2px 7px;font-size:clamp(18px,3vw,29px);line-height:1.1}
.learn-overlay-detected,.learn-detected-pitch{display:inline-flex;align-items:center;gap:6px;padding:3px 7px;border:1px solid #a6b8c5;border-radius:6px;background:#223948;color:#eaf3fa}
.learn-overlay-detected{margin-left:auto}
.learn-detected-pitch{align-self:flex-start;font-size:12px}
.learn-detected-pitch strong,.learn-overlay-detected b{font-size:clamp(16px,2.2vw,23px);line-height:1.1}
.learn-overlay-detected.pitch-matched,.learn-detected-pitch.pitch-matched{color:#d2ffe4;background:#235447;border-color:#8ad9af}
.learn-overlay-cue span{font-size:clamp(12px,1.8vw,18px);font-weight:700}
.learn-display-overlay :deep(.diagram-string-stop){border-top-color:#7896a9}
.learn-display-overlay :deep(.diagram-string-stop.is-measure-note:not(.is-learn-target)){background:#9db8c9}
.learn-display-overlay :deep(.diagram-string-stop.is-learn-target),
.learn-display-overlay :deep(.diagram-open-label.is-learn-target){
 background:#ff9e25!important;border:2px solid #98500d!important;box-shadow:none!important;
}
.learn-display-overlay :deep(.diagram-visual-stage){min-height:0}
.learn-display-overlay .learn-score-panel{--score-follow-height:clamp(225px,42dvh,430px)}
.learn-display-overlay .learn-progress,.learn-display-overlay .learn-score-legend{color:#1f3444}
@media(min-width:900px) and (orientation:landscape){
 .learn-display-overlay{grid-template-columns:minmax(0,1fr) clamp(160px,21vw,270px);grid-template-rows:auto;grid-template-areas:"overlay tuner"}
}

.learn-display:not(.learn-display-overlay):not(.learn-display-combined)>.learn-tuner{padding:7px 10px;gap:5px}
.learn-live-feedback{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;color:#c5d5df}
.learn-live-feedback strong{color:#e6eff6}
.learn-live-feedback.is-flat strong{color:#9fc9ff}
.learn-live-feedback.is-sharp strong{color:#ffb79b}
.learn-live-feedback.is-correct strong{color:#90e3b2}
.learn-hold-track{height:9px;border-radius:7px;background:#33495b;overflow:hidden}
.learn-hold-track>span{display:block;height:100%;background:#83d7b0;transition:width 65ms linear}
.learn-display:not(.learn-display-overlay):not(.learn-display-combined) .learn-tuner-ends{font-size:10px}
@media(min-width:760px){
 .learn-display:not(.learn-display-overlay):not(.learn-display-combined)>.learn-tuner .learn-tuner-meter{height:12px}
}

.learn-display-options button{width:46px;min-width:46px;min-height:42px;padding:7px!important;justify-content:center!important}
.learn-display-options .app-icon{width:22px;height:22px}
@media(max-width:600px){
 .learn-display-options{display:flex;grid-template-columns:none;grid-area:2/1/3/-1;justify-content:center;gap:8px}
 .learn-display-options button{min-height:44px;text-align:center;justify-content:center}
}

/* Compact controls shared by all Learn layouts. */
.learn-topline{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.learn-view-controls{display:flex;flex-wrap:wrap;align-items:center;gap:5px}
.learn-display-options,.learn-transport-controls,.learn-practice-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.learn-view-controls button,.learn-practice-controls button{
 display:inline-flex;align-items:center;justify-content:center;width:44px;min-width:44px;min-height:44px;padding:6px!important;box-sizing:border-box
}
.learn-view-controls .app-icon,.learn-practice-controls .app-icon,.learn-practice-controls svg{width:21px;height:21px;flex:none}
.learn-practice-controls .learn-mic-toggle{border:1px solid #6a8293;background:#344759;color:#e8eff4;border-radius:8px}
.learn-practice-controls .learn-mic-toggle.is-listening{background:#235447;border-color:#86d7aa;color:#e7fff2}
.learn-arrow-next{display:flex;transform:rotate(180deg)}
.learn-record-toggle .app-icon{color:#f65d62;fill:#f65d62}
.learn-record-toggle.is-recording{border-color:#f65d62;background:#4d2931}
.learn-practice-controls{justify-content:center;margin:0;flex:0 0 auto}
.learn-mic-instructions{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.learn-display{grid-template-areas:"tuner" "guide" "diagram";grid-template-rows:auto}
.learn-display>.learn-tuner{grid-area:tuner;min-width:0;padding:6px 9px;gap:4px}
.learn-display:not(.learn-display-both):has(>.learn-guide):not(:has(>.learn-diagram)){grid-template-areas:"tuner" "guide"}
.learn-display:not(.learn-display-both):has(>.learn-diagram):not(:has(>.learn-guide)){grid-template-areas:"tuner" "diagram"}
.learn-display>.learn-guide{grid-area:guide}
.learn-display>.learn-diagram{grid-area:diagram;min-width:0;width:100%;box-sizing:border-box}
.learn-display-both{grid-template-columns:minmax(0,1fr);grid-template-areas:"tuner" "guide" "diagram"}
.learn-display-both>.learn-guide,.learn-display-both>.learn-diagram,.learn-display-both>.learn-tuner{grid-column:auto;grid-row:auto}
.learn-display-both>.learn-guide{grid-area:guide}
.learn-display-both>.learn-diagram{grid-area:diagram}
.learn-display-both>.learn-tuner{grid-area:tuner}
.learn-display-overlay{grid-template-areas:"tuner" "overlay"}
.learn-display-overlay>.learn-guide,.learn-display-overlay>.learn-diagram{grid-area:overlay}
.learn-display :deep(.performance-instrument-diagram.is-focus.is-learn){width:100%;max-width:none;min-width:0}
.learn-display :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard){width:100%;min-width:0;box-sizing:border-box;grid-template-columns:minmax(0,1fr)}
.learn-display :deep(.performance-instrument-diagram.is-focus.is-learn .diagram-fingerboard .diagram-string-row){width:100%;min-width:0;box-sizing:border-box;grid-template-columns:repeat(calc(var(--stop-count,7) + 1),minmax(0,1fr))}
.learn-display :deep(.diagram-open-label){width:100%;min-width:0}
@media(min-width:900px) and (orientation:landscape){
 .learn-display-both{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"tuner tuner" "guide diagram";grid-template-rows:auto auto}
 .learn-display-overlay{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"tuner tuner" "guide diagram";grid-template-rows:auto auto}
 .learn-display-overlay>.learn-guide{grid-area:guide;background:#1a2a36}
 .learn-display-overlay>.learn-diagram{grid-area:diagram;background:#1a2a36;pointer-events:auto}
 .learn-display-overlay :deep(.diagram-violin-position){display:block}
 .learn-display-overlay :deep(.diagram-fingerboard){background:#152936}
 .learn-display-overlay :deep(.diagram-measure-chords),.learn-display-overlay :deep(.diagram-upcoming-measure){display:grid}
 .learn-display-overlay :deep(.diagram-string-stop span),.learn-display-overlay :deep(.diagram-open-label strong){color:inherit}
 .learn-display-overlay .learn-progress,.learn-display-overlay .learn-score-legend{color:#b7cbd8}
 /* Overlay paper opacity is inherited from the active slider at every width. */
 .learn-tuner{display:grid;grid-template-columns:minmax(0,auto) minmax(100px,1fr);align-items:center;column-gap:12px}
 .learn-tuner-title{grid-column:1;grid-row:1/3;justify-content:flex-start}
 .learn-tuner-meter{grid-column:2;grid-row:1;height:12px}
 .learn-tuner-ends{grid-column:2;grid-row:2}
 .learn-mic-row,.learn-live-feedback,.learn-hold-track,.learn-detected-pitch{grid-column:1/-1}
}
@media(max-width:600px){
 .learn-topline{justify-content:center}
 .learn-topline>strong{flex:1 1 100%;text-align:left}
 .learn-view-controls{justify-content:center;width:100%}
 .learn-view-controls button,.learn-practice-controls button{width:40px;min-width:40px;min-height:44px}
}

/* Learn controls live in the parent focus header. Content is a separate
   flexible grid, with no empty tuner row or orientation-dependent overlay. */
.learn-topline{justify-content:flex-end;min-width:0}
.learn-view-controls{width:auto;justify-content:flex-end}
.learn-view-controls button,.learn-practice-controls button{width:40px;min-width:40px;min-height:40px}
.learn-view-controls .learn-transport-controls{border-left:1px solid #526c7d;padding-left:6px}
.learn-tuner{width:100%;box-sizing:border-box;display:grid;grid-template-columns:minmax(0,auto) minmax(100px,1fr);align-items:center;gap:3px 10px;padding:4px 6px;border:0;background:transparent}
.learn-tuner-title{grid-column:1;grid-row:1/3;justify-content:flex-start;gap:6px}
.learn-tuner-title .learn-mic-toggle{min-width:40px;width:40px;min-height:40px;padding:6px}
.learn-tuner-meter{grid-column:2;grid-row:1;height:10px}
.learn-tuner-ends{grid-column:2;grid-row:2;font-size:10px}
.learn-mic-row,.learn-live-feedback,.learn-hold-track,.learn-detected-pitch{grid-column:1/-1}
.learn-mic-row small{font-size:11px}
.learn-workspace{max-width:none;width:100%;min-height:0;flex:1 1 auto;align-self:stretch;gap:6px}
.learn-display,.learn-display-both,.learn-display-combined,.learn-display-overlay{
 flex:1 1 auto;min-height:0;grid-template-columns:minmax(0,1fr);
 grid-template-rows:minmax(0,1fr);grid-template-areas:"guide";align-items:stretch;
}
.learn-display:not(.learn-display-both):has(>.learn-diagram):not(:has(>.learn-guide)){grid-template-areas:"diagram"}
.learn-display:not(.learn-display-both):has(>.learn-guide):not(:has(>.learn-diagram)){grid-template-areas:"guide"}
.learn-display-both,.learn-display-combined{grid-template-areas:"guide" "diagram";grid-template-rows:minmax(180px,1fr) minmax(160px,1fr)}
.learn-display-overlay{grid-template-areas:"overlay";grid-template-rows:minmax(0,1fr);grid-template-columns:minmax(0,1fr)}
.learn-display>.learn-guide,.learn-display>.learn-diagram{min-height:0;align-self:stretch;box-sizing:border-box}
.learn-display>.learn-guide{display:flex;flex-direction:column;grid-area:guide}
.learn-display>.learn-diagram{grid-area:diagram}
.learn-display-overlay>.learn-guide,.learn-display-overlay>.learn-diagram{grid-area:overlay}
.learn-display-overlay>.learn-guide{background:transparent;z-index:1}
.learn-display-overlay>.learn-diagram{background:#c5d6e0;pointer-events:none;z-index:0}
.learn-display-overlay :deep(.diagram-fingerboard){background:transparent!important}
.learn-display-overlay :deep(.diagram-measure-chords),.learn-display-overlay :deep(.diagram-upcoming-measure){display:none}
.learn-display-overlay :deep(.diagram-violin-position){display:none}
.learn-display-overlay :deep(.diagram-string-stop span),.learn-display-overlay :deep(.diagram-open-label strong){color:#132f41}
.learn-display-overlay .learn-progress,.learn-display-overlay .learn-score-legend{color:#1f3444}
.learn-score-panel{flex:1 1 auto;min-height:0;display:flex;flex-direction:column}
.learn-score-panel :deep(.score-preview){flex:1 1 auto;min-height:0;display:flex;flex-direction:column;margin:4px 0}
.learn-score-panel :deep(.score-preview-follow){height:0;flex:1 1 auto;min-height:92px}
.learn-display-overlay .learn-score-panel :deep(.score-preview){background:var(--score-paper)!important}
.learn-display-overlay .learn-score-panel :deep(.score-preview-canvas),
.learn-display-overlay .learn-score-panel :deep(.score-preview-canvas svg){background:transparent!important}
.learn-display-overlay>.learn-diagram{grid-area:overlay;align-self:stretch;justify-content:center}
.learn-display-overlay>.learn-diagram :deep(.performance-instrument-diagram){height:100%;width:100%;min-height:0}
.learn-display-overlay>.learn-diagram :deep(.diagram-visual-stage){flex:1 1 auto;min-height:0;width:100%;display:flex;align-items:center}
.learn-display-overlay>.learn-diagram :deep(.diagram-fingerboard){width:100%;max-width:none}

.learn-display-overlay :deep(.performance-instrument-diagram.is-focus.is-learn){align-self:stretch;justify-content:center}
.learn-overlay-cue{color:inherit}
@media(min-width:900px) and (orientation:landscape){
 .learn-display-both:not(.learn-display-overlay),.learn-display-combined{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"guide diagram";grid-template-rows:minmax(0,1fr)}
}
@media(max-width:650px){
 .learn-topline,.learn-view-controls{justify-content:flex-start}
 .learn-tuner{grid-template-columns:minmax(0,1fr)}
 .learn-tuner-title,.learn-tuner-meter,.learn-tuner-ends{grid-column:1;grid-row:auto}
}
</style>
