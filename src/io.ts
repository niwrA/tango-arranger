import JSZip from 'jszip';
import { Midi } from '@tonejs/midi';
import {INSTRUMENTS,parsePitch,midiName,transposeScore,transposeChord,parseChordSequence,chordSequenceFromBeats,type ChordChange,type Project,type Score,type Note,type Instrument} from './music';
export function download(content: Blob | string, filename: string, mimeType = 'application/octet-stream'): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const harmonyRootXml=(chord:string)=>{const m=chord.match(/^([A-G])([#b]?)/);return `<root><root-step>${m?.[1]??'C'}</root-step>${m?.[2]?`<root-alter>${m[2]==='#'?1:-1}</root-alter>`:''}</root>`;};
const pitchXml=(n:number)=>{const m=midiName(n).match(/^([A-G])([#b]?)(-?\d+)$/)!;return `<pitch><step>${m[1]}</step>${m[2]?`<alter>${m[2]==='#'?1:-1}</alter>`:''}<octave>${m[3]}</octave></pitch>`;};
// All export timing uses integer divisions. A segment is either a rest or a
// simultaneous pitch set; durations are never accumulated twice for chords.
const DIV=480;
const durationType=(ticks:number):[string,number]=>{
  const table:[number,string,number][]=[[1920,'whole',0],[1440,'half',1],[960,'half',0],[720,'quarter',1],[480,'quarter',0],[360,'eighth',1],[240,'eighth',0],[180,'16th',1],[120,'16th',0],[60,'32nd',0],[30,'64th',0]];
  const item=table.find((x:[number,string,number])=>x[0]===ticks);
  if(!item)throw Error(`Unsupported rhythmic duration ${ticks} ticks`);
  return [item[1],item[2]];
};
const chunks=(ticks:number)=>{const values=[1920,1440,960,720,480,360,240,180,120,60,30];const out:number[]=[];let remaining=ticks;for(const v of values)while(remaining>=v){out.push(v);remaining-=v;}if(remaining)throw Error(`Duration not representable at 1/16 beat: ${ticks}`);return out;};
function writeVoice(notes:Note[],bar:number,beats:number){
  const barTicks=Math.round(beats*DIV),offset=bar*beats;
  const events=notes.map(n=>({pitch:n.pitch,accent:n.accent,start:Math.round((n.start-offset)*DIV),end:Math.round((n.start-offset+n.duration)*DIV),technique:n.technique,articulation:n.articulation}))
    .filter(n=>n.end>0&&n.start<barTicks).map(n=>({...n,start:Math.max(0,n.start),end:Math.min(barTicks,n.end)}))
    .filter(n=>n.end>n.start);
  // A fixed 1/16-beat grid avoids unsupported note lengths and makes
  // overlapping melody/chord notes a valid succession of tied chords.
  const quantum=30;
  const snapped=events.map(n=>({...n,start:Math.max(0,Math.round(n.start/quantum)*quantum),end:Math.min(barTicks,Math.round(n.end/quantum)*quantum)})).filter(n=>n.end>n.start);
  const boundaries=new Set<number>([0,barTicks]);
  for(const n of snapped){boundaries.add(n.start);boundaries.add(n.end);}
  const points=[...boundaries].sort((a,b)=>a-b);
  let out='';
  let activeTechnique:'pizzicato'|'arco'='arco';let activeArticulation='';
  for(let i=0;i<points.length-1;i++){
    const at=points[i],end=points[i+1],active=snapped.filter(n=>n.start<=at&&n.end>=end).sort((a,b)=>a.pitch-b.pitch);
    const pitches=[...new Set(active.map(n=>n.pitch))];
    let elapsed=0;
    for(const dur of chunks(end-at)){
      const nextTechnique=active.find(n=>n.technique)?.technique??'arco';
      const mode=active.find(n=>n.articulation)?.articulation??'';
      if(pitches.length&&mode!==activeArticulation){if(mode)out+=`<direction placement="above"><direction-type><words>${mode==='marcato_staccato'?'marcato':mode}</words></direction-type></direction>`;activeArticulation=mode;}
      if(pitches.length&&nextTechnique!==activeTechnique){out+=`<direction><direction-type><words>${nextTechnique==='pizzicato'?'pizz.':'arco'}</words></direction-type><sound pizzicato="${nextTechnique==='pizzicato'?'yes':'no'}"/></direction>`;activeTechnique=nextTechnique;}
      const [type,dots]=durationType(dur),dot=dots?'<dot/>':'';
      if(!pitches.length)out+=`<note><rest/><duration>${dur}</duration><type>${type}</type>${dot}</note>`;
      else for(let j=0;j<pitches.length;j++){
        const pitch=pitches[j],sources=active.filter(n=>n.pitch===pitch);
        const begin=at+elapsed,endSegment=begin+dur;
        const tieStart=sources.some(n=>n.end>endSegment);
        const tieStop=sources.some(n=>n.start<begin);
        const ties=`${tieStop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}`;
        const isAttack=!tieStop;const accent=isAttack&&sources.some(n=>n.accent&&n.start===begin);
        const staccato=isAttack&&sources.some(n=>n.articulation==='staccato'||n.articulation==='marcato_staccato');
        const marks=(accent?'<accent/>':'')+(staccato?'<staccato/>':'');
        const articulationMarks=marks?`<articulations>${marks}</articulations>`:'';
        const notations=(tieStop||tieStart||articulationMarks)?`<notations>${tieStop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}${articulationMarks}</notations>`:'';
        out+=`<note>${j?'<chord/>':''}${pitchXml(pitch)}<duration>${dur}</duration>${ties}<type>${type}</type>${dot}${notations}</note>`;
      }
      elapsed+=dur;
    }
  }
  return out;
}
export function exportMusicXml(p:Project,score:Score){
  if(!Number.isInteger(p.beats)||p.beats<1||p.beats>12)throw Error('Unsupported meter');
  const transposed=transposeScore(score,p.transposeSemitones??0);
  const head=`<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${esc(p.title)}</work-title></work><movement-title>${esc(p.title)}</movement-title><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>${INSTRUMENTS.map((inst,i)=>`<score-part id="P${i+1}"><part-name>${esc(inst)}</part-name><part-abbreviation>${esc(inst)}</part-abbreviation><score-instrument id="I${i+1}"><instrument-name>${esc(inst)}</instrument-name></score-instrument></score-part>`).join('')}</part-list>`;
  const dynamics=p.expression?.enabled!==false?(p.expression?.sections??{A1:'mp',B1:'mf',A2:'mp',B2:'f',C:'f'}):null;
  const dynamicDirection=(inst:Instrument,b:number)=>{
    if(!dynamics)return '';
    const sec=p.bars[b].section,prev=b?p.bars[b-1].section:'';
    if(sec===prev)return '';
    const mark=dynamics[sec]??'mf';
    const value=({pp:40,p:52,mp:64,mf:78,f:90,ff:104} as Record<string,number>)[mark]??78;
    const offset=p.instrumentSettings?.[inst]?.dynamicsOffset??0;
    return `<direction placement="below"><direction-type><dynamics default-x="3" default-y="-40"><${mark}/></dynamics></direction-type><sound dynamics="${Math.max(1,Math.min(127,value+offset))}"/></direction>`;
  };
  const crescendoDirection=(b:number)=>{
    if(!p.expression?.enabled||!p.expression.crescendo)return '';
    const sec=p.bars[b].section;
    const start=b===0||p.bars[b-1].section!==sec;
    const end=b>0&&p.bars[b-1].section===sec&&(b===p.bars.length-1||p.bars[b+1].section!==sec);
    if(start && (b===p.bars.length-1||p.bars[b+1].section!==sec))return '';
    return `${start?'<direction placement="below"><direction-type><wedge number="1" type="crescendo" spread="0"/></direction-type></direction>':''}${end?'<direction placement="below"><direction-type><wedge number="1" type="stop" spread="15"/></direction-type></direction>':''}`;
  };
  const body=INSTRUMENTS.map((inst,i)=>`<part id="P${i+1}">${p.bars.map((bar,b)=>`<measure implicit="no" number="${b+1}">${b===0?`<attributes><divisions>${DIV}</divisions><key><fifths>0</fifths></key><time><beats>${p.beats}</beats><beat-type>4</beat-type></time><clef><sign>${inst==='Contrabass'?'F':'G'}</sign><line>${inst==='Contrabass'?4:2}</line></clef></attributes><direction placement="above"><direction-type><words>${esc(p.profile)}</words></direction-type></direction><direction><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${p.bpm}</per-minute></metronome></direction-type><sound tempo="${p.bpm}"/></direction>`:''}${dynamicDirection(inst,b)}${i===0?crescendoDirection(b):''}${i===0?parseChordSequence(bar.chord,p.beats).filter((c,j,a)=>j===0||c.chord!==a[j-1].chord).map(c=>{const symbol=transposeChord(c.chord,p.transposeSemitones??0);return `<harmony>${harmonyRootXml(symbol)}<kind text="${esc(symbol)}">other</kind>${c.beat?`<offset>${c.beat*DIV}</offset>`:''}</harmony>`;}).join(''):''}${writeVoice(transposed[inst]??[],b,p.beats)}</measure>`).join('')}</part>`).join('');
  return head+body+'</score-partwise>';
}
export function validateMusicXmlDurations(xml:string,beats:number,parts=INSTRUMENTS.length):string[]{
  const problems:string[]=[];
  const partBlocks=[...xml.matchAll(/<part id="P(\d+)">([\s\S]*?)<\/part>/g)];
  if(partBlocks.length!==parts)problems.push(`Expected ${parts} parts, found ${partBlocks.length}`);
  for(const part of partBlocks){
    for(const measure of part[2].matchAll(/<measure[^>]*number="(\d+)"[^>]*>([\s\S]*?)<\/measure>/g)){
      let ticks=0;
      for(const note of measure[2].matchAll(/<note>([\s\S]*?)<\/note>/g)){
        if(!note[1].includes('<chord/>'))ticks+=Number(note[1].match(/<duration>(\d+)<\/duration>/)?.[1]??0);
      }
      if(ticks!==beats*DIV)problems.push(`Part ${part[1]}, measure ${measure[1]}: ${ticks} ticks (expected ${beats*DIV})`);
    }
  }
  return problems;
}
export async function saveProject(p:Project){const zip=new JSZip();zip.file('project.json',JSON.stringify(p,null,2));if(p.generatedScore)zip.file('score/generated.musicxml',exportMusicXml(p,p.generatedScore));if(p.importedScore)zip.file('score/edited.musicxml',exportMusicXml(p,p.importedScore));download(await zip.generateAsync({type:'blob'}),p.title.replace(/[^a-z0-9-]+/gi,'-').toLowerCase()+'.tango');}
export async function loadProject(file:File):Promise<Project>{const zip=await JSZip.loadAsync(file);const data=zip.file('project.json');if(!data)throw Error('No project.json in archive');const p=JSON.parse(await data.async('string')) as Project;if(p.version!==1||!Array.isArray(p.bars))throw Error('Unsupported project format');return p;}
function nodeText(e:Element|null,tag:string){return e?.getElementsByTagName(tag)[0]?.textContent??'';}
export function importMusicXml(text:string):{parts:{name:string;notes:Note[]}[];chords:string[]}{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid MusicXML');const names=Array.from(doc.getElementsByTagName('score-part')).map(e=>nodeText(e,'part-name'));const parts=Array.from(doc.getElementsByTagName('part')).map((part,i)=>{let cursor=0;const notes:Note[]=[];for(const measure of Array.from(part.getElementsByTagName('measure'))){let pos=cursor,lastStart=cursor;const divisions=Number(nodeText(measure,'divisions'))||480;for(const child of Array.from(measure.children)){if(child.tagName==='backup')pos-=Number(nodeText(child,'duration'))/divisions;if(child.tagName==='forward')pos+=Number(nodeText(child,'duration'))/divisions;if(child.tagName!=='note')continue;const dur=Number(nodeText(child,'duration'))/divisions||1;const chord=!!child.getElementsByTagName('chord').length;const start=chord?lastStart:pos;const pitch=child.getElementsByTagName('pitch')[0];if(pitch){const step=nodeText(pitch,'step'),alter=Number(nodeText(pitch,'alter'))||0,oct=nodeText(pitch,'octave');const name=step+(alter===1?'#':alter===-1?'b':'')+oct;const n=parsePitch(name);if(n!==null)notes.push({pitch:n,start,duration:dur,source:'imported'});}if(!chord){lastStart=pos;pos+=dur;}}cursor=Math.max(cursor,pos);}return {name:names[i]??`Part ${i+1}`,notes};});const firstPart=doc.getElementsByTagName('part')[0];
  const chords=Array.from(firstPart?.getElementsByTagName('measure')??[]).map(measure=>{
    const changes:ChordChange[]=[];let cursor=0,lastStart=0;
    const divisions=Number(nodeText(measure,'divisions'))||480;
    for(const child of Array.from(measure.children)){
      if(child.tagName==='backup'){cursor-=Number(nodeText(child,'duration'))/divisions;continue;}
      if(child.tagName==='forward'){cursor+=Number(nodeText(child,'duration'))/divisions;continue;}
      if(child.tagName==='harmony'){
        const kind=child.getElementsByTagName('kind')[0];
        const symbol=kind?.getAttribute('text')||nodeText(child,'root-step')||'Dm';
        const beat=cursor+Number(nodeText(child,'offset')||0)/divisions;
        if(Number.isInteger(beat)&&beat>=0&&beat<12)changes.push({beat,chord:symbol});
      }
      if(child.tagName==='note'){
        const dur=Number(nodeText(child,'duration'))/divisions||0;
        if(!child.getElementsByTagName('chord').length){lastStart=cursor;cursor+=dur;}else cursor=Math.max(cursor,lastStart);
      }
    }
    const beats=Number(nodeText(measure,'beats'))||4;
    return chordSequenceFromBeats(changes,beats);
  });return {parts,chords};}
export function importMidi(buffer:ArrayBuffer){const midi=new Midi(buffer);return midi.tracks.filter(t=>t.notes.length).map(t=>({name:t.name||`Track ${t.channel+1}`,notes:t.notes.map(n=>({pitch:n.midi,start:n.time/(60/(midi.header.tempos[0]?.bpm||120)),duration:n.duration/(60/(midi.header.tempos[0]?.bpm||120)),source:'imported' as const}))}));}
export function scoreFromParts(parts:{name:string;notes:Note[]}[]):Score {const result=Object.fromEntries(INSTRUMENTS.map(i=>[i,[]])) as Score;for(let i=0;i<Math.min(parts.length,INSTRUMENTS.length);i++){const found=INSTRUMENTS.find(n=>n.toLowerCase()===parts[i].name.toLowerCase())??INSTRUMENTS[i];result[found]=parts[i].notes;}return result;}
