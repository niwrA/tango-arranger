/** Keyboard commands shared by the note and rhythm editors.
 * Do not steal shortcuts from text fields, native controls or browser/system modifiers.
 * Pure lookup is kept separate from Vue so it can be regression-tested without a DOM.
 */
export type EditorKind='notes'|'rhythm';
export type EditorShortcut='delete'|'previous'|'next'|'shorten'|'lengthen'|'loop'|'escape'|'pitchUp'|'pitchDown'|'accent'|'split'|'previousMeasure'|'nextMeasure';
export interface ShortcutContext{
  altKey?:boolean;ctrlKey?:boolean;metaKey?:boolean;shiftKey?:boolean;
  isComposing?:boolean;editable?:boolean;buttonFocused?:boolean;defaultPrevented?:boolean;
}
export function resolveEditorShortcut(editor:EditorKind,key:string,context:ShortcutContext={}):EditorShortcut|null{
  if(context.altKey||context.ctrlKey||context.metaKey||(context.shiftKey&&key!=='+'&&key!=='_')||context.isComposing||context.editable||context.defaultPrevented)return null;
  if(key==='Delete'||key==='Backspace')return 'delete';
  if(key==='ArrowLeft')return 'previous';
  if(key==='ArrowRight')return 'next';
  if(key==='+'||key==='='||key==='Add')return 'lengthen';
  if(key==='-'||key==='_'||key==='Subtract')return 'shorten';
  if(key==='Escape')return 'escape';
  if(key.toLowerCase()==='l')return 'loop';
  // Space should never override the browser's normal button activation.
  if((key===' '||key==='Spacebar')&&!context.buttonFocused)return 'loop';
  if(editor==='notes'){
    if(key==='ArrowUp')return 'pitchUp';
    if(key==='ArrowDown')return 'pitchDown';
    if(key==='[')return 'previousMeasure';
    if(key===']')return 'nextMeasure';
  }else{
    if(key.toLowerCase()==='a')return 'accent';
    if(key.toLowerCase()==='s')return 'split';
  }
  return null;
}
