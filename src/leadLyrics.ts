import {parseChordSequence,type Project,type Score,type Instrument} from './music';
/** Editable chord/lyric source. Time is measured in quarter-note beats. */
export type LeadLyricToken={text:string;line:number;start:number;absolute?:boolean;syllabic:'single'|'begin'|'middle'|'end';melisma?:boolean};
export type LeadChordAnchor={chord:string;line:number;start:number;absolute?:boolean};
export type LeadLyricPlan={notes:LeadLyricToken[];chords:LeadChordAnchor[];lines:string[];end:number};
export function parseLeadLyrics(source:string,beats:number):LeadLyricPlan {
  if(!Number.isFinite(beats)||beats<=0)throw Error('Invalid beats per measure');
  const notes:LeadLyricToken[]=[],chords:LeadChordAnchor[]=[];
  const lines=source.replace(/\r\n?/g,'\n').split('\n');
  let beat=0,measureStart=0;
  let explicitBeat=false;
  lines.forEach((line,lineNumber)=>{
    const parts=line.match(/\[[^\]]+\]|\|\||\||[^\s|\[\]]+/g)??[];
    for(const part of parts){
      if(part==='||'){measureStart=Math.max(measureStart+beats,Math.ceil((beat-1e-8)/beats)*beats);beat=measureStart;explicitBeat=false;continue;}
      if(part==='|')continue; // explicit note separator; the following syllable gets its own onset
      if(/^@\d+(?:\.\d+)?$/.test(part)){
        const at=Number(part.slice(1))-1;
        if(at<0||at>=beats)throw Error('Beat marker must fit inside its measure');
        beat=measureStart+at;
        explicitBeat=true;
        continue;
      }
      if(part.startsWith('[')&&part.endsWith(']')){
        const chord=part.slice(1,-1).trim();
        // Section headings are document structure, not musical harmony.
        if(/^(?:verse|chorus|refrain|bridge|intro|outro|instrumental|interlude|solo|pre-chorus|coda|ending|section)\b/i.test(chord)){
          explicitBeat=false;continue;
        }
        if(chord)chords.push({chord,line:lineNumber,start:beat,...(explicitBeat?{absolute:true}:{})});
        explicitBeat=false;
        continue;
      }
      const fragments=part.split('-').filter(Boolean);
      fragments.forEach((fragment,i)=>{
        const melisma=fragment.endsWith('_');
        const text=fragment.replace(/_+$/,'');
        if(!text){beat++;return;}
        notes.push({text,line:lineNumber,start:beat,...(explicitBeat?{absolute:true}:{}),syllabic:fragments.length===1?'single':i===0?'begin':i===fragments.length-1?'end':'middle',...(melisma?{melisma:true}:{})});
        beat++;
        explicitBeat=false;
      });
    }
  });
  return {notes,chords,lines,end:beat};
}
/** A readable chord-over-text export with original lyric line breaks. */
export function exportLeadLyricsTab(source:string):string {
 return source.replace(/\r\n?/g,'\n').split('\n').map(line=>{
  let lyric='',chordLine='',cursor=0;
  for(let i=0;i<line.length;){
   if(line[i]==='['){
    const end=line.indexOf(']',i+1);
    if(end>i){
     const chord=line.slice(i+1,end);
     // Place each chord at or after its lyric anchor. Chord names must
     // never touch or overlap, even when several changes are close together.
     const at=Math.max(lyric.length,cursor);
     chordLine=chordLine.padEnd(at,' ')+chord;
     cursor=at+chord.length+1;
     i=end+1;continue;
    }
   }
   if(line.slice(i,i+2)==='||'){lyric+=' | ';i+=2;continue;}
   if(line[i]==='|'){i++;continue;}
   lyric+=line[i++];
  }
  return (chordLine.trim()?chordLine.trimEnd()+'\n':'')+lyric.trimEnd();
 }).join('\n');
}

/** Original lyric line boundaries mapped onto actual note onsets. Empty lines
 * are retained in the source, while the karaoke view uses sung line starts.
 */
export function lyricLineStarts(plan:LeadLyricPlan,mappedStarts:readonly number[]):number[] {
 const seen=new Set<number>(),result:number[]=[];
 plan.notes.forEach((token,i)=>{
   if(seen.has(token.line))return;
   seen.add(token.line);
   const start=mappedStarts[i]??token.start;
   if(Number.isFinite(start))result.push(start);
 });
 return [...new Set(result)].sort((a,b)=>a-b);
}
export type PositionedLeadChord={measure:number;beat:number;chord:string;snapped:boolean};
/** Convert source [chord] anchors into the leadsheet's quarter-note harmony grid.
 * Mapped note onsets follow the existing melody; missing mappings use the
 * virtual source timeline. Return only explicitly anchored chord measures.
 */
export function positionLeadChords(
 plan:LeadLyricPlan,beats:number,measureCount:number,mappedStarts:readonly number[]=[]
):PositionedLeadChord[] {
 if(!Number.isInteger(beats)||beats<1||!Number.isInteger(measureCount)||measureCount<1)throw Error('Invalid chord timeline');
 const result:PositionedLeadChord[]=[];
 for(const anchor of plan.chords){
   if(!new RegExp('^[A-Ga-g][#b]?[a-zA-Z0-9+#°øΔ()/-]*$').test(anchor.chord))
     throw Error('Invalid chord marker: '+anchor.chord);
   const index=plan.notes.findIndex(token=>token.start>=anchor.start);
   const absolute=anchor.absolute?anchor.start:index>=0?(mappedStarts[index]??anchor.start):anchor.start;
   if(!Number.isFinite(absolute)||absolute<0||absolute>=beats*measureCount)throw Error('Chord marker lies beyond the song');
   const nearest=Math.round(absolute);
   const snapped=Math.max(0,Math.min(beats*measureCount-1,nearest));
   result.push({measure:Math.floor(snapped/beats),beat:snapped%beats,
     chord:anchor.chord[0].toUpperCase()+anchor.chord.slice(1),
     snapped:Math.abs(absolute-snapped)>1e-7});
 }
 return result;
}

/** Read a song as human-readable chord-over-lyrics text.
 * No @beat markers: the existing Voice score remains the source of exact
 * pitches and onset times when the user chooses "Use existing Voice melody".
 * Bar markers are emitted only for instrumental measures without lyric notes.\n * Line breaks remain presentation-only; sung measures follow the Voice melody.
 */
export function leadLyricsFromSong(project:Project,score:Score,voice:Instrument,verse:1|2=1):string {
 if(!project.bars.length)throw Error('Song has no measures');
 const notes=(score[voice]??[]).filter(n=>Boolean((verse===1?n.lyric:n.lyric2)?.trim()))
   .sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
 const beats=project.beats,lines:string[]=[];
 for(let bar=0;bar<project.bars.length;bar++){
   const offset=bar*beats;
   const chords=parseChordSequence(project.bars[bar].chord,beats);
   const sung=notes.filter(n=>n.start>=offset-1e-8&&n.start<offset+beats-1e-8);
   const events:{beat:number;kind:0|1;content:string}[]=[];
   for(const chord of chords)events.push({beat:chord.beat,kind:0,content:'['+chord.chord+']'});
   for(const note of sung){
     const lyric=(verse===1?note.lyric:note.lyric2)!.trim().replace(/[\\[\\]|]/g,'');
     if(lyric)events.push({beat:note.start-offset,kind:1,content:lyric+((verse===1?note.melisma:note.melisma2)?'_':'')});
   }
   events.sort((a,b)=>a.beat-b.beat||a.kind-b.kind);
   // Chord markers are attached to the following word, not separate words.
   let line='';
   for(const event of events){
     if(event.kind===0){if(line&&!line.endsWith(' '))line+=' ';line+=event.content;}
     else {if(line&&!line.endsWith(']'))line+=' ';line+=event.content;}
   }
   lines.push(line.trim()+(bar<project.bars.length-1?' ||':''));
 }
 return lines.join('\n');
}

/** Build a readable text projection of the source. Collapse consecutive
 * chord-only measures as an instrumental passage instead of repeating blank
 * lyric lines. This is a presentation transform; source timing is untouched.
 */
export function readableLeadSheet(source:string):string {
 const lines=source.replace(/\r\n?/g,'\n').split('\n');
 const out:string[]=[];
 let instrumental:string[]=[];
 const flush=()=>{
   if(!instrumental.length)return;
   out.push('[Instrumental · '+instrumental.length+' measure'+(instrumental.length===1?'':'s')+']');
   out.push(instrumental.map(line=>line.replace(/\[([^\]]+)\]/g,'$1').replace(/\|\|/g,'').trim()).join('  |  '));
   out.push('');
   instrumental=[];
 };
 for(const original of lines){
   const line=original.replace(/\|\|/g,'').trim();
   const withoutChords=line.replace(/\[[^\]]+\]/g,'').trim();
   const chordOnly=line&&/\[[A-Ga-g][^\]]*\]/.test(line)&&!withoutChords;
   if(chordOnly){instrumental.push(line);continue;}
   flush();
   // Standalone [Verse] / [Chorus] headings are document labels.
   if(/^\[(?:verse|chorus|bridge|intro|outro|instrumental|interlude|solo|pre-chorus|coda|ending|section)[^\]]*\]$/i.test(line)){
     if(out.length&&out[out.length-1]!=='')out.push('');
     out.push(line);continue;
   }
   const converted=exportLeadLyricsTab(line);
   out.push(converted.replace(/\s+\|\s*$/,'').trimEnd());
 }
 flush();
 return out.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}
