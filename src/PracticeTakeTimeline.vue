<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
import type {LearnTakeClock,LearnTakeRow} from './learnTake';
import type {PitchFrame} from './pitchPostprocess';
import {feedbackStatuses,feedbackStatus,practiceFeedbackTimeline,type FeedbackStatus} from './practiceFeedbackTimeline';

const props=defineProps<{
 rows:readonly LearnTakeRow[];clock:LearnTakeClock;beats:number;from:number;to:number;
 reviewOnly:boolean;transpose:number;pitchLabel:(pitch:number)=>string;
 pitchFrames?:readonly PitchFrame[];
}>();
const scroller=ref<HTMLElement|null>(null);
const selected=ref<number|null>(null);
const showPitchTrace=ref(true);
const count=computed(()=>props.to-props.from+1);
const timeline=computed(()=>practiceFeedbackTimeline(props.rows,props.clock,props.beats,count.value));
const scrollLeft=ref(0),scrollLimit=ref(0);
// Raw frames are sounding MIDI; convert to the same written MIDI as the note
// lanes, and apply the fitted recording clock to the horizontal coordinate.
const trace=computed(()=>{
 const points=(props.pitchFrames??[]).filter((frame):frame is PitchFrame&{beat:number;midi:number}=>frame.beat!==null&&frame.midi!==null&&Number.isFinite(frame.beat)&&Number.isFinite(frame.midi)&&frame.clarity!==null&&frame.clarity>=.65)
  .map(frame=>({beat:(frame.beat-props.clock.offsetBeats)/props.clock.tempoScale,midi:frame.midi-props.transpose}))
  .filter(point=>point.beat>=timeline.value.start&&point.beat<=timeline.value.start+timeline.value.span)
  .sort((a,b)=>a.beat-b.beat);
 const pitches=[...points.map(point=>point.midi),...props.rows.flatMap(row=>row.kind==='extra'?[]:[row.target.pitch])];
 const low=pitches.length?Math.floor(Math.min(...pitches)-1):60;
 const high=pitches.length?Math.ceil(Math.max(...pitches)+1):72;
 const span=Math.max(4,high-low);
 const segments:string[]=[];
 let segment:string[]=[];
 let previous:typeof points[number]|null=null;
 for(const point of points){
  if(previous&&(point.beat-previous.beat>.4||Math.abs(point.midi-previous.midi)>7)){
   if(segment.length)segments.push(segment.join(' '));
   segment=[];
  }
  const x=((point.beat-timeline.value.start)/timeline.value.span)*1000;
  const y=8+(high-point.midi)/span*104;
  segment.push((segment.length?'L':'M')+x.toFixed(2)+' '+y.toFixed(2));
  previous=point;
 }
 if(segment.length)segments.push(segment.join(' '));
 return {segments,low,high,points:points.length};
});
let resize:ResizeObserver|undefined;
function syncScroll(){
 const viewport=scroller.value;
 if(!viewport)return;
 scrollLeft.value=Math.max(0,viewport.scrollLeft);
 scrollLimit.value=Math.max(0,viewport.scrollWidth-viewport.clientWidth);
}
onMounted(()=>{
 syncScroll();
 if(scroller.value&&typeof ResizeObserver!=='undefined'){
  resize=new ResizeObserver(syncScroll);
  resize.observe(scroller.value);
 }
});
onBeforeUnmount(()=>resize?.disconnect());
const summary=computed(()=>{
 const counts:Record<FeedbackStatus,number>={correct:0,wrong:0,missed:0,'unresolved-repeat':0,extra:0};
 for(const row of props.rows)counts[feedbackStatus(row)]++;
 return counts;
});
const detail=computed(()=>selected.value===null?undefined:props.rows[selected.value]);
watch(()=>props.rows,()=>{
 selected.value=null;
 if(scroller.value)scroller.value.scrollLeft=0;
 syncScroll();
},{flush:'post'});
watch(()=>props.reviewOnly,()=>{selected.value=null;});
function scrollTimeline(direction:number){
 const viewport=scroller.value;
 if(viewport)viewport.scrollBy({left:direction*viewport.clientWidth*.8,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function measureLabel(index:number){
 if(index<0)return 'Before selection';
 if(index>=count.value)return 'After selection';
 return 'Measure '+(props.from+index);
}
function pitch(p:number){return props.pitchLabel(p+props.transpose);}
function alignedStart(row:Extract<LearnTakeRow,{kind:'matched'}>){return (row.played.startBeat-props.clock.offsetBeats)/props.clock.tempoScale;}
function alignedDuration(row:Extract<LearnTakeRow,{kind:'matched'}>){return row.played.durationBeats/props.clock.tempoScale;}
function detectedPitchGrade(row:LearnTakeRow,lane:'expected'|'detected'){
 if(lane!=='detected'||row.kind!=='matched'||!row.pitchMatches)return '';
 return 'grade-'+pitchGrade(row.played.intonationCents);
}
function pitchGrade(cents:number){const value=Math.abs(cents);return value<=10?'excellent':value<=20?'good':value<=35?'noticeable':'needs-work';}
function pitchGradeLabel(cents:number){return ({excellent:'Excellent',good:'Good',noticeable:'Noticeable','needs-work':'Needs work'})[pitchGrade(cents)];}
function beatMs(beats:number){return Math.round(beats*60000/150);}
function timing(row:Extract<LearnTakeRow,{kind:'matched'}>){
 const onset=alignedStart(row)-row.target.startBeat;
 const duration=alignedDuration(row)-row.target.durationBeats;
 return {onset,duration,release:onset+duration};
}
const matchedStats=computed(()=>{
 const matches=props.rows.filter((r):r is Extract<LearnTakeRow,{kind:'matched'}>=>r.kind==='matched'&&r.pitchMatches);
 const median=(values:number[])=>{if(!values.length)return null;const sorted=values.sort((a,b)=>a-b);return (sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2;};
 return {pitch:median(matches.map(r=>Math.abs(r.played.intonationCents))),onset:median(matches.map(r=>Math.abs(timing(r).onset))),release:median(matches.map(r=>Math.abs(timing(r).release)))};
});
function signed(value:number,places=2){
 const rounded=Number(value.toFixed(places));
 return (rounded>0?'+':'')+rounded.toFixed(places);
}
</script>

<template>
 <div class="practice-timeline" aria-label="Practice take timeline">
  <div v-if="rows.length" class="practice-distribution" aria-hidden="true">
   <span v-for="(amount,status) in summary" :key="status" :class="'result-'+status" :style="{flexGrow:amount}" v-show="amount"></span>
  </div>
  <ul class="practice-legend" aria-label="Results and color key">
   <li v-for="(label,status) in feedbackStatuses" :key="status" :class="'result-'+status">
    <strong>{{summary[status]}}</strong> {{label}}
   </li>
  </ul>
  <div class="practice-performance-summary" aria-label="Performance precision">
   <span v-if="matchedStats.pitch!==null">Median pitch deviation <strong>{{Math.round(matchedStats.pitch)}}¢</strong></span>
   <span v-if="matchedStats.onset!==null">Median onset deviation <strong>{{signed(matchedStats.onset)}} beats</strong></span>
   <span v-if="matchedStats.release!==null">Median release deviation <strong>{{signed(matchedStats.release)}} beats</strong></span>
   <span v-if="summary['unresolved-repeat']">Articulation uncertain <strong>{{summary['unresolved-repeat']}}</strong></span>
  </div>
  <div class="practice-precision-legend" aria-label="Pitch precision colors"><span>Pitch precision</span><i class="grade-excellent"></i> Excellent (≤10¢) <i class="grade-good"></i> Good (≤20¢) <i class="grade-noticeable"></i> Noticeable (≤35¢) <i class="grade-needs-work"></i> Needs work (&gt;35¢)</div>
  <label v-if="pitchFrames?.length" class="practice-trace-toggle"><input v-model="showPitchTrace" type="checkbox"/> Show raw pitch line <span>(slides, vibrato and tracking gaps; not a recognized note)</span></label>
  <div class="practice-timeline-navigation">
   <span>Scroll along the take to compare expected and detected notes.</span>
   <div v-if="scrollLimit>1" role="group" aria-label="Scroll recording timeline">
    <button type="button" class="secondary" :disabled="scrollLeft<=1" aria-label="Scroll timeline left" @click="scrollTimeline(-1)">←</button>
    <button type="button" class="secondary" :disabled="scrollLeft>=scrollLimit-1" aria-label="Scroll timeline right" @click="scrollTimeline(1)">→</button>
   </div>
  </div>
  <div class="practice-roll">
   <div class="practice-lane-labels" :class="{'has-trace':showPitchTrace&&!!pitchFrames?.length}" aria-hidden="true"><span>Measure</span><span>Expected</span><span>Detected</span><span v-if="showPitchTrace&&pitchFrames?.length">Pitch trace</span></div>
   <div ref="scroller" class="practice-roll-scroll" role="region" aria-label="Scrollable measure timeline" tabindex="0" @scroll.passive="syncScroll">
    <div class="practice-roll-content" :style="{width:`calc(${timeline.span} * var(--beat-width))`,'--measure-width':`calc(${beats} * var(--beat-width))`}">
     <div class="practice-ruler">
      <span v-for="measure in timeline.measures" :key="measure" :title="measureLabel(measure)">
       {{measure<0?'Before':measure>=count?'After':from+measure}}
      </span>
     </div>
     <div v-for="lane in (['expected','detected'] as const)" :key="lane" class="practice-track" :aria-label="lane==='expected'?'Expected notes':'Detected notes'">
      <button v-for="note in timeline.lanes[lane]" v-show="!reviewOnly||note.status!=='correct'"
        :key="note.row" type="button" :class="['practice-bar','result-'+note.status, detectedPitchGrade(rows[note.row],lane)]"
       :style="{left:`calc(${note.start-timeline.start} * var(--beat-width))`,width:`calc(${note.duration} * var(--beat-width))`}"
       :aria-pressed="selected===note.row"
       :aria-label="`${measureLabel(Math.floor(note.start/beats))}, ${lane} ${pitch(note.pitch)}, ${feedbackStatuses[note.status]}`"
       :title="`${pitch(note.pitch)} · ${feedbackStatuses[note.status]}`" @click="selected=note.row">{{pitch(note.pitch)}}</button>
     </div>
     <div v-if="showPitchTrace&&pitchFrames?.length" class="practice-trace-track" role="img" :aria-label="`Recorded pitch contour from ${trace.low} to ${trace.high} MIDI, ${trace.points} reliable frames; gaps and large jumps are not connected`">
      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
       <path v-for="(segment,index) in trace.segments" :key="index" :d="segment" class="practice-pitch-path"/>
      </svg>
      <span class="practice-trace-range">{{pitch(trace.high)}} – {{pitch(trace.low)}}</span>
     </div>
    </div>
   </div>
  </div>
  <div v-if="detail" class="practice-detail" role="status">
   <strong :class="'result-'+feedbackStatus(detail)">{{feedbackStatuses[feedbackStatus(detail)]}}</strong>
   <span>{{measureLabel(Math.floor((detail.kind==='extra'?(detail.played.startBeat-clock.offsetBeats)/clock.tempoScale:detail.target.startBeat)/beats))}}</span>
   <span v-if="detail.kind!=='extra'">Expected {{pitch(detail.target.pitch)}}</span>
   <span v-if="detail.kind==='matched'||detail.kind==='extra'">Detected {{pitch(detail.played.pitch)}}</span>
   <template v-if="detail.kind==='matched'">
    <span>Start <strong>{{signed(timing(detail).onset)}} beats</strong> ({{timing(detail).onset>0?'late':'early'}})</span>
    <span>End <strong>{{signed(timing(detail).release)}} beats</strong> ({{timing(detail).release>0?'late':'early'}})</span>
    <span>Duration <strong>{{signed(timing(detail).duration)}} beats</strong> ({{timing(detail).duration>0?'longer':'shorter'}})</span>
    <span v-if="detail.pitchMatches" :class="'grade-text-'+pitchGrade(detail.played.intonationCents)">Pitch {{signed(detail.played.intonationCents,0)}}¢ · {{pitchGradeLabel(detail.played.intonationCents)}}</span>
   </template>
   <span v-if="detail.kind==='unresolved-repeat'">Articulation uncertain: continuous pitch detected across the expected onset. This is not evidence of a missed or incorrect re-articulation.</span>
  </div>
 </div>
</template>

<style scoped>
.practice-timeline{display:grid;gap:10px}
.practice-performance-summary{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px;color:#d6e8ee}
.practice-performance-summary strong{color:#fff;font-variant-numeric:tabular-nums}
.practice-precision-legend{display:flex;align-items:center;flex-wrap:wrap;gap:5px;font-size:11px;color:#c4d5e0}
.practice-precision-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-left:6px}
.grade-excellent{--pitch-grade:#4ddbb4;background:#4ddbb4}
.grade-good{--pitch-grade:#9bd477;background:#9bd477}
.grade-noticeable{--pitch-grade:#f0c269;background:#f0c269}
.grade-needs-work{--pitch-grade:#ee9477;background:#ee9477}
.grade-text-excellent{color:#4ddbb4}.grade-text-good{color:#9bd477}.grade-text-noticeable{color:#f0c269}.grade-text-needs-work{color:#ee9477}
.result-correct{--result:#7de3b5}
.result-wrong{--result:#ffa073}
.result-missed{--result:#f68faf}
.result-unresolved-repeat{--result:#f6d481}
.result-extra{--result:#bdaaff}
.practice-distribution{display:flex;gap:2px;height:8px;overflow:hidden;border-radius:9px}
.practice-distribution span{background:var(--result)}
.practice-legend{display:flex;flex-wrap:wrap;gap:5px 7px;list-style:none;padding:0;margin:0}
.practice-legend li{padding:4px 7px;background:#102330;border:1px solid var(--result);border-radius:6px;font-size:12px;color:#e6eef5}
.practice-legend strong,.practice-detail strong{color:var(--result)}
.practice-timeline-navigation,.practice-timeline-navigation>div{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px}
.practice-timeline-navigation span{font-size:12px;color:#c4d5e0}
.practice-timeline-navigation button{min-height:36px;min-width:38px;padding:4px}
.practice-roll{display:grid;grid-template-columns:auto minmax(0,1fr);min-width:0;border:1px solid #405c70;border-radius:8px;background:#102330}
.practice-lane-labels{display:grid;grid-template-rows:29px 40px 40px;background:#142a38;border-right:1px solid #527083;border-radius:8px 0 0 8px}
.practice-lane-labels.has-trace{grid-template-rows:29px 40px 40px 120px}
.practice-trace-toggle{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:#d8e8f0;font-size:12px}
.practice-trace-toggle input{width:17px;height:17px;accent-color:#e7c98b}
.practice-trace-toggle span{color:#a9c0d0}
.practice-trace-track{position:relative;height:120px;border-top:1px solid #527083;background:repeating-linear-gradient(to bottom,#203545 0,#203545 23px,#314a5a 24px)}
.practice-trace-track svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.practice-pitch-path{fill:none;stroke:#f6d087;stroke-width:2.2;vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round}
.practice-trace-range{position:absolute;right:5px;top:3px;font-size:10px;color:#c5d9e5;pointer-events:none;background:#172d3bcc;padding:2px}
.practice-lane-labels span{display:flex;align-items:center;padding:0 8px;color:#d5e5ef;font-size:11px;font-weight:650}
.practice-roll-scroll{--beat-width:clamp(39px,5.5vw,66px);min-width:0;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-color:#6b91a4 #152c3a}
.practice-roll-scroll:focus-visible{outline:2px solid #e9c684;outline-offset:2px}
.practice-ruler{display:flex;height:29px;background:#142a38}
.practice-ruler span{flex:0 0 var(--measure-width);padding:4px 7px;border-left:1px solid #638199;color:#ecf5fa;font-weight:700;font-size:12px}
.practice-track{position:relative;height:40px;border-top:1px solid #415c6e;background-color:#203545;
 background-image:linear-gradient(to right,#638199 1px,transparent 1px),linear-gradient(to right,#405b70 1px,transparent 1px);
 background-size:var(--measure-width) 100%,var(--beat-width) 100%}
.practice-track .practice-bar{position:absolute;top:4px;height:31px;min-height:0;min-width:4px;box-sizing:border-box;overflow:hidden;text-overflow:clip;white-space:nowrap;margin:0;padding:0;
 border:1px solid var(--result);border-radius:4px;background:var(--result);color:#10212b;font-size:11px;font-weight:800;line-height:1}
.practice-track .practice-bar[class*="grade-"]{background:var(--pitch-grade);border-color:var(--pitch-grade)}
.practice-track .practice-bar.result-missed,.practice-track .practice-bar.result-unresolved-repeat{background:#233647;border-style:dashed;color:var(--result)}
.practice-track .practice-bar.result-unresolved-repeat{background:repeating-linear-gradient(135deg,#233647,#233647 5px,#32495b 5px,#32495b 10px)}
.practice-track .practice-bar[aria-pressed="true"],.practice-track .practice-bar:focus-visible{outline:2px solid white;outline-offset:0;z-index:1}
.practice-detail{display:flex;margin-top:6px;align-items:center;flex-wrap:wrap;gap:5px 12px;padding:7px;background:#102330;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums}
</style>
