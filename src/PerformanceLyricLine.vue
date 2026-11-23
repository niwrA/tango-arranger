<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref} from 'vue';
import {performanceLyricPage,type PerformanceLyricNote} from './performanceLyrics';

const props=withDefaults(defineProps<{
 notes:PerformanceLyricNote[];
 beat:number;
 beatsPerMeasure:number;
 measureCount:number;
 lineStarts?:number[];
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
const page=computed(()=>performanceLyricPage(
 props.notes,props.beat,props.beatsPerMeasure,props.measureCount,
 availableWidth.value,props.effectiveBpm
));
/** Keep original song text lines together while the highlighted onset changes. */
const lyricRows=computed(()=>{
 const starts=[...(props.lineStarts??[])].filter(Number.isFinite).sort((a,b)=>a-b);
 const rows:{line:number;words:(typeof page.value.tokens)[]}[]=[];
 for(const token of page.value.tokens){
   const row=rows.at(-1);
   const word=row?.words.at(-1);
   if(word?.[0].word===token.word){word.push(token);continue;}
   let line=0;
   for(let i=0;i<starts.length;i++)if(starts[i]<=token.start+1e-7)line=i;else break;
   if(row?.line===line)row.words.push([token]);
   else rows.push({line,words:[[token]]});
 }
 return rows;
});
</script>

<template>
 <div ref="surface" class="stage-lyrics" :class="{'stage-lyrics-overlay':overlay}" role="group"
   :aria-label="instrument+' lyrics, measures '+(page.startMeasure+1)+' to '+page.endMeasure">
   <div class="stage-lyrics-heading">
     <strong>{{instrument}} · lyrics</strong>
     <span class="stage-lyrics-location">M{{page.startMeasure+1}}–{{page.endMeasure}}</span>
     <span class="stage-lyrics-upcoming">{{count!==null?'Entrance in '+count+' beat'+(count===1?'':'s'):'Follow highlighted syllable'}}</span>
   </div>
   <div class="stage-lyrics-words" aria-live="off">
     <template v-if="page.tokens.length">
       <span v-for="(row,rowIndex) in lyricRows" :key="'line-'+row.line+'-'+rowIndex" class="stage-lyric-row">
         <span v-for="word in row.words" :key="word[0].word" class="stage-lyric-word">
           <span v-for="(token,i) in word" :key="i"
             class="stage-lyric-token" :class="{'is-current':token.active}">{{token.text}}</span>
         </span>
       </span>
     </template>
     <span v-else class="stage-lyrics-rest">Instrumental passage</span>
   </div>
 </div>
</template>

<style scoped>
/* Both stage views use the same dark-blue karaoke presentation. */
.stage-lyrics{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0;width:100%;min-height:102px;padding:12px 16px;
 border:1px solid #5a7394;border-radius:12px;
 background:linear-gradient(145deg,#243750,#172337 75%);color:#e2e8f0;box-shadow:inset 0 1px #ffffff12}
.stage-lyrics-heading{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(155px,.7fr);align-items:baseline;gap:4px 12px;color:#cdd9e9;font-size:12px;min-width:0}
.stage-lyrics-heading strong{font-weight:750;color:#e7edf5}
.stage-lyrics-location{color:#a8c4e9;font-size:11px;font-variant-numeric:tabular-nums;font-weight:800}
.stage-lyrics-upcoming{color:#c2d4e5;font-size:11px;text-align:right;white-space:nowrap;min-width:0}
.stage-lyrics-words{display:flex;justify-content:center;align-items:center;align-content:center;flex-wrap:wrap;gap:6px 8px;min-height:42px;
 font-size:clamp(19px,2.35vw,30px);font-weight:650;line-height:1.4;text-align:center}
.stage-lyric-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 8px;width:100%}
.stage-lyric-token{display:inline-block;padding:1px 6px;border:1px solid transparent;border-radius:7px;color:#e2e8f0;
 background:transparent;opacity:.94;font-weight:650;transition:background-color .08s linear,color .08s linear,box-shadow .08s linear}
.stage-lyric-word{display:inline-flex;white-space:nowrap}
.stage-lyric-word:has(> :nth-child(2)) .stage-lyric-token{padding-inline:0}
/* Reserving the same padding and border for all tokens avoids layout shifts. */
.stage-lyric-token.is-current{background:rgba(37,99,235,.83);border-color:#8fbbff;color:#fff;box-shadow:0 0 0 1px #7caeff50;opacity:1;font-weight:650}
.stage-lyrics-rest{font-size:clamp(16px,1.5vw,20px);color:#b7c9d7;font-weight:500}
.stage-lyrics-overlay{background:linear-gradient(145deg,rgba(33,53,82,.9),rgba(14,25,46,.92));border-color:#6889ae;
 box-shadow:0 6px 22px #0005;max-width:100%;width:100%;min-height:112px}
.stage-lyrics-overlay .stage-lyrics-words{font-size:clamp(19px,2.75vw,34px)}
@media(max-width:650px){
 .stage-lyrics{padding:8px 10px;gap:5px;min-height:84px}
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
