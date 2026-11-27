<script setup lang="ts">
import {onMounted,onBeforeUnmount,ref,watch} from 'vue';
import {OpenSheetMusicDisplay} from 'opensheetmusicdisplay';
import {exportMusicXml} from './io';
import type {Project,Score} from './music';

const props=defineProps<{project:Project;score:Score;from:number;to:number}>();
const host=ref<HTMLElement|null>(null);
const loading=ref(true),error=ref('');
let renderer:OpenSheetMusicDisplay|undefined,observer:ResizeObserver|undefined;
let timer:ReturnType<typeof setTimeout>|undefined,frame=0,revision=0,width=0,alive=true,loaded=false;
function draw(){
 if(!renderer||!loaded||!host.value?.clientWidth)return;
 cancelAnimationFrame(frame);
 const first=Math.max(1,Math.min(props.project.bars.length,props.from));
 const last=Math.max(first,Math.min(props.project.bars.length,props.to));
 const current=revision;
 try{
  renderer.setOptions({drawFromMeasureNumber:first,drawUpToMeasureNumber:last});
  renderer.resetIncrementalRendering();
  const next=()=>{if(!alive||current!==revision||!renderer)return;try{
   const {done}=renderer.renderNext({measures:8});
   if(!done)frame=requestAnimationFrame(next);else loading.value=false;
  }catch(cause){error.value=String(cause);loading.value=false;}};
  next();
 }catch(cause){error.value=String(cause);loading.value=false;}
}
async function reload(){
 if(!renderer)return;
 const current=++revision;cancelAnimationFrame(frame);loaded=false;loading.value=true;error.value='';
 try{await renderer.load(exportMusicXml(props.project,props.score,{engravingPreview:true}));
  if(!alive||current!==revision)return;loaded=true;draw();
 }catch(cause){if(alive&&current===revision){error.value=String(cause);loading.value=false;}}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>void reload(),180);}
watch(()=>[props.project,props.score],schedule,{deep:true});
watch(()=>[props.from,props.to],()=>{if(loaded){loading.value=true;draw();}});
onMounted(()=>{
 if(!host.value)return;
 renderer=new OpenSheetMusicDisplay(host.value,{autoResize:false,backend:'svg',drawingParameters:'compact',drawTitle:false,drawCredits:false,drawPartNames:true,drawMeasureNumbers:true,disableCursor:true,autoGenerateMultipleRestMeasuresFromRestMeasures:false});
 observer=new ResizeObserver(([entry])=>{const next=Math.round(entry.contentRect.width);if(next>0&&next!==width){width=next;draw();}});
 observer.observe(host.value);void reload();
});
onBeforeUnmount(()=>{alive=false;revision++;clearTimeout(timer);cancelAnimationFrame(frame);observer?.disconnect();renderer?.dispose();renderer=undefined;});
</script>
<template>
 <section class="arrangement-score" aria-label="Full ensemble score">
  <small v-if="loading" role="status">Engraving ensemble score…</small>
  <p v-if="error" role="alert">Could not engrave ensemble score: {{error}}</p>
  <div ref="host" class="arrangement-score-paper"></div>
 </section>
</template>
<style scoped>
.arrangement-score{min-width:0;overflow:auto;max-height:70dvh;border:1px solid #536a7d;border-radius:8px;background:#f5f4ef;color:#253746}
.arrangement-score-paper{min-width:0;min-height:180px;padding:4px}
.arrangement-score small,.arrangement-score p{display:block;margin:6px 10px}
</style>
