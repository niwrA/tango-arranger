import {blankProject,parseChordSequence,sectionLetter,type Project} from './music';
export type LeadImportSection={title:string;start:number;measures:number};
export type LeadImportBar={chord:string;lyrics:string;original:string};
export type LeadImportPreview={sections:LeadImportSection[];bars:LeadImportBar[];source:string;warnings:string[]};
const chord=/^[A-G](?:#|b)?(?:(?:maj|min|dim|aug|sus|add|m|M|ø|°)?(?:\d+)?(?:[#b]\d+)?(?:\/[A-G](?:#|b)?)?)$/;
const heading=/^\[(verse|chorus|bridge|intro|outro|pre-chorus|instrumental|solo|interlude|refrain|coda|ending|section)(?:[^\]]*)\]$/i;
function isChord(t:string){return chord.test(t);}
function addChordMarkers(chords:string,lyrics:string):string {
 const result:{at:number;chord:string}[]=[];
 const re=/\S+/g;let match:RegExpExecArray|null;
 while((match=re.exec(chords))!==null)if(isChord(match[0]))result.push({at:match.index,chord:match[0]});
 let output=lyrics;
 // Splice from right to left so column offsets remain stable.
 for(const entry of result.reverse()){
   const position=Math.min(output.length,entry.at);
   output=output.slice(0,position)+'['+entry.chord+']'+output.slice(position);
 }
 return output;
}
function chordRow(line:string):boolean {
 const parts=line.trim().split(/\s+/);
 return parts.length>0&&parts.every(isChord);
}
/** Accept ChordPro-style inline chords, chords-above-lyrics, and common
 * square-bracketed section headings. Ordinary lyric line breaks are preserved
 * in the editable source. One line becomes one provisional measure; no melody
 * pitch or duration is inferred from the text.
 */
export function previewLeadSheetImport(input:string):LeadImportPreview {
 const lines=input.replace(/\r\n?/g,'\n').split('\n');
 const bars:LeadImportBar[]=[],sections:LeadImportSection[]=[];
 const warnings:string[]=[];
 let title='Section A',sourceLines:string[]=[];
 let nextTitle:string|null=null;
 function startSection(){if(sections.length&&sections[sections.length-1].start===bars.length)return;sections.push({title:nextTitle??title,start:bars.length,measures:0});nextTitle=null;}
 for(let i=0;i<lines.length;i++){
  const raw=lines[i].replace(/\t/g,'    '),trimmed=raw.trim();
  if(!trimmed){sourceLines.push('');continue;}
  const section=trimmed.match(heading);
  if(section){nextTitle=trimmed.slice(1,-1);sourceLines.push(trimmed);continue;}
  if(/^\{(?:start_of_|end_of_|soc|eoc)/i.test(trimmed)){
   const h=trimmed.match(/^\{(?:start_of_)?(verse|chorus|bridge)(?::([^}]+))?\}/i);
   if(h)nextTitle=h[2]?.trim()||h[1];
   sourceLines.push(h?'['+(nextTitle??'Section')+']':'');continue;
  }
  let normalized=trimmed;
  if(chordRow(trimmed)&&i+1<lines.length&&lines[i+1].trim()&&!chordRow(lines[i+1].trim())&&!heading.test(lines[i+1].trim())){
    const lyrics=lines[++i];normalized=addChordMarkers(raw,lyrics); 
  }else if(chordRow(trimmed))normalized='['+trimmed.split(/\s+/).join('] [')+']';
  const extracted=normalized.match(/\[[^\]]+\]/g)??[];
  const chosen=extracted.map(c=>c.slice(1,-1)).filter(isChord);
  if(extracted.length!==chosen.length)warnings.push('Unrecognized bracket token at line '+(i+1));
  const lyrics=normalized.replace(/\[[^\]]+\]/g,'').replace(/\|\|/g,'').trim();
  startSection();
  bars.push({chord:chosen.length?chosen.join(','):'',lyrics,original:normalized});
  sourceLines.push(normalized);
 }
 if(!bars.length)throw Error('No chords or lyric lines detected');
 for(let i=0;i<sections.length;i++)sections[i].measures=(sections[i+1]?.start??bars.length)-sections[i].start;
 if(sections.length>26)throw Error('The song exceeds 26 sections');
 if(bars.length>512)throw Error('The song exceeds 512 measures');
 return {sections,bars,source:sourceLines.join('\n'),warnings};
}
/** Reassign section boundaries without changing the song's chords or lyrics. */
export function arrangeImportedSections(preview:LeadImportPreview,starts:readonly number[]):LeadImportSection[] {
 if(starts.length!==preview.sections.length||starts[0]!==0)throw Error('The first section must start at measure 1');
 if(starts.some((n,i)=>!Number.isInteger(n)||n<0||n>=preview.bars.length||(i>0&&n<=starts[i-1])))
   throw Error('Section starts must be strictly increasing and inside the song');
 return preview.sections.map((section,i)=>({...section,start:starts[i],measures:(starts[i+1]??preview.bars.length)-starts[i]}));
}
export function projectFromLeadSheet(preview:LeadImportPreview,title:string,beats:number,bpm:number,starts=preview.sections.map(s=>s.start)):Project {
 const sections=arrangeImportedSections(preview,starts);
 const p=blankProject({title,beats,bpm,sections:sections.length,measuresPerSection:sections.map(s=>s.measures)});
 p.bars=preview.bars.map((bar,i)=>{
   const section=sections.findLast(s=>s.start<=i)!;
   const tokens=bar.chord.split(',').filter(Boolean);
   // The ordinary lead editor accepts at most one chord slot per beat.
   if(tokens.length>beats)throw Error('Too many chords in measure '+(i+1));
   for(const symbol of tokens)parseChordSequence(symbol,beats);
   return {chord:bar.chord,melody:[],section:sectionLetter(sections.indexOf(section))};
 });
 p.leadLyrics={'1':{source:preview.source,useExistingMelody:false}};
 return p;
}
