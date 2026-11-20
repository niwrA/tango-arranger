/** Stage lyrics are paged by complete measures. The page is fixed until the
 * measure-group boundary; only the highlight changes with the beat. There is
 * deliberately no per-beat sliding lyric array or scrolling marquee.
 */
export type PerformanceLyricNote={
 start:number;
 duration:number;
 lyric?:string;
 lyric2?:string;
};
export type PerformanceLyricToken={start:number;duration:number;text:string;active:boolean};
export type PerformanceLyricPage={
 startMeasure:number;
 endMeasure:number;
 measureSpan:number;
 tokens:PerformanceLyricToken[];
};

/** Two measures is the default. Small dense displays show one, while an
 * unusually wide, fast stage can preview three sparse measures. Density is
 * measured across the *song*, not the active beat, avoiding mid-page jumps.
 */
export function lyricMeasureSpan(
 notes:readonly PerformanceLyricNote[],measureCount:number,width:number,effectiveBpm:number
):number{
 const safeCount=Math.max(1,Math.floor(Number.isFinite(measureCount)?measureCount:1));
 const chars=notes.reduce((sum,n)=>sum+(n.lyric||n.lyric2||'').length+1,0);
 const density=chars/safeCount;
 const viewport=Number.isFinite(width)?width:800;
 const speed=Number.isFinite(effectiveBpm)?effectiveBpm:120;
 if(viewport<520&&density>23)return 1;
 if(viewport>=1000&&speed>=145&&density<22)return Math.min(3,safeCount);
 return Math.min(2,safeCount);
}
export function performanceLyricPage(
 notes:readonly PerformanceLyricNote[],
 beat:number,
 beatsPerMeasure:number,
 measureCount:number,
 width=800,
 effectiveBpm=120
):PerformanceLyricPage{
 if(!Number.isFinite(beatsPerMeasure)||beatsPerMeasure<=0||!Number.isFinite(beat))
   throw Error('Invalid lyric timeline');
 const count=Math.max(1,Math.floor(measureCount));
 const measure=Math.max(0,Math.min(count-1,Math.floor(beat/beatsPerMeasure)));
 const span=lyricMeasureSpan(notes,count,width,effectiveBpm);
 const startMeasure=Math.floor(measure/span)*span;
 const endMeasure=Math.min(count,startMeasure+span);
 const from=startMeasure*beatsPerMeasure,to=endMeasure*beatsPerMeasure;
 const tokens=notes
  .filter(n=>Boolean(n.lyric||n.lyric2)&&n.start<to&&
   (n.start>=from||(n.start<from&&n.start+Math.max(0,n.duration)>from)))
  .slice().sort((a,b)=>a.start-b.start)
  .map(n=>({start:n.start,duration:n.duration,text:n.lyric||n.lyric2||'',
    active:beat>=n.start-0.0001&&beat<n.start+Math.max(0.001,n.duration)-0.0001}));
 return {startMeasure,endMeasure,measureSpan:span,tokens};
}
