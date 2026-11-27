import {dynamicsCurves,dynamicsProgress,type DynamicsCurve} from './dynamicsCurve';
import {DYNAMIC_MARKS,projectInstruments,type DynamicMark,type ExpressionRange,type Instrument,type Project} from './music';

export type MeasureDynamicEdit={instrument:Instrument;measure:number;endpoint:'start'|'end';mark?:DynamicMark};
type HairpinEdit={kind:'insert';range:ExpressionRange}|{kind:'update';index:number;range:ExpressionRange}|{kind:'delete';index:number};
export type TimelineDynamicsEdit={marks?:readonly MeasureDynamicEdit[];hairpins?:readonly HairpinEdit[];description:string};
export type DynamicsShape='crescendo'|'diminuendo'|'swell'|'constant';

export function hairpinAtBeats(project:Project,instrument:Instrument,start:number,end:number,from:number,to:number,curve:DynamicsCurve):ExpressionRange{
 const {beats}=project,endMeasure=Math.min(project.bars.length-1,Math.floor(end/beats));
 return {instrument,startMeasure:Math.floor(start/beats),startBeat:start%beats,endMeasure,endBeat:end-endMeasure*beats,from,to,curve};
}

export function timelineShape(project:Project,targets:ReadonlyMap<number,readonly Instrument[]>,shape:DynamicsShape,mark:DynamicMark,curve:DynamicsCurve):TimelineDynamicsEdit{
 const description=shape==='constant'?'Set '+mark:shape==='swell'?'Shape swell':shape==='crescendo'?'Shape crescendo':'Shape diminuendo';
 if(shape==='constant')return {description,marks:[...targets].flatMap(([measure,instruments])=>instruments.map(instrument=>({instrument,measure,endpoint:'start',mark})))};
 const velocities={ppp:24,pp:36,p:48,mp:64,mf:80,f:96,ff:112,fff:124};
 const bars=[...targets.keys()].sort((a,b)=>a-b),{beats}=project;
 const first=bars[0]*beats,last=(bars[bars.length-1]+1)*beats,mid=(first+last)/2;
 const base=velocities[mark],quiet=Math.max(1,base-(shape==='swell'?25:35)),loud=Math.min(127,base+(shape==='swell'?25:30));
 const ramps=shape==='swell'?[[first,mid,quiet,loud],[mid,last,loud,quiet]]:
  [[first,last,shape==='diminuendo'?loud:quiet,shape==='diminuendo'?quiet:loud]];
 const instruments=new Set([...targets.values()].flat());
 const hairpins:HairpinEdit[]=[];
 for(const instrument of instruments){
  let segmentStart:number|undefined;
  for(let bar=bars[0];bar<=bars[bars.length-1]+1;bar++){
   if(targets.get(bar)?.includes(instrument)){segmentStart??=bar;continue;}
   if(segmentStart===undefined)continue;
   for(const [fromBeat,toBeat,from,to] of ramps){
    const start=Math.max(fromBeat,segmentStart*beats),end=Math.min(toBeat,bar*beats);
    if(end<=start)continue;
    const valueAt=(beat:number)=>Math.round(from+(to-from)*dynamicsProgress((beat-fromBeat)/(toBeat-fromBeat),curve));
    hairpins.push({kind:'insert',range:hairpinAtBeats(project,instrument,start,end,valueAt(start),valueAt(end),curve)});
   }
   segmentStart=undefined;
  }
 }
 return {description,hairpins};
}

export function validateHairpin(project:Project,range:ExpressionRange){
 const {startMeasure,endMeasure,instrument,from,to,curve}=range;
 const {beats}=project,startBeat=range.startBeat??0,endBeat=range.endBeat??beats;
 const count=project.bars.length;
 if(!projectInstruments(project).includes(instrument)||!Number.isInteger(startMeasure)||!Number.isInteger(endMeasure)||
  startMeasure<0||endMeasure<startMeasure||endMeasure>=count||!Number.isFinite(startBeat)||!Number.isFinite(endBeat)||
  startBeat<0||startBeat>=beats||endBeat<0||endBeat>beats||startMeasure*beats+startBeat>=endMeasure*beats+endBeat||
  ![from,to].every(value=>Number.isInteger(value)&&value>=1&&value<=127)||
  (curve!==undefined&&!dynamicsCurves.some(item=>item.id===curve)))throw Error('Invalid hairpin endpoints, velocities or curve');
}

export function editTimelineDynamics(project:Project,edit:TimelineDynamicsEdit){
 const measures=new Set<number>(),roster=new Set(projectInstruments(project));
 const marks={...project.measureDynamics},ranges=[...(project.expressionRanges??[])];
 for(const change of edit.marks??[]){
  const {instrument,measure,endpoint,mark}=change;
  if(!roster.has(instrument)||!project.bars[measure]||!['start','end'].includes(endpoint)||
   (mark!==undefined&&!DYNAMIC_MARKS.includes(mark)))throw Error('Invalid dynamic marking');
  const key=`${instrument}:${measure}`,current=marks[key]??{};
  if(current[endpoint]===mark)continue;
  const changed={...current};
  if(mark)changed[endpoint]=mark;else delete changed[endpoint];
  if(changed.start||changed.end)marks[key]=changed;else delete marks[key];
  measures.add(measure);
 }
 const touch=(range:ExpressionRange)=>{
  for(let bar=range.startMeasure;bar<=range.endMeasure;bar++)measures.add(bar);
 };
 for(const change of edit.hairpins??[]){
  if(change.kind!=='delete'){validateHairpin(project,change.range);touch(change.range);}
  if(change.kind==='insert'){ranges.push({...change.range});continue;}
  const current=ranges[change.index];
  if(!current)throw Error('The edited hairpin changed');
  touch(current);
  if(change.kind==='delete')ranges.splice(change.index,1);else ranges[change.index]={...change.range};
 }
 if(!measures.size)throw Error('No dynamic markings changed');
 return {project:{...project,measureDynamics:marks,expressionRanges:ranges},affectedMeasures:[...measures].sort((a,b)=>a-b)};
}
