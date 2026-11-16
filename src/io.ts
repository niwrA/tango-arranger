import JSZip from 'jszip';
import { Midi } from '@tonejs/midi';
import {INSTRUMENTS,projectInstruments,pianoStaffForPitch,parsePitch,midiName,transposeScore,transposeChord,parseChordSequence,chordSequenceFromBeats,parseKeySignature,sectionKey,transposeKeySignature,inferSectionKeys,KEY_SIGNATURES,sectionLetter,type ChordChange,type Project,type Score,type Note,type Instrument} from './music';
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
/** Spell diatonic notes according to the active key signature, including the
 * raised leading tone of harmonic minor. Other chromatic notes use a simple
 * sharp/flat fallback; full voice-leading-based enharmonics remain future work. */
const pitchXml=(n:number,key='C')=>{
  const {fifths,mode}=parseKeySignature(key);
  const letters=['C','D','E','F','G','A','B'];
  const naturalPcs=[0,2,4,5,7,9,11];
  const sig:Record<string,number>={};
  for(const step of (fifths>0?['F','C','G','D','A','E','B']:['B','E','A','D','G','C','F']).slice(0,Math.abs(fifths)))sig[step]=fifths>0?1:-1;
  const spellings:Record<number,string>={};
  for(let i=0;i<7;i++){
    const letter=letters[i],alter=sig[letter]??0;
    const pc=(naturalPcs[i]+alter+12)%12;
    spellings[pc]=letter+(alter===1?'#':alter===-1?'b':'');
  }
  if(mode==='minor'){
    const tonic=key.replace(/m$/,'');
    const tonicIndex=letters.indexOf(tonic[0]);
    const leading=letters[(tonicIndex+6)%7];
    const raised=(sig[leading]??0)+1;
    const pc=(naturalPcs[letters.indexOf(leading)]+raised+12)%12;
    spellings[pc]=leading+(raised>0?'#'.repeat(raised):raised<0?'b'.repeat(-raised):'');
  }
  const fallback=fifths<0?['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B']:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const name=spellings[((n%12)+12)%12]??fallback[((n%12)+12)%12];
  const step=name[0],accidentals=name.slice(1);
  const alter=[...accidentals].reduce((sum,c)=>sum+(c==='#'?1:-1),0);
  const octave=(n-naturalPcs[letters.indexOf(step)]-alter)/12-1;
  if(!Number.isInteger(octave))throw Error(`Cannot spell MIDI note ${n} in key ${key}`);
  return `<pitch><step>${step}</step>${alter?`<alter>${alter}</alter>`:''}<octave>${octave}</octave></pitch>`;};
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
// Derive MusicXML extender phases from the ordered sung note onsets, including
// across barlines. A melisma flag marks the syllable that starts the span.
function lyricExtensionPhase(notes:Note[], source:Pick<Note,'start'>, verse:1|2):'start'|'continue'|'stop'|undefined {
  const lyricKey=verse===1?'lyric':'lyric2';
  const flagKey=verse===1?'melisma':'melisma2';
  const ordered=[...notes].sort((a,b)=>a.start-b.start||b.pitch-a.pitch);
  const unique=ordered.filter((n,i)=>i===0||n.start!==ordered[i-1].start);
  const idx=unique.findIndex(n=>n.start===source.start);
  if(idx<0)return undefined;
  const text=(unique[idx][lyricKey]??'').trim();
  if(text)return unique[idx][flagKey]&&idx+1<unique.length&&!unique[idx+1][lyricKey]?.trim()?'start':undefined;
  let begin=idx-1;
  while(begin>=0&&!unique[begin][lyricKey]?.trim())begin--;
  if(begin<0||!unique[begin][flagKey])return undefined;
  const next=idx+1<unique.length?unique[idx+1]:undefined;
  return !next||!!next[lyricKey]?.trim()?'stop':'continue';
}
function writeVoice(notes:Note[],bar:number,beats:number,key='C',voice?:number,staff?:number){
  const barTicks=Math.round(beats*DIV),offset=bar*beats;
  // Keep note-level dynamics in the export event projection; omitting subito
  // makes the MusicXML direction below fail TypeScript compilation.
  const events=notes.map(n=>({pitch:n.pitch,accent:n.accent,start:Math.round((n.start-offset)*DIV),end:Math.round((n.start-offset+n.duration)*DIV),technique:n.technique,articulation:n.articulation,slideTo:n.slideTo,swellTo:n.swellTo,subito:n.subito,velocity:n.velocity,lyric:n.lyric,syllabic:n.syllabic,lyric2:n.lyric2,syllabic2:n.syllabic2,melisma:n.melisma,melisma2:n.melisma2}))
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
  const voiceTag=voice?`<voice>${voice}</voice>`:'';
  const staffTag=staff?`<staff>${staff}</staff>`:'';
  let activeTechnique:'pizzicato'|'arco'|null=null;let activeArticulation='';
  for(let i=0;i<points.length-1;i++){
    const at=points[i],end=points[i+1],active=snapped.filter(n=>n.start<=at&&n.end>=end).sort((a,b)=>a.pitch-b.pitch);
    const pitches=[...new Set(active.map(n=>n.pitch))];
    let elapsed=0;
    for(const dur of chunks(end-at)){
      const nextTechnique=active.find(n=>n.technique)?.technique??'arco';
      const mode=active.find(n=>n.articulation)?.articulation??'';
      if(pitches.length&&mode!==activeArticulation){if(mode==='legato')out+=`<direction placement="above"><direction-type><words>legato</words></direction-type></direction>`;activeArticulation=mode;}
      if(pitches.length&&active.some(n=>n.technique)&&nextTechnique!==activeTechnique){out+=`<direction><direction-type><words>${nextTechnique==='pizzicato'?'pizz.':'arco'}</words></direction-type><sound pizzicato="${nextTechnique==='pizzicato'?'yes':'no'}"/></direction>`;activeTechnique=nextTechnique;}
      const [type,dots]=durationType(dur),dot=dots?'<dot/>':'';
      if(!pitches.length)out+=`<note><rest/><duration>${dur}</duration>${voiceTag}<type>${type}</type>${dot}${staffTag}</note>`;
      else for(let j=0;j<pitches.length;j++){
        const pitch=pitches[j],sources=active.filter(n=>n.pitch===pitch);
        const begin=at+elapsed,endSegment=begin+dur;
        const tieStart=sources.some(n=>n.end>endSegment);
        const tieStop=sources.some(n=>n.start<begin);
        const ties=`${tieStop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}`;
        const isAttack=!tieStop;
        if(isAttack&&j===0){
          const slide=sources.find(n=>n.slideTo!==undefined&&n.start===begin);
          const swell=sources.find(n=>n.swellTo!==undefined&&n.start===begin);
          const subito=sources.find(n=>n.subito&&n.start===begin);
          if(subito)out+=`<direction placement="below"><direction-type><dynamics><${subito.subito}/></dynamics></direction-type><sound dynamics="${({ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122} as Record<string,number>)[subito.subito!]??88}"/></direction>`;
          if(slide)out+=`<direction placement="above"><direction-type><words>${esc('gliss. to '+midiName(slide.slideTo!))}</words></direction-type></direction>`;
          if(swell)out+=`<direction placement="below"><direction-type><words>${esc((swell.swellTo!>(swell.velocity??80)?'cresc.':'dim.')+' to velocity '+swell.swellTo)}</words></direction-type></direction>`;
        }
        // Tango convention: a dot for an unaccented staccato attack, and >
        // (MusicXML accent) for accented staccato / marcato. Do not emit the
        // vertical marcato wedge or a simultaneous dot for accented attacks.
        // Neither mark changes the note's written MusicXML duration.
        const markedAccent=isAttack&&sources.some(n=>n.start===begin&&(n.articulation==='marcato_staccato'||n.accent));
        const staccato=isAttack&&!markedAccent&&sources.some(n=>n.articulation==='staccato'&&n.start===begin);
        const marks=(markedAccent?'<accent/>':'')+(staccato?'<staccato/>':'');
        const articulationMarks=marks?`<articulations>${marks}</articulations>`:'';
        const lyricSource=isAttack&&j===0?sources.find(n=>n.start===begin&&n.lyric?.trim()):undefined;
        const lyricXml=isAttack&&j===0?sources.filter(n=>n.start===begin).slice(0,1).map(n=>[1,2].map(v=>{const word=(v===1?n.lyric:n.lyric2)?.trim();const phase=lyricExtensionPhase(notes,n,v as 1|2);if(!word&&!phase)return '';const syllabic=v===1?n.syllabic:n.syllabic2;return `<lyric number="${v}">${word?`<syllabic>${syllabic??'single'}</syllabic><text>${esc(word)}</text>`:''}${phase?`<extend type="${phase}"/>`:''}</lyric>`;}).join('')).join(''):'';
        const notations=(tieStop||tieStart||articulationMarks)?`<notations>${tieStop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}${articulationMarks}</notations>`:'';
        out+=`<note>${j?'<chord/>':''}${pitchXml(pitch,key)}<duration>${dur}</duration>${ties}${voiceTag}<type>${type}</type>${dot}${staffTag}${notations}${lyricXml}</note>`;
      }
      elapsed+=dur;
    }
  }
  return out;
}
/** Two independent, full-length piano voices. A backup rewinds the measure
 * before writing the lower staff, preserving simultaneous bass and chords. */
export function writePianoMeasure(p:Project,notes:Note[],bar:number,key:string):string {
  const transpose=p.transposeSemitones??0;
  const upper=notes.filter(n=>pianoStaffForPitch(n.pitch-transpose,p.pianoSplitPitch??60)===1);
  const lower=notes.filter(n=>pianoStaffForPitch(n.pitch-transpose,p.pianoSplitPitch??60)===2);
  // Both voices fill the measure, including rests, so the backup is exact.
  return writeVoice(upper,bar,p.beats,key,1,1)+`<backup><duration>${p.beats*DIV}</duration></backup>`+writeVoice(lower,bar,p.beats,key,2,2);
}
export function exportMusicXml(p:Project,score:Score){
  if(!Number.isInteger(p.beats)||p.beats<1||p.beats>12)throw Error('Unsupported meter');
  const transposed=transposeScore(score,p.transposeSemitones??0);
  const head=`<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${esc(p.title)}</work-title></work><movement-title>${esc(p.title)}</movement-title><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>${projectInstruments(p).map((inst,i)=>`<score-part id="P${i+1}"><part-name>${esc(inst)}</part-name><part-abbreviation>${esc(inst)}</part-abbreviation><score-instrument id="I${i+1}"><instrument-name>${esc(inst)}</instrument-name></score-instrument></score-part>`).join('')}</part-list>`;
  const dynamics=p.expression?.enabled!==false?(p.expression?.sections??{A1:'mp',B1:'mf',A2:'mp',B2:'f',C:'f'}):null;
  const dynamicDirection=(inst:Instrument,b:number)=>{
    if(!dynamics)return '';
    const sec=p.bars[b].section,prev=b?p.bars[b-1].section:'';
    if(sec===prev)return '';
    const mark=dynamics[sec]??'mf';
    const value=({ppp:38,pp:40,p:52,mp:64,mf:78,f:90,ff:104,fff:122} as Record<string,number>)[mark]??78;
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
  const rangeDirections=(inst:Instrument,b:number,atEnd=false)=>{
    return (p.expressionRanges??[]).map((range,index)=>{
      if(range.instrument!==inst)return '';
      const start=range.startMeasure===b&&!atEnd;
      const stop=range.endMeasure===b&&atEnd;
      if(!start&&!stop)return '';
      const number=index%5+2;
      const kind=range.to>=range.from?'crescendo':'diminuendo';
      const offset=start?(range.startBeat??0)*DIV:((range.endBeat??p.beats)-p.beats)*DIV;
      return `<direction placement="below"><direction-type><wedge number="${number}" type="${start?kind:'stop'}"${start?' spread="0"':''}/></direction-type>${offset?`<offset>${offset}</offset>`:''}</direction>`;
    }).join('');
  };
  const measureDynamicDirections=(inst:Instrument,b:number)=>{
    const setting=p.measureDynamics?.[`${inst}:${b}`];if(!setting)return '';
    const start=setting.start,end=setting.end;
    const direction=(mark:string,offset=0)=>`<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type>${offset?`<offset>${offset}</offset>`:''}</direction>`;
    if(start&&end&&start!==end){
      const kind=({ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122} as Record<string,number>)[end]>({ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122} as Record<string,number>)[start]?'crescendo':'diminuendo';
      return direction(start)+`<direction placement="below"><direction-type><wedge number="6" type="${kind}"/></direction-type></direction>`+`<direction placement="below"><direction-type><wedge number="6" type="stop"/></direction-type><offset>${p.beats*DIV}</offset></direction>`+direction(end,p.beats*DIV);
    }
    return start?direction(start):end?direction(end):'';
  };
  let sectionOrdinal=-1;
  const sectionMarks=p.bars.map((bar,b)=>{if(b===0||bar.section!==p.bars[b-1].section)sectionOrdinal++;return sectionLetter(sectionOrdinal);});
  const body=projectInstruments(p).map((inst,i)=>`<part id="P${i+1}">${p.bars.map((bar,b)=>`<measure implicit="no" number="${b+1}">${b===0?`<attributes><divisions>${DIV}</divisions><key><fifths>${parseKeySignature(transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)).fifths}</fifths><mode>${parseKeySignature(sectionKey(p,bar.section)).mode}</mode></key><time><beats>${p.beats}</beats><beat-type>4</beat-type></time>${inst.startsWith('Piano')?'<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>':`<clef><sign>${inst.startsWith('Contrabass')?'F':'G'}</sign><line>${inst.startsWith('Contrabass')?4:2}</line></clef>`}</attributes><direction placement="above"><direction-type><words>${esc(p.profile)}</words></direction-type></direction><direction><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${p.bpm}</per-minute></metronome></direction-type><sound tempo="${p.bpm}"/></direction>`:''}${b>0&&sectionKey(p,bar.section)!==sectionKey(p,p.bars[b-1].section)?`<attributes><key><fifths>${parseKeySignature(transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)).fifths}</fifths><mode>${parseKeySignature(sectionKey(p,bar.section)).mode}</mode></key></attributes>`:''}${i===0&&(b===0||bar.section!==p.bars[b-1].section)?`<direction placement="above"><direction-type><rehearsal halign="center" valign="middle">${sectionMarks[b]}</rehearsal></direction-type></direction><direction placement="above"><direction-type><words>${esc(transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)+(parseKeySignature(sectionKey(p,bar.section)).mode==='minor'?' minor':' major'))}</words></direction-type></direction>`:''}${dynamicDirection(inst,b)}${measureDynamicDirections(inst,b)}${rangeDirections(inst,b)}${i===0?crescendoDirection(b):''}${i===0?parseChordSequence(bar.chord,p.beats).filter((c,j,a)=>j===0||c.chord!==a[j-1].chord).map(c=>{const symbol=transposeChord(c.chord,p.transposeSemitones??0);return `<harmony>${harmonyRootXml(symbol)}<kind text="${esc(symbol)}">other</kind>${c.beat?`<offset>${c.beat*DIV}</offset>`:''}</harmony>`;}).join(''):''}${inst.startsWith('Piano')?writePianoMeasure(p,transposed[inst]??[],b,transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)):writeVoice(transposed[inst]??[],b,p.beats,transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0))}${rangeDirections(inst,b,true)}</measure>`).join('')}</part>`).join('');
  return head+body+'</score-partwise>';
}
export function validateMusicXmlDurations(xml:string,beats:number,parts=INSTRUMENTS.length):string[]{
  const problems:string[]=[];
  const partBlocks=[...xml.matchAll(/<part id="P(\d+)">([\s\S]*?)<\/part>/g)];
  if(partBlocks.length!==parts)problems.push(`Expected ${parts} parts, found ${partBlocks.length}`);
  for(const part of partBlocks){
    for(const measure of part[2].matchAll(/<measure[^>]*number="(\d+)"[^>]*>([\s\S]*?)<\/measure>/g)){
      let cursor=0,maximum=0,minimum=0;
      const streams=new Map<string,number>();
      for(const event of measure[2].matchAll(/<(note|backup|forward)>([\s\S]*?)<\/\1>/g)){
        const kind=event[1],body=event[2];
        const duration=Number(body.match(/<duration>(\d+)<\/duration>/)?.[1]??0);
        if(kind==='backup')cursor-=duration;
        else if(kind==='forward')cursor+=duration;
        else if(!body.includes('<chord/>')){
          const voice=body.match(/<voice>(\d+)<\/voice>/)?.[1]??'1';
          streams.set(voice,(streams.get(voice)??0)+duration);
          cursor+=duration;
        }
        maximum=Math.max(maximum,cursor);minimum=Math.min(minimum,cursor);
      }
      if(cursor!==beats*DIV||maximum!==beats*DIV||minimum<0)
        problems.push(`Part ${part[1]}, measure ${measure[1]}: cursor ${cursor}, max ${maximum} (expected ${beats*DIV})`);
      for(const [voice,ticks] of streams)if(ticks!==beats*DIV)
        problems.push(`Part ${part[1]}, measure ${measure[1]}, voice ${voice}: ${ticks} ticks (expected ${beats*DIV})`);
    }
  }
  return problems;
}
export async function saveProject(p:Project){
  // Native projects are JSON so mobile document pickers recognize the file type.
  // The project object already includes its generated and imported scores.
  download(JSON.stringify(p,null,2),p.title.replace(/[^a-z0-9-]+/gi,'-').toLowerCase()+'.tango.json','application/json');
}
export async function loadProject(file:File):Promise<Project>{
  // Legacy .tango files were ZIP archives containing project.json.
  const bytes=await file.arrayBuffer();
  const view=new Uint8Array(bytes);
  let raw:string;
  if(view.length>=4&&view[0]===0x50&&view[1]===0x4b&&view[2]===0x03&&view[3]===0x04){
    const zip=await JSZip.loadAsync(bytes);
    const entry=zip.file('project.json');
    if(!entry)throw Error('No project.json in archive');
    raw=await entry.async('string');
  }else{
    raw=new TextDecoder().decode(bytes).replace(/^\uFEFF/,'');
  }
  const p=JSON.parse(raw) as Project;
  if(p.version!==1||!Array.isArray(p.bars))throw Error('Unsupported project format');
  p.sectionKeys??=inferSectionKeys(p);
  return p;
}
function nodeText(e:Element|null,tag:string){return e?.getElementsByTagName(tag)[0]?.textContent??'';}
export function importMusicXml(text:string):{parts:{name:string;notes:Note[]}[];chords:string[];keys:string[]}{const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('Invalid MusicXML');const names=Array.from(doc.getElementsByTagName('score-part')).map(e=>nodeText(e,'part-name'));const parts=Array.from(doc.getElementsByTagName('part')).map((part,i)=>{let cursor=0;const notes:Note[]=[];for(const measure of Array.from(part.getElementsByTagName('measure'))){let pos=cursor,lastStart=cursor;const divisions=Number(nodeText(measure,'divisions'))||480;for(const child of Array.from(measure.children)){if(child.tagName==='backup')pos-=Number(nodeText(child,'duration'))/divisions;if(child.tagName==='forward')pos+=Number(nodeText(child,'duration'))/divisions;if(child.tagName!=='note')continue;const dur=Number(nodeText(child,'duration'))/divisions||1;const chord=!!child.getElementsByTagName('chord').length;const start=chord?lastStart:pos;const pitch=child.getElementsByTagName('pitch')[0];if(pitch){const step=nodeText(pitch,'step'),alter=Number(nodeText(pitch,'alter'))||0,oct=nodeText(pitch,'octave');const name=step+(alter===1?'#':alter===-1?'b':'')+oct;const n=parsePitch(name);if(n!==null){const lyricElements=Array.from(child.getElementsByTagName('lyric'));const readVerse=(number:number)=>{const element=lyricElements.find(e=>(Number(e.getAttribute('number'))||1)===number);const text=element?nodeText(element,'text'):'';const raw=element?nodeText(element,'syllabic'):'';const syllabic=(['single','begin','middle','end'].includes(raw)?raw:'single') as NonNullable<Note['syllabic']>;return {text,syllabic,melisma:Array.from(element?.getElementsByTagName('extend')??[]).some(e=>e.getAttribute('type')==='start')};};const first=readVerse(1),second=readVerse(2);notes.push({pitch:n,start,duration:dur,source:'imported',...(first.text?{lyric:first.text,syllabic:first.syllabic}:{}),...(first.melisma?{melisma:true}:{}),...(second.text?{lyric2:second.text,syllabic2:second.syllabic}:{}),...(second.melisma?{melisma2:true}:{})});}}if(!chord){lastStart=pos;pos+=dur;}}cursor=Math.max(cursor,pos);}return {name:names[i]??`Part ${i+1}`,notes};});const firstPart=doc.getElementsByTagName('part')[0];
  let activeKey='C';const keys:string[]=[];const chords=Array.from(firstPart?.getElementsByTagName('measure')??[]).map(measure=>{
    const keyNode=Array.from(measure.children).filter(child=>child.tagName==='attributes').flatMap(a=>Array.from(a.children)).find(child=>child.tagName==='key');
    if(keyNode){const fifths=Number(nodeText(keyNode,'fifths'));const mode=nodeText(keyNode,'mode')==='minor'?'minor':'major';const found=Object.keys(KEY_SIGNATURES).find(k=>KEY_SIGNATURES[k].fifths===fifths&&KEY_SIGNATURES[k].mode===mode);if(found)activeKey=found;}
    keys.push(activeKey);
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
  });return {parts,chords,keys};}
export function importMidi(buffer:ArrayBuffer){const midi=new Midi(buffer);return midi.tracks.filter(t=>t.notes.length).map(t=>({name:t.name||`Track ${t.channel+1}`,notes:t.notes.map(n=>({pitch:n.midi,start:n.time/(60/(midi.header.tempos[0]?.bpm||120)),duration:n.duration/(60/(midi.header.tempos[0]?.bpm||120)),source:'imported' as const}))}));}
export function scoreFromParts(parts:{name:string;notes:Note[]}[]):Score {const result=Object.fromEntries(INSTRUMENTS.map(i=>[i,[]])) as unknown as Score;for(let i=0;i<Math.min(parts.length,INSTRUMENTS.length);i++){const found=INSTRUMENTS.find(n=>n.toLowerCase()===parts[i].name.toLowerCase())??INSTRUMENTS[i];result[found]=parts[i].notes;}return result;}
