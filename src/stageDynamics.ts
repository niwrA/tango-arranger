/** Glanceable score-dynamics visualization, not an audio gain controller.
 * The labels and strength are derived from existing measure/section marks;
 * no additional dynamics are inferred from generated note velocities.
 */
import {DYNAMIC_VELOCITIES,type DynamicMark} from './music';
const marks=new Set<string>(Object.keys(DYNAMIC_VELOCITIES));
export function stageDynamicStrength(label:string):number {
 const ends=label.split('→').map(s=>s.trim()).filter(s=>marks.has(s));
 if(!ends.length)return 0;
 const average=ends.reduce((sum,mark)=>sum+DYNAMIC_VELOCITIES[mark as DynamicMark],0)/ends.length;
 return Math.max(0,Math.min(1,(average-38)/(122-38)));
}
/** Alpha is deliberately restrained so it cannot mask chord/note highlights. */
export function stageDynamicAlpha(label:string):string{
 if(!label||label==='—')return '0.04';
 return (0.065+stageDynamicStrength(label)*0.18).toFixed(3);
}
export function stageDynamicMeter(label:string):string {
 if(!label||label==='—')return '0%';
 return Math.round(14+stageDynamicStrength(label)*86)+'%';
}
