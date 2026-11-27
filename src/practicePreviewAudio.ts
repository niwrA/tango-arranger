import {isVoiceGuidePart,usesModeledAudio,playVoiceGuide} from './voiceGuideAudio';
import {playBandoneonNote} from './bandoneonAudio';
import {measureLoopEvents,type MeasureLoopEvent} from './measureLoop';
import {playbackNotesInRange} from './arrangementPlayback';
import {noteSoundingDuration,type Note,type Instrument,type Project} from './music';
import {pizzicatoBank,usesPizzicatoBank} from './pizzicatoSamples';
import {expectedFrequency} from './learnPitch';

export type PreviewEvent=MeasureLoopEvent&{technique?:Note['technique'];vibrato?:boolean};
export function buildPracticePreview(notes:readonly Note[],start:number,end:number,bpm:number,beats:number,transpose:number,written:boolean,inst:Instrument,project?:Project):PreviewEvent[]{
 const prepared=notes.map(n=>({...n,...(written?{gate:1}:{}),...(n.approachSlideFrom!==undefined&&!n.gesture?{gesture:{kind:'portamento' as const,contour:n.approachSlideFrom<n.pitch?'up' as const:'down' as const,points:[{at:0,pitch:n.approachSlideFrom},{at:.8,pitch:n.pitch},{at:1,pitch:n.pitch}]}}:{})}));
 return playbackNotesInRange(prepared,start,end,transpose).flatMap(n=>{
  const event=measureLoopEvents([n],Math.floor(n.start/beats),beats,bpm,transpose,project?.expressionRanges??[],inst,project,true)[0];
  if(!event)return [];
  const duration=Math.min(noteSoundingDuration(n),end-n.start)*60/bpm;
  if(duration<=0)return [];
  return [{...event,onsetSeconds:(n.start-start)*60/bpm,durationSeconds:duration,technique:n.technique,vibrato:n.vibrato}];
 });
}
type Anchor={pitch:number;buffer:AudioBuffer};
const cache=new Map<string,Promise<ArrayBuffer|null>>();
function fetchSample(url:string){
 let pending=cache.get(url);
 if(!pending){pending=fetch(url,{signal:AbortSignal.timeout(6500)}).then(r=>r.ok?r.arrayBuffer():null).catch(()=>null);cache.set(url,pending);void pending.then(b=>{if(!b)cache.delete(url);});}
 return pending;
}
function midi(name:string){const m=/^([A-G])(#?)(-?\d+)$/.exec(name);return m?12*(Number(m[3])+1)+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1]]??0)+(m[2]?1:0):60;}
export async function loadPreviewBank(ctx:AudioContext,inst:string,pizzicato=false):Promise<Anchor[]>{
 if(usesModeledAudio(inst))return [];
 const bank=pizzicato?pizzicatoBank(inst):undefined;
 if(pizzicato&&!bank)return [];
 const id=inst.toLowerCase(),name=id.includes('violin')?'violin':id.includes('bass')?'contrabass':'piano';
 const pitches=name==='violin'?['A3','C4','C5','C6']:name==='contrabass'?['C2','E2','E3'] :['C3','C4','C5','C6'];
 const urls=bank?.urls??Object.fromEntries(pitches.map(p=>[p,p+'.mp3']));
 const base=bank?.baseUrl??'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/'+name+'/';
 const result=await Promise.all(Object.entries(urls).map(async ([p,file])=>{try{const bytes=await fetchSample(base+file);return bytes?{pitch:midi(p),buffer:await ctx.decodeAudioData(bytes.slice(0))}:null;}catch{return null;}}));
 return result.filter((a):a is Anchor=>a!==null);
}
export function renderPracticePreview(ctx:AudioContext,event:PreviewEvent,at:number,inst:string,referenceHz:number,ordinary:Anchor[],pizzicato:Anchor[]){
 if(isVoiceGuidePart(inst)){playVoiceGuide(ctx,inst,event,at,{referenceHz,vibrato:event.vibrato===true});return;}
 if(inst.startsWith('Bandoneon')){
  playBandoneonNote(ctx,inst,event,at,{referenceHz,hand:event.bandoneonStaff===2?'left':event.bandoneonStaff===1?'right':undefined});
  return;
 }
 const end=at+event.durationSeconds;
 const paths=event.gesture?[event.gesture.points,...(event.gesture.partner?[event.gesture.partner]:[])]:[[{at:0,pitch:event.pitch},{at:1,pitch:event.slideTo??event.pitch}]];
 const plucked=usesPizzicatoBank(inst,event.technique),id=inst.toLowerCase(),sustain=!plucked&&!id.includes('piano');
 for(const points of paths){
  const anchor=[...(plucked?pizzicato:ordinary)].sort((a,b)=>Math.abs(a.pitch-points[0].pitch)-Math.abs(b.pitch-points[0].pitch))[0];
  const gain=ctx.createGain();gain.connect(ctx.destination);
  const level=(anchor?.buffer?.numberOfChannels?0.38:0.075)*event.velocity/127/paths.length;
  gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(level,at+Math.min(.025,event.durationSeconds*.15));
  gain.gain.linearRampToValueAtTime(level*(event.endVelocity??event.velocity)/Math.max(1,event.velocity),Math.max(at+Math.min(.025,event.durationSeconds*.15),end-Math.min(.035,event.durationSeconds*.2)));
  gain.gain.linearRampToValueAtTime(0,end);
  let source:AudioBufferSourceNode|OscillatorNode;
  let pitchParam:AudioParam,frequency:(p:number)=>number;
  if(anchor){
   const sample=ctx.createBufferSource();sample.buffer=anchor.buffer;
   if(sustain&&anchor.buffer.duration>.18){sample.loop=true;sample.loopStart=anchor.buffer.duration*.25;sample.loopEnd=anchor.buffer.duration*.8;}
   source=sample;pitchParam=sample.playbackRate;frequency=p=>expectedFrequency(p,referenceHz)/expectedFrequency(anchor.pitch,440);
  }else{
   const osc=ctx.createOscillator();osc.type=id.includes('violin')?'sawtooth':'triangle';
   source=osc;pitchParam=osc.frequency;frequency=p=>expectedFrequency(p,referenceHz);
  }
  pitchParam.setValueAtTime(frequency(points[0].pitch),at);
  for(const p of points.slice(1))pitchParam.exponentialRampToValueAtTime(frequency(p.pitch),at+p.at*event.durationSeconds);
  let vibrato:OscillatorNode|undefined,mod:GainNode|undefined;
  if(event.vibrato&&sustain){vibrato=ctx.createOscillator();mod=ctx.createGain();vibrato.frequency.value=5.5;mod.gain.value=22;vibrato.connect(mod);mod.connect(source.detune);vibrato.start(at);vibrato.stop(end);}
  let bow:GainNode|undefined;
  if(event.bowedTremolo||event.gesture?.tremolo){
   bow=ctx.createGain();source.connect(bow);bow.connect(gain);
   const period=1/Math.max(.1,event.bowedStrokeCount!==undefined?event.bowedStrokeCount/event.durationSeconds:event.bowedTremolo?.rateHz??6);
   for(let t=at;t<end;t+=period){bow.gain.setValueAtTime(.22,t);bow.gain.linearRampToValueAtTime(1,Math.min(end,t+period*.2));if(t+period*.8<end)bow.gain.linearRampToValueAtTime(.5,t+period*.8);}
  }else source.connect(gain);
  source.onended=()=>{source.disconnect();gain.disconnect();bow?.disconnect();vibrato?.disconnect();mod?.disconnect();};
  source.start(at);source.stop(end);
 }
}
