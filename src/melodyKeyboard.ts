/** Live melody input keyboard range, expressed as inclusive MIDI pitches. */
export interface KeyboardRange {start:number;end:number}
export type KeyboardBoundary='start'|'end';
function clamp(n:number,min:number,max:number):number{
  if(!Number.isFinite(n))return min;
  return Math.max(min,Math.min(max,Math.round(n)));
}
function validLimits(limits:readonly [number,number]):KeyboardRange{
  const start=clamp(limits[0],0,127);
  const end=clamp(limits[1],start,127);
  return {start,end};
}
/** All playable semitones in the instrument register, for both dropdowns. */
export function keyboardPitchOptions(limits:readonly [number,number]):number[]{
  const {start,end}=validLimits(limits);
  return Array.from({length:end-start+1},(_,i)=>start+i);
}
/** Initial C-to-B octave, trimmed to the actual instrument range. */
export function defaultKeyboardRange(pitch:number,limits:readonly [number,number]):KeyboardRange{
  const bounds=validLimits(limits);
  const chosen=clamp(pitch,bounds.start,bounds.end);
  const octaveStart=Math.floor(chosen/12)*12;
  return {start:Math.max(bounds.start,octaveStart),end:Math.min(bounds.end,octaveStart+11)};
}
/** Changing either bound keeps the edited bound and moves the other if necessary. */
export function changeKeyboardBoundary(boundary:KeyboardBoundary,start:number,end:number,limits:readonly [number,number]):KeyboardRange{
  const bounds=validLimits(limits);
  const a=clamp(start,bounds.start,bounds.end);
  const b=clamp(end,bounds.start,bounds.end);
  return boundary==='start'?{start:a,end:Math.max(a,b)}:{start:Math.min(a,b),end:b};
}
export function keyboardPitches(start:number,end:number,limits:readonly [number,number]):number[]{
  const bounds=validLimits(limits);
  const first=clamp(start,bounds.start,bounds.end);
  const last=clamp(end,first,bounds.end);
  return Array.from({length:last-first+1},(_,i)=>first+i);
}
export function clampKeyboardPitch(pitch:number,range:KeyboardRange):number{
  return clamp(pitch,range.start,range.end);
}
