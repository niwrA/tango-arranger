import {type Instrument,type Project,type Score} from './music';

/** Bulk regeneration must not remove handwritten material or split a sustained phrase.
 * Accents, pitch and other non-rhythm edits use their normal note-edit protections. */
export function verifyArrangementReshape(
 project:Project,score:Score,parts:readonly Instrument[],range:readonly [number,number],kind:'replace'|'rhythm'
){
 const [from,to]=range,beats=project.beats;
 for(const instrument of parts){
  const notes=score[instrument]??[];
  for(let bar=from;bar<=to;bar++){
   const protectedBar=project.protectedBars[`${instrument}:${bar}`];
   const first=bar*beats,last=first+beats,epsilon=1e-7;
   const attacks=notes.filter(n=>n.start>=first-epsilon&&n.start<last-epsilon);
   const label=`${instrument}, measure ${bar+1}`;
   if(kind==='rhythm'&&(protectedBar||!attacks.length))continue;
   if(kind==='replace'&&(protectedBar||attacks.some(n=>n.source==='manual'||n.source==='imported')))
    throw Error(`${label} is protected or manually edited. Choose generated measures only.`);
   if(attacks.some(n=>n.xmlTieContinuation||n.start+n.duration>last+epsilon)||
      notes.some(n=>n.start<first-epsilon&&n.start+n.duration>first+epsilon||
        n.xmlTieContinuation&&n.start>=last-epsilon&&attacks.some(previous=>
          previous.pitch===n.pitch&&(previous.xmlStaff??1)===(n.xmlStaff??1)&&(previous.xmlVoice??'1')===(n.xmlVoice??'1')&&
          Math.abs(previous.start+previous.duration-n.start)<epsilon)))
    throw Error(`${label} contains a tie or sustained note across a measure boundary. Edit the notes directly, or use Accents only.`);
  }
 }
}
