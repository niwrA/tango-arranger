<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {OpenSheetMusicDisplay} from 'opensheetmusicdisplay';
import {exportMusicXml} from './io';
import type {Instrument,Project,Score} from './music';

const props=defineProps<{
  project:Project;
  score:Score;
  instrument:Instrument;
  fromMeasure:number;
}>();

const host=ref<HTMLElement|null>(null);
const firstMeasure=ref(1);
const measureCount=ref(4);
const loading=ref(false);
const error=ref('');
const displayedRange=computed(()=>{
  const total=Math.max(1,props.project.bars.length);
  const first=Math.max(1,Math.min(total,Math.round(firstMeasure.value)));
  const last=Math.min(total,first+measureCount.value-1);
  return {first,last,total};
});

let osmd:OpenSheetMusicDisplay|undefined;
let resizeObserver:ResizeObserver|undefined;
let contentTimer:ReturnType<typeof setTimeout>|undefined;
let resizeTimer:ReturnType<typeof setTimeout>|undefined;
let generation=0;

function setDrawRange(){
  if(!osmd)return;
  const {first,last}=displayedRange.value;
  osmd.setOptions({drawFromMeasureNumber:first,drawUpToMeasureNumber:last});
  osmd.render();
}

async function renderScore(loadMusicXml:boolean){
  if(!osmd||!host.value)return;
  const current=++generation;
  loading.value=true;
  error.value='';
  try{
    const {first,last}=displayedRange.value;
    osmd.setOptions({drawFromMeasureNumber:first,drawUpToMeasureNumber:last});
    if(loadMusicXml){
      const xml=exportMusicXml(props.project,props.score,{onlyInstrument:props.instrument});
      await osmd.load(xml);
      if(current!==generation)return;
    }
    osmd.render();
  }catch(cause){
    if(current===generation)error.value=`Could not render this part: ${String(cause)}`;
  }finally{
    if(current===generation)loading.value=false;
  }
}

function scheduleContentRender(){
  if(contentTimer)clearTimeout(contentTimer);
  contentTimer=setTimeout(()=>{void renderScore(true);},180);
}

watch(()=>props.fromMeasure,(measure)=>{
  firstMeasure.value=Math.min(Math.max(1,props.project.bars.length),measure+1);
});
watch(()=>props.project.bars.length,(length)=>{
  firstMeasure.value=Math.min(Math.max(1,length),firstMeasure.value);
  scheduleContentRender();
});
watch(()=>[props.project,props.score,props.instrument],scheduleContentRender,{deep:true});
watch([firstMeasure,measureCount],()=>{
  if(osmd)try{setDrawRange();}catch(cause){error.value=`Could not update the measure window: ${String(cause)}`;}
});

onMounted(()=>{
  if(!host.value)return;
  firstMeasure.value=Math.min(Math.max(1,props.project.bars.length),props.fromMeasure+1);
  osmd=new OpenSheetMusicDisplay(host.value,{
    autoResize:false,
    backend:'svg',
    drawingParameters:'compacttight',
    drawTitle:false,
    drawCredits:false,
    drawPartNames:false,
    drawMeasureNumbers:true,
    drawFromMeasureNumber:displayedRange.value.first,
    drawUpToMeasureNumber:displayedRange.value.last,
  });
  resizeObserver=new ResizeObserver(()=>{
    if(resizeTimer)clearTimeout(resizeTimer);
    resizeTimer=setTimeout(()=>{
      try{osmd?.render();}catch(cause){error.value=`Could not resize the score: ${String(cause)}`;}
    },140);
  });
  resizeObserver.observe(host.value);
  void renderScore(true);
});

onBeforeUnmount(()=>{
  generation++;
  if(contentTimer)clearTimeout(contentTimer);
  if(resizeTimer)clearTimeout(resizeTimer);
  resizeObserver?.disconnect();
  osmd?.dispose();
  osmd=undefined;
});
</script>

<template>
  <section class="score-preview editor" aria-label="Read-only staff notation preview">
    <div class="score-preview-heading">
      <div>
        <h3>Staff notation · {{instrument}}</h3>
        <p class="hint">Read-only preview from the current MusicXML export. Notes are edited in the piano roll.</p>
      </div>
      <div class="score-preview-controls">
        <label>From measure
          <input v-model.number="firstMeasure" type="number" min="1" :max="displayedRange.total" />
        </label>
        <label>Measures
          <select v-model.number="measureCount" aria-label="Number of measures in score preview">
            <option v-for="count in [1,2,3,4]" :key="count" :value="count">{{count}}</option>
          </select>
        </label>
        <span class="hint">Showing {{displayedRange.first}}–{{displayedRange.last}} of {{displayedRange.total}}</span>
      </div>
    </div>
    <p v-if="loading" class="hint" role="status">Engraving score…</p>
    <p v-if="error" class="score-preview-error" role="alert">{{error}}</p>
    <div ref="host" class="score-preview-canvas" :aria-busy="loading" />
  </section>
</template>

<style scoped>
.score-preview{margin:6px 0;padding:12px;background:#f8fafc;color:#18222c;border:1px solid #b9c7d3;border-radius:10px;overflow:hidden}
.score-preview-heading,.score-preview-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.score-preview-heading h3{margin:0 0 3px;font-size:1rem}
.score-preview-heading p{margin:0}
.score-preview-controls{justify-content:flex-start}
.score-preview-controls label{display:flex;align-items:center;gap:6px;font-size:.85rem}
.score-preview-controls input{width:5.5rem}
.score-preview-controls select{width:4.5rem}
.score-preview-canvas{min-height:92px;margin-top:10px;overflow-x:auto;overflow-y:hidden}
.score-preview-canvas :deep(svg){display:block;max-width:100%;height:auto}
.score-preview-error{color:#a32828}
@media(max-width:640px){.score-preview{padding:8px}.score-preview-heading{align-items:flex-start}.score-preview-canvas{margin-inline:-4px}}
</style>
