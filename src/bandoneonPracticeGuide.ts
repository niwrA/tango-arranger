import type {BandoneonButton, CapacityFrame} from './bandoneonLayout';

/** A practice cursor sits either on a written attack or on a live transport
 * beat. Use half-open sounding intervals so a release is not shown as held. */
export function practiceBellowsFrame(frames:readonly CapacityFrame[],beat:number|null){
 if(beat===null||!Number.isFinite(beat))return undefined;
 let lo=0,hi=frames.length;
 while(lo<hi){
  const mid=(lo+hi)>>>1;
  if(frames[mid].start<=beat+1e-7)lo=mid+1;else hi=mid;
 }
 const frame=frames[lo-1];
 return frame&&beat<frame.end-(frame.reversalGap??0)-1e-7?frame:undefined;
}

/** Keep the physical full-part plan while the exercise can show one hand and
 * listen to a single target pitch. These filters never re-choose direction. */
export function practiceBellowsButtons(frame:CapacityFrame|undefined,pitch:number|null,hand?:BandoneonButton['hand'],targetHand?:BandoneonButton['hand'],targetId?:string){
 const direction=frame?.direction;
 if(!direction)return {active:[], focus:[]};
 const selected=frame.buttons.filter(button=>!hand||button.hand===hand);
 const matching=pitch===null?[]:selected.filter(button=>button[direction]===pitch&&(!targetHand||button.hand===targetHand));
 const exact=targetId?matching.filter(button=>button.id===targetId):[];
 return {active:selected,focus:exact.length?exact:matching};
}
