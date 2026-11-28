<script setup lang="ts">
import {computed} from 'vue';
import type {BandoneonButton,CapacityFrame,PhysicalBandoneonLayout} from './bandoneonLayout';
import {midiName} from './music';

const props=defineProps<{layout:PhysicalBandoneonLayout;frame?:CapacityFrame;active:readonly BandoneonButton[];focus:readonly BandoneonButton[];provisional?:boolean}>();
const direction=computed(()=>props.frame?.direction);
const reattacks=computed(()=>{
 const frame=props.frame;if(!frame?.rearticulated?.length)return [];
 const ids=new Set(frame.rearticulated);
 return frame.buttons.filter((button,index)=>ids.has(frame.targetIds[index])&&activeIds.value.has(button.id));
});
const activeIds=computed(()=>new Set(props.active.map(button=>button.id)));
const focusIds=computed(()=>new Set(props.focus.map(button=>button.id)));
const banks=computed(()=>(['left','right'] as const).map(hand=>{
 const buttons=props.layout.buttons.filter(button=>button.hand===hand);
 if(!buttons.length)return {hand,buttons,viewBox:'0 0 1 1'};
 const xs=buttons.map(button=>button.x),ys=buttons.map(button=>button.y);
 const width=Math.max(...xs)-Math.min(...xs)+1.2,height=Math.max(...ys)-Math.min(...ys)+1.2;
 const boxWidth=Math.max(5,width),boxHeight=Math.max(3,height);
 return {hand,buttons,viewBox:[Math.min(...xs)-.6-(boxWidth-width)/2,Math.min(...ys)-.6-(boxHeight-height)/2,boxWidth,boxHeight].join(' ')};
}));
const buttonNumber=(button:BandoneonButton)=>button.id.startsWith(button.hand+':')?button.id.slice(button.hand.length+1):button.id;
const directionLabel=computed(()=>direction.value==='pull'?'Pull · open':direction.value==='push'?'Push · close':
 props.frame?'No shared bellows assignment':props.provisional?'Provisional layout · reference only':'No note at the cursor');
function description(button:BandoneonButton){
 return `${button.hand==='left'?'Left':'Right'} ${buttonNumber(button)}: ${direction.value?midiName(button[direction.value]):'pull '+midiName(button.pull)+' / push '+midiName(button.push)}`;
}
</script>

<template>
 <section class="learn-physical-bandoneon" role="group" aria-label="Physical bandoneon keyboard">
  <header>
   <strong class="learn-bellows-direction" :data-direction="direction??'none'">{{directionLabel}}</strong>
   <small v-if="reattacks.length" class="learn-bellows-warning">Release, reverse and re-attack {{reattacks.map(description).join(" · ")}}</small>
   <small v-if="frame?.capacityExceeded" class="learn-bellows-warning">Estimated bellows travel limit exceeded</small>
  </header>
  <div class="learn-bellows-hands">
   <div v-for="bank in banks" :key="bank.hand" class="learn-bellows-bank">
    <h4>{{bank.hand==='left'?'Left hand':'Right hand'}}</h4>
    <svg v-if="bank.buttons.length" :viewBox="bank.viewBox" role="img" :aria-label="bank.hand+' keyboard'">
     <g v-for="button in bank.buttons" :key="button.id" :data-button="button.id"
       :class="{'is-assigned':activeIds.has(button.id),'is-practice-target':focusIds.has(button.id)}">
      <title>{{buttonNumber(button)}} · pull {{midiName(button.pull)}} / push {{midiName(button.push)}}</title>
      <circle :cx="button.x" :cy="button.y" r=".44"/>
      <text :x="button.x" :y="button.y" dominant-baseline="central" text-anchor="middle">{{direction?midiName(button[direction]):'·'}}</text>
     </g>
    </svg>
    <small v-else>No buttons in this layout</small>
   </div>
  </div>
  <div v-if="active.length" class="learn-bellows-assignment">
   <span v-for="button in active" :key="button.id" :class="{'is-practice-target':focusIds.has(button.id)}">{{description(button)}}</span>
  </div>
  <small v-else-if="frame&&!direction" class="learn-bellows-warning">This passage has no assignment under the current layout and bellows markings.</small>
 </section>
</template>

<style scoped>
.learn-physical-bandoneon{display:grid;gap:4px;width:100%;max-width:610px;min-width:0;color:#e5eff5}
.learn-physical-bandoneon header{display:flex;justify-content:space-between;flex-wrap:wrap;gap:3px 8px;align-items:baseline}
.learn-bellows-direction{font-size:clamp(13px,2vw,18px)}
.learn-bellows-warning{font-size:11px;color:#ffd0b2}
.learn-bellows-hands{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
.learn-bellows-bank{min-width:0;text-align:center;background:#223744;border:1px solid #587283;border-radius:7px;padding:3px}
.learn-bellows-bank h4{margin:0;font-size:11px;font-weight:700}
.learn-bellows-bank small{font-size:11px}
.learn-bellows-bank svg{width:100%;height:auto;max-height:clamp(94px,20dvh,210px);display:block}
.learn-bellows-bank circle{fill:#3b5668;stroke:#8fa9b9;stroke-width:.035}
.learn-bellows-bank text{fill:#ecf3f7;font-size:.30px;font-weight:700;pointer-events:none}
.learn-bellows-bank .is-assigned circle{fill:#36766c;stroke:#a6e4c9;stroke-width:.075}
.learn-bellows-bank .is-practice-target circle{fill:#ffd189;stroke:#fff3cb;stroke-width:.1}
.learn-bellows-bank .is-practice-target text{fill:#332403}
.learn-bellows-assignment{display:flex;justify-content:center;flex-wrap:wrap;gap:2px 4px}
.learn-bellows-assignment span{color:#d7f9e7;background:#27564f;border-radius:4px;padding:1px 4px;font-size:11px;overflow-wrap:anywhere}
.learn-bellows-assignment .is-practice-target{color:#352504;background:#ffd189}
</style>
