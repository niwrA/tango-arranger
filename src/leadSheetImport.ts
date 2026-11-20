import {blankProject,parseChordSequence,sectionLetter,type Project} from './music';
export type LeadImportSection={title:string;start:number;measures:number};
export type LeadImportBar={chord:string;lyrics:string;original:string};
export type LeadImportLine={sourceLine:number;sectionIndex:number;start:number;measures:number;text:string;reason:string;estimated:boolean};
export type LeadImportPreview={sections:LeadImportSection[];bars:LeadImportBar[];lines:LeadImportLine[];source:string;warnings:string[]};
const chord=/^[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus|add|m|M|ø|°)?(?:\d+)?(?:[#b]\d+)?(?:\/[A-G](?:#|b)?)?)$/;
const heading=/^\[(verse|chorus|bridge|intro|outro|pre-chorus|instrumental|solo|interlude|refrain|coda|ending|section)(?:[^\]]*)\]$/i;
function isChord(t:string){return chord.test(t);}
function addChordMarkers(chords:string,lyrics:string):string {
 const found:{at:number;chord:string}[]=[];
 const re=/\S+/g;let match:RegExpExecArray|null;
 while((match=re.exec(chords))!==null)if(isChord(match[0]))found.push({at:match.index,chord:match[0]});
 let result=lyrics;
 for(const entry of found.reverse()){const at=Math.min(result.length,entry.at);result=result.slice(0,at)+'['+entry.chord+']'+result.slice(at);}
 return result;
}
function chordRow(line:string):boolean{
 const parts=line.trim().split(/\s+/);
 return parts.length>0&&parts.every(isChord);
}
type Row={sourceLine:number;sectionIndex:number;normalized:string;lyrics:string;chords:string[];barHints:number;text:string};
function estimate(row:Row,sectionLength:number):{measures:number;reason:string}{
 if(row.barHints>0)return {measures:row.barHints,reason:'Explicit || measure boundaries'};
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
 lineMeasures:Readonly<Record<number,number>>={}
):LeadImportPreview{
 const valid=(n:number)=>Number.isInteger(n)&&n>=1&&n<=32;
 if(defaultMeasuresPerLine!==0&&!valid(defaultMeasuresPerLine))throw Error('Measures per line must be between 1 and 32 or Automatic');
 if(sectionMeasuresPerLine.some(n=>n!==0&&!valid(n)))throw Error('Section measures per line must be between 1 and 32');
 if(Object.values(lineMeasures).some(n=>n!==0&&!valid(n)))throw Error('Line measures must be between 1 and 32');
 const inputs=input.replace(/\r\n?/g,'\n').split('\n');
 const warnings:string[]=[],rows:Row[]=[],sourceLines:string[]=[];
 const titles:string[]=[];
 let activeSection=0,nextTitle:string|null=null;
 for(let i=0;i<inputs.length;i++){
  const raw=inputs[i].replace(/\t/g,'    '),trimmed=raw.trim();
  if(!trimmed){sourceLines.push('');continue;}
  if(heading.test(trimmed)){nextTitle=trimmed.slice(1,-1);sourceLines.push(trimmed);continue;}
  if(/^\{(?:start_of_|end_of_|soc|eoc)/i.test(trimmed)){
   const h=trimmed.match(/^\{(?:start_of_)?(verse|chorus|bridge)(?::([^}]+))?\}/i);
   if(h)nextTitle=h[2]?.trim()||h[1];
   sourceLines.push(h?'['+(nextTitle??'Section')+']':'');continue;
  }
  const sourceLine=i;
  let normalized=trimmed;
  const separateChords=trimmed.split(/\s*\|+\s*/).filter(Boolean);
  if(separateChords.length>1&&separateChords.every(isChord)){
   normalized=separateChords.map(c=>'['+c+']').join(' || ');
  }else if(chordRow(trimmed)&&i+1<inputs.length&&inputs[i+1].trim()&&!chordRow(inputs[i+1].trim())&&!heading.test(inputs[i+1].trim())){
   normalized=addChordMarkers(raw,inputs[++i]);
  }else if(chordRow(trimmed))normalized='['+trimmed.split(/\s+/).join('] [')+']';
  const bracketed=normalized.match(/\[[^\]]+\]/g)??[];
  const chosen=bracketed.map(c=>c.slice(1,-1)).filter(isChord);
  if(bracketed.length!==chosen.length)warnings.push('Unrecognized bracket token at line '+(sourceLine+1));
  const lyrics=normalized.replace(/\[[^\]]+\]/g,'').replace(/\|+/g,'').trim();
  if(!rows.length||nextTitle!==null){
   if(rows.length&&rows[rows.length-1].sectionIndex===activeSection)activeSection++;
   titles[activeSection]=nextTitle??'Section '+sectionLetter(activeSection);
   nextTitle=null;
  }
  rows.push({sourceLine,sectionIndex:activeSection,normalized,lyrics,chords:chosen,
    barHints:(normalized.match(/\|\|/g)??[]).length+(normalized.includes('||')&&!normalized.trimEnd().endsWith('||')?1:0),text:normalized});
  sourceLines.push(normalized);
 }
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
   const bar=row.barHints>0?Math.min(measures-1,k):Math.min(measures-1,Math.floor(k*measures/row.chords.length));
   chordsPerBar[bar].push(chord);
  });
  for(let b=0;b<measures;b++)bars.push({chord:chordsPerBar[b].join(','),lyrics:b===0?row.lyrics:'',original:b===0?row.normalized:''});
  lines.push({sourceLine:row.sourceLine,sectionIndex:row.sectionIndex,start,measures,text:row.text,
   reason,estimated:!explicit&&row.barHints===0});
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
