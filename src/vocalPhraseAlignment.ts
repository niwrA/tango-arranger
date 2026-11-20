import type {Note} from './music';

export type VocalPhrase={start:number;end:number;label:string};
export type CapturedVocalNote={bar:number;beat:number;pitch:number;duration:number};

/** Group lyric-bearing notes into bounded, section-aware measure ranges. */
export function vocalPhrases(notes:Note[],beats:number,sections:string[],maxMeasures=4):VocalPhrase[]{
 const ordered=notes.filter(n=>n.lyric&&Number.isFinite(n.start)).slice().sort((a,b)=>a.start-b.start);
 const phrases:VocalPhrase[]=[];
 let group:Note[]=[];
 const flush=()=>{
  if(!group.length)return;
  phrases.push({start:Math.floor(group[0].start/beats)+1,
   end:Math.floor(group[group.length-1].start/beats)+1,
   label:group.map(n=>n.lyric).join(' ').slice(0,65)});
  group=[];
 };
 for(const note of ordered){
  const bar=Math.floor(note.start/beats);
  const previous=group[group.length-1];
  if(previous){
   const prevBar=Math.floor(previous.start/beats);
   const firstBar=Math.floor(group[0].start/beats);
   if(note.start-(previous.start+previous.duration)>=beats||sections[bar]!==sections[prevBar]||bar-firstBar>=maxMeasures)flush();
  }
  group.push(note);
 }
 flush();return phrases;
}

/** Time-proportional, monotonic initial mapping; manual indices may override it. */
export function suggestVocalAlignment(captured:CapturedVocalNote[],lyrics:Note[],beats:number):number[]{
 if(!lyrics.length)return captured.map(()=>-1);
 const ordered=lyrics.slice().sort((a,b)=>a.start-b.start);
 const first=ordered[0].start,last=ordered[ordered.length-1].start;
 const captureTimes=captured.map(n=>n.bar*beats+n.beat);
 const firstCapture=Math.min(...captureTimes),lastCapture=Math.max(...captureTimes);
 let previous=0;
 return captureTimes.map((time,i)=>{
  const relative=lastCapture>firstCapture?(time-firstCapture)/(lastCapture-firstCapture):captured.length>1?i/(captured.length-1):0;
  const target=first+(last-first)*relative;
  let best=previous;
  for(let j=previous+1;j<ordered.length;j++){
   if(Math.abs(ordered[j].start-target)<Math.abs(ordered[best].start-target))best=j;
  }
  previous=best;return best;
 });
}

/** Keep repeated-syllable notes as melismas rather than duplicating words. */
export function alignedLyric(index:number,previousIndex:number,lyrics:Note[]):Pick<Note,'lyric'|'syllabic'>{
 if(index<0||!lyrics[index]?.lyric)return {};
 if(index===previousIndex)return {lyric:undefined,syllabic:'middle'};
 return {lyric:lyrics[index].lyric,syllabic:'single'};
}
