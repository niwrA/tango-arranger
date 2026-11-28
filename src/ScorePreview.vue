<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import {OpenSheetMusicDisplay,type GraphicalMeasure,type MusicSystem} from 'opensheetmusicdisplay';
import {exportMusicXml,spellMusicXmlPitch} from './io';
import {midiName,openingPickupBeats,partStaffForNote,sectionKey,transposeKeySignature,type Instrument,type Note,type Project,type Score} from './music';
import {authoritativeBandoneonLayoutForPart} from './bandoneon';
import {effectiveViolinTechnique} from './phrasePlan';
import {findScoreNoteheads,scoreNoteheadColors} from './scoreNoteheads';
import {readScoreEntryNotation,scoreEntryBeat,scoreEntryPitch,scoreEntryOctaveShift,scoreStaffSteps,scoreXAtBeat,type EngravedBeat,type MeasureNotation} from './scoreEntry';
import type {NoteEntryEdit,NoteNotationEdit} from './musicalEdit';
import type {EditPreview} from './editPreview';
import type {BrushPoint} from './brushGesture';

const props=withDefaults(defineProps<{
  project:Project;
  score:Score;
  instrument:Instrument;
  fromMeasure:number;
  toMeasure:number;
  selectedNote?:Note;
  selectedNotes?:readonly Note[];
  entryMode?:boolean;
  entryStep?:number;
  moveMode?:boolean;
  brushMode?:boolean;
  previewMarks?:EditPreview;
  workspaceViewport?:{beat:number;source:'grid'|'score'|'navigation'};
  completedNotes?:readonly Note[];
  playingNotes?:readonly Note[];
  feedbackProgress?:number;
  feedbackState?:string;
  activeMeasure?:number;
  expanded?:boolean;
  followMeasure?:boolean;
  interactive?:boolean;
}>(),{interactive:true});
const emit=defineEmits<{select:[note:Note];edit:[];range:[from:number,to:number];editRange:[from:number,to:number];insertAt:[entry:NoteEntryEdit];moveNote:[note:Note,start:number,pitchDelta:number,notation?:NoteNotationEdit];viewport:[beat:number];brush:[points:BrushPoint[]]}>();

const host=ref<HTMLElement|null>(null);
const scoreAppearanceKey='tango-score-appearance';
function readScoreAppearance(){try{return localStorage.getItem(scoreAppearanceKey)==='theme';}catch{return false;}}
const themedScore=ref(readScoreAppearance());
const bellowsGuide=ref(true);
const canShowBellowsGuide=computed(()=>props.instrument.startsWith('Bandoneon')&&!!authoritativeBandoneonLayoutForPart(props.project,props.instrument));
function setScoreAppearance(value:boolean){
 themedScore.value=value;
 try{localStorage.setItem(scoreAppearanceKey,value?'theme':'paper');}catch{/* Preference remains available for this session. */}
 if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('tango-score-appearance',{detail:value}));
}
function syncScoreAppearance(event:Event){themedScore.value=Boolean((event as CustomEvent<boolean>).detail);}
const loading=ref(true);
const error=ref('');
const displayedRange=computed(()=>{
  const total=Math.max(1,props.project.bars.length);
  const first=Math.max(1,Math.min(total,props.fromMeasure));
  const last=Math.max(first,Math.min(total,props.toMeasure));
  return {first,last};
});

let osmd:OpenSheetMusicDisplay|undefined;
let resizeObserver:ResizeObserver|undefined;
let contentTimer:ReturnType<typeof setTimeout>|undefined;
let layoutTimer:ReturnType<typeof setTimeout>|undefined;
let layoutFrame=0;
let generation=0;
let loaded=false;
let observedWidth=0;
let notesByColor=new Map<string,Note>();
let notesByHead=new Map<SVGElement,Note>();
let headsByNote=new Map<Note,SVGElement[]>();
let focusedHead:SVGElement|undefined;
let highlightedHeads:SVGElement[]=[];
let completedHeads:SVGElement[]=[];
let playingHeads=new Set<SVGElement>();
let measureGroups:SVGGElement[]=[];
let entryNotation:MeasureNotation[]=[];
let followedSystem:MusicSystem|undefined;
let followedGroup:SVGGElement|undefined;

function noteLabel(note:Note){
  const measure=Math.floor((note.start+1e-7)/props.project.beats);
  const beat=Number((note.start-measure*props.project.beats+1).toFixed(2));
  return `${midiName(note.pitch+(props.project.transposeSemitones??0))}, measure ${measure+1}, beat ${beat}${note.bellowsDirection?' · '+note.bellowsDirection:''}${note.bandoneonButtonId?' · button '+note.bandoneonButtonId:''}`;
}

function setTabStop(head:SVGElement){
  focusedHead?.setAttribute('tabindex','-1');
  head.setAttribute('tabindex','0');
  focusedHead=head;
}

function updateLiveFeedback(){
 const active=props.selectedNote?resolveNoteHeads(props.selectedNote):[];
 const state=props.feedbackState;
 const color=state==='Too low'?'#69a9f5':state==='Too high'?'#ee8f70':state==='In tune'?'#46b988':'#c98b3b';
 const progress=Math.max(0,Math.min(100,(props.feedbackProgress??0)*100));
 for(const head of highlightedHeads)if(!active.includes(head)){
  head.style.removeProperty('--note-feedback-progress');
  head.style.removeProperty('--note-feedback-color');
 }
 for(const head of active){
  head.style.setProperty('--note-feedback-progress',progress+'%');
  head.style.setProperty('--note-feedback-color',color);
 }
}
function resolveNoteHeads(note:Note):SVGElement[]{
 const exact=headsByNote.get(note);
 if(exact?.length)return exact;
 // Exercise targets may be reconstructed by the practice model.
 for(const [candidate,heads] of headsByNote)
  if(candidate.pitch===note.pitch&&Math.abs(candidate.start-note.start)<1e-6)return heads;
 return [];
}
function followExpectedNote(){
 const container=host.value;
 if(!props.followMeasure||!container||!props.selectedNote)return;
 const head=resolveNoteHeads(props.selectedNote)[0];
 if(!head)return;
 const bounds=container.getBoundingClientRect(),rect=head.getBoundingClientRect();
 if(rect.top<bounds.top+20||rect.bottom>bounds.bottom-35)
  container.scrollTop=Math.max(0,container.scrollTop+rect.top-bounds.top-Math.min(80,container.clientHeight*.18));
}
function highlightSelection(){
  for(const head of highlightedHeads){
    head.classList.remove('score-note-selected');
    if(props.interactive)head.setAttribute('aria-pressed','false');
  }
  highlightedHeads=[...new Set([...(props.selectedNote?resolveNoteHeads(props.selectedNote):[]),...(props.selectedNotes??[]).flatMap(resolveNoteHeads)])];
  for(const head of highlightedHeads){
    head.classList.add('score-note-selected');
    if(props.interactive)head.setAttribute('aria-pressed','true');
  }
  updateLiveFeedback();
  if(props.interactive&&highlightedHeads.length&&(!focusedHead||!highlightedHeads.includes(focusedHead)))setTabStop(highlightedHeads[0]);
}

function highlightCompleted(){
  for(const head of completedHeads)head.classList.remove('score-note-completed');
  completedHeads=(props.completedNotes??[]).flatMap(note=>resolveNoteHeads(note));
  for(const head of completedHeads)head.classList.add('score-note-completed');
}

function highlightActiveMeasure(){
  for(const group of measureGroups)group.classList.remove('score-measure-active');
  const measure=props.activeMeasure;
  const container=host.value;
  measureGroups=measure===undefined||!container?[]:
    (osmd?.GraphicSheet?.MeasureList[measure-1]??[]).flatMap(staff=>{
      const group=staff?.getSVGGElement();
      return group&&container.contains(group)?[group]:[];
    });
  // Progressive layout can rebuild graphical measures while their original SVG
  // stays on screen. Resolve that case within this score's own container.
  if(props.followMeasure&&container&&measure!==undefined&&!measureGroups.length)
    measureGroups=[...container.querySelectorAll<SVGGElement>(`g[id^="osmd-m${measure-1}-"]`)];
  for(const group of measureGroups)group.classList.add('score-measure-active');
  if(props.followMeasure&&container&&measure!==undefined&&measureGroups.length){
    const system=osmd?.GraphicSheet.MeasureList[measure-1]?.[0]?.ParentMusicSystem;
    if(system&&(system!==followedSystem||!followedGroup?.isConnected)){
      const tops=(system.StaffLines[0]?.Measures??[]).flatMap(staff=>{
        const group=staff.getSVGGElement();
        return group&&container.contains(group)?[group.getBoundingClientRect().top]:[];
      });
      const systemTop=tops.length?Math.min(...tops):measureGroups[0].getBoundingClientRect().top;
      followedSystem=system;
      followedGroup=measureGroups[0];
      const top=systemTop-container.getBoundingClientRect().top;
      container.scrollTop=Math.max(0,container.scrollTop+top-32);
    }
  }
  highlightPlayback();
}

function highlightPlayback(){
  const next=new Set((props.playingNotes??[]).flatMap(note=>
    resolveNoteHeads(note).filter(head=>measureGroups.some(group=>group.contains(head)))));
  for(const head of playingHeads)if(!next.has(head))head.classList.remove('score-note-playing');
  for(const head of next)if(!playingHeads.has(head))head.classList.add('score-note-playing');
  playingHeads=next;
}

// VexFlow sets some glyph colors inline. Normalize only black ink, leaving
// transparent fills, colored note identifiers and highlight classes intact.
function normalizeScoreSvg(){
 const container=host.value;
 if(!container)return;
 const black=(value:string)=>/^(?:black|#000(?:000)?|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\))$/i.test(value.trim());
 for(const svg of container.querySelectorAll<SVGSVGElement>('svg')){
  for(const element of svg.querySelectorAll<SVGElement>('path,text,tspan,use')){
   if(element.classList.contains('score-notehead')||element.closest('.score-notehead'))continue;
   const fill=getComputedStyle(element).fill;
   if(black(fill))element.style.setProperty('fill','currentColor');
   const stroke=getComputedStyle(element).stroke;
   if(black(stroke))element.style.setProperty('stroke','currentColor');
  }
  for(const element of svg.querySelectorAll<SVGElement>('g,path,text,tspan,rect,line,polyline,polygon,circle,ellipse,use')){
   for(const property of ['fill','stroke'] as const){
    const inline=element.style.getPropertyValue(property);
    const attribute=element.getAttribute(property)??'';
    if(black(inline)||(!inline&&black(attribute))){
     element.style.removeProperty(property);
     element.setAttribute(property,'currentColor');
    }
   }
  }
  // Keep OSMD's coordinate system and incremental layout intact. The
  // scroll viewport, not a rewritten SVG viewBox, controls visibility.
  svg.style.overflow='visible';
 }
}

function bindNoteheads(){
  if(!host.value)return;
  focusedHead=undefined;
  highlightedHeads=[];
  completedHeads=[];
  notesByHead=findScoreNoteheads(host.value,notesByColor);
  normalizeScoreSvg();
  headsByNote=new Map();
  for(const [head,note] of notesByHead){
    head.classList.add('score-notehead');
    if(props.interactive){
      head.setAttribute('role','button');
      head.setAttribute('aria-label',noteLabel(note));
      head.setAttribute('aria-pressed','false');
      head.setAttribute('tabindex','-1');
    }
    const siblings=headsByNote.get(note)??[];
    siblings.push(head);
    headsByNote.set(note,siblings);
  }
  const first=notesByHead.keys().next().value;
  if(first&&props.interactive)setTabStop(first);
  highlightCompleted();
  highlightSelection();
  highlightActiveMeasure();
  followExpectedNote();
}

function eventHead(event:Event){
  if(!props.interactive||loading.value)return null;
  const element=event.target instanceof Element?event.target.closest<SVGElement>('.score-notehead'):null;
  return element&&notesByHead.has(element)?element:null;
}

function chooseHead(head:SVGElement){
  const note=notesByHead.get(head);
  if(note){setTabStop(head);emit('select',note);}
}

const rangeMode=ref(false);
const selectedMeasures=ref<[number,number]|null>(null);
let rangePointer:number|null=null,rangeAnchor=0,rangeX=0,rangeY=0,rangeMoved=false,rangeHeld=false;
let rangeTimer:ReturnType<typeof setTimeout>|undefined;
let rangeWasSelected=false;
function scoreMeasureGroups():{group:SVGGElement;measure:number}[]{
 const container=host.value;if(!container)return [];
 const groups=new Map<SVGGElement,number>();
 for(let measure=displayedRange.value.first;measure<=displayedRange.value.last;measure++){
  for(const staff of osmd?.GraphicSheet?.MeasureList[measure-1]??[]){
   const group=staff?.getSVGGElement();
   if(group&&container.contains(group))groups.set(group,measure);
  }
 }
 container.querySelectorAll<SVGGElement>('g[id^="osmd-m"]').forEach(group=>{
  const match=/^osmd-m(\d+)-/.exec(group.id);
  if(match&&!groups.has(group))groups.set(group,Number(match[1])+1);
 });
 return [...groups].map(([group,measure])=>({group,measure})).filter(({measure})=>measure>=displayedRange.value.first&&measure<=displayedRange.value.last);
}
function measureAt(x:number,y:number):number|null{
 for(const {group,measure} of scoreMeasureGroups()){
  const rect=group.getBoundingClientRect();
  if(x>=rect.left&&x<=rect.right&&y>=rect.top-12&&y<=rect.bottom+12)return measure;
 }
 return null;
}
let alignedViewport:{top:number;left:number}|undefined;
let viewportFrame=0;
function alignScoreViewport(force=false){
 const view=props.workspaceViewport,container=host.value;
 if(!view||!container||(!force&&view.source==='score'))return;
 const measure=Math.floor(view.beat/props.project.beats)+1;
 const match=scoreMeasureGroups().find(candidate=>candidate.measure===measure);
 if(!match)return;
 const viewRect=container.getBoundingClientRect(),target=match.group.getBoundingClientRect();
 if(!viewRect.height)return;
 if(target.right>viewRect.right||target.left<viewRect.left)container.scrollLeft+=target.left-viewRect.left;
 const top=container.scrollTop+target.top-viewRect.top-12;
 if(Math.abs(container.scrollTop-top)>2)container.scrollTop=Math.max(0,top);
 alignedViewport={top:container.scrollTop,left:container.scrollLeft};
}
function onWorkspaceScroll(){
 const container=host.value;
 if(!props.workspaceViewport||!container||viewportFrame)return;
 if(alignedViewport&&Math.abs(container.scrollTop-alignedViewport.top)<1&&Math.abs(container.scrollLeft-alignedViewport.left)<1)return;
 alignedViewport=undefined;
 viewportFrame=requestAnimationFrame(()=>{
  viewportFrame=0;
  if(container.scrollTop<1&&container.scrollLeft<1){emit('viewport',(displayedRange.value.first-1)*props.project.beats);return;}
  const bounds=container.getBoundingClientRect();
  const visible=scoreMeasureGroups().find(({group})=>{
   const rect=group.getBoundingClientRect();
   return rect.bottom>=bounds.top+16&&rect.top<=bounds.bottom&&rect.right>bounds.left&&rect.left<bounds.right;
  });
  if(visible)emit('viewport',(visible.measure-1)*props.project.beats);
 });
}
watch(()=>props.workspaceViewport,()=>alignScoreViewport(),{flush:'post'});
function paintRange(){
 const range=selectedMeasures.value;
 host.value?.querySelectorAll('.score-range-fill').forEach(node=>node.remove());
 for(const {group,measure} of scoreMeasureGroups()){
  const selected=!!range&&measure>=range[0]&&measure<=range[1];
  group.classList.toggle('score-range-selected',selected);
  if(!selected)continue;
  const bounds=group.getBBox();
  if(!bounds.width||!bounds.height)continue;
  const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
  rect.setAttribute('class','score-range-fill');
  rect.setAttribute('x',String(bounds.x-2));rect.setAttribute('y',String(bounds.y-5));
  rect.setAttribute('width',String(bounds.width+4));rect.setAttribute('height',String(bounds.height+10));
  rect.setAttribute('rx','4');rect.setAttribute('pointer-events','none');
  group.insertBefore(rect,group.firstChild);
 }
}
function chooseRange(first:number,last:number){selectedMeasures.value=[Math.min(first,last),Math.max(first,last)];paintRange();}
function applyRange(edit=false){
 const range=selectedMeasures.value;if(!range)return;
 clearTimeout(rangeTimer);rangeMode.value=false;selectedMeasures.value=null;paintRange();
 if(edit)emit('editRange',...range);else emit('range',...range);
}
function rangeDown(event:PointerEvent){
 if(!rangeMode.value||event.button!==0)return;
 const m=measureAt(event.clientX,event.clientY);if(m===null)return;
 rangeWasSelected=!!selectedMeasures.value&&m>=selectedMeasures.value[0]&&m<=selectedMeasures.value[1];
 if(!selectedMeasures.value)chooseRange(m,m);
 rangePointer=event.pointerId;rangeAnchor=m;rangeX=event.clientX;rangeY=event.clientY;rangeMoved=false;rangeHeld=false;
 host.value?.setPointerCapture(event.pointerId);
 clearTimeout(rangeTimer);
 rangeTimer=setTimeout(()=>{
  rangeHeld=true;
  const r=selectedMeasures.value;if(!r||m<r[0]||m>r[1])chooseRange(m,m);
  applyRange(true);
 },550);
}
function rangeMove(event:PointerEvent){
 if(rangePointer!==event.pointerId)return;
 if(Math.hypot(event.clientX-rangeX,event.clientY-rangeY)>7){rangeMoved=true;clearTimeout(rangeTimer);}
 if(rangeMoved){const m=measureAt(event.clientX,event.clientY);if(m!==null)chooseRange(rangeAnchor,m);}
}
function rangeUp(event:PointerEvent){
 if(rangePointer!==event.pointerId)return;
 clearTimeout(rangeTimer);rangePointer=null;
 if(rangeHeld||rangeMoved)return;
 const r=selectedMeasures.value;
 if(rangeWasSelected&&r&&rangeAnchor>=r[0]&&rangeAnchor<=r[1])applyRange();else chooseRange(rangeAnchor,rangeAnchor);
}
function cancelRange(){clearTimeout(rangeTimer);rangePointer=null;}
watch(rangeMode,enabled=>{if(!enabled){selectedMeasures.value=null;paintRange();cancelRange();}});
type EngravedStave={getNoteStartX():number;getNoteEndX():number;getYForLine(line:number):number};
type StaffGeometry={group:SVGGElement;bar:number;staff:number;top:number;bottom:number;startX:number;endX:number;length:number;columns:EngravedBeat[]};
const staffGeometry=new Map<string,StaffGeometry>();
const vexStave=(measure:GraphicalMeasure)=>(measure as GraphicalMeasure&{getVFStave():EngravedStave}).getVFStave();
function engravedGroup(measure:GraphicalMeasure,bar:number,staff:number){
 const container=host.value,group=measure.getSVGGElement();
 if(group&&container?.contains(group))return group;
 return container?.querySelector<SVGGElement>(`g[id="osmd-m${bar}-${staff-1}"]`);
}
function engravedColumns(measure:GraphicalMeasure,length:number){
 return measure.staffEntries.flatMap(entry=>{
  const beat=entry.relInMeasureTimestamp.RealValue*4;
  if(!entry.graphicalVoiceEntries.some(voice=>voice.notes.some(({sourceNote})=>!sourceNote.isRest()||sourceNote.Length.RealValue*4<length)))return [];
  const voice=entry.graphicalVoiceEntries.find(candidate=>Number.isFinite(candidate.noteHeadsCenterX));
  const units=voice?voice.PositionAndShape.AbsolutePosition.x+voice.noteHeadsCenterX:entry.PositionAndShape.AbsolutePosition.x;
  return [{x:units*10,beat}]; // OSMD positions are in tenths of a VexFlow pixel unit.
 });
}
function captureStaffGeometry(){
 if(!props.workspaceViewport&&!props.entryMode&&!props.moveMode&&!props.previewMarks)return;
 const pick=openingPickupBeats(props.project);
 for(const [bar,staves] of (osmd?.GraphicSheet?.MeasureList??[]).entries()){
  if(bar+1<displayedRange.value.first||bar+1>displayedRange.value.last)continue;
  for(const [index,measure] of staves.entries()){
   const staff=index+1,key=`${bar}:${staff}`;
   const group=engravedGroup(measure,bar,staff);
   if(!group||staffGeometry.get(key)?.group===group)continue;
   const stave=vexStave(measure);
   if(!stave)continue;
   const length=bar===0&&pick?pick:props.project.beats;
   staffGeometry.set(key,{group,bar,staff,length,columns:engravedColumns(measure,length),
    top:stave.getYForLine(0),bottom:stave.getYForLine(4),startX:stave.getNoteStartX(),endX:stave.getNoteEndX()});
  }
 }
}
function scorePoint(clientX:number,clientY:number){
 if(!loaded||loading.value||!host.value)return;
 const candidates=[];
 for(const geometry of staffGeometry.values()){
  const {group,top,bottom,startX,endX}=geometry;
  const bounds=group.getBoundingClientRect();
  if(clientX<bounds.left||clientX>bounds.right||clientY<bounds.top-50||clientY>bounds.bottom+50)continue;
  const matrix=group.getScreenCTM();
  if(!matrix)continue;
  const {x,y}=new DOMPoint(clientX,clientY).matrixTransform(matrix.inverse());
  const distance=Math.abs(y-(top+bottom)/2);
  if(x<startX-4||x>endX+4||distance>(bottom-top)*1.5)continue;
  candidates.push({geometry,x,steps:Math.round((bottom-y)*8/(bottom-top)),distance});
 }
 const target=candidates.sort((a,b)=>a.distance-b.distance)[0];
 if(!target)return;
 const {x,steps,geometry:{bar,staff,length,columns,startX,endX}}=target;
 const beat=scoreEntryBeat(x,columns,startX,endX,length,props.entryStep??.25);
 const notation=entryNotation[bar];
 if(!notation)return;
 const pitch=scoreEntryPitch(notation,staff,steps,beat,props.project.transposeSemitones??0);
 if(pitch===undefined)return;
 const octaveShift=scoreEntryOctaveShift(notation,staff,beat);
 const grandStaff:1|2|undefined=notation.clefs.size>1?(staff===2?2:1):undefined;
 return {bar,staff,steps,beat:beat+props.project.beats-length,pitch,notation:{staff:grandStaff,octaveShift}};
}

function drawPreviewMark(group:SVGGElement,x:number,y:number,kind:string,label?:string){
 const namespace='http://www.w3.org/2000/svg';
 const mark=document.createElementNS(namespace,'g');
 mark.setAttribute('class','score-draft-marker');
 mark.setAttribute('data-edit-preview',kind);
 mark.setAttribute('transform',`translate(${x} ${y})`);
 if(label){
  mark.setAttribute('role','img');
  mark.setAttribute('aria-label',label);
  const head=document.createElementNS(namespace,'ellipse');
  head.setAttribute('rx','6');head.setAttribute('ry','4');
  mark.append(head);
 }else mark.setAttribute('aria-hidden','true');
 const symbol=document.createElementNS(namespace,'text');
 symbol.setAttribute('x','7');symbol.setAttribute('y','-5');
 symbol.textContent=kind==='added'?'+':kind==='modified'?'~':kind==='deleted'?'×':'◌';
 mark.append(symbol);group.append(mark);
}
function paintEditPreview(){
 const container=host.value;if(!container)return;
 container.querySelectorAll('.score-draft-marker').forEach(node=>node.remove());
 const draft=props.previewMarks;
 for(const [head,note] of notesByHead){
  const kind=draft?.after.get(note);
  if(!kind){head.removeAttribute('data-edit-preview');if(props.interactive)head.setAttribute('aria-label',noteLabel(note));continue;}
  head.setAttribute('data-edit-preview',kind);
  if(props.interactive)head.setAttribute('aria-label',(kind==='added'?'Proposed addition, ':'Proposed change, ')+noteLabel(note));
  const group=head.closest<SVGGElement>('g[id^="osmd-m"]'),matrix=group?.getScreenCTM();
  if(!group||!matrix)continue;
  const box=head.getBoundingClientRect();
  const {x,y}=new DOMPoint(box.left+box.width/2,box.top+box.height/2).matrixTransform(matrix.inverse());
  drawPreviewMark(group,x,y,kind);
 }
 if(!draft?.before.length)return;
 const p=props.project,transpose=p.transposeSemitones??0;
 for(const {note,kind} of draft.before){
  const bar=Math.floor((note.start+1e-7)/p.beats),notation=entryNotation[bar];
  if(!notation||!p.bars[bar])continue;
  const staff=notation.clefs.size===1?1:partStaffForNote(note,props.instrument,p.pianoSplitPitch??60);
  const geometry=staffGeometry.get(`${bar}:${staff}`);
  if(!geometry||!container.contains(geometry.group))continue;
  const {group,length,columns,top,bottom,startX,endX}=geometry;
  const {step,octave}=spellMusicXmlPitch(note.pitch+transpose,transposeKeySignature(sectionKey(p,p.bars[bar].section),transpose));
  const steps=scoreStaffSteps(notation,staff,step,octave,note.xmlOctaveShift??0);
  if(steps===undefined)continue;
  const x=scoreXAtBeat(note.start-(bar+1)*p.beats+length,columns,startX,endX,length);
  drawPreviewMark(group,x,bottom-(bottom-top)*steps/8,kind,(kind==='deleted'?'Proposed removal, ':'Original note, ')+noteLabel(note));
 }
}
watch(()=>props.previewMarks,paintEditPreview,{flush:'post'});
function insertAtScorePoint(event:MouseEvent){
 const target=scorePoint(event.clientX,event.clientY);
 if(target)emit('insertAt',{bar:target.bar,beat:target.beat,pitch:target.pitch,notation:target.notation});
}
let movePointer:{id:number;note:Note;x:number;y:number;origin:NonNullable<ReturnType<typeof scorePoint>>;moved:boolean}|undefined;
let brushPointer:{id:number;points:Map<number,BrushPoint>}|undefined;
let suppressScoreClick=false;
function scoreBrushPoint(event:PointerEvent):BrushPoint|undefined{
 const point=scorePoint(event.clientX,event.clientY);
 if(point)return {beat:point.bar*props.project.beats+point.beat,pitch:point.pitch};
}
function scorePointerDown(event:PointerEvent){
 if(rangeMode.value){rangeDown(event);return;}
 suppressScoreClick=false;
 if(!event.isPrimary||event.button!==0)return;
 if(props.brushMode){
  const point=scoreBrushPoint(event);
  if(!point)return;
  brushPointer={id:event.pointerId,points:new Map([[point.beat,point]])};
  host.value?.setPointerCapture(event.pointerId);
  event.preventDefault();
  return;
 }
 if(!props.moveMode)return;
 const head=eventHead(event),note=head&&notesByHead.get(head);
 if(!note)return;
 const origin=scorePoint(event.clientX,event.clientY);
 if(origin)movePointer={id:event.pointerId,note,x:event.clientX,y:event.clientY,origin,moved:false};
}
function scorePointerMove(event:PointerEvent){
 rangeMove(event);
 if(brushPointer?.id===event.pointerId){
  const point=scoreBrushPoint(event);
  if(point)brushPointer.points.set(point.beat,point);
  return;
 }
 if(movePointer?.id!==event.pointerId||movePointer.moved)return;
 if(Math.hypot(event.clientX-movePointer.x,event.clientY-movePointer.y)<6)return;
 movePointer.moved=true;
 host.value?.setPointerCapture(event.pointerId);
}
function scorePointerUp(event:PointerEvent){
 rangeUp(event);
 if(brushPointer?.id===event.pointerId){
  scorePointerMove(event);
  const points=[...brushPointer.points.values()];
  brushPointer=undefined;suppressScoreClick=true;
  emit('brush',points);
  return;
 }
 const drag=movePointer;
 if(drag?.id!==event.pointerId)return;
 movePointer=undefined;
 if(!drag.moved||!props.moveMode)return;
 suppressScoreClick=true;
 const destination=scorePoint(event.clientX,event.clientY);
 if(!destination)return;
 const dx=event.clientX-drag.x;
 const beats=props.project.beats;
 const timeDelta=Math.abs(dx)<5&&destination.bar===drag.origin.bar?0:
  (destination.bar-drag.origin.bar)*beats+destination.beat-drag.origin.beat;
 const staffChanged=destination.staff!==drag.origin.staff;
 const octaveChanged=destination.notation.octaveShift!==drag.origin.notation.octaveShift;
 const pitchDelta=!staffChanged&&!octaveChanged&&destination.steps===drag.origin.steps?0:destination.pitch-drag.note.pitch;
 if(timeDelta||pitchDelta||staffChanged)emit('moveNote',drag.note,drag.note.start+timeDelta,pitchDelta,staffChanged||octaveChanged?destination.notation:undefined);
}
function cancelScorePointer(){
 if(movePointer?.moved||brushPointer)suppressScoreClick=true;
 movePointer=undefined;
 brushPointer=undefined;
 cancelRange();
}
watch(()=>props.moveMode,enabled=>{if(!enabled)cancelScorePointer();});
watch(()=>props.brushMode,enabled=>{if(!enabled)cancelScorePointer();});
function onScoreClick(event:MouseEvent){
 if(suppressScoreClick){suppressScoreClick=false;return;}
  if(rangeMode.value||rangeMoved||rangeHeld){rangeMoved=false;rangeHeld=false;return;}
 if(props.brushMode)return;
  const head=eventHead(event);
  if(head){chooseHead(head);return;}
  if(props.entryMode)insertAtScorePoint(event);
}

function onScoreKey(event:KeyboardEvent){
 if(event.key==='Escape'&&(movePointer||brushPointer)){event.preventDefault();event.stopPropagation();cancelScorePointer();return;}
  const head=eventHead(event);
  if(!head)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();chooseHead(head);return;}
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  const heads=[...notesByHead.keys()];
  const index=heads.indexOf(head);
  const next=event.key==='Home'?0:event.key==='End'?heads.length-1:
    Math.max(0,Math.min(heads.length-1,index+(event.key==='ArrowLeft'?-1:1)));
  event.preventDefault();
  setTabStop(heads[next]);
  heads[next].focus();
}

function renderRange(){
  const renderer=osmd;
  if(!renderer||!loaded)return;
  cancelAnimationFrame(layoutFrame);
  const {first,last}=displayedRange.value;
  renderer.zoom=props.expanded&&observedWidth>=320?1.18:1;
  renderer.setOptions({drawFromMeasureNumber:first,drawUpToMeasureNumber:last,stretchLastSystemLine:props.expanded});
  renderer.resetIncrementalRendering();
  staffGeometry.clear();
  followedSystem=undefined;
  followedGroup=undefined;
  loading.value=true;
  error.value='';
  const draw=()=>{
    try{
      if(props.followMeasure||last-first<12){renderer.render();captureStaffGeometry();}
      else{
        const {done}=renderer.renderNext({measures:12});
        // Keep the geometry from the draw pass that owns each SVG group.
        captureStaffGeometry();
        if(!done){layoutFrame=requestAnimationFrame(draw);return;}
      }
      bindNoteheads();paintRange();paintEditPreview();alignScoreViewport(true);
    }catch(cause){error.value=`Could not render this part: ${String(cause)}`;}
    loading.value=false;
  };
  draw();
}

async function reloadScore(){
  const renderer=osmd;
  if(!renderer)return;
  const current=++generation;
  cancelAnimationFrame(layoutFrame);
  cancelAnimationFrame(viewportFrame);
  viewportFrame=0;
  loaded=false;
  loading.value=true;
  error.value='';
  try{
    const sourceNotes=props.score[props.instrument]??[];
    const displayNotes=props.instrument.startsWith('Violin')?sourceNotes.map(note=>{
      if(note.technique)return note;
      const measure=Math.floor((note.start+1e-7)/props.project.beats);
      const technique=effectiveViolinTechnique(props.project,props.instrument,measure);
      return technique==='pizzicato'||technique==='pizzicato_arpeggio'?{...note,technique:'pizzicato' as const}:note;
    }):sourceNotes;
    const displayScore=displayNotes.some((note,index)=>note!==sourceNotes[index])
      ?{...props.score,[props.instrument]:displayNotes}:props.score;
    const colors=scoreNoteheadColors(sourceNotes);
    const displayColors=new Map<Note,string>();
    sourceNotes.forEach((note,index)=>{
      const color=colors.byNote.get(note);
      if(color)displayColors.set(displayNotes[index],color);
    });
    const xml=exportMusicXml(props.project,displayScore,{onlyInstrument:props.instrument,previewNoteheadColors:displayColors,engravingPreview:true,automaticBellows:bellowsGuide.value,bellowsFirstVisibleMeasure:displayedRange.value.first});
    await renderer.load(xml);
    if(current!==generation)return;
    notesByColor=colors.byColor;
    entryNotation=readScoreEntryNotation(new DOMParser().parseFromString(xml,'text/xml'));
    loaded=true;
    renderRange();
  }catch(cause){
    if(current!==generation)return;
    error.value=`Could not load this part: ${String(cause)}`;
    loading.value=false;
  }
}

function scheduleContentRender(){
  loading.value=true;
  if(contentTimer)clearTimeout(contentTimer);
  contentTimer=setTimeout(()=>{contentTimer=undefined;void reloadScore();},180);
}

function scheduleLayout(){
  clearTimeout(layoutTimer);
  layoutTimer=setTimeout(()=>{if(!contentTimer)renderRange();},140);
}

watch(()=>[props.project,props.score,props.instrument],scheduleContentRender,{deep:true});
watch(displayedRange,(next,previous)=>{
 if(canShowBellowsGuide.value&&bellowsGuide.value&&next.first!==previous.first)scheduleContentRender();
 else scheduleLayout();
});
watch(bellowsGuide,scheduleContentRender);
watch(()=>props.expanded,scheduleLayout);
watch(()=>props.selectedNote,()=>{highlightSelection();highlightActiveMeasure();followExpectedNote();});
watch(()=>props.selectedNotes,highlightSelection);
watch([()=>props.feedbackProgress,()=>props.feedbackState],updateLiveFeedback);
watch(()=>props.completedNotes,highlightCompleted);
watch(()=>props.activeMeasure,()=>{highlightActiveMeasure();followExpectedNote();});
watch(()=>props.playingNotes,highlightPlayback);

onMounted(()=>{
  window.addEventListener('tango-score-appearance',syncScoreAppearance);
  if(!host.value)return;
  osmd=new OpenSheetMusicDisplay(host.value,{
    autoResize:false,
    backend:'svg',
    drawingParameters:'compact',
    drawTitle:false,
    drawCredits:false,
    drawPartNames:false,
    drawMeasureNumbers:true,
    autoGenerateMultipleRestMeasuresFromRestMeasures:!props.workspaceViewport,
    disableCursor:true,
    coloringEnabled:true,
  });
  observedWidth=host.value.clientWidth;
  resizeObserver=new ResizeObserver(([entry])=>{
    const width=Math.round(entry.contentRect.width);
    if(width<=0||width===observedWidth)return;
    observedWidth=width;
    scheduleLayout();
  });
  resizeObserver.observe(host.value);
  void reloadScore();
});

onBeforeUnmount(()=>{
  window.removeEventListener('tango-score-appearance',syncScoreAppearance);
  generation++;cancelScorePointer();
  if(contentTimer)clearTimeout(contentTimer);
  if(layoutTimer)clearTimeout(layoutTimer);
  cancelAnimationFrame(layoutFrame);
  cancelAnimationFrame(viewportFrame);
  resizeObserver?.disconnect();
  osmd?.dispose();
  osmd=undefined;
});
</script>

<template>
  <section class="score-preview editor" :class="{'score-preview-expanded':expanded,'score-preview-themed':themedScore}" aria-label="Staff notation">
    <div v-if="interactive" class="score-preview-selection">
      <span role="status">{{selectedNote?noteLabel(selectedNote):'Select a notehead to hear it.'}}</span>
      <button v-if="selectedNote" type="button" class="secondary" @click="emit('edit')">Edit selected note</button>
    </div>
    <div class="score-appearance-control"><button type="button" class="secondary" :aria-pressed="rangeMode" @click="rangeMode=!rangeMode" title="Select measures by dragging">{{rangeMode?'Cancel range':'Select range'}}</button><template v-if="rangeMode&&selectedMeasures"><span class="score-range-status" role="status">Measures {{selectedMeasures[0]}}–{{selectedMeasures[1]}}</span><button type="button" class="secondary" @click="applyRange()">Use {{selectedMeasures[0]}}–{{selectedMeasures[1]}}</button><button type="button" class="secondary" @click="applyRange(true)">Edit range</button></template><button type="button" class="secondary" :aria-pressed="themedScore" @click="setScoreAppearance(!themedScore)" title="Remember score appearance on this device">{{themedScore?'Score: theme':'Score: paper'}}</button><button v-if="canShowBellowsGuide" type="button" class="secondary" :aria-pressed="bellowsGuide" title="Show suggested pull and push directions above the staff, in square brackets" @click="bellowsGuide=!bellowsGuide">Bellows guide</button></div>
    <p v-if="loading&&!followMeasure" class="score-preview-status" role="status">Engraving score…</p>
    <p v-if="error" class="score-preview-error" role="alert">{{error}}</p>
    <div ref="host" class="score-preview-canvas" :class="{'score-preview-interactive':interactive,'score-preview-follow':followMeasure,'score-range-mode':rangeMode,'score-move-mode':moveMode,'score-brush-mode':brushMode,'score-workspace-viewport':workspaceViewport}" :aria-busy="loading"
      :tabindex="followMeasure||workspaceViewport?0:undefined" :aria-label="followMeasure?'Scrollable exercise score':workspaceViewport?'Scrollable editing score':undefined" @scroll.passive="onWorkspaceScroll" @pointerdown="scorePointerDown" @pointermove="scorePointerMove" @pointerup="scorePointerUp" @pointercancel="cancelScorePointer" @lostpointercapture="cancelScorePointer" @click="onScoreClick" @keydown="onScoreKey" />
  </section>
</template>

<style scoped>
.score-preview{margin:6px 0;padding:12px;background:var(--score-paper,#f8fafc);color:#18222c;border:1px solid #b9c7d3;border-radius:10px;overflow:hidden}
.score-preview-status{margin:0 0 6px}
.score-preview-selection{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px;font-size:.85rem}
.score-preview-canvas{min-height:92px;overflow-x:auto}
.score-preview-follow{height:var(--score-follow-height,300px);overflow:auto;overflow-anchor:none;overscroll-behavior:contain;scrollbar-gutter:stable}
.score-workspace-viewport{max-height:min(55vh,35rem);overflow:auto;overflow-anchor:none}
.score-preview-canvas :deep(svg){display:block;max-width:100%;height:auto;overflow:visible;color:#18222c;fill:currentColor}
.score-preview-canvas{padding-block:4px 12px;box-sizing:border-box}
.score-preview-follow{flex:1 1 auto;min-height:0;max-height:none;align-self:stretch}
.score-preview-follow :deep(svg){max-width:none;width:100%;height:auto;margin:0;overflow:visible}
.score-preview-follow :deep(div[id^="osmdCanvasPage"]){width:100%!important;max-width:none!important;height:auto!important;overflow:visible!important}
.score-preview-canvas :deep(svg text),.score-preview-canvas :deep(svg tspan){fill:currentColor}
.score-preview-expanded .score-preview-canvas :deep(svg){margin-inline:auto}
.score-preview-canvas :deep(.score-notehead),.score-preview-canvas :deep(.score-notehead [fill]){fill:#18222c}
.score-preview-interactive :deep(.score-notehead){cursor:pointer}
.score-move-mode :deep(.score-notehead){cursor:grab;touch-action:none}
.score-brush-mode,.score-brush-mode :deep(.score-notehead){touch-action:none;cursor:crosshair}
.score-preview-canvas :deep(.score-draft-marker){pointer-events:none;color:var(--score-ink,#18222c)}
.score-preview-canvas :deep(.score-draft-marker ellipse){fill:none;stroke:currentColor;stroke-dasharray:2 2;stroke-width:1.5}
.score-preview-canvas :deep(.score-draft-marker text){fill:currentColor;stroke:none;font:bold 12px sans-serif}
.score-preview-canvas :deep(.score-note-completed),.score-preview-canvas :deep(.score-note-completed [fill]){fill:#24724f}
.score-preview-canvas :deep(.score-measure-active .vf-stave path){stroke:#176773}
.score-preview-canvas :deep(.score-note-playing),.score-preview-canvas :deep(.score-note-playing [fill]){fill:#006d79}
.score-preview-canvas :deep(.score-note-selected),.score-preview-canvas :deep(.score-note-selected [fill]),
.score-preview-canvas :deep(.score-notehead:focus-visible),.score-preview-canvas :deep(.score-notehead:focus-visible [fill]){fill:#a44702}
.score-preview-error{color:#a32828}
@media(max-width:640px){.score-preview{padding:8px}.score-preview-canvas{margin-inline:-4px}}
.score-preview-canvas :deep(.score-note-selected){
 filter:drop-shadow(0 0 2px var(--note-feedback-color,#c98b3b));
}
.score-preview-canvas :deep(.score-note-selected [fill]){
 stroke:var(--note-feedback-color,#c98b3b);
 stroke-width:1.3px;
}
.score-appearance-control{display:flex;justify-content:flex-end;margin-bottom:4px}
.score-appearance-control button{font-size:.72rem;padding:3px 8px}
.score-preview-themed{background:var(--panel,#1a232c);color:var(--score-ink,#e7c38e);border-color:var(--border,#35414c)}
.score-preview-themed .score-preview-canvas :deep(svg){color:var(--score-ink,#e7c38e);fill:currentColor}
.score-preview-themed .score-preview-canvas :deep(svg text),.score-preview-themed .score-preview-canvas :deep(svg tspan){fill:currentColor!important}
.score-preview-themed .score-preview-canvas :deep([fill="black"]),.score-preview-themed .score-preview-canvas :deep([fill="#000"]),.score-preview-themed .score-preview-canvas :deep([fill="#000000"]){fill:var(--score-ink,#e7c38e)}
.score-preview-themed .score-preview-canvas :deep([stroke="black"]),.score-preview-themed .score-preview-canvas :deep([stroke="#000"]),.score-preview-themed .score-preview-canvas :deep([stroke="#000000"]){stroke:var(--score-ink,#e7c38e)}
.score-preview-themed .score-preview-canvas :deep(.score-notehead),.score-preview-themed .score-preview-canvas :deep(.score-notehead [fill]){fill:var(--score-ink,#e7c38e)}
.score-preview-themed .score-preview-canvas :deep(.score-note-completed),.score-preview-themed .score-preview-canvas :deep(.score-note-completed [fill]){fill:#6ec5b2}
.score-preview-themed .score-preview-canvas :deep(.score-note-playing),.score-preview-themed .score-preview-canvas :deep(.score-note-playing [fill]){fill:#8fbbff}
.score-preview-themed .score-preview-canvas :deep(.score-note-selected),.score-preview-themed .score-preview-canvas :deep(.score-note-selected [fill]),.score-preview-themed .score-preview-canvas :deep(.score-notehead:focus-visible),.score-preview-themed .score-preview-canvas :deep(.score-notehead:focus-visible [fill]){fill:var(--accent,#e7c38e)}
.score-preview-themed .score-preview-canvas :deep(.score-measure-active .vf-stave path){stroke:#6ec5b2}
.score-preview-themed .score-preview-error{color:#ee8f70}
</style>

<style scoped>
.score-range-mode{touch-action:none;cursor:crosshair;user-select:none}
.score-preview-canvas :deep(.score-range-selected){filter:drop-shadow(0 0 3px #319db7);outline:2px solid #319db7;outline-offset:2px}
.score-appearance-control{display:flex;flex-wrap:wrap;gap:4px}
</style>

<style scoped>
.score-preview-themed{--score-ink:#e7c38e}
.score-preview-themed .score-preview-canvas :deep(svg [fill="rgb(0, 0, 0)"]),
.score-preview-themed .score-preview-canvas :deep(svg [fill="rgb(0,0,0)"]),
.score-preview-themed .score-preview-canvas :deep(svg [fill="#000000ff"]),
.score-preview-themed .score-preview-canvas :deep(svg .vf-accidental),
.score-preview-themed .score-preview-canvas :deep(svg .vf-accidental path),
.score-preview-themed .score-preview-canvas :deep(svg .vf-keysignature path),
.score-preview-themed .score-preview-canvas :deep(svg .vf-keysignature text),
.score-preview-themed .score-preview-canvas :deep(svg .vf-timesignature path){fill:var(--score-ink)!important;color:var(--score-ink)!important}
.score-preview-themed .score-preview-canvas :deep(svg [stroke="rgb(0, 0, 0)"]),
.score-preview-themed .score-preview-canvas :deep(svg [stroke="rgb(0,0,0)"]){stroke:var(--score-ink)}
.score-preview-canvas :deep(.score-range-selected){filter:none;outline:none}
.score-preview-canvas :deep(.score-range-fill){fill:#319db7!important;fill-opacity:.18;stroke:#16778e!important;stroke-width:1.5;vector-effect:non-scaling-stroke}
.score-preview-themed .score-preview-canvas :deep(.score-range-fill){fill:#69d5d9!important;fill-opacity:.18;stroke:#69d5d9!important}
.score-range-status{font-size:12px;font-weight:750;align-self:center;color:inherit}
.score-appearance-control button[aria-pressed="true"]{border-color:#69b7c9}
</style>

<style scoped>
/* VexFlow emits some glyphs with inline paint (including dark navy), rather
   than the black attributes used by the staff. Normalize actual SVG ink,
   retaining intentional no-fill/no-stroke geometry and live note colours. */
.score-preview-themed .score-preview-canvas :deep(svg path:not([fill="none"]):not(.score-range-fill)),
.score-preview-themed .score-preview-canvas :deep(svg circle:not([fill="none"])),
.score-preview-themed .score-preview-canvas :deep(svg ellipse:not([fill="none"])),
.score-preview-themed .score-preview-canvas :deep(svg polygon:not([fill="none"])),
.score-preview-themed .score-preview-canvas :deep(svg use:not([fill="none"])){
 fill:var(--score-ink)!important;
}
.score-preview-themed .score-preview-canvas :deep(svg [stroke]:not([stroke="none"]):not([stroke="transparent"]):not(.score-range-fill)){
 stroke:var(--score-ink)!important;
}
.score-preview-themed .score-preview-canvas :deep(.score-notehead),
.score-preview-themed .score-preview-canvas :deep(.score-notehead path){fill:var(--score-ink)!important}
.score-preview-themed .score-preview-canvas :deep(.score-note-completed),
.score-preview-themed .score-preview-canvas :deep(.score-note-completed path),
.score-preview-themed .score-preview-canvas :deep(.score-note-completed [fill]){fill:#6ec5b2!important}
.score-preview-themed .score-preview-canvas :deep(.score-note-playing),
.score-preview-themed .score-preview-canvas :deep(.score-note-playing path),
.score-preview-themed .score-preview-canvas :deep(.score-note-playing [fill]){fill:#8fbbff!important}
.score-preview-themed .score-preview-canvas :deep(.score-note-selected),
.score-preview-themed .score-preview-canvas :deep(.score-note-selected path),
.score-preview-themed .score-preview-canvas :deep(.score-note-selected [fill]){fill:#ffd166!important;stroke:var(--note-feedback-color,#c98b3b)!important}
.score-preview-themed .score-preview-canvas :deep(.score-measure-active .vf-stave path){stroke:#6ec5b2!important}
</style>

<style scoped>
.score-preview-canvas :deep(.score-note-selected){filter:drop-shadow(0 0 2px #007d88) drop-shadow(0 0 3px #00a9b5)}
.score-preview-canvas :deep(.score-note-selected),
.score-preview-canvas :deep(.score-note-selected path),
.score-preview-canvas :deep(.score-note-selected [fill]){fill:#007d88!important;stroke:#007d88!important;stroke-width:1.5px}
.score-preview-themed .score-preview-canvas :deep(.score-note-selected){filter:drop-shadow(0 0 2px #6af2ee) drop-shadow(0 0 4px #35b9bd)}
.score-preview-themed .score-preview-canvas :deep(.score-note-selected),
.score-preview-themed .score-preview-canvas :deep(.score-note-selected path),
.score-preview-themed .score-preview-canvas :deep(.score-note-selected [fill]){fill:#6af2ee!important;stroke:#6af2ee!important;stroke-width:1.5px}
.score-preview-follow :deep(.score-note-selected),
.score-preview-follow :deep(.score-note-selected path),
.score-preview-follow :deep(.score-note-selected [fill]){fill:var(--note-feedback-color,#c98b3b)!important;stroke:var(--note-feedback-color,#c98b3b)!important}
</style>
