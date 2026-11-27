export type MidiPedalTransition={beat:number;channel:number;down:boolean};
export type MidiPedalSpan={start:number;end:number};

/** Reduce multi-channel CC64 to one pedal lane, clipped to the reviewed take. */
export function capturedPedalSpans(events:readonly MidiPedalTransition[],beats:number,loop:boolean,replace:boolean,pass:number):MidiPedalSpan[]{
 if(!Number.isFinite(beats)||beats<=0)return [];
 const held=new Map<number,number>(),raw:MidiPedalSpan[]=[];
 for(const event of [...events].sort((a,b)=>a.beat-b.beat)){
  if(!Number.isFinite(event.beat)||event.beat<0)continue;
  if(event.down){if(!held.has(event.channel))held.set(event.channel,event.beat);continue;}
  const start=held.get(event.channel);
  if(start!==undefined&&event.beat>start)raw.push({start,end:event.beat});
  held.delete(event.channel);
 }
 const spans:MidiPedalSpan[]=[];
 for(const span of raw){
  const first=loop?(replace?Math.max(0,pass):Math.floor(span.start/beats)):0;
  const last=loop&&!replace?Math.min(first+1,Math.floor(span.end/beats)):first;
  for(let p=first;p<=last;p++){
   const start=Math.max(0,span.start-p*beats),end=Math.min(beats,span.end-p*beats);
   if(end>start)spans.push({start,end});
  }
 }
 const merged:MidiPedalSpan[]=[];
 for(const span of spans.sort((a,b)=>a.start-b.start||a.end-b.end)){
  const last=merged.at(-1);
  if(last&&span.start<last.end)last.end=Math.max(last.end,span.end);else merged.push(span);
 }
 return merged;
}

/** Attach each step to one note without duplicating it on every chord tone. */
export function assignCapturedPedal(notes:readonly {start:number;duration:number}[],spans:readonly MidiPedalSpan[]){
 const assignments=new Map<number,{offset:number;beats:number}>();
 for(const span of spans){
  let index=notes.findIndex((note,i)=>!assignments.has(i)&&note.start>=span.start&&note.start<span.end);
  if(index<0)index=notes.findIndex((note,i)=>!assignments.has(i)&&note.start<span.end&&note.start+note.duration>span.start);
  if(index>=0)assignments.set(index,{offset:span.start-notes[index].start,beats:span.end-span.start});
 }
 return assignments;
}
