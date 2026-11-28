import {blankProject,parseChordSequence,sectionLetter,type Note,type Project} from './music';
export type LeadImportSection={title:string;singer?:string;start:number;measures:number};
export type LeadImportBar={chord:string;lyrics:string;original:string};
export type LeadImportLine={sourceLine:number;sectionIndex:number;start:number;measures:number;text:string;reason:string;estimated:boolean;fixedMeasures?:boolean;joinedSourceLines:number[]};
export type LeadImportPreview={sections:LeadImportSection[];bars:LeadImportBar[];lines:LeadImportLine[];source:string;warnings:string[]};
const chord=/^[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus|add|m|M|ø|°|alt|no)\d*|\d+)*(?:[#b]\d+)*(?:\/[A-G](?:#|b)?)?$/i;
const pageMarker=/^(?:page|pagina|seite|página)\s*[:#.-]?\s*\d+\s*(?:(?:\/|of|van|de)\s*\d+)?$/i;
const heading=/^\[((?:verse|chorus|bridge|intro|outro|pre-chorus|instrumental|solo|interlude|refrain|coda|ending|section)\b[^\]]*)\](?:\s*\[[^\]]+\])*$/i;
function repeatedChordRow(line:string):{chords:string[];count:number}|null{
 const match=line.match(/^(.+?)\s+(?:[x×]\s*(\d+)|(\d+)\s*[x×])$/i);
 if(!match)return null;
 const chords=match[1].trim().split(/\s+/);
 if(!chords.every(isChord))return null;
 const count=Number(match[2]??match[3]);
 if(!Number.isSafeInteger(count)||count<1||count*chords.length>512)throw Error('A chord repeat must fit inside 512 measures');
 return {chords,count};
}
function isChord(t:string){return chord.test(t);}
function chordRow(line:string):boolean{
 const parts=line.trim().split(/\s+/).filter(x=>x!=='|'&&x!=='||'&&x!=='|||');
 return parts.length>0&&parts.every(isChord);
}
function addChordMarkers(chords:string,lyrics:string):string{
 const found:{at:number;chord:string}[]=[];
 const re=/\S+/g;let match:RegExpExecArray|null;
 while((match=re.exec(chords))!==null)if(isChord(match[0]))found.push({at:match.index,chord:match[0]});
 let result=lyrics;
 for(const entry of found.reverse()){
  // Clamp to the original row so trailing chords never land inside a tag.
  const at=Math.min(lyrics.length,entry.at);
  result=result.slice(0,at)+'['+entry.chord+']'+result.slice(at);
 }
 return result;
}
function normalizeChordOnly(line:string):string{
 return line.replace(/(^|\s)([A-G](?:#|b)?[^\s|]*)(?=\s|\||$)/g,(_all,prefix,token)=>
  prefix+(isChord(token)?'['+token+']':token));
}
function lineChords(text:string):string[]{
 return (text.match(/\[[^\]]+\]/g)??[]).map(t=>t.slice(1,-1)).filter(isChord);
}
type Row={sourceLine:number;sectionIndex:number;normalized:string;lyrics:string;chords:string[];barHints:number;text:string;phraseEnd:boolean;events:number;fixedMeasures?:number;joinedSourceLines:number[]};
/** Harmonic grouping is a proposal, not a transcription of chord timing.
 * A ii-V pair (roots a fourth apart) resolving by another fourth to I
 * commonly occupies one measure. Avoid merging a V-I cadence itself.
 */
function pitchClass(symbol:string):number|null{
 const m=symbol.match(/^([A-G])([#b]?)/i);
 if(!m)return null;
 const roots:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
 return (roots[m[1].toUpperCase()]+(m[2]==='#'?1:m[2]==='b'?-1:0)+12)%12;
}
function harmonicGroups(chords:readonly string[]):string[][]{
 const result:string[][]=[];
 for(let i=0;i<chords.length;i++){
  const first=pitchClass(chords[i]),second=pitchClass(chords[i+1]??'');
  const third=pitchClass(chords[i+2]??'');
  const fourthUp=first!==null&&second!==null&&(second-first+12)%12===5;
  const resolves=second!==null&&third!==null&&(third-second+12)%12===5;
  const dominantNext=/^[A-G][#b]?(?:(?:7|9|11|13)|(?:sus|7sus))/i.test(chords[i+1]??'');
  if(fourthUp&&resolves&&dominantNext){
   result.push([chords[i],chords[i+1]]);i++;
  }else result.push([chords[i]]);
 }
 return result;
}
function estimate(row:Row,sectionLength:number):{measures:number;reason:string}{
 if(row.barHints>0)return {measures:row.barHints,reason:'Suggested || measure boundaries'};
 const count=row.chords.length;
 const groups=harmonicGroups(row.chords);
 if(count>1&&groups.length<count)return {measures:groups.length,reason:count+' chord positions grouped into '+groups.length+' measures using likely ii–V–I motion'};
 if(count>1)return {measures:count,reason:count+' distinct chord positions; provisionally one measure each'};
 if(sectionLength===4||sectionLength===8)return {measures:1,reason:'Regular '+sectionLength+'-line phrase and harmonic pattern'};
 if(count===1)return {measures:1,reason:'One chord position, duration uncertain; avoid unsupported empty measures'};
 if(sectionLength===2)return {measures:1,reason:'Two-line phrase without chord evidence for extra measures'};
 return {measures:1,reason:'No clear harmonic timing evidence'};
}
/** A deterministic, explainable layout of imported chord sheets.
 * Explicit barlines take precedence; otherwise chord counts and phrase length
 * propose durations. Manual defaults, section rules and individual line rules
 * override the proposal. No pitch or exact note timing is inferred.
 */
export function previewLeadSheetImport(
 input:string,defaultMeasuresPerLine=1,sectionMeasuresPerLine:readonly number[]=[],
 lineMeasures:Readonly<Record<number,number>>={},phraseJoins:Readonly<Record<number,boolean>>={}
):LeadImportPreview{
 const valid=(n:number)=>Number.isInteger(n)&&n>=1&&n<=32;
 if(defaultMeasuresPerLine!==0&&!valid(defaultMeasuresPerLine))throw Error('Measures per line must be between 1 and 32 or Automatic');
 if(sectionMeasuresPerLine.some(n=>n!==0&&!valid(n)))throw Error('Section measures per line must be between 1 and 32');
 if(Object.values(lineMeasures).some(n=>n!==0&&!valid(n)))throw Error('Line measures must be between 1 and 32');
 const inputs=input.replace(/\r\n?/g,'\n').split('\n');
 const warnings:string[]=[],rows:Row[]=[],sourceLines:string[]=[];
 const titles:string[]=[],singers:(string|undefined)[]=[];
 let activeSection=0,nextTitle:string|null=null,nextSinger:string|undefined,removedPages=0,joinedWraps=0,joinedChordWraps=0;
 const phraseContinuation=/(?<![\p{L}\p{N}])(?:a|an|the|and|or|but|to|of|for|with|from|in|on|at|some|my|your|you|I|we|they|it|is|are|was|were|will|would|could|should|can|be|been|have|has|had|do|does|did|so|if|when|where|wherever|that|who|which|all|just|even|very|more|most|not)\s*$/iu;
 const addRow=(normalized:string,sourceLine:number,fixedMeasures?:number)=>{
  const chosen=lineChords(normalized);
  const bracketed=normalized.match(/\[[^\]]+\]/g)??[];
  if(chosen.length!==bracketed.length)warnings.push('Unrecognized bracket token at line '+(sourceLine+1));
  const lyrics=normalized.replace(/\[[^\]]+\]/g,'').replace(/\|+/g,'').trim();
  if(!rows.length||nextTitle!==null){
   if(rows.length&&rows[rows.length-1].sectionIndex===activeSection)activeSection++;
   titles[activeSection]=nextTitle??'Section '+sectionLetter(activeSection);
   singers[activeSection]=nextSinger;
   nextTitle=null;nextSinger=undefined;
  }
  const pipes=normalized.match(/\|{1,3}/g)??[];
  const barHints=pipes.filter(p=>p.length>=2).length+
   (pipes.some(p=>p.length>=2)&&!/\|{2,3}\s*$/.test(normalized)?1:0);
  rows.push({sourceLine,sectionIndex:activeSection,normalized,lyrics,chords:chosen,
   barHints,phraseEnd:/\|\|\|\s*$/.test(normalized),
   events:pipes.filter(p=>p==='|').length,fixedMeasures,text:normalized,joinedSourceLines:[]});
  sourceLines.push(normalized);
 };
 for(let i=0;i<inputs.length;i++){
  const raw=inputs[i].replace(/\t/g,'    '),trimmed=raw.trim();
  if(!trimmed){sourceLines.push('');continue;}
  if(pageMarker.test(trimmed)){removedPages++;continue;}
  const sectionHeading=trimmed.match(heading);
  if(sectionHeading){
   const tags=[...trimmed.matchAll(/\[([^\]]+)\]/g)].map(tag=>tag[1].trim());
   nextTitle=tags[0];nextSinger=tags.slice(1).filter(Boolean).join(' / ')||undefined;
   // Use one bracketed heading so downstream lyric alignment does not
   // mistake a singer name for an inline chord or a lyric token.
   sourceLines.push('['+nextTitle+(nextSinger?' — '+nextSinger:'')+']');continue;
  }
  if(/^\{(?:start_of_|end_of_|soc|eoc)/i.test(trimmed)){
   const h=trimmed.match(/^\{(?:start_of_)?(verse|chorus|bridge)(?::([^}]+))?\}/i);
   if(h){nextTitle=h[2]?.trim()||h[1];nextSinger=undefined;}
   sourceLines.push(h?'['+(nextTitle??'Section')+']':'');continue;
  }
  const sourceLine=i;
  let normalized=trimmed;
  const repeat=repeatedChordRow(trimmed);
  if(repeat){
   const groups=Array.from({length:repeat.count},()=>repeat.chords).flat();
   addRow(groups.map(symbol=>'['+symbol+'] ||').join(' '),sourceLine,groups.length);
   continue;
  }
  // A chord row belongs to the following lyric row. Preserve horizontal
  // spacing while anchoring chords to their approximate lyric positions.
  if(chordRow(trimmed)&&i+1<inputs.length&&inputs[i+1].trim()&&!pageMarker.test(inputs[i+1].trim())&&
   !chordRow(inputs[i+1].trim())&&!heading.test(inputs[i+1].trim())&&!repeatedChordRow(inputs[i+1].trim())){
   normalized=addChordMarkers(raw,inputs[++i].trimEnd());
  }else if(chordRow(trimmed))normalized=normalizeChordOnly(trimmed);
  // A wrapped lyric line is joined to the previous musical line when it
  // contains no new chords, headings, or explicit phrase boundary.
  const hasChord=lineChords(normalized).length>0;
  const previous=rows[rows.length-1];
  const canJoin=previous&&nextTitle===null&&previous.sectionIndex===activeSection&&
    !previous.fixedMeasures&&!previous.phraseEnd&&!/\|{2,3}\s*$/.test(previous.normalized);
  // Chord-bearing continuations can also be a website's visual wrap.
  // Only merge when the preceding lyric ends in an unfinished grammatical
  // connector, and never across blank lines, section headings or pipe hints.
  const adjacent=sourceLine>0&&inputs.slice(previous?.sourceLine??sourceLine,sourceLine).every(
   (part,k)=>k===0||Boolean(part.trim())&&!heading.test(part.trim())&&!pageMarker.test(part.trim()));
  const hasExplicitBoundary=/\|{2,3}\s*$/.test(previous?.normalized??'');
  const shouldJoin=phraseJoins[sourceLine]??Boolean(
   canJoin&&adjacent&&!hasExplicitBoundary&&!/[.!?;:]$/.test(previous.lyrics)&&
   (hasChord?phraseContinuation.test(previous.lyrics):!chordRow(trimmed)));
  if(shouldJoin&&previous&&nextTitle===null&&previous.sectionIndex===activeSection&&!hasExplicitBoundary){
   const joined=previous.normalized+' '+normalized.trim();
   previous.normalized=joined;previous.text=joined;
   previous.lyrics=(previous.lyrics+' '+normalized.replace(/\[[^\]]+\]/g,'').replace(/\|+/g,'').trim()).trim();
   previous.chords.push(...lineChords(normalized));
   previous.joinedSourceLines.push(sourceLine);
   const pipes=joined.match(/\|{1,3}/g)??[];
   previous.barHints=pipes.filter(p=>p.length>=2).length+
    (pipes.some(p=>p.length>=2)&&!/\|{2,3}\s*$/.test(joined)?1:0);
   previous.phraseEnd=/\|\|\|\s*$/.test(joined);
   sourceLines[sourceLines.length-1]=joined;
   if(hasChord)joinedChordWraps++;else joinedWraps++;
   continue;
  }
  addRow(normalized,sourceLine);
 }
 if(removedPages)warnings.push('Removed '+removedPages+' page marker'+(removedPages===1?'':'s'));
 if(joinedWraps)warnings.push('Joined '+joinedWraps+' wrapped lyric line'+(joinedWraps===1?'':'s'));
 if(joinedChordWraps)warnings.push('Grouped '+joinedChordWraps+' chord-bearing wrapped line'+(joinedChordWraps===1?'':'s')+' into musical phrases');
 if(!rows.length)throw Error('No chords or lyric lines detected');
 if(activeSection>=26)throw Error('The song exceeds 26 sections');
 const bars:LeadImportBar[]=[],lines:LeadImportLine[]=[],sections:LeadImportSection[]=[];
 for(let i=0;i<rows.length;i++){
  const row=rows[i];
  if(row.sectionIndex>=sections.length)sections.push({title:titles[row.sectionIndex],...(singers[row.sectionIndex]?{singer:singers[row.sectionIndex]}:{}),start:bars.length,measures:0});
  const sectionLength=rows.filter(r=>r.sectionIndex===row.sectionIndex).length;
  const guess=estimate(row,sectionLength);
  const explicit=lineMeasures[row.sourceLine]||sectionMeasuresPerLine[row.sectionIndex]||defaultMeasuresPerLine;
  const measures=row.fixedMeasures||explicit||guess.measures;
  const reason=row.fixedMeasures?'Chord repeat · one measure per chord':lineMeasures[row.sourceLine]?'Manual override for this line':
    sectionMeasuresPerLine[row.sectionIndex]?'Section override':
    defaultMeasuresPerLine?'Default measures-per-line setting':guess.reason;
  if(bars.length+measures>512)throw Error('The song exceeds 512 measures');
  const start=bars.length;
  const chordsPerBar=Array.from({length:measures},()=>[] as string[]);
  // Keep a likely ii-V pair together instead of assigning every chord its
  // own measure. When manually expanded, spread groups without dropping notes.
  const groups=(!explicit&&row.barHints===0)?harmonicGroups(row.chords):row.chords.map(chord=>[chord]);
  groups.forEach((group,k)=>{
   const bar=Math.min(measures-1,Math.floor(k*measures/groups.length));
   chordsPerBar[bar].push(...group);
  });
  for(let b=0;b<measures;b++)bars.push({chord:chordsPerBar[b].join(','),lyrics:b===0?row.lyrics:'',original:b===0?row.normalized:''});
  lines.push({sourceLine:row.sourceLine,sectionIndex:row.sectionIndex,start,measures,text:row.text,
   reason,estimated:!explicit&&row.barHints===0,...(row.fixedMeasures?{fixedMeasures:true}:{}),joinedSourceLines:row.joinedSourceLines});
 }
 for(let i=0;i<sections.length;i++)sections[i].measures=(sections[i+1]?.start??bars.length)-sections[i].start;
 return {sections,bars,lines,source:sourceLines.join('\n'),warnings};
}
export function arrangeImportedSections(preview:LeadImportPreview,starts:readonly number[]):LeadImportSection[]{
 if(starts.length!==preview.sections.length||starts[0]!==0)throw Error('The first section must start at measure 1');
 if(starts.some((n,i)=>!Number.isInteger(n)||n<0||n>=preview.bars.length||(i>0&&n<=starts[i-1])))
  throw Error('Section starts must be strictly increasing and inside the song');
 return preview.sections.map((section,i)=>({...section,start:starts[i],measures:(starts[i+1]??preview.bars.length)-starts[i]}));
}
/** Create an explicitly provisional vocal guide. A leadsheet has words and
 * harmony but no recoverable sung pitches or rhythm. These editable notes are
 * chord-tone placeholders, never a claim about the original recording.
 */
function vocalGuide(preview:LeadImportPreview,beats:number):Note[]{
 const notes:Note[]=[];
 let previousPitch=67;
 const pitchClassOf=(chord:string):number=>{
  const match=chord.match(/^([A-G])([#b]?)/i);
  if(!match)return 0;
  const roots:Record<string,number>={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
  return (roots[match[1].toUpperCase()]+(match[2]==='#'?1:match[2]==='b'?-1:0)+12)%12;
 };
 for(const line of preview.lines){
  const words=(preview.bars[line.start]?.lyrics.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)??[]);
  if(!words.length)continue;
  const total=line.measures*beats;
  const step=total/words.length;
  // Keep even whole beats when they already fit; otherwise use the coarsest
  // regular subdivision that can hold every word without sharing an onset.
  // Floor into that grid so a word stays in its original measure.
  const subdivisions=Number.isInteger(step)?1:[2,4,8,16].find(n=>total*n>=words.length);
  const at=(index:number)=>subdivisions
    ?Math.floor(index*total*subdivisions/words.length)/subdivisions:index*step;
  for(let i=0;i<words.length;i++){
   const start=line.start*beats+at(i);
   const bar=Math.min(preview.bars.length-1,Math.floor(start/beats));
   const changes=preview.bars[bar]?.chord.split(',').filter(Boolean)??[];
   const within=(start%beats)/beats;
   const chord=changes[Math.min(changes.length-1,Math.floor(within*changes.length))]??'';
   const root=pitchClassOf(chord);
   const minor=/^[A-G][#b]?(?:m(?!aj)|min|dim|ø)/i.test(chord);
   const intervals=minor?[0,3,7]:[0,4,7];
   const candidates=intervals.flatMap(interval=>[60,72,84].map(octave=>octave+((root+interval)%12)))
    .filter(pitch=>pitch>=60&&pitch<=81);
   const pitch=candidates.sort((a,b)=>Math.abs(a-previousPitch)-Math.abs(b-previousPitch)||a-b)[0]??67;
   previousPitch=pitch;
   const duration=subdivisions?Math.min(at(i+1)-at(i),beats-(start%beats))
     :Math.min(step,beats-(start%beats));
   // A detached release is a playback property, not an engraved rest.
   notes.push({pitch,start,duration,gate:Math.min(0.94,step*0.81/duration),velocity:76,
    lyric:words[i],syllabic:'single',source:'generated'});
  }
 }
 return notes;
}
export function projectFromLeadSheet(preview:LeadImportPreview,title:string,beats:number,bpm:number,starts=preview.sections.map(s=>s.start)):Project{
 const sections=arrangeImportedSections(preview,starts);
 const p=blankProject({title,beats,bpm,sections:sections.length,measuresPerSection:sections.map(s=>s.measures)});
 p.bars=preview.bars.map((bar,i)=>{
  const section=[...sections].reverse().find(s=>s.start<=i)!;
  const tokens=bar.chord.split(',').filter(Boolean);
  if(tokens.length>beats)throw Error('Too many chords in measure '+(i+1));
  for(const symbol of tokens)parseChordSequence(symbol,beats);
  return {chord:bar.chord,melody:[],section:sectionLetter(sections.indexOf(section))};
 });
 const voice=vocalGuide(preview,beats);
 if(voice.length){
  p.importedScore={Voice:voice};
  p.protectedBars=Object.fromEntries(voice.map(n=>['Voice:'+Math.floor((n.start+1e-7)/beats),true]));
 }
 p.leadLyrics={'1':{source:preview.source,useExistingMelody:false}};
 return p;
}
