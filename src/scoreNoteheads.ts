import type {Note} from './music';

/** OSMD carries MusicXML notehead colors through to individual SVG heads,
 * including in a chord. The preview uses dark colors as render-local keys.
 * Exported scores and project data do not carry these keys. */
export function scoreNoteheadColors(notes:readonly Note[]){
  const byNote=new Map<Note,string>();
  const byColor=new Map<string,Note>();
  const channel=(value:number)=>(value&63).toString(16).padStart(2,'0');
  for(const note of notes){
    if(byNote.has(note))continue;
    const id=byNote.size+1;
    if(id>=1<<18)break;
    const color=`#${channel(id>>12)}${channel(id>>6)}${channel(id)}`;
    byNote.set(note,color);
    byColor.set(color,note);
  }
  return {byNote,byColor};
}

export function findScoreNoteheads(container:HTMLElement,byColor:ReadonlyMap<string,Note>){
  const heads=new Map<SVGElement,Note>();
  for(const head of container.querySelectorAll<SVGElement>('.vf-notehead')){
    const fill=head.getAttribute('fill')??head.querySelector('[fill]')?.getAttribute('fill');
    const note=fill&&byColor.get(fill.toLowerCase());
    if(note)heads.set(head,note);
  }
  return heads;
}
