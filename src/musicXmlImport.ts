/** Robust MusicXML score-partwise reader for OMR imports and merge previews.
 * Time and divisions persist between measures. All note times are quarter-beat
 * units, independent of MusicXML's divisions, voices, staves and backups. */
import type {Note} from './music';

export type XmlMeasure={
  number:number;offset:number;beats:number;beatType:number;keyFifths:number|null;
  mode:'major'|'minor'|null;keyChanged:boolean;rehearsal?:string;
  chords:{beat:number;symbol:string}[];
};
export type XmlPart={id:string;name:string;notes:Note[];staffCount:number;measureCount:number;pitchedMeasures:number;slashAttacks?:{start:number;duration:number;staff:number}[]};
export type ParsedMusicXml={
  parts:XmlPart[];chords:string[];keys:string[];measures:XmlMeasure[];measureCount:number;
  warnings:string[];title:string;
};
const children=(parent:Element):Element[]=>Array.from(parent.childNodes).filter(n=>n.nodeType===1) as Element[];
const direct=(parent:Element,tag:string):Element|undefined=>
 children(parent).find(child=>child.localName===tag||child.tagName===tag);
const descendants=(parent:Element|undefined,tag:string):Element[]=>parent?Array.from(parent.getElementsByTagName(tag)):[];
const value=(parent:Element|undefined,tag:string):string=>parent?descendants(parent,tag)[0]?.textContent?.trim()??'':'';
const numeric=(parent:Element|undefined,tag:string,otherwise=0):number=>{
 const raw=value(parent,tag);if(!raw)return otherwise;
 const n=Number(raw);return Number.isFinite(n)?n:otherwise;
};
const pitchClass:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
const majorKeys:Record<number,string>={'-7':'Cb','-6':'Gb','-5':'Db','-4':'Ab','-3':'Eb','-2':'Bb','-1':'F',0:'C',1:'G',2:'D',3:'A',4:'E',5:'B',6:'F#',7:'C#'};
const minorKeys:Record<number,string>={'-7':'Abm','-6':'Ebm','-5':'Bbm','-4':'Fm','-3':'Cm','-2':'Gm','-1':'Dm',0:'Am',1:'Em',2:'Bm',3:'F#m',4:'C#m',5:'G#m',6:'D#m',7:'A#m'};
const quality=(kind:Element|undefined):string=>{
 const k=kind?.textContent?.trim().toLowerCase()??'';
 if(kind?.hasAttribute('text'))return kind.getAttribute('text')!.trim();
 if(k==='major-sixth')return '6';
 if(k==='minor-sixth')return 'm6';
 if(k==='dominant-ninth')return '9';
 if(k==='suspended-fourth')return 'sus4';
 if(k.includes('major-seventh'))return 'maj7';
 if(k.includes('minor-seventh'))return 'm7';
 if(k.includes('diminished-seventh'))return 'dim7';
 if(k.includes('half-diminished'))return 'm7b5';
 if(k.includes('dominant'))return '7';
 if(k.includes('minor'))return 'm';
 if(k.includes('diminished'))return 'dim';
 if(k.includes('augmented'))return 'aug';
 return '';
};
const chordAt=(node:Element):string=>{
 const root=direct(node,'root');
 const step=value(root,'root-step');
 if(!step)return '';
 const alter=numeric(root,'root-alter');
 const accidental=alter===1?'#':alter===-1?'b':'';
 const rootName=step+accidental,kind=direct(node,'kind');
 const suffix=quality(kind);
 const bass=direct(node,'bass'),bassStep=value(bass,'bass-step'),bassAlter=numeric(bass,'bass-alter');
 const inversion=bassStep?'/'+bassStep+(bassAlter===1?'#':bassAlter===-1?'b':''):'';
 if(kind?.textContent?.trim()==='other'&&suffix.startsWith(rootName))return suffix+inversion;
 return rootName+suffix+inversion;
};
const lyric=(node:Element,verse:number)=>{
 const element=descendants(node,'lyric').find(e=>(Number(e.getAttribute('number')||1))===verse);
 if(!element)return {};
 const text=value(element,'text');
 const raw=value(element,'syllabic');
 const syllabic=(['single','begin','middle','end'].includes(raw)?raw:'single') as 'single'|'begin'|'middle'|'end';
 const extend=descendants(element,'extend').some(el=>el.getAttribute('type')==='start');
 if(verse===1)return {...(text?{lyric:text,syllabic}:{}),...(extend?{melisma:true}:{})};
 return {...(text?{lyric2:text,syllabic2:syllabic}:{}),...(extend?{melisma2:true}:{})};
};
function parsePitch(node:Element):number|null{
 const pitch=direct(node,'pitch');if(!pitch)return null;
 const letter=value(pitch,'step');if(!(letter in pitchClass))return null;
 const octave=numeric(pitch,'octave',NaN),alter=numeric(pitch,'alter');
 const midi=(octave+1)*12+pitchClass[letter]+alter;
 return Number.isInteger(midi)&&midi>=0&&midi<=127?midi:null;
}
const chordSequence=(changes:{beat:number;symbol:string}[],beats:number):string=>{
 if(!changes.length)return '';
 const ordered=[...changes].sort((a,b)=>a.beat-b.beat);
 if(ordered[0].beat>0.001)return '';
 const labels=Array.from({length:Math.max(1,Math.ceil(beats))},(_,beat)=>{
  let active=ordered[0].symbol;
  for(const change of ordered)if(change.beat<=beat+1e-7)active=change.symbol;
  return active;
 });
 if(labels.every(s=>s===labels[0]))return labels[0];
 if(labels.length%2===0&&labels.slice(0,labels.length/2).every(s=>s===labels[0])&&labels.slice(labels.length/2).every(s=>s===labels[labels.length/2]))
   return labels[0]+','+labels[labels.length/2];
 return labels.join(',');
};
export function parseMusicXmlDetailed(text:string):ParsedMusicXml{
 const doc=new DOMParser().parseFromString(text,'application/xml');
 if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName!=='score-partwise')
   throw Error('Expected a valid MusicXML score-partwise document');
 const list=doc.getElementsByTagName('score-part');
 const names=new Map(Array.from(list).map(e=>[e.getAttribute('id')??'',value(e,'part-name')]));
 const partNodes=Array.from(doc.getElementsByTagName('part'));
 if(!partNodes.length)throw Error('MusicXML contains no score parts');
 const warnings:string[]=[],parts:XmlPart[]=[];
 const reference:XmlMeasure[]=[];
 for(const [partIndex,partNode] of partNodes.entries()){
  const id=partNode.getAttribute('id')??String(partIndex+1);
  const measures=children(partNode).filter(e=>e.localName==='measure');
  let divisions=1,beats=4,beatType=4,fifths:number|null=null,mode:'major'|'minor'|null=null,offset=0,staves=1,transpose=0;
  let hasKey=false;
  const notes:Note[]=[];
  const slashAttacks:{start:number;duration:number;staff:number}[]=[];
  let pitchedMeasures=0;
  for(const [mIndex,measure] of measures.entries()){
   let cursor=0,maxPosition=0,lastStart=0,hadPitch=false;
   const harmonies:{beat:number;symbol:string}[]=[];
   let rehearsal:string|undefined,keyChanged=false;
   for(const child of children(measure)){
    if(child.localName==='attributes'){
      const d=direct(child,'divisions');
      if(d){
       const n=Number(d.textContent);
       if(Number.isFinite(n)&&n>0)divisions=n;
       else warnings.push(id+': invalid divisions in measure '+(mIndex+1));
      }
      const t=direct(child,'time');
      if(t){const b=numeric(t,'beats',beats),typ=numeric(t,'beat-type',beatType);if(b>0&&typ>0){beats=b;beatType=typ;}}
      const k=direct(child,'key');
      if(k){
       const n=numeric(k,'fifths',0);
       if(n>=-7&&n<=7)fifths=n;
       const raw=value(k,'mode');
       mode=raw==='minor'?'minor':raw==='major'?'major':null;
       keyChanged=hasKey&&fifths!==null;
       hasKey=true;
      }
      const trans=direct(child,'transpose');
      if(trans)transpose=numeric(trans,'chromatic')+12*numeric(trans,'octave-change');
      const staffCount=numeric(child,'staves',staves);
      if(staffCount>=1&&staffCount<=16)staves=staffCount;
      continue;
    }
    if(child.localName==='direction'){
      const mark=descendants(child,'rehearsal')[0]?.textContent?.trim();
      if(mark)rehearsal=mark;continue;
    }
    if(child.localName==='backup'){cursor=Math.max(0,cursor-numeric(child,'duration')/divisions);lastStart=cursor;continue;}
    if(child.localName==='forward'){cursor+=numeric(child,'duration')/divisions;maxPosition=Math.max(cursor,maxPosition);continue;}
    if(child.localName==='harmony'){
      const symbol=chordAt(child);
      const beat=cursor+numeric(child,'offset')/divisions;
      if(symbol&&beat>=0&&beat<beats*4/beatType)harmonies.push({beat,symbol});
      continue;
    }
    if(child.localName!=='note')continue;
    const isChord=Boolean(direct(child,'chord'));
    const isGrace=Boolean(direct(child,'grace'));
    const duration=isGrace?0:numeric(child,'duration',0)/divisions;
    const start=isChord?lastStart:cursor;
    const pitch=parsePitch(child);
    const slash=value(child,'notehead')==='slash';
    if(slash&&duration>0&&!isChord)slashAttacks.push({start:offset+start,duration,staff:numeric(child,'staff',1)});
    if(!slash&&pitch!==null&&duration>0){
      const tiedStart=descendants(child,'tie').some(t=>t.getAttribute('type')==='stop');
      const art=descendants(child,'articulations')[0];
      const marcato=Boolean(art&&descendants(art,'accent').length);
      const staccato=Boolean(art&&descendants(art,'staccato').length);
      const legato=Boolean(art&&descendants(art,'tenuto').length);
      notes.push({
       pitch:pitch+transpose,start:Math.round((offset+start)*1e6)/1e6,
       duration:Math.round(duration*1e6)/1e6,source:'imported',
       ...(marcato?{accent:true,articulation:'marcato_staccato' as const}:staccato?{articulation:'staccato' as const}:legato?{articulation:'legato' as const}:{}),
       ...lyric(child,1),...lyric(child,2),
       ...(tiedStart?{xmlTieContinuation:true}:{}),
       xmlStaff:numeric(child,'staff',1),
       xmlVoice:value(child,'voice')||'1'
      } as Note);
      hadPitch=true;
    }
    if(!isChord&&!isGrace){lastStart=cursor;cursor+=duration;maxPosition=Math.max(maxPosition,cursor);}
   }
   const length=beats*4/beatType;
   if(maxPosition>length+.02)warnings.push(id+': measure '+(mIndex+1)+' overfills '+length+' beats ('+maxPosition.toFixed(2)+')');
   if(hadPitch)pitchedMeasures++;
   if(partIndex===0)reference.push({number:mIndex+1,offset,beats:length,beatType,keyFifths:fifths,mode,keyChanged,rehearsal,chords:harmonies});
   offset+=length;
  }
  parts.push({id,name:names.get(id)||'Part '+(partIndex+1),notes,staffCount:staves,measureCount:measures.length,pitchedMeasures,slashAttacks});
 }
 const count=Math.max(...parts.map(p=>p.measureCount));
 if(parts.some(p=>p.measureCount!==count))warnings.push('Parts differ in measure count; check alignment before merging');
 while(reference.length<count){
  const last=reference[reference.length-1];
  reference.push({number:reference.length+1,offset:last?last.offset+last.beats:0,beats:last?.beats??4,beatType:last?.beatType??4,keyFifths:last?.keyFifths??null,mode:last?.mode??null,keyChanged:false,chords:[]});
 }
 const chords=reference.map(m=>chordSequence(m.chords,m.beats));
 const keys=reference.map(m=>m.keyFifths===null?'':(m.mode==='minor'?minorKeys:majorKeys)[m.keyFifths]??'');
 const title=value(doc.documentElement,'work-title')||value(doc.documentElement,'movement-title')||'Imported MusicXML';
 return {parts,chords,keys,measures:reference,measureCount:count,warnings,title};
}