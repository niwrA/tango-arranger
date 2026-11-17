import JSZip from 'jszip';
import { Midi } from '@tonejs/midi';
import {INSTRUMENTS,projectInstruments,pianoStaffForPitch,parsePitch,midiName,transposeScore,transposeChord,parseChordSequence,chordSequenceFromBeats,parseKeySignature,sectionKey,transposeKeySignature,inferSectionKeys,KEY_SIGNATURES,sectionLetter,type ChordChange,type Project,type Score,type Note,type Instrument,instrumentFamily,INSTRUMENT_CAPABILITIES} from './music';
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
/** Compressed MusicXML (MXL), not MuseScore's proprietary MSCZ format. */
export async function exportCompressedMusicXml(p:Project,score:Score):Promise<Blob>{
  const zip=new JSZip();
  zip.file('mimetype','application/vnd.recordare.musicxml',{compression:'STORE'});
  zip.file('META-INF/container.xml','<?xml version="1.0" encoding="utf-8"?><container><rootfiles><rootfile full-path="score.musicxml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>');
  zip.file('score.musicxml',exportMusicXml(p,score));
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.recordare.musicxml'});
}
/** Experimental native MuseScore 3-style MSCX/MSCZ writer. Not a MusicXML archive. */
export async function exportMuseScoreMscz(p:Project,score:Score):Promise<Blob>{
  const tpq=480,beats=p.beats;
  const instruments=projectInstruments(p);
  const scoreNotes=transposeScore(score,p.transposeSemitones??0);
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
  const staffIds=instruments.map((_,i)=>1+instruments.slice(0,i).reduce((sum,inst)=>sum+(inst.startsWith('Piano')?2:1),0));
  const partXml=instruments.map((inst,index)=>{
    const family=instrumentFamily(inst);
    const program=INSTRUMENT_CAPABILITIES[family].program;
    const clef=INSTRUMENT_CAPABILITIES[family].clef;
    const staffId=staffIds[index];
    const name=esc(p.instrumentNames?.[inst]||inst);
    return `<Part><Staff id="${staffId}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>${family==='Piano'?`<Staff id="${staffId+1}"><StaffType group="pitched"><name>stdNormal</name></StaffType></Staff>`:''}<trackName>${name}</trackName><Instrument><longName>${name}</longName><shortName>${name}</shortName><trackName>${name}</trackName><minPitchP>0</minPitchP><maxPitchP>127</maxPitchP><minPitchA>0</minPitchA><maxPitchA>127</maxPitchA><Channel><program value="${program}"/></Channel></Instrument></Part>`;
  }).join('');
  const staffs=instruments.map((inst,index)=>{
    const allNotes=(scoreNotes[inst]??[]).filter(n=>Number.isFinite(n.start)&&Number.isFinite(n.duration)&&n.duration>0)
      .slice().sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
    // Allocate overlapping notes to independent voices rather than silently discarding them.
    const renderStaff=(staffIndex:number)=>{
    const notes=inst.startsWith('Piano')?allNotes.filter(n=>(pianoStaffForPitch(n.pitch,p.pianoSplitPitch??60)===1)===(staffIndex===0)):allNotes;
    const lanes:{end:number;notes:Note[]}[]=[];
    for(const note of notes){
      let lane=lanes.find(l=>l.end<=note.start+1e-7);
      if(!lane){lane={end:-Infinity,notes:[]};lanes.push(lane);}
      lane.notes.push(note);lane.end=note.start+note.duration;
    }
    const measures=p.bars.map((bar,barIndex)=>{
      const begin=barIndex*beats,end=begin+beats;
      const key=transposeKeySignature(sectionKey(p,bar.section),p.transposeSemitones??0);
      const fifths=parseKeySignature(key).fifths;
      const previousKey=barIndex?transposeKeySignature(sectionKey(p,p.bars[barIndex-1].section),p.transposeSemitones??0):null;
      const keySignature=barIndex===0||key!==previousKey?`<KeySig><accidental>${fifths}</accidental></KeySig>`:'';
      const signature=keySignature+(barIndex===0?`<TimeSig><sigN>${beats}</sigN><sigD>4</sigD></TimeSig><Clef><concertClefType>${(staffIndex===1&&inst.startsWith('Piano'))?'F':INSTRUMENT_CAPABILITIES[instrumentFamily(inst)].clef}</concertClefType><transposingClefType>${inst.startsWith('Contrabass')?'F':'G'}</transposingClefType></Clef>`:'');
      const dynamicsXml=staffIndex===0?(()=>{
        const elements:string[]=[];
        const mark=(value:string)=>/^(ppp|pp|p|mp|mf|f|ff|fff)$/.test(value)?`<Dynamic><subtype>${value}</subtype></Dynamic>`:'';
        const section=p.bars[barIndex].section;
        if(barIndex===0||p.bars[barIndex-1].section!==section){const dynamic=p.expression?.sections?.[section];if(p.expression?.enabled!==false&&dynamic)elements.push(mark(dynamic));}
        const measure=p.measureDynamics?.[`${inst}:${barIndex}`];
        if(measure?.start)elements.push(mark(measure.start));
        if(measure?.end&&measure.end!==measure.start)elements.push(mark(measure.end));
        for(const range of p.expressionRanges??[]){if(range.instrument!==inst)continue;
          if(range.startMeasure===barIndex)elements.push(`<Spanner type="HairPin"><HairPin><subtype>${range.to>=range.from?0:1}</subtype></HairPin></Spanner>`);
        }
        return elements.join('');
      })():'';
      // Harmony is attached only to the upper staff, leaving the written notes intact.
      // MuseScore's Harmony element uses root TPC plus a displayed chord name.
      const chordXml=staffIndex===0&&/^(Piano|Bandoneon|Guitar)/.test(inst)
        ?parseChordSequence(bar.chord,beats).map(change=>{
          const symbol=transposeChord(change.chord,p.transposeSemitones??0);
          const root=/^([A-G])([#b]?)/.exec(symbol);
          if(!root)return '';
          const pc=parsePitch(root[1]+root[2]+'4')!%12;
          const rootTpc=tpcForPitch(pc,root[2]==='b'?-1:1);
          return `<Harmony><root><rootTpc>${rootTpc}</rootTpc></root><name>${esc(symbol)}</name>${change.beat?`<offset>${change.beat*tpq}</offset>`:''}</Harmony>`;
        }).join(''):'';
      const voices=lanes.slice(0,4).map((lane,laneIndex)=>{
        const active=lane.notes.filter(n=>n.start<end-1e-7&&n.start+n.duration>begin+1e-7);
        let cursor=0;
        const events:string[]=[];
        const rest=(ticks:number)=>{for(const c of chunks(ticks/tpq))events.push(`<Rest><durationType>${c.type}</durationType></Rest>`);};
        for(const n of active){
          const startTick=Math.max(0,Math.round((Math.max(begin,n.start)-begin)*8)*60);
          const endTick=Math.min(beats*tpq,Math.round((Math.min(end,n.start+n.duration)-begin)*8)*60);
          if(endTick<=startTick)continue;
          if(startTick>cursor)rest(startTick-cursor);
          if(startTick<cursor)continue;
          const pieces=chunks((endTick-startTick)/tpq);
          const previous=n.start<begin-1e-7,next=n.start+n.duration>end+1e-7;
          for(let pi=0;pi<pieces.length;pi++){
            const piece=pieces[pi],tiedBack=previous||pi>0,tiedForward=next||pi<pieces.length-1;
            const tieStart=tiedForward?'<Tie><type>start</type></Tie>':'';
            const tieEnd=tiedBack?'<endSpanner/>':'';
            const articulation=n.articulation==='staccato'?'<Articulation><subtype>staccato</subtype></Articulation>':
              n.articulation==='marcato_staccato'?'<Articulation><subtype>marcato</subtype></Articulation>':
              n.articulation==='legato'?'<Articulation><subtype>tenuto</subtype></Articulation>':'';
            const lyric=(text:string|undefined,syllabic:string|undefined,number:number)=>
              text&&pi===0&&!previous?`<Lyrics><no>${number}</no><syllabic>${syllabic??'single'}</syllabic><text>${esc(text)}</text></Lyrics>`:'';
            const noteXml=`<Note><pitch>${Math.round(n.pitch)}</pitch><tpc>${tpcForPitch(n.pitch,fifths)}</tpc>${tieStart}${tieEnd}</Note>`;
            events.push(`<Chord><durationType>${piece.type}</durationType>${articulation}${noteXml}${lyric(n.lyric,n.syllabic,1)}${lyric(n.lyric2,n.syllabic2,2)}</Chord>`);
          }
          cursor=endTick;
        }
        if(cursor<beats*tpq)rest(beats*tpq-cursor);
        return `<voice>${laneIndex===0?signature+dynamicsXml+chordXml:''}${events.join('')}</voice>`;
      });
      if(!voices.length)voices.push(`<voice>${signature+dynamicsXml+chordXml}${chunks(beats).map(c=>`<Rest><durationType>${c.type}</durationType></Rest>`).join('')}</voice>`);
      return `<Measure>${voices.join('')}</Measure>`;
    }).join('');
    return `<Staff id="${staffIds[index]+staffIndex}">${measures}</Staff>`;
    };
    return inst.startsWith('Piano')?renderStaff(0)+renderStaff(1):renderStaff(0);
  }).join('');
  const mscx=`<?xml version="1.0" encoding="utf-8"?><museScore version="3.6"><programVersion>3.6.2</programVersion><Score><Division>480</Division><Style><concertPitch>1</concertPitch></Style><metaTag name="workTitle">${esc(p.title)}</metaTag><metaTag name="movementTitle">${esc(p.title)}</metaTag><metaTag name="title">${esc(p.title)}</metaTag>${partXml}${staffs}</Score></museScore>`;
  const zip=new JSZip();
  zip.file('META-INF/container.xml','<?xml version="1.0" encoding="utf-8"?><container><rootfiles><rootfile full-path="score.mscx"/></rootfiles></container>');
  zip.file('score.mscx',mscx);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.musescore.mscz'});
}
export function exportMusicXml(p:Project,score:Score){
  if(!Number.isInteger(p.beats)||p.beats<1||p.beats>12)throw Error('Unsupported meter');
  const transposed=transposeScore(score,p.transposeSemitones??0);
  const head=`<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>${esc(p.title)}</work-title></work><movement-title>${esc(p.title)}</movement-title><defaults><scaling><millimeters>7</millimeters><tenths>40</tenths></scaling></defaults><part-list>${projectInstruments(p).map((inst,i)=>`<score-part id="P${i+1}"><part-name>${esc(p.instrumentNames?.[inst]||inst)}</part-name><part-abbreviation>${esc(p.instrumentNames?.[inst]||inst)}</part-abbreviation><score-instrument id="I${i+1}"><instrument-name>${esc(p.instrumentNames?.[inst]||inst)}</instrument-name></score-instrument></score-part>`).join('')}</part-list>`;
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
function abcMeasure(notes:Note[],bar:number,beats:number,chords:ChordChange[]=[]):string {
  const units=beats*4,starts=new Map<number,{pitch:number;duration:number;articulation?:Note['articulation']}[]>();
  for(const n of notes){
    const begin=Math.max(0,Math.round((n.start-bar*beats)*4));
    const end=Math.min(units,Math.round((n.start+n.duration-bar*beats)*4));
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
  const title=abcSafe(p.title)+(part==='lead'?' — Lead Sheet':' — '+abcSafe(part));
  const lines=['% Generated by Tango Arranger','X:1','T:'+title,'M:'+p.beats+'/4','L:1/16','Q:1/4='+Math.round(p.bpm)];
  let previousKey='',previousSection='';
  for(let bar=0;bar<p.bars.length;bar++){
    const current=p.bars[bar],key=transposeKeySignature(sectionKey(p,current.section),transpose);
    if(bar===0){lines.push('K:'+abcKey(key));}
    else if(key!==previousKey)lines.push('[K:'+abcKey(key)+']');
    if(current.section!==previousSection)lines.push('% Section '+abcSafe(current.section));
    const notes=part==='lead'?current.melody.map(n=>({...n,start:n.start+bar*p.beats,pitch:n.pitch+transpose})):
      (score[part]??[]).filter(n=>n.start<(bar+1)*p.beats&&n.start+n.duration>bar*p.beats).map(n=>({...n,pitch:n.pitch+transpose}));
    const chords=part==='lead'?parseChordSequence(current.chord,p.beats).map(change=>({...change,chord:transposeChord(change.chord,transpose)})):[];
    lines.push(abcMeasure(notes,bar,p.beats,chords)+' |');
    previousKey=key;previousSection=current.section;
  }
  return lines.join('\n')+'\n';
}
/** ZIP distribution bundle: unzip and import the individual .abc files in MobileSheets. */
export async function exportMobileSheetsBundle(p:Project,score:Score):Promise<Blob>{
  const zip=new JSZip();
  zip.file('00-lead-sheet.abc',exportAbc(p,score,'lead'));
  projectInstruments(p).forEach((inst,index)=>zip.file(String(index+1).padStart(2,'0')+'-'+abcFileName(inst)+'.abc',exportAbc(p,score,inst)));
  zip.file('README.txt','MobileSheets ABC bundle from Tango Arranger.\nExtract the ZIP first, then import the individual .abc files into MobileSheets.\nLead sheet: 00-lead-sheet.abc\nEach remaining file contains one instrument part.\n');
  return zip.generateAsync({type:'blob'});
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
