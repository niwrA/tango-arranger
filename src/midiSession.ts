import {ref,shallowRef,computed,watch} from 'vue';

export type MidiEvent={kind:'on'|'off'|'pedal'|'reset';pitch:number;velocity:number;channel:number;time:number;port:string};
export const midiSupported=typeof navigator!=='undefined'&&typeof navigator.requestMIDIAccess==='function';
export const midiAccess=shallowRef<MIDIAccess>();
export const midiInputs=shallowRef<MIDIInput[]>([]);
export const midiOutputs=shallowRef<MIDIOutput[]>([]);
function preference(key:string){try{return localStorage.getItem('tango-midi-'+key)||'';}catch{return '';}}
function savePreference(key:string,value:string){try{localStorage.setItem('tango-midi-'+key,value);}catch{/* storage unavailable */}}

let preferredInput=preference('input'),preferredOutput=preference('output');
let activeInput:MIDIInput|undefined;
let opening:Promise<void>|undefined;
export const midiInputId=ref('');
export const midiOutputId=ref('');
export const midiChannel=ref(Math.max(0,Math.min(15,Math.trunc(Number(preference('channel'))||0))));
watch(midiChannel,value=>{panicMidi();savePreference('channel',String(value));},{flush:'sync'});
export function selectMidiOutput(id:string){
 if(id===midiOutputId.value)return;
 panicMidi();midiOutputId.value=id;preferredOutput=id;savePreference('output',id);
}
export const midiOutputEnabled=ref(false);
watch(midiOutputEnabled,enabled=>{if(!enabled)panicMidi();},{flush:'sync'});
export const midiStatus=ref(midiSupported?'Not enabled':'Web MIDI unavailable');
export const midiBusy=ref(false);
export const midiLog=ref<string[]>([]);
export const midiReceived=ref(0),midiSent=ref(0);
export const midiOutput=computed(()=>midiOutputs.value.find(p=>p.id===midiOutputId.value));
const listeners=new Set<(e:MidiEvent)=>void>();
export function subscribeMidi(listener:(e:MidiEvent)=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
function publish(event:MidiEvent){
 for(const listener of listeners){
  try{listener(event);}catch(error){midiStatus.value='MIDI input processing failed: '+String(error);}
 }
}
function reset(){publish({kind:'reset',pitch:0,velocity:0,channel:0,time:performance.now(),port:''});}
const diagnosticsReaders=new Set<()=>boolean>();
/** Recording diagnostics is separate from delivering MIDI to the application. */
export function observeMidiDiagnostics(isOpen:()=>boolean){
 diagnosticsReaders.add(isOpen);
 return ()=>{diagnosticsReaders.delete(isOpen);};
}
function log(direction:'IN'|'OUT queued',port:MIDIPort,data:Uint8Array){
 let collecting=false;
 for(const isOpen of diagnosticsReaders){if(isOpen()){collecting=true;break;}}
 if(!collecting)return;
 if(direction==='IN')midiReceived.value++;else midiSent.value++;
 midiLog.value=[new Date().toLocaleTimeString()+' '+direction+' '+(port.name||port.id)+': '+Array.from(data,b=>b.toString(16).padStart(2,'0')).join(' ').toUpperCase(),...midiLog.value].slice(0,100);
}
function receive(event:MIDIMessageEvent){
 const d=event.data,port=event.currentTarget as MIDIInput;
 if(!d?.length||port!==activeInput)return;
 log('IN',port,d);
 if(d.length<3)return;
 const status=d[0]&240,kind=status===144&&d[2]>0?'on':status===128||status===144?'off':status===176&&d[1]===64?'pedal':null;
 if(kind)publish({kind,pitch:d[1],velocity:d[2],channel:d[0]&15,time:event.timeStamp,port:port.id});
}
function setInput(port:MIDIInput|undefined){
 if(port===activeInput)return;
 const previous=activeInput;
 activeInput=port;midiInputId.value=port?.id??'';
 if(previous){
  previous.onmidimessage=null;
  // Detach before closing: closing can emit another statechange.
  void previous.close().catch(()=>{});
  reset();
 }
 if(port)port.onmidimessage=receive;
}
function refresh(){
 const a=midiAccess.value;if(!a)return;
 const ins:MIDIInput[]=[],outs:MIDIOutput[]=[];
 a.inputs.forEach(p=>{if(p.state==='connected')ins.push(p);});
 a.outputs.forEach(p=>{if(p.state==='connected')outs.push(p);});
 const previousOutput=midiOutput.value;
 midiInputs.value=ins;midiOutputs.value=outs;
 setInput(ins.find(p=>p.id===midiInputId.value)??ins.find(p=>p.id===preferredInput)??ins[0]);
 if(previousOutput&&!outs.includes(previousOutput))panicPort(previousOutput);
 if(!midiOutputId.value||previousOutput&&!outs.includes(previousOutput)||!outs.some(p=>p.id===midiOutputId.value)){
  midiOutputEnabled.value=false;
  midiOutputId.value=outs.find(p=>p.id===preferredOutput)?.id??outs[0]?.id??'';
 }
 for(const port of outs){
  const channels=disconnectedChannels.get(port.id);
  if(channels){disconnectedChannels.delete(port.id);if(!resetPort(port,channels))disconnectedChannels.set(port.id,channels);}
 }
 midiStatus.value=ins.length||outs.length?'MIDI enabled':'MIDI enabled; no devices detected';
}
export function selectMidiInput(id:string){
 const port=midiInputs.value.find(p=>p.id===id);if(!port||port===activeInput)return;
 preferredInput=id;savePreference('input',id);setInput(port);
}
export function enableMidi():Promise<void>{
 if(!midiSupported||midiAccess.value)return Promise.resolve();
 if(opening)return opening;
 midiBusy.value=true;
 // Every requester waits for the same browser permission prompt.
 opening=Promise.resolve().then(()=>navigator.requestMIDIAccess({sysex:false})).then(a=>{
  midiAccess.value=a;a.onstatechange=refresh;refresh();
 }).catch(error=>{midiStatus.value='MIDI access failed: '+String(error);}).finally(()=>{midiBusy.value=false;opening=undefined;});
 return opening;
}

type ScheduledOutput=MIDIOutput&{clear?:()=>void};
type Release={start:number;end:number;count:number;timer:ReturnType<typeof setTimeout>};
type OutputState={channels:Set<number>;attacks:Set<ReturnType<typeof setTimeout>>;releases:Map<string,Release[]>};
const scheduled=new Map<MIDIOutput,OutputState>();
const disconnectedChannels=new Map<string,Set<number>>();
let outputSuspended=false;
function stateFor(port:MIDIOutput,channel:number){
 let state=scheduled.get(port);
 if(!state){state={channels:new Set(),attacks:new Set(),releases:new Map()};scheduled.set(port,state);}
 state.channels.add(channel);return state;
}
function emit(port:MIDIOutput,data:Uint8Array):void;
function emit(port:MIDIOutput,data:Uint8Array,at:number):void;
function emit(port:MIDIOutput,data:Uint8Array,at?:number){
 port.send(data,at);log('OUT queued',port,data);
}
function startAt(port:MIDIOutput,state:OutputState,data:Uint8Array,at:number){
 // Without clear(), keep future attacks cancellable in this app rather than
 // leave them in a browser queue that Stop cannot flush.
 if(typeof (port as ScheduledOutput).clear==='function'||at<=performance.now()){emit(port,data,at);return;}
 const timer=setTimeout(()=>{
  state.attacks.delete(timer);
  try{emit(port,data);}catch(error){outputFailure(port,error);}
 },Math.max(0,at-performance.now()));
 state.attacks.add(timer);
}
function holdUntil(port:MIDIOutput,state:OutputState,key:string,start:number,end:number,release:Uint8Array,startMessage:Uint8Array,pedal=false){
 const spans=state.releases.get(key)??[];
 const covered=spans.some(span=>span.start<=start&&span.end>start);
 if(!pedal||!covered)startAt(port,state,startMessage,start);
 const touching=spans.filter(span=>span.start<=end&&(pedal?span.end>=start:span.end>start));
 for(const span of touching){clearTimeout(span.timer);start=Math.min(start,span.start);end=Math.max(end,span.end);}
 const next=spans.filter(span=>!touching.includes(span));
 const count=pedal?1:1+touching.reduce((sum,span)=>sum+span.count,0);
 // Defer release until it is due so a later overlapping note or pedal span
 // can extend it. Already queued release messages cannot be selectively removed.
 const span:Release={start,end,count,timer:setTimeout(()=>{
  const remaining=(state.releases.get(key)??[]).filter(release=>release!==span);
  if(remaining.length)state.releases.set(key,remaining);else state.releases.delete(key);
  // Some receivers count independent Note Ons even for the same pitch.
  try{for(let i=0;i<count;i++)emit(port,release);}catch(error){outputFailure(port,error);}
 },Math.max(0,end-performance.now()))};
 next.push(span);state.releases.set(key,next);
}
function outputFailure(port:MIDIOutput,error:unknown){
 midiStatus.value='MIDI send failed: '+String(error);panicPort(port);
}
export function sendMidiNote(pitch:number,velocity:number,duration:number,delay=0){
 const port=midiOutput.value;
 if(outputSuspended||!port||port.state!=='connected'||!Number.isFinite(pitch)||pitch<0||pitch>127||!Number.isFinite(velocity)||!Number.isFinite(duration)||duration<=0||!Number.isFinite(delay))return false;
 const note=Math.round(pitch),channel=midiChannel.value;
 const gain=Math.max(1,Math.min(127,Math.round(velocity)));
 const at=performance.now()+Math.max(0,delay)*1000,state=stateFor(port,channel);
 try{
  holdUntil(port,state,channel+':'+note,at,at+Math.max(25,duration*1000),new Uint8Array([128|channel,note,0]),new Uint8Array([144|channel,note,gain]));
  return true;
 }catch(error){outputFailure(port,error);return false;}
}
export function sendMidiPedal(duration:number,delay=0){
 const port=midiOutput.value;
 if(outputSuspended||!port||port.state!=='connected'||!Number.isFinite(duration)||duration<=0||!Number.isFinite(delay))return;
 const channel=midiChannel.value,at=performance.now()+Math.max(0,delay)*1000,state=stateFor(port,channel);
 try{
  holdUntil(port,state,channel+':pedal',at,at+duration*1000,new Uint8Array([176|channel,64,0]),new Uint8Array([176|channel,64,127]),true);
 }catch(error){outputFailure(port,error);}
}
function resetPort(port:MIDIOutput,channels:Set<number>){
 if(port.state!=='connected')return false;
 try{
  (port as ScheduledOutput).clear?.();
  for(const channel of channels){
   port.send([176|channel,64,0]);port.send([176|channel,123,0]);port.send([176|channel,120,0]);
  }
  return true;
 }catch{return false;}
}
function panicPort(port:MIDIOutput){
 const state=scheduled.get(port);if(!state)return;
 scheduled.delete(port);
 for(const timer of state.attacks)clearTimeout(timer);
 for(const spans of state.releases.values())for(const span of spans)clearTimeout(span.timer);
 if(!resetPort(port,state.channels)){
  disconnectedChannels.set(port.id,new Set([...(disconnectedChannels.get(port.id)??[]),...state.channels]));
 }
}
export function panicMidi(){for(const port of scheduled.keys())panicPort(port);}
if(typeof window!=='undefined')window.addEventListener('pagehide',panicMidi);
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{
 outputSuspended=document.visibilityState==='hidden';
 // Release timers may be throttled in a background tab.
 if(outputSuspended)panicMidi();
});
