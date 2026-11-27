export type ExpectedMidiNote={pitch:number;beat:number;duration:number};
export type PlayedMidiNote={pitch:number;start:number;end?:number};

/** Collapse duplicate notation of one physical key and stop its expected
 * hold at a subsequent attack of the same pitch. */
export function normalizeMidiTargets(notes:readonly ExpectedMidiNote[]):ExpectedMidiNote[]{
 const pitchGroups=new Map<number,ExpectedMidiNote[]>();
 for(const note of notes){
  if(!Number.isInteger(note.pitch)||note.pitch<0||note.pitch>127||!Number.isFinite(note.beat)||note.beat<0||
   !Number.isFinite(note.duration)||note.duration<=0)continue;
  const group=pitchGroups.get(note.pitch)??[];
  group.push({...note});pitchGroups.set(note.pitch,group);
 }
 const ordered:ExpectedMidiNote[]=[];
 for(const group of pitchGroups.values()){
  group.sort((a,b)=>a.beat-b.beat);
  const unique:ExpectedMidiNote[]=[];
  for(const n of group){
   const previous=unique.at(-1);
   if(previous&&n.beat-previous.beat<1e-6)previous.duration=Math.max(previous.duration,n.duration);
   else unique.push(n);
  }
  unique.forEach((n,i)=>{const next=unique[i+1];if(next)n.duration=Math.min(n.duration,next.beat-n.beat);});
  ordered.push(...unique);
 }
 return ordered.sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);
}

/** Compare attacks in order per pitch. The earliest eligible pair leaves the
 * most room for later repeated notes and each actual key strike is used once. */
export function assessTimedMidi(expected:readonly ExpectedMidiNote[],played:readonly PlayedMidiNote[],startMs:number,msPerBeat:number,endMs:number){
 const sorted=[...expected].sort((a,b)=>a.beat-b.beat);
 const byPitch=new Map<number,PlayedMidiNote[]>();
 for(const note of [...played].sort((a,b)=>a.start-b.start)){
  const group=byPitch.get(note.pitch)??[];group.push(note);byPitch.set(note.pitch,group);
 }
 const index=new Map<number,number>(),window=msPerBeat*.5;
 let matched=0,onsetTotal=0,durationTotal=0;
 for(const note of sorted){
  const group=byPitch.get(note.pitch);if(!group)continue;
  const target=startMs+note.beat*msPerBeat;
  let i=index.get(note.pitch)??0;
  while(i<group.length&&group[i].start<target-window)i++;
  const playedNote=group[i];
  if(playedNote&&playedNote.start<=target+window){
   onsetTotal+=Math.abs(playedNote.start-target);
   durationTotal+=Math.abs(Math.max(0,(playedNote.end??endMs)-playedNote.start)-note.duration*msPerBeat);
   i++;matched++;
  }
  index.set(note.pitch,i);
 }
 return {matched,missed:expected.length-matched,extra:played.length-matched,
  meanOnsetMs:matched?Math.round(onsetTotal/matched):0,meanDurationMs:matched?Math.round(durationTotal/matched):0};
}

/** Track overlapping/retriggered same-channel keys without leaving the first
 * event's duration open until the overall take ends. */
export function recordMidiPracticeKey(played:PlayedMidiNote[],held:Map<string,PlayedMidiNote[]>,
 event:{kind:'on'|'off';pitch:number;channel:number;time:number}){
 const key=event.channel+':'+event.pitch;
 const group=held.get(key)??[];
 if(event.kind==='on'){
  const previous=group.at(-1);
  if(previous&&previous.end===undefined)previous.end=event.time;
  const note={pitch:event.pitch,start:event.time};
  played.push(note);group.push(note);held.set(key,group);
 }else{
  const note=group.shift();
  if(note&&note.end===undefined)note.end=event.time;
  if(!group.length)held.delete(key);
 }
}
