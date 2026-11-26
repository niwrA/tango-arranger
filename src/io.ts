import JSZip from 'jszip';
import {parseMusicXmlDetailed} from './musicXmlImport';
import {tempoAutomationPoints,normalizedTempoExpressions} from './tempoExpressions';
import {EDITION_LEVELS,assembleEditionScore,currentEditionLevel,getEditionInfo,snapshotActiveEditions,type EditionChoice} from './editions';
import {gestureLabel} from './tangoGestures';
import { Midi } from '@tonejs/midi';
import {INSTRUMENTS,projectInstruments,pianoStaffForPitch,partStaffForNote,partUsesGrandStaff,parsePitch,midiName,transposeScore,transposeChord,soundingChord,parseChordSequence,chordSequenceFromBeats,parseKeySignature,sectionKey,transposeKeySignature,inferSectionKeys,KEY_SIGNATURES,sectionLetter,openingPickupBeats,type ChordChange,type Project,type Score,type Note,type Instrument,instrumentFamily,INSTRUMENT_CAPABILITIES} from './music';
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
/** One canonical title across notation exports; an empty name still prints legibly. */
const exportSongTitle=(p:Project)=>p.title.trim()||'Untitled Tango';
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const harmonyRootXml=(chord:string)=>{const m=chord.match(/^([A-G])([#b]?)/);return `<root><root-step>${m?.[1]??'C'}</root-step>${m?.[2]?`<root-alter>${m[2]==='#'?1:-1}</root-alter>`:''}</root>`;};
// A kind's text is the suffix, not the complete symbol. Keep slash bass
// independent of the root so notation applications can render it correctly.
function harmonyXml(symbol:string):string{
 const match=symbol.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/);
 if(!match)return '';
 const [,root,suffix,bass]=match;
 const kinds:Record<string,string>={'':'major','m':'minor','min':'minor','-':'minor','7':'dominant','maj7':'major-seventh','m7':'minor-seventh','dim':'diminished','dim7':'diminished-seventh','m7b5':'half-diminished','ø':'half-diminished','aug':'augmented','+':'augmented','6':'major-sixth','m6':'minor-sixth','9':'dominant-ninth','sus4':'suspended-fourth','7b9':'dominant'};
 const kind=kinds[suffix]??'other';
 const degree=suffix==='7b9'?'<degree><degree-value>9</degree-value><degree-alter>-1</degree-alter><degree-type>add</degree-type></degree>':'';
 return harmonyRootXml(root)+`<kind text="${esc(suffix)}">${kind}</kind>`+(bass?`<bass><bass-step>${bass[0]}</bass-step>${bass[1]?`<bass-alter>${bass[1]==='#'?1:-1}</bass-alter>`:''}</bass>`:'')+degree;
}
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
  const table:[number,string,number][]=[[1920,'whole',0],[1440,'half',1],[960,'half',0],[720,'quarter',1],[480,'quarter',0],[360,'eighth',1],[240,'eighth',0],[180,'16th',1],[120,'16th',0],[60,'32nd',0],[30,'64th',0],[15,'128th',0]];
  const item=table.find((x:[number,string,number])=>x[0]===ticks);
  if(!item)throw Error(`Unsupported rhythmic duration ${ticks} ticks`);
  return [item[1],item[2]];
};
// Preserve binary durations where possible; use 3:2 values for fractional thirds.
function mixedChunks(ticks:number,at:number):number[]{
 const values=[1920,1440,1280,960,720,640,480,360,320,240,180,160,120,80,60,40,30,20,10];
 const out:number[]=[];while(ticks>0){const v=values.find(v=>v<=ticks&&(v%30!==0||at%30===0))??10;out.push(v);ticks-=v;at+=v;}return out;
}
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
function notationChords(chord:string,beats:number,skip:number):ChordChange[]{
  const changes=parseChordSequence(chord,beats);
  if(!skip)return changes;
  const active=changes.filter(change=>change.beat<=skip).at(-1);
  return [...(active?[{...active,beat:0}]:[]),...changes.filter(change=>change.beat>skip).map(change=>({...change,beat:change.beat-skip}))];
}
// Match the note-head grid so small differences in imported timing do not
// create a direction in what engraves as a contiguous passage.
const NOTATION_QUANTUM=30;
const notationTick=(beat:number)=>Math.round(Math.round(beat*DIV)/NOTATION_QUANTUM)*NOTATION_QUANTUM;
function legatoPassageStarts(notes:readonly Note[]):ReadonlySet<number>{
  const attacks=new Map<number,{end:number;nonLegatoEnd:number}>();
  for(const note of notes){
    const start=notationTick(note.start),end=notationTick(note.start+note.duration);
    if(!(end>start))continue;
    const attack=attacks.get(start)??{end:start,nonLegatoEnd:start};
    attack.end=Math.max(attack.end,end);
    if(note.articulation!=='legato')attack.nonLegatoEnd=Math.max(attack.nonLegatoEnd,end);
    attacks.set(start,attack);
  }
  const starts=new Set<number>();
  let soundingUntil=-Infinity,nonLegatoUntil=-Infinity,wasLegato=false;
  for(const [start,attack] of [...attacks].sort(([a],[b])=>a-b)){
    nonLegatoUntil=Math.max(nonLegatoUntil,attack.nonLegatoEnd);
    const legato=nonLegatoUntil<=start;
    if(legato&&(!wasLegato||start>soundingUntil))starts.add(start);
    wasLegato=legato;
    soundingUntil=Math.max(soundingUntil,attack.end);
  }
  return starts;
}
function grandStaffNotes(p:Project,inst:Instrument,notes:Note[]):[Note[],Note[]]{
  const staves:[Note[],Note[]]=[[],[]];
  for(const note of notes){
    const staff=partStaffForNote(note,inst,p.pianoSplitPitch??60,p.transposeSemitones??0);
    staves[staff-1].push(note);
  }
  return staves;
}
type NoteheadColors=ReadonlyMap<Note,string>;
type TechniqueState={active:'pizzicato'|'arco'|null};
type PianoGlissMark={note:Note;type:'start'|'stop';number:number};
function pianoGlissMarks(notes:Note[]):PianoGlissMark[]{
 const marks:PianoGlissMark[]=[];let number=0;
 for(const n of notes){
  const g=n.pianoGlissando??n.stringGlissando;if(!g)continue;
  const target=notes.find(t=>t.pitch===n.pitch+g.interval&&Math.abs(t.start-n.start-g.beats)<1e-5);
  if(!target)continue;
  const id=number++%6+1;
  marks.push({note:n,type:'start',number:id},{note:target,type:'stop',number:id});
 }
 return marks;
}
function writeVoice(notes:Note[],bar:number,beats:number,key='C',voice?:number,staff?:number,fermata=false,noteheadColors?:NoteheadColors,skip=0,legatoStarts=legatoPassageStarts(notes),techniqueState:TechniqueState={active:null},writtenOctave=0,glissMarks:readonly PianoGlissMark[]=[]){
  const barTicks=Math.round((beats-skip)*DIV),offset=bar*beats+skip;
  // Keep note-level dynamics in the export event projection; omitting subito
  // makes the MusicXML direction below fail TypeScript compilation.
  const notationNotes:(Note&{noteheadColor?:string})[]=notes.filter(n=>!skip||n.start>=offset-1e-7).flatMap(n=>{
    const noteheadColor=noteheadColors?.get(n);
    const original=noteheadColor?{...n,noteheadColor}:n;
    return n.gesture?.partner
      ?[original,{...n,noteheadColor,pitch:n.gesture.partner[0].pitch,gesture:undefined,slideTo:undefined,lyric:undefined,lyric2:undefined,melisma:undefined,melisma2:undefined}]
      :[original];
  });
  const events=notationNotes.map(n=>({noteheadColor:n.noteheadColor,gesture:n.gesture,bowedTremolo:n.bowedTremolo,pitch:n.pitch,accent:n.accent,start:Math.round((n.start-offset)*DIV),end:Math.round((n.start-offset+n.duration)*DIV),originStart:Math.round((n.start-offset)*DIV),originEnd:Math.round((n.start-offset+n.duration)*DIV),technique:n.technique,articulation:n.articulation,xmlTieContinuation:n.xmlTieContinuation,xmlVoice:n.xmlVoice,xmlStaff:n.xmlStaff,slideTo:n.slideTo,approachSlideFrom:n.approachSlideFrom,vibrato:n.vibrato,swellTo:n.swellTo,subito:n.subito,velocity:n.velocity,lyric:n.lyric,syllabic:n.syllabic,lyric2:n.lyric2,syllabic2:n.syllabic2,melisma:n.melisma,melisma2:n.melisma2}))
    .filter(n=>n.end>0&&n.start<barTicks).map(n=>({...n,start:Math.max(0,n.start),end:Math.min(barTicks,n.end)}))
    .filter(n=>n.end>n.start);
  // A fixed 1/16-beat grid avoids unsupported note lengths and makes
  // overlapping melody/chord notes a valid succession of tied chords.
  const triplets=events.some(n=>[n.start,n.end].some(t=>t%30!==0&&t%40===0));
  const quantum=triplets?10:NOTATION_QUANTUM;
  const snapped=events.map(n=>({...n,start:Math.max(0,Math.round(n.start/quantum)*quantum),end:Math.min(barTicks,Math.round(n.end/quantum)*quantum),originStart:Math.round(n.originStart/quantum)*quantum,originEnd:Math.round(n.originEnd/quantum)*quantum})).filter(n=>n.end>n.start);
  const boundaries=new Set<number>([0,barTicks]);
  for(const n of snapped){boundaries.add(n.start);boundaries.add(n.end);}
  const points=[...boundaries].sort((a,b)=>a-b);
  const tuplets=new Map<number,{start:boolean;stop:boolean;normalType:string}>();
  if(triplets){
    const pieces:{at:number;dur:number}[]=[];
    for(let i=0;i<points.length-1;i++){
      let at=points[i];
      for(const dur of mixedChunks(points[i+1]-at,at)){pieces.push({at,dur});at+=dur;}
    }
    for(let i=0;i<pieces.length;){
      if(pieces[i].dur%30===0){i++;continue;}
      let end=i,sum=0,normalType='';
      while(end<pieces.length&&pieces[end].dur%30!==0){
        sum+=pieces[end].dur;
        const unit=sum/2;
        const types:Record<number,string>={15:'128th',30:'64th',60:'32nd',120:'16th',240:'eighth',480:'quarter',960:'half'};
        normalType=types[unit]??'';
        if(normalType)break;
        end++;
      }
      if(normalType&&end<pieces.length){
        for(let k=i;k<=end;k++)tuplets.set(pieces[k].at,{start:k===i,stop:k===end,normalType});
        i=end+1;
      }else i=Math.max(i+1,end);
    }
  }
  let out='';
  const voiceTag=voice?`<voice>${voice}</voice>`:'';
  const staffTag=staff?`<staff>${staff}</staff>`:'';

  for(let i=0;i<points.length-1;i++){
    const at=points[i],end=points[i+1],active=snapped.filter(n=>n.start<=at&&n.end>=end).sort((a,b)=>a.pitch-b.pitch);
    const pitches=[...new Set(active.map(n=>n.pitch))];
    let elapsed=0;
    for(const dur of triplets?mixedChunks(end-at,at):chunks(end-at)){
      const nextTechnique=active.find(n=>n.technique)?.technique??'arco';
      if(elapsed===0&&pitches.length&&legatoStarts.has(notationTick(offset)+at))
        out+=`<direction placement="above"><direction-type><words>legato</words></direction-type>${staffTag}</direction>`;
      if(pitches.length&&nextTechnique!==techniqueState.active){
        // Rests never reset technique. Ordinary initial bowed notes need no
        // marking, but an explicit arco or a return from pizzicato does.
        if(nextTechnique==='pizzicato'||techniqueState.active==='pizzicato'||active.some(n=>n.technique==='arco'))
          out+=`<direction placement="above"><direction-type><words>${nextTechnique==='pizzicato'?'pizz.':'arco'}</words></direction-type>${staffTag}<sound pizzicato="${nextTechnique==='pizzicato'?'yes':'no'}"/></direction>`;
        techniqueState.active=nextTechnique;
      }
      const isTuplet=dur%30!==0;
      const [type,dots]=durationType(isTuplet?dur*1.5:dur),dot=dots?'<dot/>':'';
      const group=tuplets.get(at+elapsed);
      const timeMod=isTuplet?`<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes>${group?`<normal-type>${group.normalType}</normal-type>`:''}</time-modification>`:'';
      const tupletMarks=group?(group.start?'<tuplet type="start" number="1"/>':'')+(group.stop?'<tuplet type="stop" number="1"/>':''):'';
      const restFermata=fermata&&i===points.length-2&&at+elapsed+dur===barTicks?'<fermata type="upright"/>':'';
      if(!pitches.length)out+=`<note><rest/><duration>${dur}</duration>${voiceTag}<type>${type}</type>${dot}${timeMod}${staffTag}${restFermata||tupletMarks?`<notations>${restFermata}${tupletMarks}</notations>`:''}</note>`;
      else for(let j=0;j<pitches.length;j++){
        const pitch=pitches[j],sources=active.filter(n=>n.pitch===pitch);
        const begin=at+elapsed,endSegment=begin+dur;
        const latest=sources.reduce((a,b)=>a.originStart>=b.originStart?a:b);
        // Clipping a bar must not turn an incoming sustain into a new attack.
        // Conversely, a genuine repeated note at the same pitch breaks the tie.
        const tieStop=latest.originStart<begin||active.some(n=>n.pitch===pitch&&n.xmlTieContinuation&&n.start===begin);
        const continuesTie=notationNotes.some(n=>n.pitch===pitch&&n.xmlTieContinuation&&n.xmlVoice===latest.xmlVoice&&n.xmlStaff===latest.xmlStaff&&Math.abs(notationTick(n.start)-notationTick(offset+endSegment/DIV))<1e-7);
        const reattack=notationNotes.some(n=>n.pitch===pitch&&!n.xmlTieContinuation&&Math.abs(Math.round((n.start-offset)*DIV/quantum)*quantum-endSegment)<1e-7&&Math.round((n.start-offset)*DIV/quantum)*quantum>latest.originStart);
        const tieStart=(latest.originEnd>endSegment&&!reattack)||continuesTie;
        const ties=`${tieStop?'<tie type="stop"/>':''}${tieStart?'<tie type="start"/>':''}`;
        const isAttack=!tieStop;
        if(isAttack&&j===0){
          const gesture=active.find(n=>n.gesture&&n.start===begin);
          if(gesture?.gesture)out+=`<direction placement="above"><direction-type><words>${esc(gestureLabel(gesture.gesture))}</words></direction-type></direction>`;
          const approach=sources.find(n=>n.approachSlideFrom!==undefined&&n.start===begin);
          const vibrato=sources.find(n=>n.vibrato&&n.start===begin);
          const slide=sources.find(n=>n.slideTo!==undefined&&n.start===begin);
          const swell=sources.find(n=>n.swellTo!==undefined&&n.start===begin);
          const subito=sources.find(n=>n.subito&&n.start===begin);
          if(subito)out+=`<direction placement="below"><direction-type><dynamics><${subito.subito}/></dynamics></direction-type><sound dynamics="${({ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122} as Record<string,number>)[subito.subito!]??88}"/></direction>`;
          if(approach)out+=`<direction placement="above"><direction-type><words>${esc('port. from '+midiName(approach.approachSlideFrom!)+' to '+midiName(pitch))}</words></direction-type></direction>`;
          if(vibrato)out+='<direction placement="above"><direction-type><words>vibrato</words></direction-type></direction>';
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
        const lyricSource=isAttack&&j===0?active.find(n=>n.start===begin&&n.lyric?.trim()):undefined;
        const lyricXml=isAttack&&j===0?active.filter(n=>n.start===begin&&(n.lyric||n.lyric2||n.melisma||n.melisma2)).slice(0,1).map(n=>[1,2].map(v=>{const word=(v===1?n.lyric:n.lyric2)?.trim();const phase=lyricExtensionPhase(notes,n,v as 1|2);if(!word&&!phase)return '';const syllabic=v===1?n.syllabic:n.syllabic2;return `<lyric number="${v}">${word?`<syllabic>${syllabic??'single'}</syllabic><text>${esc(word)}</text>`:''}${phase?`<extend type="${phase}"/>`:''}</lyric>`;}).join('')).join(''):'';
        const fermataXml=fermata&&j===0&&i===points.length-2&&at+elapsed+dur===barTicks?'<fermata type="upright"/>':'';
        const glissXml=isAttack?glissMarks.filter(mark=>mark.note.pitch===pitch&&Math.abs(mark.note.start-(offset+begin/DIV))<1e-5&&notes.includes(mark.note)).map(mark=>`<glissando type="${mark.type}" number="${mark.number}" line-type="solid">${mark.type==='start'?'gliss.':''}</glissando>`).join(''):'';
        const tremoloXml=isAttack&&(latest.bowedTremolo||latest.gesture?.tremolo)?`<ornaments><tremolo type="single">${latest.bowedTremolo?.strokes??3}</tremolo></ornaments>`:'';
        const technicalMarks=isAttack?((latest.finger!==undefined?'<fingering>'+esc(latest.finger)+'</fingering>':'')+(latest.bowDirection==='up'?'<up-bow/>':latest.bowDirection==='down'?'<down-bow/>':'')):'';
        const technicalXml=technicalMarks?'<technical>'+technicalMarks+'</technical>':'';
        const notations=(tieStop||tieStart||articulationMarks||fermataXml||glissXml||tremoloXml||technicalXml||(j===0&&tupletMarks))?`<notations>${tieStop?'<tied type="stop"/>':''}${tieStart?'<tied type="start"/>':''}${fermataXml}${j===0?tupletMarks:''}${articulationMarks}${glissXml}${tremoloXml}${technicalXml}</notations>`:'';
        // A collapsed unison with the same onset can represent several source
        // events. Leave that head unmarked so the editor never guesses.
        const color=latest.noteheadColor;
        const notehead=color&&!sources.some(n=>n.originStart===latest.originStart&&n.noteheadColor!==color)
          ?`<notehead color="${color}">normal</notehead>`:'';
        out+=`<note>${j?'<chord/>':''}${pitchXml(pitch+writtenOctave,key)}<duration>${dur}</duration>${ties}${voiceTag}<type>${type}</type>${dot}${timeMod}${notehead}${staffTag}${notations}${lyricXml}</note>`;
      }
      elapsed+=dur;
    }
  }
  return out;
}
/** Two independent, full-length piano voices. A backup rewinds the measure
 * before writing the lower staff, preserving simultaneous bass and chords. */
export function writePianoMeasure(p:Project,notes:Note[],bar:number,key:string,noteheadColors?:NoteheadColors):string {
  const pickup=openingPickupBeats(p);
  const visibleNotes=pickup?notes.filter(note=>note.start>=p.beats-pickup-1e-7):notes;
  return writeGrandStaffMeasure(p,'Piano',grandStaffNotes(p,'Piano',visibleNotes),bar,key,noteheadColors);
}

function writeGrandStaffMeasure(p:Project,inst:Instrument,staves:[Note[],Note[]],bar:number,key:string,noteheadColors?:NoteheadColors,legato?:readonly ReadonlySet<number>[],techniques?:readonly TechniqueState[]):string {
  const [upper,lower]=staves;
  // Both voices fill the measure, including rests, so the backup is exact.
  const hold=p.tempoExpressions?.fermatas?.some(f=>f.measure===bar&&f.instrument===inst);
  const pickup=bar===0?openingPickupBeats(p):0;
  const skip=pickup?p.beats-pickup:0;
  const glissMarks=pianoGlissMarks([...upper,...lower]);
  return writeVoice(upper,bar,p.beats,key,1,1,Boolean(hold),noteheadColors,skip,legato?.[0],techniques?.[0],0,glissMarks)+`<backup><duration>${(p.beats-skip)*DIV}</duration></backup>`+writeVoice(lower,bar,p.beats,key,2,2,false,noteheadColors,skip,legato?.[1],techniques?.[1],0,glissMarks);
}
/** Compressed MusicXML (MXL), not MuseScore's proprietary MSCZ format. */
export async function exportCompressedMusicXml(p:Project,score:Score):Promise<Blob>{
  const zip=new JSZip();
  zip.file('mimetype','application/vnd.recordare.musicxml',{compression:'STORE'});
  zip.file('META-INF/container.xml','<?xml version="1.0" encoding="utf-8"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>');
  zip.file('score.musicxml',exportMusicXml(p,score));
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.recordare.musicxml'});
}
/** Experimental native MuseScore 3-style MSCX/MSCZ writer. Not a MusicXML archive. */
export async function exportMuseScoreMscz(p:Project,score:Score,onlyInstrument?:Instrument):Promise<Blob>{
  const tpq=480,beats=p.beats,pickup=openingPickupBeats(p);
  const pickupStart=pickup?beats-pickup:0;
  const scoreTick=(beat:number)=>Math.round(Math.max(0,beat-pickupStart)*tpq);
  const titleXml=esc(exportSongTitle(p));
  const instruments=onlyInstrument?[onlyInstrument]:projectInstruments(p);
  if(onlyInstrument&&!projectInstruments(p).includes(onlyInstrument))throw Error('Instrument is not in the current ensemble');
  const scoreNotes=transposeScore(score,p.transposeSemitones??0);
  const timing=normalizedTempoExpressions(p);
  const writtenTempo=tempoAutomationPoints(p,true);
  const durationTypes:[number,string][]=[[4,'whole'],[2,'half'],[1,'quarter'],[0.5,'eighth'],[0.25,'16th'],[0.125,'32nd']];
  const chunks=(duration:number)=>{
    const result:{ticks:number;type:string}[]=[];
    // Quantize free-form timing to 1/32-beat notation without changing the project.
    let left=Math.max(0,Math.round(duration*8)*60);
    for(const [beats,type] of durationTypes){
      const ticks=Math.round(beats*tpq);
      while(left>=ticks){result.push({ticks,type});left-=ticks;}
    }
    // Quantized durations are representable by the note types above.
    return result;
  };
  // MuseScore TPC values follow the circle of fifths, not chromatic pitch classes.
  // For example C=14, G=15, D=16, F=13, Bb=12.
  const tpcForPitch=(pitch:number,fifths:number)=>{
    const pc=((Math.round(pitch)%12)+12)%12;
    const sharp=[14,21,16,23,18,13,20,15,22,17,24,19];
    const flat=[14,9,16,11,18,13,8,15,10,17,12,19];
    return (fifths<0?flat:sharp)[pc];
  };
  const staffIds=instruments.map((_,i)=>1+instruments.slice(0,i).reduce((sum,inst)=>sum+((inst.startsWith('Piano')||(inst.startsWith('Bandoneon')&&p.bandoneonGrandStaff?.[inst]))?2:1),0));
  const partXml=instruments.map((inst,index)=>{
    const family=instrumentFamily(inst);
    const program=INSTRUMENT_CAPABILITIES[family].program;
    const clef=INSTRUMENT_CAPABILITIES[family].clef;
    const staffId=staffIds[index];
    const name=esc(p.instrumentNames?.[inst]||inst);
    return `<Part><Staff id="${staffId}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>${(family==='Piano'||(family==='Bandoneon'&&p.bandoneonGrandStaff?.[inst]))?`<Staff id="${staffId+1}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>`:''}<trackName>${name}</trackName><Instrument><longName>${name}</longName><shortName>${name}</shortName><trackName>${name}</trackName><minPitchP>0</minPitchP><maxPitchP>127</maxPitchP><minPitchA>0</minPitchA><maxPitchA>127</maxPitchA><Channel><program value="${program}"/></Channel></Instrument></Part>`;
  }).join('');
  const staffs=instruments.map((inst,index)=>{
    const allNotes=(scoreNotes[inst]??[]).flatMap(n=>n.gesture?.partner?
      [n,{...n,pitch:n.gesture.partner[0].pitch,gesture:undefined,slideTo:undefined,lyric:undefined,lyric2:undefined,melisma:undefined,melisma2:undefined}]:[n])
      .filter(n=>Number.isFinite(n.start)&&n.start>=pickupStart-1e-7&&Number.isFinite(n.duration)&&n.duration>0)
      .slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
    // Allocate overlapping notes to independent voices rather than silently discarding them.
    const renderStaff=(staffIndex:number)=>{
    const notes=(inst.startsWith('Piano')||(inst.startsWith('Bandoneon')&&p.bandoneonGrandStaff?.[inst]))?allNotes.filter(n=>(pianoStaffForPitch(n.pitch,p.pianoSplitPitch??60)===1)===(staffIndex===0)):allNotes;
    // The score's duration is the sole authority for notation. Playback
    // gates and articulations must never rewrite it during export.
    // Simultaneous equal-duration notes belong to ONE chord, not separate
    // voices. A separate voice is needed only for independently timed lines.
    // The old exporter emitted stacked notes in one Chord; splitting every
    // note into a voice regressed MuseScore playback.
    const groups:{start:number;duration:number;notes:Note[]}[]=[];
    for(const note of notes){
      const group=groups.find(g=>Math.abs(g.start-note.start)<1e-7&&Math.abs(g.duration-note.duration)<1e-7);
      if(group)group.notes.push(note);
      else groups.push({start:note.start,duration:note.duration,notes:[note]});
    }
    // Compute absolute note-head positions for each independent chord/voice.
    // Native MSCX Tie next/prev distances are between note *onsets*, not the
    // current fragment's duration. Using the latter creates vertical arcs to
    // unrelated notes (sometimes even another staff) after unequal chunks.
    const groupHeads=new Map<(typeof groups)[number],number[]>();
    for(const group of groups){
      const positions:number[]=[];
      const first=Math.max(0,Math.floor(group.start/beats));
      const last=Math.min(p.bars.length-1,Math.floor((group.start+group.duration-1e-7)/beats));
      for(let bar=first;bar<=last;bar++){
        const barBegin=bar*beats,barEnd=barBegin+beats;
        const from=Math.max(0,Math.round((Math.max(barBegin,group.start)-barBegin)*8)*60);
        const until=Math.min(beats*tpq,Math.round((Math.min(barEnd,group.start+group.duration)-barBegin)*8)*60);
        if(until<=from)continue;
        let absolute=bar*beats*tpq+from;
        for(const piece of chunks((until-from)/tpq)){positions.push(absolute);absolute+=piece.ticks;}
      }
      groupHeads.set(group,positions);
    }
    const lanes:{end:number;groups:typeof groups}[]=[];
    for(const group of groups){
      let lane=lanes.find(l=>l.end<=group.start+1e-7);
      if(!lane){lane={end:-Infinity,groups:[]};lanes.push(lane);}
      lane.groups.push(group);lane.end=group.start+group.duration;
    }
    const measures=p.bars.map((bar,barIndex)=>{
      const skip=barIndex===0?pickupStart:0;
      const begin=barIndex*beats+skip,end=(barIndex+1)*beats;
      const measureBeats=end-begin;
      const key=transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0);
      const fifths=parseKeySignature(key).fifths;
      const previousKey=barIndex?transposeKeySignature(sectionKey(p,p.bars[barIndex-1].section),p.transposeSemitones??0):null;
      const keySignature=barIndex===0||key!==previousKey?`<KeySig><accidental>${fifths}</accidental></KeySig>`:'';
      const signature=keySignature+(barIndex===0?`<TimeSig><sigN>${beats}</sigN><sigD>4</sigD></TimeSig><Clef><concertClefType>${(staffIndex===1&&(inst.startsWith('Piano')||inst.startsWith('Bandoneon')))?'F':INSTRUMENT_CAPABILITIES[instrumentFamily(inst)].clef}</concertClefType><transposingClefType>${inst.startsWith('Contrabass')?'F':'G'}</transposingClefType></Clef>`:'');
      // Native MuseScore tempo values are quarter notes per second, not BPM.
      // One system-level Tempo element controls both visible text and playback.
      const initialTempo=barIndex===0&&index===0&&staffIndex===0
        ?`<Tempo><tempo>${Number((p.bpm/60).toFixed(9))}</tempo><followText>1</followText><text><sym>metNoteQuarterUp</sym> = ${p.bpm}</text></Tempo>`
        :'';
      const tempoXml=index===0&&staffIndex===0?writtenTempo.filter(point=>Math.floor(point.beat/beats)===barIndex).map(point=>{
        const tick=scoreTick(point.beat),visible=Boolean(point.label);
        return `<tick>${tick}</tick>${visible?`<StaffText><text>${point.label}</text></StaffText>`:''}<Tempo><tempo>${Number((point.bpm/60).toFixed(9))}</tempo><followText>0</followText><visible>0</visible></Tempo><tick>${scoreTick(begin)}</tick>`;
      }).join(''):'';
      const dynamicsXml=staffIndex===0?(()=>{
        const elements:string[]=[];
        const mark=(value:string)=>/^(ppp|pp|p|mp|mf|f|ff|fff)$/.test(value)?`<Dynamic><subtype>${value}</subtype></Dynamic>`:'';
        const section=p.bars[barIndex].section;
        const measure=p.measureDynamics?.[`${inst}:${barIndex}`];
        // An explicit instrument/measure marking overrides the section default at this position.
        // Emitting both produced conflicting mp + mf symbols in MuseScore.
        if(barIndex===0||p.bars[barIndex-1].section!==section){
          const dynamic=p.expression?.sections?.[section];
          if(p.expression?.enabled!==false&&dynamic&&!measure?.start)elements.push(mark(dynamic));
        }
        if(measure?.start)elements.push(mark(measure.start));
        // MuseScore MSCX spanners require a matching next/prev location. A bare
        // HairPin element is ignored by MuseScore when the file is opened.
        const fraction=(beat:number)=>{
          const ticks=Math.round(beat*tpq),denominator=tpq*4;
          const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
          const divisor=gcd(Math.abs(ticks),denominator)||1;
          return `${ticks/divisor}/${denominator/divisor}`;
        };
        for(const range of p.expressionRanges??[]){
          if(range.instrument!==inst)continue;
          const start=range.startMeasure*beats+(range.startBeat??0);
          const end=range.endMeasure*beats+(range.endBeat??beats);
          if(!(end>start))continue;
          const startBar=Math.floor(start/beats);
          const endBar=Math.min(p.bars.length-1,Math.floor(end/beats));
          const emit=(position:number,markup:string)=>`<tick>${scoreTick(position)}</tick>${markup}<tick>${scoreTick(begin)}</tick>`;
          if(startBar===barIndex){
            const distance=end-start;
            const location=`<location><fractions>${fraction(distance)}</fractions></location>`;
            elements.push(emit(start,`<Spanner type="HairPin"><HairPin><subtype>${range.to>=range.from?0:1}</subtype></HairPin><next>${location}</next></Spanner>`));
          }
          if(endBar===barIndex){
            const location=`<location><fractions>${fraction(start-end)}</fractions></location>`;
            elements.push(emit(end,`<Spanner type="HairPin"><prev>${location}</prev></Spanner>`));
          }
        }
        return elements.join('');
      })():'';
      // StaffText is intentionally used instead of native Harmony: this encoding
      // has been confirmed to display correctly in MuseScore on iPad.
      // Only the top staff carries labels, so grand staves do not duplicate them.
      const chordChanges=staffIndex===0&&index===0
        ?notationChords(bar.chord,p.beats,skip).filter((change,i,all)=>i===0||change.chord!==all[i-1].chord)
        :[];
      const chordXml=chordChanges.map(change=>{
        const symbol=soundingChord(change.chord,sectionKey(p,bar.section),p.transposeSemitones??0);
        const tick=scoreTick(begin+change.beat);
        return `<tick>${tick}</tick><StaffText><text>${esc(symbol)}</text></StaffText>`;
      }).join('');
      // Return to the measure start before writing the unchanged musical voices.
      const chordPrefix=chordXml?`${chordXml}<tick>${scoreTick(begin)}</tick>`:'';
      const voices=lanes.slice(0,4).map((lane,laneIndex)=>{
        const active=lane.groups.filter(g=>g.start<end-1e-7&&g.start+g.duration>begin+1e-7);
        let cursor=0;
        const events:string[]=[];
        const rest=(ticks:number)=>{for(const c of chunks(ticks/tpq))events.push(`<Rest><durationType>${c.type}</durationType></Rest>`);};
        for(const group of active){
          const n=group.notes.find(note=>note.gesture||note.lyric||note.lyric2)??group.notes[0];
          const startTick=Math.max(0,Math.round((Math.max(begin,n.start)-begin)*8)*60);
          const endTick=Math.min(measureBeats*tpq,Math.round((Math.min(end,n.start+n.duration)-begin)*8)*60);
          if(endTick<=startTick)continue;
          if(startTick>cursor)rest(startTick-cursor);
          if(startTick<cursor)continue;
          const pieces=chunks((endTick-startTick)/tpq);
          const previous=n.start<begin-1e-7;
          let pieceStart=begin*tpq+startTick;
          for(let pi=0;pi<pieces.length;pi++){
            const piece=pieces[pi],heads=groupHeads.get(group)??[];
            const position=heads.indexOf(pieceStart);
            const tiedBack=position>0,tiedForward=position>=0&&position<heads.length-1;
            const previousTicks=tiedBack?pieceStart-heads[position-1]:0;
            const nextTicks=tiedForward?heads[position+1]-pieceStart:0;
            // Avoid incomplete native tie/spanner tags that MuseScore can
            // interpret as malformed playback structures.
            const articulation=n.articulation==='staccato'?'<Articulation><subtype>staccato</subtype></Articulation>':
              n.articulation==='marcato_staccato'?'<Articulation><subtype>marcato</subtype></Articulation>':
              n.articulation==='legato'?'<Articulation><subtype>tenuto</subtype></Articulation>':'';
            const lyric=(text:string|undefined,syllabic:string|undefined,number:number)=>
              text&&pi===0&&!previous?`<Lyrics><no>${number}</no><syllabic>${syllabic??'single'}</syllabic><text>${esc(text)}</text></Lyrics>`:'';
            // Duplicate unison attacks cannot create two competing native tie endpoints.
            const noteXml=[...new Map(group.notes.map(note=>[note.pitch,note])).values()].map(note=>{
              // MuseScore represents a sustained pitch as tied Note elements.
              // Each boundary between notation chunks gets a paired Tie spanner.
              const location=(ticks:number)=>{
                const gcd=(a:number,b:number):number=>b?gcd(b,a%b):a;
                const denominator=tpq*4,divisor=gcd(Math.abs(ticks),denominator)||1;
                return `<location><fractions>${ticks/divisor}/${denominator/divisor}</fractions></location>`;
              };
              const backward=tiedBack?`<Spanner type="Tie"><prev>${location(-previousTicks)}</prev></Spanner>`:'';
              const forward=tiedForward?`<Spanner type="Tie"><Tie/><next>${location(nextTicks)}</next></Spanner>`:'';
              return `<Note><pitch>${Math.round(note.pitch)}</pitch><tpc>${tpcForPitch(note.pitch,fifths)}</tpc>${backward}${forward}</Note>`;
            }).join('');
            if(pi===0&&!previous){
              for(const note of group.notes){
               if(note.stringGlissando)events.push(`<StaffText><text>${esc('gliss. to '+midiName(note.pitch+note.stringGlissando.interval))}</text></StaffText>`);
                if(note.bowedTremolo)events.push('<StaffText><text>bow tremolo</text></StaffText>');
                if(note.pianoGlissando)events.push(`<StaffText><text>${esc('gliss. to '+midiName(note.pitch+note.pianoGlissando.interval))}</text></StaffText>`);
               if(note.pianoPedalBeats)events.push(`<StaffText><text>Ped. (${note.pianoPedalBeats} beats)</text></StaffText>`);
              }
              if(n.gesture)events.push(`<StaffText><text>${esc(gestureLabel(n.gesture))}</text></StaffText>`);
              if(n.approachSlideFrom!==undefined)events.push(`<StaffText><text>${esc('port. from '+midiName(n.approachSlideFrom)+' to '+midiName(n.pitch))}</text></StaffText>`);
              if(n.vibrato)events.push('<StaffText><text>vibrato</text></StaffText>');
            }
            events.push(`<Chord><durationType>${piece.type}</durationType>${articulation}${noteXml}${lyric(n.lyric,n.syllabic,1)}${lyric(n.lyric2,n.syllabic2,2)}</Chord>`);
            pieceStart+=piece.ticks;
          }
          cursor=endTick;
        }
        if(cursor<measureBeats*tpq)rest(measureBeats*tpq-cursor);
        const fermata=staffIndex===0&&laneIndex===0?timing.fermatas.find(mark=>mark.measure===barIndex&&mark.instrument===inst):undefined;
        if(fermata){
          let last=-1;
          for(let k=events.length-1;k>=0;k--)if(events[k].startsWith('<Chord>')||events[k].startsWith('<Rest>')){last=k;break;}
          if(last>=0){
            events[last]=events[last].replace(/(<durationType>[^<]+<\/durationType>)/,'$1<Articulation><subtype>fermata</subtype></Articulation>');
            if(fermata.waitForCue)events.splice(last,0,'<StaffText><text>colla voce · wait for cue</text></StaffText>');
          }
        }
        return `<voice>${laneIndex===0?signature+initialTempo+tempoXml+dynamicsXml+chordPrefix:''}${events.join('')}</voice>`;
      });
      if(!voices.length){
        const rests=chunks(measureBeats).map(c=>`<Rest><durationType>${c.type}</durationType></Rest>`);
        const fermata=staffIndex===0?timing.fermatas.find(mark=>mark.measure===barIndex&&mark.instrument===inst):undefined;
        if(fermata)rests[rests.length-1]=rests[rests.length-1].replace('</Rest>','<Articulation><subtype>fermata</subtype></Articulation></Rest>');
        const cue=fermata?.waitForCue?'<StaffText><text>colla voce · wait for cue</text></StaffText>':'';
        if(cue)rests.splice(rests.length-1,0,cue);
        voices.push(`<voice>${signature+initialTempo+tempoXml+dynamicsXml+chordPrefix}${rests.join('')}</voice>`);
      }
      return `<Measure${skip?` len="${measureBeats}/4"`:''}>${voices.join('')}</Measure>`;
    }).join('');
    // Metadata alone does not place a title on the printed page in MuseScore.
    // The top staff owns exactly one vertical title frame (also for part exports).
    const titleFrame=index===0&&staffIndex===0
      ?`<VBox><height>10</height><Text><style>Title</style><text>${titleXml}</text></Text></VBox>`
      :'';
    return `<Staff id="${staffIds[index]+staffIndex}">${titleFrame}${measures}</Staff>`;
    };
    return (inst.startsWith('Piano')||(inst.startsWith('Bandoneon')&&p.bandoneonGrandStaff?.[inst]))?renderStaff(0)+renderStaff(1):renderStaff(0);
  }).join('');
  const mscx=`<?xml version="1.0" encoding="utf-8"?><museScore version="3.6"><programVersion>3.6.2</programVersion><Score><Division>480</Division><Style><concertPitch>1</concertPitch></Style><metaTag name="workTitle">${titleXml}</metaTag><metaTag name="movementTitle">${titleXml}</metaTag><metaTag name="title">${titleXml}</metaTag>${partXml}${staffs}</Score></museScore>`;
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<?xml version="1.0" encoding="utf-8"?><container><rootfiles><rootfile full-path="score.mscx"/></rootfiles></container>');
  zip.file('score.mscx',mscx);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.musescore.mscz'});
}
export function exportMusicXml(p:Project,score:Score,options?:{onlyInstrument?:Instrument;editionLevels?:EditionChoice;previewNoteheadColors?:NoteheadColors;engravingPreview?:boolean}){
  if(!Number.isInteger(p.beats)||p.beats<1||p.beats>12)throw Error('Unsupported meter');
  const transposed=transposeScore(score,p.transposeSemitones??0);
  const unfilteredTransposed=new Map(Object.entries(transposed));
  const pickup=openingPickupBeats(p);
  const pickupStart=pickup?p.beats-pickup:0;
  if(pickup)for(const inst of Object.keys(transposed)){
    transposed[inst]=transposed[inst].filter(note=>note.start>=pickupStart-1e-7);
  }
  const barShift=(bar:number)=>bar===0?pickupStart:0;
  const sectionStarts=(bar:number)=>bar===(pickup?1:0)||(bar>0&&p.bars[bar].section!==p.bars[bar-1].section);

  const instruments=options?.onlyInstrument?[options.onlyInstrument]:projectInstruments(p);
  const grandStaves=new Set(instruments.filter(inst=>partUsesGrandStaff(p,inst,transposed[inst]??[])));
  const notationStaves=new Map(instruments.map(inst=>[inst,grandStaves.has(inst)?grandStaffNotes(p,inst,transposed[inst]??[]):undefined]));
  const legatoDirections=new Map(instruments.map(inst=>[
    inst,(notationStaves.get(inst)??[transposed[inst]??[]]).map(legatoPassageStarts),
  ]));
  const techniqueStates=new Map<Instrument,TechniqueState[]>(instruments.map(inst=>[
    inst,Array.from({length:grandStaves.has(inst)?2:1},():TechniqueState=>({active:null}))
  ]));
  const previewColors=new Map<Instrument,NoteheadColors>();
  if(options?.onlyInstrument&&options.previewNoteheadColors){
    const inst=options.onlyInstrument;
    const colors=new Map<Note,string>();
    (score[inst]??[]).forEach((note,index)=>{
      const color=options.previewNoteheadColors?.get(note);
      if(color&&/^#[0-9a-f]{6}$/i.test(color))colors.set(unfilteredTransposed.get(inst)![index],color);
    });
    previewColors.set(inst,colors);
  }
  if(instruments.some(inst=>!projectInstruments(p).includes(inst)))throw Error('Unknown print instrument');
  const partName=(inst:Instrument)=>[p.instrumentNames?.[inst]||inst,...(options?.editionLevels?.[inst]?[options.editionLevels[inst]]:[])].join(' · ');
  const titleXml=esc(exportSongTitle(p));
  const subtitle=options?.onlyInstrument
    ?`<credit page="1"><credit-type>subtitle</credit-type><credit-words default-x="595" default-y="1550" justify="center">${esc(partName(options.onlyInstrument))}</credit-words></credit>`
    :'';
  const head=`<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${titleXml}</work-title></work><movement-title>${titleXml}</movement-title><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults>${subtitle}<credit page="1"><credit-type>title</credit-type><credit-words default-x="595" default-y="1627" justify="center" valign="top" font-size="24">${titleXml}</credit-words></credit><part-list>${instruments.map((inst,i)=>`<score-part id="P${i+1}"><part-name>${esc(partName(inst))}</part-name><part-abbreviation>${esc(partName(inst))}</part-abbreviation><score-instrument id="I${i+1}"><instrument-name>${esc(partName(inst))}</instrument-name></score-instrument></score-part>`).join('')}</part-list>`;
  const timing=normalizedTempoExpressions(p);
  const tempoMarks=tempoAutomationPoints(p,true).filter(point=>!options?.engravingPreview||point.label);
  const tempoDirections=(measure:number)=>tempoMarks.filter(point=>Math.floor(point.beat/p.beats)===measure).map(point=>{
    const offset=Math.round((Math.max(0,point.beat-measure*p.beats-barShift(measure)))*DIV);
    const name=point.label??'tempo';
    return `<direction placement="above"><direction-type><words${point.label?'':' print-object="no"'}>${esc(name)}</words></direction-type>${offset?`<offset>${offset}</offset>`:''}<sound tempo="${point.bpm}"/></direction>`;
  }).join('');
  const fermataDirection=(inst:Instrument,measure:number)=>timing.fermatas.filter(f=>f.measure===measure&&f.instrument===inst&&f.waitForCue)
    .map(()=>`<direction placement="above"><direction-type><words>colla voce · wait for cue</words></direction-type><offset>${(p.beats-1-barShift(measure))*DIV}</offset></direction>`).join('');
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
      const offset=start?Math.max(0,(range.startBeat??0)-barShift(b))*DIV:((range.endBeat??p.beats)-p.beats)*DIV;
      return `<direction placement="below"><direction-type><wedge number="${number}" type="${start?kind:'stop'}"${start?' spread="0"':''}/></direction-type>${offset?`<offset>${offset}</offset>`:''}</direction>`;
    }).join('');
  };
  const measureDynamicDirections=(inst:Instrument,b:number)=>{
    const setting=p.measureDynamics?.[`${inst}:${b}`];if(!setting)return '';
    const start=setting.start,end=setting.end;
    const direction=(mark:string,offset=0)=>`<direction placement="below"><direction-type><dynamics><${mark}/></dynamics></direction-type>${offset?`<offset>${offset}</offset>`:''}</direction>`;
    if(start&&end&&start!==end){
      const kind=({ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122} as Record<string,number>)[end]>({ppp:38,pp:52,p:63,mp:74,mf:88,f:101,ff:112,fff:122} as Record<string,number>)[start]?'crescendo':'diminuendo';
      return direction(start)+`<direction placement="below"><direction-type><wedge number="6" type="${kind}"/></direction-type></direction>`+`<direction placement="below"><direction-type><wedge number="6" type="stop"/></direction-type><offset>${(p.beats-barShift(b))*DIV}</offset></direction>`+direction(end,(p.beats-barShift(b))*DIV);
    }
    return start?direction(start):end?direction(end):'';
  };
  const octaveDirections=(inst:Instrument,b:number)=>{
   const marks:{beat:number;staff:number;type:string;size:number}[]=[];
   const notes=transposed[inst]??[];
   for(const staff of new Set(notes.map(n=>n.xmlStaff??1))){
    let shift=0,end=0;
    for(const n of notes.filter(n=>(n.xmlStaff??1)===staff).sort((a,b)=>a.start-b.start)){
     const next=n.xmlOctaveShift??0;
     if(shift&&(next!==shift||n.start>end+1e-7)){marks.push({beat:end,staff,type:'stop',size:Math.abs(shift)/12*7+1});shift=0;}
     if(next&&!shift){shift=next;marks.push({beat:n.start,staff,type:shift<0?'down':'up',size:Math.abs(shift)/12*7+1});}
     if(shift)end=Math.max(end,n.start+n.duration);
    }
    if(shift)marks.push({beat:end,staff,type:'stop',size:Math.abs(shift)/12*7+1});
   }
   return marks.filter(m=>m.beat>=b*p.beats&&(m.beat<(b+1)*p.beats||b===p.bars.length-1&&m.beat===(b+1)*p.beats)).map(m=>`<direction><direction-type><octave-shift type="${m.type}" size="${m.size}"/></direction-type><offset>${Math.round((m.beat-b*p.beats-barShift(b))*DIV)}</offset><staff>${m.staff}</staff></direction>`).join('');
  };
  const pedalDirections=(inst:Instrument,b:number)=>{
   const spans=(transposed[inst]??[]).filter(n=>n.pianoPedalBeats).sort((a,b)=>a.start-b.start);
   const marks:{beat:number;type:string}[]=[];
   for(let i=0;i<spans.length;i++){
    const n=spans[i],prev=spans[i-1],next=spans[i+1],start=n.start+(n.pianoPedalOffset??0),end=start+n.pianoPedalBeats!;
    marks.push({beat:start,type:prev&&prev.start+(prev.pianoPedalOffset??0)+prev.pianoPedalBeats!>=start?'change':'start'});
    if(!next||next.start+(next.pianoPedalOffset??0)>end)marks.push({beat:end,type:'stop'});
   }
   return marks.filter(m=>m.beat>=b*p.beats&&(m.beat<(b+1)*p.beats||b===p.bars.length-1&&m.beat===(b+1)*p.beats)).map(m=>`<direction placement="below"><direction-type><pedal type="${m.type}" line="yes" sign="yes"/></direction-type><offset>${Math.round((m.beat-b*p.beats-barShift(b))*DIV)}</offset><staff>2</staff></direction>`).join('');
  };
  let sectionOrdinal=-1;
  const sectionMarks=p.bars.map((bar,b)=>{if(sectionStarts(b))sectionOrdinal++;return sectionOrdinal<0?'':sectionLetter(sectionOrdinal);});
  const body=instruments.map((inst,i)=>`<part id="P${i+1}">${p.bars.map((bar,b)=>`<measure implicit="${pickup&&b===0?'yes':'no'}" number="${pickup?b:b+1}">${b===0?`<attributes><divisions>${DIV}</divisions><key><fifths>${parseKeySignature(transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)).fifths}</fifths><mode>${parseKeySignature(sectionKey(p,bar.section)).mode}</mode></key><time><beats>${p.beats}</beats><beat-type>4</beat-type></time>${grandStaves.has(inst)?'<staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef><clef number="2"><sign>F</sign><line>4</line></clef>':`<clef><sign>${inst.startsWith('Contrabass')?'F':'G'}</sign><line>${inst.startsWith('Contrabass')?4:2}</line></clef>`}${instrumentFamily(inst)==='Contrabass'&&!options?.engravingPreview?'<transpose><diatonic>0</diatonic><chromatic>0</chromatic><octave-change>-1</octave-change></transpose>':''}</attributes><direction placement="above"><direction-type><words>${esc(p.profile)}</words></direction-type></direction><direction><direction-type><metronome parentheses="no"><beat-unit>quarter</beat-unit><per-minute>${p.bpm}</per-minute></metronome></direction-type><sound tempo="${p.bpm}"/></direction>`:''}${b>0&&sectionKey(p,bar.section)!==sectionKey(p,p.bars[b-1].section)?`<attributes><key><fifths>${parseKeySignature(transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)).fifths}</fifths><mode>${parseKeySignature(sectionKey(p,bar.section)).mode}</mode></key></attributes>`:''}${i===0&&sectionStarts(b)?`<direction placement="above"><direction-type><rehearsal halign="center" valign="middle">${sectionMarks[b]}</rehearsal></direction-type></direction>${b===(pickup?1:0)||sectionKey(p,bar.section)!==sectionKey(p,p.bars[b-1].section)?`<direction placement="above"><direction-type><words>${esc(transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0)+(parseKeySignature(sectionKey(p,bar.section)).mode==='minor'?' minor':' major'))}</words></direction-type></direction>`:''}`:''}${i===0?tempoDirections(b):''}${fermataDirection(inst,b)}${dynamicDirection(inst,b)}${measureDynamicDirections(inst,b)}${pedalDirections(inst,b)}${octaveDirections(inst,b)}${rangeDirections(inst,b)}${i===0?crescendoDirection(b):''}${(i===0||options?.onlyInstrument||!options?.engravingPreview)?notationChords(bar.chord,p.beats,barShift(b)).filter((c,j,a)=>j===0||c.chord!==a[j-1].chord).map(c=>{const symbol=soundingChord(c.chord,sectionKey(p,bar.section),p.transposeSemitones??0);return `<harmony>${harmonyXml(symbol)}${c.beat?`<offset>${c.beat*DIV}</offset>`:''}</harmony>`;}).join(''):''}${grandStaves.has(inst)?writeGrandStaffMeasure(p,inst,notationStaves.get(inst)!,b,transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0),previewColors.get(inst),legatoDirections.get(inst),techniqueStates.get(inst)):writeVoice(transposed[inst]??[],b,p.beats,transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0),undefined,undefined,timing.fermatas.some(f=>f.measure===b&&f.instrument===inst),previewColors.get(inst),barShift(b),legatoDirections.get(inst)?.[0],techniqueStates.get(inst)?.[0],instrumentFamily(inst)==='Contrabass'&&!options?.engravingPreview?12:0,pianoGlissMarks(transposed[inst]??[]))}${rangeDirections(inst,b,true)}${b===p.bars.length-1?'<barline location="right"><bar-style>light-heavy</bar-style></barline>':''}</measure>`).join('')}</part>`).join('');
  return head+body+'</score-partwise>';
}

/** ABC 2.1 export for portable lead sheets and individual parts.
 * One ABC unit is a sixteenth note (L:1/16); event boundaries are quantized
 * to that unit and overlapping notes at the same onset form chords.
 */
const abcSafe=(value:string)=>value.replace(/[\r\n]+/g,' ').replace(/["\\\\]/g,'').trim();
const abcFileName=(value:string)=>value.replace(/[^a-z0-9-]+/gi,'-').replace(/^-+|-+$/g,'').toLowerCase()||'tango';
function abcKey(key:string):string {
  const minor=key.endsWith('m');
  return key.replace(/m$/,'')+(minor?'min':'');
}
function abcPitch(midi:number):string {
  const names=['C','^C','D','^D','E','F','^F','G','^G','A','^A','B'];
  const pc=((midi%12)+12)%12,octave=Math.floor(midi/12)-1;
  const letter=names[pc];
  if(octave>=5)return letter.toLowerCase()+"'".repeat(octave-5);
  return letter+','.repeat(Math.max(0,4-octave));
}
function abcMeasure(notes:Note[],bar:number,beats:number,chords:ChordChange[]=[],skip=0):string {
  const units=(beats-skip)*4,starts=new Map<number,{pitch:number;duration:number;articulation?:Note['articulation']}[]>();
  for(const n of notes){
    if(skip&&n.start<skip-1e-7)continue;
    const begin=Math.max(0,Math.round((n.start-bar*beats-skip)*4));
    const end=Math.min(units,Math.round((n.start+n.duration-bar*beats-skip)*4));
    if(begin>=units||end<=begin)continue;
    const group=starts.get(begin)??[];
    group.push({pitch:n.pitch,duration:end-begin,articulation:n.articulation});
    starts.set(begin,group);
  }
  const harmony=new Map<number,string>();
  for(const change of chords)if(change.chord.trim())harmony.set(Math.max(0,Math.min(units-1,Math.round(change.beat*4))),abcSafe(change.chord));
  const boundaries=new Set<number>([0,units,...starts.keys(),...harmony.keys()]);
  for(const [begin,group] of starts)for(const n of group)boundaries.add(Math.min(units,begin+n.duration));
  const points=[...boundaries].sort((a,b)=>a-b);
  const tokens:string[]=[];
  for(let i=0;i<points.length-1;i++){
    const at=points[i],next=points[i+1],length=next-at;
    if(length<=0)continue;
    const sounding=[...starts].flatMap(([begin,group])=>group.filter(n=>begin<=at&&begin+n.duration>at).map(n=>n.pitch));
    const pitches=[...new Set(sounding)].sort((a,b)=>a-b);
    const chord=harmony.get(at);
    const prefix=chord?'"'+chord+'"':'';
    const symbol=pitches.length>1?'['+pitches.map(abcPitch).join('')+']':pitches.length===1?abcPitch(pitches[0]):'z';
    tokens.push(prefix+symbol+(length===1?'':length));
  }
  return tokens.join(' ')||'z'+units;
}
export function exportAbc(p:Project,score:Score,part:'lead'|Instrument='lead'):string {
  if(!Number.isInteger(p.beats)||p.beats<1||p.beats>12)throw Error('Unsupported meter for ABC');
  const transpose=p.transposeSemitones??0;
  const title=abcSafe(exportSongTitle(p));
  const partName=part==='lead'?'Lead Sheet':abcSafe(part);
  const lines=['% Generated by Tango Arranger','X:1','T:'+title,'T:'+partName,'M:'+p.beats+'/4','L:1/16','Q:1/4='+Math.round(p.bpm)];
  const pickup=openingPickupBeats(p);
  let previousKey='',previousSection='';
  for(let bar=0;bar<p.bars.length;bar++){
    const current=p.bars[bar],key=transposeKeySignature(sectionKey(p,current.section),transpose);
    if(bar===0){lines.push('K:'+abcKey(key));}
    else if(key!==previousKey)lines.push('[K:'+abcKey(key)+']');
    const skip=bar===0&&pickup?p.beats-pickup:0;
    if(skip)lines.push('% Opening pickup');
    else if(current.section!==previousSection)lines.push('% Section '+abcSafe(current.section));
    const notes=part==='lead'?current.melody.map(n=>({...n,start:n.start+bar*p.beats,pitch:n.pitch+transpose})):
      (score[part]??[]).filter(n=>n.start<(bar+1)*p.beats&&n.start+n.duration>bar*p.beats).map(n=>({...n,pitch:n.pitch+transpose}));
    const chords=part==='lead'?notationChords(current.chord,p.beats,skip).map(change=>({...change,chord:soundingChord(change.chord,sectionKey(p,current.section),transpose)})):[];
    lines.push(abcMeasure(notes,bar,p.beats,chords,skip)+' |');
    previousKey=key;if(!skip)previousSection=current.section;
  }
  return lines.join('\n')+'\n';
}
/** ZIP distribution bundle: unzip and import the individual .abc files in MobileSheets. */
export async function exportMobileSheetsBundle(p:Project,score:Score):Promise<Blob>{
  const zip=new JSZip();
  zip.file('00-lead-sheet.abc',exportAbc(p,score,'lead'));
  projectInstruments(p).forEach((inst,index)=>zip.file(String(index+1).padStart(2,'0')+'-'+abcFileName(inst)+'.abc',exportAbc(p,score,inst)));
  zip.file('README.txt',`MobileSheets ABC bundle from Tango Arranger.\nSong: ${exportSongTitle(p)}\nTempo: ${Math.round(p.bpm)} quarter notes per minute.\nExtract the ZIP first, then import the individual .abc files into MobileSheets.\nLead sheet: 00-lead-sheet.abc\nEach remaining file contains one instrument part.\n`);
  return zip.generateAsync({type:'blob'});
}

export function validateMusicXmlDurations(xml:string,beats:number,parts=INSTRUMENTS.length,pickup=0):string[]{
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
      const expected=(pickup&&measure[1]==='0'?pickup:beats)*DIV;
      if(cursor!==expected||maximum!==expected||minimum<0)
        problems.push(`Part ${part[1]}, measure ${measure[1]}: cursor ${cursor}, max ${maximum} (expected ${expected})`);
      for(const [voice,ticks] of streams)if(ticks!==expected)
        problems.push(`Part ${part[1]}, measure ${measure[1]}, voice ${voice}: ${ticks} ticks (expected ${expected})`);
    }
  }
  return problems;
}

/** A musician-facing print pack with a mixed-skill full score plus every
 * difficulty edition as independently printable MusicXML. Any uncreated
 * variant is generated only for the pack; protected edits remain untouched. */
export async function exportEditionPrintPack(p:Project):Promise<Blob>{
 const saved=snapshotActiveEditions(p),instruments=projectInstruments(saved);
 const choices=Object.fromEntries(instruments.map(inst=>[inst,currentEditionLevel(saved,inst)])) as EditionChoice;
 const mixed=assembleEditionScore(saved,choices);
 const scoreXml=exportMusicXml(saved,mixed,{editionLevels:choices});
 const problems=validateMusicXmlDurations(scoreXml,saved.beats,instruments.length,openingPickupBeats(saved));
 if(problems.length)throw Error('Selected ensemble score invalid: '+problems.slice(0,2).join('; '));
 const zip=new JSZip();
 zip.file('selected-ensemble.musicxml',scoreXml);
 const levelScores=Object.fromEntries(EDITION_LEVELS.map(level=>{
  const editions=Object.fromEntries(instruments.map(inst=>[inst,level])) as EditionChoice;
  return [level,assembleEditionScore(saved,editions)];
 })) as Record<string,Score>;
 const safe=(str:string)=>str.toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'')||'part';
 for(const inst of instruments)for(const level of EDITION_LEVELS){
  const noteScore=levelScores[level];
  const partXml=exportMusicXml(saved,noteScore,{onlyInstrument:inst,editionLevels:{[inst]:level}});
  const issues=validateMusicXmlDurations(partXml,saved.beats,1,openingPickupBeats(saved));
  if(issues.length)throw Error(inst+' '+level+': '+issues[0]);
  zip.file('parts/'+safe(inst)+'/'+level+'.musicxml',partXml);
 }
 const selection=instruments.map(inst=>({instrument:inst,chosen:choices[inst],
  available:[...EDITION_LEVELS],stored:[...EDITION_LEVELS].filter(level=>!!saved.partEditions?.[inst]?.[level]),
  stale:[...EDITION_LEVELS].filter(level=>getEditionInfo(saved,inst,level).stale)}));
 zip.file('edition-selections.json',JSON.stringify({schema:1,title:saved.title,tempoBpm:saved.bpm,
  beats:saved.beats,selection},null,2));
 zip.file('README.txt',
  'Tango Arranger – printable difficulty editions\nSong: '+saved.title+'\nTempo: '+saved.bpm+' BPM\n\n'+
  'Open selected-ensemble.musicxml in MuseScore for the mixed-skill full score.\n'+
  'The parts/ folders contain Easy, Intermediate and Advanced editions for each instrument.\n'+
  'Open any individual MusicXML file in MuseScore, then use File > Print or Export to PDF.\n'+
  'Each edition is a separate score; your currently selected combination is described in edition-selections.json.\n'+
  'For editable versions and protected changes share the original .tango.json project.\n'+
  'Uncreated alternatives are generated for this pack, not saved over the .tango project.\n'+
  'If the song has changed, stored alternative editions may be stale. See the stale field in edition-selections.json before printing.\n');
 return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE'});
}

export async function exportProjectZip(p:Project):Promise<Blob>{
 const zip=new JSZip();
 zip.file('project.json',JSON.stringify(snapshotActiveEditions(p)));
 return zip.generateAsync({type:'blob',mimeType:'application/zip',compression:'DEFLATE',compressionOptions:{level:6}});
}
export async function saveProject(p:Project,compressed=false){
 if(compressed){
  const blob=await exportProjectZip(p);
  download(blob,(p.title.replace(/[^a-z0-9-]+/gi,'-').toLowerCase()||'tango')+'.tango.zip','application/zip');
  return;
 }
  // Native projects are JSON so mobile document pickers recognize the file type.
  // The project object already includes its generated and imported scores.
  download(JSON.stringify(snapshotActiveEditions(p),null,2),p.title.replace(/[^a-z0-9-]+/gi,'-').toLowerCase()+'.tango.json','application/json');
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
/** Backward-compatible import API; normalization is implemented by the shared parser. */
export function importMusicXml(text:string):{parts:{name:string;notes:Note[]}[];chords:string[];keys:string[]}{
 const parsed=parseMusicXmlDetailed(text);
 return {parts:parsed.parts.map(part=>({name:part.name,notes:part.notes})),chords:parsed.chords,keys:parsed.keys};
}
export function importMidi(buffer:ArrayBuffer){const midi=new Midi(buffer);return midi.tracks.filter(t=>t.notes.length).map(t=>({name:t.name||`Track ${t.channel+1}`,notes:t.notes.map(n=>({pitch:n.midi,start:n.time/(60/(midi.header.tempos[0]?.bpm||120)),duration:n.duration/(60/(midi.header.tempos[0]?.bpm||120)),source:'imported' as const}))}));}
export function scoreFromParts(parts:{name:string;notes:Note[]}[]):Score {const result=Object.fromEntries(INSTRUMENTS.map(i=>[i,[]])) as unknown as Score;for(let i=0;i<Math.min(parts.length,INSTRUMENTS.length);i++){const found=INSTRUMENTS.find(n=>n.toLowerCase()===parts[i].name.toLowerCase())??INSTRUMENTS[i];result[found]=parts[i].notes;}return result;}
