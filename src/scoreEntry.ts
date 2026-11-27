const steps=['C','D','E','F','G','A','B'];
const semitones=[0,2,4,5,7,9,11];
const sharps=['F','C','G','D','A','E','B'];
const flats=[...sharps].reverse();
const diatonic=(step:string,octave:number)=>(octave+1)*7+steps.indexOf(step);
type Clef={line:number;position:number};
type WrittenPitch={beat:number;staff:number;position:number;alter:number};
type OctaveMark={beat:number;staff:number;number:string;shift:number};
export type MeasureNotation={fifths:number;clefs:ReadonlyMap<number,Clef>;pitches:WrittenPitch[];octaves:OctaveMark[]};
export type EngravedBeat={x:number;beat:number};
const children=(parent:Element)=>Array.from(parent.childNodes).filter((node):node is Element=>node.nodeType===1);
const child=(parent:Element|undefined,tag:string)=>parent&&children(parent).find(element=>element.tagName===tag);
const content=(parent:Element|undefined,tag:string)=>child(parent,tag)?.textContent;

/** Use the MusicXML sent to the renderer so entry follows its actual spelling and staff assignment. */
export function readScoreEntryNotation(xml:Document):MeasureNotation[]{
 let fifths=0,divisions=1;
 const clefs=new Map<number,Clef>([[1,{line:2,position:diatonic('G',4)}]]);
 const activeOctaves=new Map<string,OctaveMark>();
 const part=child(xml.documentElement,'part');
 if(!part)return [];
 return children(part).filter(element=>element.tagName==='measure').map(measure=>{
  const pitches:WrittenPitch[]=[];
  const octaves=[...activeOctaves.values()].map(mark=>({...mark,beat:0}));
  let cursor=0,onset=0;
  for(const event of children(measure)){
   if(event.tagName==='attributes'){
    const key=content(child(event,'key'),'fifths'),resolution=content(event,'divisions');
    if(key)fifths=Number(key);
    if(resolution)divisions=Number(resolution);
    for(const clef of children(event).filter(element=>element.tagName==='clef')){
     const sign=content(clef,'sign')??'G';
     const line=Number(content(clef,'line')??2);
     const octave=(sign==='F'?3:4)+Number(content(clef,'clef-octave-change')??0);
     clefs.set(Number(clef.getAttribute('number')??1),{line,position:diatonic(sign,octave)});
    }
   }
   const duration=Number(content(event,'duration')??0)/divisions;
   if(event.tagName==='backup')cursor-=duration;
   if(event.tagName==='forward')cursor+=duration;
   if(event.tagName==='direction'){
    const mark=child(child(event,'direction-type'),'octave-shift');
    const type=mark?.getAttribute('type');
    if(mark&&(type==='up'||type==='down'||type==='stop')){
     const octavesFromSize=Math.max(1,Math.round((Number(mark.getAttribute('size')||8)-1)/7));
     octaves.push({beat:cursor+Number(content(event,'offset')??0)/divisions,staff:Number(content(event,'staff')??1),
      number:mark.getAttribute('number')||'1',shift:type==='stop'?0:12*octavesFromSize*(type==='down'?-1:1)});
    }
   }
   if(event.tagName!=='note')continue;
   if(!child(event,'chord')){onset=cursor;cursor+=duration;}
   const pitch=child(event,'pitch');
   const step=content(pitch,'step');
   const tied=children(event).some(element=>element.tagName==='tie'&&element.getAttribute('type')==='stop');
   if(!step||!steps.includes(step)||tied||child(event,'grace'))continue;
   pitches.push({beat:onset,staff:Number(content(event,'staff')??1),
    position:diatonic(step,Number(content(pitch,'octave'))),
    alter:Number(content(pitch,'alter')??0)});
  }
  pitches.sort((a,b)=>a.beat-b.beat);
  octaves.sort((a,b)=>a.beat-b.beat);
  for(const mark of octaves){
   const key=mark.staff+':'+mark.number;
   if(mark.shift)activeOctaves.set(key,mark);else activeOctaves.delete(key);
  }
  return {fifths,clefs:new Map(clefs),pitches,octaves};
 });
}

export function scoreEntryOctaveShift(notation:MeasureNotation,staff:number,beat:number):number{
 const active=new Map<string,number>();
 for(const mark of notation.octaves){
  if(mark.beat>beat+1e-7)break;
  if(mark.staff===staff)active.set(mark.number,mark.shift);
 }
 return [...active.values()].reduce((sum,shift)=>sum+shift,0);
}

export function scoreEntryPitch(notation:MeasureNotation,staff:number,stepsAboveBottom:number,beat:number,transpose:number):number|undefined{
 const clef=notation.clefs.get(staff);
 if(!clef)return;
 const shift=scoreEntryOctaveShift(notation,staff,beat);
 const position=clef.position-2*(clef.line-1)+stepsAboveBottom-shift/12*7;
 const degree=((position%7)+7)%7;
 const altered=notation.fifths<0?flats:sharps;
 let alter=altered.slice(0,Math.abs(notation.fifths)).includes(steps[degree])?Math.sign(notation.fifths):0;
 for(const pitch of notation.pitches){
  if(pitch.beat>beat+1e-7)break;
  if(pitch.staff===staff&&pitch.position===position)alter=pitch.alter;
 }
 return Math.floor(position/7)*12+semitones[degree]+alter-transpose;
}

/** Exact engraved attacks and rests preserve tuplets. Between columns use the active grid step. */
export function scoreEntryBeat(x:number,columns:readonly EngravedBeat[],startX:number,endX:number,length:number,step:number):number{
 const anchors=columns.filter(column=>column.beat<length-1e-7).sort((a,b)=>a.beat-b.beat);
 const nearest=anchors.reduce<EngravedBeat|undefined>((best,column)=>
  !best||Math.abs(x-column.x)<Math.abs(x-best.x)?column:best,undefined);
 if(nearest&&Math.abs(x-nearest.x)<=5)return nearest.beat;
 const points=anchors[0]?.beat===0?[...anchors]:[{x:startX,beat:0},...anchors];
 points.push({x:endX,beat:length});
 const index=points.findIndex(point=>x<=point.x);
 if(index===0)return points[0].beat;
 if(index<0)return Math.max(0,length-step);
 const left=points[index-1],right=points[index];
 const raw=left.beat+(right.beat-left.beat)*(x-left.x)/Math.max(1,right.x-left.x);
 const snapped=Math.round(raw/step)*step;
 return Math.max(0,Math.min(snapped<length?snapped:Math.ceil(length/step-1)*step,length));
}
