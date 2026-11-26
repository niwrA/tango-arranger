<script setup lang="ts">
import {computed} from 'vue';
import {stageDynamicAlpha,stageDynamicMeter} from './stageDynamics';

/** Read-only presentation inside the existing tap-to-toggle card/button.
 * No nested buttons: the entire cue surface remains one accessible action.
 */
const props=defineProps<{
 role:string;nextRole:string;articulation:string;nextArticulation:string;
 dynamics:string;nextDynamics:string;cueStatus:string;
 currentMeasure:number;nextMeasure:number|null;focus?:boolean;chord?:string;nextChord?:string;beatGlow?:string;nextChordBeat?:number|null;sameMeasureChord?:boolean
}>();
const chordRole=(role:string)=>['chords','harmony'].includes(role.toLowerCase());
const currentChordPrimary=computed(()=>chordRole(props.role));
const upcomingRole=computed(()=>props.sameMeasureChord&&currentChordPrimary.value?props.role:props.nextRole);
const nextChordPrimary=computed(()=>((props.sameMeasureChord&&currentChordPrimary.value)||props.nextMeasure!==null)&&chordRole(upcomingRole.value));
const upcomingMeasure=computed(()=>props.sameMeasureChord&&currentChordPrimary.value?props.currentMeasure:props.nextMeasure);
const upcomingLabel=computed(()=>upcomingMeasure.value===null?'END OF SCORE':props.sameMeasureChord&&currentChordPrimary.value?'NEXT · M'+props.currentMeasure+' · BEAT '+props.nextChordBeat:'NEXT · M'+props.nextMeasure);
</script>

<template>
 <span class="stage-role-timeline" :class="{'is-focus':focus}">
  <span class="stage-role-current" :style="{'--dyn-alpha':stageDynamicAlpha(dynamics),'--role-beat-glow':beatGlow??'0.13'}">
   <span class="stage-role-eyebrow"><span>NOW · M{{currentMeasure}}</span><span class="stage-role-status">{{cueStatus}}</span></span>
   <strong class="stage-role-name" :style="currentChordPrimary?{'--chord-length':Math.max(2,(chord||'—').length)}:undefined" :class="{'is-chord':currentChordPrimary}">{{currentChordPrimary?(chord||'—'):role}}</strong>
   <span v-if="currentChordPrimary" class="stage-role-secondary">{{role}}</span>
   <span class="stage-role-articulation">{{articulation||'—'}}</span>
   <span class="stage-role-dynamic">
    <span class="stage-dynamic-label">Dynamic <strong>{{dynamics}}</strong></span>
    <span class="stage-dynamic-track" aria-hidden="true"><span :style="{width:stageDynamicMeter(dynamics)}"/></span>
   </span>
  </span>
  <span class="stage-role-upcoming" :style="{'--dyn-alpha':stageDynamicAlpha(sameMeasureChord&&currentChordPrimary?dynamics:nextDynamics)}">
   <span class="stage-role-eyebrow"><span>{{upcomingLabel}}</span></span>
   <strong class="stage-role-next-name" :style="nextChordPrimary?{'--chord-length':Math.max(2,(nextChord||'—').length)}:undefined" :class="{'is-chord':nextChordPrimary}">{{upcomingMeasure===null?'—':nextChordPrimary?(nextChord||'—'):upcomingRole}}</strong>
   <span v-if="nextChordPrimary" class="stage-role-secondary">{{upcomingRole}}</span>
   <span class="stage-role-next-articulation">{{upcomingMeasure===null?'':sameMeasureChord&&currentChordPrimary?articulation:nextArticulation}}</span>
   <span class="stage-role-dynamic">
    <span class="stage-dynamic-label">Dynamic <strong>{{upcomingMeasure===null?'—':sameMeasureChord&&currentChordPrimary?dynamics:nextDynamics}}</strong></span>
    <span class="stage-dynamic-track" aria-hidden="true"><span :style="{width:upcomingMeasure===null?'0%':stageDynamicMeter(sameMeasureChord&&currentChordPrimary?dynamics:nextDynamics)}"/></span>
   </span>
  </span>
 </span>
</template>

<style scoped>
.stage-role-timeline{width:100%;flex:1 1 auto;min-height:0;display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:8px;text-align:left;color:#ebf3f8}
.stage-role-current,.stage-role-upcoming{display:flex;flex-direction:column;min-width:0;min-height:0;gap:4px;padding:10px;border:1px solid #516b7d;border-radius:11px;overflow:hidden}
.stage-role-current{background:linear-gradient(155deg,rgb(244 191 113 / var(--dyn-alpha)),transparent 78%),#243848;border-color:#b6906259}
.stage-role-upcoming{background:linear-gradient(155deg,rgb(244 191 113 / var(--dyn-alpha)),transparent 82%),#1e3240}
.stage-role-eyebrow{display:flex;justify-content:space-between;align-items:center;gap:5px;color:#b4cede;font-size:10px;letter-spacing:.055em;text-transform:uppercase;font-weight:800}
.stage-role-status{font-size:9px;color:#f5d6a9;white-space:nowrap;letter-spacing:0}
.stage-role-name{font-size:clamp(22px,2.3vw,33px);line-height:1.05;color:#ffe0a9;text-transform:capitalize;overflow-wrap:anywhere}
.stage-role-next-name{font-size:clamp(17px,1.8vw,26px);line-height:1.12;color:#e8f0f6;text-transform:capitalize;overflow-wrap:anywhere}
.stage-role-articulation,.stage-role-next-articulation{font-size:clamp(11px,1.05vw,14px);color:#d1e0e9;overflow-wrap:anywhere}
.stage-role-dynamic{display:flex;flex-direction:column;gap:5px;margin-top:auto;min-width:0}
.stage-dynamic-label{display:flex;align-items:baseline;justify-content:space-between;gap:4px;color:#bcd0dd;font-size:11px}
.stage-dynamic-label strong{color:#f5d6a1;font-size:clamp(12px,1.3vw,17px);font-weight:850;white-space:nowrap}
.stage-dynamic-track{height:6px;width:100%;display:block;overflow:hidden;background:#132633;border-radius:100px;border:1px solid #4a6575}
.stage-dynamic-track>span{display:block;height:100%;min-width:0;background:linear-gradient(90deg,#bf9b66,#ffdc9f);border-radius:100px}
.stage-role-timeline.is-focus{grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:clamp(10px,2vw,27px)}
.stage-role-timeline.is-focus .stage-role-current,.stage-role-timeline.is-focus .stage-role-upcoming{padding:clamp(16px,3vw,40px);gap:clamp(11px,2vh,26px);justify-content:center;border-radius:18px}
.stage-role-timeline.is-focus .stage-role-current{border-color:#caa36e88}
.stage-role-timeline.is-focus .stage-role-eyebrow{font-size:clamp(13px,1.4vw,20px)}
.stage-role-timeline.is-focus .stage-role-status{font-size:clamp(11px,1.1vw,16px)}
.stage-role-timeline.is-focus .stage-role-name{font-size:clamp(42px,7vw,108px);line-height:1;letter-spacing:-.025em}
.stage-role-timeline.is-focus .stage-role-next-name{font-size:clamp(30px,4.5vw,65px)}
.stage-role-timeline.is-focus .stage-role-articulation,.stage-role-timeline.is-focus .stage-role-next-articulation{font-size:clamp(17px,2.1vw,30px)}
.stage-role-timeline.is-focus .stage-role-dynamic{margin-top:auto;gap:11px}
.stage-role-timeline.is-focus .stage-dynamic-label{font-size:clamp(14px,1.5vw,22px)}
.stage-role-timeline.is-focus .stage-dynamic-label strong{font-size:clamp(20px,3vw,37px)}
.stage-role-timeline.is-focus .stage-dynamic-track{height:clamp(10px,1.4vh,19px)}
@media(max-width:850px){
 .stage-role-timeline{gap:5px}
 .stage-role-current,.stage-role-upcoming{padding:7px;gap:3px}
 .stage-role-name{font-size:clamp(17px,3vw,25px)}
 .stage-role-next-name{font-size:clamp(15px,2.5vw,21px)}
 .stage-role-timeline.is-focus{grid-template-columns:1fr 1fr}
}
@media(max-width:550px){
 .stage-role-timeline.is-focus{grid-template-columns:1fr;grid-template-rows:minmax(0,1.2fr) minmax(0,.8fr)}
 .stage-role-timeline.is-focus .stage-role-current,.stage-role-timeline.is-focus .stage-role-upcoming{padding:14px;gap:6px}
 .stage-role-timeline.is-focus .stage-role-name{font-size:clamp(36px,10vw,60px)}
 .stage-role-timeline.is-focus .stage-role-next-name{font-size:clamp(24px,7vw,40px)}
 .stage-role-timeline.is-focus .stage-role-articulation,.stage-role-timeline.is-focus .stage-role-next-articulation{font-size:16px}
}
.stage-role-name.is-chord,.stage-role-next-name.is-chord{text-transform:none;overflow-wrap:normal}
.stage-role-secondary{font-size:clamp(11px,1.2vw,16px);text-transform:capitalize;color:#cbdbe5;font-weight:650}
.stage-role-timeline.is-focus .stage-role-name.is-chord{font-size:clamp(48px,10vw,150px)}
.stage-role-timeline.is-focus .stage-role-next-name.is-chord{font-size:clamp(38px,7vw,108px)}
.stage-role-timeline.is-focus .stage-role-secondary{font-size:clamp(18px,2.1vw,30px)}
@media(max-width:550px){.stage-role-timeline.is-focus .stage-role-name.is-chord{font-size:clamp(42px,12vw,72px)}.stage-role-timeline.is-focus .stage-role-next-name.is-chord{font-size:clamp(32px,9vw,54px)}}
/* Size the main symbol against the card itself, not the device resolution. */
.stage-role-timeline.is-focus .stage-role-current,.stage-role-timeline.is-focus .stage-role-upcoming{container-type:size;justify-content:flex-start;box-sizing:border-box;gap:clamp(4px,1vh,12px);padding:clamp(10px,2vw,26px)}
.stage-role-timeline.is-focus .stage-role-name.is-chord,.stage-role-timeline.is-focus .stage-role-next-name.is-chord{flex:1 1 0;min-height:0;display:flex;align-items:center;justify-content:center;white-space:nowrap;font-size:clamp(24px,min(55cqh,calc(145cqw / var(--chord-length,3))),360px);line-height:1}
.stage-role-timeline.is-focus .stage-role-secondary{text-align:center}
.stage-role-timeline.is-focus .stage-role-articulation,.stage-role-timeline.is-focus .stage-role-next-articulation{min-height:0}
.stage-role-timeline.is-focus .stage-role-current{box-shadow:inset 0 0 0 2px rgb(247 193 111 / var(--role-beat-glow)),inset 0 0 65px rgb(244 191 113 / calc(var(--role-beat-glow) * .28));border-color:rgb(247 193 111 / calc(.25 + var(--role-beat-glow)))}
@media(prefers-reduced-motion:reduce){.stage-role-timeline.is-focus .stage-role-current{--role-beat-glow:.13!important}}
.stage-role-timeline.is-focus .stage-role-secondary{font-size:clamp(24px,7cqh,52px);font-weight:800;color:#e4edf4;line-height:1.1}
.stage-role-timeline:not(.is-focus) .stage-role-current{box-shadow:inset 0 0 0 2px rgb(247 193 111 / var(--role-beat-glow)),inset 0 0 25px rgb(244 191 113 / calc(var(--role-beat-glow)*.4))}
@media(prefers-reduced-motion:reduce){.stage-role-current{--role-beat-glow:.13!important}}
</style>
