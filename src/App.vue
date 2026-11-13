<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import type {PolySynth,Synth} from 'tone';
import {startAudioFromGesture} from './toneSession';
// Tone.js is loaded only after the first user audio gesture.
let Tone:typeof import('tone');
import {version as appVersion} from '../package.json';
import {demoProject,blankProject,generate,mergeScores,INSTRUMENTS,pianoStaffForPitch,midiName,editorPitchName,parsePitch,scoreStats,type Project,type Note,type Instrument,type Role,defaultOrchestration,type ViolinTechnique,type ArpeggioDirection,violinMarcatoBeatsFor,type FollowTarget,type FollowMethod,type Difficulty,type DynamicMark,defaultInstrumentSettings,defaultExpression,convertTwoFourToFour,parseChordSequence,chordAt,chordCompletions,completeChordToken,instrumentActivity,transposeScore,defaultArticulation,measureArticulation,type Articulation,MAJOR_KEYS,MINOR_KEYS,sectionKey,parseKeySignature,inferSectionKeys,sectionSpans,sectionLetter,resizeSections,copySectionChords,noteEditorContext,noteEditorPitchClass,suggestedEditorNote,replaceInstrumentMeasure,resetInstrumentMeasure,instrumentRange,noteSoundingDuration,noteSoundingVelocity,ARTICULATION_GATES,figureMeasure,FIGURE_KINDS,type FigureKind} from './music';
import {download,exportMusicXml,validateMusicXmlDurations,saveProject,loadProject,importMusicXml,importMidi,scoreFromParts} from './io';
import {newLocalSongId,saveLocalSong,listLocalSongs,readLocalSong,deleteLocalSong,lastOpenedSongId,rememberOpenedSongId,type LocalSongSummary} from './localProjects';
import {measureLoopEvents} from './measureLoop';
import {playExpressiveEvent} from './expressiveAudio';
// Local-first autosave: each song has a stable ID independent of its (editable) title.
const localSongId=ref('');
const localSongs=ref<LocalSongSummary[]>([]);
const libraryReady=ref(false);
const saveStatus=ref('Opening local song library…');
let editVersion=0;
let autosaveTimer:ReturnType<typeof setTimeout>|undefined;
let saveQueue:Promise<void>=Promise.resolve();
function snapshot(p:Project):Project{return JSON.parse(JSON.stringify(p)) as Project;}
async function refreshLocalSongs(){localSongs.value=await listLocalSongs();}
function persistCurrent():Promise<void>{
  if(!libraryReady.value||!localSongId.value)return Promise.resolve();
  const id=localSongId.value;
  const current=snapshot(project.value);
  const version=editVersion;
  saveStatus.value='Saving locally…';
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    await saveLocalSong(id,current);
    // A slower save from the previous song must not overwrite current UI status.
    if(localSongId.value===id){
      if(editVersion===version)saveStatus.value=`Saved locally · ${new Date().toLocaleTimeString()}`;
      await refreshLocalSongs();
    }
  });
  void saveQueue.catch(error=>{saveStatus.value=`Autosave failed: ${String(error)}`;message.value=saveStatus.value;});
  return saveQueue;
}
function scheduleAutosave(){
  if(!libraryReady.value)return;
  editVersion++;
  if(autosaveTimer)clearTimeout(autosaveTimer);
  saveStatus.value='Unsaved edits…';
  autosaveTimer=setTimeout(()=>{autosaveTimer=undefined;void persistCurrent().catch(()=>{});},650);
}
async function flushAutosave(){
  if(autosaveTimer){clearTimeout(autosaveTimer);autosaveTimer=undefined;await persistCurrent();}
  await saveQueue;
}
function stopPlayback(){
  // Invalidate a pending Tone.start() before it can schedule anything.
  noteLoopSession++;
  if(playing.value||noteLoopPlaying.value){Tone.getTransport().stop();Tone.getTransport().cancel();}
  synth?.releaseAll();loopSynth?.releaseAll();
  playing.value=false;noteLoopPlaying.value=false;noteLoopBeat.value=-1;
}
function selectProjectInEditor(p:Project){
  stopPlayback();project.value=p;selectedBar.value=0;overviewFocus.value=0;
  overviewStart.value=1;overviewEnd.value=Math.min(8,p.bars.length);
  chosenSection.value=p.bars[0]?.section??'A';noteSelected.value=-1;
  chordEditorOpen.value=false;pending.value=[];newSongOpen.value=false;
}
async function adoptLocalSong(p:Project){
  const id=newLocalSongId();
  if(libraryReady.value){await saveLocalSong(id,p);await refreshLocalSongs();}
  localSongId.value=id;rememberOpenedSongId(id);selectProjectInEditor(p);
}
async function openLocalSong(id:string){
  if(!id||id===localSongId.value)return;
  try{
    await flushAutosave();
    const loaded=await readLocalSong(id);
    if(!loaded)throw Error('The selected song no longer exists');
    localSongId.value=id;rememberOpenedSongId(id);selectProjectInEditor(loaded);
    message.value=`Opened locally saved song: ${loaded.title}.`;
    saveStatus.value='Loaded from local library';
  }catch(error){message.value=`Could not open song: ${String(error)}`;}
}
async function duplicateLocalSong(){
  try{await flushAutosave();const duplicate=snapshot(project.value);duplicate.title=`${duplicate.title||'Untitled Tango'} (copy)`;await adoptLocalSong(duplicate);message.value='Created a separate local copy. Rename it in the Title field.';}
  catch(error){message.value=`Could not duplicate song: ${String(error)}`;}
}
async function deleteCurrentLocalSong(){
  if(!libraryReady.value)return;
  if(!window.confirm(`Permanently delete "${project.value.title||'Untitled Tango'}" from this browser? Export a .tango backup first if needed.`))return;
  try{
    await flushAutosave();const id=localSongId.value;
    await deleteLocalSong(id);await refreshLocalSongs();
    const next=localSongs.value[0];
    if(next){const loaded=await readLocalSong(next.id);if(!loaded)throw Error('Next song is unavailable');localSongId.value=next.id;rememberOpenedSongId(next.id);selectProjectInEditor(loaded);}
    else{await adoptLocalSong(blankProject());}
    saveStatus.value='Local song deleted';message.value='Deleted selected song from this browser. Other songs are unchanged.';
  }catch(error){message.value=`Delete failed: ${String(error)}`;}
}
async function saveNow(){try{await flushAutosave();await persistCurrent();}catch(error){message.value=`Save failed: ${String(error)}`;}}
async function initializeLocalLibrary(){
  try{
    const entries=await listLocalSongs();localSongs.value=entries;
    const previous=lastOpenedSongId();
    const id=entries.some(song=>song.id===previous)?previous!:entries[0]?.id;
    if(id){const saved=await readLocalSong(id);if(saved){localSongId.value=id;selectProjectInEditor(saved);message.value=`Restored ${saved.title} from this browser's local library.`;}}
    if(!localSongId.value){const fresh=newLocalSongId();await saveLocalSong(fresh,project.value);localSongId.value=fresh;await refreshLocalSongs();}
    rememberOpenedSongId(localSongId.value);libraryReady.value=true;saveStatus.value='Autosave on · stored in this browser';
  }catch(error){saveStatus.value=`Local storage unavailable: ${String(error)}`;message.value='Local autosave unavailable. Use Save .tango to keep a backup.';}
}
const project=ref<Project>(blankProject());const active=ref<'overview'|'structure'|'lead'|'arrange'|'score'|'notes'>('overview');const selectedBar=ref(0);const message=ref('New blank tango: five sections of sixteen measures. Enter chords and melody, or import a song.');const importMode=ref<'melody'|'score'>('melody');const selectedTrack=ref(0);const pending=ref<{name:string;notes:Note[]}[]>([]);const playing=ref(false);const score=computed(()=>project.value.generatedScore??generate(project.value));const sections=computed(()=>[...new Set(project.value.bars.map(b=>b.section))]);const chosenSection=ref('A');const majorKeys=MAJOR_KEYS;const minorKeys=MINOR_KEYS;
watch(project,scheduleAutosave,{deep:true});
function saveOnLeave(){if(libraryReady.value)void flushAutosave().catch(()=>{});}
onMounted(()=>{void initializeLocalLibrary();document.addEventListener('visibilitychange',saveIfHidden);window.addEventListener('pagehide',saveOnLeave);});
function saveIfHidden(){if(document.visibilityState==='hidden')saveOnLeave();}
onBeforeUnmount(()=>{document.removeEventListener('visibilitychange',saveIfHidden);window.removeEventListener('pagehide',saveOnLeave);stopPlayback();void flushAutosave().catch(()=>{});auditionSynth?.dispose();synth?.dispose();loopSynth?.dispose();});
function keyForSection(section:string){return sectionKey(project.value,section);}
function setSectionKey(section:string,event:Event){const value=(event.target as HTMLSelectElement).value;parseKeySignature(value);project.value.sectionKeys??=inferSectionKeys(project.value);project.value.sectionKeys[section]=value;message.value=`Section ${section}: key signature set to ${value}. Existing notes and chords are unchanged; MusicXML will show the new key.`;}
const violinTechniques:ViolinTechnique[]=['tango_staccato','pizzicato','arpeggio','pizzicato_arpeggio','double_stop','sustained','block'];const followTargets:FollowTarget[]=['independent','Piano','Violin I','Violin II','Bandoneon I'];const followMethods:FollowMethod[]=['exact','octave','adapt','rhythm'];
function violinSetting(inst:'Violin I'|'Violin II'):ViolinTechnique{return project.value.orchestration?.violin[chosenSection.value]?.[inst]??'tango_staccato';}
function setViolinSetting(inst:'Violin I'|'Violin II',event:Event){project.value.orchestration??=defaultOrchestration();project.value.orchestration.violin[chosenSection.value]??={};project.value.orchestration.violin[chosenSection.value][inst]=(event.target as HTMLSelectElement).value as ViolinTechnique;project.value.generatedScore=mergeScores(project.value,generate(project.value));}
function violinArpeggioDirection(inst:'Violin I'|'Violin II'):ArpeggioDirection{
  return project.value.violinArpeggioDirections?.[chosenSection.value]?.[inst]??'alternate';
}
function setViolinArpeggioDirection(inst:'Violin I'|'Violin II',event:Event){
  const direction=(event.target as HTMLSelectElement).value as ArpeggioDirection;
  if(!['up','down','alternate'].includes(direction))return;
  project.value.violinArpeggioDirections??={};
  project.value.violinArpeggioDirections[chosenSection.value]??={};
  project.value.violinArpeggioDirections[chosenSection.value][inst]=direction;
  project.value.generatedScore=mergeScores(project.value,generate(project.value));
}
function violinMarcatoText(inst:'Violin I'|'Violin II'):string{
  return violinMarcatoBeatsFor(project.value,chosenSection.value,inst).map(n=>n+1).join(',');
}
function setViolinMarcato(inst:'Violin I'|'Violin II',event:Event){
  const input=(event.target as HTMLInputElement).value.trim();
  const values=input?input.split(',').map(x=>Number(x.trim())):[];
  if(values.some(n=>!Number.isInteger(n)||n<1||n>project.value.beats)){
    message.value=`Use comma-separated beat numbers from 1 to ${project.value.beats}, or leave empty for no marcato.`;
    (event.target as HTMLInputElement).value=violinMarcatoText(inst);return;
  }
  project.value.violinMarcatoBeats??={};
  project.value.violinMarcatoBeats[chosenSection.value]??={};
  project.value.violinMarcatoBeats[chosenSection.value][inst]=[...new Set(values.map(n=>n-1))];
  project.value.generatedScore=mergeScores(project.value,generate(project.value));
  message.value=`${inst} in section ${chosenSection.value}: marcato on ${values.length?'beats '+values.join(', '):'no beats'}. Regenerate to merge protected edits.`;
}

function followSetting(inst:'Bandoneon I'|'Bandoneon II'){return project.value.orchestration?.bandoneon[chosenSection.value]?.[inst]??{target:(inst==='Bandoneon I'?'Violin II':'independent') as FollowTarget,method:'adapt' as FollowMethod};}
function setFollow(inst:'Bandoneon I'|'Bandoneon II',field:'target'|'method',event:Event){project.value.orchestration??=defaultOrchestration();project.value.orchestration.bandoneon[chosenSection.value]??={};project.value.orchestration.bandoneon[chosenSection.value][inst]={...followSetting(inst),[field]:(event.target as HTMLSelectElement).value};}
const roles:Role[]=['melody','harmony','chords','bass','fill','variation','rest'];const profiles=[['traditional','Traditional'],['darienzo',"D’Arienzo"],['disarli','Di Sarli'],['fresedo','Fresedo'],['troilo','Troilo'],['canaro','Canaro'],['pugliese','Pugliese']];
const difficulties:Difficulty[]=['easy','intermediate','advanced'];
const dynamicMarks:DynamicMark[]=['pp','p','mp','mf','f','ff'];
function ensureInstrumentSettings(){project.value.instrumentSettings??=defaultInstrumentSettings();}
function instrumentDifficulty(inst:Instrument):Difficulty{return project.value.instrumentSettings?.[inst]?.difficulty??project.value.difficulty??'intermediate';}
function setInstrumentDifficulty(inst:Instrument,e:Event){ensureInstrumentSettings();project.value.instrumentSettings![inst]??={};project.value.instrumentSettings![inst]!.difficulty=(e.target as HTMLSelectElement).value as Difficulty;}
function instrumentDynamicsOffset(inst:Instrument):number{return project.value.instrumentSettings?.[inst]?.dynamicsOffset??0;}
function setInstrumentDynamicsOffset(inst:Instrument,e:Event){ensureInstrumentSettings();project.value.instrumentSettings![inst]??={};project.value.instrumentSettings![inst]!.dynamicsOffset=Number((e.target as HTMLInputElement).value);}
function instrumentTarget(inst:Instrument):number{return Math.round((project.value.instrumentSettings?.[inst]?.activity??(inst==='Voice'?0:0.9))*100);}
function setInstrumentTarget(inst:Instrument,e:Event){ensureInstrumentSettings();project.value.instrumentSettings![inst]??={};project.value.instrumentSettings![inst]!.activity=Number((e.target as HTMLInputElement).value)/100;}
function toggleExpression(field:'enabled'|'crescendo',e:Event){project.value.expression??=defaultExpression();project.value.expression[field]=(e.target as HTMLInputElement).checked;}
function sectionDynamic():DynamicMark{return project.value.expression?.sections[chosenSection.value]??'mf';}
function setSectionDynamic(e:Event){project.value.expression??=defaultExpression();project.value.expression.sections[chosenSection.value]=(e.target as HTMLSelectElement).value as DynamicMark;}
function convertMeter(){try{project.value=convertTwoFourToFour(project.value);selectedBar.value=0;message.value='Converted paired 2/4 measures to 4/4; onset and durations preserved.';}catch(error){message.value=String(error);}}
function activitySummary(inst:Instrument){return Math.round(instrumentActivity(score.value,inst,project.value.bars.length,project.value.beats)*100);}
const articulationModes:Articulation[]=['auto','marcato_staccato','staccato','legato'];
function barArticulation(inst:Instrument):Articulation{return project.value.articulation?.overrides?.[`${inst}:${selectedBar.value}`]??'auto';}
function setBarArticulation(inst:Instrument,e:Event){project.value.articulation??=defaultArticulation();const key=`${inst}:${selectedBar.value}`;const value=(e.target as HTMLSelectElement).value as Articulation;if(value==='auto')delete project.value.articulation.overrides[key];else project.value.articulation.overrides[key]=value;}
function inferredArticulation(inst:Instrument):string{return measureArticulation(project.value,inst,selectedBar.value)??'not applicable';}
function setTranspose(e:Event){const n=Number((e.target as HTMLInputElement).value);if(Number.isInteger(n)&&n>=-24&&n<=24)project.value.transposeSemitones=n;}
// Song overview: measure-level overrides are sparse and do not replace section defaults.
const overviewInstrument=ref<Instrument>('Violin II');
const overviewStart=ref(1);
const overviewEnd=ref(8);
const overviewRole=ref<'inherit'|Role>('inherit');
const overviewArt=ref<Articulation>('auto');
const overviewTechnique=ref<'inherit'|ViolinTechnique>('inherit');
const overviewNotice=ref('');
const newSongOpen=ref(false);
const newSongTitle=ref('Untitled Tango');
const newSongSections=ref(5);
const newSongLengths=ref<number[]>([16,16,16,16,16]);
const newSongUniformLength=ref(16);
const newSongTotal=computed(()=>newSongLengths.value.reduce((total,length)=>total+(Number.isFinite(length)?length:0),0));
// Preserve custom section lengths when increasing or decreasing the number of sections.
watch(newSongSections,count=>{
  if(!Number.isInteger(count)||count<1||count>26)return;
  if(count>newSongLengths.value.length){
    newSongLengths.value=[...newSongLengths.value,...Array.from({length:count-newSongLengths.value.length},()=>16)];
  }else if(count<newSongLengths.value.length){
    newSongLengths.value=newSongLengths.value.slice(0,count);
  }
});
function setAllNewSongLengths(){
  const length=newSongUniformLength.value;
  if(!Number.isInteger(length)||length<1||length>128){message.value='Each section must contain 1–128 measures.';return;}
  if(newSongSections.value*length>512){message.value='A song can contain at most 512 measures.';return;}
  newSongLengths.value=newSongLengths.value.map(()=>length);
}

const newSongBeats=ref(4);
const newSongBpm=ref(124);
async function createBlankSong(){
  try{
    if(newSongLengths.value.length!==newSongSections.value)throw Error('Choose 1–26 sections');
    const fresh=blankProject({title:newSongTitle.value,sections:newSongSections.value,measuresPerSection:[...newSongLengths.value],beats:newSongBeats.value,bpm:newSongBpm.value});
    if(!window.confirm('Create a new blank song? Your current song will remain in the local library. You can also export a .tango backup.'))return;
    await flushAutosave();
    stopPlayback();
    await adoptLocalSong(fresh);
    selectedBar.value=0;overviewFocus.value=0;overviewStart.value=1;overviewEnd.value=Math.min(8,fresh.bars.length);
    overviewInstrument.value='Violin II';chosenSection.value='A';active.value='lead';
    chordEditorOpen.value=false;pending.value=[];newSongOpen.value=false;
    message.value=`Created ${newSongSections.value} sections (${fresh.bars.length} measures total). Enter chords and melody, then generate.`;
  }catch(error){message.value=`Cannot create blank song: ${String(error)}`;}
}
const copySourceIndex=ref(0);
const copyTargetIndex=ref(1);
const copyHarmonyFeedback=ref('');
const copySpans=computed(()=>sectionSpans(project.value));
function applySectionChordCopy(){
  try{
    const source=copySpans.value[copySourceIndex.value];
    const destination=copySpans.value[copyTargetIndex.value];
    if(!source||!destination||copySourceIndex.value===copyTargetIndex.value)
      throw Error('Select two different existing sections');
    const count=Math.min(source.measures,destination.measures);
    const overwritten=Array.from({length:count},(_,i)=>project.value.bars[destination.start+i].chord).filter(Boolean).length;
    const difference=source.measures!==destination.measures
      ?`\nSection lengths differ: only the first ${count} measures will be copied. Extra destination measures remain unchanged.`:'';
    const confirmation=`Copy ${count} measures of chords from section ${sectionLetter(copySourceIndex.value)} to ${sectionLetter(copyTargetIndex.value)}?\nThis replaces harmony in ${count} destination measures (${overwritten} currently have chords), including copying empty chord slots.${difference}\nMelody, keys and instrument settings are unaffected.`;
    if(!window.confirm(confirmation))return;
    const result=copySectionChords(project.value,copySourceIndex.value,copyTargetIndex.value);
    project.value=result.project;
    if(result.changed)refreshHarmonyPreview();
    const detail=result.sourceMeasures!==result.destinationMeasures
      ?` Different section lengths: ${result.copied} measures copied; remaining destination measures kept.`:'';
    copyHarmonyFeedback.value=`Copied chords ${sectionLetter(copySourceIndex.value)} → ${sectionLetter(copyTargetIndex.value)}: ${result.copied} measures, ${result.changed} changed.${detail}`;
    inlineHarmonyFeedback.value=copyHarmonyFeedback.value;
    message.value=copyHarmonyFeedback.value;
  }catch(error){copyHarmonyFeedback.value=`Copy failed: ${String(error)}`;message.value=copyHarmonyFeedback.value;}
}
const inlineHarmonyFeedback=ref('');
function refreshHarmonyPreview(){
  // Keep imported and manually edited instrument-measures when harmony changes.
  const protectedMeasures=Object.values(project.value.protectedBars??{}).some(Boolean);
  project.value.generatedScore=protectedMeasures?mergeScores(project.value,generate(project.value)):undefined;
}
const chordEditorOpen=ref(false);
const chordDraft=ref('');
function openChordEditor(i:number){
  if(i<0||i>=project.value.bars.length)return;
  selectedBar.value=i;overviewFocus.value=i;
  chordDraft.value=project.value.bars[i].chord;
  chordEditorOpen.value=true;
}
function applyChordEditor(){
  try{
    const events=parseChordSequence(chordDraft.value,project.value.beats);
    const normalized=events.map(e=>e.chord).join(',');
    project.value.bars[selectedBar.value].chord=normalized;
    refreshHarmonyPreview();
    message.value=normalized?`Measure ${selectedBar.value+1}: ${normalized}. Arrangement regenerated for preview; export uses the new harmony.`:`Measure ${selectedBar.value+1}: harmony cleared.`;
    overviewNotice.value=message.value;
    chordEditorOpen.value=false;
  }catch(error){message.value=`Chord entry rejected: ${String(error)}`;overviewNotice.value=message.value;}
}
/** Inline chord editing uses the same parser as the dialog. Invalid input never reaches the score. */
function commitInlineChord(i:number,event:Event):boolean{
  const input=event.target as HTMLInputElement;
  const original=project.value.bars[i]?.chord;
  if(original===undefined)return false;
  try{
    const normalized=parseChordSequence(input.value,project.value.beats).map(change=>change.chord).join(',');
    input.value=normalized;
    if(normalized===original)return true;
    project.value.bars[i].chord=normalized;
    refreshHarmonyPreview();
    inlineHarmonyFeedback.value=`Measure ${i+1}: ${normalized||'harmony cleared'} saved. The orchestral preview will use the updated harmony.`;
    message.value=inlineHarmonyFeedback.value;
    return true;
  }catch(error){
    input.value=original;
    inlineHarmonyFeedback.value=`Measure ${i+1}: ${String(error)}. Previous harmony retained.`;
    message.value=inlineHarmonyFeedback.value;
    return false;
  }
}
// Lead-sheet chord editing: one uninterrupted keyboard path across measures.
// The dropdown operates on the chord at the caret, never on the entire comma sequence.
const leadCompletion=ref<{measure:number;value:string;caret:number;visible:boolean;highlight:number}>({measure:-1,value:'',caret:0,visible:false,highlight:-1});
const leadSuggestions=computed(()=>leadCompletion.value.visible?chordCompletions(leadCompletion.value.value,leadCompletion.value.caret):[]);
function leadChordInput(i:number):HTMLInputElement|null{return document.querySelector<HTMLInputElement>(`input[data-lead-chord="${i}"]`);}
function syncLeadCompletion(i:number,input:HTMLInputElement,visible=true){
  leadCompletion.value={measure:i,value:input.value,caret:input.selectionStart??input.value.length,visible,highlight:-1};
}
function focusLeadChord(i:number,event:FocusEvent){
  selectLeadMeasure(i);
  syncLeadCompletion(i,event.target as HTMLInputElement,false);
}
function updateLeadChord(i:number,event:Event){syncLeadCompletion(i,event.target as HTMLInputElement,true);}
function closeLeadCompletion(i:number){if(leadCompletion.value.measure===i)leadCompletion.value.visible=false;}
function finishLeadChord(i:number,event:FocusEvent){
  // Programmatic completion does not necessarily emit a native change event.
  commitInlineChord(i,event);closeLeadCompletion(i);
}
function chooseLeadChord(i:number,suggestion:string){
  const input=leadChordInput(i);if(!input)return;
  const completed=completeChordToken(input.value,input.selectionStart??input.value.length,suggestion);
  input.value=completed.value;
  input.focus();input.setSelectionRange(completed.caret,completed.caret);
  syncLeadCompletion(i,input,false);
  commitInlineChord(i,{target:input} as unknown as Event);
  // Keep the same measure focused so a comma can introduce another chord.
}
function moveToLeadChord(i:number,direction:1|-1):boolean{
  const next=leadChordInput(i+direction);
  if(!next)return false;
  next.focus();next.select();
  return true;
}
function handleLeadChordKey(i:number,event:KeyboardEvent){
  const input=event.target as HTMLInputElement;
  if(event.key==='Tab'){
    const next=leadChordInput(i+(event.shiftKey?-1:1));
    if(!next)return; // Leave the lead-sheet grid normally at its ends.
    event.preventDefault();if(!commitInlineChord(i,event))return;closeLeadCompletion(i);
    next.focus();next.select();return;
  }
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    const matches=chordCompletions(input.value,input.selectionStart??input.value.length);
    if(!matches.length)return;
    event.preventDefault();
    const current=leadCompletion.value.measure===i?leadCompletion.value.highlight:-1;
    const highlight=event.key==='ArrowDown'?(current+1)%matches.length:(current<=0?matches.length-1:current-1);
    leadCompletion.value={measure:i,value:input.value,caret:input.selectionStart??input.value.length,visible:true,highlight};return;
  }
  if(event.key==='Enter'){
    event.preventDefault();
    const state=leadCompletion.value;
    if(state.measure===i&&state.visible&&state.highlight>=0&&leadSuggestions.value[state.highlight]){
      chooseLeadChord(i,leadSuggestions.value[state.highlight]);return;
    }
    if(!commitInlineChord(i,event))return;closeLeadCompletion(i);moveToLeadChord(i,1);return;
  }
  if(event.key==='Escape'){
    event.preventDefault();cancelInlineChord(i,event);closeLeadCompletion(i);return;
  }
}
function cancelInlineChord(i:number,event:Event){
  const input=event.target as HTMLInputElement;
  input.value=project.value.bars[i]?.chord??'';
  input.blur();
}
function selectLeadMeasure(i:number){
  selectedBar.value=i;
  chosenSection.value=project.value.bars[i].section;
  overviewFocus.value=i;
}
function chordBeatLabels(chord:string):string{
  try{return chord.trim()?Array.from({length:project.value.beats},(_,beat)=>chordAt(chord,project.value.beats,beat)).join(' · '):'No harmony yet';}catch{return 'Invalid harmony';}
}

const structureOpen=ref(false);
const sectionLengths=ref<number[]>([]);
const structureTotal=computed(()=>sectionLengths.value.reduce((a,b)=>a+b,0));
function editStructure(){sectionLengths.value=sectionSpans(project.value).map(s=>s.measures);structureOpen.value=true;}
function addSection(){if(sectionLengths.value.length<26)sectionLengths.value.push(16);}
function removeSection(){if(sectionLengths.value.length>1)sectionLengths.value.pop();}
function applyStructure(){
  try{
    const previous=sectionSpans(project.value);
    const deleting=previous.some((s,i)=>i>=sectionLengths.value.length||s.measures>sectionLengths.value[i]);
    const hasScores=Boolean(project.value.generatedScore||project.value.importedScore||project.value.baseScore||Object.values(project.value.protectedBars).some(Boolean)||project.value.expressionRanges?.length);
    const warning=(deleting?'Shortening/removing sections deletes the affected measures, including any melody and chords. ':'')+
      (hasScores?'Generated/imported scores, protected-measure flags and expression ranges will be cleared. ':'')+
      'Apply this song structure?';
    if((deleting||hasScores)&&!window.confirm(warning))return;
    const next=resizeSections(project.value,sectionLengths.value);
    project.value=next;selectedBar.value=Math.min(selectedBar.value,next.bars.length-1);overviewFocus.value=selectedBar.value;
    overviewStart.value=1;overviewEnd.value=Math.min(16,next.bars.length);
    chosenSection.value=next.bars[selectedBar.value].section;
    chordEditorOpen.value=false;structureOpen.value=false;
    message.value=`Updated structure: ${sectionLengths.value.length} sections, ${next.bars.length} measures. Generate orchestra again before exporting.`;
  }catch(error){message.value=`Structure update rejected: ${String(error)}`;}
}
const overviewFocus=ref(0);
const overviewInstruments=computed(()=>INSTRUMENTS.filter(inst=>inst!=='Voice'||project.value.roles[project.value.bars[0]?.section]?.Voice!=='rest'));
function effectiveRole(inst:Instrument,i:number):Role{return project.value.measureRoles?.[`${inst}:${i}`]??project.value.roles[project.value.bars[i]?.section]?.[inst]??'rest';}
function roleOverridden(inst:Instrument,i:number){return Object.prototype.hasOwnProperty.call(project.value.measureRoles??{},`${inst}:${i}`);}
function violinTechnique(inst:Instrument,i:number):ViolinTechnique|undefined{return inst.startsWith('Violin')?(project.value.measureViolinTechniques?.[`${inst}:${i}`]??project.value.orchestration?.violin?.[project.value.bars[i].section]?.[inst as 'Violin I'|'Violin II']??'tango_staccato'):undefined;}
function articulationOverride(inst:Instrument,i:number):Articulation{return project.value.articulation?.overrides?.[`${inst}:${i}`]??'auto';}
function cellArticulation(inst:Instrument,i:number):string{if(inst.startsWith('Violin')&&effectiveRole(inst,i)==='chords'&&!project.value.articulation?.overrides?.[`${inst}:${i}`]&&['tango_staccato','pizzicato'].includes(violinTechnique(inst,i)??'')){const beats=violinMarcatoBeatsFor(project.value,project.value.bars[i].section,inst as 'Violin I'|'Violin II').map(n=>n+1);return `${violinTechnique(inst,i)==='pizzicato'?'Pizz.':'Stacc.'}${beats.length?' ^'+beats.join(','):''}`;}const mode=measureArticulation(project.value,inst,i);return mode==='marcato_staccato'?'Marc.':mode==='staccato'?'Stacc.':mode==='legato'?(inst.startsWith('Violin')?'Arco':'Legato'):'—';}
function cellLabel(inst:Instrument,i:number):string{const role=effectiveRole(inst,i);const tech=violinTechnique(inst,i);return role==='chords'&&inst==='Piano'?(project.value.pianoFigures?.[project.value.bars[i].section]??'chords_up').replaceAll('_',' '):role==='chords'&&tech?tech.replaceAll('_',' '):role;}
function focusOverview(inst:Instrument,i:number){overviewInstrument.value=inst;overviewFocus.value=i;overviewStart.value=i+1;overviewEnd.value=i+1;selectedBar.value=i;chosenSection.value=project.value.bars[i].section;overviewRole.value=project.value.measureRoles?.[`${inst}:${i}`]??'inherit';overviewArt.value=articulationOverride(inst,i);overviewTechnique.value=project.value.measureViolinTechniques?.[`${inst}:${i}`]??'inherit';}
/** The map's single click edits orchestration; a double click or Enter opens exact notes. */
function openMapCellNotes(inst:Instrument,i:number){focusOverview(inst,i);openNoteEditor(inst,i);}
function returnToMap(){
  const inst=noteInst.value,i=selectedBar.value;
  focusOverview(inst,i);active.value='overview';
  void nextTick(()=>document.querySelector<HTMLButtonElement>(`.song-cell[data-map-measure="${i}"][data-map-instrument="${inst}"]`)?.focus());
}
/** Keyboard shortcuts are active only in the note editor, never inside editable controls. */
function handleNoteEditorKey(event:KeyboardEvent){
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey||event.defaultPrevented)return;
  const target=event.target as HTMLElement|null;
  if(target?.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(event.key==='Escape'){event.preventDefault();returnToMap();}
  else if(event.key==='['&&selectedBar.value>0){event.preventDefault();openNoteEditor(noteInst.value,selectedBar.value-1);}
  else if(event.key===']'&&selectedBar.value<project.value.bars.length-1){event.preventDefault();openNoteEditor(noteInst.value,selectedBar.value+1);}
  else if(event.key==='l'){event.preventDefault();void toggleNoteLoop();}
}
function focusLeadMelody(i:number){
  selectLeadMeasure(i);
  void nextTick(()=>document.querySelector<HTMLTextAreaElement>('[data-lead-melody]')?.focus());
}
function applyOverviewRange(){const start=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(overviewStart.value)-1)),end=Math.max(start,Math.min(project.value.bars.length-1,Math.floor(overviewEnd.value)-1));if(!Number.isFinite(start)||!Number.isFinite(end)){overviewNotice.value='Invalid measure range';return;}project.value.measureRoles??={};project.value.measureViolinTechniques??={};project.value.articulation??=defaultArticulation();for(let i=start;i<=end;i++){const key=`${overviewInstrument.value}:${i}`;if(overviewRole.value==='inherit')delete project.value.measureRoles[key];else project.value.measureRoles[key]=overviewRole.value;if(overviewArt.value==='auto')delete project.value.articulation.overrides[key];else if(overviewInstrument.value.startsWith('Violin')||overviewInstrument.value.startsWith('Bandoneon'))project.value.articulation.overrides[key]=overviewArt.value;if(overviewInstrument.value.startsWith('Violin')){if(overviewTechnique.value==='inherit')delete project.value.measureViolinTechniques[key];else project.value.measureViolinTechniques[key]=overviewTechnique.value;}}
project.value.generatedScore=undefined;overviewNotice.value=`Applied settings to ${overviewInstrument.value}, measures ${start+1}–${end+1}. The preview now uses regenerated notes; protected imported measures are unchanged when using Generate orchestra.`;selectedBar.value=start;}
function applyOverviewSection(){const index=project.value.bars.findIndex(b=>b.section===chosenSection.value);const positions=project.value.bars.map((b,i)=>b.section===chosenSection.value?i:-1).filter(i=>i>=0);if(index<0||!positions.length)return;const begin=Math.min(...positions),finish=Math.max(...positions);if(positions.length!==finish-begin+1){overviewNotice.value='Section is non-contiguous. Select a measure range instead.';return;}overviewStart.value=begin+1;overviewEnd.value=finish+1;applyOverviewRange();}
const bar=computed(()=>project.value.bars[selectedBar.value]);const melodyString=computed(()=>bar.value.melody.map(n=>`${midiName(n.pitch)}:${n.duration}@${n.start}`).join(' '));const melodyText=ref('');watch(selectedBar,()=>melodyText.value=melodyString.value,{immediate:true});watch(()=>project.value.bars[selectedBar.value]?.melody,()=>melodyText.value=melodyString.value,{deep:true});
function setMelody(){const notes:Note[]=[];const tokens=melodyText.value.trim().split(/\s+/).filter(Boolean);let next=0;for(const token of tokens){const m=token.match(/^([A-Ga-g][#b]?-?\d+)(?::([\d.]+))?(?:@([\d.]+))?$/);if(!m){message.value=`Invalid note: ${token}. Example: D5:1@0`;return;}const pitch=parsePitch(m[1]);if(pitch===null)continue;const duration=Number(m[2]??1),start=m[3]===undefined?next:Number(m[3]);if(!Number.isFinite(duration)||duration<=0||start<0||start+duration>project.value.beats+0.00001){message.value=`Invalid timing: ${token}`;return;}notes.push({pitch,start,duration});next=start+duration;}bar.value.melody=notes;message.value=`Updated melody in bar ${selectedBar.value+1}. Regenerate to apply.`;}
function regenerate(){const fresh=generate(project.value);project.value.generatedScore=mergeScores(project.value,fresh);message.value=`Generated ${scoreStats(project.value.generatedScore)} notes across ${INSTRUMENTS.length} parts. Protected measures retained.`;}
function setRole(inst:Instrument,e:Event){const sec=chosenSection.value;project.value.roles[sec]??={};project.value.roles[sec][inst]=(e.target as HTMLSelectElement).value as Role;}
function setProtected(inst:Instrument,b:number,v:boolean){project.value.protectedBars[`${inst}:${b}`]=v;}
function exportXml(){try{const xml=exportMusicXml(project.value,score.value);const problems=validateMusicXmlDurations(xml,project.value.beats);if(problems.length){message.value='MusicXML validation failed: '+problems.slice(0,3).join('; ');return;}download(xml,`${project.value.title.replace(/[^a-z0-9-]+/gi,'-')}.musicxml`,'application/vnd.recordare.musicxml+xml');message.value='MusicXML exported; all instrument-measures passed rhythmic validation.';}catch(err){message.value=`Export failed: ${String(err)}`;}}
async function importFile(e:Event){const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;try{if(file.name.endsWith('.tango')){await flushAutosave();const imported=await loadProject(file);await adoptLocalSong(imported);structureOpen.value=false;message.value='Portable project imported as a separate local song.';}else if(file.name.endsWith('.mid')||file.name.endsWith('.midi')){pending.value=importMidi(await file.arrayBuffer());importMode.value='melody';message.value=`Found ${pending.value.length} MIDI tracks. Choose the melody track.`;}else{const result=importMusicXml(await file.text());pending.value=result.parts;if(importMode.value==='melody'){if(result.chords.length)result.chords.forEach((c,i)=>{if(project.value.bars[i])project.value.bars[i].chord=c;});if(result.keys.length){project.value.sectionKeys??={};const assigned=new Set<string>();result.keys.forEach((key,i)=>{const sec=project.value.bars[i]?.section;if(sec&&!assigned.has(sec)){project.value.sectionKeys![sec]=key;assigned.add(sec);}});}project.value.generatedScore=undefined;}message.value=`Found ${result.parts.length} MusicXML parts. Choose a melody track or import edited score.`;}}catch(err){message.value=`Import failed: ${String(err)}`;}finally{(e.target as HTMLInputElement).value='';}}
function applyImport(){if(!pending.value.length)return;if(importMode.value==='melody'){const notes=pending.value[selectedTrack.value]?.notes??[];const needed=Math.ceil((Math.max(0,...notes.map(n=>n.start+n.duration)))/project.value.beats);while(project.value.bars.length<needed)project.value.bars.push({chord:'',melody:[],section:project.value.bars.at(-1)?.section??'A'});project.value.bars.forEach((b,i)=>b.melody=notes.filter(n=>Math.floor(n.start/project.value.beats)===i).map(n=>({...n,start:n.start-i*project.value.beats})));message.value=`Imported ${notes.length} melody notes. Set chords and sections, then generate.`;}else{project.value.importedScore=transposeScore(scoreFromParts(pending.value),-(project.value.transposeSemitones??0));let count=0;for(const inst of INSTRUMENTS)for(let b=0;b<project.value.bars.length;b++){const old=(project.value.generatedScore?.[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===b).map(n=>[n.pitch,n.start,n.duration]);const incoming=(project.value.importedScore[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===b).map(n=>[n.pitch,n.start,n.duration]);if(JSON.stringify(old)!==JSON.stringify(incoming)){setProtected(inst,b,true);count++;}}message.value=`Imported edited score; ${count} instrument-measures marked protected. Review before regenerating.`;}pending.value=[];}
let synth:PolySynth|null=null;
async function play(){
  if(playing.value){stopPlayback();return;}
  stopPlayback();
  const session=noteLoopSession;
  try{
    Tone=await startAudioFromGesture();
    if(session!==noteLoopSession)return;
    synth??=new Tone.PolySynth(Tone.Synth).toDestination();
    const transport=Tone.getTransport();transport.stop();transport.cancel();transport.bpm.value=project.value.bpm;
    for(const inst of INSTRUMENTS){if(inst==='Voice')continue;for(const n of score.value[inst]??[]){
      const seconds=n.start*60/project.value.bpm;
      transport.schedule(time=>{
        const barIndex=Math.floor(n.start/project.value.beats);
        const event=measureLoopEvents([n],barIndex,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,project.value.expressionRanges??[],inst)[0];
        const defaultDuration=noteSoundingDuration(n)*60/project.value.bpm;
        const defaultVelocity=noteSoundingVelocity(n);
        if(!event)return;
        if(event.slideTo!==undefined||event.endVelocity!==undefined)
          playExpressiveEvent(Tone.getContext().rawContext as AudioContext,event,time);
        else synth?.triggerAttackRelease(Tone.Frequency(event.pitch,'midi').toFrequency(),event.durationSeconds||defaultDuration,time,(event.velocity||defaultVelocity)/127);
      },seconds);
    }}
    transport.scheduleOnce(()=>{playing.value=false;transport.stop();synth?.releaseAll();},project.value.bars.length*project.value.beats*60/project.value.bpm+0.2);
    transport.start();playing.value=true;
  }catch(error){message.value=`Playback unavailable: ${String(error)}`;stopPlayback();}
}
// A dedicated measure loop shares the Tone transport with full-score playback;
// the two modes are mutually exclusive. Note edits are read fresh on each pass.
const noteLoopPlaying=ref(false);
const noteLoopBeat=ref(-1);
let noteLoopSession=0;
let loopSynth:PolySynth|null=null;
function stopNoteLoop(){if(noteLoopPlaying.value)stopPlayback();else noteLoopSession++;}
async function toggleNoteLoop(){
  if(noteLoopPlaying.value){stopNoteLoop();return;}
  stopPlayback();
  const session=noteLoopSession;
  try{
    Tone=await startAudioFromGesture();
    if(session!==noteLoopSession||active.value!=='notes')return;
    loopSynth??=new Tone.PolySynth(Tone.Synth).toDestination();
    loopSynth.volume.value=-9;
    const transport=Tone.getTransport();
    transport.stop();transport.cancel();transport.position=0;
    transport.timeSignature=project.value.beats;
    transport.bpm.value=project.value.bpm;
    transport.scheduleRepeat(time=>{
      // Read the current score at the start of every loop, not when Play was clicked.
      const events=measureLoopEvents(score.value[noteInst.value]??[],selectedBar.value,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,project.value.expressionRanges??[],noteInst.value);
      for(const event of events){
        if(event.slideTo!==undefined||event.endVelocity!==undefined)
          playExpressiveEvent(Tone.getContext().rawContext as AudioContext,event,time+event.onsetSeconds);
        else loopSynth?.triggerAttackRelease(Tone.Frequency(event.pitch,'midi').toFrequency(),event.durationSeconds,time+event.onsetSeconds,event.velocity/127);
      }
    },'1m',0);
    let beat=0;
    transport.scheduleRepeat(time=>{
      const current=beat%project.value.beats;beat++;
      Tone.getDraw().schedule(()=>{if(session===noteLoopSession&&noteLoopPlaying.value)noteLoopBeat.value=current;},time);
    },'4n',0);
    noteLoopPlaying.value=true;
    transport.start();
  }catch(error){message.value=`Measure loop unavailable: ${String(error)}. Check browser audio permissions.`;stopPlayback();}
}
watch(active,tab=>{if(tab!=='notes'&&noteLoopPlaying.value)stopNoteLoop();});
watch(()=>project.value.bpm,bpm=>{if(noteLoopPlaying.value&&Number.isFinite(bpm)&&bpm>0)Tone.getTransport().bpm.value=bpm;});
watch(()=>project.value.beats,()=>{if(noteLoopPlaying.value)stopNoteLoop();});
// Note audition is user-gesture initiated (browser audio policy); independent of playback.
const auditionEnabled=ref(true);
let auditionSynth:Synth|null=null;
async function auditionPitch(pitch:number,velocity=85,durationSeconds=0.24){
  if(!auditionEnabled.value)return;
  try{
    Tone=await startAudioFromGesture();
    if(!auditionSynth){
      auditionSynth=new Tone.Synth({oscillator:{type:'triangle'},envelope:{attack:0.008,decay:0.09,sustain:0.22,release:0.16}}).toDestination();
      auditionSynth.volume.value=-11;
    }
    const transposed=Math.max(0,Math.min(127,pitch+(project.value.transposeSemitones??0)));
    auditionSynth.triggerAttackRelease(Tone.Frequency(transposed,'midi').toFrequency(),Math.max(0.025,durationSeconds),undefined,Math.max(0.1,Math.min(1,velocity/127)));
  }catch(error){message.value=`Note preview unavailable: ${String(error)}. Check browser audio permissions.`;}
}
function auditionEvent(note:Note){
  if(!auditionEnabled.value)return;
  if(note.slideTo!==undefined||note.swellTo!==undefined){
    void startAudioFromGesture().then(tone=>{Tone=tone;playExpressiveEvent(Tone.getContext().rawContext as AudioContext,{
      pitch:note.pitch+(project.value.transposeSemitones??0),
      slideTo:note.slideTo===undefined?undefined:note.slideTo+(project.value.transposeSemitones??0),
      durationSeconds:Math.max(0.025,noteSoundingDuration(note)*60/project.value.bpm),
      velocity:noteSoundingVelocity(note),endVelocity:note.swellTo
    },Tone.now());}).catch(error=>{message.value=`Expressive audition unavailable: ${String(error)}`;});
  }else void auditionPitch(note.pitch,noteSoundingVelocity(note),noteSoundingDuration(note)*60/project.value.bpm);
}
function selectNoteEvent(i:number){noteSelected.value=i;const note=noteMeasure.value[i];if(note)auditionEvent(note);}
// Click-to-edit, beat-aligned piano roll. Notes remain concert pitch internally.
const figureChoice=ref<FigureKind>('notes_up');
const figureVariation=ref(0);
const figurePreviewKey=ref('');
const figureLabels:Record<FigureKind,string>={notes_up:'Single notes ↑',notes_down:'Single notes ↓',chords_up:'Rising chord inversions ↑',chords_down:'Falling chord inversions ↓',countermelody:'Countermelody',melody_response:'Melody response'};
function applyFigure(advance=false){
  const key=`${noteInst.value}:${selectedBar.value}`;
  if(project.value.protectedBars[key]&&figurePreviewKey.value!==key&&
    !window.confirm(`Replace manually protected ${noteInst.value}, measure ${selectedBar.value+1}, with a new figure?`))return;
  const nextVariation=advance?(figureVariation.value+1)%100:figureVariation.value;
  try{
    const events=figureMeasure(project.value,noteInst.value,selectedBar.value,figureChoice.value,nextVariation);
    if(!events.length){message.value='Enter harmony in the Lead Sheet before generating a figure.';return;}
    project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
    figureVariation.value=nextVariation;figurePreviewKey.value=key;noteSelected.value=-1;
    message.value=`${figureLabels[figureChoice.value]} · variation ${nextVariation+1} · ${noteInst.value} measure ${selectedBar.value+1}. This measure is now protected.`;
  }catch(error){message.value=`Figure generation failed: ${String(error)}`;}
}
function cycleFigure(direction=1){const i=FIGURE_KINDS.indexOf(figureChoice.value);figureChoice.value=FIGURE_KINDS[(i+direction+FIGURE_KINDS.length)%FIGURE_KINDS.length];applyFigure();}
function pianoFigureForSection(){return project.value.pianoFigures?.[chosenSection.value]??'chords_up';}
function setPianoFigure(e:Event){project.value.pianoFigures??={};project.value.pianoFigures[chosenSection.value]=(e.target as HTMLSelectElement).value as FigureKind;project.value.generatedScore=mergeScores(project.value,generate(project.value));}
function nextPianoFigureVariation(){project.value.pianoFigureVariation??={};project.value.pianoFigureVariation[chosenSection.value]=((project.value.pianoFigureVariation[chosenSection.value]??0)+1)%100;project.value.generatedScore=mergeScores(project.value,generate(project.value));}
const expressionStart=ref(1),expressionEnd=ref(1),expressionStartBeat=ref(1),expressionEndBeat=ref(4),expressionFrom=ref(55),expressionTo=ref(105);
function addExpressionRange(){
  const start=expressionStart.value-1,end=expressionEnd.value-1,startBeat=expressionStartBeat.value-1,endBeat=expressionEndBeat.value;
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<start||end>=project.value.bars.length||!Number.isFinite(startBeat)||!Number.isFinite(endBeat)||startBeat<0||startBeat>=project.value.beats||endBeat<=0||endBeat>project.value.beats||Math.abs(startBeat*4-Math.round(startBeat*4))>1e-7||Math.abs(endBeat*4-Math.round(endBeat*4))>1e-7||(end*project.value.beats+endBeat<=start*project.value.beats+startBeat)||
     ![expressionFrom.value,expressionTo.value].every(n=>Number.isInteger(n)&&n>=1&&n<=127)){
    message.value='Expression range needs ordered measure numbers and velocities from 1 to 127.';return;
  }
  project.value.expressionRanges??=[];
  project.value.expressionRanges.push({instrument:noteInst.value,startMeasure:start,endMeasure:end,startBeat,endBeat,from:expressionFrom.value,to:expressionTo.value});
  message.value=`Added ${expressionFrom.value<expressionTo.value?'crescendo':'decrescendo'} for ${noteInst.value}, measures ${start+1}–${end+1}.`;
}
function removeExpressionRange(index:number){project.value.expressionRanges?.splice(index,1);}
const currentExpressionRanges=computed(()=>project.value.expressionRanges?.map((r,index)=>({...r,index})).filter(r=>r.instrument===noteInst.value)??[]);
const slideSupported=computed(()=>noteInst.value!=='Piano'&&selectedEvent.value?.technique!=='pizzicato');
const noteInst=ref<Instrument>('Violin I');
const noteEditorRegion=ref<HTMLElement|null>(null);
const noteStep=ref(0.5);
const noteLength=ref(1);
const newNoteArticulation=ref<'inherit'|'staccato'|'marcato_staccato'|'legato'>('inherit');
const editorAccidentals=ref<'auto'|'sharp'|'flat'>('auto');
const noteCenter=ref(72);
const pianoTrebleCenter=ref(73);
const pianoBassCenter=ref(49);
const pianoSplit=computed({
  get:()=>project.value.pianoSplitPitch??60,
  set:(pitch:number)=>{project.value.pianoSplitPitch=Math.max(48,Math.min(72,Math.round(pitch)));}
});
const noteSelected=ref(-1);
const noteCtx=computed(()=>noteEditorContext(project.value,noteInst.value,selectedBar.value));
const noteMeasure=computed(()=>[...(score.value[noteInst.value]??[])]
  .filter(n=>Math.floor((n.start+1e-7)/project.value.beats)===selectedBar.value)
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch));
const noteBeats=computed(()=>Array.from({length:Math.round(project.value.beats/noteStep.value)},(_,i)=>Number((i*noteStep.value).toFixed(4))));
function pitchWindow(lo:number,hi:number,center:number):number[]{
  if(lo>hi)return [];
  const size=Math.min(18,hi-lo+1);
  const start=Math.max(lo,Math.min(hi-size+1,Math.round(center)-Math.floor(size/2)));
  return Array.from({length:size},(_,i)=>start+size-1-i);
}
const noteRows=computed(()=>{
  const [lo,hi]=instrumentRange(noteInst.value);
  return pitchWindow(lo,hi,noteCenter.value);
});
const noteStaffViews=computed(()=>{
  if(noteInst.value!=='Piano')return [{id:'single',label:'Piano roll',clef:'',pitches:noteRows.value}];
  const [lo,hi]=instrumentRange('Piano');
  return [
    {id:'treble',label:'Right hand · upper staff',clef:'Treble clef (G)',pitches:pitchWindow(Math.max(lo,pianoSplit.value),hi,pianoTrebleCenter.value)},
    {id:'bass',label:'Left hand · lower staff',clef:'Bass clef (F)',pitches:pitchWindow(lo,Math.min(hi,pianoSplit.value-1),pianoBassCenter.value)}
  ];
});
function shiftPianoRegister(staff:'treble'|'bass',semitones:number){
  const [lo,hi]=instrumentRange('Piano');
  if(staff==='treble')pianoTrebleCenter.value=Math.max(Math.max(lo,pianoSplit.value)+8,Math.min(hi-8,pianoTrebleCenter.value+semitones));
  else pianoBassCenter.value=Math.max(lo+8,Math.min(Math.min(hi,pianoSplit.value-1)-8,pianoBassCenter.value+semitones));
}
const selectedEvent=computed(()=>noteMeasure.value[noteSelected.value]);
function openNoteEditor(inst:Instrument=overviewInstrument.value,b:number=selectedBar.value){
  stopNoteLoop();
  const arrivingFromAnotherView=active.value!=='notes';
  noteInst.value=inst;selectedBar.value=Math.max(0,Math.min(project.value.bars.length-1,b));
  overviewFocus.value=selectedBar.value;
  const range=instrumentRange(inst);
  const existing=(score.value[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===selectedBar.value);
  const typical=inst==='Contrabass'?43:inst==='Piano'?61:inst==='Violin I'?76:inst==='Violin II'?69:inst.startsWith('Bandoneon')?67:72;
  noteCenter.value=Math.max(range[0]+9,Math.min(range[1]-8,existing.length?Math.round(existing.reduce((sum,n)=>sum+n.pitch,0)/existing.length):typical));
  if(inst==='Piano'){
    const treble=existing.filter(n=>pianoStaffForPitch(n.pitch,pianoSplit.value)===1);
    const bass=existing.filter(n=>pianoStaffForPitch(n.pitch,pianoSplit.value)===2);
    pianoTrebleCenter.value=treble.length?Math.round(treble.reduce((sum,n)=>sum+n.pitch,0)/treble.length):73;
    pianoBassCenter.value=bass.length?Math.round(bass.reduce((sum,n)=>sum+n.pitch,0)/bass.length):49;
  }
  noteSelected.value=-1;figurePreviewKey.value='';
  expressionStart.value=selectedBar.value+1;expressionEnd.value=selectedBar.value+1;expressionStartBeat.value=1;expressionEndBeat.value=project.value.beats;
  noteStep.value=instrumentDifficulty(inst)==='easy'?1:instrumentDifficulty(inst)==='advanced'?0.25:0.5;
  noteLength.value=noteEditorContext(project.value,inst,selectedBar.value).role==='chords'&&!inst.startsWith('Violin')?0.5:1;
  newNoteArticulation.value='inherit';
  active.value='notes';
  if(arrivingFromAnotherView)void nextTick(()=>noteEditorRegion.value?.focus());
}
function pitchClass(pitch:number,beat:number){return noteEditorPitchClass(project.value,noteInst.value,selectedBar.value,beat,pitch);}
/** Color conveys harmonic context, never permission to enter a pitch. */
function displayPitch(pitch:number){
  const accidentals=editorAccidentals.value==='auto'
    ?(parseKeySignature(noteCtx.value.key).fifths<0?'flat':'sharp')
    :editorAccidentals.value;
  return editorPitchName(pitch,accidentals);
}
function noteAt(pitch:number,beat:number){return noteMeasure.value.findIndex(n=>n.pitch===pitch&&Math.abs(n.start-selectedBar.value*project.value.beats-beat)<0.00001);}
function toggleNote(pitch:number,beat:number){
  const index=noteAt(pitch,beat);
  const events=noteMeasure.value.map(n=>({...n}));
  if(index>=0){auditionEvent(events[index]);events.splice(index,1);noteSelected.value=-1;}
  else{
    const added=suggestedEditorNote(project.value,noteInst.value,selectedBar.value,beat,pitch,noteLength.value);
    if(newNoteArticulation.value!=='inherit'){
      added.articulation=newNoteArticulation.value;
      added.accent=newNoteArticulation.value==='marcato_staccato';
      // An explicit articulation choice replaces the generated default gate.
      delete added.gate;
    }
    auditionEvent(added);events.push(added);
  }
  project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
  if(index<0)noteSelected.value=noteMeasure.value.findIndex(n=>n.pitch===pitch&&Math.abs(n.start-selectedBar.value*project.value.beats-beat)<0.00001);
  message.value=`${noteInst.value} · measure ${selectedBar.value+1}: ${index>=0?'removed':'added'} ${displayPitch(pitch)} at beat ${beat+1}. Manual measure protected.`;
}
function updateSelectedNote(field:'pitch'|'start'|'duration'|'velocity'|'articulation'|'technique'|'gate'|'slideTo'|'swellTo',raw:string){
  if(!selectedEvent.value)return;
  const events=noteMeasure.value.map(n=>({...n}));const index=noteSelected.value;const old=events[index];
  let value:number|string=raw;
  if(['pitch','start','duration','velocity','gate','slideTo','swellTo'].includes(field)&&raw!=='inherit')value=Number(raw);
  if(field==='gate')value=(value as number)/100;
  if(field==='start')value=selectedBar.value*project.value.beats+(value as number);
  const next={...old,[field]:value};
  if(field==='articulation'){
    if(raw==='inherit')delete next.articulation;
    next.accent=raw==='marcato_staccato';
  }
  if(field==='technique'&&raw==='inherit')delete next.technique;
  if(field==='slideTo'&&raw==='inherit')delete next.slideTo;
  if(field==='swellTo'&&raw==='inherit')delete next.swellTo;
  try{
    if(field==='velocity'&&(!Number.isInteger(value)||Number(value)<1||Number(value)>127))throw Error('Velocity must be 1–127');
    if(field==='gate'&&(!Number.isFinite(value)||Number(value)<=0||Number(value)>1))throw Error('Sounding length must be 1–100%');
    project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events.map((n,i)=>i===index?next:n));
    const id=noteMeasure.value.findIndex(n=>n.pitch===next.pitch&&Math.abs(n.start-next.start)<1e-8);
    noteSelected.value=id;
    if(['pitch','articulation','gate','velocity','slideTo','swellTo'].includes(field))auditionEvent(next);
  }catch(error){message.value=`Note edit rejected: ${String(error)}`;}
}
function deleteSelectedNote(){if(!selectedEvent.value)return;const events=noteMeasure.value.filter((_,i)=>i!==noteSelected.value);project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);noteSelected.value=-1;}
function clearNoteMeasure(){project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,[]);noteSelected.value=-1;message.value=`Cleared and protected ${noteInst.value} measure ${selectedBar.value+1}.`;}
function restoreNoteMeasure(){project.value=resetInstrumentMeasure(project.value,noteInst.value,selectedBar.value);noteSelected.value=-1;message.value=`Restored generated ${noteInst.value} measure ${selectedBar.value+1}; other protected measures retained.`;}
const currentNotes=computed(()=>INSTRUMENTS.map(inst=>({inst,notes:(score.value[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===selectedBar.value)})));
function addBar(){const previous=project.value.bars.at(-1);project.value.bars.push({chord:previous?.chord??'',melody:[],section:previous?.section??'A'});selectedBar.value=project.value.bars.length-1;}
function changeSection(e:Event){bar.value.section=(e.target as HTMLSelectElement).value;}
function addArrastre(){const inst:'Piano'='Piano';const b=selectedBar.value,offset=b*project.value.beats;const notes=[...(project.value.generatedScore??generate(project.value))[inst]];const at=offset+Math.min(2,project.value.beats-1);const target=notes.find(n=>n.start>=at)?.pitch??60;notes.push({pitch:target-2,start:at-0.5,duration:0.25,source:'manual'},{pitch:target-1,start:at-0.25,duration:0.25,source:'manual'});project.value.generatedScore={...(project.value.generatedScore??generate(project.value)),[inst]:notes};message.value=`Added a simple notated piano lead-in in measure ${b+1}. This is a prototype gesture, not yet an idiomatic arrastre model.`;}
</script>
<template>
<div class="shell"><header><div class="brand"><span class="logo">𝄞</span><div><strong>Tango Arranger</strong><small>Orquesta típica workbench · v{{appVersion}}</small></div></div><div class="header-actions"><button class="secondary" @click="newSongOpen=!newSongOpen">+ New blank song</button><button class="secondary" @click="saveProject(project)">↓ Export .tango backup</button><button class="primary" @click="exportXml">↓ Export MusicXML</button></div></header>
<div class="layout"><aside><div class="eyebrow">PROJECT</div><label>Title<input v-model="project.title"/></label><div class="two"><label>Tempo<input v-model.number="project.bpm" type="number" min="40" max="240"/></label><label>Beats / bar<input v-model.number="project.beats" type="number" min="2" max="4"/></label></div><label>Transpose entire arrangement (semitones)<input type="number" min="-24" max="24" step="1" :value="project.transposeSemitones??0" @change="setTranspose"/><small class="hint">Non-destructive concert-pitch shift: playback, score review, chords and MusicXML change together. Original lead sheet remains intact.</small></label><label>Orchestra profile<select v-model="project.profile"><option v-for="[id,name] in profiles" :key="id" :value="id">{{name}}</option></select></label><label>Overall difficulty<select v-model="project.difficulty"><option v-for="d in difficulties" :key="d" :value="d">{{d}}</option></select></label><button class="secondary" @click="convertMeter" :disabled="project.beats!==2">Convert paired 2/4 bars to 4/4</button><div class="divider"></div><div class="eyebrow">LOCAL SONG LIBRARY</div>
<label>Open a saved song<select :value="localSongId" :disabled="!libraryReady" @change="openLocalSong(($event.target as HTMLSelectElement).value)"><option v-for="song in localSongs" :key="song.id" :value="song.id">{{song.title}} · {{song.measures}} bars · {{new Date(song.updatedAt).toLocaleString()}}</option></select></label>
<div class="local-song-actions"><button class="secondary" :disabled="!libraryReady" @click="saveNow">Save now</button><button class="secondary" :disabled="!libraryReady" @click="duplicateLocalSong">Duplicate song</button><button class="secondary danger" :disabled="!libraryReady" @click="deleteCurrentLocalSong">Delete song</button></div>
<p class="local-save-status" role="status">{{saveStatus}}</p><p class="hint">Changes are saved automatically in this browser, including unnamed songs and manual note edits. Browser storage can be cleared; export .tango backups for safekeeping. Local songs do not sync between devices.</p>
<div class="divider"></div><div class="eyebrow">IMPORT & ROUND TRIP</div><label class="file-picker">↑ Import .tango / .musicxml / .mid<input type="file" accept=".tango,.xml,.musicxml,.mid,.midi" @change="importFile" hidden/></label><div v-if="pending.length" class="import-panel"><label>Import as<select v-model="importMode"><option value="melody">Melody only</option><option value="score">Edited full score</option></select></label><label v-if="importMode==='melody'">Track<select v-model.number="selectedTrack"><option v-for="(track,i) in pending" :key="i" :value="i">{{track.name}} ({{track.notes.length}} notes)</option></select></label><button class="primary" @click="applyImport">Apply import</button></div><p class="hint">After editing in MuseScore, export MusicXML and import it here as “Edited full score”. Changed measures will be protected.</p><div class="divider"></div><div class="eyebrow">PLAYBACK</div><button class="play" @click="play">{{playing?'■ Stop':'▶ Play arrangement'}}</button><p class="hint">Basic synthesized playback, not authentic tango instrument sounds.</p></aside>
<main><div v-if="newSongOpen" class="editor" role="region" aria-label="Create blank song">
  <div class="section-heading"><h2>New blank song</h2><button type="button" class="secondary" @click="newSongOpen=false">Cancel</button></div>
  <p class="muted">Start with an empty lead sheet: no demo melody, no chord symbols and no generated accompaniment. Default: five sections (A–E), each with sixteen measures. Set each section length before creating the song; the alphabetical section labels also appear as MuseScore rehearsal marks.</p>
  <div class="two"><label>Song title<input v-model="newSongTitle" placeholder="Untitled Tango"/></label><label>Number of sections (A, B, C…)<input v-model.number="newSongSections" type="number" min="1" max="26"/></label></div>
  <div class="new-song-section-heading"><strong>Measures in each section</strong><span>{{newSongTotal}} measures total · {{newSongLengths.length}} sections · max 512 measures</span></div>
  <div class="new-song-section-grid"><label v-for="(length,i) in newSongLengths" :key="i">Section {{sectionLetter(i)}}<input v-model.number="newSongLengths[i]" type="number" min="1" max="128" :aria-label="`Measures in section ${sectionLetter(i)}`"/></label></div>
  <div class="new-song-bulk"><label>Set every section to<input v-model.number="newSongUniformLength" type="number" min="1" max="128"/></label><button type="button" class="secondary" @click="setAllNewSongLengths">Apply to all sections</button></div>
  <p v-if="newSongTotal>512" class="new-song-error" role="alert">The song exceeds the 512-measure limit. Reduce one or more section lengths.</p>
  <div class="two"><label>Time signature<select v-model.number="newSongBeats"><option :value="4">4/4 — Tango</option><option :value="3">3/4 — Vals</option><option :value="2">2/4 — Milonga / historical notation</option></select></label><label>Tempo (quarter notes/min)<input v-model.number="newSongBpm" type="number" min="40" max="240"/></label></div>
  <div class="overview-actions"><button type="button" class="primary" @click="createBlankSong">Create blank song</button><button type="button" class="secondary" @click="newSongOpen=false">Keep current project</button></div>
  <p class="hint">Your current song stays in the local library. A new, independently autosaved song is created even if its title is still Untitled Tango.</p>
</div><div class="page-title"><div><h1>Arrange your tango</h1><p>From one melody and chords to a complete orchestra score.</p></div><button class="primary" @click="regenerate">↻ Generate orchestra</button></div><nav class="tabs" aria-label="Main work areas"><button :class="{active:active==='overview'}" @click="active='overview'">1 · Song overview</button><button :class="{active:active==='structure'}" @click="active='structure'">2 · Structure & keys</button><button :class="{active:active==='lead'}" @click="active='lead'">3 · Lead sheet</button><button :class="{active:active==='arrange'}" @click="active='arrange'">4 · Orchestration</button><button :class="{active:active==='score'}" @click="active='score'">5 · Score review</button><button :class="{active:active==='notes'}" @click="active='notes'">6 · Note editor</button></nav><div class="notice">{{message}}</div>
<div v-if="chordEditorOpen" class="editor chord-editor" role="region" aria-label="Measure harmony editor">
  <div class="section-heading"><h2>Harmony · measure {{selectedBar+1}}</h2><button class="secondary" type="button" @click="chordEditorOpen=false">Close</button></div>
  <p class="muted">Chords belong to the measure and apply to all instruments. Leave the field empty to clear the harmony. Commas divide the measure into slots: in 4/4, <code>D,G</code> changes to G on beat 3; <code>D,D,D,G</code> changes on beat 4. Repeated symbols hold the chord.</p>
  <div class="two"><label>Chord sequence<input v-model="chordDraft" spellcheck="false" @keydown.enter.prevent="applyChordEditor" placeholder="D,D,D,G"/></label><label>Beat-by-beat preview<div class="chord-beat-preview">{{chordBeatLabels(chordDraft)}}</div></label></div>
  <div class="overview-actions"><button class="primary" @click="applyChordEditor">Apply harmony</button><button class="secondary" @click="chordEditorOpen=false">Cancel</button></div>
</div>
<section v-if="active==='structure'" class="structure-tab"><div class="section-heading"><h2>Song structure &amp; section keys</h2><button type="button" class="secondary" @click="active='overview'">← Back to song map</button></div><p class="muted">Define the form of your tango here: the number of sections, their measure lengths, and the concert-pitch key of each section. The Song Overview remains the main workspace for measure-level roles, articulation and note editing.</p>
<div class="editor"><div class="section-heading"><h3>Song structure</h3><button class="secondary" type="button" @click="structureOpen?structureOpen=false:editStructure()">{{structureOpen?'Cancel structure edit':'Edit sections & measures'}}</button></div>
<p class="muted">Default: five 16-measure sections labeled A–E. Change the number of sections and the length of each one; MuseScore receives alphabetical rehearsal marks at every section boundary.</p>
<div class="section-summary"><span v-for="(span,i) in sectionSpans(project)" :key="i"><strong>{{sectionLetter(i)}}</strong> · {{span.measures}} bars ({{span.start+1}}–{{span.start+span.measures}})</span></div>
<div v-if="structureOpen" class="structure-editor"><div class="structure-fields"><label v-for="(length,i) in sectionLengths" :key="i">Section {{sectionLetter(i)}} · measures<input type="number" min="1" max="128" v-model.number="sectionLengths[i]"/></label></div><div class="overview-actions"><button class="secondary" type="button" :disabled="sectionLengths.length>=26" @click="addSection">+ Add section</button><button class="secondary" type="button" :disabled="sectionLengths.length<=1" @click="removeSection">− Remove last section</button><button class="primary" type="button" @click="applyStructure">Apply {{sectionLengths.length}} sections · {{structureTotal}} measures</button></div><p class="hint">Existing notes and chords are preserved by position within their section. Shortening a section removes its final measures; expanding inserts empty measures. Structural changes invalidate generated/imported scores and their protection flags.</p></div></div>
<div class="editor"><h3>Keys by section</h3><p class="muted">Set the concert-pitch key signature independently for each section. Minor ↔ major changes appear at section boundaries in all MusicXML parts. Chords and notes do not change automatically.</p><div class="section-key-grid"><label v-for="sec in sections" :key="sec">{{sec}} key<select :value="keyForSection(sec)" @change="setSectionKey(sec,$event)"><optgroup label="Major"><option v-for="key in majorKeys" :key="key" :value="key">{{key}} major</option></optgroup><optgroup label="Minor"><option v-for="key in minorKeys" :key="key" :value="key">{{key.slice(0,-1)}} minor</option></optgroup></select></label></div></div>
<div class="overview-actions"><button type="button" class="primary" @click="active='overview'">Continue arranging in Song Overview →</button></div></section>
<section v-else-if="active==='overview'" class="overview-section"><div class="section-heading"><h2>Song orchestration map</h2><span>{{project.bars.length}} measures · {{INSTRUMENTS.length}} parts</span></div><p class="muted">This is your main measure-level arranging workspace. Structure and section keys have their own tab. Scan roles and playing techniques across the whole piece. Edit chords directly in each measure heading (Enter or blur to save); click an instrument heading to open the expanded chord editor for the selected measure. Click a cell to select its orchestration settings; double-click or press Enter on a focused cell to edit its notes. Use the range editor to apply a role, articulation or violin chord technique to multiple measures. Empty overrides inherit section defaults and generated articulation cycles.</p>
<div class="overview-section-strip" aria-label="Section structure and key summary"><div class="overview-section-summary"><span v-for="(span,i) in sectionSpans(project)" :key="i" class="overview-section-pill"><strong>{{sectionLetter(i)}}</strong><span>{{keyForSection(span.label)}}</span><small>{{span.start+1}}–{{span.start+span.measures}}</small></span></div><button type="button" class="secondary" @click="active='structure'">Edit structure &amp; keys</button></div>
<div class="overview-legend"><span><i class="legend-dot melody"></i> Melody</span><span><i class="legend-dot chords"></i> Chords / arpeggio / pizzicato</span><span><i class="legend-dot harmony"></i> Harmony</span><span><i class="legend-dot bass"></i> Bass</span><span><i class="legend-dot rest"></i> Rest</span><span><i class="legend-dot overridden"></i> Manual override (corner)</span></div>
<div class="overview-workspace"><div class="overview-map-pane">
<div class="song-map-scroll"><table class="song-map"><thead><tr><th class="sticky-instrument">Instrument</th><th v-for="(b,i) in project.bars" :key="i" :class="{'section-break':i===0||b.section!==project.bars[i-1].section}"><div class="measure-chord-inline"><button type="button" class="measure-heading-select" :title="`Select measure ${i+1}`" @click="selectLeadMeasure(i)"><small>{{b.section}} · {{keyForSection(b.section)}}</small><strong>{{i+1}}</strong></button><input type="text" :value="b.chord" :aria-label="`Chords in measure ${i+1}`" title="Edit harmony inline; Enter saves" placeholder="—" spellcheck="false" autocomplete="off" @focus="selectLeadMeasure(i)" @change="commitInlineChord(i,$event)" @keydown.enter.prevent="commitInlineChord(i,$event)" @keydown.esc.prevent="cancelInlineChord(i,$event)"/></div></th></tr></thead><tbody><tr v-for="inst in overviewInstruments" :key="inst"><th class="sticky-instrument"><button type="button" class="instrument-heading-button" :title="`Edit chords in selected measure for ${inst}`" @click="overviewInstrument=inst;openChordEditor(overviewFocus)">{{inst}} <span aria-hidden="true">♫</span></button></th><td v-for="(b,i) in project.bars" :key="i" :class="{'section-break':i===0||b.section!==project.bars[i-1].section}"><button type="button" :class="['song-cell',`song-role-${effectiveRole(inst,i)}`,{focused:overviewFocus===i&&overviewInstrument===inst,modified:roleOverridden(inst,i)||articulationOverride(inst,i)!=='auto'||Boolean(project.measureViolinTechniques?.[`${inst}:${i}`])}]" :data-map-measure="i" :data-map-instrument="inst" :aria-label="`${inst}, measure ${i+1}, ${effectiveRole(inst,i)}. Double-click or press Enter to edit notes; Space to select orchestration.`" :title="`${inst} · measure ${i+1} · ${effectiveRole(inst,i)} · ${cellArticulation(inst,i)} · Double-click / Enter: edit notes`" @click="focusOverview(inst,i)" @dblclick.stop="openMapCellNotes(inst,i)" @keydown.enter.stop.prevent="openMapCellNotes(inst,i)"><span class="cell-role">{{cellLabel(inst,i)}}</span><small>{{cellArticulation(inst,i)}}</small></button></td></tr></tbody></table></div><p v-if="inlineHarmonyFeedback" class="inline-harmony-feedback" role="status">{{inlineHarmonyFeedback}}</p>
</div>
<div class="editor overview-edit"><h3>Edit instrument measures</h3><div class="overview-controls"><label>Instrument<select v-model="overviewInstrument"><option v-for="inst in INSTRUMENTS" :key="inst" :value="inst">{{inst}}</option></select></label><label>From measure<input v-model.number="overviewStart" type="number" min="1" :max="project.bars.length"/></label><label>To measure<input v-model.number="overviewEnd" type="number" :min="overviewStart" :max="project.bars.length"/></label><label>Musical role<select v-model="overviewRole"><option value="inherit">Inherit section</option><option v-for="role in roles" :key="role" :value="role">{{role}}</option></select></label><label v-if="overviewInstrument.startsWith('Violin')||overviewInstrument.startsWith('Bandoneon')">Articulation<select v-model="overviewArt"><option v-for="mode in articulationModes" :key="mode" :value="mode">{{mode==='auto'?'Inherit default':mode==='legato'?(overviewInstrument.startsWith('Violin')?'Arco / legato':'Legato'):mode.replaceAll('_',' ')}}</option></select></label><label v-if="overviewInstrument.startsWith('Violin')">Chord technique<select v-model="overviewTechnique"><option value="inherit">Inherit section</option><option v-for="tech in violinTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label></div><div v-if="overviewInstrument==='Piano'" class="overview-piano-figure"><label>Piano figure · section {{chosenSection}}<select :value="pianoFigureForSection()" @change="setPianoFigure"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label><button class="secondary" @click="nextPianoFigureVariation">↻ New section piano variation</button><p class="hint">Generated Piano Chords measures in this section use the selected figure. Protected manual measures stay unchanged.</p></div><div class="overview-actions"><button class="primary" @click="applyOverviewRange">Apply to range</button><button class="secondary" @click="applyOverviewSection">Apply to current section ({{chosenSection}})</button><button class="secondary" @click="overviewStart=1;overviewEnd=project.bars.length">Select whole song</button><button class="secondary" @click="regenerate">↻ Regenerate / merge protected edits</button><button class="secondary" @click="openNoteEditor(overviewInstrument,overviewFocus)">♫ Edit notes in selected cell</button></div><p class="hint" role="status">{{overviewNotice||'Choose a cell to load its overrides. Inherit restores the section or automatic default. The range editor changes only the selected instrument.'}}</p><p class="hint">Tip: for a violin playing chords, choose the Chords role and then tango staccato or pizzicato for one note per beat. Other techniques remain optional. Arco and staccato articulation are separate from the harmonic role.</p></div>
</div>
</section>
<section v-else-if="active==='lead'"><div class="section-heading"><h2>Melody & harmony</h2><span>{{project.bars.length}} measures</span></div><p class="muted">Compose melody and harmony here; use Song Overview for instrument roles and techniques. Each section displays its key and measure range. Enter chords directly in any measure. <strong>Enter</strong> saves and advances to the next chord field; <strong>Tab</strong> / <strong>Shift+Tab</strong> move forward / back between chord fields. Type a chord root (such as <code>D</code>) to see common variants; repeated chords like <code>C,C</code> are allowed; use ↑/↓ and Enter to select a suggestion, or click one. Completion changes only the chord at the cursor, so <code>Dm,A7</code> stays intact when you edit the second chord. For 4/4, <code>D,G</code> changes on beat 3 and <code>D,D,D,G</code> on beat 4. Diminished: <code>Ddim</code> (triad), <code>Ddim7</code> (fully diminished seventh), <code>Dm7b5</code> (half-diminished). Click a measure number to select its melody below; double-click it to focus the melody text editor.</p>
<div class="editor section-copy-editor" aria-label="Copy chords between sections">
  <div class="section-heading"><h3>Copy section chords</h3><span>Harmony only · melody and keys unchanged</span></div>
  <div class="section-copy-controls">
    <label>From section<select v-model.number="copySourceIndex" aria-label="Source section for chord copy"><option v-for="(span,i) in copySpans" :key="i" :value="i">{{sectionLetter(i)}} · {{span.measures}} measures · {{keyForSection(span.label)}}</option></select></label>
    <label>To section<select v-model.number="copyTargetIndex" aria-label="Destination section for chord copy"><option v-for="(span,i) in copySpans" :key="i" :value="i">{{sectionLetter(i)}} · {{span.measures}} measures · {{keyForSection(span.label)}}</option></select></label>
    <button type="button" class="primary" :disabled="copySpans.length<2||copySourceIndex===copyTargetIndex||copySourceIndex>=copySpans.length||copyTargetIndex>=copySpans.length" @click="applySectionChordCopy">Copy chords →</button>
  </div>
  <p class="hint">Copies chord sequences by measure position, including empty chords. If section lengths differ, only matching measure positions are replaced; extra destination measures stay as they are. You'll be asked to confirm before overwriting.</p>
  <p v-if="copyHarmonyFeedback" class="inline-harmony-feedback" role="status">{{copyHarmonyFeedback}}</p>
</div>
<div class="lead-sections">
  <section v-for="(span,si) in sectionSpans(project)" :key="`${span.label}:${span.start}`" class="lead-section" :aria-label="`Section ${sectionLetter(si)}`">
    <div class="lead-section-heading">
      <div class="lead-section-title"><strong class="lead-section-letter">{{sectionLetter(si)}}</strong><div><strong>Section {{span.label}}</strong><small>Measures {{span.start+1}}–{{span.start+span.measures}} · {{span.measures}} measures</small></div></div>
      <label class="lead-key-label">Key signature<select :value="keyForSection(span.label)" :aria-label="`Key for section ${span.label}`" @change="setSectionKey(span.label,$event)"><optgroup label="Major"><option v-for="key in majorKeys" :key="key" :value="key">{{key}} major</option></optgroup><optgroup label="Minor"><option v-for="key in minorKeys" :key="key" :value="key">{{key.slice(0,-1)}} minor</option></optgroup></select></label>
    </div>
    <div class="lead-measure-grid">
      <div v-for="offset in span.measures" :key="span.start+offset-1" :class="['lead-measure',{selected:selectedBar===span.start+offset-1}]">
        <button type="button" class="lead-measure-select" :aria-pressed="selectedBar===span.start+offset-1" :title="`Select measure ${span.start+offset}; double-click to edit its lead melody`" @click="selectLeadMeasure(span.start+offset-1)" @dblclick.stop="focusLeadMelody(span.start+offset-1)"><strong>{{span.start+offset}}</strong><small>{{project.bars[span.start+offset-1].melody.length}} melody notes</small></button>
        <div class="lead-chord-editor"><label class="lead-chord-label" :for="`lead-chord-${span.start+offset-1}`">Chords</label><input :id="`lead-chord-${span.start+offset-1}`" type="text" :data-lead-chord="span.start+offset-1" :value="project.bars[span.start+offset-1].chord" :aria-label="`Chords in measure ${span.start+offset}`" :aria-expanded="leadCompletion.measure===span.start+offset-1&&leadSuggestions.length>0" aria-autocomplete="list" placeholder="e.g. Dm,A7" spellcheck="false" autocomplete="off" @focus="focusLeadChord(span.start+offset-1,$event)" @input="updateLeadChord(span.start+offset-1,$event)" @click="updateLeadChord(span.start+offset-1,$event)" @blur="finishLeadChord(span.start+offset-1,$event)" @keydown="handleLeadChordKey(span.start+offset-1,$event)"/>
          <div v-if="leadCompletion.measure===span.start+offset-1&&leadSuggestions.length" class="chord-suggestions" role="listbox" :aria-label="`Chord completions for measure ${span.start+offset}`"><button v-for="(suggestion,idx) in leadSuggestions" :key="suggestion" type="button" role="option" tabindex="-1" :aria-selected="leadCompletion.highlight===idx" :class="{'is-highlighted':leadCompletion.highlight===idx}" @mousedown.prevent @click="chooseLeadChord(span.start+offset-1,suggestion)">{{suggestion}}</button></div>
        </div>
      </div>
    </div>
  </section>
</div>
<p v-if="inlineHarmonyFeedback" class="inline-harmony-feedback" role="status">{{inlineHarmonyFeedback}}</p>
<button class="secondary" @click="addBar">+ Add measure to last section</button><div class="editor"><h3>Measure {{selectedBar+1}}</h3><div class="two"><label>Chords in measure <button class="secondary chord-edit-button" type="button" @click="openChordEditor(selectedBar)">{{bar.chord||'No chord'}} · Expanded harmony editor</button></label><label>Section<input :value="bar.section" disabled/><small class="hint">Change boundaries using Song Overview → Edit sections & measures.</small></label></div><label>Key signature for {{bar.section}}<select :value="keyForSection(bar.section)" @change="setSectionKey(bar.section,$event)"><optgroup label="Major"><option v-for="key in majorKeys" :key="key" :value="key">{{key}} major</option></optgroup><optgroup label="Minor"><option v-for="key in minorKeys" :key="key" :value="key">{{key.slice(0,-1)}} minor</option></optgroup></select><small class="hint">Applies to all measures in this section, without changing entered pitches or chords.</small></label><label>Melody notes<textarea v-model="melodyText" data-lead-melody rows="3" spellcheck="false"/></label><button class="primary" @click="setMelody">Apply melody notes</button><button class="secondary" @click="openNoteEditor('Violin I',selectedBar)">♫ Edit instrument notes</button><p class="hint">Lead-sheet melody remains the generative source; instrument notes are edited separately and protected from regeneration.</p></div></section>
<section v-else-if="active==='arrange'"><div class="section-heading"><h2>Orchestration roles</h2><span>Phrase-level presets</span></div><div class="section-tabs"><button v-for="s in sections" :key="s" :class="{selected:chosenSection===s}" @click="chosenSection=s">{{s}}</button></div><div class="editor"><label>Key signature for {{chosenSection}}<select :value="keyForSection(chosenSection)" @change="setSectionKey(chosenSection,$event)"><optgroup label="Major"><option v-for="key in majorKeys" :key="key" :value="key">{{key}} major</option></optgroup><optgroup label="Minor"><option v-for="key in minorKeys" :key="key" :value="key">{{key.slice(0,-1)}} minor</option></optgroup></select></label></div><div class="role-list"><div v-for="inst in INSTRUMENTS" :key="inst" class="role-row"><span>{{inst}}</span><select :value="project.roles[chosenSection]?.[inst]??'rest'" @change="setRole(inst,$event)"><option v-for="role in roles" :key="role" :value="role">{{role}}</option></select></div></div><div class="editor"><h3>Piano accompaniment figure</h3><p class="muted">For Piano with the Chords role, use a moving upper-staff figure and, for chord-inversion figures, an independent bass pulse. Variations alter inversions and register. These are arranging heuristics; use the Note Editor for individual counterlines and gestures.</p><div class="two"><label>Figure for {{chosenSection}}<select :value="pianoFigureForSection()" @change="setPianoFigure"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label><div class="align-bottom"><button class="secondary" @click="nextPianoFigureVariation">Try next piano variation ({{(project.pianoFigureVariation?.[chosenSection]??0)+1}})</button></div></div></div><div class="editor"><h3>Violin chord accompaniment</h3><p class="muted">For the Chords role, tango staccato and pizzicato play exactly one chord tone per beat. Unaccented notes are extremely short; selected marcato beats are louder and longer. Choose marcato beats for each violin in this section (1-based, e.g. 1,3). Defaults depend on the style profile and can be overridden; these are arranging heuristics, not fixed composer rules. Arpeggio and pizzicato arpeggio play exactly four successive single notes across the entire measure (not four per beat). Select ascending, descending, or alternating direction below. Double stop, sustained and block remain optional techniques.</p><div class="role-list"><div v-for="inst in (['Violin I','Violin II'] as const)" :key="inst" class="role-row"><span>{{inst}}</span><select :value="violinSetting(inst)" @change="setViolinSetting(inst,$event)"><option v-for="tech in violinTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select><label class="hint">Arpeggio direction <select :value="violinArpeggioDirection(inst)" @change="setViolinArpeggioDirection(inst,$event)" :aria-label="`Arpeggio direction for ${inst}`"><option value="alternate">Alternate each measure</option><option value="up">Up</option><option value="down">Down</option></select></label><label class="hint">Marcato beats <input type="text" :value="violinMarcatoText(inst)" @change="setViolinMarcato(inst,$event)" placeholder="1,3" aria-label="Marcato beats for violin chord accompaniment"/></label></div></div></div><div class="editor"><h3>Bandoneon following</h3><p class="muted">Choose a source and how to follow it for this section. Following overrides the bandoneon's role when the source has notes.</p><div v-for="inst in (['Bandoneon I','Bandoneon II'] as const)" :key="inst" class="two"><label>{{inst}} follows<select :value="followSetting(inst).target" @change="setFollow(inst,'target',$event)"><option v-for="target in followTargets" :key="target" :value="target">{{target}}</option></select></label><label>Method<select :value="followSetting(inst).method" @change="setFollow(inst,'method',$event)"><option v-for="method in followMethods" :key="method" :value="method">{{method}}</option></select></label></div></div><div class="editor"><h3>Instrument difficulty and activity</h3><p class="muted">Activity is a deterministic target for measures containing musical material, not beats sounded. Explicit Rest roles remain silent. The level limits technical complexity without automatically making the part sparse.</p><div class="role-list"><div v-for="inst in INSTRUMENTS.filter(i=>i!=='Voice')" :key="inst" class="role-row"><span>{{inst}}</span><select :value="instrumentDifficulty(inst)" @change="setInstrumentDifficulty(inst,$event)"><option v-for="d in difficulties" :key="d" :value="d">{{d}}</option></select><label class="hint">Activity <input type="number" min="0" max="100" step="5" :value="instrumentTarget(inst)" @change="setInstrumentTarget(inst,$event)"/> %</label><label class="hint">Dynamics offset <input type="number" min="-25" max="25" step="5" :value="instrumentDynamicsOffset(inst)" @change="setInstrumentDynamicsOffset(inst,$event)"/></label></div></div></div><div class="editor"><h3>Dynamics and phrase expression</h3><label><input type="checkbox" :checked="project.expression?.enabled??true" @change="toggleExpression('enabled',$event)"/> Export dynamics and scale generated velocities</label><label>Dynamic at start of {{chosenSection}}<select :value="sectionDynamic()" @change="setSectionDynamic"><option v-for="d in dynamicMarks" :key="d" :value="d">{{d}}</option></select></label><label><input type="checkbox" :checked="project.expression?.crescendo??true" @change="toggleExpression('crescendo',$event)"/> Add section crescendos</label></div><div class="editor"><h3>Eight-bar articulation and measure overrides</h3><p class="muted">Default: approximately eight measures marcato/staccato alternating with lyrical legato (arco for bowed violin). Bandoneon legato describes connected phrasing, not bowing. Violin II and Bandoneon II switches are staggered for variation.</p><label><input type="checkbox" :checked="project.articulation?.enabled??true" @change="project.articulation??=defaultArticulation();project.articulation.enabled=($event.target as HTMLInputElement).checked"/> Generate articulation cycles</label><label>Measures per phase<input type="number" min="1" max="32" :value="project.articulation?.phraseBars??8" @change="project.articulation??=defaultArticulation();project.articulation.phraseBars=Math.max(1,Math.min(32,Number(($event.target as HTMLInputElement).value)||8))"/></label><label>Override measure<select v-model.number="selectedBar"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.section}}</option></select></label><div class="role-list"><div v-for="inst in INSTRUMENTS.filter(i=>i.startsWith('Violin')||i.startsWith('Bandoneon'))" :key="inst" class="role-row"><span>{{inst}}</span><select :value="barArticulation(inst)" @change="setBarArticulation(inst,$event)"><option v-for="art in articulationModes" :key="art" :value="art">{{art.replaceAll('_',' ')}}</option></select><small class="hint">{{inferredArticulation(inst)}}</small></div></div><p class="hint">Press Generate orchestra after changing articulation. An explicit override takes precedence over the default cycle.</p></div><div class="editor"><h3>Tango gestures</h3><p class="muted">First experimental gesture: insert a two-note piano approach before beat 3 of the selected measure.</p><div class="two"><label>Target measure<select v-model.number="selectedBar"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.chord}}</option></select></label><div class="align-bottom"><button class="secondary" @click="addArrastre">+ Simple arrastre lead-in</button></div></div><p class="hint">Profiles model selected accompaniment, accent and expression tendencies; these are configurable heuristics, not transcriptions of any specific recording.</p></div></section>
<section v-else-if="active==='score'"><div class="section-heading"><h2>Generated score review</h2><span>{{scoreStats(score)}} notes · {{INSTRUMENTS.length}} parts</span></div><p class="muted">Review instrument-measures, protect edits imported from MuseScore, and regenerate selectively. Double-click any instrument’s note list to edit that instrument and measure. This is a note-event overview, not an engraved staff score.</p><div class="two"><label>Measure<select v-model.number="selectedBar"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.section}} · {{b.chord}}</option></select></label><div class="align-bottom"><button class="secondary" @click="exportXml">Export score to MuseScore ↗</button></div></div><div class="score-rows"><div v-for="entry in currentNotes" :key="entry.inst" class="score-row"><div class="score-name"><strong>{{entry.inst}}</strong><button class="secondary score-edit-link" @click="openNoteEditor(entry.inst,selectedBar)">Edit notes</button><small class="muted">{{activitySummary(entry.inst)}}% measures active</small><label class="protect"><input type="checkbox" :checked="!!project.protectedBars[`${entry.inst}:${selectedBar}`]" @change="setProtected(entry.inst,selectedBar,($event.target as HTMLInputElement).checked)"/> Protect</label></div><div class="notes score-notes-shortcut" :title="`Double-click to edit ${entry.inst} notes in measure ${selectedBar+1}`" @dblclick="openNoteEditor(entry.inst,selectedBar)"><span v-for="(n,i) in entry.notes" :key="i" class="note-chip">{{midiName(n.pitch+(project.transposeSemitones??0))}} <small>{{n.duration}} beat</small></span><span v-if="!entry.notes.length" class="muted">Rest</span></div></div></div></section>

<section v-else ref="noteEditorRegion" class="note-editor-section" tabindex="-1" @keydown="handleNoteEditorKey">
  <div class="section-heading"><h2>Instrument note editor</h2><span>Measure {{selectedBar+1}} · {{project.bars[selectedBar].section}} · {{noteCtx.key}} {{noteCtx.mode}}</span></div>
  <div class="note-editor-navigation" aria-label="Note editor navigation"><button type="button" class="secondary" @click="returnToMap">← Back to map</button><button type="button" class="secondary" :disabled="selectedBar<=0" @click="openNoteEditor(noteInst,selectedBar-1)">← Previous measure</button><button type="button" class="secondary" :disabled="selectedBar>=project.bars.length-1" @click="openNoteEditor(noteInst,selectedBar+1)">Next measure →</button><span class="hint">Keyboard: [ previous · ] next · L loop · Esc map (outside text fields)</span></div>
  <div class="note-loop-controls" aria-label="Measure playback"><button type="button" :class="noteLoopPlaying?'play':'primary'" @click="toggleNoteLoop">{{noteLoopPlaying?'■ Stop measure loop':'▶ Loop this instrument measure'}}</button><span class="hint" role="status" aria-live="polite">{{noteLoopPlaying?`Looping ${noteInst}, measure ${selectedBar+1} · beat ${noteLoopBeat<0?'…':noteLoopBeat+1}`:'Stopped · plays only the selected instrument and measure'}}</span></div>
  <p class="muted">Click a pitch/beat cell to hear and add a note; click the filled cell again to hear and remove it. Every semitone in the instrument's range is editable, including chromatic passing notes and notes outside the chord. Cell colors distinguish chord tones, other section-key tones, and chromatic tones; they never block entry. Notes are concert pitch; global transposition is applied during playback and export. Edits are immediately protected from regeneration. For piano, the treble and bass grids edit the same measure and sound together in the loop. Violin chord accompaniment defaults to one note per beat, with editable staccato/marcato and sounding length.</p>
  <div class="editor note-editor-panel">
    <div class="note-editor-controls">
      <label>Instrument<select v-model="noteInst" @change="openNoteEditor(noteInst,selectedBar)"><option v-for="inst in INSTRUMENTS" :key="inst" :value="inst">{{inst}}</option></select></label>
      <label>Measure<select v-model.number="selectedBar" @change="openNoteEditor(noteInst,selectedBar)"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.section}} · {{b.chord||'No harmony'}}</option></select></label>
      <label>Grid resolution<select v-model.number="noteStep"><option :value="1">Quarter note</option><option :value="0.5">Eighth note</option><option :value="0.25">Sixteenth note</option></select></label>
      <label>New note duration<select v-model.number="noteLength"><option v-for="d in [0.25,0.5,0.75,1,1.5,2,3,4]" :key="d" :value="d">{{d}} beat{{d===1?'':'s'}}</option></select></label>
      <label>New note articulation<select v-model="newNoteArticulation"><option value="inherit">Use measure setting</option><option value="staccato">Staccato · (very short)</option><option value="marcato_staccato">Marcato ^ (stronger, longer)</option><option value="legato">Legato</option></select></label>
      <label class="note-audition-toggle"><input type="checkbox" v-model="auditionEnabled"/> Hear notes when clicked</label>
      <label>Pitch labels<select v-model="editorAccidentals"><option value="auto">Follow key signature</option><option value="sharp">Use sharps (♯)</option><option value="flat">Use flats (♭)</option></select></label>
    </div>
    <div class="note-context">
      <span><strong>Role</strong> {{noteCtx.role}}</span><span><strong>Difficulty</strong> {{noteCtx.difficulty}}</span>
      <span><strong>Key</strong> {{noteCtx.key}} {{noteCtx.mode}}</span>
      <span><strong>Range</strong> {{midiName(noteCtx.range[0])}}–{{midiName(noteCtx.range[1])}}</span>
      <span><strong>Articulation</strong> {{noteCtx.articulation??'none'}}</span>
      <span v-if="noteCtx.technique"><strong>Technique</strong> {{noteCtx.technique}}</span>
      <span><strong>Dynamic</strong> {{noteCtx.dynamic}}</span><span><strong>Activity</strong> {{Math.round(noteCtx.activity*100)}}%</span>
      <span v-if="project.protectedBars[`${noteInst}:${selectedBar}`]" class="manual-status">Manual · protected</span>
    </div>
    <div class="figure-workbench" aria-label="Note figure generator">
      <h3>Musical figures · selected instrument and measure</h3>
      <p class="hint">Generate chord-tone figures, moving inversions, countermelodies or answers to the lead melody. The section key, chord changes and instrument register guide the result. Variations are deterministic; manual edits elsewhere are preserved.</p>
      <div class="figure-controls"><label>Figure<select v-model="figureChoice"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label>
      <label>Variation number<input type="number" min="1" max="100" :value="figureVariation+1" @change="figureVariation=Math.max(0,Math.min(99,Number(($event.target as HTMLInputElement).value)-1||0))"/></label>
      <button class="primary" @click="applyFigure()">Apply figure</button><button class="secondary" @click="applyFigure(true)">Another variation ↻</button>
      <button class="secondary" @click="cycleFigure(1)">Next figure →</button></div>
      <p class="hint">Applying a figure replaces only this instrument-measure and protects it. Existing manually protected measures require confirmation when first replaced.</p>
    </div>
    <div class="figure-workbench" aria-label="Expression ranges">
      <h3>Expression across measures</h3><p class="hint">Set an instrument-specific crescendo or decrescendo, including across section boundaries. Intensity offsets are applied relative to a neutral value of 80, preserving note accents; written durations do not change. MusicXML exports hairpin wedges.</p>
      <div class="figure-controls"><label>From measure<input type="number" min="1" :max="project.bars.length" v-model.number="expressionStart"/></label>
      <label>Through measure<input type="number" min="1" :max="project.bars.length" v-model.number="expressionEnd"/></label>
      <label>Start at beat<input type="number" min="1" :max="project.beats" step="0.25" v-model.number="expressionStartBeat"/></label>
      <label>End after beat<input type="number" min="0.25" :max="project.beats" step="0.25" v-model.number="expressionEndBeat"/></label>
      <label>Starting intensity (80 = neutral)<input type="number" min="1" max="127" v-model.number="expressionFrom"/></label>
      <label>Ending intensity (80 = neutral)<input type="number" min="1" max="127" v-model.number="expressionTo"/></label>
      <button class="secondary" @click="addExpressionRange">+ Add expression range</button></div>
      <div v-for="r in currentExpressionRanges" :key="r.index" class="expression-range-row"><span>Measures {{r.startMeasure+1}} (beat {{(r.startBeat??0)+1}}) – {{r.endMeasure+1}} (through beat {{r.endBeat??project.beats}}) · {{r.from}} → {{r.to}} {{r.to>=r.from?'crescendo':'decrescendo'}}</span><button class="secondary" @click="removeExpressionRange(r.index)">Remove</button></div>
    </div>
    <div v-if="noteInst==='Piano'" class="piano-split-setting"><label>Split between piano staves (notes at or above this pitch use treble)<select v-model.number="pianoSplit"><option v-for="pitch in [55,57,59,60,62,64,65,67]" :key="pitch" :value="pitch">{{midiName(pitch)}} · MIDI {{pitch}}</option></select></label><span class="hint">Affects piano editor and MusicXML clef assignment, not note pitches or sounding notes.</span></div>
    <div class="note-editor-actions"><template v-if="noteInst==='Piano'"><button class="secondary" @click="shiftPianoRegister('treble',-12)">Treble ↓ octave</button><button class="secondary" @click="shiftPianoRegister('treble',12)">Treble ↑ octave</button><button class="secondary" @click="shiftPianoRegister('bass',-12)">Bass ↓ octave</button><button class="secondary" @click="shiftPianoRegister('bass',12)">Bass ↑ octave</button></template><template v-else><button class="secondary" @click="noteCenter=Math.max(noteCtx.range[0]+9,noteCenter-12)">↓ Lower octave</button><button class="secondary" @click="noteCenter=Math.min(noteCtx.range[1]-8,noteCenter+12)">↑ Higher octave</button></template><button class="secondary" @click="clearNoteMeasure">Clear this measure</button><button class="secondary" @click="restoreNoteMeasure">Restore generated measure</button></div>
    <div :class="{'note-staff-grid':noteInst==='Piano'}">
    <div v-for="staff in noteStaffViews" :key="staff.id" class="note-staff-panel"><div v-if="noteInst==='Piano'" class="note-staff-heading"><strong>{{staff.label}}</strong><span>{{staff.clef}}</span></div><div class="note-grid-scroll"><table class="note-grid"><thead><tr><th class="note-pitch-label">Pitch</th><th v-for="beat in noteBeats" :key="beat" :class="{'note-downbeat':Number.isInteger(beat),'note-loop-playhead':noteLoopPlaying&&noteLoopBeat===Math.floor(beat)}"><span>{{Number.isInteger(beat)?beat+1:'·'}}</span><small>{{chordAt(project.bars[selectedBar].chord,project.beats,beat)||'—'}}</small></th></tr></thead><tbody>
      <tr v-for="pitch in staff.pitches" :key="pitch"><th class="note-pitch-label"><button type="button" class="note-pitch-audition" :title="`Hear ${displayPitch(pitch)}`" @click="auditionPitch(pitch)">{{displayPitch(pitch)}} ♪</button></th><td v-for="beat in noteBeats" :key="beat" :class="{'note-downbeat':Number.isInteger(beat),'note-loop-playhead':noteLoopPlaying&&noteLoopBeat===Math.floor(beat)}"><button type="button" :class="['note-grid-cell',`note-tone-${pitchClass(pitch,beat)}`,{'has-note':noteAt(pitch,beat)>=0}]" :title="`${displayPitch(pitch)} · beat ${beat+1} · ${pitchClass(pitch,beat)}`" :aria-label="`${noteAt(pitch,beat)>=0?'Remove':'Add'} ${displayPitch(pitch)} on beat ${beat+1}`" @click="toggleNote(pitch,beat)">{{noteAt(pitch,beat)>=0?'●':''}}</button></td></tr>
    </tbody></table></div></div>
    </div>
    <p class="hint">Color guide: <span class="note-key-legend chord">chord tone</span> <span class="note-key-legend key">key tone</span> <span class="note-key-legend chromatic">chromatic</span>. All three colors are clickable, for every instrument and role. Pitch labels can show sharps or flats without changing the sounding pitch; MusicXML spells notes according to the section key. Notes outside the visible register can be reached with the octave buttons.</p>
    <h3>Notes in this measure</h3><div class="note-event-list"><button v-for="(n,i) in noteMeasure" :key="`${n.start}:${n.pitch}:${i}`" :class="['note-event-button',{selected:noteSelected===i}]" @click="selectNoteEvent(i)">{{displayPitch(n.pitch)}} · beat {{Number((n.start-selectedBar*project.beats+1).toFixed(2))}} · {{n.duration}} beats · {{n.articulation==='staccato'?'· Stacc.':n.articulation==='marcato_staccato'?'^ Marc.':n.articulation==='legato'?'Legato':'Plain'}}{{n.slideTo!==undefined?' · slide → '+displayPitch(n.slideTo):''}}{{n.swellTo!==undefined?' · swell → '+n.swellTo:''}}</button><span v-if="!noteMeasure.length" class="muted">No notes. Click a cell to add one.</span></div>
    <div v-if="selectedEvent" class="note-properties"><h3>Edit selected note</h3><div class="note-editor-controls">
      <label>Pitch (MIDI, all semitones)<input type="number" :min="noteCtx.range[0]" :max="noteCtx.range[1]" :value="selectedEvent.pitch" @change="updateSelectedNote('pitch',($event.target as HTMLInputElement).value)"/></label>
      <label>Beat (starts at 1)<input type="number" min="1" :max="project.beats" step="0.25" :value="selectedEvent.start-selectedBar*project.beats+1" @change="updateSelectedNote('start',String(Number(($event.target as HTMLInputElement).value)-1))"/></label>
      <label>Duration (beats)<input type="number" min="0.25" :max="project.beats" step="0.25" :value="selectedEvent.duration" @change="updateSelectedNote('duration',($event.target as HTMLInputElement).value)"/></label>
      <label>Base velocity<input type="number" min="1" max="127" :value="selectedEvent.velocity??80" @change="updateSelectedNote('velocity',($event.target as HTMLInputElement).value)"/></label>
      <label>Articulation<select :value="selectedEvent.articulation??'inherit'" @change="updateSelectedNote('articulation',($event.target as HTMLSelectElement).value)"><option value="inherit">Unmarked</option><option value="staccato">Staccato · (short)</option><option value="marcato_staccato">Marcato ^ (strong)</option><option value="legato">Legato</option></select></label>
      <label>Sounding length (%)<input type="number" min="1" max="100" step="1" :value="Math.round((selectedEvent.gate??(selectedEvent.articulation?ARTICULATION_GATES[selectedEvent.articulation]:0.90))*100)" @change="updateSelectedNote('gate',($event.target as HTMLInputElement).value)"/></label>
      <label v-if="slideSupported">Slide to pitch (MIDI)<select :value="selectedEvent.slideTo??'inherit'" @change="updateSelectedNote('slideTo',($event.target as HTMLSelectElement).value)"><option value="inherit">No slide</option><option v-for="pitch in Array.from({length:noteCtx.range[1]-noteCtx.range[0]+1},(_,i)=>i+noteCtx.range[0])" :key="pitch" :value="pitch">{{displayPitch(pitch)}} ({{pitch}})</option></select></label>
      <label v-if="slideSupported">Swell to velocity<select :value="selectedEvent.swellTo??'inherit'" @change="updateSelectedNote('swellTo',($event.target as HTMLSelectElement).value)"><option value="inherit">No note swell</option><option v-for="v in [35,45,55,65,75,85,95,105,115,125]" :key="v" :value="v">{{v}} / 127</option></select></label>
      <label v-if="noteInst.startsWith('Violin')">Technique<select :value="selectedEvent.technique??'inherit'" @change="updateSelectedNote('technique',($event.target as HTMLSelectElement).value)"><option value="inherit">None</option><option value="arco">Arco</option><option value="pizzicato">Pizzicato</option></select></label>
    </div><p class="hint">Playback velocity: {{noteSoundingVelocity(selectedEvent)}} / 127 · Audible length: {{Number(noteSoundingDuration(selectedEvent).toFixed(2))}} beats. Marcato adds 14 velocity units to the base setting.</p><button class="secondary" @click="deleteSelectedNote">Delete selected note</button></div>
    <p class="hint">Measure loop plays the current instrument only, at the song tempo and transposition, with note articulation, attack and sounding length. The loop uses your latest edits on its next repetition. Switching measures, instruments, songs or tabs stops playback. The note-click audition switch is independent of the measure loop.</p>
    <p class="hint">Written duration stays unchanged when you select an articulation. Tango staccato defaults to 28% sounding length; marcato to 58% with a stronger accent; legato to 94%. The sounding-length control overrides these defaults for the selected note. MusicXML exports staccato dots and marcato wedges, while exact gate percentages apply to the app's synthesized playback. Manual notes are saved in the .tango project, used in playback and MusicXML, and retained by Generate orchestra. “Restore generated measure” removes this instrument-measure's protection without touching other edits. Lead-sheet melody is unchanged.</p>
  </div>
</section>
</main></div><footer>Local-first prototype · IndexedDB autosave and multiple local songs · Export .tango backups · MusicXML for MuseScore</footer></div>
</template>
