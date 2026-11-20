/** Stage-only names are intentionally compact. Never mutate the saved roster labels. */
export function stageInstrumentName(label:string):string{
 let short=label.trim();
 // Remove successive nested parenthesized/bracketed qualifiers, wherever they occur.
 for(let pass=0;pass<12;pass++){
  const next=short.replace(/\s*(?:\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}|<[^<>]*>)/g,'');
  if(next===short)break;
  short=next;
 }
 return short.replace(/\s+/g,' ').trim()||'Instrument';
}
