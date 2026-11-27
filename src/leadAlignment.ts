import {parseChordSequence,chordSequenceFromBeats,openingPickupBeats,replaceInstrumentMeasure,type Project,type Note,type Score,type Instrument} from './music';
import {parseLeadLyrics,positionLeadChords,encodeLyric,type LeadLyricToken} from './leadLyrics';

export type AlignmentChord={id:number;symbol:string;start:number};
export type AlignmentSyllable=LeadLyricToken & {id:number;anchor:boolean;noteIndex?:number};
export type LeadAlignment={chords:AlignmentChord[];syllables:AlignmentSyllable[];beats:number;measures:number;pickup:number;existing:boolean};
const eps=1e-7;
export function createLeadAlignment(p:Project,source:string,voice:readonly Note[],verse:1|2,useExisting:boolean):LeadAlignment{
 const plan=parseLeadLyrics(source,p.beats);
 const notes=[...voice].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const lyric=(n:Note)=>verse===1?n.lyric:n.lyric2;
 const sung=notes.map((n,i)=>({n,i})).filter(({n})=>Boolean(lyric(n)?.trim()));
 const existing=useExisting&&notes.length>0;
 const pickup=openingPickupBeats(p)?p.beats-openingPickupBeats(p):0;
 const syllables:AlignmentSyllable[]=plan.notes.length?plan.notes.map((token,id)=>{
  const prior=existing?(token.absolute?notes.findIndex(n=>Math.abs(n.start-token.start)<eps):sung.length===plan.notes.length&&sung[id]?.n&&lyric(sung[id].n)===token.text?sung[id].i:id):-1;
  return {...token,id,start:token.absolute?Math.max(pickup,token.start):prior>=0&&notes[prior]?notes[prior].start:Math.max(pickup,token.start),anchor:Boolean(token.absolute),noteIndex:prior>=0&&notes[prior]?prior:undefined};
 }):sung.map(({n,i},id)=>({id,text:lyric(n)!,start:n.start,line:Math.floor(n.start/p.beats),syllabic:(verse===1?n.syllabic:n.syllabic2)??'single',melisma:verse===1?n.melisma:n.melisma2,anchor:true,noteIndex:i}));
 const chords=projectAlignmentChords(p).map((c,id)=>({...c,id}));
 return {chords,syllables,beats:p.beats,measures:p.bars.length,pickup,existing};
}
function projectAlignmentChords(p:Project):Omit<AlignmentChord,'id'>[]{
 return p.bars.flatMap((bar,i)=>parseChordSequence(bar.chord,p.beats)
  .filter((c,j,all)=>j===0||c.chord!==all[j-1].chord)
  .map(c=>({symbol:c.chord,start:i*p.beats+c.beat})));
}
/** Chords in per-verse text are never authoritative without explicit opt-in. */
export function importAlignmentChords(d:LeadAlignment,p:Project,source:string):LeadAlignment{
 const mapped=positionLeadChords(parseLeadLyrics(source,p.beats),p.beats,p.bars.length,d.syllables.map(s=>s.start));
 const anchors=new Map(d.chords.map(c=>[c.start,c.symbol]));
 for(const c of mapped)anchors.set(c.measure*p.beats+c.beat,c.chord);
 return {...d,chords:[...anchors].sort(([a],[b])=>a-b).map(([start,symbol],id)=>({id,start,symbol}))};
}
export function moveAlignmentChord(d:LeadAlignment,id:number,start:number):LeadAlignment{
 if(!Number.isInteger(start)||start<0||start>=d.beats*d.measures)throw Error('Harmony supports quarter-note beat positions only.');
 if(start>0&&start<d.pickup)throw Error('Choose a beat outside the silent portion of the pickup.');
 if(d.chords.some(c=>c.id!==id&&c.start===start))throw Error('There is already a chord at this beat.');
 return {...d,chords:d.chords.map(c=>c.id===id?{...c,start}:c).sort((a,b)=>a.start-b.start)};
}
export function moveAlignmentSyllable(d:LeadAlignment,id:number,start:number,voice:readonly Note[]):LeadAlignment{
 const index=d.syllables.findIndex(s=>s.id===id);if(index<0)return d;
 const notes=[...voice].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const next=d.syllables.map(s=>({...s}));
 const chosen=next[index];
 if(start<d.pickup||start>=d.beats*d.measures||!Number.isFinite(start))throw Error('Choose a position within the sung timeline.');
 if(d.existing){
  const at=notes.findIndex(n=>Math.abs(n.start-start)<eps);
  if(at<0)throw Error('No existing vocal note begins here. Refine the melody in Note Editor, or use provisional timing.');
  chosen.noteIndex=at;
 }
 chosen.start=start;chosen.anchor=true;
 // Distribute only the unpinned syllables between explicit anchors. Existing
 // melody uses ordered note onsets; provisional timing uses quarter-beat steps.
 const pins=next.map((s,i)=>s.anchor?i:-1).filter(i=>i>=0);
 for(let i=1;i<pins.length;i++)if(next[pins[i]].start<=next[pins[i-1]].start+eps)throw Error('Syllable anchors must retain lyric order.');
 for(let k=0;k<pins.length-1;k++){
  const a=pins[k],b=pins[k+1],count=b-a-1;if(!count)continue;
  const from=next[a].start,to=next[b].start;
  if(d.existing){
   const slots=notes.map((n,i)=>({n,i})).filter(({n,i})=>n.start>from+eps&&n.start<to-eps&&(i===0||n.start>notes[i-1].start+eps));
   if(slots.length<count)throw Error('Not enough vocal onsets between these anchors.');
   for(let j=1;j<=count;j++){const slot=slots[Math.floor((j-1)*slots.length/count)];next[a+j].start=slot.n.start;next[a+j].noteIndex=slot.i;}
  }else{
   if(to-from<(count+1)*.25-eps)throw Error('Not enough room for intervening syllables.');
   for(let j=1;j<=count;j++)next[a+j].start=from+(to-from)*j/(count+1);
  }
 }
 for(let i=1;i<next.length;i++)if(next[i].start<=next[i-1].start+eps)throw Error('Move the neighbouring syllable or add an anchor first to preserve lyric order.');
 return {...d,syllables:next};
}
export function alignmentBars(d:LeadAlignment,p:Project):Project['bars']{
 if(d.beats!==p.beats||d.measures!==p.bars.length)throw Error('Song structure changed. Reload alignment.');
 const byMeasure=(chords:readonly Omit<AlignmentChord,'id'>[])=>{
  const measures=Array.from({length:d.measures},()=>[] as {beat:number;chord:string}[]);
  for(const c of chords){
   const measure=Math.floor(c.start/d.beats);
   measures[measure].push({beat:c.start-measure*d.beats,chord:c.symbol});
  }
  return measures;
 };
 const before=byMeasure(projectAlignmentChords(p)),after=byMeasure(d.chords);
 let prior='';
 return p.bars.map((bar,i)=>{
  const events=after[i];
  if(JSON.stringify(before[i])===JSON.stringify(events)){
   prior=events.at(-1)?.chord??'';
   return bar;
  }
  if(!events.length){prior='';return {...bar,chord:''};}
  if(events[0].beat!==0){
   if(!prior)throw Error('After a silent measure, harmony must start on beat one.');
   events.unshift({beat:0,chord:prior});
  }
  prior=events.at(-1)!.chord;
  return {...bar,chord:chordSequenceFromBeats(events,d.beats)};
 });
}
/** Exact lyric-only source, with optional current harmony for Advanced/export. */
export function serializeVisualAlignment(d:LeadAlignment,includeChords=true):string{
 const events=[...(includeChords?d.chords:[]).map(c=>({start:c.start,text:'['+c.symbol+']',line:-1,order:0})),
  ...d.syllables.map(t=>({start:t.start,text:'~'+t.syllabic+':'+encodeLyric(t.text)+(t.melisma?'_':''),line:t.line,order:1}))]
  .sort((a,b)=>a.start-b.start||a.order-b.order);
 let bar=0,line=-1,source='';
 for(const e of events){
  const target=Math.floor(e.start/d.beats);
  while(bar<target){source+=' || ';bar++;}
  if(e.line>=0&&line>=0&&e.line!==line)source+='\n';
  if(e.line>=0)line=e.line;
  source+=' @'+Number((e.start-target*d.beats+1).toFixed(6))+' '+e.text;
 }
 return source.trim();
}
/** Apply only changed Voice measures; all score positions are written pitches. */
export function applyAlignmentVoice(p:Project,current:Score,inst:Instrument,d:LeadAlignment,verse:1|2,preserveUnmapped=false):Project{
 const all=[...(current[inst]??[])].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const field=verse===1?'lyric':'lyric2',syll=verse===1?'syllabic':'syllabic2',mel=verse===1?'melisma':'melisma2';
 const prefix='lead:'+verse+':';
 const otherField=verse===1?'lyric2':'lyric';
 const changed=new Set<number>(),unchanged=new Set<Note>();
 const target=new Map(d.syllables.map(t=>[t.noteIndex,t]));
 const updateBar=(note:Note)=>changed.add(Math.floor(note.start/p.beats));
 let updated:Note[];
 if(d.existing){
  if(d.syllables.some((s,i)=>s.noteIndex===undefined||Math.abs((all[s.noteIndex]?.start??Infinity)-s.start)>eps||
   i>0&&s.start<=d.syllables[i-1].start))throw Error('Each syllable must map to a different vocal onset.');
  updated=all.map((n,i)=>{
   const token=target.get(i);
   if((!token&&preserveUnmapped)||((n[field]??'')===(token?.text??'')&&
    (!token||((n[syll]??'single')===token.syllabic&&Boolean(n[mel])===Boolean(token.melisma))))){
    unchanged.add(n);return n;
   }
   updateBar(n);
   const edit={...n,[field]:token?.text,[syll]:token?.syllabic,[mel]:token?.melisma||undefined};
   unchanged.add(edit);return edit;
  });
 }else{
  if(all.some(n=>n.leadToken?.startsWith(prefix)&&n[otherField]))
   throw Error('These Voice notes are shared by both verses. Use the existing melody to edit one verse without changing the other.');
  const isReplaced=(n:Note)=>n.leadToken?.startsWith(prefix);
  const old=new Map(all.filter(isReplaced).map(n=>[n.leadToken!,n]));
  updated=all.filter(n=>!isReplaced(n));
  for(const n of updated)unchanged.add(n);
  const preview=alignmentPreviewNotes(d,all);
  const generated=preview.map((n,i)=>{
   const id=prefix+i,prior=old.get(id),token=d.syllables[i];
   const bare={start:n.start,duration:n.duration,pitch:prior?.pitch??n.pitch,velocity:prior?.velocity??80,source:'manual' as const,leadToken:id};
   const edit={...bare,[field]:token.text,[syll]:token.syllabic,[mel]:token.melisma||undefined};
   if(updated.some(o=>o.start<edit.start+edit.duration-eps&&edit.start<o.start+o.duration-eps))
    throw Error('Provisional lyrics overlap existing Voice notes. Use the existing melody or edit those notes first.');
   return edit;
  });
  for(const n of old.values())updateBar(n);
  for(const n of generated)updateBar(n);
  updated.push(...generated);
 }
 let next=p,working=current;
 for(const bar of [...changed].sort((a,b)=>a-b)){
  next=replaceInstrumentMeasure(next,working,inst,bar,updated.filter(n=>Math.floor(n.start/p.beats)===bar),unchanged);
  working=next.generatedScore!;
 }
 return next;
}
export function alignmentPreviewNotes(d:LeadAlignment,voice:readonly Note[]){
 const notes=[...voice].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 return d.syllables.map((s,i)=>{
  const prior=d.existing&&s.noteIndex!==undefined?notes[s.noteIndex]:undefined;
  const end=d.syllables[i+1]?.start??d.beats*d.measures;
  return {start:s.start,duration:Math.max(.001,Math.min(prior?.duration??1,end-s.start)),pitch:prior?.pitch??60,lyric:s.text,syllabic:s.syllabic,melisma:s.melisma};
 });
}
