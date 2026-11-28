<script setup lang="ts">
import {computed,ref} from 'vue';
import {PHYSICAL_LAYOUTS,type BandoneonButton} from './bandoneonLayout';
import {validateBandoneonLayout,importBandoneonLayout,exportBandoneonLayout,layoutIsUnisonoric,type PortableBandoneonLayout} from './bandoneonLayoutFormat';
const props=defineProps<{layout?:PortableBandoneonLayout}>();
const emit=defineEmits<{(event:'save',layout:PortableBandoneonLayout):void;(event:'cancel'):void}>();
const fresh=():PortableBandoneonLayout=>({schemaVersion:1,id:'custom-'+Date.now().toString(36),name:'My bandoneon',source:'',buttons:[]});
const draft=ref<PortableBandoneonLayout>(props.layout?JSON.parse(JSON.stringify(props.layout)):fresh());
const selected=ref('');
const error=ref('');
const direction=ref<'pull'|'push'>('pull');
const button=computed(()=>draft.value.buttons.find(b=>b.id===selected.value));
const hands=['left','right'] as const;
function pitchName(p:number){return (['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][p%12]??'?')+(Math.floor(p/12)-1);}
function duplicate(model:string){
 const layout=PHYSICAL_LAYOUTS.find(l=>l.model===model);if(!layout)return;
 draft.value={...fresh(),name:model+' (custom)',source:layout.source,buttons:layout.buttons.map(b=>({...b}))};selected.value='';error.value='';
}
function add(hand:BandoneonButton['hand']){
 const rows=draft.value.buttons.filter(b=>b.hand===hand);
 let x=0,y=0;while(rows.some(b=>b.x===x&&b.y===y)){x++;if(x>8){x=0;y++;}}
 const id=hand+'-'+Date.now().toString(36)+'-'+draft.value.buttons.length;
 draft.value.buttons.push({id,hand,x,y,pull:60,push:60});selected.value=id;
}
function remove(){draft.value.buttons=draft.value.buttons.filter(b=>b.id!==selected.value);selected.value='';}
function unify(){if(!window.confirm('Replace all closing pitches with their opening pitches?'))return;for(const b of draft.value.buttons)b.push=b.pull;}
async function readFile(event:Event){
 const input=event.target as HTMLInputElement,file=input.files?.[0];if(!file)return;
 try{if(file.size>256000)throw Error('Layout file too large');draft.value=importBandoneonLayout(await file.text());selected.value='';error.value='';}catch(e){error.value=String(e);}finally{input.value='';}
}
function save(){try{emit('save',validateBandoneonLayout(draft.value));error.value='';}catch(e){error.value=String(e);}}
function download(){try{
 const json=exportBandoneonLayout(draft.value),url=URL.createObjectURL(new Blob([json],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=draft.value.id+'.bandoneon.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);error.value='';
}catch(e){error.value=String(e);}}
function bounds(hand:BandoneonButton['hand']){
 const rows=draft.value.buttons.filter(b=>b.hand===hand),xs=rows.map(b=>b.x),ys=rows.map(b=>b.y);
 const minX=Math.min(0,...xs),minY=Math.min(0,...ys),maxX=Math.max(2,...xs),maxY=Math.max(2,...ys);
 return [minX-.55,minY-.55,maxX-minX+1.1,maxY-minY+1.1].join(' ');
}
</script>
<template>
 <section class="bandoneon-layout-editor">
  <h3>Bandoneon layout editor</h3>
  <div class="layout-toolbar"><button type="button" class="secondary" @click="draft=fresh();selected='';error=''">New layout</button>
   <label>Copy a preset<select value="" @change="duplicate(($event.target as HTMLSelectElement).value)"><option value="">Choose…</option><option v-for="l in PHYSICAL_LAYOUTS" :key="l.model" :value="l.model">{{l.model}} (provisional)</option></select></label>
   <label>Import JSON<input type="file" accept=".json,application/json" @change="readFile"/></label>
  </div>
  <div class="layout-fields">
   <label>Name<input v-model="draft.name"/></label><label>Layout ID<input v-model="draft.id"/></label>
   <label>Manufacturer<input v-model="draft.manufacturer"/></label><label>Source<input v-model="draft.source"/></label><label>Attribution<input v-model="draft.attribution"/></label>
  </div>
  <p>{{draft.buttons.length}} buttons · {{draft.buttons.length&&layoutIsUnisonoric(draft)?'Unisonoric':'Direction-dependent or empty'}}</p>
  <label>Displayed pitch<select v-model="direction"><option value="pull">Opening / pull</option><option value="push">Closing / push</option></select></label>
  <div class="layout-hands">
   <section v-for="hand in hands" :key="hand">
    <h4>{{hand}} hand</h4>
    <svg :viewBox="bounds(hand)" role="group" :aria-label="hand+' keyboard'">
     <g v-for="b in draft.buttons.filter(b=>b.hand===hand)" :key="b.id" tabindex="0" role="button" :aria-label="b.id+' '+pitchName(b[direction])" @click="selected=b.id" @keydown.enter.prevent="selected=b.id" @keydown.space.prevent="selected=b.id">
      <circle :cx="b.x" :cy="b.y" r=".43" :class="{chosen:selected===b.id}"/><text :x="b.x" :y="b.y+.07" text-anchor="middle">{{pitchName(b[direction])}}</text>
     </g>
    </svg>
    <button type="button" class="secondary" @click="add(hand)">Add {{hand}} button</button>
   </section>
  </div>
  <div v-if="button" class="layout-fields">
   <strong>{{button.id}}</strong><label>X<input type="number" step=".25" v-model.number="button.x"/></label><label>Y<input type="number" step=".25" v-model.number="button.y"/></label>
   <label>Pull MIDI pitch ({{pitchName(button.pull)}})<input type="number" min="0" max="127" v-model.number="button.pull"/></label>
   <label>Push MIDI pitch ({{pitchName(button.push)}})<input type="number" min="0" max="127" v-model.number="button.push"/></label>
   <button type="button" class="secondary" @click="remove">Remove button</button>
  </div>
  <p v-if="error" role="alert">{{error}}</p>
  <div class="layout-toolbar"><button type="button" class="secondary" @click="unify">Make unisonoric</button><button type="button" class="secondary" @click="download">Export JSON</button><button type="button" class="secondary" @click="emit('cancel')">Cancel</button><button type="button" class="primary" @click="save">Save layout</button></div>
 </section>
</template>
<style scoped>
.bandoneon-layout-editor{display:grid;gap:12px}.layout-toolbar,.layout-fields{display:flex;flex-wrap:wrap;gap:10px;align-items:end}.layout-fields label,.layout-toolbar label{display:grid;gap:4px;min-width:120px}.layout-hands{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.layout-hands svg{width:100%;height:220px;color:inherit}.layout-hands circle{fill:#626a76;stroke:#9aa3ae;stroke-width:.025}.layout-hands circle.chosen{fill:#2675af;stroke:#e5b860;stroke-width:.065}.layout-hands text{font-size:.22px;fill:white;pointer-events:none}.layout-hands g{cursor:pointer}.layout-hands g:focus circle{stroke:#e5b860;stroke-width:.065}
</style>
