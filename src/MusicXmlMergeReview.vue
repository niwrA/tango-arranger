<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {assembleEditionScore} from './editions';
import {projectInstruments,type Instrument,type Note,type Project} from './music';
import {createMergePlan,modifyAlignment,previewMerge,chordEstimate,
 type AlignmentRow,type MergeDecision,type MergeMode,type MergePlan,type ProtectionDecision} from './musicXmlMerge';
import type {ParsedMusicXml} from './musicXmlImport';
const props=defineProps<{project:Project;parsed:ParsedMusicXml;sourceName:string}>();
const emit=defineEmits<{'apply':[plan:MergePlan];'cancel':[]; 'reference':[plan:MergePlan]}>();
const instruments=computed(()=>projectInstruments(props.project));
const detectedPart=()=>{
 const file=props.sourceName.toLowerCase();
 if(file.includes('violin'))return props.parsed.parts.reduce((best,part,i)=>part.pitchedMeasures>props.parsed.parts[best].pitchedMeasures?i:best,0);
 return props.parsed.parts.findIndex(p=>p.staffCount>1)>=0?props.parsed.parts.findIndex(p=>p.staffCount>1):0;
};
const partIndex=ref(Math.max(0,detectedPart()));
const instrument=ref<Instrument>(props.sourceName.toLowerCase().includes('violin')?'Violin I':'Piano');
const mode=ref<MergeMode>('fit');
const editPage=ref(0);
const pageSize=10;
const editing=ref<number|null>(null);
const inferred=ref(false);
const changesTo=ref<MergeDecision>('theirs');
const selectedSection=ref(0);
const error=ref('');
function createPlan():MergePlan{
 return createMergePlan(props.project,props.parsed,instruments.value.includes(instrument.value)?instrument.value:instruments.value[0],partIndex.value,mode.value,props.sourceName);
}
const plan=ref<MergePlan>(createPlan());
function rebuild(){
 try{plan.value=createPlan();plan.value.inferredHarmony=inferred.value;error.value='';editPage.value=0;editing.value=null;}
 catch(err){error.value=String(err);}
}
watch([mode,instrument,partIndex],rebuild);
const effectivePlan=computed(()=>({...plan.value,inferredHarmony:inferred.value}));
const preview=computed(()=>{
 try{return {result:previewMerge(props.project,props.parsed,effectivePlan.value),error:''};}
 catch(err){return {result:null,error:String(err)};}
});
const total=computed(()=>plan.value.rows.length);
const pageCount=computed(()=>Math.ceil(total.value/pageSize));
const rows=computed(()=>plan.value.rows.slice(editPage.value*pageSize,(editPage.value+1)*pageSize));
const savedScore=computed(()=>assembleEditionScore(props.project));
const spans=computed(()=>{
 const list:{name:string;start:number;end:number}[]=[];
 const barName=(i:number)=>{
  if(mode.value!=='lead')return props.project.bars[i]?.section??'';
  const measure=props.parsed.measures[i];
  let start=0;
  for(let k=1;k<=i;k++)if(props.parsed.measures[k].keyFifths!==props.parsed.measures[k-1].keyFifths||props.parsed.measures[k].rehearsal)start++;
  return String.fromCharCode(65+Math.min(25,start));
 };
 for(let i=0;i<total.value;i++){
  const name=barName(i);
  if(!list.length||list[list.length-1].name!==name)list.push({name,start:i,end:i});
  else list[list.length-1].end=i;
 }
 return list;
});
const activeSpan=computed(()=>spans.value[Math.min(selectedSection.value,spans.value.length-1)]);
function updateRow(index:number,patch:Partial<Omit<AlignmentRow,'target'>>){
 try{plan.value=modifyAlignment(plan.value,index,patch);error.value='';}
 catch(err){error.value=String(err);}
}
function sourceMeasure(index:number,v:string){
 if(v.trim()===''){updateRow(index,{theirs:null,confidence:0});return;}
 const number=Number(v);
 if(!Number.isInteger(number)||number<1||number>props.parsed.measureCount){error.value='Source measure must be 1–'+props.parsed.measureCount;return;}
 updateRow(index,{theirs:number-1,confidence:0});
}
function sourcePartNotes(row:AlignmentRow):Note[]{
 if(row.theirs===null)return [];
 const measure=props.parsed.measures[row.theirs];
 const beats=measure.beats;
 return props.parsed.parts[partIndex.value].notes.filter(n=>n.start>=measure.offset-1e-6&&n.start<measure.offset+beats-1e-6);
}
function oldPartNotes(row:AlignmentRow):Note[]{
 if(row.ours===null)return [];
 const from=row.ours*props.project.beats;
 return (savedScore.value[instrument.value]??[]).filter(n=>n.start>=from-1e-6&&n.start<from+props.project.beats-1e-6);
}
function editProtected(row:AlignmentRow){
 if(row.ours===null){error.value='No corresponding existing measure to edit';return;}
 if(editing.value===row.target){editing.value=null;return;}
 updateRow(row.target,{notes:'ours',notesOverride:oldPartNotes(row).map(n=>JSON.parse(JSON.stringify(n)) as Note)});
 editing.value=row.target;
}
function editPitch(row:AlignmentRow,index:number,v:string){
 const p=Number(v);
 if(!Number.isInteger(p)||p<0||p>127){error.value='MIDI pitch must be 0–127';return;}
 if(!row.notesOverride)return;
 const notes=row.notesOverride.map(n=>({...n}));
 notes[index].pitch=p;
 updateRow(row.target,{notes:'ours',notesOverride:notes});
}
function applyToSection(){
 const span=activeSpan.value;if(!span)return;
 plan.value={...plan.value,rows:plan.value.rows.map(row=>
  row.target>=span.start&&row.target<=span.end?{...row,notes:changesTo.value,
   // Manual protections are not silently replaced. Only an explicit range
   // operation changes them; the chosen range is visible next to the control.
   notesOverride:undefined}:row)};
}
function rowChord(row:AlignmentRow){
 if(row.theirs===null)return 'No source measure';
 const raw=props.parsed.chords[row.theirs];
 if(raw)return raw+' (explicit)';
 if(!inferred.value)return 'No explicit chords';
 const ch=chordEstimate(props.parsed,row.theirs,partIndex.value);
 return ch.chord?ch.chord+' (suggestion '+Math.round(ch.confidence*100)+'%)':'No chord estimate';
}
function rowExistingChord(row:AlignmentRow){
 return row.ours===null?'—':props.project.bars[row.ours]?.chord||'—';
}
function rowKey(row:AlignmentRow){
 if(row.theirs===null)return '—';
 const m=props.parsed.measures[row.theirs];
 return m.keyFifths===null?'Unspecified':(m.keyFifths>0?m.keyFifths+'♯':m.keyFifths<0?(-m.keyFifths)+'♭':'0 accidentals');
}
function formatConfidence(row:AlignmentRow){
 return row.theirs===null?'Unmatched':row.confidence>=.72?'Strong':row.confidence>=.44?'Review':'Uncertain';
}
function jump(delta:number){editPage.value=Math.max(0,Math.min(pageCount.value-1,editPage.value+delta));editing.value=null;}
function selectSection(value:number){selectedSection.value=value;editPage.value=Math.floor((spans.value[value]?.start??0)/pageSize);}
</script>
<template>
 <section class="xml-merge-review" aria-label="score alignment and merge preview">
  <div class="xml-merge-header"><strong>Import &amp; Align · Compare / Merge</strong><span>Preview only — no changes until Apply</span></div>
  <div class="xml-merge-stats">
    <span>{{parsed.measureCount}} incoming measures</span>
    <span>{{parsed.parts.length}} source part(s)</span>
    <span>{{project.bars.length}} existing measures</span>
    <span>{{parsed.warnings.length}} parsing warnings</span>
  </div>
  <div class="xml-merge-config">
    <label>Import mode<select v-model="mode"><option value="fit">Fit imported part to current song</option><option value="lead">Use imported part as song structure</option><option value="reference">Reference and alignment only</option></select></label>
    <label>Source score part<select v-model.number="partIndex"><option v-for="(part,i) in parsed.parts" :key="part.id" :value="i">{{part.name}} · {{part.notes.length}} notes · {{part.pitchedMeasures}} sounding measures</option></select></label>
    <label>Destination instrument<select v-model="instrument"><option v-for="inst in instruments" :key="inst" :value="inst">{{project.instrumentNames?.[inst]||inst}}</option></select></label>
    <label class="xml-merge-checkbox"><input v-model="inferred" type="checkbox"/> Propose harmony from source notes (estimated, review required)</label>
  </div>
  <p class="xml-merge-help">Use the selected source part to propose measure alignment and any available key-signature regions. Existing parts are aligned when evidence permits. A key-signature change never transposes protected notes automatically. Check every low-confidence match before applying.</p>
  <p v-if="mode==='lead'" class="xml-merge-warning">Structural change: the new song will have {{parsed.measureCount}} measures. The complete previous project, protected passages and alternate editions remain recoverable through the saved merge backup. Unmapped edits need review.</p>
  <div v-if="parsed.warnings.length" class="xml-merge-warning" role="status">Score import warnings: {{parsed.warnings.slice(0,3).join('; ')}}</div>
  <div class="xml-merge-summary" v-if="preview.result">
    <span><strong>{{preview.result.matched}}</strong> mapped measures</span>
    <span><strong>{{preview.result.uncertain}}</strong> to review</span>
    <span><strong>{{preview.result.changes}}</strong> proposed changes</span>
    <span><strong>{{preview.result.proposed.bars.length}}</strong> result measures</span>
    <span v-if="preview.result.conflicts.length"><strong>{{preview.result.conflicts.length}}</strong> warnings</span>
  </div>
  <div class="xml-merge-warning" v-if="preview.error||error" role="alert">{{preview.error||error}}</div>
  <div v-if="preview.result?.conflicts.length" class="xml-merge-conflicts"><strong>Review warnings</strong><p v-for="(warning,i) in preview.result.conflicts.slice(0,4)" :key="i">{{warning}}</p><small v-if="preview.result.conflicts.length>4">{{preview.result.conflicts.length-4}} additional warnings in preview</small></div>
  <div class="xml-merge-bulk">
    <label>Song section<select :value="selectedSection" @change="selectSection(Number(($event.target as HTMLSelectElement).value))"><option v-for="(span,i) in spans" :key="i" :value="i">{{span.name}} · {{span.start+1}}–{{span.end+1}}</option></select></label>
    <label>Apply note choice to section<select v-model="changesTo"><option value="ours">Keep ours</option><option value="theirs">Use theirs</option><option value="combine">Combine</option></select></label>
    <button class="secondary" type="button" :disabled="mode==='reference'" @click="applyToSection">Apply choice to visible section</button>
  </div>
  <div class="xml-merge-page"><button type="button" class="secondary" :disabled="editPage===0" @click="jump(-1)">Previous 10</button><span>Measures {{editPage*pageSize+1}}–{{Math.min(total,(editPage+1)*pageSize)}} of {{total}}</span><button type="button" class="secondary" :disabled="editPage>=pageCount-1" @click="jump(1)">Next 10</button></div>
  <div class="xml-merge-table-scroll">
    <table class="xml-merge-table">
      <thead><tr><th>Result</th><th>Ours</th><th>Source</th><th>Shift</th><th>Match</th><th>Notes</th><th>Harmony</th><th>Protected</th><th>Review</th></tr></thead>
      <tbody>
        <template v-for="row in rows" :key="row.target">
          <tr>
            <th scope="row">{{row.target+1}}</th>
            <td>{{row.ours===null?'—':row.ours+1}}<small>{{rowExistingChord(row)}}</small></td>
            <td><input type="number" min="1" :max="parsed.measureCount" :value="row.theirs===null?'':row.theirs+1" :aria-label="'Source measure for '+(row.target+1)" @change="sourceMeasure(row.target,($event.target as HTMLInputElement).value)"/><small>{{rowKey(row)}}</small></td>
            <td><input type="number" min="-24" max="24" step="1" :value="row.shift" :aria-label="'Transposition for measure '+(row.target+1)" @change="updateRow(row.target,{shift:Number(($event.target as HTMLInputElement).value)})"/></td>
            <td><span :class="['xml-merge-confidence',row.confidence>=.72?'strong':row.confidence>=.44?'review':'uncertain']">{{formatConfidence(row)}}</span></td>
            <td><select :disabled="mode==='reference'" :value="row.notes" :aria-label="'Notes choice for measure '+(row.target+1)" @change="updateRow(row.target,{notes:($event.target as HTMLSelectElement).value as MergeDecision,notesOverride:undefined})"><option value="ours">Ours</option><option value="theirs">Theirs</option><option value="combine">Combine</option></select><small>{{oldPartNotes(row).length}} / {{sourcePartNotes(row).length}} notes</small></td>
            <td><select :disabled="mode==='reference'" :value="row.chords" :aria-label="'Harmony choice for measure '+(row.target+1)" @change="updateRow(row.target,{chords:($event.target as HTMLSelectElement).value as MergeDecision})"><option value="ours">Ours</option><option value="theirs">Theirs</option><option value="combine">Combine</option></select><small :title="rowChord(row)">{{rowChord(row)}}</small></td>
            <td><select :disabled="mode==='reference'" :value="row.protectedAction" :aria-label="'Protected note policy for measure '+(row.target+1)" @change="updateRow(row.target,{protectedAction:($event.target as HTMLSelectElement).value as ProtectionDecision})"><option value="keep">Keep pitches</option><option value="transpose">Transpose ours</option></select></td>
            <td><button type="button" class="secondary" :disabled="row.ours===null||mode==='reference'" @click="editProtected(row)">{{editing===row.target?'Done':'Edit ours'}}</button></td>
          </tr>
          <tr v-if="editing===row.target" class="xml-merge-note-edit"><td colspan="9">
            <strong>Edit protected / existing notes · measure {{row.ours===null?'—':row.ours+1}}</strong>
            <p>These edits belong to the merge preview. Enter MIDI pitches for the selected measure; rhythms and expressive note data are retained. Applying the merge protects your edits.</p>
            <div class="xml-merge-note-list"><label v-for="(note,i) in row.notesOverride??[]" :key="i">Beat {{Number(((note.start-(row.ours??0)*project.beats)+1).toFixed(2))}} · duration {{note.duration}}<input type="number" min="0" max="127" step="1" :value="note.pitch" :aria-label="'Pitch '+(i+1)+' in measure '+(row.target+1)" @change="editPitch(row,i,($event.target as HTMLInputElement).value)"/></label><span v-if="!row.notesOverride?.length">No existing notes in this measure.</span></div>
          </td></tr>
        </template>
      </tbody>
    </table>
  </div>
  <p class="xml-merge-help">“Strong” and “Uncertain” describe automated harmonic matches only; neither is a musical correctness guarantee. Source notes and inferred harmonies are not silently forced into protected instrument parts. You can change source measures, local transposition, merge policy, or the protected note pitches before applying.</p>
  <div class="xml-merge-actions">
    <button type="button" class="secondary" @click="emit('cancel')">Cancel preview</button>
    <button v-if="mode==='reference'" type="button" class="secondary" @click="emit('reference',effectivePlan)">Save alignment reference</button>
    <button v-else type="button" class="primary" :disabled="Boolean(preview.error||error)" @click="emit('apply',effectivePlan)">Review &amp; apply merge…</button>
  </div>
 </section>
</template>
<style scoped>
.xml-merge-review{display:grid;gap:10px;min-width:0;font-size:12px}
.xml-merge-header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px}.xml-merge-header strong{font-size:15px}.xml-merge-header span{color:#eed6aa}
.xml-merge-stats,.xml-merge-summary{display:flex;flex-wrap:wrap;gap:6px}
.xml-merge-stats span,.xml-merge-summary span{background:#293b4a;border-radius:5px;border:1px solid #4d6374;padding:5px 8px}
.xml-merge-config{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}
.xml-merge-config label,.xml-merge-bulk label{display:grid;gap:3px;font-size:11px;margin:0}
.xml-merge-config select,.xml-merge-bulk select{width:100%;margin:0;min-height:36px;font-size:12px}
.xml-merge-config .xml-merge-checkbox{display:flex;align-items:center;gap:8px}.xml-merge-checkbox input{width:auto;flex:none}
.xml-merge-help,.xml-merge-warning,.xml-merge-conflicts{font-size:11px;line-height:1.5;margin:0}
.xml-merge-help{color:#beccd7}.xml-merge-warning{color:#f2d19b;background:#473a2c;padding:7px;border-radius:5px}.xml-merge-conflicts{border-left:3px solid #e6bc75;padding:6px;background:#38332e}.xml-merge-conflicts p{margin:3px 0}
.xml-merge-bulk,.xml-merge-page,.xml-merge-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
.xml-merge-bulk>label{min-width:135px;flex:1 1 160px}.xml-merge-bulk button{min-height:36px}
.xml-merge-page{justify-content:space-between;align-items:center;font-size:11px}
.xml-merge-table-scroll{max-width:100%;overflow:auto;border:1px solid #536675;border-radius:6px}
.xml-merge-table{border-collapse:separate;border-spacing:0;width:100%;min-width:830px;font-size:11px}
.xml-merge-table th,.xml-merge-table td{padding:5px;border-bottom:1px solid #435565;text-align:left;vertical-align:top}
.xml-merge-table thead th{position:sticky;top:0;z-index:2;background:#304354}
.xml-merge-table tbody th{background:#263742;font-size:12px;color:#edd5a8;min-width:40px}
.xml-merge-table td small{display:block;color:#bbcbd6;margin:4px 0;line-height:1.3;max-width:140px;overflow-wrap:anywhere}
.xml-merge-table input,.xml-merge-table select{width:100%;min-width:68px;margin:0;min-height:33px;font-size:11px;padding:4px}
.xml-merge-table td:nth-child(4){width:57px}.xml-merge-table td:nth-child(4) input{min-width:48px}
.xml-merge-table td:nth-child(8){min-width:120px}.xml-merge-table td:nth-child(9){min-width:72px}
.xml-merge-confidence{display:inline-block;padding:3px 5px;border-radius:4px;color:#ddd;font-weight:600}
.xml-merge-confidence.strong{color:#b9e7c7}.xml-merge-confidence.review{color:#efcf97}.xml-merge-confidence.uncertain{color:#f2a99d}
.xml-merge-note-edit td{background:#263540;padding:9px}.xml-merge-note-edit strong{color:#efd6b2}
.xml-merge-note-edit p{font-size:11px;margin:5px 0;color:#c4d0d8}.xml-merge-note-list{display:flex;flex-wrap:wrap;gap:7px;max-height:230px;overflow:auto}
.xml-merge-note-list label{display:grid;gap:2px;min-width:145px;font-size:11px}
.xml-merge-note-list input{width:100%;max-width:100px}
.xml-merge-actions{justify-content:flex-end}
@media(max-width:640px){.xml-merge-config{grid-template-columns:1fr}.xml-merge-bulk button{width:100%}.xml-merge-actions button{flex:1}}
</style>