const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');

function setup(){
 let clock=0,next=0,requests=0,permission;
 const timers=new Map(),events=new Map(),stored=new Map();
 const setTimeout=(fn,ms)=>{
  const id=++next;timers.set(id,{fn,at:clock+Math.max(0,ms)});return id;
 };
 const clearTimeout=id=>timers.delete(id);
 const tick=to=>{
  while(true){
   const job=[...timers].filter(([,job])=>job.at<=to).sort((a,b)=>a[1].at-b[1].at)[0];
   if(!job)break;
   clock=job[1].at;timers.delete(job[0]);job[1].fn();
  }
  clock=to;
 };
 const access={inputs:new Map(),outputs:new Map()};
 const navigator={requestMIDIAccess(options){
  requests++;assert.equal(options.sysex,false);
  return permission??Promise.resolve(access);
 }};
 const window={addEventListener:(type,fn)=>events.set(type,fn)};
 const storage={getItem:key=>stored.get(key),setItem:(key,value)=>stored.set(key,value)};
 const load=createDomainLoader({globals:{navigator,window,localStorage:storage,performance:{now:()=>clock},setTimeout,clearTimeout}});
 const midi=load('src/midiSession.ts');
 const input=id=>{
  const p={id,state:'connected',closed:0,onmidimessage:null,
   close(){this.closed++;return Promise.resolve(this);},
   key(data){this.onmidimessage?.({data:new Uint8Array(data),timeStamp:clock,currentTarget:this});}};
  access.inputs.set(id,p);return p;
 };
 const output=(id,withClear=true)=>{
  const p={id,state:'connected',connection:'open',sent:[],clears:0,send(data,at=clock){this.sent.push({data:Array.from(data),at});}};
  if(withClear)p.clear=function(){this.clears++;this.sent=this.sent.filter(event=>event.at<=clock);};
  access.outputs.set(id,p);return p;
 };
 return {tick,access,midi,input,output,stored,events,requests:()=>requests,holdPermission:p=>{permission=p;}};
}
const messages=port=>port.sent.map(e=>e.data);
(async()=>{
 const h=setup(),first=h.input('a'),second=h.input('b');
 const a=h.midi.enableMidi(),b=h.midi.enableMidi();
 assert.equal(a,b);
 await Promise.all([a,b]);assert.equal(h.requests(),1);
 const inbound=[];
 h.midi.subscribeMidi(event=>inbound.push(event.kind));
 assert.equal(h.midi.midiInputId.value,'a');
 first.key([0x90,60,100]);second.key([0x90,61,100]);
 h.midi.selectMidiInput('b');
 first.key([0x90,62,100]);second.key([0x90,61,0]);
 assert.deepEqual(inbound,['on','reset','off']);
 assert.equal(first.closed,1);
 assert.equal(h.stored.get('tango-midi-input'),'b');
 second.state='disconnected';h.access.onstatechange();
 assert.equal(h.midi.midiInputId.value,'a');
 assert.deepEqual(inbound,['on','reset','off','reset']);
 console.log('PASS simultaneous permission requests, one active input and reset on switch/unplug');

 const p=setup(),out=p.output('piano'),other=p.output('other');
 await p.midi.enableMidi();
 p.midi.midiChannel.value=3;
 assert.equal(p.midi.sendMidiNote(60,77,.3,.1),true);
 assert.deepEqual(out.sent[0],{data:[0x93,60,77],at:100});
 p.tick(120);
 p.midi.sendMidiNote(60,80,.5);
 p.midi.sendMidiPedal(.3);
 p.tick(200);p.midi.sendMidiPedal(.5);
 p.tick(419);
 assert.equal(messages(out).filter(x=>x[0]===0x83).length,0);
 assert.equal(messages(out).filter(x=>x[0]===0xb3&&x[1]===64&&x[2]===0).length,0);
 p.tick(620);
 assert.equal(messages(out).filter(x=>x[0]===0x83).length,2);
 assert.equal(messages(out).filter(x=>x[0]===0xb3&&x[1]===64&&x[2]===127).length,1);
 p.tick(700);assert.equal(messages(out).filter(x=>x[0]===0xb3&&x[1]===64&&x[2]===0).length,1);
 p.midi.sendMidiNote(61,80,.5,1);
 p.midi.selectMidiOutput('other');
 p.tick(1900);
 assert.equal(out.clears,1);
 assert.deepEqual(messages(out).slice(-3),[[0xb3,64,0],[0xb3,123,0],[0xb3,120,0]]);
 assert.equal(messages(out).some(x=>x[0]===0x93&&x[1]===61),false);
 assert.equal(other.sent.length,0);
 console.log('PASS overlapping notes/pedal do not release early; switch panics only owned channel/output');

 p.midi.selectMidiOutput('piano');
 p.midi.midiOutputEnabled.value=true;
 p.midi.sendMidiNote(62,80,1);
 out.state='disconnected';p.access.onstatechange();
 assert.equal(p.midi.midiOutputEnabled.value,false);
 const replacement=p.output('piano');
 p.access.onstatechange();p.tick(3100);
 assert.deepEqual(messages(replacement),[[0xb3,64,0],[0xb3,123,0],[0xb3,120,0]]);
 console.log('PASS output unplug disables routing and reconnect clears only stale session channel');

 const g=setup(),legacy=g.output('legacy',false);await g.midi.enableMidi();
 g.midi.sendMidiNote(60,64,.3,1);g.events.get('pagehide')();g.tick(1600);
 assert.ok(!messages(legacy).some(x=>x[0]===0x90||x[0]===0x80));
 console.log('PASS queued attacks stay cancellable when MIDIOutput.clear is unavailable');

 const d=setup(),keys=d.input('keys'),speaker=d.output('speaker');
 await d.midi.enableMidi();
 let delivered=0,expanded=false;
 d.midi.subscribeMidi(()=>delivered++);
 const unmount=d.midi.observeMidiDiagnostics(()=>expanded);
 function play(pitch){
  keys.key([0x90,pitch,80]);
  assert.equal(d.midi.sendMidiNote(pitch,80,.1),true);
 }
 play(60);d.tick(100);
 assert.equal(delivered,1);assert.equal(speaker.sent.length,2);
 assert.equal(d.midi.midiReceived.value,0);assert.equal(d.midi.midiSent.value,0);
 assert.deepEqual(d.midi.midiLog.value,[]);
 expanded=true;play(61);d.tick(200);
 assert.equal(d.midi.midiReceived.value,1);assert.equal(d.midi.midiSent.value,2);
 assert.equal(d.midi.midiLog.value.length,3);
 const before=d.midi.midiLog.value;
 expanded=false;play(62);d.tick(300);
 assert.equal(delivered,3);assert.equal(speaker.sent.length,6);
 assert.equal(d.midi.midiReceived.value,1);assert.equal(d.midi.midiSent.value,2);
 assert.equal(d.midi.midiLog.value,before);
 expanded=true;
 for(let i=0;i<110;i++)keys.key([0x90,63,80]);
 assert.equal(d.midi.midiReceived.value,111);
 assert.equal(d.midi.midiLog.value.length,100);
 unmount();play(64);d.tick(400);
 assert.equal(delivered,114);assert.equal(speaker.sent.length,8);
 assert.equal(d.midi.midiReceived.value,111);assert.equal(d.midi.midiSent.value,2);
 console.log('PASS closed and unmounted diagnostics freeze counters and history without blocking MIDI');

 const {capturedPedalSpans,assignCapturedPedal}=createDomainLoader()('src/midiCapture.ts');
 const pedal=[
  {beat:3,channel:0,down:true},{beat:4.5,channel:1,down:true},
  {beat:5,channel:0,down:false},{beat:10,channel:1,down:false},
 ];
 assert.deepEqual(capturedPedalSpans(pedal,4,true,true,1),[{start:0,end:4}]);
 assert.deepEqual(capturedPedalSpans(pedal,4,false,true,0),[{start:3,end:4}]);
 assert.deepEqual([...assignCapturedPedal([{start:.5,duration:.25},{start:.5,duration:.25}],[{start:0,end:1.5}])],[[0,{offset:-.5,beats:1.5}]]);
 const {pianoPedalWindows,playbackNotesInRange}=createDomainLoader()('src/arrangementPlayback.ts');
 const notes=[{pitch:60,start:0,duration:.5,gate:1,pianoPedalBeats:3},{pitch:62,start:1,duration:.5,gate:1,pianoPedalBeats:4}];
 assert.deepEqual(pianoPedalWindows(notes,2,4),[{start:2,end:4}]);
 assert.equal(playbackNotesInRange(notes,0,4,0,true)[0].duration,.5);
 assert.equal(playbackNotesInRange(notes,0,4)[0].duration,1);
 console.log('PASS pedal capture and output spans clip correctly; hardware retains dry key length');
})().catch(e=>{console.error(e);process.exitCode=1;});
