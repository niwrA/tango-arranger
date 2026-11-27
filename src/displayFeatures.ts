import {computed,onMounted,onBeforeUnmount,ref,watch,type Ref} from 'vue';

type Activity = 'arrange' | 'practice' | 'perform';
interface InstallEvent extends Event {
  prompt(): Promise<unknown>;
  userChoice: Promise<{outcome: 'accepted' | 'dismissed'}>;
}
function preference(key:string, fallback:boolean) {
  const value=ref(fallback);
  try { const stored=localStorage.getItem(key); if(stored!==null)value.value=stored==='true'; } catch { /* Optional storage. */ }
  watch(value,next=>{try {localStorage.setItem(key,String(next));} catch { /* Optional storage. */ }});
  return value;
}
export function useDisplayFeatures(activity:Readonly<Ref<Activity|null>>) {
  const keepPracticeAwake=preference('tango-display-wake-practice',true);
  const keepPerformanceAwake=preference('tango-display-wake-performance',true);
  const keepEditingAwake=preference('tango-display-wake-arrange',false);
  const wakeSupported=ref(false), wakeActive=ref(false), canInstall=ref(false);
  let mounted=false, pending=false, generation=0;
  let lock:WakeLockSentinel|null=null;
  let installEvent:InstallEvent|null=null;
  const wanted=computed(()=>activity.value==='practice'?keepPracticeAwake.value:activity.value==='perform'?keepPerformanceAwake.value:activity.value==='arrange'?keepEditingAwake.value:false);
  function eligible(){return mounted&&wakeSupported.value&&wanted.value&&document.visibilityState==='visible';}
  function release(){
    generation++;
    const previous=lock;lock=null;wakeActive.value=false;
    if(previous&&!previous.released)void previous.release().catch(()=>{});
  }
  async function reconcile(){
    if(!eligible()){release();return;}
    if(pending||(lock&&!lock.released))return;
    pending=true;
    const ticket=generation;
    try {
      const next=await navigator.wakeLock.request('screen');
      if(ticket!==generation||!eligible()||next.released){await next.release().catch(()=>{});return;}
      lock=next;wakeActive.value=true;
      next.addEventListener('release',()=>{if(lock===next){lock=null;wakeActive.value=false;}},{once:true});
    } catch { /* Unsupported, battery saver or permission denial: normal timeout remains. */ }
    finally {
      pending=false;
      // A mode/visibility change while requesting may need a fresh request.
      if(ticket!==generation&&eligible())void reconcile();
    }
  }
  function visibility(){void reconcile();}
  function pageHide(){release();}
  function pageShow(){void reconcile();}
  function beforeInstall(event:Event){
    event.preventDefault();installEvent=event as InstallEvent;canInstall.value=true;
  }
  function installed(){installEvent=null;canInstall.value=false;}
  async function installApp(){
    const event=installEvent;if(!event)return;
    installed();
    try {await event.prompt();await event.userChoice;} catch { /* Browser declined or prompt expired. */ }
  }
  watch(wanted,()=>{void reconcile();},{flush:'sync'});
  onMounted(()=>{
    mounted=true;wakeSupported.value=window.isSecureContext&&typeof navigator.wakeLock?.request==='function';
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',pageHide);window.addEventListener('pageshow',pageShow);
    window.addEventListener('beforeinstallprompt',beforeInstall);window.addEventListener('appinstalled',installed);
    void reconcile();
  });
  onBeforeUnmount(()=>{
    mounted=false;release();installed();
    document.removeEventListener('visibilitychange',visibility);
    window.removeEventListener('pagehide',pageHide);window.removeEventListener('pageshow',pageShow);
    window.removeEventListener('beforeinstallprompt',beforeInstall);window.removeEventListener('appinstalled',installed);
  });
  return {keepPracticeAwake,keepPerformanceAwake,keepEditingAwake,wakeSupported,wakeActive,canInstall,installApp};
}
