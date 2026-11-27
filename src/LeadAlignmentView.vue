<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import PerformanceLyricLine from './PerformanceLyricLine.vue';
import {alignmentPreviewNotes,moveAlignmentChord,moveAlignmentSyllable,type LeadAlignment} from './leadAlignment';
import type {Note} from './music';
const props=defineProps<{draft:LeadAlignment;voice:Note[];bars:{chord:string}[];playing:boolean;playBeat:number;selectedMeasure:number;bpm:number;error?:string}>();
const emit=defineEmits<{change:[draft:LeadAlignment];seek:[bar:number];apply:[];reset:[]}>();
const cursor=ref(props.selectedMeasure*props.draft.beats),zoom=ref(76),step=ref(1);
const selected=ref<{kind:'chord'|'syllable';id:number}|null>(null);
const feedback=ref('');
const timeline=ref<HTMLElement|null>(null),scroll=ref<HTMLElement|null>(null);
const preview= computed(()=>alignmentPreviewNotes(props.draft,props.voice));
const beat=computed(()=>props.playing?props.playBeat:cursor.value);
const total=computed(()=>props.draft.beats*props.draft.measures);
const width=computed(()=>total.value*zoom.value);
const rows=computed(()=>Array.from({length:props.draft.measures},(_,i)=>i));
const grid=computed(()=>Array.from({length:Math.ceil(total.value/step.value)},(_,i)=>i*step.value));
let drag:{kind:'chord'|'syllable';id:number;pointer:number;x:number;moved:boolean}|null=null;
const ghost=ref<number|null>(null);
function position(e:PointerEvent){return Math.max(0,Math.min(total.value-.001,(e.clientX-(timeline.value?.getBoundingClientRect().left??0))/zoom.value));}
function snap(at:number,kind:'chord'|'syllable'){
 if(kind==='chord')return Math.min(total.value-1,Math.round(at));
 const chord=props.draft.chords.find(c=>Math.abs(c.start-at)<.2);
 if(chord)return chord.start;
 if(props.draft.existing){
  const starts=props.voice.map(n=>n.start).filter(n=>n>=props.draft.pickup&&n<total.value);
  if(starts.length)return starts.reduce((best,n)=>Math.abs(n-at)<Math.abs(best-at)?n:best);
 }
 return Math.max(props.draft.pickup,Math.min(total.value-step.value,Math.round(at/step.value)*step.value));
}
function move(kind:'chord'|'syllable',id:number,at:number){
 try{const next=kind==='chord'?moveAlignmentChord(props.draft,id,at):moveAlignmentSyllable(props.draft,id,at,props.voice);emit('change',next);cursor.value=at;emit('seek',Math.floor(at/props.draft.beats));selected.value=null;feedback.value='';}
 catch(error){feedback.value=String(error);}
}
function down(e:PointerEvent,kind:'chord'|'syllable',id:number){
 if(e.button!==0||props.playing)return;
 // Tap a chord while a syllable is selected to align directly to the chord.
 if(kind==='chord'&&selected.value?.kind==='syllable'){
  const c=props.draft.chords.find(c=>c.id===id);if(c)move('syllable',selected.value.id,c.start);return;
 }
 selected.value={kind,id};drag={kind,id,pointer:e.pointerId,x:e.clientX,moved:false};(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function moving(e:PointerEvent){if(!drag||drag.pointer!==e.pointerId)return;if(Math.abs(e.clientX-drag.x)>5)drag.moved=true;if(drag.moved)ghost.value=snap(position(e),drag.kind);}
function up(e:PointerEvent){if(!drag||drag.pointer!==e.pointerId)return;const d=drag;drag=null;if(d.moved)move(d.kind,d.id,snap(position(e),d.kind));ghost.value=null;}
function cancel(){drag=null;ghost.value=null;}
function place(e:PointerEvent){if(props.playing)return;const at=position(e);if(selected.value)move(selected.value.kind,selected.value.id,snap(at,selected.value.kind));else{cursor.value=Math.floor(at/step.value)*step.value;emit('seek',Math.floor(at/props.draft.beats));}}
function choose(kind:'chord'|'syllable',id:number,at:number){if(props.playing)return;if(kind==='chord'&&selected.value?.kind==='syllable'){move('syllable',selected.value.id,at);return;}selected.value={kind,id};cursor.value=at;emit('seek',Math.floor(at/props.draft.beats));}
function nudge(delta:number){const s=selected.value;if(!s)return;const item=s.kind==='chord'?props.draft.chords.find(c=>c.id===s.id):props.draft.syllables.find(c=>c.id===s.id);if(item)move(s.kind,s.id,snap(item.start+delta*(s.kind==='chord'?1:step.value),s.kind));}
watch(()=>props.selectedMeasure,m=>{if(!props.playing&&Math.floor(cursor.value/props.draft.beats)!==m)cursor.value=m*props.draft.beats;});
watch(beat,b=>{if(!props.playing||!scroll.value)return;const x=b*zoom.value;if(x<scroll.value.scrollLeft||x>scroll.value.scrollLeft+scroll.value.clientWidth-30)scroll.value.scrollLeft=Math.max(0,x-40);});
onBeforeUnmount(cancel);
</script>
<template>
 <section class="alignment-visual" aria-label="Visual lyrics and chord alignment">
  <div class="alignment-toolbar"><label>Lyric snap <select v-model.number="step"><option :value="1">Quarter</option><option :value=".5">Eighth</option><option :value=".25">Sixteenth</option></select></label><label>Zoom <input type="range" min="48" max="140" v-model.number="zoom"/></label><button type="button" class="secondary" :disabled="!selected||playing" @click="nudge(-1)">←</button><button type="button" class="secondary" :disabled="!selected||playing" @click="nudge(1)">→</button><small>Chords snap to quarter beats. {{draft.existing?'Lyrics snap to existing vocal onsets.':'Lyric timings are provisional.'}}</small></div>
  <div class="alignment-scroll" ref="scroll"><div ref="timeline" class="alignment-timeline" :style="{width:width+'px'}" @pointerdown.self="place">
   <div v-for="m in rows" :key="m" class="alignment-measure" :style="{left:m*draft.beats*zoom+'px',width:draft.beats*zoom+'px'}"><span>M{{m+1}}</span></div>
   <div v-for="at in grid" :key="at" class="alignment-gridline" :class="{strong:Number.isInteger(at)}" :style="{left:at*zoom+'px'}"><small v-if="Number.isInteger(at)">{{at%draft.beats+1}}</small></div>
   <div v-if="draft.pickup" class="alignment-pickup" :style="{width:draft.pickup*zoom+'px'}"></div>
   <div v-for="c in draft.chords" :key="c.id" class="alignment-anchor-line" :style="{left:c.start*zoom+'px'}"></div>
   <button v-for="c in draft.chords" :key="'c'+c.id" type="button" class="alignment-chip chord" :class="{selected:selected?.kind==='chord'&&selected.id===c.id}" :style="{left:c.start*zoom+'px'}" :aria-label="c.symbol+' at beat '+(c.start+1)" @pointerdown.stop="down($event,'chord',c.id)" @pointermove="moving" @pointerup="up" @pointercancel="cancel" @click="($event.detail===0)&&choose('chord',c.id,c.start)">{{c.symbol}}</button>
   <button v-for="s in draft.syllables" :key="'s'+s.id" type="button" class="alignment-chip syllable" :class="{pinned:s.anchor,selected:selected?.kind==='syllable'&&selected.id===s.id}" :style="{left:s.start*zoom+'px',top:100+(s.id%3)*34+'px'}" :aria-label="s.text+' at beat '+(s.start+1)" @pointerdown.stop="down($event,'syllable',s.id)" @pointermove="moving" @pointerup="up" @pointercancel="cancel" @click="($event.detail===0)&&choose('syllable',s.id,s.start)">{{s.text}}</button>
   <div class="alignment-playhead" :style="{left:beat*zoom+'px'}"></div><div v-if="ghost!==null" class="alignment-drop" :style="{left:ghost*zoom+'px'}"></div>
  </div></div>
  <small>Drag a chord to a beat, or a syllable to a chord or beat. Tap an item then tap a destination. Blue syllables are pinned.</small>
  <p v-if="feedback||error" role="alert">{{feedback||error}}</p>
  <PerformanceLyricLine :notes="preview" :beat="beat" :beats-per-measure="draft.beats" :measure-count="draft.measures" :line-starts="draft.syllables.filter((s,i)=>i===0||s.line!==draft.syllables[i-1].line).map(s=>s.start)" :chords="bars" :effective-bpm="bpm" instrument="Alignment preview"/>
  <div class="alignment-toolbar"><small>{{playing?'Following song playback (applied harmony)':'Static draft preview'}}</small><button type="button" class="secondary" :disabled="playing" @click="emit('reset')">Reset draft</button><button type="button" class="primary" :disabled="playing||!!error" @click="emit('apply')">Apply alignment</button></div>
 </section>
</template>
<style scoped>
.alignment-visual{display:grid;gap:8px;min-width:0}.alignment-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.alignment-toolbar label{display:flex;align-items:center;gap:4px}.alignment-toolbar select{width:auto}.alignment-toolbar input{width:90px}.alignment-scroll{overflow:auto;border:1px solid #536a7d;border-radius:8px;background:#172936}.alignment-timeline{position:relative;height:218px;min-width:100%;isolation:isolate}.alignment-measure,.alignment-gridline,.alignment-anchor-line,.alignment-playhead,.alignment-drop,.alignment-pickup{position:absolute;top:0;bottom:0;pointer-events:none}.alignment-measure{border-left:2px solid #8095a5;padding:3px 5px;color:#c5d6e0}.alignment-gridline{top:26px;border-left:1px dashed #456070;color:#a6bbc9}.alignment-gridline.strong{border-left-style:solid}.alignment-gridline small{padding-left:3px;font-size:10px}.alignment-anchor-line{top:68px;border-left:1px dashed #d1a875}.alignment-chip{position:absolute;z-index:2;min-height:30px;padding:3px 6px;white-space:nowrap;touch-action:none;font-size:13px;border-radius:5px;cursor:grab}.alignment-chip.chord{top:42px;background:#d1a875;color:#192936}.alignment-chip.syllable{background:#294858;color:#e0edf5;border:1px solid #638da6}.alignment-chip.pinned{background:#83c6e7;color:#142936}.alignment-chip.selected{outline:2px solid white;z-index:3}.alignment-playhead{border-left:2px solid #75c5a5;z-index:4}.alignment-drop{border-left:3px solid #83c6e7;z-index:5}.alignment-pickup{background:#0005}.alignment-visual p[role=alert]{color:#ffb8a0}
</style>
