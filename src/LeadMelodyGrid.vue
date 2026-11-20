<script setup lang="ts">
import {computed,ref} from 'vue';
import {midiName,type Note} from './music';

const props=defineProps<{notes:Note[];beats:number}>();
const emit=defineEmits<{(event:'update:notes',value:Note[]):void}>();
const selected=ref(-1);
const safeNotes=computed(()=>props.notes.map((note,index)=>({note,index})));
const pitches=computed(()=>{
  const values=props.notes.map(n=>n.pitch);
  const low=Math.max(24,Math.min(99,Math.min(60,...values)-2));
  const high=Math.min(108,Math.max(low+12,Math.max(72,...values)+2));
  return Array.from({length:high-low+1},(_,i)=>high-i);
});
const beats=computed(()=>Array.from({length:props.beats*4},(_,i)=>i/4));
const selectedNote=computed(()=>props.notes[selected.value]??null);
function emitNotes(notes:Note[]){emit('update:notes',notes);}
function update(index:number,updates:Partial<Note>){
 const old=props.notes[index];if(!old)return;
 const note={...old,...updates};
 note.start=Math.round(note.start*4)/4;
 note.duration=Math.round(note.duration*4)/4;
 if(!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||
    !Number.isFinite(note.start)||!Number.isFinite(note.duration)||
    note.start<0||note.duration<.25||note.start+note.duration>props.beats+1e-8)return;
 emitNotes(props.notes.map((entry,i)=>i===index?note:entry));
}
function add(pitch:number,start:number){
 if(props.notes.some(n=>n.pitch===pitch&&Math.abs(n.start-start)<1e-8))return;
 const next=[...props.notes,{pitch,start,duration:.25}];
 selected.value=next.length-1;
 emitNotes(next);
}
function addNext(){
 const used=new Set(props.notes.map(n=>n.start));
 const next=beats.value.find(start=>!used.has(start));
 if(next!==undefined)add(props.notes.at(-1)?.pitch??72,next);
}
function remove(){if(selected.value<0)return;emitNotes(props.notes.filter((_,i)=>i!==selected.value));selected.value=-1;}
type Drag={pointerId:number;index:number;x:number;y:number;pitch:number;start:number;stepWidth:number;rowHeight:number};
let drag:Drag|null=null;
function beginDrag(event:PointerEvent,index:number){
 if(event.button!==0||!event.isPrimary)return;
 const cell=(event.currentTarget as HTMLElement).closest<HTMLElement>('.lead-visual-pitch-row');
 const track=cell?.querySelector<HTMLElement>('.lead-visual-track');
 const grid=(event.currentTarget as HTMLElement).closest<HTMLElement>('.lead-visual-grid');
 const note=props.notes[index];
 if(!cell||!track||!grid||!note)return;
 const stepWidth=track.getBoundingClientRect().width/(props.beats*4);
 if(stepWidth<=0)return;
 selected.value=index;
 drag={pointerId:event.pointerId,index,x:event.clientX,y:event.clientY,pitch:note.pitch,start:note.start,stepWidth,rowHeight:cell.getBoundingClientRect().height};
 grid.setPointerCapture(event.pointerId);
 event.preventDefault();
}
function moveDrag(event:PointerEvent){
 if(!drag||drag.pointerId!==event.pointerId)return;
 const note=props.notes[drag.index];if(!note)return;
 const start=Math.max(0,Math.min(props.beats-note.duration,drag.start+Math.round((event.clientX-drag.x)/drag.stepWidth)*.25));
 const pitch=Math.max(0,Math.min(127,drag.pitch-Math.round((event.clientY-drag.y)/drag.rowHeight)));
 update(drag.index,{start,pitch});
}
function endDrag(event:PointerEvent){if(drag?.pointerId===event.pointerId)drag=null;}
</script>

<template>
 <section class="lead-visual" aria-label="Interactive lead-sheet melody">
  <div class="lead-visual-ruler"><span v-for="beat in props.beats" :key="beat">{{beat}}</span></div>
  <div class="lead-visual-grid" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag">
   <div v-for="pitch in pitches" :key="pitch" class="lead-visual-pitch-row">
    <span class="lead-visual-pitch">{{midiName(pitch)}}</span>
    <div class="lead-visual-track">
     <button v-for="beat in beats" :key="beat" type="button" class="lead-visual-cell" :style="{left:(beat/props.beats*100)+'%',width:(.25/props.beats*100)+'%'}" :aria-label="'Add '+midiName(pitch)+' at beat '+(beat+1)" @click="add(pitch,beat)"></button>
     <button v-for="entry in safeNotes.filter(e=>e.note.pitch===pitch)" :key="entry.index"
       type="button" class="lead-visual-note" :class="{'selected':selected===entry.index}"
       :style="{left:(entry.note.start/props.beats*100)+'%',width:(entry.note.duration/props.beats*100)+'%'}"
       :aria-label="midiName(entry.note.pitch)+' at beat '+(entry.note.start+1)+', duration '+entry.note.duration"
       @pointerdown="beginDrag($event,entry.index)" @click.stop="selected=entry.index">{{midiName(entry.note.pitch)}}</button>
    </div>
   </div>
  </div>
  <div class="lead-visual-controls">
   <button type="button" class="secondary" @click="addNext">+ Note</button>
   <template v-if="selectedNote">
    <strong>{{midiName(selectedNote.pitch)}} · beat {{selectedNote.start+1}} · {{selectedNote.duration}} beats</strong>
    <button type="button" class="secondary" aria-label="Lower pitch" @click="update(selected,{pitch:selectedNote.pitch-1})">Pitch −</button>
    <button type="button" class="secondary" aria-label="Raise pitch" @click="update(selected,{pitch:selectedNote.pitch+1})">Pitch +</button>
    <button type="button" class="secondary" aria-label="Move earlier" @click="update(selected,{start:selectedNote.start-.25})">← ¼</button>
    <button type="button" class="secondary" aria-label="Move later" @click="update(selected,{start:selectedNote.start+.25})">¼ →</button>
    <button type="button" class="secondary" aria-label="Shorten duration" @click="update(selected,{duration:selectedNote.duration-.25})">Length −</button>
    <button type="button" class="secondary" aria-label="Lengthen duration" @click="update(selected,{duration:selectedNote.duration+.25})">Length +</button>
    <button type="button" class="secondary" @click="remove">Delete</button>
   </template>
  </div>
  <p class="hint">Drag a note horizontally by a quarter beat or vertically by a semitone. Tap empty cells to add notes. These are lead-sheet melody notes; regenerate to update unprotected instrument parts.</p>
 </section>
</template>

<style scoped>
.lead-visual{border:1px solid #597588;border-radius:11px;background:#192f3d;padding:10px;margin:10px 0}
.lead-visual-ruler{display:flex;padding-left:63px;font-size:11px;font-weight:700;color:#bfcdd6}
.lead-visual-ruler span{flex:1}
.lead-visual-grid{max-height:325px;overflow:auto;touch-action:pan-y;border:1px solid #526d7e;border-radius:6px}
.lead-visual-pitch-row{display:flex;min-height:25px;border-bottom:1px solid #40596c}
.lead-visual-pitch{flex:0 0 62px;display:flex;align-items:center;justify-content:center;background:#274052;font-size:11px;font-weight:700}
.lead-visual-track{position:relative;min-width:280px;flex:1}
.lead-visual-cell{position:absolute;top:0;bottom:0;min-height:24px;padding:0;margin:0;border:0;border-right:1px solid #40586b;border-radius:0;background:transparent}
.lead-visual-cell:hover{background:#55758b70}
.lead-visual-note{position:absolute;top:2px;bottom:2px;min-height:19px;padding:0 2px;margin:0;z-index:2;font-size:11px;font-weight:750;line-height:1;background:#72b2e4;border:1px solid #b7d9f2;border-radius:4px;color:#132636;white-space:nowrap;overflow:hidden;touch-action:none;user-select:none;cursor:grab}
.lead-visual-note.selected{background:#f4c889;border-color:#ffedce}
.lead-visual-controls{display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-top:9px}
.lead-visual-controls button{padding:5px 8px;min-height:36px}
.lead-visual-controls strong{font-size:12px}
@media(max-width:700px){.lead-visual-track{min-width:370px}.lead-visual-grid{overflow-x:auto}.lead-visual-controls button{min-height:42px}}
</style>
