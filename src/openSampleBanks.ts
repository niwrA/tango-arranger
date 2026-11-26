/** CC0 1.0 sources: VSCO 2 CE (Sam Gossner et al.) and Meatbass (Karoryfer).
 * Compact single-layer banks; no looping or dynamic-layer claims.
 * https://github.com/sgossner/VSCO-2-CE/blob/master/LICENSE
 * https://github.com/sfzinstruments/karoryfer.meatbass/blob/master/LICENSE
 */
export function arcoBank(inst:string){
 const name=inst.toLowerCase();
 if(name.includes('violin'))return {
  baseUrl:'https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/Strings/Solo%20Violin/Arco%20Vib/',
  urls:Object.fromEntries(['G3','C4','E4','G4','C5','E5','G5','C6','E6','G6','C7'].map(p=>[p,'LLVln_ArcoVib_'+p+'_f.wav']))
 };
 if(name.includes('bass'))return {
  baseUrl:'https://raw.githubusercontent.com/sfzinstruments/karoryfer.meatbass/master/Samples/arco/',
  urls:Object.fromEntries([['A0','a0'],['C1','c1'],['D#1','eb1'],['F#1','gb1'],['A1','a1'],['C2','c2'],['D#2','eb2'],['F#2','gb2'],['A2','a2'],['C3','c3'],['D#3','eb3'],['F#3','gb3'],['A3','a3']].map(([p,f])=>[p,f+'_vl3_down.wav']))
 };
 return undefined;
}
/** Conservative finite-sample limit pending measured usable tails and loop support. */
export function canUseArcoSample(inst:string,duration:number):boolean{
 return Number.isFinite(duration)&&duration>0&&duration<=(inst.toLowerCase().includes('violin')?2:inst.toLowerCase().includes('bass')?1.2:0);
}
