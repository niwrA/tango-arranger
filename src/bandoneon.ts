import {physicalBandoneonLayout} from './bandoneonLayout';
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
const pitches=(low:number,high:number,except:readonly number[]=[])=>
 Object.freeze(Array.from({length:high-low+1},(_,i)=>low+i).filter(p=>!except.includes(p)));

export const DEFAULT_BANDONEON_MODEL:BandoneonModelId='rheinische-142';
export const BANDONEON_MODELS:readonly BandoneonProfile[]=[
 // Bandonionfabrik, 142 Rheinische (left has B4 but no Bb4; right has B6 but no Bb6).
 // https://bandonionfabrik.de/ES/assets/142.pdf
 {id:'rheinische-142',label:'142 Rheinische (tango)',range:[36,95],left:pitches(36,71,[70]),right:pitches(57,95,[94])},
 // Klaus Gutjahr's 152-tone extension: low B1 on pull, bass to B4.
 // https://www.klausgutjahr.de/argentinisches-system.html
 {id:'rheinische-152-gutjahr',label:'152 Rheinische extended (Gutjahr)',range:[35,95],left:pitches(35,71),right:pitches(56,95,[94])},
 // Bandonionfabrik, 144 Einheits.
 // https://bandonionfabrik.de/assets/144.pdf
 {id:'einheits-144',label:'144 Einheits (German)',range:[36,93],left:pitches(36,70),right:pitches(55,93)},
 // Bandonionfabrik, 146 Peguri (unisonoric).
 // https://bandonionfabrik.de/assets/146p.pdf
 {id:'peguri-146',label:'146 Peguri (unisonoric)',range:[42,95],left:pitches(42,73),right:pitches(57,95)}
];
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
/** Preserve documented factory pitch unions until physical charts are verified. */
export function bandoneonProfileForPart(project:BandoneonSelectionContext|undefined,part:string):BandoneonPitchProfile{
 const custom=customBandoneonLayoutForPart(project,part);
 if(!custom)return bandoneonProfile(bandoneonModelForPart(project,part));
 const pitches=layoutPitchSet(custom);
 return {id:custom.id,label:custom.name,range:[pitches[0],pitches[pitches.length-1]],left:layoutPitchSet(custom,'left'),right:layoutPitchSet(custom,'right')};
}
