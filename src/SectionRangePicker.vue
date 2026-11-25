<script setup lang="ts">
import {computed} from 'vue';
const props=defineProps<{measures:ReadonlyArray<{section:string}>;from:number;disabled?:boolean;compact?:boolean}>();
const emit=defineEmits<{(event:'select',from:number,to:number,index:number):void}>();
const spans=computed(()=>{
 const result:{name:string;from:number;to:number}[]=[];
 props.measures.forEach((m,i)=>{
  const last=result[result.length-1];
  if(last&&last.name===m.section)last.to=i+1;
  else result.push({name:m.section,from:i+1,to:i+1});
 });
 return result;
});
const current=computed(()=>spans.value.findIndex(s=>props.from>=s.from&&props.from<=s.to));
function choose(index:number){
 const s=spans.value[index];
 if(s&&!props.disabled)emit('select',s.from,s.to,index);
}
function change(event:Event){
 const select=event.target as HTMLSelectElement;
 choose(Number(select.value));
 select.value='';
}
</script>
<template>
 <div class="section-range-picker" :class="{'compact':compact,'many':spans.length>5}" v-if="spans.length">
  <div class="section-range-buttons" role="group" aria-label="Select whole section">
   <button v-for="(s,i) in spans" :key="s.from" type="button" class="secondary" :aria-pressed="i===current" :class="{selected:i===current}" :disabled="disabled" :title="s.name+' · '+s.from+'–'+s.to" @click="choose(i)">{{s.name}}</button>
  </div>
  <div class="section-range-dropdown">
   <span aria-hidden="true">{{spans[current]?.name??'–'}}</span>
   <select aria-label="Select whole section" :disabled="disabled" value="" @change="change">
    <option value="" disabled>{{spans[current]?.name??'Section'}}</option>
    <option v-for="(s,i) in spans" :key="s.from" :value="i">{{s.name}} · {{s.from}}–{{s.to}}</option>
   </select>
  </div>
 </div>
</template>
<style scoped>
.section-range-picker{display:inline-flex;align-self:center;min-width:0;flex:0 0 auto}
.section-range-buttons{display:flex;gap:3px;flex-wrap:wrap}
.section-range-buttons button{min-width:0;min-height:34px;padding:4px 7px}
.section-range-buttons button.selected{outline:2px solid currentColor;outline-offset:-2px}
.section-range-dropdown{display:none;position:relative;align-items:center;justify-content:center;min-height:34px;padding:0 5px;border:1px solid currentColor;border-radius:5px}
.section-range-dropdown select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.section-range-dropdown:focus-within{outline:2px solid currentColor}
.compact .section-range-buttons,.many .section-range-buttons{display:none}
.compact .section-range-dropdown,.many .section-range-dropdown{display:inline-flex}
@media(max-width:760px){.section-range-buttons{display:none}.section-range-dropdown{display:inline-flex}}
</style>
