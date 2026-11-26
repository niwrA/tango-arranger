<script setup lang="ts">
import SectionRangePicker from './SectionRangePicker.vue';
const props=withDefaults(defineProps<{
 from:number;to:number;measures:ReadonlyArray<{section:string}>;
 disabled?:boolean;presets?:boolean;compact?:boolean;
}>(),{disabled:false,presets:false,compact:false});
const emit=defineEmits<{(event:'change',from:number,to:number):void}>();
const total=()=>Math.max(1,props.measures.length);
function clamp(value:number){return Math.max(1,Math.min(total(),Math.round(Number(value)||1)))}
function setStart(event:Event){
 const start=clamp(Number((event.target as HTMLSelectElement).value));
 emit('change',start,Math.max(start,clamp(props.to)));
}
function setEnd(event:Event){
 const end=clamp(Number((event.target as HTMLSelectElement).value));
 emit('change',Math.min(clamp(props.from),end),end);
}
function shift(delta:number){
 const start=clamp(props.from),end=Math.max(start,clamp(props.to)),span=end-start;
 const next=Math.max(1,Math.min(total()-span,start+delta));
 emit('change',next,next+span);
}

function chooseSong(){emit('change',1,total());}
</script>
<template>
 <div class="measure-range-control" :class="{'is-compact':compact}" role="group" aria-label="Measure range">
  <button type="button" class="secondary range-arrow" aria-label="Previous measure range" title="Previous measure range" :disabled="disabled||from<=1" @click="shift(-1)">←</button>
  <label>Start measure<select :value="from" :disabled="disabled" aria-label="Start measure" @change="setStart"><option v-for="(measure,index) in measures" :key="index" :value="index+1">{{index+1}} · {{measure.section}}</option></select></label>
  <SectionRangePicker :measures="measures" :from="from" :disabled="disabled" :compact="compact" @select="(start,end)=>emit('change',start,end)"/>
  <label>End measure<select :value="to" :disabled="disabled" aria-label="End measure" @change="setEnd"><option v-for="(measure,index) in measures" :key="index" :value="index+1">{{index+1}} · {{measure.section}}</option></select></label>
  <button type="button" class="secondary range-arrow" aria-label="Next measure range" title="Next measure range" :disabled="disabled||to>=measures.length" @click="shift(1)">→</button>
  <div v-if="presets" class="range-presets"><button type="button" class="secondary" :disabled="disabled" @click="chooseSong">Entire song</button></div>
 </div>
</template>
<style scoped>
.measure-range-control{display:grid;grid-template-columns:auto minmax(0,120px) auto minmax(0,120px) auto;align-items:end;gap:5px;min-width:0}
.measure-range-control label{display:flex;flex-direction:column;gap:3px;flex:1 1 105px;min-width:0;font-size:11px;color:#d4e3eb;white-space:nowrap}
.measure-range-control label select{width:100%;min-width:0;max-width:160px;min-height:38px;box-sizing:border-box;font-size:13px;padding:4px 6px}
.measure-range-control .range-arrow{width:38px;max-width:38px;justify-self:center;min-width:38px;min-height:40px;padding:5px 8px;flex:0 0 38px}
.measure-range-control .range-presets{display:flex;flex-wrap:wrap;align-items:center;gap:5px;grid-column:1/-1}
.measure-range-control .range-presets button{min-height:35px;padding:5px 9px;font-size:12px}
.measure-range-control.is-compact{grid-template-columns:auto minmax(0,96px) auto minmax(0,96px) auto}
.measure-range-control :deep(.section-range-picker){align-self:end}
.measure-range-control :deep(.section-range-dropdown){min-height:38px;box-sizing:border-box}
.measure-range-control.is-compact label select{max-width:140px}
@media(max-width:620px){.measure-range-control,.measure-range-control.is-compact{gap:3px;grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr) auto}.measure-range-control label{flex:1 1 80px}.measure-range-control label select{max-width:none;font-size:12px}.measure-range-control .range-arrow{width:36px;max-width:36px;min-width:36px;flex-basis:36px}.measure-range-control.is-compact label{flex:1 1 75px}}
</style>

<style scoped>
/* Explicit label and input rows prevent inherited editor label padding,
   margins and flex alignment from offsetting the actual controls. */
.measure-range-control{
 --range-control-height:40px;
 grid-template-rows:14px var(--range-control-height);
 row-gap:3px;align-items:end;
}
.measure-range-control>label{
 display:grid;grid-template-rows:14px var(--range-control-height);
 grid-row:1/3;align-self:end;align-items:end;gap:3px;
 margin:0;padding:0;line-height:14px;min-height:0;
}
.measure-range-control>label>select{
 display:block;height:var(--range-control-height);min-height:var(--range-control-height);
 max-height:var(--range-control-height);margin:0;align-self:end;box-sizing:border-box;
}
.measure-range-control>.range-arrow,
.measure-range-control>:deep(.section-range-picker){
 grid-row:2;align-self:end;margin:0;box-sizing:border-box;
}
.measure-range-control>.range-arrow,
.measure-range-control :deep(.section-range-dropdown){
 height:var(--range-control-height);min-height:var(--range-control-height);
 max-height:var(--range-control-height);box-sizing:border-box;
}
.measure-range-control>.range-arrow:first-child{grid-column:1}
.measure-range-control>label:nth-child(2){grid-column:2}
.measure-range-control>:deep(.section-range-picker){grid-column:3}
.measure-range-control>label:nth-of-type(2){grid-column:4}
.measure-range-control>.range-arrow:nth-child(5){grid-column:5}
.measure-range-control>.range-presets{grid-row:3}
</style>
