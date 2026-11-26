<script setup lang="ts">
import {computed,ref} from 'vue';
import {projectInstruments,type Project} from './music';
import {ensemblePreview,suggestEnsembleInstrument,type EnsembleSource} from './ensembleImport';
import type {ParsedMusicXml} from './musicXmlImport';
const props=defineProps<{project:Project;files:{name:string;parsed:ParsedMusicXml}[]}>();
const emit=defineEmits<{apply:[project:Project];cancel:[]}>();
const roster=projectInstruments(props.project);
const sources=ref<EnsembleSource[]>(props.files.flatMap(file=>file.parsed.parts.map((part,partIndex)=>({name:file.name,parsed:file.parsed,partIndex,instrument:suggestEnsembleInstrument(file.name+' '+part.name,roster)}))));
const reference=ref(Math.max(0,sources.value.findIndex(s=>s.instrument.startsWith('Piano'))));
const infer=ref(false),fill=ref(false),review=ref(false),confirmed=ref(false);
const overrides=ref<Record<string,number|null>>({});
const preview=computed(()=>{try{return {result:ensemblePreview(props.project,sources.value,reference.value,infer.value,fill.value,overrides.value),error:''};}catch(e){return {result:null,error:String(e)};}});
function invalidate(){confirmed.value=false;overrides.value={};}
function edit(index:number,target:number,event:Event){const raw=(event.target as HTMLInputElement).value;overrides.value={...overrides.value,[index+':'+target]:raw===''?null:Number(raw)-1};confirmed.value=false;}
</script>
<template>
 <section class="ensemble-import">
  <h3>Import ensemble score</h3>
  <p>Assign each source part to an instrument. All files are imported together and can be undone together.</p>
  <div v-for="(source,index) in sources" :key="index" class="ensemble-source">
   <strong>{{source.name}} · {{source.parsed.parts[source.partIndex].name}}</strong>
   <small>{{source.parsed.parts[source.partIndex].measureCount}} measures · {{source.parsed.parts[source.partIndex].notes.length}} notes</small>
   <label>Destination instrument<select v-model="source.instrument" @change="invalidate"><option value="">Choose instrument</option><option v-for="inst in roster" :key="inst" :value="inst">{{project.instrumentNames?.[inst]||inst}}</option></select></label>
  </div>
  <label>Reference score<select v-model.number="reference" @change="invalidate"><option v-for="(source,index) in sources" :key="index" :value="index">{{source.name}} · {{source.instrument||source.parsed.parts[source.partIndex].name}}</option></select></label>
  <label><input v-model="infer" type="checkbox" @change="confirmed=false"/> Infer missing harmony from combined parts (estimates)</label>
  <label><input v-model="fill" type="checkbox" @change="confirmed=false"/> Generate missing upper-staff chords using available harmony</label>
  <p v-if="preview.error" role="alert">{{preview.error}}</p>
  <template v-if="preview.result">
   <p>{{preview.result.project.bars.length}} result measures. {{preview.result.blank?'Reference defines the blank song structure.':'Existing song structure retained; assigned instruments will be replaced in mapped measures.'}}</p>
   <div v-for="(entry,index) in preview.result.mappings" :key="index">
    <strong>{{entry.source.instrument}}</strong> · {{entry.mapping.filter(m=>m!==null).length}} mapped · {{entry.uncertain.length}} to review · {{entry.omitted.length}} omitted source measures
   </div>
   <p>{{preview.result.inferred.length}} estimated chord symbols. Generated accompaniment: {{Object.values(preview.result.completed).reduce((sum,items)=>sum+items.length,0)}} measures.</p>
   <button type="button" class="secondary" @click="review=!review">{{review?'Hide mappings':'Review / correct measure mappings'}}</button>
   <div v-if="review" class="ensemble-mappings">
    <div v-for="(entry,index) in preview.result.mappings" :key="index">
     <h4>{{entry.source.instrument}}</h4>
     <label v-for="(mapped,target) in entry.mapping" :key="target">Song M{{target+1}} <span v-if="entry.uncertain.includes(target)">· review</span><input type="number" min="1" :max="entry.source.parsed.parts[entry.source.partIndex].measureCount" :value="mapped===null?'':mapped+1" @change="edit(index,target,$event)"/></label>
     <p v-if="entry.omitted.length">Omitted source measures: {{entry.omitted.map(m=>m+1).join(', ')}}</p>
    </div>
   </div>
   <label><input v-model="confirmed" type="checkbox"/> I reviewed alignment, omitted measures and replacement of assigned parts.</label>
  </template>
  <div class="ensemble-actions"><button type="button" class="secondary" @click="emit('cancel')">Cancel</button><button type="button" class="primary" :disabled="!preview.result||!confirmed" @click="preview.result&&emit('apply',preview.result.project)">Import ensemble</button></div>
 </section>
</template>
<style scoped>
.ensemble-import{display:grid;gap:10px;min-width:0}.ensemble-source{display:grid;gap:4px;padding:8px;border:1px solid #526c7d;border-radius:8px}.ensemble-source small{color:#b6cad7}.ensemble-mappings{max-height:35dvh;overflow:auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px}.ensemble-mappings label{display:flex;align-items:center;justify-content:space-between;gap:4px}.ensemble-mappings input{width:65px}.ensemble-actions{display:flex;justify-content:flex-end;gap:8px}
</style>
