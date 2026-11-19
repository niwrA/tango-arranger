/** Shared phrase-level orchestration, separate from editable instrument notes.
 * Heuristic defaults are reviewable and explicitly opt-in for older songs. */
import type {Articulation,BassTechnique,Instrument,Project,Role,ViolinTechnique} from './music';

export type PhrasePlacement='opening'|'closing'|'throughout';
export type PhrasePart={
  role:Role;activity:number;placement:PhrasePlacement;
  articulation?:Exclude<Articulation,'auto'>;
  violinTechnique?:ViolinTechnique;
  bassTechnique?:BassTechnique;
};
export type Phrase={id:string;section:string;startMeasure:number;endMeasure:number;parts:Record<Instrument,PhrasePart>};
export type PhrasePlan={version:1;phraseBars:number;formSignature:string;phrases:Phrase[]};

type Base=Pick<Project,'bars'|'beats'|'instruments'>;
type WithPlan=Base&Pick<Project,'phrasePlan'>;
type WithRoles=WithPlan&Pick<Project,'roles'|'measureRoles'>;
const roles:readonly Role[]=['melody','harmony','chords','bass','fill','variation','rest'];
const arts=['marcato_staccato','staccato','legato'];
const violinTechs=['tango_staccato','arpeggio','pizzicato','pizzicato_arpeggio','double_stop','sustained','block'];
const bassTechs=['traditional','pizzicato','arco_legato','marcato','walking','habanera'];
const factory=['Piano','Contrabass','Violin I','Violin II','Bandoneon I','Bandoneon II','Voice'];
const roster=(p:Base):readonly Instrument[]=>p.instruments?.length?p.instruments:factory;
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const defaultActivity=(inst:string,v?:number)=>Number.isFinite(v)?Math.max(0,Math.min(1,v!)):(inst.startsWith('Voice')?0:0.9);

/** Changes to meter, song-section sequence or the roster invalidate bounds. */
export function phraseFormSignature(p:Base):string{
  return JSON.stringify([p.beats,p.bars.map(bar=>bar.section),roster(p)]);
}
export function createPhrasePlan(p:Project,phraseBars=8):PhrasePlan{
  if(!Number.isInteger(phraseBars)||phraseBars<1||phraseBars>32)throw Error('Phrase length must be 1–32 measures');
  const phrases:Phrase[]=[];
  for(let start=0;start<p.bars.length;){
    const section=p.bars[start].section;
    let end=start;
    while(end+1<p.bars.length&&end-start+1<phraseBars&&p.bars[end+1].section===section)end++;
    const parts:Record<Instrument,PhrasePart>={};
    for(const inst of roster(p)){
      const role=p.roles[section]?.[inst]??'rest';
      const part:PhrasePart={role,activity:defaultActivity(inst,p.instrumentSettings?.[inst]?.activity),
        placement:role==='fill'?'closing':role==='melody'||role==='variation'?'opening':'throughout'};
      if(inst.startsWith('Violin'))part.violinTechnique=p.orchestration?.violin?.[section]?.[inst as 'Violin I'|'Violin II']??'tango_staccato';
      if(inst.startsWith('Contrabass'))part.bassTechnique=p.orchestration?.contrabass?.[section]??'traditional';
      parts[inst]=part;
    }
    phrases.push({id:'phrase-'+(start+1)+'-'+(end+1),section,startMeasure:start,endMeasure:end,parts});
    start=end+1;
  }
  return {version:1,phraseBars,formSignature:phraseFormSignature(p),phrases};
}
/** Imported or edited plans must be complete, contiguous and roster-consistent. */
export function validatePhrasePlan(p:Base,plan:PhrasePlan):string[]{
  const errors:string[]=[];
  if(!record(plan))return ['Phrase plan is not an object'];
  if(plan.version!==1)errors.push('Unsupported phrase-plan version');
  if(!Number.isInteger(plan.phraseBars)||plan.phraseBars<1||plan.phraseBars>32)errors.push('Phrase length must be 1–32 measures');
  if(plan.formSignature!==phraseFormSignature(p))errors.push('Song form, meter or instrument roster changed; rebuild the phrase plan');
  if(!Array.isArray(plan.phrases))return [...errors,'Phrase list is missing'];
  if(plan.phrases.length>p.bars.length)return [...errors,'More phrases than measures'];
  let next=0;const ids=new Set<string>();
  for(const [i,phrase] of plan.phrases.entries()){
    const label='Phrase '+(i+1);
    if(!record(phrase)){errors.push(label+' is invalid');continue;}
    if(typeof phrase.id!=='string'||!phrase.id||ids.has(phrase.id))errors.push(label+' must have a unique ID');
    else ids.add(phrase.id);
    if(!Number.isInteger(phrase.startMeasure)||!Number.isInteger(phrase.endMeasure)||phrase.startMeasure!==next||phrase.endMeasure<phrase.startMeasure||phrase.endMeasure>=p.bars.length){
      errors.push(label+' has a gap, overlap or out-of-range endpoint');
    }else{
      if(p.bars.slice(phrase.startMeasure,phrase.endMeasure+1).some(bar=>bar.section!==phrase.section))errors.push(label+' crosses a section');
      next=phrase.endMeasure+1;
    }
    if(!record(phrase.parts)){errors.push(label+' is missing parts');continue;}
    for(const inst of roster(p)){
      const part=phrase.parts[inst];
      if(!record(part)){errors.push(label+': missing '+inst);continue;}
      if(!roles.includes(part.role))errors.push(label+': bad role for '+inst);
      if(!Number.isFinite(part.activity)||part.activity<0||part.activity>1)errors.push(label+': invalid activity for '+inst);
      if(!['opening','closing','throughout'].includes(part.placement))errors.push(label+': invalid placement for '+inst);
      if(part.articulation!==undefined&&!arts.includes(part.articulation))errors.push(label+': invalid articulation for '+inst);
      if(part.violinTechnique!==undefined&&(!inst.startsWith('Violin')||!violinTechs.includes(part.violinTechnique)))errors.push(label+': invalid violin technique for '+inst);
      if(part.bassTechnique!==undefined&&(!inst.startsWith('Contrabass')||!bassTechs.includes(part.bassTechnique)))errors.push(label+': invalid bass technique for '+inst);
    }
    for(const inst of Object.keys(phrase.parts))if(!roster(p).includes(inst))errors.push(label+': removed instrument '+inst);
  }
  if(next!==p.bars.length)errors.push('The plan must cover every measure exactly once');
  return errors;
}
export const phrasePlanIsCurrent=(p:Base,plan:PhrasePlan):boolean=>validatePhrasePlan(p,plan).length===0;
/** Validate once per generation, then read entries by measure. */
export function phraseMeasureMap(p:WithPlan):(Phrase|null)[]{
  const map:(Phrase|null)[]=Array(p.bars.length).fill(null);
  if(!p.phrasePlan||!phrasePlanIsCurrent(p,p.phrasePlan))return map;
  for(const phrase of p.phrasePlan.phrases)for(let i=phrase.startMeasure;i<=phrase.endMeasure;i++)map[i]=phrase;
  return map;
}
export function phraseAt(p:WithPlan,measure:number):Phrase|undefined{
  if(!Number.isInteger(measure)||measure<0||measure>=p.bars.length||!p.phrasePlan||!phrasePlanIsCurrent(p,p.phrasePlan))return undefined;
  return p.phrasePlan.phrases.find(x=>x.startMeasure<=measure&&x.endMeasure>=measure);
}
const partAt=(p:WithPlan,inst:Instrument,measure:number,phrase?:Phrase|null):PhrasePart|undefined=>
 (phrase===undefined?phraseAt(p,measure):phrase)?.parts[inst];
export function effectiveRole(p:WithRoles,inst:Instrument,measure:number,phrase?:Phrase|null):Role{
  return p.measureRoles?.[inst+':'+measure]??partAt(p,inst,measure,phrase)?.role??p.roles[p.bars[measure]?.section]?.[inst]??'rest';
}
export function effectiveActivity(p:WithPlan&Pick<Project,'instrumentSettings'>,inst:Instrument,measure:number,phrase?:Phrase|null):number{
  return partAt(p,inst,measure,phrase)?.activity??defaultActivity(inst,p.instrumentSettings?.[inst]?.activity);
}
export function plannedArticulation(p:WithPlan,inst:Instrument,measure:number,phrase?:Phrase|null):Exclude<Articulation,'auto'>|undefined{
  return partAt(p,inst,measure,phrase)?.articulation;
}
export function effectiveViolinTechnique(p:WithPlan&Pick<Project,'measureViolinTechniques'|'orchestration'>,inst:Instrument,measure:number,phrase?:Phrase|null):ViolinTechnique{
  return p.measureViolinTechniques?.[inst+':'+measure]??partAt(p,inst,measure,phrase)?.violinTechnique??p.orchestration?.violin?.[p.bars[measure]?.section]?.[inst as 'Violin I'|'Violin II']??'tango_staccato';
}
export function effectiveBassTechnique(p:WithPlan&Pick<Project,'measureBassTechniques'|'orchestration'>,inst:Instrument,measure:number,phrase?:Phrase|null):BassTechnique{
  return p.measureBassTechniques?.[inst+':'+measure]??partAt(p,inst,measure,phrase)?.bassTechnique??p.orchestration?.contrabass?.[p.bars[measure]?.section]??'traditional';
}
/** A deliberately configured measure overrides phrase rests/placement. */
export function plannedMeasureActive(p:WithRoles,inst:Instrument,measure:number,provided?:Phrase|null):boolean|undefined{
  const phrase=provided===undefined?phraseAt(p,measure):provided;
  const part=phrase?.parts[inst];if(!phrase||!part)return undefined;
  const explicit=p.measureRoles?.[inst+':'+measure];
  if(explicit!==undefined)return explicit!=='rest';
  if(part.role==='rest')return false;
  const length=phrase.endMeasure-phrase.startMeasure+1;
  const count=Math.round(part.activity*length),offset=measure-phrase.startMeasure;
  if(count<=0)return false;
  if(count>=length)return true;
  if(part.placement==='opening')return offset<count;
  if(part.placement==='closing')return offset>=length-count;
  if(count===1)return offset===Math.floor((length-1)/2);
  for(let i=0;i<count;i++)if(offset===Math.round(i*(length-1)/(count-1)))return true;
  return false;
}
