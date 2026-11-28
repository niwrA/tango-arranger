import type {BandoneonHand,BandoneonModelId} from './bandoneon';
export type BellowsDirection='pull'|'push';
export type BandoneonButton={id:string;hand:BandoneonHand;x:number;y:number;pull:number;push:number};
export type PhysicalBandoneonLayout={model:BandoneonModelId|string;source:string;buttons:readonly BandoneonButton[]};
type Row=readonly (readonly [string,string,string])[];
// German Helmholtz notation: C=C2, c=C3, c1=C4, h=B natural.
function midi(s:string):number{
 const m=/^([A-Ha-h])(is)?([1-3])?$/.exec(s);
 if(!m)throw Error('Invalid chart pitch '+s);
 const pc:Record<string,number>={c:0,d:2,e:4,f:5,g:7,a:9,h:11};
 return (m[1]===m[1].toUpperCase()?36:48)+Number(m[3]??0)*12+pc[m[1].toLowerCase()]+(m[2]?1:0);
}
function rows(hand:BandoneonHand,data:readonly Row[],offsets:readonly number[]):BandoneonButton[]{
 return data.flatMap((row,y)=>row.map(([id,pull,push],x)=>({id:hand+':'+id,hand,x:x+offsets[y],y,pull:midi(pull),push:midi(push)})));
}
// Transcribed from manufacturer chart, Zug above Druck; positions in chart orientation.
const right=rows('right',[
 [['15','h3','a3'],['16','gis3','gis3'],['17','g3','fis3'],['18','f3','f3']],
 [['4/4','cis1','c1'],['0/0','a3','g3'],['1/1','fis3','ais2'],['2/2','e3','c3'],['3/3','dis3','dis3']],
 [['star','c1','d1'],['cross','d1','cis1'],['0/1','g1','gis1'],['1/2','ais2','ais1'],['2/3','c3','c2'],['3/4','d3','d3']],
 [['6/0','h','h'],['+','e1','fis1'],['0','cis2','fis2'],['1','fis1','g1'],['2','a1','h1'],['3','c2','d2'],['4','e2','g2']],
 [['8/0','a','a'],['4/0','f1','f1'],['2/0','ais1','e1'],['5','gis1','a1'],['6','h1','cis2'],['7','d2','e2'],['8','gis2','a2'],['9','h2','cis3']],
 [['7/0','ais','ais'],['5/0','dis1','dis1'],['3/0','f2','f2'],['10','dis2','e2'],['11','fis2','gis2'],['12','a2','h2'],['13','cis3','e3'],['14','g2','dis2']]
],[2,1.5,1,.5,0,.5]);
const left=rows('left',[
 [['2/2','Gis','Gis'],['3/3','Ais','Ais'],['4/4','cis','dis'],['cross','f','dis1'],['0/0','gis1','g1']],
 [['1/1','E','D'],['1/2','A','d'],['2/3','g','ais'],['3/4','dis','c1'],['4/0','f1','cis'],['+','ais','c'],['6/0','F','Fis']],
 [['1','d','G'],['2','a','g'],['3','c1','h'],['4','e1','d1'],['0','c','f1'],['2/0','G','fis']],
 [['5','e','A'],['6','gis','e'],['7','h','a'],['8','d1','cis1'],['9','fis1','e1'],['3/0','cis1','gis'],['16','Fis','H']],
 [['5/0','D','E'],['10','H','e'],['11','g1','fis1'],['12','a1','gis1'],['13','dis1','h1'],['14','fis','f'],['15','Dis','Cis'],['star','C','F']]
],[2, .5,1,.5,0]);
export const PHYSICAL_LAYOUTS:readonly PhysicalBandoneonLayout[]=[{model:'rheinische-142',source:'https://bandonionfabrik.de/assets/grifftabellen-bc-142-rheinische-tonlage.pdf',buttons:[...left,...right]}];
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
