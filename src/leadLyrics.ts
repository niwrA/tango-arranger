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
