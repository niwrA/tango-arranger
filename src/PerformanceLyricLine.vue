<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {performanceLyricPage,type PerformanceLyricNote} from './performanceLyrics';

const props=withDefaults(defineProps<{
 notes:PerformanceLyricNote[];
 beat:number;
 beatsPerMeasure:number;
 measureCount:number;
 lineStarts?:number[];
 chords?:{chord:string}[];
 effectiveBpm:number;
 instrument:string;
 count?:number|null;
 overlay?:boolean;
}>(),{count:null,overlay:false});
const surface=ref<HTMLElement|null>(null);
const availableWidth=ref(800);
let observer:ResizeObserver|undefined;
onMounted(()=>{
 const element=surface.value;
 if(!element)return;
 availableWidth.value=element.getBoundingClientRect().width||800;
 if(typeof ResizeObserver==='undefined')return;
 observer=new ResizeObserver(entries=>{
  const width=entries[0]?.contentRect.width;
  if(width&&width>0)availableWidth.value=width;
 });
 observer.observe(element);
});
onBeforeUnmount(()=>observer?.disconnect());
const showHarmony=ref(true);
const showContour=ref(true);
const page=computed(()=>performanceLyricPage(
 props.notes,props.beat,props.beatsPerMeasure,props.measureCount,
 availableWidth.value,props.effectiveBpm
));
const from=computed(()=>page.value.startMeasure*props.beatsPerMeasure);
const to=computed(()=>page.value.endMeasure*props.beatsPerMeasure);
const x=(beat:number)=>Math.max(0,Math.min(100,(beat-from.value)/(to.value-from.value)*100));
const visibleChords=computed(()=>(props.chords??[]).slice(page.value.startMeasure,page.value.endMeasure).flatMap((bar,i)=>{
 const symbols=(bar.chord||'').split(',');
 return symbols.map((symbol,j)=>({symbol:symbol.trim(),at:x(from.value+(i+j/symbols.length)*props.beatsPerMeasure)}));
}).filter(c=>c.symbol&&c.symbol!=='/'));
const contour=computed(()=>{
 const ns=props.notes.filter(n=>Number.isFinite(n.pitch)&&n.duration>0&&n.start<to.value&&n.start+n.duration>from.value).slice().sort((a,b)=>a.start-b.start);
 if(!ns.length)return '';
 const pitches=ns.map(n=>n.pitch as number),lo=Math.min(...pitches),hi=Math.max(...pitches);
 const y=(pitch:number)=>hi===lo?45:70-50*(pitch-lo)/(hi-lo);
 let previousEnd=-Infinity;
 return ns.map(n=>{
  const begin=Math.max(from.value,n.start),end=Math.min(to.value,n.start+n.duration);
  const command=Math.abs(begin-previousEnd)<1e-6?'L':'M';
  previousEnd=end;
  return `${command} ${x(begin)} ${y(n.pitch!)} H ${x(end)}`;
 }).join(' ');
});
const tokens=computed(()=>page.value.tokens.filter(n=>n.start<to.value&&n.start+n.duration>from.value));
</script>

<template>
 <div ref="surface" class="stage-lyrics" :class="{'stage-lyrics-overlay':overlay}" role="group"
   :aria-label="instrument+' lyrics, measures '+(page.startMeasure+1)+' to '+page.endMeasure">
   <div class="stage-lyrics-heading">
     <strong>{{instrument}} · lyrics</strong>
     <span class="stage-lyrics-location">M{{page.startMeasure+1}}–{{page.endMeasure}}</span>
     <span class="stage-lyrics-options"><button type="button" :aria-pressed="showHarmony" @click="showHarmony=!showHarmony">Chords</button><button type="button" :aria-pressed="showContour" @click="showContour=!showContour">Melody</button></span>
     <span class="stage-lyrics-upcoming">{{count!==null?'Entrance in '+count+' beat'+(count===1?'':'s'):'Follow highlighted syllable'}}</span>
   </div>
   <div class="stage-lyrics-content">
    <svg v-if="showContour && contour" class="stage-lyrics-contour" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path :d="contour" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>
    <div v-if="showHarmony && visibleChords.length" class="stage-lyrics-chords" aria-label="Harmony"><span v-for="(c,i) in visibleChords" :key="i" :style="{left:c.at+'%'}">{{c.symbol}}</span></div>
   <div class="stage-lyrics-words" aria-live="off">
     <template v-if="tokens.length">
       <span v-for="(token,i) in tokens" :key="i"
         class="stage-lyric-token" :class="{'is-current':token.active}"
         :style="{left:x(token.start)+'%',width:Math.max(0,x(tokens[i+1]?.start??to)-x(token.start))+'%'}"
         :title="token.text">{{token.text}}</span>
     </template>
     <span v-else class="stage-lyrics-rest">Instrumental passage</span>
   </div>
   </div>
 </div>
</template>

<style scoped>
/* Both stage views use the same dark-blue karaoke presentation. */
.stage-lyrics-content{position:relative;min-width:0;width:100%}
.stage-lyrics-contour{position:absolute;inset:0;width:100%;height:100%;color:#8cb9d5;opacity:.45;pointer-events:none;z-index:0}
.stage-lyrics-chords{height:12px;position:relative;font-size:10px;color:#a8c4e9;opacity:.72;pointer-events:none;z-index:1}
.stage-lyrics-chords span{position:absolute;top:0;white-space:nowrap;transform:translateX(-10%)}
.stage-lyrics-words{position:relative;z-index:1}
.stage-lyrics-options{display:flex;gap:4px}
.stage-lyrics-options button{font:inherit;font-size:10px;color:#a8c4e9;border:1px solid #526981;border-radius:4px;background:transparent;padding:1px 5px;cursor:pointer}
.stage-lyrics-options button[aria-pressed="false"]{opacity:.45}
.stage-lyrics{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;width:100%;min-height:52px;padding:5px 10px;
 border:1px solid #5a7394;border-radius:12px;
 background:linear-gradient(145deg,#243750,#172337 75%);color:#e2e8f0;box-shadow:inset 0 1px #ffffff12}
.stage-lyrics-heading{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(155px,.7fr);align-items:baseline;gap:4px 12px;color:#cdd9e9;font-size:12px;min-width:0}
.stage-lyrics-heading strong{font-weight:750;color:#e7edf5}
.stage-lyrics-location{color:#a8c4e9;font-size:11px;font-variant-numeric:tabular-nums;font-weight:800}
.stage-lyrics-upcoming{color:#c2d4e5;font-size:11px;text-align:right;white-space:nowrap;min-width:0}
.stage-lyrics-words{display:flex;justify-content:center;align-items:center;align-content:center;flex-wrap:wrap;gap:3px 6px;min-height:1.6em;
 font-size:clamp(19px,2.35vw,30px);font-weight:650;line-height:1.4;text-align:center}
.stage-lyric-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 8px;width:100%}
.stage-lyric-token{display:inline-block;padding:1px 6px;border:1px solid transparent;border-radius:7px;color:#e2e8f0;
 background:transparent;opacity:.94;font-weight:650;transition:background-color .08s linear,color .08s linear,box-shadow .08s linear}
.stage-lyric-word{display:inline-flex;white-space:nowrap}
.stage-lyric-word:has(> :nth-child(2)) .stage-lyric-token{padding-inline:0}
/* Reserving the same padding and border for all tokens avoids layout shifts. */
.stage-lyric-token.is-current{background:rgba(37,99,235,.83);border-color:#8fbbff;color:#fff;box-shadow:0 0 0 1px #7caeff50;opacity:1;font-weight:650}
.stage-lyrics-words .stage-lyric-token{position:absolute;top:0;text-align:left;padding-inline:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-sizing:border-box}
.stage-lyrics-rest{font-size:clamp(16px,1.5vw,20px);color:#b7c9d7;font-weight:500}
.stage-lyrics-overlay{background:linear-gradient(145deg,rgba(33,53,82,.9),rgba(14,25,46,.92));border-color:#6889ae;
 box-shadow:0 6px 22px #0005;max-width:100%;width:100%;min-height:58px}
.stage-lyrics-overlay .stage-lyrics-words{font-size:clamp(19px,2.75vw,34px)}
@media(max-width:650px){
 .stage-lyrics{padding:8px 10px;gap:5px;min-height:48px}
 .stage-lyrics-words{font-size:clamp(17px,4vw,23px);gap:3px 4px;line-height:1.35}
 .stage-lyrics-overlay .stage-lyrics-words{font-size:clamp(17px,4vw,23px)}
 .stage-lyric-token{padding:1px 3px;border-radius:5px}
 .stage-lyrics-heading{font-size:11px;gap:3px 8px;grid-template-columns:minmax(0,1fr) auto}
 .stage-lyrics-upcoming{grid-column:1/-1;text-align:left;min-height:14px}
 .stage-lyrics-upcoming{font-size:10px}
}
@media(prefers-reduced-motion:reduce){
 .stage-lyric-token{transition:none}
}
</style>
