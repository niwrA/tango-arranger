/** Monophonic autocorrelation pitch detector for unprocessed PCM microphone frames. */
export function detectMonophonicPitch(samples:Float32Array,sampleRate:number,minHz=75,maxHz=1200):{midi:number;frequency:number;clarity:number}|null{
 if(samples.length<512||sampleRate<=0)return null;
 let energy=0,mean=0;
 for(const x of samples)mean+=x;
 mean/=samples.length;
 for(const x of samples)energy+=(x-mean)*(x-mean);
 const rms=Math.sqrt(energy/samples.length);
 if(rms<0.012)return null;
 const low=Math.max(2,Math.floor(sampleRate/maxHz));
 const high=Math.min(Math.floor(sampleRate/minHz),Math.floor(samples.length/2));
 if(high<=low)return null;
 // Normalized difference function, favoring the first strong periodic minimum.
 const differences=new Float64Array(high+1);
 for(let lag=1;lag<=high;lag++){
  let sum=0;
  for(let i=0;i<samples.length-lag;i++){
   const delta=samples[i]-samples[i+lag];sum+=delta*delta;
  }
  differences[lag]=sum;
 }
 let cumulative=0,best=0,bestValue=1;
 for(let lag=1;lag<=high;lag++){
  cumulative+=differences[lag];
  if(lag<low)continue;
  const normalized=differences[lag]*lag/(cumulative||1);
  if(normalized<bestValue){bestValue=normalized;best=lag;}
  if(normalized<0.12&&lag>=low){
   const next=lag<high?differences[lag+1]*(lag+1)/(cumulative+differences[lag+1]||1):1;
   if(normalized<=next){best=lag;bestValue=normalized;break;}
  }
 }
 if(!best||bestValue>0.22)return null;
 const frequency=sampleRate/best;
 const midi=69+12*Math.log2(frequency/440);
 return Number.isFinite(midi)?{midi,frequency,clarity:1-bestValue}:null;
}
