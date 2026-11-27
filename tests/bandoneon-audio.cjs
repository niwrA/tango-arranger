const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const {playBandoneonNote,stopBandoneonVoices,setBandoneonGain}=createDomainLoader()('src/bandoneonAudio.ts');

function mockAudio(){
 const ctx={currentTime:1,sampleRate:48000,gains:[],oscs:[],filters:[],waves:[]};
 const param=(value=0)=>({
  value,calls:[],
  setValueAtTime(value,time){this.calls.push(['set',value,time]);},
  linearRampToValueAtTime(value,time){this.calls.push(['linear',value,time]);},
  exponentialRampToValueAtTime(value,time){this.calls.push(['exponential',value,time]);},
  cancelScheduledValues(time){this.calls.push(['cancel',time]);}
 });
 const node=()=>({links:[],connect(dst){this.links.push(dst);},disconnect(){this.disconnected=true;}});
 ctx.destination=node();
 ctx.createPeriodicWave=(real,imag,options)=>{const wave={real,imag,options};ctx.waves.push(wave);return wave;};
 ctx.createGain=()=>{const gain=Object.assign(node(),{gain:param(1)});ctx.gains.push(gain);return gain;};
 ctx.createBiquadFilter=()=>{const filter=Object.assign(node(),{frequency:param(),Q:param()});ctx.filters.push(filter);return filter;};
 ctx.createOscillator=()=>{
  const osc=Object.assign(node(),{frequency:param(),starts:[],stops:[],
   setPeriodicWave(wave){this.wave=wave;},
   start(at){this.starts.push(at);},stop(at){this.stops.push(at);}
  });
  ctx.oscs.push(osc);return osc;
 };
 return ctx;
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const normal=(options={})=>({pitch:69,velocity:80,durationSeconds:.5,...options});

{
 const ctx=mockAudio(),destination=ctx.createGain();
 assert.ok(playBandoneonNote(ctx,'Bandoneon I',normal(),1.2,{referenceHz:442,destination}));
 const [a,b]=ctx.oscs;
 assert.equal(a.frequency.calls[0][1],442);
 assert.equal(b.frequency.calls[0][1],884);
 assert.notEqual(a.wave,b.wave);
 assert.equal(a.wave.imag[0],0);
 assert.equal(a.wave.real[0],0);
 assert.ok(a.wave.options.disableNormalization);
 assert.deepEqual(a.starts,[1.2]);
 assert.deepEqual(a.stops,b.stops);
 assert.ok(a.stops[0]>1.7&&a.stops[0]<1.81);
 assert.deepEqual(ctx.gains[1].links,[destination]);
 playBandoneonNote(ctx,'Bandoneon I',normal({durationSeconds:3}),3);
 assert.equal(ctx.waves.length,2);
 assert.equal(ctx.oscs.length,4);
 for(const i of [0,1])assert.equal(ctx.oscs[i].wave,ctx.oscs[2+i].wave);
 console.log('PASS short and long notes use the same two cached freely vibrating octave reeds');
}

{
 const left=mockAudio(),right=mockAudio();
 playBandoneonNote(left,'Bandoneon I',normal({pitch:60,velocity:64}),2,{hand:'left'});
 playBandoneonNote(right,'Bandoneon I',normal({pitch:60,velocity:64}),2,{hand:'right'});
 assert.equal(left.filters[0].type,'lowpass');
 assert.ok(left.filters[0].frequency.calls[0][1]<right.filters[0].frequency.calls[0][1]);
 assert.ok(left.gains[1].gain.value>right.gains[1].gain.value);
 assert.ok(left.gains[2].gain.value<right.gains[2].gain.value);
 console.log('PASS the same pitch can have a mellower left-hand or brighter right-hand color');
}

{
 const ctx=mockAudio();
 playBandoneonNote(ctx,'Bandoneon I',normal({velocity:39,endVelocity:110,durationSeconds:2,slideTo:72}),1.5);
 const envelope=ctx.gains[3].gain.calls;
 assert.equal(envelope[0][1],0);
 assert.ok(envelope[3][1]>envelope[2][1]);
 const filter=ctx.filters[0].frequency.calls;
 assert.ok(filter[1][1]>filter[0][1]);
 const [a,b]=ctx.oscs.map(o=>o.frequency.calls);
 assert.equal(a.length,3);
 assert.equal(a.at(-1)[0],'exponential');
 close(a.at(-1)[1]*2,b.at(-1)[1]);
 assert.equal(a.at(-1)[2],3.5);
 assert.equal(a.at(-1)[2],b.at(-1)[2]);
 console.log('PASS pressure swells add loudness and brightness; pitch contours preserve the octave');
}

{
 const ctx=mockAudio();
 const act=playBandoneonNote(ctx,'Bandoneon I',normal(),1.1,{held:true,gainDb:-6});
 playBandoneonNote(ctx,'Bandoneon II',normal(),5,{held:true});
 assert.deepEqual(ctx.oscs.map(o=>o.stops.length),[0,0,0,0]);
 const firstOutput=ctx.gains[0];
 assert.ok(firstOutput.gain.value>.5&&firstOutput.gain.value<.51);
 ctx.currentTime=1.3;
 setBandoneonGain(ctx,'Bandoneon I',0);
 assert.equal(firstOutput.gain.calls.at(-1)[1],1);
 assert.deepEqual(ctx.gains[4].gain.calls,[]);
 act.release();
 assert.ok(ctx.oscs[0].stops[0]>1.35&&ctx.oscs[0].stops[0]<1.38);
 assert.equal(ctx.gains[3].gain.calls.at(-1)[1],0);
 stopBandoneonVoices(ctx,instrument=>instrument==='Bandoneon II');
 assert.ok(ctx.oscs[2].stops[0]<ctx.oscs[2].starts[0]);
 assert.deepEqual(ctx.gains[4].gain.calls.at(-1),['set',0,1.3]);
 for(const osc of ctx.oscs)osc.onended();
 for(const n of [...ctx.oscs,...ctx.gains,...ctx.filters])assert.equal(n.disconnected,true);
 setBandoneonGain(ctx,'Bandoneon I',6);
 assert.equal(firstOutput.gain.calls.at(-1)[1],1);
 console.log('PASS held notes release smoothly, part gain is isolated, and cancelling future notes cleans up');
}

{
 const ctx=mockAudio(),other=mockAudio();
 const gesture={kind:'portamento',contour:'up',points:[{pitch:60,at:0},{pitch:63,at:1}],tremolo:true};
 playBandoneonNote(ctx,'Bandoneon I',normal({pitch:60,durationSeconds:1,gesture}),2);
 playBandoneonNote(other,'Bandoneon I',normal(),3,{held:true});
 const pressure=ctx.gains.at(-1).gain.calls;
 assert.ok(pressure.some(p=>p[1]===.67));
 assert.equal(ctx.oscs.length,2);
 stopBandoneonVoices(ctx);
 assert.deepEqual(other.oscs.map(o=>o.stops.length),[0,0]);
 stopBandoneonVoices(other);
 assert.ok(other.oscs.every(o=>o.stops[0]<o.starts[0]));
 assert.equal(playBandoneonNote(ctx,'Bandoneon I',normal({pitch:NaN}),3),undefined);
 assert.equal(playBandoneonNote(ctx,'Bandoneon I',normal({durationSeconds:-1}),3),undefined);
 console.log('PASS bellows shake changes pressure instead of reed tuning and stop respects audio contexts');
}
