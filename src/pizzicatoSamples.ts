/** CC0 sample sources; original pitch anchors, no synthetic pitch assumptions.
 * VSCO 2 CE: Sam Gossner & Simon Dalzell, editing Elan Hickler.
 * Meatbass: Drogomir Smolken, recorded by Ludwik Zamenhof.
 * Primary and optional alternate banks use verified recorded anchors.
 */
type SampleBank={baseUrl:string;urls:Record<string,string>};
export function pizzicatoBank(inst:string):SampleBank|undefined{
 const name=inst.toLowerCase();
 if(name.includes('violin'))return {
  baseUrl:'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Pizz/',
  urls:Object.fromEntries(['G3','A3','C4','E4','G4','A4','C5','E5','G5','A5','E6','A6'].map<[string,string]>(p=>[p,'LLVln_Pizz_'+p+'_f_RR1.wav']).concat([['C7','LLVln_Pizz_C7_f.wav']]))
 };
 if(name.includes('bass'))return {
  baseUrl:'https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/master/Samples/pizz/',
  urls:Object.fromEntries([['D#1','eb1'],['F#1','gb1'],['A1','a1'],['C2','c2'],['D#2','eb2'],['F#2','gb2'],['A2','a2'],['C3','c3'],['D#3','eb3'],['F#3','gb3'],['A3','a3']].map<[string,string]>(([pitch,file])=>[pitch,file+'_vl3_rr1.wav']))
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

/** Optional alternate banks retain every primary anchor; missing soft recordings
 * use the corresponding forte recording rather than an unrelated pitch.
 */
export function pizzicatoVariantBank(inst:string,variant:'alternate'|'soft'):SampleBank|undefined{
 const primary=pizzicatoBank(inst);if(!primary)return undefined;
 const violin=inst.toLowerCase().includes('violin');
 const softPitches=new Set(['G3','A3','C4','E4','G4','A4','C5','E5','G5','A5']);
 return {baseUrl:primary.baseUrl,urls:Object.fromEntries(Object.entries(primary.urls).map(([pitch,file])=>[pitch,
  violin?(variant==='alternate'?file.replace('_RR1.wav','_RR2.wav'):softPitches.has(pitch)?file.replace('_f_RR1.wav','_p_RR1.wav'):file):
  variant==='alternate'?file.replace('_rr1.wav','_rr2.wav'):file.replace('_vl3_','_vl1_')
 ]))};
}
export function pizzicatoVariant(velocity:number,attackIndex:number):'primary'|'alternate'|'soft'{
 if(velocity<0.45)return 'soft';
 return attackIndex%2===0?'primary':'alternate';
}
