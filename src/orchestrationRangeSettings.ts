import {defaultArticulation,type Articulation,type BassTechnique,type Instrument,type Project,type Role,type ViolinTechnique} from './music';

export type RangeSettings={
 role:Role|'inherit';
 articulation:Articulation;
 violin:ViolinTechnique|'inherit';
 bass:BassTechnique|'inherit';
};
export type RangeSettingField=keyof RangeSettings;
export type RangeSettingsView={ [K in RangeSettingField]:RangeSettings[K]|'mixed' };

export function orchestrationMeasureRange(count:number,first:number,last:number):[number,number]|null{
 if(count<1||!Number.isFinite(first)||!Number.isFinite(last))return null;
 const start=Math.max(0,Math.min(count-1,Math.floor(first)-1));
 return [start,Math.max(start,Math.min(count-1,Math.floor(last)-1))];
}

function common<T extends string>(start:number,end:number,value:(index:number)=>T):T|'mixed'{
 const first=value(start);
 for(let i=start+1;i<=end;i++)if(value(i)!==first)return 'mixed';
 return first;
}

export function readOrchestrationRangeSettings(p:Project,inst:Instrument,start:number,end:number):RangeSettingsView{
 const key=(i:number)=>`${inst}:${i}`;
 return {
  role:common(start,end,i=>p.measureRoles?.[key(i)]??'inherit'),
  articulation:common(start,end,i=>p.articulation?.overrides[key(i)]??'auto'),
  violin:common(start,end,i=>p.measureViolinTechniques?.[key(i)]??'inherit'),
  bass:common(start,end,i=>p.measureBassTechniques?.[key(i)]??'inherit'),
 };
}

/** Only explicitly edited properties are written. An untouched form never copies
 * one bar's overrides onto its neighbors, or clears mixed/protected ranges. */
export function applyOrchestrationRangeSettings(p:Project,inst:Instrument,start:number,end:number,values:RangeSettingsView,touched:ReadonlySet<RangeSettingField>):boolean{
 let changed=false;
 function write<T extends string>(existing:Record<string,T>|undefined,key:string,value:T|undefined,initialize:()=>Record<string,T>){
  if(existing?.[key]===value)return;
  if(value===undefined){if(existing)delete existing[key];}
  else (existing??initialize())[key]=value;
  changed=true;
 }
 for(let i=start;i<=end;i++){
  const key=`${inst}:${i}`;
  if(touched.has('role')&&values.role!=='mixed')
   write(p.measureRoles,key,values.role==='inherit'?undefined:values.role,()=>p.measureRoles??={});
  if(touched.has('articulation')&&values.articulation!=='mixed'&&(inst.startsWith('Violin')||inst.startsWith('Bandoneon')))
   write(p.articulation?.overrides,key,values.articulation==='auto'?undefined:values.articulation,
    ()=>(p.articulation??=defaultArticulation()).overrides);
  if(touched.has('violin')&&values.violin!=='mixed'&&inst.startsWith('Violin'))
   write(p.measureViolinTechniques,key,values.violin==='inherit'?undefined:values.violin,()=>p.measureViolinTechniques??={});
  if(touched.has('bass')&&values.bass!=='mixed'&&inst==='Contrabass')
   write(p.measureBassTechniques,key,values.bass==='inherit'?undefined:values.bass,()=>p.measureBassTechniques??={});
 }
 return changed;
}
