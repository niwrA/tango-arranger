<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import type {LearnTakeClock,LearnTakeRow} from './learnTake';
import {feedbackStatuses,feedbackStatus,practiceFeedbackMeasures,type FeedbackStatus} from './practiceFeedbackTimeline';

const props=defineProps<{
 rows:readonly LearnTakeRow[];clock:LearnTakeClock;beats:number;from:number;to:number;
 reviewOnly:boolean;transpose:number;pitchLabel:(pitch:number)=>string;
}>();
const page=ref(0);
const selected=ref<{row:number;measure:number}|null>(null);
const pageSize=8;
const count=computed(()=>props.to-props.from+1);
const measures=computed(()=>practiceFeedbackMeasures(props.rows,props.clock,props.beats,count.value));
const pages=computed(()=>Math.max(1,Math.ceil(measures.value.length/pageSize)));
const visible=computed(()=>measures.value.slice(page.value*pageSize,(page.value+1)*pageSize));
const summary=computed(()=>{
 const counts:Record<FeedbackStatus,number>={correct:0,wrong:0,missed:0,'unresolved-repeat':0,extra:0};
 for(const row of props.rows)counts[feedbackStatus(row)]++;
 return counts;
});
const detail=computed(()=>selected.value===null?undefined:props.rows[selected.value.row]);
watch(()=>props.rows,()=>{page.value=0;selected.value=null;});
watch(()=>props.reviewOnly,()=>{selected.value=null;});
function switchPage(delta:number){
 page.value=Math.max(0,Math.min(pages.value-1,page.value+delta));
 selected.value=null;
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
   <span>Bars show onset and duration on the aligned beat grid.</span>
   <div v-if="pages>1" role="group" aria-label="Timeline pages">
    <button type="button" class="secondary" :disabled="page===0" aria-label="Previous timeline page" @click="switchPage(-1)">←</button>
    <span role="status">Page {{page+1}} of {{pages}}</span>
    <button type="button" class="secondary" :disabled="page+1===pages" aria-label="Next timeline page" @click="switchPage(1)">→</button>
   </div>
  </div>
  <div class="practice-measures">
   <section v-for="measure in visible" :key="measure.index" class="practice-measure" :aria-label="measureLabel(measure.index)">
    <h4>{{measureLabel(measure.index)}}</h4>
    <div v-for="lane in (['expected','detected'] as const)" :key="lane" class="practice-lane">
     <span>{{lane==='expected'?'Expected':'Detected'}}</span>
     <div class="practice-track" :style="{backgroundSize:(100/beats)+'% 100%'}">
      <button v-for="segment in measure[lane]" v-show="!reviewOnly||segment.status!=='correct'"
       :key="segment.row" type="button" :class="['practice-bar','result-'+segment.status,{'is-continuation':segment.continuation}]"
       :style="{left:(segment.start/beats*100)+'%',width:(segment.duration/beats*100)+'%'}"
       :aria-pressed="selected?.row===segment.row"
       :aria-label="`${measureLabel(measure.index)}, ${lane} ${pitch(segment.pitch)}, ${feedbackStatuses[segment.status]}`"
       :title="`${pitch(segment.pitch)} · ${feedbackStatuses[segment.status]}`"
       @click="selected={row:segment.row,measure:measure.index}">{{pitch(segment.pitch)}}</button>
     </div>
    </div>
    <div v-if="detail&&selected?.measure===measure.index" class="practice-detail" role="status">
     <strong :class="'result-'+feedbackStatus(detail)">{{feedbackStatuses[feedbackStatus(detail)]}}</strong>
     <span v-if="detail.kind!=='extra'">Expected {{pitch(detail.target.pitch)}}</span>
     <span v-if="detail.kind==='matched'||detail.kind==='extra'">Detected {{pitch(detail.played.pitch)}}</span>
     <span v-if="detail.kind==='matched'">{{signed((detail.played.startBeat-clock.offsetBeats)/clock.tempoScale-detail.target.startBeat)}} beats onset</span>
     <span v-if="detail.kind==='matched'">{{signed(detail.played.durationBeats/clock.tempoScale-detail.target.durationBeats)}} beats duration</span>
     <span v-if="detail.kind==='matched'&&detail.pitchMatches">{{signed(detail.played.intonationCents,0)}}¢ intonation</span>
     <span v-if="detail.kind==='unresolved-repeat'">The detector heard a sustained pitch through this onset.</span>
    </div>
   </section>
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
.practice-measures{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr));gap:6px}
.practice-measure{min-width:0;padding:7px;background:#102330;border:1px solid #405c70;border-radius:7px}
.practice-measure h4{font-size:13px;margin:0 0 5px}
.practice-lane{display:grid;grid-template-columns:49px minmax(0,1fr);align-items:center;gap:5px}
.practice-lane+.practice-lane{margin-top:4px}
.practice-lane>span{font-size:10px;color:#c4d5e0}
.practice-track{position:relative;height:30px;background-color:#203545;background-image:linear-gradient(to right,#456073 1px,transparent 1px);border-radius:3px}
.practice-track .practice-bar{position:absolute;top:2px;height:26px;min-height:0;min-width:4px;box-sizing:border-box;overflow:hidden;text-overflow:clip;white-space:nowrap;margin:0;padding:1px;border:1px solid var(--result);border-radius:4px;background:var(--result);color:#10212b;font-size:10px;font-weight:800;line-height:1}
.practice-track .practice-bar.result-missed,.practice-track .practice-bar.result-unresolved-repeat{background:#233647;border-style:dashed;color:var(--result)}
.practice-track .practice-bar.is-continuation{border-start-start-radius:0;border-end-start-radius:0}
.practice-track .practice-bar[aria-pressed="true"],.practice-track .practice-bar:focus-visible{outline:2px solid white;outline-offset:0;z-index:1}
.practice-detail{display:flex;margin-top:6px;align-items:center;flex-wrap:wrap;gap:5px 12px;padding:7px;background:#102330;border-radius:6px;font-size:12px;font-variant-numeric:tabular-nums}
</style>
