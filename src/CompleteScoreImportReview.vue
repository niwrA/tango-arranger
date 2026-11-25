<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import {instrumentFamily,type InstrumentFamily,type Role} from './music';
import type {ParsedMusicXml} from './musicXmlImport';

const props=defineProps<{parsed:ParsedMusicXml;sourceName:string}>();
const emit=defineEmits<{create:[config:{families:InstrumentFamily[];names:string[];roles:Role[];starts:number[];title:string}];cancel:[]}>();
const families:InstrumentFamily[]=['Violin','Piano','Contrabass','Bandoneon','Voice','Guitar','Clarinet','Flute','Trumpet','Trombone'];
const choices=ref<InstrumentFamily[]>([]);
const names=ref<string[]>([]);
const roles=ref<Role[]>([]);
const starts=ref<number[]>([0]);
const title=ref('');
const selected=ref(0);
const previewStart=ref(0);
let context:AudioContext|null=null;
let voices:OscillatorNode[]=[];
let stopTimer:ReturnType<typeof setTimeout>|null=null;
const duration=computed(()=>props.parsed.measures.reduce((sum,m)=>sum+m.beats,0));
const totalNotes=computed(()=>props.parsed.parts.reduce((sum,p)=>sum+p.notes.length,0));
const sectionRanges=computed(()=>starts.value.map((start,i)=>({start,end:(starts.value[i+1]??props.parsed.measureCount)-1})));
const part=computed(()=>props.parsed.parts[selected.value]);
const notesAtPreview=computed(()=>{
 const from=props.parsed.measures[previewStart.value]?.offset??0;
 const to=props.parsed.measures[Math.min(props.parsed.measureCount-1,previewStart.value+3)];
 const end=to?to.offset+to.beats:from+16;
 return (part.value?.notes??[]).filter(n=>n.start<end&&n.start+n.duration>from).slice(0,200).map(n=>({...n,left:(n.start-from)/(end-from)*100,width:Math.max(.4,n.duration/(end-from)*100)}));
});
function inferFamily(index:number):InstrumentFamily{
 const p=props.parsed.parts[index],name=p.name.toLowerCase();
 for(const family of families)if(name.includes(family.toLowerCase()))return family;
 const pitches=p.notes.map(n=>n.pitch).sort((a,b)=>a-b);
 const median=pitches[Math.floor(pitches.length/2)]??60;
 return p.staffCount>1?'Piano':median<49?'Contrabass':'Violin';
}
function reset(){
 choices.value=props.parsed.parts.map((_,i)=>inferFamily(i));
 names.value=props.parsed.parts.map(p=>p.name);
 roles.value=props.parsed.parts.map((p,i)=>choices.value[i]==='Contrabass'?'bass':i===0?'melody':'harmony');
 starts.value=[0,...props.parsed.measures.map((m,i)=>m.rehearsal&&i>0?i:-1).filter(i=>i>0)].slice(0,26);
 title.value=props.parsed.title||props.sourceName.replace(/\.(musicxml|xml)$/i,'');
 selected.value=0;previewStart.value=0;
}
watch(()=>props.parsed,reset,{immediate:true});
function toggleSection(index:number){
 if(index===0)return;
 if(starts.value.includes(index))starts.value=starts.value.filter(i=>i!==index);
 else if(starts.value.length<26)starts.value=[...starts.value,index].sort((a,b)=>a-b);
}
function stop(){
 if(stopTimer!==null){clearTimeout(stopTimer);stopTimer=null;}
 for(const osc of voices){try{osc.stop();}catch{/* already stopped */}try{osc.disconnect();}catch{/* already disconnected */}}
 voices=[];
}
function play(){
 stop();
 const from=props.parsed.measures[previewStart.value]?.offset??0;
 const to=props.parsed.measures[Math.min(props.parsed.measureCount-1,previewStart.value+3)];
 const end=to?to.offset+to.beats:from+16;
 const bpm=120,secondsPerBeat=60/bpm;
 try{
  context??=new AudioContext();
  if(context.state==='suspended')void context.resume();
  const now=context.currentTime+.04;
  for(const n of (part.value?.notes??[]).filter(n=>n.start<end&&n.start+n.duration>from).slice(0,300)){
   const onset=now+Math.max(0,n.start-from)*secondsPerBeat;
   const length=Math.max(.05,Math.min(n.start+n.duration,end)-Math.max(n.start,from))*secondsPerBeat;
   const osc=context.createOscillator(),gain=context.createGain();
   osc.type='triangle';osc.frequency.value=440*Math.pow(2,(n.pitch-69)/12);
   gain.gain.setValueAtTime(0,onset);gain.gain.linearRampToValueAtTime(.065,onset+.015);
   gain.gain.setValueAtTime(.065,Math.max(onset+.016,onset+length-.035));
   gain.gain.linearRampToValueAtTime(0,onset+length);
   osc.connect(gain).connect(context.destination);osc.start(onset);osc.stop(onset+length+.01);voices.push(osc);
  }
  stopTimer=setTimeout(stop,(end-from)*secondsPerBeat*1000+150);
 }catch{/* Audio playback may be unavailable until a user gesture or in unsupported browsers. */}
}
onBeforeUnmount(()=>{stop();if(context)void context.close();});
</script>

<template>
 <section class="import-panel" aria-label="Import complete score review">
  <h3>Review complete score · {{parsed.parts.length}} parts, {{parsed.measureCount}} measures</h3>
  <p class="hint">Every source part will be preserved in a new song, independently of your current roster. Instrument suggestions are based on names, staff count and pitch range; verify them. Playback uses simple preview tones, not the final instrument sounds.</p>
  <label>New song title <input v-model="title"/></label>
  <p v-if="parsed.warnings.length" class="hint" role="status">{{parsed.warnings.slice(0,4).join(' · ')}}</p>
  <p class="hint">{{totalNotes}} pitched notes · {{duration}} quarter beats · {{parsed.measures[0]?.beats??4}} beats per measure</p>
  <div class="import-complete-parts">
   <div v-for="(p,i) in parsed.parts" :key="p.id" class="import-complete-part" :class="{'is-selected':selected===i}">
    <button type="button" class="secondary" :aria-pressed="selected===i" @click="selected=i;stop()">{{i+1}} · {{p.name}} ({{p.notes.length}} notes, {{p.staffCount}} staves)</button>
    <label>Instrument<select v-model="choices[i]"><option v-for="family in families" :key="family" :value="family">{{family}}</option></select></label>
    <label>Part name<input v-model="names[i]" :aria-label="'Name for part '+(i+1)"/></label>
    <label>Musical role<select v-model="roles[i]"><option value="melody">Melody</option><option value="harmony">Harmony</option><option value="chords">Chords</option><option value="bass">Bass</option><option value="fill">Countermelody / fill</option><option value="variation">Variation</option><option value="rest">Unassigned</option></select></label>
   </div>
  </div>
  <div v-if="part" class="import-complete-preview">
   <strong>Part {{selected+1}} · {{part.name}} · note preview</strong>
   <label>First preview measure <input type="number" min="1" :max="parsed.measureCount" :value="previewStart+1" @change="previewStart=Math.max(0,Math.min(parsed.measureCount-1,Number(($event.target as HTMLInputElement).value)-1));stop()"/></label>
   <button type="button" class="secondary" @click="play">Listen to four measures</button>
   <button type="button" class="secondary" @click="stop">Stop</button>
   <div class="import-complete-roll" role="img" :aria-label="'Pitch and rhythm preview of '+part.name">
    <span v-for="(note,i) in notesAtPreview" :key="i" class="import-complete-note" :style="{left:note.left+'%',width:note.width+'%',bottom:Math.max(0,Math.min(96,(note.pitch-24)/84*96))+'%'}" :title="'MIDI '+note.pitch+' · beat '+note.start+' · duration '+note.duration"></span>
   </div>
   <small class="hint">Piano-roll notation preview; exact original staves and engraving are not reconstructed here.</small>
  </div>
  <h3>Section boundaries</h3>
  <p class="hint">Click a measure to mark or unmark the start of a section. Rehearsal marks, when present, are initially selected. Otherwise the score starts as one section. Maximum 26 sections.</p>
  <div class="import-complete-measures" role="group" aria-label="Section start measures">
   <button v-for="(measure,i) in parsed.measures" :key="i" type="button" :class="starts.includes(i)?'primary':'secondary'" :aria-pressed="starts.includes(i)" :disabled="i===0" :title="measure.rehearsal||'Measure '+(i+1)" @click="toggleSection(i)">{{i+1}}</button>
  </div>
  <p class="hint">Sections: {{sectionRanges.map((r,i)=>String.fromCharCode(65+i)+' ('+(r.start+1)+'–'+(r.end+1)+')').join(' · ')}}</p>
  <div class="overview-actions">
   <button type="button" class="primary" :disabled="!title.trim()||names.some(n=>!n.trim())" @click="emit('create',{families:[...choices],names:[...names],roles:[...roles],starts:[...starts],title:title.trim()})">Create new song with all {{parsed.parts.length}} parts</button>
   <button type="button" class="secondary" @click="emit('cancel')">Cancel</button>
  </div>
 </section>
</template>
<style scoped>
.import-complete-parts{display:grid;gap:8px;max-height:350px;overflow:auto}
.import-complete-part{display:grid;grid-template-columns:minmax(170px,1.5fr) repeat(3,minmax(115px,1fr));gap:8px;align-items:end;padding:8px;border:1px solid var(--border,#7775);border-radius:8px}
.import-complete-part.is-selected{outline:2px solid var(--accent,#748ab5)}
.import-complete-part label{display:grid;gap:4px;font-size:.8rem}
.import-complete-part input,.import-complete-part select{width:100%;min-width:0}
.import-complete-roll{position:relative;height:130px;margin:12px 0;background:repeating-linear-gradient(to top,transparent 0,transparent 15px,#8883 16px);border:1px solid #8886;border-radius:5px;overflow:hidden}
.import-complete-note{position:absolute;height:5px;min-width:2px;background:#68a7d8;border-radius:2px}
.import-complete-measures{display:flex;flex-wrap:wrap;gap:4px;max-height:160px;overflow:auto}
.import-complete-measures button{min-width:34px;padding:4px}
@media(max-width:760px){.import-complete-part{grid-template-columns:1fr 1fr}.import-complete-part>button{grid-column:span 2}}
</style>
