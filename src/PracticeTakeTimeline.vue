<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount} from 'vue';
import type {LearnTakeClock,LearnTakeRow} from './learnTake';
import {feedbackStatuses,feedbackStatus,practiceFeedbackTimeline,type FeedbackStatus} from './practiceFeedbackTimeline';

const props=defineProps<{
 rows:readonly LearnTakeRow[];clock:LearnTakeClock;beats:number;from:number;to:number;
 reviewOnly:boolean;transpose:number;pitchLabel:(pitch:number)=>string;
}>();
const scroller=ref<HTMLElement|null>(null);
const selected=ref<number|null>(null);
const count=computed(()=>props.to-props.from+1);
const timeline=computed(()=>practiceFeedbackTimeline(props.rows,props.clock,props.beats,count.value));
const scrollLeft=ref(0),scrollLimit=ref(0);
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
  <div class="practice-timeline-navigation">
   <span>Scroll along the take to compare expected and detected notes.</span>
   <div v-if="scrollLimit>1" role="group" aria-label="Scroll recording timeline">
    <button type="button" class="secondary" :disabled="scrollLeft<=1" aria-label="Scroll timeline left" @click="scrollTimeline(-1)">←</button>
    <button type="button" class="secondary" :disabled="scrollLeft>=scrollLimit-1" aria-label="Scroll timeline right" @click="scrollTimeline(1)">→</button>
   </div>
  </div>
  <div class="practice-roll">
   <div class="practice-lane-labels" aria-hidden="true"><span>Measure</span><span>Expected</span><span>Detected</span></div>
   <div ref="scroller" class="practice-roll-scroll" role="region" aria-label="Scrollable measure timeline" tabindex="0" @scroll.passive="syncScroll">
    <div class="practice-roll-content" :style="{width:`calc(${timeline.span} * var(--beat-width))`,'--measure-width':`calc(${beats} * var(--beat-width))`}">
     <div class="practice-ruler">
      <span v-for="measure in timeline.measures" :key="measure" :title="measureLabel(measure)">
       {{measure<0?'Before':measure>=count?'After':from+measure}}
      </span>
     </div>
     <div v-for="lane in (['expected','detected'] as const)" :key="lane" class="practice-track" :aria-label="lane==='expected'?'Expected notes':'Detected notes'">
      <button v-for="note in timeline.lanes[lane]" v-show="!reviewOnly||note.status!=='correct'"
       :key="note.row" type="button" :class="['practice-bar','result-'+note.status]"
       :style="{left:`calc(${note.start-timeline.start} * var(--beat-width))`,width:`calc(${note.duration} * var(--beat-width))`}"
       :aria-pressed="selected===note.row"
       :aria-label="`${measureLabel(Math.floor(note.start/beats))}, ${lane} ${pitch(note.pitch)}, ${feedbackStatuses[note.status]}`"
       :title="`${pitch(note.pitch)} · ${feedbackStatuses[note.status]}`" @click="selected=note.row">{{pitch(note.pitch)}}</button>
     </div>
    </div>
   </div>
  </div>
  <div v-if="detail" class="practice-detail" role="status">
   <strong :class="'result-'+feedbackStatus(detail)">{{feedbackStatuses[feedbackStatus(detail)]}}</strong>
   <span>{{measureLabel(Math.floor((detail.kind==='extra'?(detail.played.startBeat-clock.offsetBeats)/clock.tempoScale:detail.target.startBeat)/beats))}}</span>
   <span v-if="detail.kind!=='extra'">Expected {{pitch(detail.target.pitch)}}</span>
   <span v-if="detail.kind==='matched'||detail.kind==='extra'">Detected {{pitch(detail.played.pitch)}}</span>
   <span v-if="detail.kind==='matched'">{{signed((detail.played.startBeat-clock.offsetBeats)/clock.tempoScale-detail.target.startBeat)}} beats onset</span>
   <span v-if="detail.kind==='matched'">{{signed(detail.played.durationBeats/clock.tempoScale-detail.target.durationBeats)}} beats duration</span>
   <span v-if="detail.kind==='matched'&&detail.pitchMatches">{{signed(detail.played.intonationCents,0)}}¢ intonation</span>
   <span v-if="detail.kind==='unresolved-repeat'">The detector heard a sustained pitch through this onset.</span>
  </div>
 </div>
</template>

<style scoped>
.practice-timeline{display:grid;gap:10px}
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
.practice-track .practice-bar.result-missed,.practice-track .practice-bar.result-unresolved-repeat{background:#233647;border-style:dashed;color:var(--result)}
.practice-track .practice-bar[aria-pressed="true"],.practice-track .practice-bar:focus-visible{outline:2px solid white;outline-offset:0;z-index:1}
.practice-detail{display:flex;margin-top:6px;align-items:center;flex-wrap:wrap;gap:5px 12px;padding:7px;background:#102330;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums}
</style>
