import {ref, shallowRef, computed} from 'vue';
export type MidiEvent={kind:'on'|'off'|'pedal'|'reset';pitch:number;velocity:number;channel:number;time:number;port:string};
export const midiSupported=typeof navigator!=='undefined'&&typeof navigator.requestMIDIAccess==='function';
export const midiAccess=shallowRef<MIDIAccess>();
export const midiInputs=shallowRef<MIDIInput[]>([]);
export const midiOutputs=shallowRef<MIDIOutput[]>([]);
export const midiInputId=ref('');
export const midiOutputId=ref('');
export const midiOutputEnabled=ref(false);
export const midiStatus=ref(midiSupported?'Not enabled':'Web MIDI unavailable');
export const midiBusy=ref(false);
export const midiLog=ref<string[]>([]);
export const midiReceived=ref(0),midiSent=ref(0);
export const midiOutput=computed(()=>midiOutputs.value.find(p=>p.id===midiOutputId.value));
const listeners=new Set<(e:MidiEvent)=>void>();
export function subscribeMidi(listener:(e:MidiEvent)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
function publish(e:MidiEvent){for(const listener of listeners)listener(e);}
function reset(){publish({kind:'reset',pitch:0,velocity:0,channel:0,time:performance.now(),port:''});}
function log(direction:string,port:string,data:Uint8Array){
 midiLog.value=[new Date().toLocaleTimeString()+' '+direction+' '+port+': '+Array.from(data,b=>b.toString(16).padStart(2,'0')).join(' ').toUpperCase(),...midiLog.value].slice(0,100);
}
function receive(event:MIDIMessageEvent){
 const d=event.data;if(!d?.length)return;
 const port=event.currentTarget as MIDIInput;
 midiReceived.value++;log('IN',port.name||port.id,d);
 if(port.id!==midiInputId.value||d.length<3)return;
 const status=d[0]&240,kind=status===144&&d[2]>0?'on':status===128||status===144?'off':status===176&&d[1]===64?'pedal':null;
 if(kind)publish({kind,pitch:d[1],velocity:d[2],channel:d[0]&15,time:event.timeStamp,port:port.id});
}
function refresh(){
 const a=midiAccess.value;if(!a)return;
 const ins:MIDIInput[]=[],outs:MIDIOutput[]=[];
 a.inputs.forEach(p=>{if(p.state==='connected')ins.push(p);});
 a.outputs.forEach(p=>{if(p.state==='connected')outs.push(p);});
 for(const p of midiInputs.value)if(!ins.includes(p))p.onmidimessage=null;
 for(const p of ins)p.onmidimessage=receive;
 midiInputs.value=ins;midiOutputs.value=outs;
 if(!ins.some(p=>p.id===midiInputId.value))selectMidiInput(ins[0]?.id||'');
 if(!outs.some(p=>p.id===midiOutputId.value)){midiOutputEnabled.value=false;midiOutputId.value=outs[0]?.id||'';}
 midiStatus.value=ins.length||outs.length?'MIDI enabled':'MIDI enabled; no devices detected';
}
export function selectMidiInput(id:string){if(id!==midiInputId.value){reset();midiInputId.value=id;}}
export async function enableMidi(){
 if(!midiSupported||midiBusy.value||midiAccess.value)return;
 midiBusy.value=true;
 try{const a=await navigator.requestMIDIAccess({sysex:false});midiAccess.value=a;a.onstatechange=refresh;refresh();}
 catch(e){midiStatus.value='MIDI access failed: '+String(e);}
 finally{midiBusy.value=false;}
}
export function sendMidiNote(pitch:number,velocity:number,duration:number,delay=0){
 const p=midiOutput.value;if(!p||p.state!=='connected')return false;
 const clamp=(n:number)=>Math.max(0,Math.min(127,Math.round(n)));
 const on=new Uint8Array([144,clamp(pitch),Math.max(1,clamp(velocity))]),off=new Uint8Array([128,clamp(pitch),0]);
 try{const now=performance.now()+Math.max(0,delay)*1000;p.send(on,now);p.send(off,now+Math.max(25,duration*1000));midiSent.value+=2;log('OUT queued',p.name||p.id,on);log('OUT queued',p.name||p.id,off);return true;}
 catch(e){midiStatus.value='MIDI send failed: '+String(e);return false;}
}
export function panicMidi(){
 for(const p of midiOutputs.value){if(p.connection!=='open')continue;try{p.clear();p.send([176,64,0]);p.send([176,123,0]);p.send([176,120,0]);}catch{/* disconnected */}}
}
