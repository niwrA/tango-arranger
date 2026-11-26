/** CC0 sample sources; original pitch anchors, no synthetic pitch assumptions.
 * VSCO 2 CE: Sam Gossner & Simon Dalzell, editing Elan Hickler.
 * Meatbass: Drogomir Smolken, recorded by Ludwik Zamenhof.
 * The first compact bank uses one recorded dynamic and round robin per anchor.
 */
export function pizzicatoBank(inst:string){
 const name=inst.toLowerCase();
 if(name.includes('violin'))return {
  baseUrl:'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Pizz/',
  urls:Object.fromEntries(['G3','A3','C4','E4','G4','A4','C5','E5','G5','A5','E6','A6'].map(p=>[p,'LLVln_Pizz_'+p+'_f_RR1.wav']).concat([['C7','LLVln_Pizz_C7_f.wav']]))
 };
 if(name.includes('bass'))return {
  baseUrl:'https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/master/Samples/pizz/',
  urls:Object.fromEntries([['D#1','eb1'],['F#1','gb1'],['A1','a1'],['C2','c2'],['D#2','eb2'],['F#2','gb2'],['A2','a2'],['C3','c3'],['D#3','eb3'],['F#3','gb3'],['A3','a3']].map(([pitch,file])=>[pitch,file+'_vl3_rr1.wav']))
 };
 return undefined;
}
export function usesPizzicatoBank(inst:string,technique?:'arco'|'pizzicato'):boolean{
 const name=inst.toLowerCase();
 return name.includes('violin')?technique==='pizzicato':name.includes('bass')&&technique!=='arco';
}

/** Explicit note markings win; otherwise inherit the orchestration's violin style. */
export function resolveStringTechnique(inst:string,explicit:'arco'|'pizzicato'|undefined,style?:string,hasBowGesture=false):'arco'|'pizzicato'|undefined{
 if(explicit)return explicit;
 if(hasBowGesture)return 'arco';
 if(inst.toLowerCase().includes('violin')&&(style==='pizzicato'||style==='pizzicato_arpeggio'))return 'pizzicato';
 return undefined;
}
