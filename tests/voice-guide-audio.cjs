const assert=require('node:assert/strict');
const {createDomainLoader}=require('./load-domain.cjs');
const load=createDomainLoader();
const {isVoiceGuidePart,usesModeledAudio,playVoiceGuide,stopVoiceGuide,setVoiceGuideGain}=load('src/voiceGuideAudio.ts');
const {loadPreviewBank,renderPracticePreview}=load('src/practicePreviewAudio.ts');
class Param{
 constructor(){this.value=0;this.events=[];}
 setValueAtTime(value,time){this.events.push(['set',value,time]);}
 linearRampToValueAtTime(value,time){this.events.push(['linear',value,time]);}
 exponentialRampToValueAtTime(value,time){this.events.push(['ratio',value,time]);}
 setTargetAtTime(value,time,constant){this.events.push(['target',value,time,constant]);}
 cancelScheduledValues(time){this.events.push(['cancel',time]);}
}
class Node{
 constructor(){this.gain=new Param();this.frequency=new Param();this.detune=new Param();this.Q=new Param();this.links=[];this.stops=[];}
 connect(to){this.links.push(to);return to;}
 disconnect(){this.disconnected=true;}
 start(time){this.started=time;}
 stop(time){this.stops.push(time);}
 setPeriodicWave(wave){this.wave=wave;}
}
class Context{
 constructor(){this.state='running';this.currentTime=0;this.sampleRate=48000;this.destination=new Node();this.osc=[];this.filters=[];this.gains=[];this.sources=[];this.waves=[];}
 createOscillator(){const n=new Node();this.osc.push(n);return n;}
 createGain(){const n=new Node();this.gains.push(n);return n;}
 createBiquadFilter(){const n=new Node();this.filters.push(n);return n;}
 createBufferSource(){const n=new Node();this.sources.push(n);return n;}
 createPeriodicWave(...args){const wave={args};this.waves.push(wave);return wave;}
 createBuffer(_,count){const samples=new Float32Array(count);return {getChannelData:()=>samples};}
}
const event=(pitch=60,durationSeconds=1)=>({pitch,durationSeconds,velocity:90});
const check=(name,fn)=>{fn();console.log('PASS '+name);};
check('Voice and numbered Voice parts use offline synthesis; unrelated parts are unchanged',()=>{
 assert.ok(isVoiceGuidePart('Voice')&&isVoiceGuidePart('Voice II')&&!isVoiceGuidePart('Violin I'));
 assert.ok(usesModeledAudio('Voice II')&&usesModeledAudio('Bandoneon I')&&!usesModeledAudio('Piano'));
});
check('short and sustained notes share a glottal waveform and vowel resonances',()=>{
 const c=new Context();
 playVoiceGuide(c,'Voice',event(60,.25),0);
 const first=c.osc[0];
 assert.equal(c.osc.length,1);
 const shortCenters=c.filters.slice(1,4).map(f=>f.frequency.events.at(-1)[1]);
 playVoiceGuide(c,'Voice',event(60,1.2),1);
 assert.equal(c.waves.length,1);assert.equal(first.wave,c.osc[1].wave);
 assert.deepEqual(c.filters.slice(6,9).map(f=>f.frequency.events.at(-1)[1]),shortCenters);
 assert.ok(shortCenters[0]>580&&shortCenters[1]>1100&&shortCenters[2]>2400);
 assert.ok(c.osc[2].frequency.value>=5&&c.osc[2].frequency.value<=7);
 const depth=c.gains.find(n=>n.links.includes(c.osc[1].detune)).gain.events;
 assert.equal(depth[1][1],0);assert.ok(depth[1][2]>=1.35);assert.equal(depth[2][1],12);
});
check('a gradual high-register gain trim offsets resonance without lowering the pitch',()=>{
 const c=new Context(),d=new Context();
 playVoiceGuide(c,'Voice',event(60,.5),0);
 playVoiceGuide(d,'Voice',event(81,.5),0);
 assert.ok(d.gains[1].gain.events[1][1]<c.gains[1].gain.events[1][1]*.55);
 assert.equal(d.osc[0].frequency.events[0][1],880);
});
check('swells, written pitch slides and user tuning are independent of vowel color',()=>{
 const c=new Context(),out=new Node();
 playVoiceGuide(c,'Voice',{...event(69),velocity:45,endVelocity:100,slideTo:71},0,{referenceHz:442,destination:out,vibrato:false});
 assert.equal(c.osc.length,1);assert.deepEqual(c.osc[0].frequency.events[0],['set',442,0]);
 assert.ok(c.osc[0].frequency.events.at(-1)[1]>490);
 assert.ok(c.gains[1].gain.events[3][1]>c.gains[1].gain.events[2][1]);
 assert.equal(c.gains[0].links[0],out);
});
check('gain and Stop affect only the selected Voice part; held notes release smoothly',()=>{
 const c=new Context();
 const handle=playVoiceGuide(c,'Voice I',event(),0,{held:true});
 playVoiceGuide(c,'Voice II',event(64,.3),3);
 setVoiceGuideGain(c,'Voice I',-6);
 assert.equal(c.gains[0].gain.events.at(-1)[0],'target');
 assert.ok(Math.abs(c.gains[0].gain.events.at(-1)[1]-.501)<.002);
 c.currentTime=.5;
 handle.release();
 stopVoiceGuide(c,part=>part==='Voice II');
 assert.ok(c.osc[0].stops.at(-1)>.57&&c.osc[0].stops.at(-1)<.6);
 assert.ok(c.osc[2].stops.at(-1)<1);
 for(const n of [...c.osc,...c.sources])n.onended();
 assert.ok(c.gains[0].disconnected);
});
check('Learn uses the same vowel at its reference pitch, straight unless vibrato is written',()=>{
 const c=new Context();
 renderPracticePreview(c,event(69,2),0,'Voice III',442,[],[]);
 assert.equal(c.osc.length,1);assert.equal(c.osc[0].frequency.events[0][1],442);
 const d=new Context();
 renderPracticePreview(d,{...event(69,2),vibrato:true},0,'Voice III',442,[],[]);
 assert.equal(d.osc.length,2);
});
loadPreviewBank(new Context(),'Voice III').then(bank=>{
 assert.deepEqual(bank,[]);console.log('PASS Learn does not download audio for Voice');
}).catch(error=>{console.error(error);process.exitCode=1;});
