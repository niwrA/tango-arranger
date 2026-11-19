<script setup lang="ts">
import {computed,ref,watch} from 'vue';
import {projectInstruments,type Project,type Role,BASS_TECHNIQUES,type ViolinTechnique} from './music';
import {createPhrasePlan,validatePhrasePlan,phrasePlanIsCurrent,plannedMeasureActive,type PhrasePlan,type PhrasePart} from './phrasePlan';
const props=defineProps<{project:Project;draft?:PhrasePlan}>();
const emit=defineEmits<{'update:draft':[plan:PhrasePlan|undefined];apply:[plan:PhrasePlan|undefined]}>();
const phraseBars=ref(props.draft?.phraseBars??props.project.phrasePlan?.phraseBars??8);
const selectedId=ref('');
const notice=ref('');
const displayed=computed(()=>props.draft??props.project.phrasePlan);
const roster=computed(()=>projectInstruments(props.project));
const errors=computed(()=>displayed.value?validatePhrasePlan(props.project,displayed.value):[]);
const current=computed(()=>!props.project.phrasePlan||phrasePlanIsCurrent(props.project,props.project.phrasePlan));
const selected=computed(()=>displayed.value?.phrases.find(p=>p.id===selectedId.value)??displayed.value?.phrases[0]);
const index=computed(()=>displayed.value?.phrases.findIndex(p=>p.id===selected.value?.id)??-1);
const roles:Role[]=['melody','harmony','chords','bass','fill','variation','rest'];
const violinTechniques:ViolinTechnique[]=['tango_staccato','arpeggio','pizzicato','pizzicato_arpeggio','double_stop','sustained','block'];
const clone=(plan:PhrasePlan):PhrasePlan=>JSON.parse(JSON.stringify(plan));
const state=computed(()=>props.draft?'Draft · not applied':props.project.phrasePlan?(current.value?'Applied':'Needs rebuilding'):'Using section settings');
const rows=computed(()=>{
  const phrase=selected.value,plan=displayed.value;
  if(!phrase||!plan)return [];
  const preview={...props.project,phrasePlan:plan};
  return roster.value.flatMap(instrument=>{
    const part=phrase.parts[instrument];if(!part)return [];
    const measures:number[]=[];
    if(!errors.value.length)for(let m=phrase.startMeasure;m<=phrase.endMeasure;m++)if(plannedMeasureActive(preview,instrument,m))measures.push(m+1);
    return [{instrument,part,measures}];
  });
});
watch(()=>displayed.value?.phraseBars,n=>{if(n!==undefined)phraseBars.value=n;});
function name(instrument:string){return props.project.instrumentNames?.[instrument]||instrument;}
function title(i:number){
  const phrase=displayed.value?.phrases[i];
  return phrase?String(i+1)+' · '+phrase.section+' · measures '+String(phrase.startMeasure+1)+'–'+String(phrase.endMeasure+1):'';
}
function proposal(){
  try{
    const draft=createPhrasePlan(props.project,Number(phraseBars.value));
    selectedId.value=draft.phrases[0]?.id??'';
    emit('update:draft',draft);
    notice.value='Proposal ready to edit. The arrangement changes only when you apply it.';
  }catch(error){notice.value=String(error);}
}
function edit(){
  if(!props.project.phrasePlan)return;
  emit('update:draft',clone(props.project.phrasePlan));
  notice.value='Editing a draft. Existing notes are unchanged.';
}
function move(delta:number){const target=displayed.value?.phrases[index.value+delta];if(target)selectedId.value=target.id;}
function update<K extends keyof PhrasePart>(instrument:string,key:K,value:PhrasePart[K]){
  if(!props.draft||!selected.value)return;
  const draft=clone(props.draft),part=draft.phrases.find(p=>p.id===selected.value?.id)?.parts[instrument];
  if(!part)return;
  if(value===undefined)delete part[key];else part[key]=value;
  emit('update:draft',draft);
  notice.value='Draft changed. Apply when ready.';
}
function activity(instrument:string,event:Event){
  const field=event.target as HTMLInputElement;
  const value=field.valueAsNumber;if(!Number.isFinite(value))return;
  const bounded=Math.max(0,Math.min(100,value));field.value=String(bounded);
  update(instrument,'activity',bounded/100);
}
function measures(values:number[]):string{
  if(!values.length)return 'None';
  const out:string[]=[];
  for(let i=0;i<values.length;i++){
    const start=values[i];let end=start;
    while(i+1<values.length&&values[i+1]===end+1)end=values[++i];
    out.push(start===end?String(start):String(start)+'–'+String(end));
  }
  return out.join(', ');
}
function apply(){
  if(props.draft&&!errors.value.length){emit('apply',clone(props.draft));notice.value='';}
}
</script>
<template>
  <details class="phrase-planner">
    <summary><strong>Phrase planner</strong><span class="phrase-state" :class="{draft:Boolean(draft),invalid:!current}">{{state}}</span></summary>
    <div class="phrase-body">
      <p class="phrase-hint">Plan musical roles, active measures, silence and techniques across each multi-measure phrase. Proposals respect song sections and instrument settings. Review the draft before applying it.</p>
      <div class="phrase-tools">
        <label>Measures per phrase<input v-model.number="phraseBars" type="number" min="1" max="32" step="1" inputmode="numeric" aria-label="Measures per phrase"/></label>
        <button type="button" class="secondary" @click="proposal">{{draft?'Rebuild proposal':'Create proposal'}}</button>
        <button v-if="project.phrasePlan&&!draft" type="button" class="secondary" @click="edit">Edit applied plan</button>
        <button v-if="project.phrasePlan" type="button" class="secondary" @click="emit('apply',undefined);notice=''">Use section settings</button>
      </div>
      <p v-if="!current" class="phrase-warning" role="status">The song form or instrument roster changed. The old plan is inactive; rebuild it before applying.</p>
      <template v-if="displayed&&selected">
        <div class="phrase-navigation">
          <button type="button" class="secondary" :disabled="index<=0" aria-label="Previous phrase" @click="move(-1)">←</button>
          <label>Phrase<select :value="selected.id" aria-label="Selected phrase" @change="selectedId=($event.target as HTMLSelectElement).value"><option v-for="(phrase,i) in displayed.phrases" :key="phrase.id" :value="phrase.id">{{title(i)}}</option></select></label>
          <button type="button" class="secondary" :disabled="index>=displayed.phrases.length-1" aria-label="Next phrase" @click="move(1)">→</button>
          <span class="phrase-count">{{displayed.phrases.length}} phrases · {{project.bars.length}} measures</span>
        </div>
        <div class="phrase-table-wrap">
          <table class="phrase-table">
            <caption class="sr-only">Settings for {{title(index)}}</caption>
            <thead><tr><th>Instrument</th><th>Role</th><th>Activity</th><th>Placement</th><th>Articulation</th><th>Technique</th></tr></thead>
            <tbody>
              <tr v-for="row in rows" :key="row.instrument">
                <th scope="row">{{name(row.instrument)}}<small class="phrase-measures">Active measures: {{errors.length?'Review plan':measures(row.measures)}}</small></th>
                <td><label><span class="phrase-mobile-label">Role</span><select :disabled="!draft" :value="row.part.role" :aria-label="'Phrase role for '+name(row.instrument)" @change="update(row.instrument,'role',($event.target as HTMLSelectElement).value as Role)"><option v-for="role in roles" :key="role" :value="role">{{role}}</option></select></label></td>
                <td><label><span class="phrase-mobile-label">Activity</span><span class="phrase-percent"><input :disabled="!draft" :value="Math.round(row.part.activity*100)" type="number" min="0" max="100" step="1" inputmode="numeric" :aria-label="'Phrase activity for '+name(row.instrument)" @change="activity(row.instrument,$event)"/><span>%</span></span></label></td>
                <td><label><span class="phrase-mobile-label">Placement</span><select :disabled="!draft" :value="row.part.placement" :aria-label="'Phrase placement for '+name(row.instrument)" @change="update(row.instrument,'placement',($event.target as HTMLSelectElement).value as PhrasePart['placement'])"><option value="opening">Opening</option><option value="closing">Closing</option><option value="throughout">Throughout</option></select></label></td>
                <td><label><span class="phrase-mobile-label">Articulation</span><select :disabled="!draft" :value="row.part.articulation??''" :aria-label="'Phrase articulation for '+name(row.instrument)" @change="update(row.instrument,'articulation',(($event.target as HTMLSelectElement).value||undefined) as PhrasePart['articulation'])"><option value="">Inherit</option><option value="marcato_staccato">Marcato</option><option value="staccato">Staccato</option><option value="legato">Legato</option></select></label></td>
                <td>
                  <label v-if="row.instrument.startsWith('Violin')"><span class="phrase-mobile-label">Technique</span><select :disabled="!draft" :value="row.part.violinTechnique??''" :aria-label="'Phrase technique for '+name(row.instrument)" @change="update(row.instrument,'violinTechnique',(($event.target as HTMLSelectElement).value||undefined) as PhrasePart['violinTechnique'])"><option value="">Inherit</option><option v-for="tech in violinTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label>
                  <label v-else-if="row.instrument.startsWith('Contrabass')"><span class="phrase-mobile-label">Technique</span><select :disabled="!draft" :value="row.part.bassTechnique??''" :aria-label="'Phrase technique for '+name(row.instrument)" @change="update(row.instrument,'bassTechnique',(($event.target as HTMLSelectElement).value||undefined) as PhrasePart['bassTechnique'])"><option value="">Inherit</option><option v-for="tech in BASS_TECHNIQUES" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label>
                  <span v-else class="phrase-no-technique">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="phrase-footnote">Activity selects how many measures sound within the phrase; placement chooses where they fall. Explicit measure overrides and protected notes take precedence.</p>
        <ul v-if="errors.length" class="phrase-warning" role="alert"><li v-for="error in errors.slice(0,4)" :key="error">{{error}}</li></ul>
        <div v-if="draft" class="phrase-actions">
          <button type="button" class="primary" :disabled="errors.length>0" @click="apply">Apply phrase plan</button>
          <button type="button" class="secondary" @click="emit('update:draft',undefined)">Discard draft</button>
          <span>Active difficulty editions are updated; saved alternatives remain intact.</span>
        </div>
      </template>
      <p v-if="notice" class="phrase-notice" role="status">{{notice}}</p>
    </div>
  </details>
</template>
<style scoped>
.phrase-planner{border:1px solid #556472;border-radius:7px;margin:0 0 9px;background:#202d38;min-width:0}
.phrase-planner>summary{padding:8px 10px;cursor:pointer;font-size:13px}
.phrase-state{margin-left:10px;color:#b8c9d5;font-size:11px;font-weight:400}.phrase-state.draft{color:#f3cf94}.phrase-state.invalid,.phrase-warning{color:#ffd29a}
.phrase-body{padding:0 8px 10px}.phrase-hint,.phrase-footnote,.phrase-notice,.phrase-warning{font-size:12px;line-height:1.5;margin:8px 0}
.phrase-hint,.phrase-footnote{color:#bdcbd6}.phrase-notice{color:#e6c593}
.phrase-tools,.phrase-navigation,.phrase-actions{display:flex;gap:6px 9px;align-items:flex-end;flex-wrap:wrap;margin:8px 0}.phrase-tools>label{width:145px}.phrase-tools label,.phrase-navigation label{font-size:11px;margin:0;display:grid;gap:4px}
.phrase-tools input,.phrase-navigation select{margin:0;min-height:36px}.phrase-navigation{padding-top:6px;border-top:1px solid #435361}.phrase-navigation>label{min-width:160px;max-width:400px;flex:1}.phrase-count{font-size:11px;color:#b8c9d5;align-self:center}
.phrase-table-wrap{overflow:auto;width:100%;border:1px solid #435361;border-radius:6px}.phrase-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px}
.phrase-table th,.phrase-table td{padding:7px;border-bottom:1px solid #3c4b58;vertical-align:top;text-align:left}.phrase-table thead{background:#293a47;color:#cbd9e2}.phrase-table thead th:first-child{width:23%}.phrase-table tbody tr:last-child>*{border-bottom:0}.phrase-table tbody th{color:#f0dfc5}
.phrase-table label{margin:0;display:block}.phrase-table select,.phrase-table input{width:100%;min-width:0;margin:0;padding:6px;font-size:12px;min-height:36px}.phrase-table select:disabled,.phrase-table input:disabled{opacity:1;background:#293743;color:#c8d4dd}
.phrase-measures{display:block;margin-top:4px;font-size:10px;font-weight:400;color:#b8c9d5;overflow-wrap:anywhere}.phrase-percent{display:flex;gap:4px;align-items:center}.phrase-percent input{min-width:0}.phrase-percent>span{font-size:11px;color:#b8c9d5}.phrase-mobile-label{display:none}.phrase-no-technique{display:block;padding:8px;color:#879ba9}
.phrase-actions>span{font-size:11px;color:#bdcbd6;flex:1 1 230px}
@media(max-width:800px){.phrase-table,.phrase-table tbody{display:block}.phrase-table thead{position:absolute;width:1px;height:1px;overflow:hidden}.phrase-table tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:7px;gap:7px;border-bottom:1px solid #435361}.phrase-table tbody tr:last-child{border-bottom:0}.phrase-table th,.phrase-table td{display:block;padding:0;border:0;min-width:0}.phrase-table tbody th{grid-column:1/-1}.phrase-mobile-label{display:block;font-size:10px;color:#b8c9d5}.phrase-table select,.phrase-table input{min-height:40px}.phrase-count{width:100%}}
</style>