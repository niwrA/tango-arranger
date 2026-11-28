import type {BandoneonButton,PhysicalBandoneonLayout} from './bandoneonLayout';
export type PortableBandoneonLayout={schemaVersion:1;id:string;name:string;manufacturer?:string;source:string;attribution?:string;buttons:BandoneonButton[]};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const str=(v:unknown,max:number,required=false):string=>{
 if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error('Invalid text field');
 return v.trim();
};
export function validateBandoneonLayout(value:unknown):PortableBandoneonLayout{
 if(!record(value)||value.schemaVersion!==1)throw Error('Unsupported bandoneon layout version');
 const id=str(value.id,100,true),name=str(value.name,160,true);
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))throw Error('Invalid layout ID');
 if(!Array.isArray(value.buttons)||value.buttons.length<1||value.buttons.length>200)throw Error('Expected 1–200 buttons');
 const ids=new Set<string>(),positions=new Set<string>();
 const buttons=value.buttons.map((b):BandoneonButton=>{
  if(!record(b))throw Error('Invalid button');
  const id=str(b.id,100,true),hand=b.hand;
  if(ids.has(id))throw Error('Duplicate button ID: '+id);
  if(hand!=='left'&&hand!=='right')throw Error('Invalid button hand');
  const {x,y,pull,push}=b;
  if(typeof x!=='number'||typeof y!=='number'||!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>100||Math.abs(y)>100)throw Error('Invalid button coordinates');
  if(typeof pull!=='number'||typeof push!=='number'||!Number.isInteger(pull)||!Number.isInteger(push)||pull<0||pull>127||push<0||push>127)throw Error('Invalid MIDI pitch');
  const position=JSON.stringify([hand,x,y]);
  if(positions.has(position))throw Error('Duplicate button position');
  ids.add(id);positions.add(position);
  return {id,hand,x,y,pull,push};
 });
 return {schemaVersion:1,id,name,source:str(value.source??'',2000),manufacturer:value.manufacturer===undefined?undefined:str(value.manufacturer,160),attribution:value.attribution===undefined?undefined:str(value.attribution,500),buttons};
}
export function importBandoneonLayout(json:string){if(json.length>256000)throw Error('Layout file too large');return validateBandoneonLayout(JSON.parse(json));}
export function exportBandoneonLayout(layout:PortableBandoneonLayout){return JSON.stringify(validateBandoneonLayout(layout),null,2);}
export function asPhysicalLayout(layout:PortableBandoneonLayout):PhysicalBandoneonLayout{return {model:layout.id,source:layout.source,buttons:layout.buttons};}
export function layoutIsUnisonoric(layout:PortableBandoneonLayout){return layout.buttons.every(b=>b.pull===b.push);}
export function layoutPitchSet(layout:PortableBandoneonLayout,hand?:'left'|'right'){return [...new Set(layout.buttons.filter(b=>!hand||b.hand===hand).flatMap(b=>[b.pull,b.push]))].sort((a,b)=>a-b);}

/** Project-scoped definitions and selections; old projects may omit both. */
export type CustomBandoneonContext={customBandoneonLayouts?:PortableBandoneonLayout[];customBandoneonParts?:Record<string,string>};
export function customBandoneonLayoutForPart(project:CustomBandoneonContext|undefined,part:string){
 const id=project?.customBandoneonParts?.[part];
 return id===undefined?undefined:project?.customBandoneonLayouts?.find(l=>l.id===id);
}
export function validateProjectBandoneonLayouts(project:CustomBandoneonContext):void{
 const layouts=project.customBandoneonLayouts;
 if(layouts!==undefined){
  if(!Array.isArray(layouts)||layouts.length>100)throw Error('Invalid project bandoneon layouts');
  const ids=new Set<string>();
  project.customBandoneonLayouts=layouts.map(value=>{
   const layout=validateBandoneonLayout(value);
   if(ids.has(layout.id))throw Error('Duplicate project layout ID: '+layout.id);
   ids.add(layout.id);return layout;
  });
 }
 const parts=project.customBandoneonParts;
 if(parts!==undefined){
  if(!record(parts))throw Error('Invalid custom bandoneon selections');
  for(const [part,id] of Object.entries(parts)){
   if(!/^Bandoneon( [IVX]+)?$/.test(part)||typeof id!=='string'||!project.customBandoneonLayouts?.some(l=>l.id===id))throw Error('Invalid custom bandoneon selection: '+part);
  }
 }
}
