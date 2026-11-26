import {assembleEditionScore,snapshotActiveEditions} from './editions';
import {blankProject,projectInstruments,type Project,type Note,type Instrument} from './music';
import {createMergePlan,previewMerge,chordEstimate,completeMissingAccompaniment,accompanimentInstrument} from './musicXmlMerge';
import type {ParsedMusicXml,XmlPart,XmlMeasure} from './musicXmlImport';
export type EnsembleSource={name:string;parsed:ParsedMusicXml;partIndex:number;instrument:Instrument};
type Feature={measure:XmlMeasure;hist:number[];notes:Note[]};
function features(parsed:ParsedMusicXml,part:XmlPart):Feature[]{
 return parsed.measures.slice(0,part.measureCount).map(measure=>{
  const notes=part.notes.filter(n=>n.start>=measure.offset-1e-7&&n.start<measure.offset+measure.beats-1e-7);
  const hist=Array(12).fill(0) as number[];
  for(const n of notes)hist[((n.pitch%12)+12)%12]+=Math.min(n.duration,2);
  return {measure,hist,notes};
 });
}
function similarity(a:Feature,b:Feature){
 if(Math.abs(a.measure.beats-b.measure.beats)>1e-6)return -3;
 let score=.25;
 if(a.measure.keyFifths!==null&&b.measure.keyFifths!==null)score+=a.measure.keyFifths===b.measure.keyFifths?.65:-.65;
 if(a.measure.rehearsal&&b.measure.rehearsal)score+=a.measure.rehearsal===b.measure.rehearsal?1.5:-1;
 const sumA=a.hist.reduce((s,n)=>s+n,0),sumB=b.hist.reduce((s,n)=>s+n,0);
 if(sumA&&sumB){
  let fit=0;
  for(let i=0;i<12;i++)for(let j=0;j<12;j++){
   const interval=(j-i+12)%12;
   fit+=a.hist[i]*b.hist[j]*([0,3,4,5,7,8,9].includes(interval)?1:-.5);
  }
  score+=fit/(sumA*sumB);
 }
 return score;
}
/** Global sequence alignment with gaps, never automatic pitch transposition. */
export function alignEnsembleMeasures(reference:ParsedMusicXml,refPart:XmlPart,source:ParsedMusicXml,sourcePart:XmlPart){
 const a=features(reference,refPart),b=features(source,sourcePart),w=b.length+1;
 const dp=new Float64Array((a.length+1)*w),steps=new Uint8Array(dp.length),gap=-.85;
 for(let i=1;i<=a.length;i++){dp[i*w]=i*gap;steps[i*w]=2;}
 for(let j=1;j<=b.length;j++){dp[j]=j*gap;steps[j]=3;}
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  const k=i*w+j,match=dp[k-w-1]+similarity(a[i-1],b[j-1]),drop=dp[k-w]+gap,extra=dp[k-1]+gap;
  if(match>=drop&&match>=extra){dp[k]=match;steps[k]=1;}else if(drop>=extra){dp[k]=drop;steps[k]=2;}else{dp[k]=extra;steps[k]=3;}
 }
 const mapping=Array(a.length).fill(null) as (number|null)[],uncertain:number[]=[],omitted:number[]=[];
 let i=a.length,j=b.length;
 while(i||j){const step=steps[i*w+j];if(step===1){mapping[i-1]=j-1;if(similarity(a[i-1],b[j-1])<1)uncertain.push(i-1);i--;j--;}else if(step===2){uncertain.push(--i);}else{omitted.push(--j);}}
 return {mapping,uncertain:uncertain.reverse(),omitted:omitted.reverse()};
}
export type EnsembleMapping={source:EnsembleSource;mapping:(number|null)[];uncertain:number[];omitted:number[]};
export function suggestEnsembleInstrument(name:string,roster:Instrument[]){
 const s=name.toLowerCase(),second=/(violin|bandoneon)[\s_-]*(ii|2)(?![i0-9])/.test(s);
 const suggested=s.includes('violin')?(second?'Violin II':'Violin I'):s.includes('bandoneon')?(second?'Bandoneon II':'Bandoneon I'):/bass|contrabass/.test(s)?'Contrabass':s.includes('piano')?'Piano':'';
 return roster.includes(suggested)?suggested:'';
}
export function ensemblePreview(original:Project,sources:EnsembleSource[],referenceIndex:number,infer:boolean,fill:boolean,overrides:Record<string,number|null>={}){
 if(!sources.length)throw Error('Choose at least one part');
 const roster=projectInstruments(original);
 if(sources.some(s=>!roster.includes(s.instrument)||!s.parsed.parts[s.partIndex]))throw Error('Assign each source to an instrument in the ensemble');
 if(new Set(sources.map(s=>s.instrument)).size!==sources.length)throw Error('Assign a different destination instrument to each source');
 const before=snapshotActiveEditions(original),existing=assembleEditionScore(before);
 const blank=!original.bars.some(b=>b.chord.trim()||b.melody.length)&&!Object.values(existing).some(n=>n.length)&&!Object.values(original.protectedBars).some(Boolean);
 const ref=sources[referenceIndex];if(!ref)throw Error('Choose a reference part');
 const refPart=ref.parsed.parts[ref.partIndex],refCount=refPart.measureCount;
 if(refCount>512)throw Error('Maximum 512 measures');
 if(sources.some(s=>s.parsed.measures.some(m=>Math.abs(m.beats-original.beats)>1e-6)))throw Error('Source meter differs from song; set the correct meter before import');
 const count=blank?refCount:original.bars.length;
 const mappings:EnsembleMapping[]=sources.map((source,index)=>{
  const part=source.parsed.parts[source.partIndex];
  const alignment=index===referenceIndex?{mapping:Array.from({length:refCount},(_,i)=>i),uncertain:[],omitted:[]}:alignEnsembleMeasures(ref.parsed,refPart,source.parsed,part);
  const mapping=Array.from({length:count},(_,i)=>Object.prototype.hasOwnProperty.call(overrides,index+':'+i)?overrides[index+':'+i]:alignment.mapping[i]??null);
  let previous=-1;
  for(const m of mapping){if(m===null)continue;if(!Number.isInteger(m)||m<0||m>=part.measureCount||m<=previous)throw Error('Mappings must be increasing, unique source measures');previous=m;}
  const used=new Set(mapping.filter(m=>m!==null));
  const omitted=Array.from({length:part.measureCount},(_,i)=>i).filter(i=>!used.has(i));
  return {source,mapping,uncertain:mapping.flatMap((m,i)=>m===null||alignment.uncertain.includes(i)||m!==i?[i]:[]),omitted};
 });
 let project=blank?{...original,bars:Array.from({length:count},(_,i)=>({chord:'',melody:[],section:original.bars[Math.min(i,original.bars.length-1)]?.section??'A'})),generatedScore:undefined,importedScore:undefined,partEditions:undefined,protectedBars:{}}:original;
 for(const {source,mapping} of mappings){
  const plan=createMergePlan(project,source.parsed,source.instrument,source.partIndex,'fit',source.name);
  plan.rows=plan.rows.map((row,i)=>({...row,theirs:mapping[i],shift:0,confidence:0,notes:mapping[i]===null?'ours':'theirs',chords:'ours',protectedAction:'keep'}));
  project=previewMerge(project,source.parsed,plan).proposed;
 }
 const score=assembleEditionScore(project);
 const measures=Array.from({length:count},(_,i)=>({...ref.parsed.measures[Math.min(i,ref.parsed.measures.length-1)],number:i+1,offset:i*project.beats,beats:project.beats,chords:[]}));
 const explicit=Array.from({length:count},(_,i)=>{
  const symbols=[...new Set(mappings.flatMap(({source,mapping})=>mapping[i]===null?[]:[source.parsed.chords[mapping[i]!]??'']).filter(Boolean))];
  return symbols.length===1?symbols[0]:'';
 });
 const combined:ParsedMusicXml={title:project.title,parts:sources.map(s=>({id:s.instrument,name:s.instrument,notes:score[s.instrument]??[],staffCount:2,measureCount:count,pitchedMeasures:count})),measures,measureCount:count,chords:explicit,keys:[],warnings:[]};
 const inferred:number[]=[];
 project={...project,bars:project.bars.map((bar,i)=>{
  if(bar.chord.trim())return bar;
  const chord=explicit[i]||(infer?chordEstimate(combined,i,-1).chord:'');
  if(chord&&!explicit[i])inferred.push(i);
  return {...bar,chord};
 })};
 const completed:Record<string,number[]>={};
 for(const {source,mapping} of mappings)if(accompanimentInstrument(source.instrument)){
  const slashes:Record<number,{beat:number;duration:number}[]>={};
  for(let i=0;i<mapping.length;i++){const m=mapping[i];if(m===null)continue;const measure=source.parsed.measures[m];const attacks=(source.parsed.parts[source.partIndex].slashAttacks??[]).filter(n=>n.staff===1&&n.start>=measure.offset&&n.start<measure.offset+measure.beats);if(attacks.length)slashes[i]=attacks.map(n=>({beat:n.start-measure.offset,duration:n.duration}));}
  if(fill||Object.keys(slashes).length){const result=completeMissingAccompaniment(project,source.instrument,'four',0,count-1,slashes,!fill);project=result.project;completed[source.instrument]=result.filled;}
 }
 const backup=JSON.parse(JSON.stringify(before)) as Project;delete backup.importMergeBackup;
 project={...snapshotActiveEditions(project),importMergeBackup:{createdAt:new Date().toISOString(),sourceName:sources.map(s=>s.name).join(', '),project:backup}};
 return {project,mappings,inferred,completed,blank};
}
