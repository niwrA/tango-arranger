import {parseChordSequence,chordSequenceFromBeats,openingPickupBeats,type Project,type Note} from './music';
import {parseLeadLyrics,positionLeadChords,type LeadLyricToken} from './leadLyrics';

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
  return {...token,id,start:prior>=0&&notes[prior]?notes[prior].start:Math.max(pickup,token.start),anchor:Boolean(token.absolute),noteIndex:prior>=0&&notes[prior]?prior:undefined};
 }):sung.map(({n,i},id)=>({id,text:lyric(n)!,start:n.start,line:Math.floor(n.start/p.beats),syllabic:(verse===1?n.syllabic:n.syllabic2)??'single',melisma:verse===1?n.melisma:n.melisma2,anchor:true,noteIndex:i}));
 const chords=p.bars.flatMap((bar,i)=>parseChordSequence(bar.chord,p.beats).filter((c,j,all)=>j===0||c.chord!==all[j-1].chord).map(c=>({symbol:c.chord,start:i*p.beats+c.beat})));
 // Source markers can establish harmony in empty measures; actual project harmony wins elsewhere.
 const mapped=positionLeadChords(plan,p.beats,p.bars.length,syllables.map(s=>s.start));
 for(const c of mapped)if(!p.bars[c.measure].chord.trim()){
  const start=c.measure*p.beats+c.beat;
  const prior=chords.find(x=>x.start===start);if(prior)prior.symbol=c.chord;else chords.push({symbol:c.chord,start});
 }
 return {chords:chords.sort((a,b)=>a.start-b.start).map((c,id)=>({...c,id})),syllables,beats:p.beats,measures:p.bars.length,pickup,existing};
}
export function moveAlignmentChord(d:LeadAlignment,id:number,start:number):LeadAlignment{
 if(!Number.isInteger(start)||start<0||start>=d.beats*d.measures)throw Error('Harmony supports quarter-note beat positions only.');
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
 // The measure-based harmony format requires a beat-one value. In a measure
 // without a local onset, carry the preceding chord; keep empty intro bars empty.
 let prior='';
 return p.bars.map((bar,i)=>{
  const events=d.chords.filter(c=>Math.floor(c.start/d.beats)===i).map(c=>({beat:c.start-i*d.beats,chord:c.symbol}));
  if(!events.length)return {...bar,chord:prior||''};
  if(events[0].beat!==0){if(!prior)throw Error('The first chord must start on beat one of a measure.');events.unshift({beat:0,chord:prior});}
  prior=events[events.length-1].chord;
  return {...bar,chord:chordSequenceFromBeats(events,d.beats)};
 });
}
export function alignmentPreviewNotes(d:LeadAlignment,voice:readonly Note[]){
 const notes=[...voice].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 return d.syllables.map((s,i)=>{
  const prior=s.noteIndex===undefined?undefined:notes[s.noteIndex];
  const end=d.syllables[i+1]?.start??d.beats*d.measures;
  return {start:s.start,duration:Math.max(.001,Math.min(prior?.duration??1,end-s.start)),pitch:prior?.pitch??60,lyric:s.text,syllabic:s.syllabic,melisma:s.melisma};
 });
}
