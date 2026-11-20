/** Editable chord/lyric source. Time is measured in quarter-note beats. */
export type LeadLyricToken={text:string;line:number;start:number;syllabic:'single'|'begin'|'middle'|'end';melisma?:boolean};
export type LeadChordAnchor={chord:string;line:number;start:number};
export type LeadLyricPlan={notes:LeadLyricToken[];chords:LeadChordAnchor[];lines:string[];end:number};
export function parseLeadLyrics(source:string,beats:number):LeadLyricPlan {
  if(!Number.isFinite(beats)||beats<=0)throw Error('Invalid beats per measure');
  const notes:LeadLyricToken[]=[],chords:LeadChordAnchor[]=[];
  const lines=source.replace(/\r\n?/g,'\n').split('\n');
  let beat=0;
  lines.forEach((line,lineNumber)=>{
    const parts=line.match(/\[[^\]]+\]|\|\||\||[^\s|\[\]]+/g)??[];
    for(const part of parts){
      if(part==='||'){beat=Math.ceil((beat+1e-8)/beats)*beats;continue;}
      if(part==='|')continue; // explicit note separator; the following syllable gets its own onset
      if(part.startsWith('[')&&part.endsWith(']')){
        const chord=part.slice(1,-1).trim();
        if(chord)chords.push({chord,line:lineNumber,start:beat});
        continue;
      }
      const fragments=part.split('-').filter(Boolean);
      fragments.forEach((fragment,i)=>{
        const melisma=fragment.endsWith('_');
        const text=fragment.replace(/_+$/,'');
        if(!text){beat++;return;}
        notes.push({text,line:lineNumber,start:beat,syllabic:fragments.length===1?'single':i===0?'begin':i===fragments.length-1?'end':'middle',...(melisma?{melisma:true}:{})});
        beat++;
      });
    }
  });
  return {notes,chords,lines,end:beat};
}
/** A readable chord-over-text export with original lyric line breaks. */
export function exportLeadLyricsTab(source:string):string {
  return source.replace(/\r\n?/g,'\n').split('\n').map(line=>{
    let lyric='',chords='';
    for(let i=0;i<line.length;){
      if(line[i]==='['){
        const end=line.indexOf(']',i+1);
        if(end>i){const chord=line.slice(i+1,end);chords=chords.padEnd(lyric.length,' ')+chord;i=end+1;continue;}
      }
      if(line.slice(i,i+2)==='||'){lyric+=' | ';i+=2;continue;}
      if(line[i]==='|'){i++;continue;}
      lyric+=line[i++];
    }
    return (chords.trim()?chords.trimEnd()+'\n':'')+lyric.trimEnd();
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
   const absolute=index>=0?(mappedStarts[index]??anchor.start):anchor.start;
   if(!Number.isFinite(absolute)||absolute<0||absolute>=beats*measureCount)throw Error('Chord marker lies beyond the song');
   const nearest=Math.round(absolute);
   const snapped=Math.max(0,Math.min(beats*measureCount-1,nearest));
   result.push({measure:Math.floor(snapped/beats),beat:snapped%beats,
     chord:anchor.chord[0].toUpperCase()+anchor.chord.slice(1),
     snapped:Math.abs(absolute-snapped)>1e-7});
 }
 return result;
}
