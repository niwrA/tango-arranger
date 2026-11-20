import {blankProject,parseChordSequence,sectionLetter,type Project} from './music';
export type LeadImportSection={title:string;start:number;measures:number};
export type LeadImportBar={chord:string;lyrics:string;original:string};
export type LeadImportLine={sourceLine:number;sectionIndex:number;start:number;measures:number;text:string;reason:string;estimated:boolean;joinedSourceLines:number[]};
export type LeadImportPreview={sections:LeadImportSection[];bars:LeadImportBar[];lines:LeadImportLine[];source:string;warnings:string[]};
const chord=/^[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus|add|m|M|ø|°|alt|no)\d*|\d+)*(?:[#b]\d+)*(?:\/[A-G](?:#|b)?)?$/i;
const pageMarker=/^(?:page|pagina|seite|página)\s*[:#.-]?\s*\d+\s*(?:(?:\/|of|van|de)\s*\d+)?$/i;
const heading=/^\[(verse|chorus|bridge|intro|outro|pre-chorus|instrumental|solo|interlude|refrain|coda|ending|section)(?:[^\]]*)\]$/i;
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
  const at=Math.min(result.length,entry.at);
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
type Row={sourceLine:number;sectionIndex:number;normalized:string;lyrics:string;chords:string[];barHints:number;text:string;phraseEnd:boolean;events:number;joinedSourceLines:number[]};
function estimate(row:Row,sectionLength:number):{measures:number;reason:string}{
 if(row.barHints>0)return {measures:row.barHints,reason:'Suggested || measure boundaries'};
 const count=row.chords.length;
 if(count>1)return {measures:count,reason:count+' distinct chord positions; provisionally one measure each'};
 if(sectionLength===4||sectionLength===8)return {measures:1,reason:'Regular '+sectionLength+'-line phrase and harmonic pattern'};
 if(sectionLength===2)return {measures:2,reason:'Two-line phrase; provisionally two measures per line'};
 if(count===1)return {measures:1,reason:'One chord position, duration uncertain'};
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
 const titles:string[]=[];
 let activeSection=0,nextTitle:string|null=null,removedPages=0,joinedWraps=0,joinedChordWraps=0;
 const phraseContinuation=/\b(?:a|an|the|and|or|but|to|of|for|with|from|in|on|at|some|my|your|you|I|we|they|it|is|are|was|were|will|would|could|should|can|be|been|have|has|had|do|does|did|so|if|when|where|wherever|that|who|which|all|just|even|very|more|most|not)\s*$/i;
 const addRow=(normalized:string,sourceLine:number)=>{
  const chosen=lineChords(normalized);
  const bracketed=normalized.match(/\[[^\]]+\]/g)??[];
  if(chosen.length!==bracketed.length)warnings.push('Unrecognized bracket token at line '+(sourceLine+1));
  const lyrics=normalized.replace(/\[[^\]]+\]/g,'').replace(/\|+/g,'').trim();
  if(!rows.length||nextTitle!==null){
   if(rows.length&&rows[rows.length-1].sectionIndex===activeSection)activeSection++;
   titles[activeSection]=nextTitle??'Section '+sectionLetter(activeSection);
   nextTitle=null;
  }
  const pipes=normalized.match(/\|{1,3}/g)??[];
  const barHints=pipes.filter(p=>p.length>=2).length+
   (pipes.some(p=>p.length>=2)&&!/\|{2,3}\s*$/.test(normalized)?1:0);
  rows.push({sourceLine,sectionIndex:activeSection,normalized,lyrics,chords:chosen,
   barHints,phraseEnd:/\|\|\|\s*$/.test(normalized),
   events:pipes.filter(p=>p==='|').length,text:normalized,joinedSourceLines:[]});
  sourceLines.push(normalized);
 };
 for(let i=0;i<inputs.length;i++){
  const raw=inputs[i].replace(/\t/g,'    '),trimmed=raw.trim();
  if(!trimmed){sourceLines.push('');continue;}
  if(pageMarker.test(trimmed)){removedPages++;continue;}
  if(heading.test(trimmed)){nextTitle=trimmed.slice(1,-1);sourceLines.push(trimmed);continue;}
  if(/^\{(?:start_of_|end_of_|soc|eoc)/i.test(trimmed)){
   const h=trimmed.match(/^\{(?:start_of_)?(verse|chorus|bridge)(?::([^}]+))?\}/i);
   if(h)nextTitle=h[2]?.trim()||h[1];
   sourceLines.push(h?'['+(nextTitle??'Section')+']':'');continue;
  }
  const sourceLine=i;
  let normalized=trimmed;
  // A chord row belongs to the following lyric row. Preserve horizontal
  // spacing while anchoring chords to their approximate lyric positions.
  if(chordRow(trimmed)&&i+1<inputs.length&&inputs[i+1].trim()&&!pageMarker.test(inputs[i+1].trim())&&
   !chordRow(inputs[i+1].trim())&&!heading.test(inputs[i+1].trim())){
   normalized=addChordMarkers(raw,inputs[++i].trimEnd());
  }else if(chordRow(trimmed))normalized=normalizeChordOnly(trimmed);
  // A wrapped lyric line is joined to the previous musical line when it
  // contains no new chords, headings, or explicit phrase boundary.
  const hasChord=lineChords(normalized).length>0;
  const previous=rows[rows.length-1];
  const canJoin=previous&&nextTitle===null&&previous.sectionIndex===activeSection&&
    !previous.phraseEnd&&!/\|{2,3}\s*$/.test(previous.normalized);
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
  if(row.sectionIndex>=sections.length)sections.push({title:titles[row.sectionIndex],start:bars.length,measures:0});
  const sectionLength=rows.filter(r=>r.sectionIndex===row.sectionIndex).length;
  const guess=estimate(row,sectionLength);
  const explicit=lineMeasures[row.sourceLine]||sectionMeasuresPerLine[row.sectionIndex]||defaultMeasuresPerLine;
  const measures=explicit||guess.measures;
  const reason=lineMeasures[row.sourceLine]?'Manual override for this line':
    sectionMeasuresPerLine[row.sectionIndex]?'Section override':
    defaultMeasuresPerLine?'Default measures-per-line setting':guess.reason;
  if(bars.length+measures>512)throw Error('The song exceeds 512 measures');
  const start=bars.length;
  const chordsPerBar=Array.from({length:measures},()=>[] as string[]);
  row.chords.forEach((chord,k)=>{
   const bar=Math.min(measures-1,Math.floor(k*measures/row.chords.length));
   chordsPerBar[bar].push(chord);
  });
  for(let b=0;b<measures;b++)bars.push({chord:chordsPerBar[b].join(','),lyrics:b===0?row.lyrics:'',original:b===0?row.normalized:''});
  lines.push({sourceLine:row.sourceLine,sectionIndex:row.sectionIndex,start,measures,text:row.text,
   reason,estimated:!explicit&&row.barHints===0,joinedSourceLines:row.joinedSourceLines});
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
 p.leadLyrics={'1':{source:preview.source,useExistingMelody:false}};
 return p;
}
