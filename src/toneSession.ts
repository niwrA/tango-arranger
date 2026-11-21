/**
 * Browsers require AudioContext creation/resume during a user activation.
 * Do not eagerly import Tone.js: it may create its own suspended context on page load.
 * We create/resume a native context synchronously, then load Tone.js and adopt it.
 */
type ToneModule=typeof import('tone');
let nativeContext:AudioContext|undefined;
let modulePromise:Promise<ToneModule>|undefined;

export async function startAudioFromGesture():Promise<ToneModule>{
  // No await before the AudioContext constructor and resume(): both happen in
  // the original click/keydown event's JavaScript task.
  if(!nativeContext||nativeContext.state==='closed'){
    nativeContext=new AudioContext();
    modulePromise=undefined;
  }
  const context=nativeContext;
  const resume=context.state==='running'?Promise.resolve():context.resume();
  modulePromise??=import('tone').then(tone=>{
    tone.setContext(context);
    return tone;
  }).catch(error=>{modulePromise=undefined;throw error;});
  // Some browsers leave resume() pending after switching input devices.
  // Give the caller a visible failure instead of leaving Play indefinitely inert.
  const started=(async()=>{
    const [tone]=await Promise.all([modulePromise,resume]);
    await tone.start();
    if(tone.getContext().state!=='running'){
      throw Error('Audio is blocked. Click Play or a note again to enable sound.');
    }
    return tone;
  })();
  let timeout:ReturnType<typeof setTimeout>|undefined;
  try{
    return await Promise.race([started,new Promise<never>((_,reject)=>{
      timeout=setTimeout(()=>reject(Error('Audio startup timed out. Retry Play or Test sound.')),9000);
    })]);
  }finally{if(timeout)clearTimeout(timeout);}
}
