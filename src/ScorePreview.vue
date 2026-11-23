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
  toMeasure:number;
}>();

const host=ref<HTMLElement|null>(null);
const loading=ref(true);
const error=ref('');
const displayedRange=computed(()=>{
  const total=Math.max(1,props.project.bars.length);
  const first=Math.max(1,Math.min(total,props.fromMeasure));
  const last=Math.max(first,Math.min(total,props.toMeasure));
  return {first,last};
});

let osmd:OpenSheetMusicDisplay|undefined;
let resizeObserver:ResizeObserver|undefined;
let contentTimer:ReturnType<typeof setTimeout>|undefined;
let layoutTimer:ReturnType<typeof setTimeout>|undefined;
let layoutFrame=0;
let generation=0;
let loaded=false;
let observedWidth=0;

function renderRange(){
  const renderer=osmd;
  if(!renderer||!loaded)return;
  cancelAnimationFrame(layoutFrame);
  const {first,last}=displayedRange.value;
  renderer.setOptions({drawFromMeasureNumber:first,drawUpToMeasureNumber:last});
  renderer.resetIncrementalRendering();
  loading.value=true;
  error.value='';
  const draw=()=>{
    try{
      if(last-first<12)renderer.render();
      else if(!renderer.renderNext({measures:12}).done){
        layoutFrame=requestAnimationFrame(draw);
        return;
      }
    }catch(cause){error.value=`Could not render this part: ${String(cause)}`;}
    loading.value=false;
  };
  draw();
}

async function reloadScore(){
  const renderer=osmd;
  if(!renderer)return;
  const current=++generation;
  cancelAnimationFrame(layoutFrame);
  loaded=false;
  loading.value=true;
  error.value='';
  try{
    const xml=exportMusicXml(props.project,props.score,{onlyInstrument:props.instrument});
    await renderer.load(xml);
    if(current!==generation)return;
    loaded=true;
    renderRange();
  }catch(cause){
    if(current!==generation)return;
    error.value=`Could not load this part: ${String(cause)}`;
    loading.value=false;
  }
}

function scheduleContentRender(){
  if(contentTimer)clearTimeout(contentTimer);
  contentTimer=setTimeout(()=>{contentTimer=undefined;void reloadScore();},180);
}

function scheduleLayout(){
  clearTimeout(layoutTimer);
  layoutTimer=setTimeout(()=>{if(!contentTimer)renderRange();},140);
}

watch(()=>[props.project,props.score,props.instrument],scheduleContentRender,{deep:true});
watch(displayedRange,scheduleLayout);

onMounted(()=>{
  if(!host.value)return;
  osmd=new OpenSheetMusicDisplay(host.value,{
    autoResize:false,
    backend:'svg',
    drawingParameters:'compacttight',
    drawTitle:false,
    drawCredits:false,
    drawPartNames:false,
    drawMeasureNumbers:true,
    disableCursor:true,
  });
  observedWidth=host.value.clientWidth;
  resizeObserver=new ResizeObserver(([entry])=>{
    const width=Math.round(entry.contentRect.width);
    if(width<=0||width===observedWidth)return;
    observedWidth=width;
    scheduleLayout();
  });
  resizeObserver.observe(host.value);
  void reloadScore();
});

onBeforeUnmount(()=>{
  generation++;
  if(contentTimer)clearTimeout(contentTimer);
  if(layoutTimer)clearTimeout(layoutTimer);
  cancelAnimationFrame(layoutFrame);
  resizeObserver?.disconnect();
  osmd?.dispose();
  osmd=undefined;
});
</script>

<template>
  <section class="score-preview editor" aria-label="Read-only staff notation preview">
    <p v-if="loading" class="score-preview-status" role="status">Engraving score…</p>
    <p v-if="error" class="score-preview-error" role="alert">{{error}}</p>
    <div ref="host" class="score-preview-canvas" :aria-busy="loading" />
  </section>
</template>

<style scoped>
.score-preview{margin:6px 0;padding:12px;background:#f8fafc;color:#18222c;border:1px solid #b9c7d3;border-radius:10px;overflow:hidden}
.score-preview-status{margin:0 0 6px}
.score-preview-canvas{min-height:92px;overflow-x:auto}
.score-preview-canvas :deep(svg){display:block;max-width:100%;height:auto}
.score-preview-error{color:#a32828}
@media(max-width:640px){.score-preview{padding:8px}.score-preview-canvas{margin-inline:-4px}}
</style>
