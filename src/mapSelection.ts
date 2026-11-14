/** Map measure selection is 0-based internally and 1-based in the range editor. */
export interface MapMeasureRange { anchor:number; start:number; end:number }

/** A normal click creates an anchor; Shift+click extends from that anchor, in either direction. */
export function selectMapMeasure(anchor:number|null,target:number,measureCount:number,extend:boolean):MapMeasureRange {
  if(!Number.isInteger(measureCount)||measureCount<1)throw new RangeError('The song must have at least one measure');
  const clamp=(n:number)=>Math.max(0,Math.min(measureCount-1,Math.floor(Number.isFinite(n)?n:0)));
  const endpoint=clamp(target);
  const fixed=extend&&anchor!==null?clamp(anchor):endpoint;
  return {anchor:fixed,start:Math.min(fixed,endpoint)+1,end:Math.max(fixed,endpoint)+1};
}
