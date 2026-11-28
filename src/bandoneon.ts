import {PHYSICAL_LAYOUTS,physicalBandoneonLayout} from './bandoneonLayout';
import {asPhysicalLayout,customBandoneonLayoutForPart,layoutPitchSet,type CustomBandoneonContext} from './bandoneonLayoutFormat';
// Concert-pitch MIDI keys available with either bellows direction on the
// specific documented layouts below. This is not a fingering, chord-voicing
// or simultaneous-bellows-direction validator. Individual instruments vary.
export type BandoneonModelId='rheinische-142'|'rheinische-152-gutjahr'|'einheits-144'|'peguri-146';
export type BandoneonHand='left'|'right';
export type BandoneonProfile={
 readonly id:BandoneonModelId;
 readonly label:string;
 readonly range:readonly [number,number];
 readonly left:readonly number[];
 readonly right:readonly number[];
};
export const DEFAULT_BANDONEON_MODEL:BandoneonModelId='rheinische-142';
const factoryLabels:Record<BandoneonModelId,string>={
 'rheinische-142':'142 Rheinische (tango)',
 'rheinische-152-gutjahr':'152 Rheinische extended (Gutjahr)',
 'einheits-144':'144 Einheits (German)',
 'peguri-146':'146 Peguri (unisonoric)'
};
export const BANDONEON_MODELS:readonly BandoneonProfile[]=Object.entries(factoryLabels).map(([model,label])=>{
 const id=model as BandoneonModelId;
 const layout=PHYSICAL_LAYOUTS.find(l=>l.model===id);
 if(!layout)throw Error('Missing factory bandoneon layout '+id);
 const pitches=layoutPitchSet(layout);
 return {id,label,range:[pitches[0],pitches[pitches.length-1]],left:layoutPitchSet(layout,'left'),right:layoutPitchSet(layout,'right')};
});
export function bandoneonProfile(id?:BandoneonModelId):BandoneonProfile{
 return BANDONEON_MODELS.find(model=>model.id===id)??BANDONEON_MODELS[0];
}
export function isBandoneonModelId(id:unknown):id is BandoneonModelId{
 return BANDONEON_MODELS.some(model=>model.id===id);
}
export function bandoneonModelForPart(project:{bandoneonModels?:Record<string,BandoneonModelId>}|undefined,part:string):BandoneonModelId{
 return bandoneonProfile(project?.bandoneonModels?.[part]).id;
}
export function isBandoneonPitchPlayable(pitch:number,id?:BandoneonPitchSelection,hand?:BandoneonHand):boolean{
 const model=typeof id==='object'?id:bandoneonProfile(id);
 return hand?model[hand].includes(pitch):model.left.includes(pitch)||model.right.includes(pitch);
}
/** An unambiguous hand only; overlapping notes retain the score's staff or its display split. */
export function bandoneonHandForPitch(pitch:number,id?:BandoneonPitchSelection):BandoneonHand|undefined{
 const model=typeof id==='object'?id:bandoneonProfile(id),left=model.left.includes(pitch),right=model.right.includes(pitch);
 return left===right?undefined:left?'left':'right';
}

export type BandoneonSelectionContext=CustomBandoneonContext & {bandoneonModels?:Record<string,BandoneonModelId>};
export type BandoneonPitchProfile=Omit<BandoneonProfile,'id'> & {readonly id:string};
export type BandoneonPitchSelection=BandoneonModelId|BandoneonPitchProfile;
export function physicalBandoneonLayoutForPart(project:BandoneonSelectionContext|undefined,part:string){
 const custom=customBandoneonLayoutForPart(project,part);
 return custom?asPhysicalLayout(custom):physicalBandoneonLayout(bandoneonModelForPart(project,part));
}
/** A user-selected custom chart or a button-by-button checked factory chart. */
export function authoritativeBandoneonLayoutForPart(project:BandoneonSelectionContext|undefined,part:string){
 if(!part.startsWith('Bandoneon'))return undefined;
 const custom=customBandoneonLayoutForPart(project,part);
 if(custom)return asPhysicalLayout(custom);
 const factory=physicalBandoneonLayout(bandoneonModelForPart(project,part));
 return factory?.verified?factory:undefined;
}
/** Both factory and custom ranges are derived from their physical buttons. */
export function bandoneonProfileForPart(project:BandoneonSelectionContext|undefined,part:string):BandoneonPitchProfile{
 const custom=customBandoneonLayoutForPart(project,part);
 if(!custom)return bandoneonProfile(bandoneonModelForPart(project,part));
 const pitches=layoutPitchSet(custom);
 return {id:custom.id,label:custom.name,range:[pitches[0],pitches[pitches.length-1]],left:layoutPitchSet(custom,'left'),right:layoutPitchSet(custom,'right')};
}
