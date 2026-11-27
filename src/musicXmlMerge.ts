import {bandoneonModelForPart,isBandoneonPitchPlayable} from './bandoneon';
/** Auditable MusicXML ↔ Tango alignment and non-destructive preview/merge.
 * Harmonies inferred from OMR are suggestions, never authoritative facts. */
import {chordAt,chordTones,writtenInstrumentRange,partStaffForNote,generate,mergeScores,parseChordSequence,parsePitch,projectInstruments,sectionLetter,transposeChord,
  type Bar,type Instrument,type Note,type Project,type Score} from './music';
import {assembleEditionScore,snapshotActiveEditions} from './editions';
import type {ParsedMusicXml,XmlPart,XmlMeasure} from './musicXmlImport';

export type MergeMode='fit'|'lead'|'reference';
export type MergeDecision='ours'|'theirs'|'combine';
export type ProtectionDecision='keep'|'transpose'|'replace';
export type AlignmentRow={
  target:number;ours:number|null;theirs:number|null;shift:number;confidence:number;
  notes:MergeDecision;chords:MergeDecision;protectedAction:ProtectionDecision;
  notesOverride?:Note[];
};
export type MergePlan={
  mode:MergeMode;instrument:Instrument;partIndex:number;
  sourceName:string;sourceMeasureCount:number;rows:AlignmentRow[];
  inferredHarmony:boolean;createdAt:string;
  fillAccompaniment?:AccompanimentRhythm; positionalAlignment?:boolean; useSlashRhythm?:boolean;
};
export type MergeBackup={createdAt:string;sourceName:string;project:Project};
export type MergePreview={proposed:Project;conflicts:string[];matched:number;uncertain:number;changes:number};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const mod=(n:number)=>((n%12)+12)%12;
const noteMeasure=(notes:readonly Note[],index:number,beats:number):Note[]=>
  notes.filter(n=>Math.floor((n.start+1e-7)/beats)===index);
const groupBars=(p:Project):{section:string;start:number;end:number}[]=>{
  const parts:{section:string;start:number;end:number}[]=[];
  p.bars.forEach((b,i)=>{
    if(!parts.length||parts[parts.length-1].section!==b.section)parts.push({section:b.section,start:i,end:i});
    else parts[parts.length-1].end=i;
  });return parts;
};
const notePitchClasses=(notes:readonly Note[],start:number,end:number):number[]=>{
  const bins=Array(12).fill(0) as number[];
  for(const n of notes)if(n.start>=start-1e-7&&n.start<end-1e-7)bins[mod(n.pitch)]+=.8+Math.min(1.5,n.duration)*.25;
  return bins;
};
const candidateQualities:[string,number[]][]=[
  ['', [0,4,7]],['m',[0,3,7]],['7',[0,4,7,10]],
  ['m7',[0,3,7,10]],['dim',[0,3,6]],['dim7',[0,3,6,9]],
  ['m7b5',[0,3,6,10]],['aug',[0,4,8]]
];
/** Conservative cleanup for the bundled inferred-harmony study only. Preserve roots, inversions, rhythm slots and all actual notes. */
export function simplifyTangoStudyHarmony(project:Project):number{
 let changed=0;
 for(const bar of project.bars){
  const chord=bar.chord.replace(/(^|,)(\s*)([A-G][#b]?)(?:maj7|ma7|M7|Δ7?)(?=\s*(?:\/|,|$))/g,'$1$2$3');
  if(chord!==bar.chord){bar.chord=chord;changed++;}
 }
 return changed;
}
const noteNames=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
export type ChordEstimate={chord:string;confidence:number;explicit:boolean};
/** Only an explanatory inference. A bass line is not proof of a chord root. */
export function chordEstimate(parsed:ParsedMusicXml,measure:number,partIndex:number):ChordEstimate{
 const actual=parsed.chords[measure]??'';
 if(actual.trim())return {chord:actual,confidence:1,explicit:true};
 const info=parsed.measures[measure];
 const notes=(partIndex<0?parsed.parts.flatMap(part=>part.notes):parsed.parts[partIndex]?.notes??[]).filter(n=>!!info&&n.start+n.duration>info.offset+1e-7&&n.start<info.offset+info.beats-1e-7);
 if(!notes.length)return {chord:'',confidence:0,explicit:false};
 const hist=notePitchClasses(notes,info.offset,info.offset+info.beats);
 const bass=notes.filter(n=>n.pitch<=60).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const bassPc=bass.length?mod(bass[0].pitch):null;
 if(partIndex<0&&hist.filter(w=>w>0).length<3)return {chord:'',confidence:0,explicit:false};
 const total=hist.reduce((sum,val)=>sum+val,0)||1;
 const weights:Array<{chord:string;score:number}>=[];
 for(let root=0;root<12;root++)for(const [quality,steps] of candidateQualities){
  const pcs=steps.map(step=>mod(root+step));
  const contained=pcs.reduce((sum,pc)=>sum+hist[pc],0)/total;
  const coverage=pcs.filter(pc=>hist[pc]>0).length/pcs.length;
  // Traditional tango prior: triads and functional dominant/diminished
  // harmony first. A passing melody note is not enough to name an extension.
  const penalty=quality==='m7'?.065:quality==='m7b5'?.035:quality==='aug'?.035:quality==='dim7'?.015:quality==='7'?.012:0;
  const extension=pcs.length>3?hist[pcs[3]]/total:0;
  const weakExtension=pcs.length>3&&extension<.09?.06:0;
  const score=.67*contained+.22*coverage+.11*(bassPc===root?1:0)-penalty-weakExtension;
  weights.push({chord:noteNames[root]+quality,score});
 }
 weights.sort((a,b)=>b.score-a.score);
 if(partIndex<0&&(weights[0].score<.75||weights[0].score-weights[1].score<.025))return {chord:'',confidence:0,explicit:false};
 return {chord:weights[0].chord,confidence:Math.max(0,Math.min(.82,weights[0].score*.82)),
  explicit:false};
}
/** Compare harmonic evidence under a possible semitone shift, without assuming
 * the project's key-signature metadata is correct. */
type SourceEvidence={hist:number[];total:number;bassPc:number|null;hasNotes:boolean};
function sourceEvidence(parsed:ParsedMusicXml,partIndex:number):SourceEvidence[]{
 const notes=[...(parsed.parts[partIndex]?.notes??[])].sort((a,b)=>a.start-b.start);
 const result:SourceEvidence[]=[];let index=0;
 for(const measure of parsed.measures){
  while(index<notes.length&&notes[index].start<measure.offset-1e-7)index++;
  const group:Note[]=[];let cursor=index;
  while(cursor<notes.length&&notes[cursor].start<measure.offset+measure.beats-1e-7)group.push(notes[cursor++]);
  const hist=notePitchClasses(group,measure.offset,measure.offset+measure.beats);
  const bass=group.filter(n=>n.pitch<60).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  result.push({hist,total:hist.reduce((a,b)=>a+b,0)||1,bassPc:bass.length?mod(bass[0].pitch):null,hasNotes:group.length>0});
  index=cursor;
 }
 return result;
}
function harmonicSimilarity(projectChord:string,parsed:ParsedMusicXml,sourceIndex:number,shift:number,evidence:SourceEvidence[]):number{
 const chord=projectChord.split(',')[0]?.trim()??'',info=evidence[sourceIndex];
 if(!info||!chord)return 0;
 const rootText=chord.match(/^[A-G][#b]?/)?.[0];
 const root=rootText?parsePitch(rootText+'4'):null;
 if(root===null)return 0;
 const sourceChords=parsed.chords[sourceIndex];
 if(sourceChords){
  const token=sourceChords.match(/^[A-G][#b]?/)?.[0];
  const sourceRoot=token?parsePitch(token+'4'):null;
  return sourceRoot!==null&&mod(sourceRoot+shift)===mod(root)?1:.1;
 }
 if(!info.hasNotes)return 0;
 const pcs=chordTones(chord);
 const covered=pcs.reduce((sum,pc)=>sum+info.hist[mod(pc-shift)],0)/info.total;
 const bassFit=info.bassPc!==null&&mod(info.bassPc+shift)===mod(root)?1:0;
 return .7*covered+.3*bassFit;
}
function sourceAlignment(project:Project,parsed:ParsedMusicXml,partIndex:number):{theirs:number|null;shift:number;confidence:number}[]{
 const result=Array.from({length:project.bars.length},()=>({theirs:null as number|null,shift:0,confidence:0}));
 const sections=groupBars(project),evidence=sourceEvidence(parsed,partIndex),memo=new Map<string,number>();
 const score=(chord:string,src:number,shift:number)=>{
  if(!chord.trim())return 0;
  const key=chord+'|'+src+'|'+shift;
  const prior=memo.get(key);if(prior!==undefined)return prior;
  const value=harmonicSimilarity(chord,parsed,src,shift,evidence);
  memo.set(key,value);return value;
 };
 let minSource=0;
 for(const section of sections){
  const length=section.end-section.start+1;
  const chordCount=project.bars.slice(section.start,section.end+1).filter(b=>b.chord.trim()).length;
  if(!chordCount)continue;
  let best:{start:number;shift:number;score:number}|undefined;
  // Independent local transpositions allow repeated passages in different keys.
  for(let start=minSource;start+length<=parsed.measureCount;start++){
   for(let shift=-6;shift<=6;shift++){
    let sum=0,count=0;
    for(let o=0;o<length;o++){
      const chord=project.bars[section.start+o].chord;
      if(!chord.trim())continue;
      sum+=score(chord,start+o,shift);count++;
    }
    const adjusted=(count?sum/count:0)-0.0001*(start-minSource);
    if(!best||adjusted>best.score)best={start,shift,score:adjusted};
   }
  }
  if(!best||best.score<.29)continue;
  for(let o=0;o<length;o++){
   const confidence=score(project.bars[section.start+o].chord,best.start+o,best.shift);
   result[section.start+o]={theirs:best.start+o,shift:best.shift,confidence};
  }
  minSource=best.start+length;
 }
 return result;
}
export function createMergePlan(project:Project,parsed:ParsedMusicXml,instrument:Instrument,partIndex:number,mode:MergeMode,sourceName:string):MergePlan{
 if(!projectInstruments(project).includes(instrument))throw Error('Target instrument is not in this ensemble');
 if(!parsed.parts[partIndex])throw Error('Select a valid MusicXML part');
 if(!['fit','lead','reference'].includes(mode))throw Error('Unknown merge mode');
 if(mode==='lead'&&parsed.measures.some(m=>Math.abs(m.beats-project.beats)>1e-6))throw Error('This piano-led import requires the same time signature in all source measures');
 const saved=assembleEditionScore(project);
 const destinationEmpty=!(saved[instrument]?.length)&&!Object.keys(project.protectedBars).some(key=>key.startsWith(instrument+':')&&project.protectedBars[key]);
 const positionalAlignment=mode==='fit'&&(destinationEmpty||!project.bars.some(b=>b.chord.trim()));
 const aligned=positionalAlignment?project.bars.map((_,i)=>({theirs:i<parsed.parts[partIndex].measureCount?i:null,shift:0,confidence:0})):sourceAlignment(project,parsed,partIndex);
 const count=mode==='lead'?parsed.measureCount:project.bars.length;
 const inverse=new Map<number,{ours:number;shift:number;confidence:number}>();
 aligned.forEach((item,ours)=>{
  if(item.theirs!==null){
   const existing=inverse.get(item.theirs);
   if(!existing||existing.confidence<item.confidence)inverse.set(item.theirs,{ours,shift:item.shift,confidence:item.confidence});
  }
 });
 const rows=Array.from({length:count},(_,target):AlignmentRow=>{
  const source=mode==='lead'?target:aligned[target].theirs;
  const inverseMatch=mode==='lead'?inverse.get(target):undefined;
  const alignedMatch=mode==='lead'?undefined:aligned[target];
  const ours=mode==='lead'?inverseMatch?.ours??null:target;
  const shift=mode==='lead'?-(inverseMatch?.shift??0):alignedMatch?.shift??0;
  const confidence=mode==='lead'?inverseMatch?.confidence??0:alignedMatch?.confidence??0;
  const protectedOriginal=ours!==null&&Boolean(project.protectedBars[instrument+':'+ours]);
  return {target,ours,theirs:source??null,shift,confidence,
   notes:source===null?'ours':(mode==='lead'&&!protectedOriginal||mode==='fit'&&destinationEmpty)?'theirs':'ours',
   chords:mode==='lead'&&source!==null?'theirs':'ours',
   protectedAction:'keep'};
 });
 return {mode,instrument,partIndex,sourceName,sourceMeasureCount:parsed.measureCount,rows,
  inferredHarmony:false,positionalAlignment,createdAt:new Date().toISOString()};
}
export function modifyAlignment(plan:MergePlan,target:number,patch:Partial<Omit<AlignmentRow,'target'>>):MergePlan{
 const row=plan.rows[target];if(!row)throw Error('Unknown target measure');
 if(patch.shift!==undefined&&(!Number.isInteger(patch.shift)||Math.abs(patch.shift)>24))throw Error('Transpose must be −24…+24 semitones');
 return {...plan,rows:plan.rows.map((r,i)=>i===target?{...r,...patch,target:r.target}:r)};
}
function newSections(project:Project,parsed:ParsedMusicXml):{bars:Bar[];keys:Record<string,string>;sourceSections:Record<string,string>}{
 let index=-1,section='',lastFifths:number|null=null;
 const sections:{bars:Bar[];keys:Record<string,string>;sourceSections:Record<string,string>}={bars:[],keys:{},sourceSections:{}};
 const old=groupBars(project);
 for(let m=0;m<parsed.measureCount;m++){
  const incoming=parsed.measures[m];
  if(m===0||incoming.keyFifths!==lastFifths||incoming.rehearsal&&m>0){
   index++;if(index>=26)throw Error('Too many section changes to represent in Tango Arranger');
   section=sectionLetter(index);
   const nearest=old[Math.min(index,old.length-1)]?.section??'A';
   sections.sourceSections[section]=nearest;
   sections.keys[section]=parsed.keys[m]||project.sectionKeys?.[nearest]||'C';
  }
  lastFifths=incoming.keyFifths;
  sections.bars.push({chord:'',melody:[],section});
 }
 return sections;
}
function notesForRow(notes:readonly Note[],sourceMeasure:number,start:number,sourceOffset:number,sourceBeats:number,shift:number):Note[]{
 return notes.filter(n=>n.start>=sourceOffset-1e-7&&n.start<sourceOffset+sourceBeats-1e-7).map(n=>{
  const pitch=n.pitch+shift;
  if(!Number.isInteger(pitch)||pitch<0||pitch>127)throw Error('Transposition moves a note outside MIDI range');
  return {...clone(n),pitch,start:start+(n.start-sourceOffset),source:'imported' as const};
 });
}
const uniqNotes=(notes:Note[]):Note[]=>{
 const map=new Map<string,Note>();
 for(const note of notes)map.set([note.pitch,note.start.toFixed(5),note.duration.toFixed(5)].join(':'),note);
 return [...map.values()].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
};
const assignNotes=(into:Score,instrument:Instrument,target:number,beats:number,notes:Note[],protect:Record<string,boolean>)=>{
 const old=into[instrument]??[];
 into[instrument]=[...old.filter(n=>Math.floor((n.start+1e-7)/beats)!==target),...notes].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 protect[instrument+':'+target]=true;
 for(const n of notes){
  const last=Math.floor((n.start+n.duration-1e-7)/beats);
  for(let m=target+1;m<=last;m++)protect[instrument+':'+m]=true;
 }
};
export function previewMerge(original:Project,parsed:ParsedMusicXml,plan:MergePlan):MergePreview{
 if(!parsed.parts[plan.partIndex])throw Error('Selected MusicXML part disappeared');
 if(plan.rows.length!==(plan.mode==='lead'?parsed.measureCount:original.bars.length))throw Error('Stale merge plan: measure count changed');
 if(plan.rows.length>512)throw Error('Maximum 512 measures');
 const copy=clone(snapshotActiveEditions(original));
 const savedScore=assembleEditionScore(copy),conflicts:string[]=[];
 const musical=plan.mode==='lead'?newSections(copy,parsed):{bars:copy.bars.map(b=>({...b,melody:b.melody.map(n=>({...n}))})),keys:{...(copy.sectionKeys??{})},sourceSections:{}};
 const bars=musical.bars;
 if(plan.mode==='lead')for(const [section,oldSection] of Object.entries(musical.sourceSections)){
  if(!musical.keys[section])musical.keys[section]=copy.sectionKeys?.[oldSection]??'C';
 }
 // Start with fresh generated notes for new source-led sections, never with an
 // unaligned old score. The original remains available as an undo snapshot.
 const result=Object.fromEntries(projectInstruments(copy).map(inst=>[inst,[] as Note[]])) as Score;
 const preserved=Object.fromEntries(projectInstruments(copy).map(inst=>[inst,[] as Note[]])) as Score;
 const protectedBars:Record<string,boolean>={};
 let matched=0,uncertain=0,changes=0;
 if(plan.mode==='fit'&&parsed.parts[plan.partIndex].measureCount!==original.bars.length)conflicts.push('Source and destination measure counts differ; verify alignment and any omitted source measures.');
 const source=parsed.parts[plan.partIndex];
 for(const row of plan.rows){
  const {target,ours,theirs,shift}=row;
  if(row.target!==plan.rows.indexOf(row))throw Error('Merge plan rows are out of order');
  if(theirs!==null&&(theirs<0||theirs>=parsed.measureCount||!Number.isInteger(theirs)))throw Error('Invalid MusicXML measure mapping at target '+(target+1));
  if(ours!==null&&(ours<0||ours>=copy.bars.length||!Number.isInteger(ours)))throw Error('Invalid original measure mapping at target '+(target+1));
  if(!Number.isInteger(shift)||Math.abs(shift)>24)throw Error('Invalid local transposition');
  if(theirs!==null){matched++;if(row.confidence<.45)uncertain++;}
  const dest=bars[target],start=target*copy.beats;
  const was=ours===null?undefined:copy.bars[ours];
  const incoming=theirs===null?undefined:parsed.measures[theirs];
  const oursNotes=was?.melody.map(n=>({...clone(n),start:n.start,source:'manual' as const}))??[];
  const incomingChord=theirs===null?'':parsed.chords[theirs]||(
    plan.inferredHarmony?chordEstimate(parsed,theirs,-1).chord:'');
  if(row.chords==='theirs'||row.chords==='combine'||(plan.inferredHarmony&&plan.mode==='fit'&&!was?.chord?.trim())){
   const next=incomingChord?(plan.mode==='fit'&&shift?incomingChord.split(',').map(c=>transposeChord(c,shift)).join(','):incomingChord):'';
   if(next){
    dest.chord=row.chords==='combine'&&was?.chord?was.chord:next;
    if(dest.chord!==was?.chord)changes++;
   }else if(was)dest.chord=was.chord;
   if(row.chords==='theirs'&&!incomingChord&&theirs!==null)conflicts.push('Measure '+(target+1)+': no reliable incoming chord; kept original');
  }else if(was)dest.chord=was.chord;
  if(plan.mode==='fit'&&was)dest.melody=clone(was.melody);
  else if(was)dest.melody=clone(oursNotes);
  const oldNotes=ours===null?[]:projectInstruments(copy).flatMap(inst=>noteMeasure(savedScore[inst]??[],ours,copy.beats).map(n=>({inst,n})));
  for(const inst of projectInstruments(copy)){
   const wasProtected=ours!==null&&Boolean(copy.protectedBars[inst+':'+ours]);
   const segment=oldNotes.filter(item=>item.inst===inst).map(({n})=>{
    const next=clone(n);
    const local=n.start-(ours??0)*copy.beats;
    next.start=start+local;
    if(row.protectedAction==='transpose'&&wasProtected&&inst!==plan.instrument){
      const transposed=next.pitch+shift;
      if(transposed<0||transposed>127){conflicts.push('Measure '+(target+1)+': '+inst+' pitch cannot transpose safely');return next;}
      next.pitch=transposed;
    }
    return next;
   });
   if(wasProtected)protectedBars[inst+':'+target]=true;
   if(!segment.length)continue;
   const collected=preserved[inst];
   collected.push(...segment);
   if(wasProtected)protectedBars[inst+':'+target]=true;
  }
  const chosen=row.notesOverride?row.notesOverride.map(n=>({...clone(n),start:start+(n.start-(ours??target)*copy.beats)})):
    ours===null?[]:noteMeasure(savedScore[plan.instrument]??[],ours,copy.beats).map(n=>({...clone(n),start:start+(n.start-ours*copy.beats)}));
  if(ours!==null&&row.protectedAction==='transpose'&&copy.protectedBars[plan.instrument+':'+ours])
    for(const n of chosen){
      if(n.pitch+shift<0||n.pitch+shift>127){conflicts.push('Measure '+(target+1)+': protected '+plan.instrument+' note exceeds MIDI range');continue;}
      n.pitch+=shift;
    }
  const incomingNotes=theirs===null?[]:notesForRow(source.notes,theirs,start,incoming!.offset,incoming!.beats,plan.mode==='fit'?shift:0);
  let selected=chosen;
  if(row.notes==='theirs'){
   if(incomingNotes.length)selected=incomingNotes;
   else if(theirs!==null){selected=[];if(chosen.length)conflicts.push('Measure '+(target+1)+': incoming rests replace existing notes');}
  }else if(row.notes==='combine')selected=uniqNotes([...chosen,...incomingNotes]);
  if((row.notes==='theirs'||row.notes==='combine')&&theirs===null)conflicts.push('Measure '+(target+1)+': no matched source measure');
  if(row.notesOverride)selected=chosen;
  // A protected original note is modified only by an explicit edit,
  // transpose, or "theirs" decision. Ours is retained after key changes.
  if(row.notes==='ours'&&!row.notesOverride&&ours===null)selected=[];
  result[plan.instrument].push(...selected);
  if((theirs!==null&&row.notes==='theirs')||(selected.length&&row.notes==='combine')||row.notesOverride||row.protectedAction==='transpose'){
   protectedBars[plan.instrument+':'+target]=true;
   changes++;
  }else if(ours!==null&&copy.protectedBars[plan.instrument+':'+ours])protectedBars[plan.instrument+':'+target]=true;
 }
 // Map unchanged instrument parts by reviewed alignments. Overlapping
 // transitions are not auto-shortened; warn so musicians can correct them.
 for(const inst of projectInstruments(copy)){
  if(inst===plan.instrument)continue;
  result[inst]=plan.mode==='fit'&&plan.rows.every(row=>row.protectedAction!=='transpose')?clone(savedScore[inst]??[]):uniqNotes(preserved[inst]);
 }
 const remapped:Project={...copy,bars,
  ...(plan.mode==='lead'?{
    sectionKeys:musical.keys,
    roles:Object.fromEntries(Object.entries(musical.sourceSections).map(([section,from])=>[section,clone(copy.roles[from]??{})])),
    phrasePlan:undefined,measureRoles:{},measureViolinTechniques:{},measureBassTechniques:{},
    pianoFigures:Object.fromEntries(Object.entries(musical.sourceSections).map(([section,from])=>[section,copy.pianoFigures?.[from]??'chords_up'])),
    pianoFigureVariation:Object.fromEntries(Object.entries(musical.sourceSections).map(([section,from])=>[section,copy.pianoFigureVariation?.[from]??0])),
    violinMarcatoBeats:{},violinArpeggioDirections:{}
  }:{}),
  protectedBars,
  generatedScore:result,importedScore:plan.mode==='fit'?{...copy.importedScore,[plan.instrument]:clone(result[plan.instrument])}:clone(result),baseScore:undefined,partEditions:plan.mode==='fit'?copy.partEditions:undefined,
  importMergeBackup:undefined
 };
 // Unmatched original measures and all inactive difficulty editions are kept
 // verbatim in the explicit, reversible import backup.
 for(const row of plan.rows)if(row.ours===null&&plan.mode==='lead')uncertain++;
 for(const inst of projectInstruments(copy)){
  for(const n of result[inst]??[]){
   if(n.start+n.duration>bars.length*copy.beats+.0001)
    conflicts.push(inst+': a sustained note crosses the new song end');
  }
 }
 if(plan.mode==='reference')return {proposed:copy,conflicts,matched,uncertain,changes:0};
 let proposed=remapped;
 if(plan.fillAccompaniment||plan.useSlashRhythm){
  const rhythms:Record<number,{beat:number;duration:number}[]>={};
  if(plan.useSlashRhythm)for(const row of plan.rows){
   if(row.theirs===null||row.notes==='ours')continue;
   const measure=parsed.measures[row.theirs];
   const attacks=(source.slashAttacks??[]).filter(n=>n.staff===1&&n.start>=measure.offset&&n.start<measure.offset+measure.beats).map(n=>({beat:n.start-measure.offset,duration:n.duration}));
   if(attacks.length)rhythms[row.target]=attacks;
  }
  const completed=completeMissingAccompaniment(proposed,plan.instrument,plan.fillAccompaniment??'four',0,bars.length-1,rhythms,!plan.fillAccompaniment);
  proposed=completed.project;changes+=completed.filled.length;
  if(completed.skipped.length)conflicts.push('No reliable chord supplied for accompaniment in '+completed.skipped.length+' measures');
 }
 return {proposed:plan.mode==='fit'?snapshotActiveEditions(proposed):proposed,conflicts,matched,uncertain,changes};
}
export function applyReviewedMerge(original:Project,parsed:ParsedMusicXml,plan:MergePlan):Project{
 if(plan.mode==='reference')throw Error('Reference-only mode does not modify the arrangement');
 const {proposed,conflicts}=previewMerge(original,parsed,plan);
 if(conflicts.some(s=>s.includes('crosses the new song end')))throw Error('Resolve notes crossing song end before applying the merge');
 const before=clone(snapshotActiveEditions(original));
 delete before.importMergeBackup;
 return {...proposed,importMergeBackup:{createdAt:plan.createdAt,sourceName:plan.sourceName,project:before}};
}
export function undoReviewedMerge(project:Project):Project{
 const backup=project.importMergeBackup;
 if(!backup)throw Error('No MusicXML merge backup available');
 return clone(backup.project);
}
export type AccompanimentRhythm='four'|'two'|'syncopa'|'bass'|'section';
export function accompanimentInstrument(inst:Instrument){return /^(Piano|Bandoneon)/i.test(inst);}
const staffOf=(n:Note,p:Project,inst:Instrument)=>n.xmlStaff===1||n.xmlStaff===2?n.xmlStaff:partStaffForNote(n,inst,p.pianoSplitPitch??60,0,bandoneonModelForPart(p,inst));
export function missingAccompanimentMeasures(p:Project,inst:Instrument,from=0,to=p.bars.length-1){
 if(!accompanimentInstrument(inst))return [];
 const notes=assembleEditionScore(p)[inst]??[];
 return p.bars.flatMap((_,i)=>{
  if(i<from||i>to)return [];
  const active=notes.filter(n=>n.start<(i+1)*p.beats-1e-7&&n.start+n.duration>i*p.beats+1e-7);
  return active.some(n=>staffOf(n,p,inst)===2)&&!active.some(n=>staffOf(n,p,inst)===1)?[i]:[];
 });
}
/** Explicit, additive completion. Never modifies imported pitches or other parts. */
export function completeMissingAccompaniment(p:Project,inst:Instrument,rhythm:AccompanimentRhythm='four',from=0,to=p.bars.length-1,slashRhythms:Record<number,{beat:number;duration:number}[]>={},slashOnly=false){
 const saved=snapshotActiveEditions(p),score=assembleEditionScore(saved),notes=score[inst]??[];
 const filled:number[]=[],skipped:number[]=[],added:Note[]=[];
 if(!accompanimentInstrument(inst)||!projectInstruments(p).includes(inst))return {project:p,filled,skipped};
 const candidates=new Set([...(!slashOnly?missingAccompanimentMeasures(p,inst,from,to):[]),...Object.keys(slashRhythms).map(Number)]);
 const fresh=rhythm==='section'?generate(p)[inst]??[]:[];
 for(const i of [...candidates].sort((a,b)=>a-b)){
  if(i<from||i>to||!p.bars[i])continue;
  const bar=p.bars[i],offset=i*p.beats;
  if(!bar.chord.trim()||!/^([A-Ga-g][#b]?)/.test(bar.chord.trim())){skipped.push(i);continue;}
  const active=notes.filter(n=>n.start<offset+p.beats-1e-7&&n.start+n.duration>offset+1e-7);
  const upper=active.filter(n=>staffOf(n,p,inst)===1);
  const bass=active.filter(n=>staffOf(n,p,inst)===2&&n.start>=offset);
  const beats=rhythm==='two'?[0,Math.floor(p.beats/2)]:rhythm==='syncopa'?[0,1.5,Math.max(2,p.beats-1)].filter(b=>b<p.beats):rhythm==='bass'?[...new Set(bass.map(n=>n.start-offset))]:rhythm==='section'?[...new Set(fresh.filter(n=>n.start>=offset&&n.start<offset+p.beats&&staffOf(n,p,inst)===1).map(n=>n.start-offset))]:Array.from({length:p.beats},(_,b)=>b);
  const attacks=slashRhythms[i]??beats.map(beat=>({beat,duration:Math.min(.75,p.beats-beat)}));
  let count=0;
  for(const {beat,duration} of attacks){
   if(beat<0||beat>=p.beats||duration<=0)continue;
   const start=offset+beat,len=Math.min(duration,p.beats-beat);
   if(upper.some(n=>n.start<start+len-1e-7&&n.start+n.duration>start+1e-7))continue;
   const chord=chordAt(bar.chord,p.beats,beat);
   if(!/^[A-Ga-g][#b]?/.test(chord))continue;
   const [lo,hi]=writtenInstrumentRange(inst,p),floor=Math.max(lo,p.pianoSplitPitch??60),ceiling=Math.min(hi,floor+15);
   const pitches=chordTones(chord).map(pc=>floor+((pc-floor%12+12)%12)).filter(n=>n<=ceiling&&(!inst.startsWith('Bandoneon')||isBandoneonPitchPlayable(n+(p.transposeSemitones??0),bandoneonModelForPart(p,inst),'right')));
   if(pitches.length<2)continue;
   for(const pitch of pitches)added.push({pitch,start,duration:len,gate:.75,velocity:72,xmlStaff:1,source:'generated'});
   count++;
  }
  if(count)filled.push(i);
 }
 if(!added.length)return {project:p,filled,skipped};
 const combined=[...notes,...added].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const protectedBars={...saved.protectedBars};for(const i of filled)protectedBars[inst+':'+i]=true;
 // Store the mixed measure intact because legacy protection is measure-level.
 const imported=[...(saved.importedScore?.[inst]??[]).filter(n=>!filled.includes(Math.floor(n.start/p.beats))),...combined.filter(n=>filled.includes(Math.floor(n.start/p.beats)))];
 const project=snapshotActiveEditions({...saved,generatedScore:{...score,[inst]:combined},importedScore:{...saved.importedScore,[inst]:imported},protectedBars});
 return {project,filled,skipped};
}
