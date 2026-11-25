<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {OpenSheetMusicDisplay,type MusicSystem} from 'opensheetmusicdisplay';
import {exportMusicXml} from './io';
import {midiName,type Instrument,type Note,type Project,type Score} from './music';
import {findScoreNoteheads,scoreNoteheadColors} from './scoreNoteheads';

const props=withDefaults(defineProps<{
  project:Project;
  score:Score;
  instrument:Instrument;
  fromMeasure:number;
  toMeasure:number;
  selectedNote?:Note;
  completedNotes?:readonly Note[];
  playingNotes?:readonly Note[];
  feedbackProgress?:number;
  feedbackState?:string;
  activeMeasure?:number;
  expanded?:boolean;
  followMeasure?:boolean;
  interactive?:boolean;
}>(),{interactive:true});
const emit=defineEmits<{select:[note:Note];edit:[]}>();

const host=ref<HTMLElement|null>(null);
const scoreAppearanceKey='tango-score-appearance';
function readScoreAppearance(){try{return localStorage.getItem(scoreAppearanceKey)==='theme';}catch{return false;}}
const themedScore=ref(readScoreAppearance());
function setScoreAppearance(value:boolean){
 themedScore.value=value;
 try{localStorage.setItem(scoreAppearanceKey,value?'theme':'paper');}catch{/* Preference remains available for this session. */}
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('tango-score-appearance',{detail:value}));
}
function syncScoreAppearance(event:Event){themedScore.value=Boolean((event as CustomEvent<boolean>).detail);}
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
let notesByColor=new Map<string,Note>();
let notesByHead=new Map<SVGElement,Note>();
let headsByNote=new Map<Note,SVGElement[]>();
let focusedHead:SVGElement|undefined;
let highlightedHeads:SVGElement[]=[];
let completedHeads:SVGElement[]=[];
let playingHeads=new Set<SVGElement>();
let measureGroups:SVGGElement[]=[];
let followedSystem:MusicSystem|undefined;

function noteLabel(note:Note){
  const measure=Math.floor((note.start+1e-7)/props.project.beats);
  const beat=Number((note.start-measure*props.project.beats+1).toFixed(2));
  return `${midiName(note.pitch+(props.project.transposeSemitones??0))}, measure ${measure+1}, beat ${beat}`;
}

function setTabStop(head:SVGElement){
  focusedHead?.setAttribute('tabindex','-1');
  head.setAttribute('tabindex','0');
  focusedHead=head;
}

function updateLiveFeedback(){
 const active=props.selectedNote?headsByNote.get(props.selectedNote)??[]:[];
 const state=props.feedbackState;
 const color=state==='Too low'?'#69a9f5':state==='Too high'?'#ee8f70':state==='In tune'?'#46b988':'#c98b3b';
 const progress=Math.max(0,Math.min(100,(props.feedbackProgress??0)*100));
 for(const head of highlightedHeads)if(!active.includes(head)){
  head.style.removeProperty('--note-feedback-progress');
  head.style.removeProperty('--note-feedback-color');
 }
 for(const head of active){
  head.style.setProperty('--note-feedback-progress',progress+'%');
  head.style.setProperty('--note-feedback-color',color);
 }
}
function highlightSelection(){
  for(const head of highlightedHeads){
    head.classList.remove('score-note-selected');
    if(props.interactive)head.setAttribute('aria-pressed','false');
  }
  highlightedHeads=props.selectedNote?headsByNote.get(props.selectedNote)??[]:[];
  for(const head of highlightedHeads){
    head.classList.add('score-note-selected');
    if(props.interactive)head.setAttribute('aria-pressed','true');
  }
  updateLiveFeedback();
  if(props.interactive&&highlightedHeads.length&&(!focusedHead||!highlightedHeads.includes(focusedHead)))setTabStop(highlightedHeads[0]);
}

function highlightCompleted(){
  for(const head of completedHeads)head.classList.remove('score-note-completed');
  completedHeads=(props.completedNotes??[]).flatMap(note=>headsByNote.get(note)??[]);
  for(const head of completedHeads)head.classList.add('score-note-completed');
}

function highlightActiveMeasure(){
  for(const group of measureGroups)group.classList.remove('score-measure-active');
  const measure=props.activeMeasure;
  const container=host.value;
  measureGroups=measure===undefined||!container?[]:
    (osmd?.GraphicSheet?.MeasureList[measure-1]??[]).flatMap(staff=>{
      const group=staff?.getSVGGElement();
      return group&&container.contains(group)?[group]:[];
    });
  // Progressive layout can rebuild graphical measures while their original SVG
  // stays on screen. Resolve that case within this score's own container.
  if(props.followMeasure&&container&&measure!==undefined&&!measureGroups.length)
    measureGroups=[...container.querySelectorAll<SVGGElement>(`g[id^="osmd-m${measure-1}-"]`)];
  for(const group of measureGroups)group.classList.add('score-measure-active');
  if(props.followMeasure&&container&&measure!==undefined&&measureGroups.length){
    const system=osmd?.GraphicSheet.MeasureList[measure-1]?.[0]?.ParentMusicSystem;
    if(system&&system!==followedSystem){
      const tops=(system.StaffLines[0]?.Measures??[]).flatMap(staff=>{
        const group=staff.getSVGGElement();
        return group&&container.contains(group)?[group.getBoundingClientRect().top]:[];
      });
      const systemTop=tops.length?Math.min(...tops):measureGroups[0].getBoundingClientRect().top;
      followedSystem=system;
      const top=systemTop-container.getBoundingClientRect().top;
      container.scrollTop=Math.max(0,container.scrollTop+top-24);
    }
  }
  highlightPlayback();
}

function highlightPlayback(){
  const next=new Set((props.playingNotes??[]).flatMap(note=>
    (headsByNote.get(note)??[]).filter(head=>measureGroups.some(group=>group.contains(head)))));
  for(const head of playingHeads)if(!next.has(head))head.classList.remove('score-note-playing');
  for(const head of next)if(!playingHeads.has(head))head.classList.add('score-note-playing');
  playingHeads=next;
}

function bindNoteheads(){
  if(!host.value)return;
  focusedHead=undefined;
  highlightedHeads=[];
  completedHeads=[];
  notesByHead=findScoreNoteheads(host.value,notesByColor);
  headsByNote=new Map();
  for(const [head,note] of notesByHead){
    head.classList.add('score-notehead');
    if(props.interactive){
      head.setAttribute('role','button');
      head.setAttribute('aria-label',noteLabel(note));
      head.setAttribute('aria-pressed','false');
      head.setAttribute('tabindex','-1');
    }
    const siblings=headsByNote.get(note)??[];
    siblings.push(head);
    headsByNote.set(note,siblings);
  }
  const first=notesByHead.keys().next().value;
  if(first&&props.interactive)setTabStop(first);
  highlightCompleted();
  highlightSelection();
  highlightActiveMeasure();
}

function eventHead(event:Event){
  if(!props.interactive)return null;
  const element=event.target instanceof Element?event.target.closest<SVGElement>('.score-notehead'):null;
  return element&&notesByHead.has(element)?element:null;
}

function chooseHead(head:SVGElement){
  const note=notesByHead.get(head);
  if(note){setTabStop(head);emit('select',note);}
}

function onScoreClick(event:MouseEvent){
  const head=eventHead(event);
  if(head)chooseHead(head);
}

function onScoreKey(event:KeyboardEvent){
  const head=eventHead(event);
  if(!head)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseHead(head);return;}
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const heads=[...notesByHead.keys()];
  const index=heads.indexOf(head);
  const next=event.key==='Home'?0:event.key==='End'?heads.length-1:
    Math.max(0,Math.min(heads.length-1,index+(event.key==='ArrowLeft'?-1:1)));
  event.preventDefault();
  setTabStop(heads[next]);
  heads[next].focus();
}

function renderRange(){
  const renderer=osmd;
  if(!renderer||!loaded)return;
  cancelAnimationFrame(layoutFrame);
  const {first,last}=displayedRange.value;
  renderer.zoom=props.expanded&&observedWidth>=320?1.18:1;
  renderer.setOptions({drawFromMeasureNumber:first,drawUpToMeasureNumber:last,stretchLastSystemLine:props.expanded});
  renderer.resetIncrementalRendering();
  followedSystem=undefined;
  loading.value=true;
  error.value='';
  const draw=()=>{
    try{
      if(last-first<12)renderer.render();
      else if(!renderer.renderNext({measures:12}).done){
        if(props.followMeasure)bindNoteheads();
        layoutFrame=requestAnimationFrame(draw);
        return;
      }
      bindNoteheads();
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
    const colors=scoreNoteheadColors(props.score[props.instrument]??[]);
    const xml=exportMusicXml(props.project,props.score,{onlyInstrument:props.instrument,previewNoteheadColors:colors.byNote,engravingPreview:true});
    await renderer.load(xml);
    if(current!==generation)return;
    notesByColor=colors.byColor;
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
watch(()=>props.expanded,scheduleLayout);
watch(()=>props.selectedNote,highlightSelection);
watch([()=>props.feedbackProgress,()=>props.feedbackState],updateLiveFeedback);
watch(()=>props.completedNotes,highlightCompleted);
watch(()=>props.activeMeasure,highlightActiveMeasure);
watch(()=>props.playingNotes,highlightPlayback);

onMounted(()=>{
  window.addEventListener('tango-score-appearance',syncScoreAppearance);
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
    coloringEnabled:true,
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
  window.removeEventListener('tango-score-appearance',syncScoreAppearance);
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
  <section class="score-preview editor" :class="{'score-preview-expanded':expanded,'score-preview-themed':themedScore}" aria-label="Staff notation">
    <div v-if="interactive" class="score-preview-selection">
      <span role="status">{{selectedNote?noteLabel(selectedNote):'Select a notehead to hear it.'}}</span>
      <button v-if="selectedNote" type="button" class="secondary" @click="emit('edit')">Edit selected note</button>
    </div>
    <div class="score-appearance-control"><button type="button" class="secondary" :aria-pressed="themedScore" @click="setScoreAppearance(!themedScore)" title="Remember score appearance on this device">{{themedScore?'Score: theme':'Score: paper'}}</button></div>
    <p v-if="loading&&!followMeasure" class="score-preview-status" role="status">Engraving score…</p>
    <p v-if="error" class="score-preview-error" role="alert">{{error}}</p>
    <div ref="host" class="score-preview-canvas" :class="{'score-preview-interactive':interactive,'score-preview-follow':followMeasure}" :aria-busy="loading"
      :tabindex="followMeasure?0:undefined" :aria-label="followMeasure?'Scrollable exercise score':undefined" @click="onScoreClick" @keydown="onScoreKey" />
  </section>
</template>

<style scoped>
.score-preview{margin:6px 0;padding:12px;background:var(--score-paper,#f8fafc);color:#18222c;border:1px solid #b9c7d3;border-radius:10px;overflow:hidden}
.score-preview-status{margin:0 0 6px}
.score-preview-selection{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;font-size:.85rem}
.score-preview-canvas{min-height:92px;overflow-x:auto}
.score-preview-follow{height:var(--score-follow-height,300px);overflow:auto;overflow-anchor:none;overscroll-behavior:contain;scrollbar-gutter:stable}
.score-preview-canvas :deep(svg){display:block;max-width:100%;height:auto}
.score-preview-expanded .score-preview-canvas :deep(svg){margin-inline:auto}
.score-preview-canvas :deep(.score-notehead),.score-preview-canvas :deep(.score-notehead [fill]){fill:#18222c}
.score-preview-interactive :deep(.score-notehead){cursor:pointer}
.score-preview-canvas :deep(.score-note-completed),.score-preview-canvas :deep(.score-note-completed [fill]){fill:#24724f}
.score-preview-canvas :deep(.score-measure-active .vf-stave path){stroke:#176773}
.score-preview-canvas :deep(.score-note-playing),.score-preview-canvas :deep(.score-note-playing [fill]){fill:#006d79}
.score-preview-canvas :deep(.score-note-selected),.score-preview-canvas :deep(.score-note-selected [fill]),
.score-preview-canvas :deep(.score-notehead:focus-visible),.score-preview-canvas :deep(.score-notehead:focus-visible [fill]){fill:#a44702}
.score-preview-error{color:#a32828}
@media(max-width:640px){.score-preview{padding:8px}.score-preview-canvas{margin-inline:-4px}}
.score-preview-canvas :deep(.score-note-selected){
 filter:drop-shadow(0 0 2px var(--note-feedback-color,#c98b3b));
}
.score-preview-canvas :deep(.score-note-selected [fill]){
 stroke:var(--note-feedback-color,#c98b3b);
 stroke-width:1.3px;
}
.score-appearance-control{display:flex;justify-content:flex-end;margin-bottom:4px}
.score-appearance-control button{font-size:.72rem;padding:3px 8px}
.score-preview-themed{background:var(--panel,#1a232c);color:var(--text,#e8e9ec);border-color:var(--border,#35414c)}
.score-preview-themed .score-preview-canvas :deep(svg){color:var(--text,#e8e9ec);fill:currentColor;stroke:currentColor}
.score-preview-themed .score-preview-canvas :deep([fill="black"]),.score-preview-themed .score-preview-canvas :deep([fill="#000"]),.score-preview-themed .score-preview-canvas :deep([fill="#000000"]){fill:var(--text,#e8e9ec)}
.score-preview-themed .score-preview-canvas :deep([stroke="black"]),.score-preview-themed .score-preview-canvas :deep([stroke="#000"]),.score-preview-themed .score-preview-canvas :deep([stroke="#000000"]){stroke:var(--text,#e8e9ec)}
.score-preview-themed .score-preview-canvas :deep(.score-notehead),.score-preview-themed .score-preview-canvas :deep(.score-notehead [fill]){fill:var(--text,#e8e9ec)}
.score-preview-themed .score-preview-canvas :deep(.score-note-completed),.score-preview-themed .score-preview-canvas :deep(.score-note-completed [fill]){fill:#6ec5b2}
.score-preview-themed .score-preview-canvas :deep(.score-note-playing),.score-preview-themed .score-preview-canvas :deep(.score-note-playing [fill]){fill:#8fbbff}
.score-preview-themed .score-preview-canvas :deep(.score-note-selected),.score-preview-themed .score-preview-canvas :deep(.score-note-selected [fill]),.score-preview-themed .score-preview-canvas :deep(.score-notehead:focus-visible),.score-preview-themed .score-preview-canvas :deep(.score-notehead:focus-visible [fill]){fill:var(--accent,#e7c38e)}
.score-preview-themed .score-preview-canvas :deep(.score-measure-active .vf-stave path){stroke:#6ec5b2}
.score-preview-themed .score-preview-error{color:#ee8f70}
</style>
