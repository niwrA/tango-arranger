/** Common score import contract for MusicXML and Standard MIDI Files.
 * MIDI timing is read in ticks, not seconds: tempo changes affect playback
 * but cannot change a note's position in musical quarter-note beats.
 */
import {Midi} from '@tonejs/midi';
import {parseMusicXmlDetailed,type ParsedMusicXml,type XmlMeasure,type XmlPart} from './musicXmlImport';
import type {Note} from './music';

export type ScoreImportResult={parsed:ParsedMusicXml;sourceXml:string;format:'musicxml'|'midi'};
const round=(n:number)=>Math.round(n*1e6)/1e6;
type TimeSignature={ticks:number;timeSignature:number[]};
export function parseMidiDetailed(buffer:ArrayBuffer,title='Imported MIDI'):ParsedMusicXml{
 const midi=new Midi(buffer);
 const ppq=midi.header.ppq;
 if(!Number.isFinite(ppq)||ppq<=0)throw Error('MIDI has no valid tick resolution');
 const warnings:string[]=['MIDI does not encode notation-quality lyrics or explicit chord symbols. Chord suggestions are inferred and require review.'];
 const tracks=midi.tracks.filter(track=>track.notes.length>0);
 if(!tracks.length)throw Error('MIDI contains no pitched notes');
 const parts:XmlPart[]=tracks.map((track,i)=>{
  const notes:Note[]=track.notes.filter(n=>n.durationTicks>0).map(n=>({
   pitch:n.midi,start:round(n.ticks/ppq),duration:round(n.durationTicks/ppq),
   velocity:Math.max(1,Math.min(127,Math.round(n.velocity*127))),source:'imported' as const
  })).sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  return {id:'MIDI'+(i+1),name:track.name?.trim()||'Track '+(i+1),notes,staffCount:1,measureCount:0,pitchedMeasures:0};
 });
 const signatureEvents=(midi.header.timeSignatures as TimeSignature[])
  .filter(t=>Number.isFinite(t.ticks)&&t.ticks>=0&&Number.isInteger(t.timeSignature[0])&&t.timeSignature[0]>0&&
    Number.isInteger(t.timeSignature[1])&&t.timeSignature[1]>0&&t.timeSignature[1]<=32)
  .sort((a,b)=>a.ticks-b.ticks);
 const startSignature=signatureEvents.find(e=>e.ticks===0)?.timeSignature??[4,4];
 const endTick=Math.max(...tracks.flatMap(t=>t.notes.map(n=>n.ticks+n.durationTicks)));
 let pos=0,index=0,signatureIndex=0,signature=startSignature;
 const measures:XmlMeasure[]=[];
 while(pos<endTick-1e-7||!measures.length){
  while(signatureIndex<signatureEvents.length&&signatureEvents[signatureIndex].ticks<=pos+1e-7){
   signature=signatureEvents[signatureIndex].timeSignature;
   signatureIndex++;
  }
  const [numerator,denominator]=signature;
  const span=ppq*numerator*4/denominator;
  if(!Number.isFinite(span)||span<=0)throw Error('Invalid MIDI meter');
  const nextSignature=signatureEvents[signatureIndex]?.ticks;
  const remaining=nextSignature!==undefined&&nextSignature>pos?nextSignature-pos:span;
  // An off-bar meter change produces a shortened transitional measure.
  const measureTicks=Math.min(span,remaining);
  if(measureTicks<span-1e-7)warnings.push('A MIDI time-signature change falls inside a measure; review the shortened measure.');
  measures.push({number:++index,offset:round(pos/ppq),beats:round(measureTicks/ppq),
   beatType:denominator,keyFifths:null,mode:null,keyChanged:false,chords:[]});
  pos+=measureTicks;
  if(measures.length>512)throw Error('MIDI exceeds the 512-measure limit');
 }
 if(midi.header.tempos.length>1)warnings.push('MIDI tempo changes are retained in note beat positions, but Tango Arranger uses one project BPM.');
 if(midi.header.timeSignatures.length>1)warnings.push('MIDI contains time-signature changes; Tango Arranger uses one meter per arrangement.');
 const pitches=(part:XmlPart)=>measures.filter(m=>part.notes.some(n=>n.start>=m.offset-1e-7&&n.start<m.offset+m.beats-1e-7)).length;
 parts.forEach(part=>{part.measureCount=measures.length;part.pitchedMeasures=pitches(part);});
 return {parts,chords:measures.map(()=>''),keys:measures.map(()=>''),measures,measureCount:measures.length,warnings,title};
}
export async function readScoreImport(file:File):Promise<ScoreImportResult>{
 const name=file.name.toLowerCase();
 if(/\.(mid|midi)$/.test(name))return {parsed:parseMidiDetailed(await file.arrayBuffer(),file.name.replace(/\.(mid|midi)$/i,'')),sourceXml:'',format:'midi'};
 if(/\.(xml|musicxml)$/.test(name)){const sourceXml=await file.text();return {parsed:parseMusicXmlDetailed(sourceXml),sourceXml,format:'musicxml'};}
 throw Error('Choose a MusicXML (.xml, .musicxml) or MIDI (.mid, .midi) file');
}
