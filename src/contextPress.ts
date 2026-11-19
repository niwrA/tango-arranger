/** Pointer/keyboard context-menu interaction shared by rhythm, phrase and expression editors.
 * We intentionally do not preventDefault on pointerdown: touch scrolling and drag
 * handles keep working. A moving pointer cancels the delayed menu. */
export function isContextMenuKey(event:Pick<KeyboardEvent,'key'|'shiftKey'>):boolean{
  return event.key==='ContextMenu'||(event.key==='F10'&&event.shiftKey);
}
export type ContextPointer=Pick<PointerEvent,'pointerType'|'isPrimary'|'button'|'pointerId'|'clientX'|'clientY'>;

export function createLongPressMenu(delayMs=550,thresholdPx=12){
  let pending:{pointerId:number;x:number;y:number;open:()=>void}|null=null;
  let timeout:ReturnType<typeof setTimeout>|null=null;
  let suppressUntil=0;
  const cancel=()=>{
    if(timeout!==null)clearTimeout(timeout);
    timeout=null;
    pending=null;
  };
  const start=(event:ContextPointer,open:()=>void)=>{
    cancel();
    if(!event.isPrimary||event.button!==0||!['touch','pen'].includes(event.pointerType))return;
    suppressUntil=0; // A new touch is never the synthetic click from the previous hold.
    pending={pointerId:event.pointerId,x:event.clientX,y:event.clientY,open};
    timeout=setTimeout(()=>{
      const current=pending;
      cancel();
      if(!current)return;
      suppressUntil=Date.now()+750;
      current.open();
    },delayMs);
  };
  const move=(event:Pick<ContextPointer,'pointerId'|'clientX'|'clientY'>)=>{
    if(pending&&event.pointerId===pending.pointerId&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>=thresholdPx)cancel();
  };
  const end=(event:Pick<ContextPointer,'pointerId'>)=>{
    if(pending&&event.pointerId===pending.pointerId)cancel();
  };
  /** Suppress the synthetic click immediately following a successful long-press,
   * without swallowing unrelated clicks long afterward. */
  const consumeClick=()=>{
    const recent=Date.now()<suppressUntil;
    suppressUntil=0;
    return recent;
  };
  return {start,move,end,cancel,consumeClick};
}
