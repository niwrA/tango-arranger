import type {BandoneonHand,BandoneonModelId} from './bandoneon';
export type BellowsDirection='pull'|'push';
export type BandoneonButton={id:string;hand:BandoneonHand;x:number;y:number;pull:number;push:number};
export type PhysicalBandoneonLayout={model:BandoneonModelId|string;source:string;verified?:boolean;buttons:readonly BandoneonButton[]};
type Row=readonly (readonly [string,string,string])[];
// German Helmholtz notation: C=C2, c=C3, c1=C4, h=B natural.
// A leading underscore records the chart's underlined contra octave.
function midi(s:string):number{
 const m=/^(_?)([ACDEFGHacdefgh])(is)?([1-3])?$/.exec(s);
 if(!m)throw Error('Invalid chart pitch '+s);
 const pc:Record<string,number>={c:0,d:2,e:4,f:5,g:7,a:9,h:11};
 return (m[2]===m[2].toUpperCase()?36:48)+Number(m[4]??0)*12+pc[m[2].toLowerCase()]+(m[3]?1:0)-(m[1]?12:0);
}
function rows(hand:BandoneonHand,data:readonly Row[],offsets:readonly (number|readonly number[])[]):BandoneonButton[]{
 return data.flatMap((row,y)=>row.map(([id,pull,push],x)=>({id:hand+':'+id,hand,x:typeof offsets[y]==='number'?x+offsets[y]:offsets[y][x],y,pull:midi(pull),push:midi(push)})));
}
// Transcribed from manufacturer chart, Zug above Druck; positions in chart orientation.
const rheinischeRight:readonly Row[]=[
 [['15','h3','a3'],['16','gis3','gis3'],['17','g3','fis3'],['18','f3','f3']],
 [['4/4','cis1','c1'],['0/0','a3','g3'],['1/1','fis3','ais2'],['2/2','e3','c3'],['3/3','dis3','dis3']],
 [['star','c1','d1'],['cross','d1','cis1'],['0/1','g1','gis1'],['1/2','ais2','ais1'],['2/3','c3','c2'],['3/4','d3','d3']],
 [['6/0','h','h'],['+','e1','fis1'],['0','cis2','fis2'],['1','fis1','g1'],['2','a1','h1'],['3','c2','d2'],['4','e2','g2']],
 [['8/0','a','a'],['4/0','f1','f1'],['2/0','ais1','e1'],['5','gis1','a1'],['6','h1','cis2'],['7','d2','e2'],['8','gis2','a2'],['9','h2','cis3']],
 [['7/0','ais','ais'],['5/0','dis1','dis1'],['3/0','f2','f2'],['10','dis2','e2'],['11','fis2','gis2'],['12','a2','h2'],['13','cis3','e3'],['14','g2','dis2']]
];
const rheinischeRightOffsets=[2,1.5,1,.5,0,.5];
const rheinischeLeft:readonly Row[]=[
 [['2/2','Gis','Gis'],['3/3','Ais','Ais'],['4/4','cis','dis'],['cross','f','dis1'],['0/0','gis1','g1']],
 [['1/1','E','D'],['1/2','A','d'],['2/3','g','ais'],['3/4','dis','c1'],['4/0','f1','cis'],['+','ais','c'],['6/0','F','Fis']],
 [['1','d','G'],['2','a','g'],['3','c1','h'],['4','e1','d1'],['0','c','f1'],['2/0','G','fis']],
 [['5','e','A'],['6','gis','e'],['7','h','a'],['8','d1','cis1'],['9','fis1','e1'],['3/0','cis1','gis'],['16','Fis','H']],
 [['5/0','D','E'],['10','H','e'],['11','g1','fis1'],['12','a1','gis1'],['13','dis1','h1'],['14','fis','f'],['15','Dis','Cis'],['star','C','F']]
];
const rheinischeLeftOffsets=[2,.5,1,.5,0];
const rheinische142=[
 ...rows('left',rheinischeLeft,rheinischeLeftOffsets),
 ...rows('right',rheinischeRight,rheinischeRightOffsets)
];

// Klaus Gutjahr's own Argentinian chart. The 71 base buttons match the
// 142 above; the five unnamed extensions retain their chart placement.
// German B/b is B-flat (the Bandonionfabrik charts instead spell it Ais/ais).
const gutjahrLeft:readonly Row[]=[
 [['ext-1','_H','Dis'],...rheinischeLeft[0]],rheinischeLeft[1],
 [...rheinischeLeft[2],['ext-2','ais1','a1']],
 [...rheinischeLeft[3],['ext-3','Cis','C']],
 [...rheinischeLeft[4],['ext-4','h1','ais1']]
];
const gutjahrRight:readonly Row[]=[
 ...rheinischeRight.slice(0,5),[['ext-1','gis','gis'],...rheinischeRight[5]]
];

// Row/column IDs have no claim to being engraved button numbers. Reshape
// the printed diagrams into schematic rows without changing adjacency.
function chartRows(data:readonly (readonly string[])[]):Row[]{
 return data.map((row,y)=>row.map((pair,x)=>{
  const [pull,push=pull]=pair.split('/');
  return [`r${y+1}c${x+1}`,pull,push] as const;
 }));
}
const einheitsLeft=rows('left',[
 [['1/4','Fis','Fis'],['0/0','ais1','fis1'],['triangle','g1','g1'],['star','gis1','gis1'],['cross','a1','a1']],
 [['5/5','C','C'],['1/1','F','Ais'],['1/2','A','d'],['2/3','g','ais'],['3/4','dis','c1'],['4/0','f1','cis'],['+','ais','c']],
 [['2/2','Dis','Dis'],['1','d','G'],['2','a','g'],['3','c1','h'],['4','e1','d1'],['0','c','f1'],['2/0','G','fis']],
 [['3/3','D','D'],['5','E','A'],['6','gis','e'],['7','h','a'],['8','d1','cis1'],['9','fis1','e1'],['3/0','cis1','gis'],['16','Ais','Gis']],
 [['4/4','Cis','Cis'],['5/0','Gis','H'],['10','H','E'],['11','f','F'],['12','e','dis'],['13','dis1','dis1'],['14','fis','f'],['15','cis','Cis']]
],[2,.5,1,.5,0]);
const einheitsRight=rows('right',[
 [['4/4','cis1','c1'],['triangle','g','g'],['1/1','fis3','ais2'],['2/2','e3','c3'],['3/3','dis3','dis3'],['0/0','a3','g3']],
 [['star','c1','d1'],['cross','d1','cis1'],['0/1','g1','gis1'],['1/2','ais2','ais1'],['2/3','c3','c2'],['3/4','d3','d3'],['15','f3','fis3']],
 rheinischeRight[3],
 rheinischeRight[4],
 [['9/0','gis','gis'],...rheinischeRight[5].slice(0,3),['10','dis2','dis2'],...rheinischeRight[5].slice(4,7),['14','g2','f3']]
],[2,1.5,1,.5,0]);

const peguriLeft=rows('left',chartRows([
 ['cis2','c2','Gis','G','Fis'],
 ['gis1','h1','ais1','a1','H','Ais','A'],
 ['f1','d1','h','gis','f','d'],
 ['g1','e1','cis1','ais','g','e','cis'],
 ['a1','fis1','dis1','c1','a','fis','dis','c']
]),[2.75,1.75,1.5,.65,0]);
const peguriRight=rows('right',chartRows([
 ['gis3','a3','ais3','h3'],
 ['a','ais','f3','fis3','g3'],
 ['h','c1','cis1','d3','dis3','e3'],
 ['d1','f1','gis1','h1','d2','f2','gis2','h2'],
 ['e1','g1','ais1','cis2','e2','g2','ais2','cis3'],
 ['dis1','fis1','a1','c2','dis2','fis2','a2','c3','dis3']
]),[5,[1.6,2.6,5.5,6.5,7.5],[1.15,2.15,3.15,5,6,7],1.15,.65,0]);

export const PHYSICAL_LAYOUTS:readonly PhysicalBandoneonLayout[]=[
 {model:'rheinische-142',verified:true,source:'https://bandonionfabrik.de/instrumente/grifftabellen/142.pdf',buttons:rheinische142},
 {model:'rheinische-152-gutjahr',verified:true,source:'https://www.klausgutjahr.de/images/Argentinisch.jpg',buttons:[
  ...rows('left',gutjahrLeft,[1,.5,1,.5,0]),
  ...rows('right',gutjahrRight,[2,1.5,1,.5,0,-.5])
 ]},
 {model:'einheits-144',verified:true,source:'https://bandonionfabrik.de/instrumente/grifftabellen/144.pdf',buttons:[...einheitsLeft,...einheitsRight]},
 {model:'peguri-146',verified:true,source:'https://bandonionfabrik.de/instrumente/grifftabellen/146p.pdf',buttons:[...peguriLeft,...peguriRight]}
];
export function physicalBandoneonLayout(model:string){return PHYSICAL_LAYOUTS.find(l=>l.model===model);}
export type ButtonTarget={pitch:number;hand?:BandoneonHand};
export function assignBandoneonButtons(layout:PhysicalBandoneonLayout,targets:readonly ButtonTarget[],direction:BellowsDirection):BandoneonButton[]|undefined{
 const candidates=targets.map((target,index)=>({index,buttons:layout.buttons.filter(b=>b[direction]===target.pitch&&(!target.hand||b.hand===target.hand))})).sort((a,b)=>a.buttons.length-b.buttons.length);
 const chosen:BandoneonButton[]=[],used=new Set<string>();
 function visit(i:number):boolean{
  if(i===candidates.length)return true;
  const entry=candidates[i];
  for(const button of entry.buttons)if(!used.has(button.id)){
   used.add(button.id);chosen[entry.index]=button;
   if(visit(i+1))return true;
   used.delete(button.id);
  }
  return false;
 }
 return visit(0)?chosen:undefined;
}
export function feasibleBellowsDirections(layout:PhysicalBandoneonLayout,targets:readonly ButtonTarget[]):BellowsDirection[]{
 return (['pull','push'] as const).filter(direction=>assignBandoneonButtons(layout,targets,direction)!==undefined);
}

export type BellowsFrame={start:number;end:number;targets:readonly ButtonTarget[]};
export type BellowsDecision={start:number;end:number;direction:BellowsDirection|null;buttons:readonly BandoneonButton[];reason?:string};
/** Global direction is shared by both hands. Prefer continuity; never disguise impossible chords. */
export function planBellows(layout:PhysicalBandoneonLayout,frames:readonly BellowsFrame[],initial:BellowsDirection='pull'):BellowsDecision[]{
 let direction=initial;
 return frames.map(frame=>{
  const same=assignBandoneonButtons(layout,frame.targets,direction);
  if(same)return {...frame,direction,buttons:same};
  const other=direction==='pull'?'push':'pull',alternative=assignBandoneonButtons(layout,frame.targets,other);
  if(alternative){direction=other;return {...frame,direction,buttons:alternative};}
  return {...frame,direction:null,buttons:[],reason:'No common direction with distinct available buttons'};
 });
}

export type TimedButtonTarget=ButtonTarget & {id:string;start:number;end:number;direction?:BellowsDirection;buttonId?:string;noReattack?:boolean};
export type SustainedBellowsDecision=BellowsDecision & {targetIds:readonly string[];rearticulated?:readonly string[];reversalGap?:number;reversalRelease?:boolean};
/** A continuous sounding group must share one direction and retain each held
 * button. Reversals are permitted only at boundaries with no continuing notes.
 * Search both directions before choosing, so a later attack can constrain an
 * earlier ambiguous attack. No finger reach or pressure claim is made. */
export function planSustainedBellows(layout:PhysicalBandoneonLayout,targets:readonly TimedButtonTarget[],initial:BellowsDirection='pull'):SustainedBellowsDecision[]{
 const epsilon=1e-7;
 const sorted=targets.filter(t=>Number.isFinite(t.start)&&Number.isFinite(t.end)&&t.end>t.start+epsilon).sort((a,b)=>a.start-b.start||a.end-b.end);
 const groups:TimedButtonTarget[][]=[];
 let end=-Infinity;
 for(const t of sorted){
  if(t.start>=end-epsilon){groups.push([]);end=t.end;}
  else end=Math.max(end,t.end);
  groups[groups.length-1].push(t);
 }
 let direction=initial;
 const result:SustainedBellowsDecision[]=[];
 for(const group of groups){
  const start=group[0].start,end=Math.max(...group.map(t=>t.end));
  // All notes sharing a physical button must have disjoint sounding intervals.
  // Bounded backtracking prevents pathological imported layouts blocking the UI.
  function solve(dir:BellowsDirection):BandoneonButton[]|undefined{
   const choices=group.map((t,i)=>({i,t,buttons:layout.buttons.filter(b=>(!t.direction||t.direction===dir)&&(!t.buttonId||t.buttonId===b.id)&&b[dir]===t.pitch&&(!t.hand||b.hand===t.hand))}));
   if(choices.some(c=>!c.buttons.length))return;
   const assigned:BandoneonButton[]=[],busy=new Map<string,number>();
   let attempts=0;
   // Chronological search, with a direct iterative fast path for typical scores.
   const cursor=Array(group.length).fill(0) as number[],previousEnd=Array(group.length).fill(-Infinity) as number[];
   let i=0;
   while(i>=0&&i<choices.length){
    if(++attempts>200000)return;
    const c=choices[i];let chosen:BandoneonButton|undefined;
    while(cursor[i]<c.buttons.length){
     const b=c.buttons[cursor[i]++];
     if((busy.get(b.id)??-Infinity)<=c.t.start+epsilon){chosen=b;break;}
    }
    if(chosen){
     previousEnd[i]=busy.get(chosen.id)??-Infinity;
     busy.set(chosen.id,c.t.end);assigned[i]=chosen;i++;
    }else{
     cursor[i]=0;i--;
     if(i>=0){busy.set(assigned[i].id,previousEnd[i]);}
    }
   }
   return i===choices.length?assigned:undefined;
  }
  const other=direction==='pull'?'push':'pull';
  let buttons=solve(direction);
  if(!buttons){buttons=solve(other);if(buttons)direction=other;}
  const edges=[...new Set(group.flatMap(t=>[t.start,t.end]))].sort((a,b)=>a-b);
  for(let i=0;i<edges.length-1;i++){
   const a=edges[i],b=edges[i+1];if(b-a<=epsilon)continue;
   const indices=group.map((t,j)=>({t,j})).filter(({t})=>t.start<b-epsilon&&t.end>a+epsilon).map(({j})=>j);
   if(!indices.length)continue;
   result.push({start:a,end:b,direction:buttons?direction:null,buttons:buttons?indices.map(j=>buttons![j]):[],targetIds:indices.map(j=>group[j].id),...(!buttons?{reason:'No uninterrupted common direction and button assignment found'}:{})});
  }
 }
 return result;
}

/** Rescue an overlapping phrase only when a playable reattack is possible.
 * A button cannot silently change pitch on reversal. Release all active
 * reeds before reversing and find a fresh, distinct fingering for both hands. */
function planBellowsReattacks(layout:PhysicalBandoneonLayout,targets:readonly TimedButtonTarget[],initial:BellowsDirection,secondsPerBeat:number):SustainedBellowsDecision[]{
 const eps=1e-7,minGap=.025/secondsPerBeat, minVoice=.04/secondsPerBeat;
 const edges=[...new Set(targets.flatMap(t=>[t.start,t.end]))].sort((a,b)=>a-b);
 const result:SustainedBellowsDecision[]=[];
 let direction=initial, previous=new Map<string,BandoneonButton>();
 for(let i=0;i+1<edges.length;i++){
  const start=edges[i],end=edges[i+1];if(end-start<=eps)continue;
  const active=targets.filter(t=>t.start<=start+eps&&t.end>start+eps);
  if(!active.length)continue;
  const continuing=active.filter(t=>previous.has(t.id));
  const prior=result.at(-1);
  let selected:BellowsDirection|null=null, buttons:BandoneonButton[]=[], rearticulated:readonly string[]|undefined;
  for(const dir of [direction,direction==='pull'?'push':'pull'] as const){
   const reversing=dir!==direction;
   // Never restart a pitch gesture. At an overlap, leave a short but
   // audible release on the previous reed and enough room for the new attack.
   if(reversing&&prior?.direction&&(prior.end-prior.start<minGap+minVoice||end-start<minVoice||continuing.some(t=>t.noReattack)))continue;
   const candidates=active.map(t=>({t,options:layout.buttons.filter(b=>
    (!t.direction||t.direction===dir)&&(!t.buttonId||t.buttonId===b.id)&&b[dir]===t.pitch&&(!t.hand||b.hand===t.hand)&&
    (reversing||!previous.has(t.id)||previous.get(t.id)?.id===b.id))}));
   if(candidates.some(c=>!c.options.length))continue;
   // Assign distinct reeds using augmenting paths, bounded by the layout size.
   const owner=new Map<string,number>(), matching:BandoneonButton[]=[];
   function match(j:number,seen:Set<string>):boolean{
    for(const b of candidates[j].options)if(!seen.has(b.id)){
     seen.add(b.id);const held=owner.get(b.id);
     if(held===undefined||match(held,seen)){owner.set(b.id,j);matching[j]=b;return true;}
    }
    return false;
   }
   if(!candidates.every((_,j)=>match(j,new Set())))continue;
   selected=dir;buttons=matching;
   if(reversing&&prior?.direction&&continuing.length){
    rearticulated=continuing.map(t=>t.id);
    prior.reversalGap=minGap;
   }
   break;
  }
  // Do not invent a partial physical plan for an unresolved overlap group.
  if(!selected)return [];
  result.push({start,end,direction:selected,buttons,targetIds:active.map(t=>t.id),...(rearticulated?{rearticulated}:{})});
  direction=selected;previous=new Map(active.map((t,j)=>[t.id,buttons[j]]));
 }
 return result;
}

/** Heuristic units: seconds of one sounding button at reference pressure
 * from fully closed to fully open. Not a calibrated air-volume measurement. */
export type BellowsCapacitySettings={capacitySeconds:number;initialExtension:number};
export const DEFAULT_BELLOWS_CAPACITY:BellowsCapacitySettings={capacitySeconds:20,initialExtension:.5};
export type CapacityFrame=SustainedBellowsDecision & {extensionStart:number;extensionEnd:number;pressure:number;capacityExceeded:boolean};
export function simulateBellowsCapacity(frames:readonly SustainedBellowsDecision[],secondsPerBeat:number,settings:BellowsCapacitySettings=DEFAULT_BELLOWS_CAPACITY,pressureForTarget:(id:string)=>number=()=>1):CapacityFrame[]{
 let extension=settings.initialExtension;
 return frames.map(frame=>{
  const demands=frame.targetIds.map(id=>Math.max(.05,Math.min(1.5,pressureForTarget(id))));
  const pressure=demands.length?demands.reduce((a,b)=>a+b,0)/demands.length:1;
  const travel=frame.direction?(frame.end-frame.start-(frame.reversalGap??0))*secondsPerBeat*demands.length*pressure/settings.capacitySeconds:0;
  const raw=extension+(frame.direction==='pull'?travel:frame.direction==='push'?-travel:0);
  const result={...frame,extensionStart:extension,extensionEnd:Math.max(0,Math.min(1,raw)),pressure,capacityExceeded:raw>1+1e-7||raw< -1e-7};
  extension=result.extensionEnd;return result;
 });
}

// Bounded beam search over independently releasable sounding groups.
// Keep the exact extension in each state; bin only for pruning equivalent paths.
export function planCapacityAwareBellows(layout:PhysicalBandoneonLayout,targets:readonly TimedButtonTarget[],secondsPerBeat:number,settings:BellowsCapacitySettings=DEFAULT_BELLOWS_CAPACITY,pressureForTarget:(id:string)=>number=()=>1):CapacityFrame[]{
 const sorted=targets.filter(t=>Number.isFinite(t.start)&&Number.isFinite(t.end)&&t.end>t.start+1e-7).sort((a,b)=>a.start-b.start||a.end-b.end);
 const groups:TimedButtonTarget[][]=[];let end=-Infinity;
 for(const t of sorted){
  if(t.start>=end-1e-7){groups.push([]);end=t.end;}else end=Math.max(end,t.end);
  groups[groups.length-1].push(t);
 }
 type State={extension:number;direction:BellowsDirection;overflow:number;reversals:number;previous?:State;frames:CapacityFrame[]};
 let states:State[]=[{extension:settings.initialExtension,direction:'pull',overflow:0,reversals:0,frames:[]}];
 const compare=(a:State,b:State)=>a.overflow-b.overflow||a.reversals-b.reversals||Math.abs(a.extension-.5)-Math.abs(b.extension-.5);
 for(const group of groups){
  const options=(['pull','push'] as const).map(dir=>planSustainedBellows(layout,group,dir));
  const feasible=options.filter(frames=>frames.every(f=>f.direction!==null));
  // An impossible group remains visible as a conflict; never fabricate a direction.
  const rescued=feasible.length?[]:(['pull','push'] as const).map(dir=>planBellowsReattacks(layout,group,dir,secondsPerBeat)).filter(frames=>frames.length);
  const candidates=feasible.length?feasible:rescued;
  const choices=candidates.length?candidates.filter((frames,i,a)=>a.findIndex(x=>x[0]?.direction===frames[0]?.direction)===i):[options[0]];
  const bins=new Map<string,State>();
  for(const previous of states)for(const choice of choices){
   const frames=simulateBellowsCapacity(choice,secondsPerBeat,{...settings,initialExtension:previous.extension},pressureForTarget);
   const direction=frames.at(-1)?.direction??previous.direction;
   const reversals=frames.reduce((count,f,i)=>count+Number(!!f.direction&&f.direction!==(i?frames[i-1].direction:previous.direction)),0);
   const overflow=frames.reduce((sum,f)=>{
    if(!f.direction)return sum;
    const travel=(f.end-f.start-(f.reversalGap??0))*secondsPerBeat*f.targetIds.length*f.pressure/settings.capacitySeconds;
    return sum+Math.max(0,travel-Math.abs(f.extensionEnd-f.extensionStart));
   },0);
   const next:State={extension:frames.at(-1)?.extensionEnd??previous.extension,direction,overflow:previous.overflow+overflow,reversals:previous.reversals+reversals,previous,frames};
   const key=direction+':'+Math.round(next.extension*100);
   const existing=bins.get(key);if(!existing||compare(next,existing)<0)bins.set(key,next);
  }
  states=[...bins.values()].sort(compare).slice(0,128);
 }
 const chunks:CapacityFrame[][]=[];
 let best:State|undefined=states.sort(compare)[0];
 while(best){chunks.push(best.frames);best=best.previous;}
 return chunks.reverse().flat();
}

/** Pressure expressed as a multiplier of the ordinary reed pressure. */
export function bellowsNotePressure(note:{bellowsPressure?:number;velocity?:number}|undefined,fallback=1):number{
 if(typeof note?.bellowsPressure==='number'&&Number.isFinite(note.bellowsPressure))return Math.max(.25,Math.min(1.5,note.bellowsPressure));
 return note?Math.max(.25,Math.min(1.25,(note.velocity??80)/80)):fallback;
}
