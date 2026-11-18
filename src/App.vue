<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import AppIcon from './AppIcon.vue';
import type {PolySynth,Synth} from 'tone';
import {startAudioFromGesture} from './toneSession';
// Tone.js is loaded only after the first user audio gesture.
let Tone:typeof import('tone');
import {version as appVersion} from '../package.json';
import {createElChocloStudy} from './presets/el-choclo';
import pequenaStudy from './presets/pequena-2.json';
import {demoProject,blankProject,generate,mergeScores,INSTRUMENTS,FACTORY_INSTRUMENTS,projectInstruments,syncActiveInstruments,setProjectRoster,INSTRUMENT_GROUPS,instrumentsForGroup,type InstrumentGroup,pianoStaffForPitch,midiName,editorPitchName,parsePitch,scoreStats,type Project,type Note,type Instrument,type Role,defaultOrchestration,type ViolinTechnique,type BassTechnique,BASS_TECHNIQUES,bassTechniqueFor,type ArpeggioDirection,violinMarcatoBeatsFor,type FollowTarget,type FollowMethod,type Difficulty,type DynamicMark,DYNAMIC_MARKS,defaultInstrumentSettings,defaultExpression,convertTwoFourToFour,parseChordSequence,chordAt,chordTones,chordCompletions,completeChordToken,changeSectionKey,type SectionKeyChangeMode,instrumentActivity,transposeScore,defaultArticulation,measureArticulation,type Articulation,MAJOR_KEYS,MINOR_KEYS,sectionKey,parseKeySignature,inferSectionKeys,sectionSpans,sectionLetter,resizeSections,copySectionChords,noteEditorContext,noteEditorPitchClass,newNoteWrittenDuration,suggestedEditorNote,replaceInstrumentMeasure,resetInstrumentMeasure,instrumentRange,noteSoundingDuration,noteSoundingVelocity,ARTICULATION_GATES,figureMeasure,FIGURE_KINDS,type FigureKind} from './music';
import {listRosterPresets,saveRosterPreset,removeRosterPreset,getDefaultRoster,setDefaultRoster,type RosterPreset} from './rosterPresets';
import {download,exportMusicXml,exportCompressedMusicXml,exportMuseScoreMscz,exportAbc,exportMobileSheetsBundle,validateMusicXmlDurations,saveProject,loadProject,importMusicXml,importMidi,scoreFromParts} from './io';
import {newLocalSongId,saveLocalSong,listLocalSongs,readLocalSong,deleteLocalSong,lastOpenedSongId,rememberOpenedSongId,type LocalSongSummary} from './localProjects';
import {measureLoopEvents} from './measureLoop';
import {playExpressiveEvent} from './expressiveAudio';
import {clampWrittenDuration,dragWrittenDuration,dragWrittenNotePosition,dragWrittenNoteLeftEdge} from './noteEditing';
import {RHYTHM_PRESETS,rhythmSlots,applyRhythmPattern,validateRhythmPattern,quantizeRhythmPreset,addRhythmAttack,updateRhythmAttack,splitRhythmAttack,retimeMeasure,type RhythmSlot,type RhythmPreset,type RhythmMode} from './rhythmEditor';
import {selectMapMeasure} from './mapSelection';
import {capturePosition,addCapturedTap,rhythmFromTaps,melodyFromTaps,type CapturedTap} from './tapCapture';
import {keyboardPitchOptions,keyboardPitches,defaultKeyboardRange,changeKeyboardBoundary,clampKeyboardPitch} from './melodyKeyboard';
import {resolveEditorShortcut,type EditorKind} from './editorShortcuts';
import {arrangementPlaybackWindow,arrangementEventTime,type PlaybackOrigin} from './arrangementPlayback';
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
  if(performanceTicker){clearInterval(performanceTicker);performanceTicker=undefined;}
  const wasPlayingArrangement=playing.value;
  // Invalidate a pending Tone.start() before it can schedule anything.
  noteLoopSession++;rhythmLoopSession++;captureSession++;
  if(playing.value||noteLoopPlaying.value||rhythmLoopPlaying.value||capturePlaying.value){Tone.getTransport().stop();Tone.getTransport().cancel();}
  synth?.releaseAll();for(const voice of instrumentSynths.values())voice.releaseAll();for(const voice of samplePlayers.values())voice.releaseAll();loopSynth?.releaseAll();rhythmLoopSynth?.triggerRelease();captureSynth?.releaseAll();captureKeySynth?.releaseAll();captureClickSynth?.triggerRelease();
  playing.value=false;playbackOrigin.value=null;if(wasPlayingArrangement)audioStatus.value='Playback stopped';noteLoopPlaying.value=false;noteLoopBeat.value=-1;
  rhythmLoopPlaying.value=false;rhythmLoopBeat.value=-1;
  capturePlaying.value=false;captureCountingIn.value=false;capturePlayBar.value=-1;capturePlayBeat.value=-1;heldCaptureKeys.clear();captureRecordedPass=-1;
}
function selectProjectInEditor(p:Project){
  stopPlayback();syncActiveInstruments(p);restoringHistory=true;project.value=p;resetProjectHistory();restoringHistory=false;selectedBar.value=0;overviewFocus.value=0;
  overviewStart.value=1;overviewEnd.value=Math.min(8,p.bars.length);mapRangeAnchor.value=null;
  chosenSection.value=p.bars[0]?.section??'A';noteSelected.value=-1;
  chordEditorOpen.value=false;pending.value=[];newSongOpen.value=false;rhythmCaptureTaps.value=[];melodyCaptureTaps.value=[];captureEditedRhythms.value={};
  leadDrafts.value={};pendingKeyChange.value=null;
}
async function adoptLocalSong(p:Project){
  const id=newLocalSongId();
  if(libraryReady.value){await saveLocalSong(id,p);await refreshLocalSongs();}
  localSongId.value=id;rememberOpenedSongId(id);selectProjectInEditor(p);
}
async function chooseSongFromPicker(event:Event){
  const select=event.target as HTMLSelectElement;
  const id=select.value;
  if(id==='__example_pequena_2__'){
    select.value=localSongId.value;
    try{
      await flushAutosave();
      // Refresh the factory study's piano part with the current generator.
      // The bundled generatedScore predates left-hand bass support; keep
      // the remaining preset parts and all protected transcription edits.
      const study=snapshot(pequenaStudy as Project);
      study.generatedScore={...(study.generatedScore??generate(study)),Piano:generate(study).Piano};
      await adoptLocalSong(study);
      active.value='arrange';
      message.value='Opened a new editable Pequeña 2 — Vals study (130 measures). Melody and lyric alignment remain provisional; review against the printed score.';
    }catch(error){message.value=`Could not create Pequeña 2 study: ${String(error)}`;}
    return;
  }
  if(id==='__example_el_choclo__'){
    // Reset the native picker while the asynchronous copy is being created.
    select.value=localSongId.value;
    try{
      await flushAutosave();
      const study=createElChocloStudy();
      await adoptLocalSong(study);
      active.value='arrange';
      message.value='Opened a new editable El Choclo orchestral study (32 measures, 4/4). Melody/harmony adapted from the earlier ABC transcription; orchestration generated with current features, not a historical score.';
    }catch(error){message.value=`Could not create El Choclo study: ${String(error)}`;}
    return;
  }
  await openLocalSong(id);
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
  if(!window.confirm(`Permanently delete "${project.value.title||'Untitled Tango'}" from this browser? Export a .tango.json backup first if needed.`))return;
  try{
    await flushAutosave();const id=localSongId.value;
    await deleteLocalSong(id);await refreshLocalSongs();
    const next=localSongs.value[0];
    if(next){const loaded=await readLocalSong(next.id);if(!loaded)throw Error('Next song is unavailable');localSongId.value=next.id;rememberOpenedSongId(next.id);selectProjectInEditor(loaded);}
    else{await adoptLocalSong(setProjectRoster(blankProject(),getDefaultRoster()));}
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
  }catch(error){saveStatus.value=`Local storage unavailable: ${String(error)}`;message.value='Local autosave unavailable. Use Save .tango.json to keep a backup.';}
}
// Keep topical menus mutually exclusive and close them after an action or outside click.
function onTopbarMenuToggle(event:Event){
  const menu=event.target as HTMLDetailsElement;
  if(!menu.open)return;
  document.querySelectorAll<HTMLDetailsElement>('.app-topbar .topbar-menu').forEach(other=>{
    if(other!==menu)other.open=false;
  });
}
function closeTopbarMenuOnAction(event:MouseEvent){
  const button=(event.target as HTMLElement).closest('button');
  if(!button)return;
  const menu=button.closest('details.topbar-menu') as HTMLDetailsElement|null;
  if(menu)menu.open=false;
}
function closeTopbarMenuFromKey(event:KeyboardEvent){
  const menu=event.currentTarget as HTMLDetailsElement;
  menu.open=false;
  menu.querySelector<HTMLElement>('summary')?.focus();
}
function closeOpenTopbarMenusOnOutside(event:PointerEvent){
  if((event.target as Element|null)?.closest?.('.app-topbar .topbar-menu'))return;
  document.querySelectorAll<HTMLDetailsElement>('.app-topbar .topbar-menu[open]').forEach(menu=>menu.open=false);
}
const compactHelp=ref(localStorage.getItem('tango-compact-help')!=='false');
watch(compactHelp,value=>localStorage.setItem('tango-compact-help',String(value)));
const advancedToolsOpen=ref(false);
const noteEditorTab=ref<'notes'|'capture'|'figures'|'expression'>('notes');
// Focused note editing is a temporary, full-viewport UI state; it is not stored in the song.
const noteFocusMode=ref(false);
const noteFocusMore=ref(false);
const noteSettingsOpen=ref(false);
const noteLoopFrom=ref(1);
const noteLoopTo=ref(1);
const noteLoopMeasure=ref(-1);
function enterNoteFocusMode(){
  noteEditorTab.value='notes';noteDetailsPopup.value=false;noteFocusMore.value=false;
  if(noteLoopFrom.value>selectedBar.value+1||noteLoopTo.value<selectedBar.value+1){
    noteLoopFrom.value=selectedBar.value+1;noteLoopTo.value=selectedBar.value+1;
  }
  noteFocusMode.value=true;
  void nextTick(()=>noteEditorRegion.value?.querySelector<HTMLButtonElement>('.note-focus-close')?.focus({preventScroll:true}));
}
function exitNoteFocusMode(){
  if(noteLoopPlaying.value)stopNoteLoop();
  noteFocusMode.value=false;noteFocusMore.value=false;noteDetailsPopup.value=false;
  void nextTick(()=>noteEditorRegion.value?.querySelector<HTMLButtonElement>('.note-focus-enter')?.focus({preventScroll:true}));
}
function noteFocusLoopRange(){
  const max=project.value.bars.length;
  const from=Math.max(1,Math.min(max,Math.round(Number(noteLoopFrom.value)||1)));
  const to=Math.max(from,Math.min(max,Math.round(Number(noteLoopTo.value)||from)));
  noteLoopFrom.value=from;noteLoopTo.value=to;
  return {from:from-1,to:to-1};
}
function changeFocusLoopFrom(){
  noteLoopFrom.value=Math.max(1,Math.min(project.value.bars.length,Math.round(Number(noteLoopFrom.value)||1)));
  if(noteLoopTo.value<noteLoopFrom.value)noteLoopTo.value=noteLoopFrom.value;
}
function changeFocusLoopTo(){
  noteLoopTo.value=Math.max(noteLoopFrom.value,Math.min(project.value.bars.length,Math.round(Number(noteLoopTo.value)||noteLoopFrom.value)));
}

// The visible phrase and playback loop intentionally use the same bounds.
const focusVisibleMeasures=computed(()=>{
  const max=project.value.bars.length;
  const from=Math.max(1,Math.min(max,Math.round(Number(noteLoopFrom.value)||1)));
  const to=Math.max(from,Math.min(max,Math.round(Number(noteLoopTo.value)||from)));
  return Array.from({length:to-from+1},(_,i)=>from+i-1);
});
function focusMeasureNotes(bar:number){
  const beats=project.value.beats;
  return (score.value[noteInst.value]??[]).filter(n=>Math.floor((n.start+1e-7)/beats)===bar);
}
function focusNoteTop(pitch:number){
  const span=Math.max(1,noteViewEnd.value-noteViewStart.value);
  return Math.max(0,Math.min(100,(noteViewEnd.value-pitch)/span*100));
}
function selectFocusMeasure(bar:number){
  if(bar===selectedBar.value)return;
  openNoteEditor(noteInst.value,bar);
}

function setNoteEditorTab(tab:'notes'|'capture'|'figures'|'expression'){noteEditorTab.value=tab;noteDetailsPopup.value=false;}
const noteTabOrder=['notes','capture','figures','expression'] as const;
function handleNoteTabKey(event:KeyboardEvent){
  if(!(event.target as HTMLElement|null)?.closest('[role="tab"]'))return;
  const key=event.key;
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(key))return;
  event.preventDefault();event.stopPropagation();
  const index=noteTabOrder.indexOf(noteEditorTab.value);
  const next=key==='Home'?0:key==='End'?noteTabOrder.length-1:key==='ArrowRight'?(index+1)%noteTabOrder.length:(index+noteTabOrder.length-1)%noteTabOrder.length;
  setNoteEditorTab(noteTabOrder[next]);
  void nextTick(()=>noteEditorRegion.value?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus({preventScroll:true}));
}
const noteDetailsPopup=ref(false);
function scrollMapEditPanel(){document.querySelector('.overview-edit')?.scrollIntoView({behavior:'smooth',block:'center'});}
const statusVisible=ref(false);const statusDismissed=ref(false);const projectDrawerOpen=ref(false);const importDialogOpen=ref(false);const noteInspectorOpen=ref(true);const noteEditorSettingsOpen=ref(false);const audioStatus=ref('Audio not tested');const project=ref<Project>(blankProject());const active=ref<'structure'|'lead'|'arrange'|'rhythm'|'notes'|'performance'|'about'>('arrange');const selectedBar=ref(0);const message=ref('New blank tango: five sections of sixteen measures. Enter chords and melody, or import a song.');const importMode=ref<'melody'|'score'>('melody');const selectedTrack=ref(0);const pending=ref<{name:string;notes:Note[]}[]>([]);const pendingChords=ref<string[]>([]);const pendingKeys=ref<string[]>([]);const playing=ref(false);const playbackOrigin=ref<PlaybackOrigin|null>(null);const score=computed(()=>{const base=project.value.generatedScore??generate(project.value);return project.value.importedScore&&Object.values(project.value.protectedBars??{}).some(Boolean)?mergeScores(project.value,base):base;});const performanceBeat=ref(0);
const performanceMode=ref(false);
const performanceFocus=ref<Instrument|null>(null);
function togglePerformanceFocus(inst:Instrument){performanceFocus.value=performanceFocus.value===inst?null:inst;}
const performanceBar=computed(()=>Math.min(Math.max(0,project.value.bars.length-1),Math.floor(performanceBeat.value/project.value.beats)));
const performanceSection=computed(()=>project.value.bars[performanceBar.value]?.section??'A');
const performanceMeasureBeat=computed(()=>performanceBeat.value%project.value.beats+1);
const performanceSections=computed(()=>sectionSpans(project.value));
const performanceParts=computed(()=>projectInstruments(project.value).map(inst=>{const bar=performanceBar.value,beat=performanceBeat.value;const notes=score.value[inst]??[];const sounding=notes.some(n=>n.start<=beat+0.0001&&n.start+noteSoundingDuration(n)>beat);return {inst,role:effectiveRole(inst,bar),sounding};}));
const performanceMelodyPart=computed<Instrument|null>(()=>{const bar=performanceBar.value;const roster=projectInstruments(project.value);const candidates=roster.filter(inst=>effectiveRole(inst,bar)==='melody');return candidates.find(inst=>(score.value[inst]??[]).some(n=>Math.floor(n.start/project.value.beats)===bar))??candidates[0]??null;});
const performanceDisplayedPart=computed(()=>performanceFocus.value??performanceMelodyPart.value);
const performanceRoll=computed(()=>{const inst=performanceDisplayedPart.value;if(!inst)return null;const beats=project.value.beats;const first=Math.max(0,performanceBar.value-1)*beats;const length=beats*4;const notes=(score.value[inst]??[]).filter(n=>n.start<first+length&&n.start+n.duration>first);const low=Math.max(24,Math.min(84,...notes.map(n=>n.pitch))-2);const high=Math.min(108,Math.max(low+12,...notes.map(n=>n.pitch))+2);return {first,length,low,high,notes};});
const performanceLyricNotes=computed(()=>{const inst=performanceDisplayedPart.value;if(!inst)return [];return (score.value[inst]??[]).filter(n=>Boolean(n.lyric||n.lyric2)).sort((a,b)=>a.start-b.start);});
const performanceCurrentLyric=computed(()=>{const beat=performanceBeat.value,notes=performanceLyricNotes.value;let index=-1;for(let i=0;i<notes.length;i++){if(notes[i].start<=beat+0.0001)index=i;else break;}const active=index>=0&&beat<notes[index].start+noteSoundingDuration(notes[index])-0.0001;return {notes,index,active};});
const performanceLyricWindow=computed(()=>{const {notes,index,active}=performanceCurrentLyric.value;if(index<0||!performanceDisplayedPart.value)return [];const beat=performanceBeat.value;const measure=Math.floor(beat/project.value.beats);const nearby=notes.filter(n=>Math.floor(n.start/project.value.beats)>=measure-1&&Math.floor(n.start/project.value.beats)<=measure+2);if(!nearby.length)return [];const at=nearby.findIndex(n=>n===notes[index]);const start=Math.max(0,at-4);return nearby.slice(start,Math.min(nearby.length,Math.max(9,at+9))).map(note=>({note,active:active&&note===notes[index]}));});
function performanceSeek(bar:number){const next=Math.max(0,Math.min(project.value.bars.length-1,bar));selectedBar.value=next;if(playing.value&&playbackOrigin.value){void play('selected');}else performanceBeat.value=next*project.value.beats;}
let performanceTicker:ReturnType<typeof setInterval>|undefined;
watch(playing,(isPlaying)=>{if(performanceTicker){clearInterval(performanceTicker);performanceTicker=undefined;}if(isPlaying&&Tone&&playbackOrigin.value){performanceTicker=setInterval(()=>{if(!playing.value||!Tone)return;const start=playbackOrigin.value==='beginning'?0:selectedBar.value;performanceBeat.value=Math.min(project.value.bars.length*project.value.beats-0.001,start*project.value.beats+Tone.getTransport().seconds*project.value.bpm/60);},50);}});
const sections=computed(()=>[...new Set(project.value.bars.map(b=>b.section))]);const chosenSection=ref('A');const majorKeys=MAJOR_KEYS;const minorKeys=MINOR_KEYS;
// Status is event-driven: dismissing a message keeps it hidden until the text changes.
watch(message,(next,previous)=>{if(next!==previous){statusVisible.value=true;statusDismissed.value=false;}});
// Full project snapshots preserve protected measures, lyrics, roles and score edits.
const undoHistory=ref<Project[]>([]);
const redoHistory=ref<Project[]>([]);
const historyLimit=50;
// Project data is JSON-serializable; unlike structuredClone, this handles Vue reactive proxies.
const snapshotProject=(value:Project):Project=>JSON.parse(JSON.stringify(value)) as Project;
let historyBaseline:Project=snapshotProject(project.value);
let restoringHistory=false;
let dragHistoryStart:Project|null=null;
function restoreHistory(direction:'undo'|'redo'){
  const source=direction==='undo'?undoHistory.value:redoHistory.value;
  const destination=direction==='undo'?redoHistory.value:undoHistory.value;
  const previous=source.pop();
  if(!previous)return;
  destination.push(snapshotProject(project.value));
  if(destination.length>historyLimit)destination.shift();
  restoringHistory=true;
  project.value=snapshotProject(previous);
  historyBaseline=snapshotProject(previous);
  restoringHistory=false;
  noteSelected.value=-1;
  noteDetailsPopup.value=false;
  message.value=direction==='undo'?'Undid last edit.':'Redid last edit.';
}
function resetProjectHistory(){
  undoHistory.value=[];redoHistory.value=[];
  historyBaseline=snapshotProject(project.value);
  dragHistoryStart=null;
}
function handleHistoryShortcut(event:KeyboardEvent){
  if(!(event.ctrlKey||event.metaKey)||event.altKey||event.key.toLowerCase()!=='z')return;
  const target=event.target as HTMLElement|null;
  // Let native undo work while typing in text fields.
  if(target?.closest('input,textarea,[contenteditable="true"]'))return;
  event.preventDefault();
  restoreHistory(event.shiftKey?'redo':'undo');
}
watch(project,()=>{
  if(restoringHistory)return;
  const current=snapshotProject(project.value);
  if(dragHistoryStart){
    historyBaseline=current;
    return;
  }
  if(JSON.stringify(current)===JSON.stringify(historyBaseline))return;
  undoHistory.value.push(historyBaseline);
  if(undoHistory.value.length>historyLimit)undoHistory.value.shift();
  redoHistory.value=[];
  historyBaseline=current;
},{deep:true,flush:'sync'});
watch(project,scheduleAutosave,{deep:true});
watch(()=>project.value.instruments,()=>syncActiveInstruments(project.value),{immediate:true,deep:true});
const activeRoster=computed(()=>projectInstruments(project.value));
const rosterPresets=ref<RosterPreset[]>(listRosterPresets());
const rosterPresetName=ref('');
const rosterPresetSelection=ref('');
const newPartFamily=ref<'Violin'|'Voice'|'Bandoneon'|'Piano'|'Contrabass'|'Guitar'|'Clarinet'|'Flute'|'Trumpet'|'Trombone'>('Violin');
const romanNumerals=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
function addRosterPart(){
  const family=newPartFamily.value;
  const roster=projectInstruments(project.value);
  const name=family==='Piano'||family==='Contrabass'||family==='Voice'
    ?(roster.includes(family)?romanNumerals.slice(1).map(n=>`${family} ${n}`).find(n=>!roster.includes(n))??`${family} XI`:family)
    :romanNumerals.map(n=>`${family} ${n}`).find(n=>!roster.includes(n))??`${family} XI`;
  if(roster.includes(name)){message.value='Part already exists';return;}
  applyRoster([...roster,name]);
  if(family==='Voice'){
    project.value.instrumentSettings??={};project.value.instrumentSettings[name]={difficulty:'easy',activity:0.85};
    // Additional voice defaults to harmony; the original Voice remains inactive until assigned a melody role.
  }
}
function applyRoster(roster:string[]){
  try{stopPlayback();project.value=setProjectRoster(project.value,roster);syncActiveInstruments(project.value);message.value=`Roster updated: ${roster.length} parts. Regenerate to apply the changes.`;}
  catch(e){message.value=String(e);}
}
function rosterDisplayName(inst:string){return project.value.instrumentNames?.[inst]??inst;}
function renameRosterPart(inst:string,event:Event){
  const input=event.target as HTMLInputElement;
  const name=input.value.trim().replace(/\\s+/g,' ');
  if(!name||name.length>80){input.value=rosterDisplayName(inst);message.value='Instrument name must be 1–80 characters.';return;}
  const duplicate=activeRoster.value.some(other=>other!==inst&&rosterDisplayName(other).toLocaleLowerCase()===name.toLocaleLowerCase());
  if(duplicate){input.value=rosterDisplayName(inst);message.value='Instrument names must be unique.';return;}
  project.value={...project.value,instrumentNames:{...project.value.instrumentNames,[inst]:name}};
  message.value='Renamed '+inst+' to '+name+'. Instrument family and existing notes are unchanged.';
}
function removeRosterPart(inst:string){applyRoster(projectInstruments(project.value).filter(i=>i!==inst));}
function moveRosterPart(inst:string,delta:number){const roster=projectInstruments(project.value),index=roster.indexOf(inst),target=index+delta;if(target<0||target>=roster.length)return;[roster[index],roster[target]]=[roster[target],roster[index]];applyRoster(roster);}
function saveCurrentRoster(){try{rosterPresets.value=saveRosterPreset(rosterPresetName.value,projectInstruments(project.value));rosterPresetSelection.value=rosterPresetName.value;message.value='Roster preset saved locally.';}catch(e){message.value=String(e);}}
function loadSelectedRoster(){const preset=rosterPresets.value.find(p=>p.name===rosterPresetSelection.value);if(preset)applyRoster(preset.instruments);}
function deleteSelectedRoster(){try{rosterPresets.value=removeRosterPreset(rosterPresetSelection.value);rosterPresetSelection.value='';}catch(e){message.value=String(e);}}
function makeRosterDefault(){try{setDefaultRoster(projectInstruments(project.value));message.value='Current roster is now the default for new songs.';}catch(e){message.value=String(e);}}

function saveOnLeave(){if(libraryReady.value)void flushAutosave().catch(()=>{});}
onMounted(()=>{window.addEventListener('keydown',handleHistoryShortcut);void initializeLocalLibrary();document.addEventListener('pointerdown',closeOpenTopbarMenusOnOutside);document.addEventListener('visibilitychange',saveIfHidden);window.addEventListener('pagehide',saveOnLeave);});
function saveIfHidden(){if(document.visibilityState==='hidden')saveOnLeave();}
onBeforeUnmount(()=>{window.removeEventListener('keydown',handleHistoryShortcut);if(performanceTicker)clearInterval(performanceTicker);document.removeEventListener('pointerdown',closeOpenTopbarMenusOnOutside);document.removeEventListener('visibilitychange',saveIfHidden);window.removeEventListener('pagehide',saveOnLeave);stopPlayback();void flushAutosave().catch(()=>{});auditionSynth?.dispose();synth?.dispose();loopSynth?.dispose();rhythmLoopSynth?.dispose();captureSynth?.dispose();captureClickSynth?.dispose();});
function keyForSection(section:string){return sectionKey(project.value,section);}
const pendingKeyChange=ref<{section:string;from:string;to:string}|null>(null);
const keyChangeMode=ref<SectionKeyChangeMode>('chords');
const keyChangeError=ref('');
function setSectionKey(section:string,event:Event){
  const to=(event.target as HTMLSelectElement).value,from=keyForSection(section);
  parseKeySignature(to);
  // Revert the native select until the musician confirms an operation.
  (event.target as HTMLSelectElement).value=from;
  if(to===from)return;
  keyChangeMode.value='chords';
  keyChangeError.value='';
  pendingKeyChange.value={section,from,to};
}
function applySectionKeyChange(){
  const pending=pendingKeyChange.value;if(!pending)return;
  const mode=keyChangeMode.value;
  keyChangeError.value='';
  try{
    const changed=changeSectionKey(project.value,pending.section,pending.to,mode);
    project.value=changed;
    pendingKeyChange.value=null;
    message.value=`Section ${pending.section}: ${pending.from} → ${pending.to}. ${mode==='signature'?'Key signature only; pitches and harmony unchanged.':mode==='chords'?'Chords transposed; melody and protected notes kept unchanged.':'Chords and lead melody transposed; protected instrument notes transposed as well.'} Chord qualities are preserved.`;
  }catch(error){
    keyChangeError.value=error instanceof Error?error.message:String(error);
    message.value=`Key change not applied: ${keyChangeError.value}`;
  }
}
function cancelSectionKeyChange(){pendingKeyChange.value=null;keyChangeError.value='';}

const bassTechniques:BassTechnique[]=BASS_TECHNIQUES;
function bassSetting():BassTechnique{return project.value.orchestration?.contrabass?.[chosenSection.value]??'traditional';}
function setBassSetting(event:Event){const value=(event.target as HTMLSelectElement).value as BassTechnique;if(!BASS_TECHNIQUES.includes(value))return;project.value.orchestration??=defaultOrchestration();project.value.orchestration.contrabass??={};project.value.orchestration.contrabass[chosenSection.value]=value;project.value.generatedScore=mergeScores(project.value,generate(project.value));message.value=`Contrabass ${value.replaceAll('_',' ')} applied in section ${chosenSection.value}; protected notes retained.`;}
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
// Rhythm editor targets the sounding score, never the lead sheet or chord progression.
const rhythmPresets=RHYTHM_PRESETS;
const rhythmEditorRegion=ref<HTMLElement|null>(null);
const rhythmPreset=ref<RhythmPreset>('marcato_four');
const rhythmPreviewInstrument=ref<Instrument>('Piano');
const rhythmMode=ref<RhythmMode>('rhythm');
const rhythmScope=ref<'range'|'section'|'song'>('section');
const rhythmSection=ref('A');
watch(sections,values=>{if(!values.includes(rhythmSection.value))rhythmSection.value=values[0]??'A';},{immediate:true});
const rhythmStart=ref(1);
const rhythmEnd=ref(8);
const rhythmTargets=ref<Instrument[]>(['Piano','Contrabass','Bandoneon I','Bandoneon II']);
const rhythmOverwrite=ref(false);
const rhythmFeedback=ref('');
const rhythmPresetInfo=computed(()=>rhythmPresets.find(x=>x.id===rhythmPreset.value)!);
// A pattern is an editable score of attacks/rests, not a fixed preset preview.
const rhythmGridStep=0.25;
const rhythmPattern=ref<RhythmSlot[]>(rhythmSlots('marcato_four',4,'Piano'));
const rhythmSelected=ref(0);
const rhythmLoopPlaying=ref(false);
const rhythmLoopBeat=ref(-1);
const rhythmLoopMeasure=ref(1);
const rhythmLoopSound=ref<'clicks'|'instrument'>('clicks');
let rhythmLoopSynth:Synth|null=null;
let rhythmLoopSession=0;
const rhythmSteps=computed(()=>Array.from({length:Math.round(project.value.beats/rhythmGridStep)},(_,i)=>i*rhythmGridStep));
const rhythmSelectedSlot=computed(()=>rhythmPattern.value[rhythmSelected.value]);
function loadRhythmPreset(){
  try{
    rhythmPattern.value=quantizeRhythmPreset(rhythmSlots(rhythmPreset.value,project.value.beats,rhythmPreviewInstrument.value,project.value.profile),project.value.beats,rhythmGridStep);
    rhythmSelected.value=rhythmPattern.value.length?0:-1;
    rhythmFeedback.value=`Loaded ${rhythmPresetInfo.value.label} into the editable grid. Change attacks, durations or accents before applying.`;
  }catch(error){rhythmFeedback.value=String(error);}
}
watch([rhythmPreset,rhythmPreviewInstrument,()=>project.value.beats],loadRhythmPreset);
function rhythmAddAt(beat:number){
  const old=rhythmPattern.value;
  const next=addRhythmAttack(old,project.value.beats,beat,rhythmGridStep);
  rhythmPattern.value=next;
  const i=next.findIndex(s=>Math.abs(s.beat-beat)<1e-6);
  if(i>=0)rhythmSelected.value=i;
}
function rhythmSplit(){
  try{
    rhythmPattern.value=splitRhythmAttack(rhythmPattern.value,project.value.beats,rhythmSelected.value,rhythmGridStep);
    rhythmSelected.value+=1;rhythmFeedback.value='Split attack into two editable durations.';focusSelectedRhythmAttack();
  }catch(error){rhythmFeedback.value=error instanceof Error?error.message:String(error);}
}
function rhythmDelete(){
  if(!rhythmSelectedSlot.value)return;
  rhythmPattern.value=rhythmPattern.value.filter((_,i)=>i!==rhythmSelected.value);
  rhythmSelected.value=Math.min(rhythmSelected.value,rhythmPattern.value.length-1);
  rhythmFeedback.value='Deleted the selected rhythm attack.';
  focusSelectedRhythmAttack();
}
function focusSelectedRhythmAttack(){
  void nextTick(()=>{
    const index=rhythmSelected.value;
    if(index>=0)rhythmEditorRegion.value?.querySelectorAll<HTMLButtonElement>('.rhythm-event')[index]?.focus({preventScroll:true});
    else rhythmEditorRegion.value?.focus({preventScroll:true});
  });
}
function handleRhythmEditorKey(event:KeyboardEvent){
  if(pendingKeyChange.value||newSongOpen.value)return;
  const action=editorKeyAction(event,'rhythm');if(!action)return;
  if(action==='loop'){event.preventDefault();void toggleRhythmLoop();}
  else if(action==='delete'&&rhythmSelectedSlot.value){event.preventDefault();rhythmDelete();}
  else if((action==='previous'||action==='next')&&rhythmPattern.value.length){
    event.preventDefault();
    const count=rhythmPattern.value.length;
    rhythmSelected.value=rhythmSelected.value<0?(action==='next'?0:count-1):Math.max(0,Math.min(count-1,rhythmSelected.value+(action==='next'?1:-1)));
    focusSelectedRhythmAttack();
  }else if((action==='shorten'||action==='lengthen')&&rhythmSelectedSlot.value){
    event.preventDefault();rhythmDurationStep(action==='lengthen'?1:-1);
  }else if(action==='accent'&&rhythmSelectedSlot.value){
    event.preventDefault();rhythmEdit({accent:!rhythmSelectedSlot.value.accent});
  }else if(action==='split'&&rhythmSelectedSlot.value){event.preventDefault();rhythmSplit();}
  else if(action==='escape'&&rhythmSelectedSlot.value){
    event.preventDefault();rhythmSelected.value=-1;rhythmEditorRegion.value?.focus({preventScroll:true});
  }
}
function rhythmEdit(changes:Partial<RhythmSlot>){
  try{
    const previous=rhythmSelectedSlot.value;if(!previous)return;
    const updated=updateRhythmAttack(rhythmPattern.value,project.value.beats,rhythmSelected.value,changes,rhythmGridStep);
    rhythmPattern.value=updated;
    rhythmSelected.value=updated.findIndex(s=>s.beat===('beat' in changes?Math.round(changes.beat!/rhythmGridStep)*rhythmGridStep:previous.beat));
    rhythmFeedback.value='';
  }catch(error){rhythmFeedback.value=error instanceof Error?error.message:String(error);}
}
function rhythmDurationStep(delta:number){if(rhythmSelectedSlot.value)rhythmEdit({duration:rhythmSelectedSlot.value.duration+delta*rhythmGridStep});}
let rhythmResizeStart:{index:number;x:number;duration:number;width:number}|null=null;
function rhythmResizeDown(e:PointerEvent,index:number){
  e.preventDefault();e.stopPropagation();
  const target=e.currentTarget as HTMLElement;
  const track=target.closest('.rhythm-track') as HTMLElement|null;
  if(!track)return;
  rhythmSelected.value=index;
  rhythmResizeStart={index,x:e.clientX,duration:rhythmPattern.value[index].duration,width:track.getBoundingClientRect().width};
  target.setPointerCapture(e.pointerId);
}
function rhythmResizeMove(e:PointerEvent){
  if(!rhythmResizeStart)return;
  const drag=rhythmResizeStart;
  const delta=Math.round((e.clientX-drag.x)/drag.width*project.value.beats/rhythmGridStep)*rhythmGridStep;
  if(delta===0)return;
  try{
    const current=rhythmPattern.value[drag.index];
    if(!current)return;
    const next=rhythmPattern.value[drag.index+1];
    const maximum=(next?.beat??project.value.beats)-current.beat;
    const duration=Math.max(rhythmGridStep,Math.min(maximum,drag.duration+delta));
    rhythmPattern.value=updateRhythmAttack(rhythmPattern.value,project.value.beats,drag.index,{duration},rhythmGridStep);
  }catch(error){rhythmFeedback.value=String(error);}
}
function rhythmResizeUp(){rhythmResizeStart=null;}

const rhythmPreview=computed(()=>rhythmPattern.value);
async function toggleRhythmLoop(){
  if(rhythmLoopPlaying.value){stopPlayback();return;}
  stopPlayback();
  const session=rhythmLoopSession;
  try{
    Tone=await startAudioFromGesture();
    if(session!==rhythmLoopSession||active.value!=='rhythm')return;
    rhythmLoopSynth??=new Tone.Synth({oscillator:{type:'triangle'},envelope:{attack:0.002,decay:0.045,sustain:0.05,release:0.06}}).toDestination();
    rhythmLoopSynth.volume.value=-13;
    loopSynth??=new Tone.PolySynth(Tone.Synth).toDestination();
    loopSynth.volume.value=-9;
    const transport=Tone.getTransport();
    transport.stop();transport.cancel();transport.position=0;
    transport.timeSignature=project.value.beats;
    transport.bpm.value=project.value.bpm;
    transport.scheduleRepeat(time=>{
      // The pattern is read on every repetition so edits are audible immediately.
      const slots=rhythmPattern.value;
      const b=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(rhythmLoopMeasure.value)-1));
      const inst=rhythmPreviewInstrument.value;
      const originals=(score.value[inst]??[]).filter(n=>Math.floor((n.start+1e-7)/project.value.beats)===b);
      if(rhythmLoopSound.value==='instrument'&&originals.length){
        const notes=retimeMeasure(originals,inst,b,project.value.beats,slots,'rhythm',project.value.pianoSplitPitch??60);
        const events=measureLoopEvents(notes,b,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,[],inst,project.value);
        for(const event of events)loopSynth?.triggerAttackRelease(Tone.Frequency(event.pitch,'midi').toFrequency(),event.durationSeconds,time+event.onsetSeconds,event.velocity/127);
      }else{
        for(const slot of slots)rhythmLoopSynth?.triggerAttackRelease(slot.accent?'C6':'G5','32n',time+slot.beat*60/project.value.bpm,slot.accent?0.95:0.55);
      }
    },'1m',0);
    let beat=0;
    transport.scheduleRepeat(time=>{
      const current=beat%project.value.beats;beat++;
      Tone.getDraw().schedule(()=>{if(session===rhythmLoopSession&&rhythmLoopPlaying.value)rhythmLoopBeat.value=current;},time);
    },'4n',0);
    rhythmLoopPlaying.value=true;
    transport.start();
  }catch(error){rhythmFeedback.value=`Rhythm loop unavailable: ${String(error)}`;stopPlayback();}
}
// Live tap recording is a draft take. A separate full-arrangement loop is shared
// by the rhythm and note editors; switching tabs or projects cancels the loop.
const capturePlaying=ref(false);
const rhythmCaptureTaps=ref<CapturedTap[]>([]);
const melodyCaptureTaps=ref<CapturedTap[]>([]);
const captureTaps=computed<CapturedTap[]>({
  get:()=>active.value==='notes'?melodyCaptureTaps.value:rhythmCaptureTaps.value,
  set:value=>{if(active.value==='notes')melodyCaptureTaps.value=value;else rhythmCaptureTaps.value=value;}
});
const captureFrom=ref(1);
const captureTo=ref(1);
const captureLatency=ref(0);
const captureMetronome=ref(true);
const captureCountIn=ref(true);
const captureCountingIn=ref(false);

// Recording tempo changes transport speed, never the project's written timing.
const captureSpeed=ref<0.5|0.75|1>(1);
const captureQuantize=ref<'auto'|'1'|'0.5'|'0.25'|'0.125'>('auto');
const captureTakeMode=ref<'replace'|'overdub'>('replace');
let captureRecordedPass=-1;
function beginMelodyPassOnNote(elapsedBeats:number){
  if(captureTakeMode.value!=='replace'||captureKind.value!=='melody'||elapsedBeats<0)return;
  const length=(captureLast.value-captureFirst.value+1)*project.value.beats;
  const pass=Math.floor(elapsedBeats/length);
  if(pass===captureRecordedPass)return;
  // Keep the previous take until the performer actually starts the next one.
  melodyCaptureTaps.value=[];
  captureRecordedPass=pass;
}
type HeldCapture=CapturedTap&{duration?:number};
const heldCaptureKeys=new Map<number,{pitch:number;started:number}>();
function captureGrid(bar:number):number{
  if(captureQuantize.value!=='auto')return Number(captureQuantize.value);
  const articulation=measureArticulation(project.value,noteInst.value,bar);
  return articulation==='staccato'||articulation==='marcato_staccato'?0.5:0.25;
}
function captureElapsedBeats():number{
  const lead=(captureCountIn.value?project.value.beats:0)*60/(project.value.bpm*captureSpeed.value);
  return (Tone.getTransport().seconds-lead-captureLatency.value/1000)*project.value.bpm*captureSpeed.value/60;
}
function capturedMelodyForBar(bar:number){
  const taps=(captureTaps.value as HeldCapture[]).filter(t=>t.bar===bar&&Number.isInteger(t.pitch));
  const inferred=melodyFromTaps(taps.filter(t=>t.duration===undefined),bar,project.value.beats,captureGrid(bar));
  return [...inferred,...taps.filter(t=>t.duration!==undefined).map(t=>({beat:t.beat,pitch:t.pitch!,duration:t.duration!}))]
    .sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);
}


const capturePlayBar=ref(-1);
const capturePlayBeat=ref(-1);
const captureFeedback=ref('');
const capturePitch=ref(72);
const captureStartPitch=ref(72);
const captureEndPitch=ref(83);
const captureEditedRhythms=ref<Record<number,RhythmSlot[]>>({});
const captureEditBar=ref(1);
let captureSession=0;
let captureSynth:PolySynth|null=null;
let captureKeySynth:PolySynth|null=null;
let captureClickSynth:Synth|null=null;
const captureKind=computed((): 'rhythm'|'melody'=>active.value==='notes'?'melody':'rhythm');
const captureFirst=computed(()=>Math.max(0,Math.min(project.value.bars.length-1,Math.floor(Number(captureFrom.value)||1)-1)));
const captureLast=computed(()=>Math.max(captureFirst.value,Math.min(project.value.bars.length-1,Math.floor(Number(captureTo.value)||1)-1)));
const captureBarNumbers=computed(()=>Array.from({length:captureLast.value-captureFirst.value+1},(_,i)=>captureFirst.value+i));
const capturePitchOptions=computed(()=>keyboardPitchOptions(noteCtx.value.range));
const captureKeyboardPitches=computed(()=>keyboardPitches(captureStartPitch.value,captureEndPitch.value,noteCtx.value.range));
function changeCaptureKeyboardStart(){
  const next=changeKeyboardBoundary('start',captureStartPitch.value,captureEndPitch.value,noteCtx.value.range);
  captureStartPitch.value=next.start;captureEndPitch.value=next.end;
  capturePitch.value=clampKeyboardPitch(capturePitch.value,next);
}
function changeCaptureKeyboardEnd(){
  const next=changeKeyboardBoundary('end',captureStartPitch.value,captureEndPitch.value,noteCtx.value.range);
  captureStartPitch.value=next.start;captureEndPitch.value=next.end;
  capturePitch.value=clampKeyboardPitch(capturePitch.value,next);
}
const captureNoteLabels=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function captureBarRhythm(bar:number):RhythmSlot[]{
  return captureEditedRhythms.value[bar]??rhythmFromTaps(captureTaps.value,bar,project.value.beats);
}
function captureSetRangeToCurrent(){
  const b=active.value==='notes'?selectedBar.value+1:Math.max(1,Math.min(project.value.bars.length,rhythmLoopMeasure.value));
  captureFrom.value=b;captureTo.value=b;captureEditBar.value=b;
}
function captureClear(){captureTaps.value=[];captureEditedRhythms.value={};captureFeedback.value='Cleared the draft take; the arrangement was not changed.';}
function captureUndo(){
  if(!captureTaps.value.length)return;
  const removed=captureTaps.value.at(-1)!;
  captureTaps.value=captureTaps.value.slice(0,-1);
  delete captureEditedRhythms.value[removed.bar];
  captureFeedback.value='Removed last tap from the draft.';
}
async function toggleCaptureLoop(){
  if(capturePlaying.value){stopPlayback();return;}
  if(!project.value.bars.length)return;
  stopPlayback();
  const session=captureSession;
  const first=captureFirst.value,last=captureLast.value;
  const editor=active.value;
  try{
    Tone=await startAudioFromGesture();
    if(session!==captureSession||active.value!==editor)return;
    captureSynth??=new Tone.PolySynth(Tone.Synth).toDestination();
    captureSynth.volume.value=-13;
    captureKeySynth??=new Tone.PolySynth(Tone.Synth).toDestination();
    captureKeySynth.volume.value=-11;
    captureClickSynth??=new Tone.Synth({oscillator:{type:'triangle'},envelope:{attack:0.002,decay:0.04,sustain:0,release:0.04}}).toDestination();
    captureClickSynth.volume.value=-18;
    const transport=Tone.getTransport();
    transport.stop();transport.cancel();transport.position=0;
    transport.timeSignature=project.value.beats;transport.bpm.value=project.value.bpm*captureSpeed.value;
    const countInBeats=captureCountIn.value?project.value.beats:0;
    const countInSeconds=countInBeats*60/(project.value.bpm*captureSpeed.value);
    let measure=0;
    transport.scheduleRepeat(time=>{
      const b=first+measure%(last-first+1);measure++;
      const currentScore=score.value;
      for(const inst of INSTRUMENTS){
        const events=measureLoopEvents(currentScore[inst]??[],b,project.value.beats,project.value.bpm,
          project.value.transposeSemitones??0,project.value.expressionRanges??[],inst,project.value);
        for(const event of events){
          const onset=time+event.onsetSeconds/captureSpeed.value;
          const duration=event.durationSeconds/captureSpeed.value;
          if(event.slideTo!==undefined||event.endVelocity!==undefined)
            playExpressiveEvent(Tone.getContext().rawContext as AudioContext,{...event,durationSeconds:duration},onset);
          else captureSynth?.triggerAttackRelease(Tone.Frequency(event.pitch,'midi').toFrequency(),
            duration,onset,Math.max(0.05,event.velocity/127*0.8));
        }
      }
    },'1m',captureCountIn.value?'1m':0);
    let beatCount=0;
    transport.scheduleRepeat(time=>{
      const countIn=beatCount<countInBeats;
      const beat=beatCount%project.value.beats;
      const recordedBeat=Math.max(0,beatCount-countInBeats);
      const bar=first+Math.floor(recordedBeat/project.value.beats)%(last-first+1);
      beatCount++;
      if(captureMetronome.value)captureClickSynth?.triggerAttackRelease(beat===0?'C6':'G5','32n',time,beat===0?0.7:0.35);
      Tone.getDraw().schedule(()=>{
        if(session!==captureSession||!capturePlaying.value)return;
        captureCountingIn.value=countIn;capturePlayBar.value=countIn?-1:bar;capturePlayBeat.value=beat;
      },time);
    },'4n',0);
    capturePlaying.value=true;
    captureCountingIn.value=captureCountIn.value;
    captureFeedback.value=`Recording draft taps against full arrangement, measures ${first+1}–${last+1}. Tap the pad or pitch keys; stop to review.`;
    transport.start();
  }catch(error){captureFeedback.value=`Could not start arrangement loop: ${String(error)}`;stopPlayback();}
}
function captureTap(pitch?:number){
  if(!capturePlaying.value){captureFeedback.value='Start the arrangement loop before tapping.';return;}
  try{
    const elapsed=Tone.getTransport().seconds;
    const countInSeconds=(captureCountIn.value?project.value.beats:0)*60/(project.value.bpm*captureSpeed.value);
    if(elapsed<countInSeconds){captureFeedback.value='Count-in: recording begins after the introductory measure.';return;}
    const pos=capturePosition(elapsed-countInSeconds,project.value.bpm*captureSpeed.value,project.value.beats,
      captureFirst.value,captureLast.value,captureGrid(captureFirst.value),captureLatency.value);
    const adjusted=capturePosition(elapsed-countInSeconds,project.value.bpm*captureSpeed.value,project.value.beats,captureFirst.value,captureLast.value,captureGrid(pos.bar),captureLatency.value);
    if(captureKind.value==='melody')beginMelodyPassOnNote(captureElapsedBeats());
    const chosenPitch=pitch??capturePitch.value;
    const tap:CapturedTap=captureKind.value==='melody'?{...adjusted,pitch:chosenPitch}:adjusted;
    captureTaps.value=addCapturedTap(captureTaps.value,tap,captureKind.value);
    delete captureEditedRhythms.value[pos.bar];
    captureFeedback.value=`Captured measure ${pos.bar+1}, beat ${(pos.beat+1).toFixed(2)}${captureKind.value==='melody'?` · ${midiName(chosenPitch)}`:''}. ${captureTaps.value.length} draft taps.`;
    if(captureKind.value==='melody')void auditionPitch(chosenPitch,90,0.12);
  }catch(error){captureFeedback.value=`Tap not captured: ${String(error)}`;}
}
function capturePointerTap(event:PointerEvent,pitch?:number){if(!event.isPrimary||event.button!==0)return;captureTap(pitch);}
function captureKeyboardClick(event:MouseEvent,pitch?:number){if(event.detail===0)captureTap(pitch);}
function capturePianoKey(event:PointerEvent,pitch:number){
  if(event.button!==0)return;
  capturePitch.value=pitch;
  if(!capturePlaying.value){void auditionPitch(pitch);return;}
  const started=captureElapsedBeats();
  if(started<0)return;
  beginMelodyPassOnNote(started);
  heldCaptureKeys.set(event.pointerId,{pitch,started});
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  // Live key monitoring must follow pointer down/up, not a fixed-length audition.
  const transposed=Math.max(0,Math.min(127,pitch+(project.value.transposeSemitones??0)));
  captureKeySynth?.triggerAttack(Tone.Frequency(transposed,'midi').toFrequency(),undefined,0.7);
}
function releaseCapturePianoKey(event:PointerEvent){
  const held=heldCaptureKeys.get(event.pointerId);
  if(!held)return;
  heldCaptureKeys.delete(event.pointerId);
  const transposed=Math.max(0,Math.min(127,held.pitch+(project.value.transposeSemitones??0)));
  captureKeySynth?.triggerRelease(Tone.Frequency(transposed,'midi').toFrequency());
  if(!capturePlaying.value)return;
  const total=(captureLast.value-captureFirst.value+1)*project.value.beats;
  const start=Math.max(0,held.started);
  const end=Math.max(start,captureElapsedBeats());
  let position=((start%total)+total)%total;
  const startBar=captureFirst.value+Math.floor(position/project.value.beats);
  const grid=captureGrid(startBar);
  const snappedStart=Math.round(position/grid)*grid;
  const duration=Math.max(grid,Math.round((end-start)/grid)*grid);
  // Split held notes across measures; the score model stores measure-local notes.
  let cursor=snappedStart,remaining=duration;
  while(remaining>0.00001){
    const local=((cursor%total)+total)%total;
    const bar=captureFirst.value+Math.floor(local/project.value.beats);
    const beat=Number((local%project.value.beats).toFixed(6));
    const segment=Math.min(remaining,project.value.beats-beat);
    const tap:HeldCapture={bar,beat,pitch:held.pitch,duration:Number(segment.toFixed(6))};
    captureTaps.value=addCapturedTap(captureTaps.value,tap,'melody');
    remaining-=segment;cursor+=segment;
  }
  captureFeedback.value=`Recorded ${midiName(held.pitch)} for ${duration} beats.`;
}
function capturePianoKeyClick(event:MouseEvent,pitch:number){
  if(event.detail!==0)return;
  capturePitch.value=pitch;
  if(capturePlaying.value)captureTap(pitch);else void auditionPitch(pitch);
}
function loadCaptureBarToRhythm(){
  const bar=Math.max(captureFirst.value,Math.min(captureLast.value,Math.floor(captureEditBar.value)-1));
  const slots=captureBarRhythm(bar);
  if(!slots.length){captureFeedback.value=`No recorded attacks in measure ${bar+1}.`;return;}
  rhythmPattern.value=validateRhythmPattern(slots,project.value.beats);
  rhythmSelected.value=0;
  captureFeedback.value=`Loaded captured measure ${bar+1} into the rhythm grid. Edit it and save it back to the take.`;
}
function saveRhythmGridToCapture(){
  const bar=Math.max(captureFirst.value,Math.min(captureLast.value,Math.floor(captureEditBar.value)-1));
  try{
    captureEditedRhythms.value={...captureEditedRhythms.value,[bar]:validateRhythmPattern(rhythmPattern.value,project.value.beats)};
    captureFeedback.value=`Saved edited measure ${bar+1} in the draft take. The score is unchanged until Apply.`;
  }catch(error){captureFeedback.value=String(error);}
}
function applyCapturedRhythm(){
  if(capturePlaying.value){captureFeedback.value='Stop recording before applying the take.';return;}
  if(!rhythmTargets.value.length){captureFeedback.value='Select at least one target instrument.';return;}
  const bars=captureBarNumbers.value.filter(b=>captureBarRhythm(b).length);
  if(!bars.length){captureFeedback.value='Record some taps before applying.';return;}
  const protectedCount=bars.reduce((n,b)=>n+rhythmTargets.value.filter(inst=>project.value.protectedBars[`${inst}:${b}`]).length,0);
  if(protectedCount&&!rhythmOverwrite.value){captureFeedback.value=`Skipped protected measures unless Overwrite protected is enabled (${protectedCount} affected).`;}
  if(protectedCount&&rhythmOverwrite.value&&!window.confirm(`Overwrite ${protectedCount} protected instrument-measures with the recorded rhythm?`))return;
  if(!window.confirm(`Apply the captured rhythm to ${rhythmTargets.value.length} instruments across ${bars.length} recorded measures? Existing notes in unprotected measures will be retimed.`))return;
  try{
    let next=project.value,source=score.value,updated=0,skipped=0;
    for(const b of bars){
      const result=applyRhythmPattern(next,source,{instruments:rhythmTargets.value,measures:[b],
        slots:captureBarRhythm(b),mode:rhythmMode.value,overwriteProtected:rhythmOverwrite.value});
      next=result.project;source=next.generatedScore??source;updated+=result.updated;skipped+=result.skippedProtected+result.skippedEmpty;
    }
    project.value=next;
    captureFeedback.value=`Applied recorded rhythm to ${updated} instrument-measures; skipped ${skipped}. Draft retained for further editing.`;
    message.value=captureFeedback.value;
  }catch(error){captureFeedback.value=`Could not apply take: ${String(error)}`;}
}
function applyCapturedMelody(){
  if(capturePlaying.value){captureFeedback.value='Stop recording before applying the take.';return;}
  const bars=captureBarNumbers.value;
  const recordedCount=bars.reduce((sum,b)=>sum+capturedMelodyForBar(b).length,0);
  if(!recordedCount){captureFeedback.value='Record some pitched notes before applying.';return;}
  const protectedBars=bars.filter(b=>project.value.protectedBars[`${noteInst.value}:${b}`]);
  const emptyBars=bars.filter(b=>!capturedMelodyForBar(b).length);
  if(!window.confirm(`Replace ALL existing ${noteInst.value} notes in measures ${bars[0]+1}–${bars.at(-1)!+1} with this take? ${emptyBars.length} unrecorded measure(s) will be cleared. ${protectedBars.length} measure(s) contain protected edits. The lead sheet and other instruments are unchanged.`))return;
  try{
    // Every measure in the recording range is replaced, including measures with no
    // captured notes. Never append to the previous generated/imported score.
    let next=project.value,source=score.value,count=0;
    for(const b of bars){
      const notes=capturedMelodyForBar(b).map(t=>
        suggestedEditorNote(next,noteInst.value,b,t.beat,t.pitch,t.duration));
      next=replaceInstrumentMeasure(next,source,noteInst.value,b,notes);
      source=next.generatedScore??source;
      count+=notes.length;
    }
    project.value=next;
    noteSelected.value=-1;noteStep.value=0.25;
    captureFeedback.value=`Replaced ${noteInst.value} notes in ${bars.length} measures with ${count} recorded notes (${emptyBars.length} cleared measures).`;
    message.value=captureFeedback.value;
  }catch(error){captureFeedback.value=`Could not apply melody: ${String(error)}`;}
}
const rhythmMeasures=computed(()=>{
  if(rhythmScope.value==='song')return project.value.bars.map((_,i)=>i);
  if(rhythmScope.value==='section')return project.value.bars.flatMap((b,i)=>b.section===rhythmSection.value?[i]:[]);
  const first=Math.max(1,Math.min(project.value.bars.length,Math.floor(rhythmStart.value)||1));
  const last=Math.max(first,Math.min(project.value.bars.length,Math.floor(rhythmEnd.value)||first));
  return Array.from({length:last-first+1},(_,i)=>first+i-1);
});
const rhythmProtectedCount=computed(()=>rhythmMeasures.value.reduce((total,b)=>total+rhythmTargets.value.filter(inst=>project.value.protectedBars[`${inst}:${b}`]).length,0));
function chooseRhythmGroup(group:'rhythm'|'all'|'none'){
  rhythmTargets.value=group==='all'?[...INSTRUMENTS]:group==='rhythm'?['Piano','Contrabass','Bandoneon I','Bandoneon II']:[];
}
function toggleRhythmTarget(inst:Instrument,checked:boolean){
  rhythmTargets.value=checked?[...new Set([...rhythmTargets.value,inst])]:rhythmTargets.value.filter(i=>i!==inst);
}
function applyRhythmSelection(){
  const targets=rhythmTargets.value;
  if(!targets.length||!rhythmMeasures.value.length){rhythmFeedback.value='Select at least one instrument and one measure.';return;}
  const special=targets.includes('Voice')||targets.some(inst=>rhythmMeasures.value.some(b=>(project.value.measureRoles?.[`${inst}:${b}`]??project.value.roles[project.value.bars[b].section]?.[inst])==='melody'));
  if(special&&!window.confirm('This selection includes melody or voice parts. Replacing their rhythmic placement may change the melody. Continue?'))return;
  if(rhythmOverwrite.value&&rhythmProtectedCount.value&&!window.confirm(`Overwrite ${rhythmProtectedCount.value} protected instrument-measures? Their manual note edits will be replaced.`))return;
  try{
    const slots=validateRhythmPattern(rhythmPattern.value,project.value.beats,rhythmGridStep);
    const result=applyRhythmPattern(project.value,score.value,{instruments:targets,measures:rhythmMeasures.value,slots,mode:rhythmMode.value,overwriteProtected:rhythmOverwrite.value});
    project.value=result.project;
    rhythmFeedback.value=`Applied edited rhythm (${slots.length} attacks) to ${result.updated} instrument-measures. Skipped ${result.skippedProtected} protected and ${result.skippedEmpty} silent instrument-measures.`;
    message.value=rhythmFeedback.value;
  }catch(error){rhythmFeedback.value=`Rhythm application failed: ${String(error)}`;}
}
const roles:Role[]=['melody','harmony','chords','bass','fill','variation','rest'];const profiles=[['traditional','Traditional'],['darienzo',"D’Arienzo"],['disarli','Di Sarli'],['fresedo','Fresedo'],['troilo','Troilo'],['canaro','Canaro'],['pugliese','Pugliese'],['milonga','Milonga (2/4)']];
const difficulties:Difficulty[]=['easy','intermediate','advanced'];
const dynamicMarks:DynamicMark[]=DYNAMIC_MARKS;
function ensureInstrumentSettings(){project.value.instrumentSettings??=defaultInstrumentSettings();}
function instrumentDifficulty(inst:Instrument):Difficulty{return project.value.instrumentSettings?.[inst]?.difficulty??project.value.difficulty??'advanced';}
function setInstrumentDifficulty(inst:Instrument,e:Event){ensureInstrumentSettings();project.value.instrumentSettings![inst]??={};project.value.instrumentSettings![inst]!.difficulty=(e.target as HTMLSelectElement).value as Difficulty;}
function instrumentDynamicsOffset(inst:Instrument):number{return project.value.instrumentSettings?.[inst]?.dynamicsOffset??0;}
function setInstrumentDynamicsOffset(inst:Instrument,e:Event){ensureInstrumentSettings();project.value.instrumentSettings![inst]??={};project.value.instrumentSettings![inst]!.dynamicsOffset=Number((e.target as HTMLInputElement).value);}
function instrumentTarget(inst:Instrument):number{return Math.round((project.value.instrumentSettings?.[inst]?.activity??(inst.startsWith('Voice')?0:0.9))*100);}
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
const orchestrationScope=ref<'instrument'|'section'|'all'>('all');
const selectedInstrumentGroup=ref<InstrumentGroup>('rhythm');
const instrumentGroupOptions:InstrumentGroup[]=['rhythm','melody','harmony'];
function groupMembers(group:InstrumentGroup):Instrument[]{return instrumentsForGroup(project.value,group,INSTRUMENTS);}
function toggleGroupMember(inst:Instrument,checked:boolean){
  const current=groupMembers(selectedInstrumentGroup.value);
  if(!checked&&current.length<=1){message.value='Each orchestral group needs at least one instrument.';return;}
  const next=checked?[...current,inst]:current.filter(i=>i!==inst);
  project.value.orchestralGroups??={};
  project.value.orchestralGroups[selectedInstrumentGroup.value]=INSTRUMENTS.filter(i=>next.includes(i));
  if(orchestrationScope.value==='section'&&!next.includes(overviewInstrument.value))focusOverview(next[0],overviewFocus.value);
}
const overviewInstrument=ref<Instrument>('Violin II');
const overviewStart=ref(1);
const overviewEnd=ref(8);
const overviewRole=ref<'inherit'|Role>('inherit');
const overviewArt=ref<Articulation>('auto');
const overviewTechnique=ref<'inherit'|ViolinTechnique>('inherit');
const overviewBassTechnique=ref<'inherit'|BassTechnique>('inherit');
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
    const fresh=setProjectRoster(blankProject({title:newSongTitle.value,sections:newSongSections.value,measuresPerSection:[...newSongLengths.value],beats:newSongBeats.value,bpm:newSongBpm.value}),getDefaultRoster());
    if(!window.confirm('Create a new blank song? Your current song will remain in the local library. You can also export a .tango.json backup.'))return;
    await flushAutosave();
    stopPlayback();
    await adoptLocalSong(fresh);
    selectedBar.value=0;overviewFocus.value=0;overviewStart.value=1;overviewEnd.value=Math.min(8,fresh.bars.length);mapRangeAnchor.value=null;
    overviewInstrument.value='Violin II';chosenSection.value='A';active.value='lead';
    chordEditorOpen.value=false;pending.value=[];newSongOpen.value=false;
  leadDrafts.value={};pendingKeyChange.value=null;
    message.value=`Created ${newSongSections.value} sections (${fresh.bars.length} measures total). Enter chords and melody, then generate.`;
  }catch(error){message.value=`Cannot create blank song: ${String(error)}`;}
}
const copySourceIndex=ref(0);
const copyTargetIndex=ref(1);
const copyHarmonyFeedback=ref('');
const copySectionMode=ref(false);
const leadMeasureEditorOpen=ref(false);
function selectLeadSection(i:number){const span=copySpans.value[i];if(span)selectLeadMeasure(span.start);}
function onLeadSectionHeaderClick(i:number){if(copySectionMode.value&&i!==copySourceIndex.value)copyChordsToSection(i);else selectLeadSection(i);}
function beginSectionCopy(i:number){if(!copySpans.value[i])return;copySourceIndex.value=i;copySectionMode.value=true;copyHarmonyFeedback.value='';}
function cancelSectionCopy(){copySectionMode.value=false;}
function duplicateLeadSection(i:number){
  try{
    const current=project.value,spans=sectionSpans(current),source=spans[i];
    if(!source)throw Error('Source section not found');
    if(spans.length>=26||current.bars.length+source.measures>512)
      throw Error('Cannot copy: maximum 26 sections and 512 measures');
    const label=sectionLetter(spans.length),sourceLabel=source.label;
    const destination=current.bars.length,beatOffset=(destination-source.start)*current.beats;
    const bars=[...current.bars,...current.bars.slice(source.start,source.start+source.measures).map(bar=>({
      ...bar,section:label,melody:bar.melody.map(note=>({...note}))
    }))];
    const cloneScore=(score:Project['generatedScore']):Project['generatedScore']=>{
      if(!score)return undefined;
      const from=source.start*current.beats,to=(source.start+source.measures)*current.beats;
      return Object.fromEntries(Object.entries(score).map(([inst,notes])=>[
        inst,[...notes,...notes.filter(note=>note.start>=from&&note.start<to).map(note=>({...note,start:note.start+beatOffset}))]
      ])) as Project['generatedScore'];
    };
    const copyMeasureMap=<T,>(map:Record<string,T>|undefined):Record<string,T>=>{
      const result={...map};
      for(const [key,value] of Object.entries(map??{})){
        const match=key.match(/^(.*):(\\d+)$/);
        if(!match)continue;
        const index=Number(match[2]);
        if(index>=source.start&&index<source.start+source.measures)
          result[match[1]+':'+(destination+index-source.start)]=structuredClone(value);
      }
      return result;
    };
    const copySectionMap=<T,>(map:Record<string,T>|undefined):Record<string,T>=>{
      const result={...map};
      if(map&&Object.prototype.hasOwnProperty.call(map,sourceLabel))result[label]=structuredClone(map[sourceLabel]);
      return result;
    };
    const next:Project={...current,bars,
      sectionKeys:{...current.sectionKeys,[label]:sectionKey(current,sourceLabel)},
      roles:copySectionMap(current.roles),
      generatedScore:cloneScore(current.generatedScore),
      importedScore:cloneScore(current.importedScore),
      baseScore:cloneScore(current.baseScore),
      protectedBars:copyMeasureMap(current.protectedBars),
      measureRoles:copyMeasureMap(current.measureRoles),
      measureViolinTechniques:copyMeasureMap(current.measureViolinTechniques),
      measureBassTechniques:copyMeasureMap(current.measureBassTechniques),
      violinMarcatoBeats:copySectionMap(current.violinMarcatoBeats),
      violinArpeggioDirections:copySectionMap(current.violinArpeggioDirections),
      pianoFigures:copySectionMap(current.pianoFigures),
      pianoFigureVariation:copySectionMap(current.pianoFigureVariation),
      measureDynamics:copyMeasureMap(current.measureDynamics),
      orchestration:current.orchestration?{
        ...current.orchestration,
        violin:copySectionMap(current.orchestration.violin),
        bandoneon:copySectionMap(current.orchestration.bandoneon),
        contrabass:copySectionMap(current.orchestration.contrabass)
      }:undefined,
      expression:current.expression?{
        ...current.expression,sections:copySectionMap(current.expression.sections)
      }:undefined,
      articulation:current.articulation?{
        ...current.articulation,overrides:copyMeasureMap(current.articulation.overrides)
      }:undefined,
      expressionRanges:current.expressionRanges?.map(range=>structuredClone(range))
    };
    project.value=next;
    selectedBar.value=destination;overviewFocus.value=destination;chosenSection.value=label;
    overviewStart.value=destination+1;overviewEnd.value=next.bars.length;mapRangeAnchor.value=null;
    collapsedLeadSections.value=collapsedLeadSections.value.filter(section=>section!==label);
    message.value='Copied section '+sourceLabel+' to new section '+label+' ('+source.measures+' measures), including orchestral scores and protected edits.';
  }catch(error){message.value='Section copy failed: '+String(error);}
}
function copyChordsToSection(i:number){if(!copySectionMode.value||i===copySourceIndex.value)return;copyTargetIndex.value=i;applySectionChordCopy();}
const collapsedLeadSections=ref<string[]>([]);
function toggleLeadSectionCollapsed(label:string){
  collapsedLeadSections.value=collapsedLeadSections.value.includes(label)
    ?collapsedLeadSections.value.filter(x=>x!==label)
    :[...collapsedLeadSections.value,label];
}
const leadMeasureContext=ref<number|null>(null);
let leadContextTimer:ReturnType<typeof setTimeout>|null=null;
function cancelLeadContextTimer(){if(leadContextTimer!==null){clearTimeout(leadContextTimer);leadContextTimer=null;}}
function showLeadMeasureContext(measure:number,event?:MouseEvent){
  event?.preventDefault();cancelLeadContextTimer();leadMeasureContext.value=measure;
}
function startLeadMeasureLongPress(measure:number){
  cancelLeadContextTimer();
  leadContextTimer=setTimeout(()=>{leadMeasureContext.value=measure;leadContextTimer=null;},550);
}
function shiftVoicePhraseFromLead(measure:number,fromSelectedNote=false){
  leadMeasureContext.value=null;
  const input=window.prompt('Shift Voice notes and attached lyrics from this measure onward by how many beats? Use a negative value to move earlier (for example -0.5).','-0.5');
  if(input===null)return;
  const delta=Number(input),beats=project.value.beats;
  if(!Number.isFinite(delta)||delta===0||Math.abs(delta)>beats*8){message.value='Enter a nonzero beat shift of at most eight measures.';return;}
  const start=fromSelectedNote&&noteMeasure.value[noteSelected.value]?noteMeasure.value[noteSelected.value].start:measure*beats,end=project.value.bars.length*beats;
  const voice=projectInstruments(project.value).find(inst=>inst.startsWith('Voice'));
  if(!voice){message.value='No Voice part is available.';return;}
  const endInput=window.prompt('Last measure to move (inclusive). Only notes starting in this range will shift; notes afterward stay in place.',String(Math.min(project.value.bars.length,measure+2)));
  if(endInput===null)return;
  const lastMeasure=Number(endInput);
  if(!Number.isInteger(lastMeasure)||lastMeasure<measure+1||lastMeasure>project.value.bars.length){window.alert('Enter a valid ending measure at or after the current measure.');return;}
  const shiftUntil=lastMeasure*beats;
  const source=score.value[voice]??[],moving=source.filter(n=>n.start>=start&&n.start<shiftUntil),stationary=source.filter(n=>n.start<start||n.start>=shiftUntil);
  if(!moving.length){message.value='No Voice notes start in this measure or later.';return;}
  const moved=moving.map(n=>({...n,start:Number((n.start+delta).toFixed(6))}));
  if(moved.some(n=>n.start<0||n.start+n.duration>end+1e-7)){
    const last=moving[moving.length-1];
    window.alert(`Cannot shift: a later Voice note at beat ${last.start+1} would extend past the end of the song. No changes were made. Reduce the selected measure range or the shift amount.`);
    return;
  }
  if(moved.some(n=>stationary.some(other=>n.start<other.start+other.duration-1e-7&&other.start<n.start+n.duration-1e-7))){window.alert('Shift would overlap an earlier Voice note. No changes made.');return;}
  if(!window.confirm(`Move ${moving.length} Voice notes and attached lyrics by ${delta} beats, from ${fromSelectedNote?'selected note':'measure '+(measure+1)} through measure ${lastMeasure}? This can cross section boundaries; other parts remain unchanged.`))return;
  const shifted=[...stationary.map(n=>({...n})),...moved].sort((a,b)=>a.start-b.start||a.pitch-b.pitch);
  const next=snapshot(project.value);
  next.importedScore={...(next.importedScore??{}),[voice]:shifted};
  next.generatedScore={...(next.generatedScore??score.value),[voice]:shifted};
  next.protectedBars={...(next.protectedBars??{})};
  const first=Math.max(0,Math.floor(Math.min(start,start+delta)/beats));
  for(let i=first;i<next.bars.length;i++)next.protectedBars[`${voice}:${i}`]=true;
  project.value=next;
  message.value=`Moved ${moving.length} Voice notes with their lyrics by ${delta} beats (through measure ${lastMeasure}).`;
}
function openLeadVoiceLyrics(measure:number){
  leadMeasureContext.value=null;
  const voice=projectInstruments(project.value).find(inst=>inst.startsWith('Voice'));
  if(!voice){message.value='This song has no Voice part.';return;}
  openNoteEditor(voice,measure);
  noteSelected.value=noteMeasure.value.findIndex(n=>Boolean(n.lyric||n.lyric2));
  if(noteSelected.value<0)noteSelected.value=0;
}
function openLeadMelodyNotes(measure:number){
  const roster=projectInstruments(project.value);
  const preferred=roster.find(inst=>project.value.measureRoles?.[`${inst}:${measure}`]==='melody')
    ??roster.find(inst=>project.value.roles?.[project.value.bars[measure].section]?.[inst]==='melody')
    ??roster.find(inst=>inst.startsWith('Violin'))
    ??roster.find(inst=>inst.startsWith('Voice'))
    ??roster[0];
  if(preferred)openNoteEditor(preferred,measure);
}
function toggleLeadMeasureEditor(i:number){if(i===selectedBar.value)leadMeasureEditorOpen.value=!leadMeasureEditorOpen.value;else{selectLeadMeasure(i);leadMeasureEditorOpen.value=true;}}

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
    copySectionMode.value=false;
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
    delete leadDrafts.value[i];
    if(normalized===original)return true;
    project.value.bars[i].chord=normalized;
    refreshHarmonyPreview();
    inlineHarmonyFeedback.value=`Measure ${i+1}: ${normalized||'harmony cleared'} saved. The orchestral preview will use the updated harmony.`;
    message.value=inlineHarmonyFeedback.value;
    return true;
  }catch(error){
    // Do not discard an incomplete freely typed chord. It can be corrected
    // without choosing any autocomplete option.
    leadDrafts.value[i]=input.value;
    inlineHarmonyFeedback.value=`Measure ${i+1}: ${String(error)}. Your draft is retained; correct it to save.`;
    message.value=inlineHarmonyFeedback.value;
    return false;
  }
}
// Lead-sheet chord editing: one uninterrupted keyboard path across measures.
// The dropdown operates on the chord at the caret, never on the entire comma sequence.
const leadDrafts=ref<Record<number,string>>({});
function leadChordText(i:number){return Object.prototype.hasOwnProperty.call(leadDrafts.value,i)?leadDrafts.value[i]:project.value.bars[i]?.chord??'';}
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
function updateLeadChord(i:number,event:Event){
  const input=event.target as HTMLInputElement;
  leadDrafts.value[i]=input.value;
  // Typing never opens a mandatory selection popup. Suggestions are opt-in.
  syncLeadCompletion(i,input,false);
}
function toggleLeadSuggestions(i:number){
  const input=leadChordInput(i);if(!input)return;
  const visible=!(leadCompletion.value.measure===i&&leadCompletion.value.visible);
  input.focus();syncLeadCompletion(i,input,visible);
}
function closeLeadCompletion(i:number){if(leadCompletion.value.measure===i)leadCompletion.value.visible=false;}
function finishLeadChord(i:number,event:FocusEvent){
  // Programmatic completion does not necessarily emit a native change event.
  commitInlineChord(i,event);closeLeadCompletion(i);
}
function chooseLeadChord(i:number,suggestion:string){
  const input=leadChordInput(i);if(!input)return;
  const completed=completeChordToken(input.value,input.selectionStart??input.value.length,suggestion);
  input.value=completed.value;
  leadDrafts.value[i]=completed.value;
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
  if((event.key==='ArrowDown'||event.key==='ArrowUp')&&leadCompletion.value.measure===i&&leadCompletion.value.visible){
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
  delete leadDrafts.value[i];
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
    overviewStart.value=1;overviewEnd.value=Math.min(16,next.bars.length);mapRangeAnchor.value=null;
    chosenSection.value=next.bars[selectedBar.value].section;
    chordEditorOpen.value=false;structureOpen.value=false;
    message.value=`Updated structure: ${sectionLengths.value.length} sections, ${next.bars.length} measures. Generate orchestra again before exporting.`;
  }catch(error){message.value=`Structure update rejected: ${String(error)}`;}
}
const overviewFocus=ref(0);
/** The fixed endpoint of a Shift+click range, or null before the first map selection. */
const mapRangeAnchor=ref<number|null>(null);
const overviewInstruments=computed(()=>INSTRUMENTS); // Include Voice even when its current role is Rest.
// The map filters its presentation, never the original measure indices used by editing actions.
const mapVisibleInstruments=computed(()=>orchestrationScope.value==='instrument'?[overviewInstrument.value]:orchestrationScope.value==='section'?instrumentsForGroup(project.value,selectedInstrumentGroup.value,overviewInstruments.value):overviewInstruments.value);
const collapsedMapSections=ref<number[]>([]);
const mapSectionGroups=computed(()=>sectionSpans(project.value).map((span,sectionIndex)=>({
  ...span,sectionIndex,collapsed:collapsedMapSections.value.includes(span.start),
  visibleCount:collapsedMapSections.value.includes(span.start)?1:span.measures
})));
const mapVisibleMeasures=computed(()=>project.value.bars.flatMap((bar,index)=>{
  const section=mapSectionGroups.value.find(group=>index>=group.start&&index<group.start+group.measures);
  return section?.collapsed&&index!==section.start?[]:[{bar,index}];
})); // Hidden measures retain their original indices for editing and playback.
function toggleMapSection(start:number){
  collapsedMapSections.value=collapsedMapSections.value.includes(start)?collapsedMapSections.value.filter(i=>i!==start):[...collapsedMapSections.value,start];
}
function effectiveRole(inst:Instrument,i:number):Role{return project.value.measureRoles?.[`${inst}:${i}`]??project.value.roles[project.value.bars[i]?.section]?.[inst]??'rest';}
function roleOverridden(inst:Instrument,i:number){return Object.prototype.hasOwnProperty.call(project.value.measureRoles??{},`${inst}:${i}`);}
function violinTechnique(inst:Instrument,i:number):ViolinTechnique|undefined{return inst.startsWith('Violin')?(project.value.measureViolinTechniques?.[`${inst}:${i}`]??project.value.orchestration?.violin?.[project.value.bars[i].section]?.[inst as 'Violin I'|'Violin II']??'tango_staccato'):undefined;}
function articulationOverride(inst:Instrument,i:number):Articulation{return project.value.articulation?.overrides?.[`${inst}:${i}`]??'auto';}
function cellArticulation(inst:Instrument,i:number):string{if(inst==='Contrabass'&&effectiveRole(inst,i)==='bass'&&bassTechniqueFor(project.value,i)!=='traditional')return bassTechniqueFor(project.value,i).replaceAll('_',' ');if(inst.startsWith('Violin')&&effectiveRole(inst,i)==='chords'&&!project.value.articulation?.overrides?.[`${inst}:${i}`]&&['tango_staccato','pizzicato'].includes(violinTechnique(inst,i)??'')){const beats=violinMarcatoBeatsFor(project.value,project.value.bars[i].section,inst as 'Violin I'|'Violin II').map(n=>n+1);return `${violinTechnique(inst,i)==='pizzicato'?'Pizz.':'Stacc.'}${beats.length?' ^'+beats.join(','):''}`;}const mode=measureArticulation(project.value,inst,i);return mode==='marcato_staccato'?'Marc.':mode==='staccato'?'Stacc.':mode==='legato'?(inst.startsWith('Violin')?'Arco':'Legato'):'—';}
function cellLabel(inst:Instrument,i:number):string{const role=effectiveRole(inst,i);const tech=violinTechnique(inst,i);if(inst==='Contrabass'&&role==='bass')return bassTechniqueFor(project.value,i)==='traditional'?'bass':bassTechniqueFor(project.value,i).replaceAll('_',' ');return role==='chords'&&inst==='Piano'?(project.value.pianoFigures?.[project.value.bars[i].section]??'chords_up').replaceAll('_',' '):role==='chords'&&tech?tech.replaceAll('_',' '):role;}
watch([orchestrationScope,selectedInstrumentGroup,()=>project.value.orchestralGroups],()=>{
  if(orchestrationScope.value!=='section')return;
  const members=mapVisibleInstruments.value;
  if(members.length&&!members.includes(overviewInstrument.value))focusOverview(members[0],overviewFocus.value);
});
function focusOverview(inst:Instrument,i:number){overviewInstrument.value=inst;overviewFocus.value=i;overviewStart.value=i+1;overviewEnd.value=i+1;selectedBar.value=i;chosenSection.value=project.value.bars[i].section;overviewRole.value=project.value.measureRoles?.[`${inst}:${i}`]??'inherit';overviewArt.value=articulationOverride(inst,i);overviewTechnique.value=project.value.measureViolinTechniques?.[`${inst}:${i}`]??'inherit';overviewBassTechnique.value=project.value.measureBassTechniques?.[`${inst}:${i}`]??'inherit';}
/** A plain click chooses an anchor. Shift+click extends without replacing the range's editing settings. */
const measureSettingsOpen=ref(false);
let measureSettingsTimer:ReturnType<typeof setTimeout>|null=null;
let suppressMeasureSettingsClick=false;
function cancelMeasureSettingsHold(){
  if(measureSettingsTimer!==null){clearTimeout(measureSettingsTimer);measureSettingsTimer=null;}
}
function openInstrumentMeasureSettings(inst:Instrument,i:number,event?:MouseEvent){
  event?.preventDefault();
  cancelMeasureSettingsHold();
  const keepRange=overviewInstrument.value===inst&&i+1>=overviewStart.value&&i+1<=overviewEnd.value&&overviewEnd.value>overviewStart.value;
  if(!keepRange)focusOverview(inst,i);
  measureSettingsOpen.value=true;
  suppressMeasureSettingsClick=true;
  void nextTick(()=>document.querySelector<HTMLElement>('.measure-settings-popup')?.focus({preventScroll:true}));
}
function startInstrumentMeasureHold(inst:Instrument,i:number){
  cancelMeasureSettingsHold();
  suppressMeasureSettingsClick=false;
  measureSettingsTimer=setTimeout(()=>{measureSettingsTimer=null;openInstrumentMeasureSettings(inst,i);},550);
}
function selectOverviewMapCell(inst:Instrument,i:number,event:Pick<MouseEvent,'shiftKey'>){
  if(suppressMeasureSettingsClick){suppressMeasureSettingsClick=false;return;}

  const selection=selectMapMeasure(mapRangeAnchor.value,i,project.value.bars.length,event.shiftKey);
  mapRangeAnchor.value=selection.anchor;
  if(!event.shiftKey)focusOverview(inst,i);
  else{
    overviewInstrument.value=inst;
    overviewFocus.value=i;
    selectedBar.value=i;
    chosenSection.value=project.value.bars[i].section;
  }
  overviewStart.value=selection.start;
  overviewEnd.value=selection.end;
  overviewNotice.value=event.shiftKey?`Selected ${inst}, measures ${selection.start}–${selection.end}. Choose settings and press Apply to range.`:'';
}
/** Measure headings can anchor/extend the same range for the currently selected instrument. */
function selectOverviewMeasureHeading(i:number,event:Pick<MouseEvent,'shiftKey'>){
  selectOverviewMapCell(overviewInstrument.value,i,event);
  selectLeadMeasure(i);
}
/** Manual From/To edits establish the From field as the next Shift+click anchor. */
/** Set the editable measure range from a contiguous song-structure section. */
function selectOverviewSectionRange(sectionIndex:number){
  const span=sectionSpans(project.value)[sectionIndex];
  if(!span)return;
  overviewStart.value=span.start+1;
  overviewEnd.value=span.start+span.measures;
  mapRangeAnchor.value=span.start;
  overviewFocus.value=span.start;
  selectedBar.value=span.start;
  chosenSection.value=project.value.bars[span.start].section;
  overviewNotice.value=`Selected section ${sectionLetter(sectionIndex)}, measures ${overviewStart.value}–${overviewEnd.value}. Press Apply to update the range.`;
}
function anchorMapRangeFromInput(){
  const n=Number(overviewStart.value);
  if(Number.isFinite(n))mapRangeAnchor.value=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(n)-1));
}
function onMapCellDoubleClick(inst:Instrument,i:number,event:MouseEvent){
  if(!event.shiftKey)openMapCellNotes(inst,i);
}
function onMapCellEnter(inst:Instrument,i:number,event:KeyboardEvent){
  if(event.shiftKey)selectOverviewMapCell(inst,i,event);
  else openMapCellNotes(inst,i);
}

/** The map's single click edits orchestration; a double click or Enter opens exact notes. */
function openMapCellNotes(inst:Instrument,i:number){focusOverview(inst,i);openNoteEditor(inst,i);}
function returnToMap(){
  noteFocusMode.value=false;noteFocusMore.value=false;
  const inst=noteInst.value,i=selectedBar.value;
  focusOverview(inst,i);active.value='arrange';
  void nextTick(()=>document.querySelector<HTMLButtonElement>(`.song-cell[data-map-measure="${i}"][data-map-instrument="${inst}"]`)?.focus());
}
/** Shortcuts work when the editor or its note/attack buttons have focus.
 * Native inputs, select boxes, contenteditable regions and modified browser keys
 * always retain their own keyboard behavior. */
function editorKeyAction(event:KeyboardEvent,editor:EditorKind){
  const target=event.target as HTMLElement|null;
  return resolveEditorShortcut(editor,event.key,{
    altKey:event.altKey,ctrlKey:event.ctrlKey,metaKey:event.metaKey,shiftKey:event.shiftKey,
    isComposing:event.isComposing,defaultPrevented:event.defaultPrevented,
    editable:!!target?.closest('input,textarea,select,[contenteditable]'),
    buttonFocused:!!target?.closest('button,[role="button"]')
  });
}
function handleNoteEditorKey(event:KeyboardEvent){
  if(pendingKeyChange.value||newSongOpen.value)return;
  if((typeof noteEditorTab!=='undefined'&&noteEditorTab.value!=='notes')||(event.target as HTMLElement|null)?.closest?.('[role=tab]'))return;
  const action=editorKeyAction(event,'notes');if(!action)return;
  if(action==='escape'){
    event.preventDefault();
    if(noteDetailsPopup.value)noteDetailsPopup.value=false;
    else if(noteFocusMore.value)noteFocusMore.value=false;
    else if(noteFocusMode.value)exitNoteFocusMode();
    else returnToMap();
  }else if(action==='previousMeasure'&&selectedBar.value>0){event.preventDefault();openNoteEditor(noteInst.value,selectedBar.value-1);}
  else if(action==='nextMeasure'&&selectedBar.value<project.value.bars.length-1){event.preventDefault();openNoteEditor(noteInst.value,selectedBar.value+1);}
  else if(action==='loop'){event.preventDefault();void toggleNoteLoop();}
  else if(action==='delete'&&selectedEvent.value){event.preventDefault();deleteSelectedNote();}
  else if((action==='previous'||action==='next')&&noteMeasure.value.length){
    event.preventDefault();
    const count=noteMeasure.value.length;
    const index=noteSelected.value<0?(action==='next'?0:count-1):Math.max(0,Math.min(count-1,noteSelected.value+(action==='next'?1:-1)));
    selectNoteEvent(index);
    focusSelectedNoteButton();
  }else if((action==='shorten'||action==='lengthen')&&selectedEvent.value){
    event.preventDefault();changeNoteDuration(action==='lengthen'?0.25:-0.25);
  }else if((action==='pitchUp'||action==='pitchDown')&&selectedEvent.value){
    event.preventDefault();
    const pitch=selectedEvent.value.pitch+(action==='pitchUp'?1:-1);
    if(pitch<noteCtx.value.range[0]||pitch>noteCtx.value.range[1])message.value='Selected pitch is at the instrument register limit.';
    else updateSelectedNote('pitch',String(pitch));
  }
}
function focusSelectedNoteButton(){
  void nextTick(()=>{
    const index=noteSelected.value;
    if(index>=0)noteEditorRegion.value?.querySelectorAll<HTMLButtonElement>('.note-event-button')[index]?.focus({preventScroll:true});
    else noteEditorRegion.value?.focus({preventScroll:true});
  });
}
function focusLeadMelody(i:number){
  selectLeadMeasure(i);
  leadMeasureEditorOpen.value=true;
  void nextTick(()=>document.querySelector<HTMLTextAreaElement>('[data-lead-melody]')?.focus());
}
function applyOverviewRange(){const start=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(overviewStart.value)-1)),end=Math.max(start,Math.min(project.value.bars.length-1,Math.floor(overviewEnd.value)-1));if(!Number.isFinite(start)||!Number.isFinite(end)){overviewNotice.value='Invalid measure range';return;}project.value.measureRoles??={};project.value.measureViolinTechniques??={};project.value.measureBassTechniques??={};project.value.articulation??=defaultArticulation();for(let i=start;i<=end;i++){const key=`${overviewInstrument.value}:${i}`;if(overviewRole.value==='inherit')delete project.value.measureRoles[key];else project.value.measureRoles[key]=overviewRole.value;if(overviewArt.value==='auto')delete project.value.articulation.overrides[key];else if(overviewInstrument.value.startsWith('Violin')||overviewInstrument.value.startsWith('Bandoneon'))project.value.articulation.overrides[key]=overviewArt.value;if(overviewInstrument.value==='Contrabass'){if(overviewBassTechnique.value==='inherit')delete project.value.measureBassTechniques[key];else project.value.measureBassTechniques[key]=overviewBassTechnique.value;}if(overviewInstrument.value.startsWith('Violin')){if(overviewTechnique.value==='inherit')delete project.value.measureViolinTechniques[key];else project.value.measureViolinTechniques[key]=overviewTechnique.value;}}
project.value.generatedScore=mergeScores(project.value,generate(project.value));overviewNotice.value=`Applied settings to ${overviewInstrument.value}, measures ${start+1}–${end+1}. Unprotected notes have been regenerated; protected manual measures are retained.`;selectedBar.value=start;}
function applyOverviewSection(){const index=project.value.bars.findIndex(b=>b.section===chosenSection.value);const positions=project.value.bars.map((b,i)=>b.section===chosenSection.value?i:-1).filter(i=>i>=0);if(index<0||!positions.length)return;const begin=Math.min(...positions),finish=Math.max(...positions);if(positions.length!==finish-begin+1){overviewNotice.value='Section is non-contiguous. Select a measure range instead.';return;}overviewStart.value=begin+1;overviewEnd.value=finish+1;mapRangeAnchor.value=begin;applyOverviewRange();}
const bar=computed(()=>project.value.bars[selectedBar.value]);const melodyString=computed(()=>bar.value.melody.map(n=>`${midiName(n.pitch)}:${n.duration}@${n.start}`).join(' '));const melodyText=ref('');watch(selectedBar,()=>melodyText.value=melodyString.value,{immediate:true});watch(()=>project.value.bars[selectedBar.value]?.melody,()=>melodyText.value=melodyString.value,{deep:true});
function setMelody(){const notes:Note[]=[];const tokens=melodyText.value.trim().split(/\s+/).filter(Boolean);let next=0;for(const token of tokens){const m=token.match(/^([A-Ga-g][#b]?-?\d+)(?::([\d.]+))?(?:@([\d.]+))?$/);if(!m){message.value=`Invalid note: ${token}. Example: D5:1@0`;return;}const pitch=parsePitch(m[1]);if(pitch===null)continue;const duration=Number(m[2]??1),start=m[3]===undefined?next:Number(m[3]);if(!Number.isFinite(duration)||duration<=0||start<0||start+duration>project.value.beats+0.00001){message.value=`Invalid timing: ${token}`;return;}notes.push({pitch,start,duration});next=start+duration;}bar.value.melody=notes;message.value=`Updated melody in bar ${selectedBar.value+1}. Regenerate to apply.`;}
function regenerate(){const fresh=generate(project.value);project.value.generatedScore=mergeScores(project.value,fresh);message.value=`Generated ${scoreStats(project.value.generatedScore)} notes across ${INSTRUMENTS.length} parts. Protected measures retained.`;}
function setRole(inst:Instrument,e:Event){
  const sec=chosenSection.value;
  project.value.roles[sec]??={};
  project.value.roles[sec][inst]=(e.target as HTMLSelectElement).value as Role;
  if(inst.startsWith('Voice')&&project.value.roles[sec][inst]==='melody'&&(project.value.instrumentSettings?.[inst]?.activity??0)===0){project.value.instrumentSettings??={};project.value.instrumentSettings[inst]={...project.value.instrumentSettings[inst],activity:0.9};}
  project.value.generatedScore=mergeScores(project.value,generate(project.value));
  message.value=inst==='Violin II'&&project.value.roles[sec]?.['Violin II']==='harmony'&&project.value.roles[sec]?.['Violin I']==='melody'
    ? `Violin II harmony generated from Violin I's melody in section ${sec}. Protected manual measures remain unchanged.`
    : `${inst} role updated in section ${sec}; unprotected parts regenerated.`;
}
function setProtected(inst:Instrument,b:number,v:boolean){project.value.protectedBars[`${inst}:${b}`]=v;}
async function exportMxl(){
  try{
    const xml=exportMusicXml(project.value,score.value);
    const problems=validateMusicXmlDurations(xml,project.value.beats,activeRoster.value.length);
    if(problems.length){message.value='MusicXML validation failed: '+problems.slice(0,3).join('; ');return;}
    const blob=await exportCompressedMusicXml(project.value,score.value);
    download(blob,`${project.value.title.replace(/[^a-z0-9-]+/gi,'-')}.mxl`,'application/vnd.recordare.musicxml');
    message.value='Compressed MusicXML (.mxl) exported. This is not a native MuseScore .mscz file.';
  }catch(err){message.value=`MXL export failed: ${String(err)}`;}
}
async function exportMscz(onlyInstrument?:string){
  try{
    const blob=await exportMuseScoreMscz(project.value,score.value,onlyInstrument);
    download(blob,`${project.value.title.replace(/[^a-z0-9-]+/gi,'-')}${onlyInstrument?'-'+onlyInstrument.replace(/[^a-z0-9-]+/gi,'-'):''}.mscz`,'application/vnd.musescore.mscz');
    message.value='Experimental MuseScore .mscz exported. Check notation in MuseScore; complex rhythms and overlapping voices may not be preserved.';
  }catch(err){message.value=`MSCZ export failed: ${String(err)}`;}
}
function exportXml(){try{const xml=exportMusicXml(project.value,score.value);const problems=validateMusicXmlDurations(xml,project.value.beats,activeRoster.value.length);if(problems.length){message.value='MusicXML validation failed: '+problems.slice(0,3).join('; ');return;}download(xml,`${project.value.title.replace(/[^a-z0-9-]+/gi,'-')}.musicxml`,'application/vnd.recordare.musicxml+xml');message.value='MusicXML exported; all instrument-measures passed rhythmic validation.';}catch(err){message.value=`Export failed: ${String(err)}`;}}
function exportAbcLead(){try{const filename=(project.value.title.replace(/[^a-z0-9-]+/gi,'-')||'tango').toLowerCase();download(exportAbc(project.value,score.value),filename+'-lead-sheet.abc','text/vnd.abc');message.value='ABC lead sheet exported.';}catch(err){message.value='ABC export failed: '+String(err);}}
async function exportForMobileSheets(){try{const filename=(project.value.title.replace(/[^a-z0-9-]+/gi,'-')||'tango').toLowerCase();const bundle=await exportMobileSheetsBundle(project.value,score.value);download(bundle,filename+'-mobilesheets.zip','application/zip');message.value='MobileSheets bundle exported. Extract the ZIP, then import the individual ABC files into MobileSheets.';}catch(err){message.value='MobileSheets export failed: '+String(err);}}
async function importFile(e:Event){
  const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;
  try{
    pending.value=[];pendingChords.value=[];pendingKeys.value=[];
    if(/\.tango(?:\.json)?$/i.test(file.name)){
      await flushAutosave();const imported=await loadProject(file);await adoptLocalSong(imported);
      structureOpen.value=false;message.value='Portable project imported as a separate local song.';closeImportDialog();
    }else if(/\.(mid|midi)$/i.test(file.name)){
      pending.value=importMidi(await file.arrayBuffer());importMode.value='melody';
      message.value=`Found ${pending.value.length} MIDI tracks. Choose the melody track.`;
    }else{
      const result=importMusicXml(await file.text());
      pending.value=result.parts;pendingChords.value=result.chords;pendingKeys.value=result.keys;
      message.value=`Found ${result.parts.length} MusicXML parts. Choose a melody track or import edited score.`;
    }
    if(pending.value.length)importDialogOpen.value=true;
  }catch(err){message.value=`Import failed: ${String(err)}`;}
  finally{(e.target as HTMLInputElement).value='';}
}
function applyImport(){if(!pending.value.length)return;if(importMode.value==='melody'){if(pendingChords.value.length)pendingChords.value.forEach((c,i)=>{if(project.value.bars[i])project.value.bars[i].chord=c;});if(pendingKeys.value.length){project.value.sectionKeys??={};const assigned=new Set<string>();pendingKeys.value.forEach((key,i)=>{const sec=project.value.bars[i]?.section;if(sec&&!assigned.has(sec)){project.value.sectionKeys![sec]=key;assigned.add(sec);}});}const notes=pending.value[selectedTrack.value]?.notes??[];const needed=Math.ceil((Math.max(0,...notes.map(n=>n.start+n.duration)))/project.value.beats);while(project.value.bars.length<needed)project.value.bars.push({chord:'',melody:[],section:project.value.bars.at(-1)?.section??'A'});project.value.bars.forEach((b,i)=>b.melody=notes.filter(n=>Math.floor(n.start/project.value.beats)===i).map(n=>({...n,start:n.start-i*project.value.beats})));message.value=`Imported ${notes.length} melody notes. Set chords and sections, then generate.`;}else{project.value.importedScore=transposeScore(scoreFromParts(pending.value),-(project.value.transposeSemitones??0));let count=0;for(const inst of INSTRUMENTS)for(let b=0;b<project.value.bars.length;b++){const old=(project.value.generatedScore?.[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===b).map(n=>[n.pitch,n.start,n.duration]);const incoming=(project.value.importedScore[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===b).map(n=>[n.pitch,n.start,n.duration]);if(JSON.stringify(old)!==JSON.stringify(incoming)){setProtected(inst,b,true);count++;}}message.value=`Imported edited score; ${count} instrument-measures marked protected. Review before regenerating.`;}pending.value=[];pendingChords.value=[];pendingKeys.value=[];importDialogOpen.value=false;}

function closeSongSettings(){projectDrawerOpen.value=false;}
function closeImportDialog(){importDialogOpen.value=false;pending.value=[];pendingChords.value=[];pendingKeys.value=[];}
function trapModalTab(event:KeyboardEvent){
  if(event.key!=='Tab')return;
  const root=event.currentTarget as HTMLElement;
  const items=[...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.getClientRects().length>0);
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&(document.activeElement===first||!root.contains(document.activeElement))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!root.contains(document.activeElement))){event.preventDefault();first.focus();}
}
watch(projectDrawerOpen,opened=>{if(opened){importDialogOpen.value=false;void nextTick(()=>document.querySelector<HTMLElement>('#song-settings-modal .modal-close')?.focus());}});
watch(importDialogOpen,opened=>{if(opened){projectDrawerOpen.value=false;void nextTick(()=>document.querySelector<HTMLElement>('#import-workflow-modal .modal-close')?.focus());}});

// Separate browser synthesizers give each orchestra part an individual timbre.
// These are lightweight synthesized patches, not General MIDI sample banks.
const instrumentSynths=new Map<string,PolySynth>();
function instrumentSynth(inst:string):PolySynth{
  const existing=instrumentSynths.get(inst);if(existing)return existing;
  const name=inst.toLowerCase();
  const oscillator=name.includes('violin')||name.includes('voice')?'sawtooth':name.includes('bandoneon')?'square':name.includes('bass')?'triangle':name.includes('piano')?'triangle':'sine';
  const attack=name.includes('violin')?0.08:name.includes('bandoneon')?0.035:name.includes('voice')?0.09:0.008;
  const release=name.includes('violin')?0.32:name.includes('bandoneon')?0.17:name.includes('bass')?0.18:0.12;
  const voice=new Tone.PolySynth(Tone.Synth,{oscillator:{type:oscillator as 'sine'|'square'|'triangle'|'sawtooth'},envelope:{attack,decay:0.12,sustain:0.65,release}}).toDestination();
  voice.volume.value=-7+instrumentGainDb(inst);
  instrumentSynths.set(inst,voice);
  return voice;
}
// Playback mix is a device preference, not a change to written note velocities.
const mixStorageKey='tango-arranger-instrument-mix-v1';
function readInstrumentMix():Record<string,number>{
 try{
  const saved=JSON.parse(localStorage.getItem(mixStorageKey)||'{}') as Record<string,unknown>;
  return Object.fromEntries(Object.entries(saved).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>=-18&&v<=12)) as Record<string,number>;
 }catch{return {};}
}
const instrumentMix=ref<Record<string,number>>(readInstrumentMix());
function instrumentGainDb(inst:string):number{
 return instrumentMix.value[inst]??(inst.toLowerCase().includes('violin')?5:0);
}
function updateInstrumentGain(inst:string,event:Event){
 const value=Number((event.target as HTMLInputElement).value);
 if(!Number.isFinite(value))return;
 instrumentMix.value={...instrumentMix.value,[inst]:Math.max(-18,Math.min(12,value))};
 try{localStorage.setItem(mixStorageKey,JSON.stringify(instrumentMix.value));}catch{/* Private browsing may deny storage. */}
 const sampler=samplePlayers.get(inst);if(sampler)sampler.volume.value=-5+instrumentGainDb(inst);
 const voice=instrumentSynths.get(inst);if(voice)voice.volume.value=-7+instrumentGainDb(inst);
}
function resetInstrumentMix(){
 instrumentMix.value={};
 try{localStorage.removeItem(mixStorageKey);}catch{/* Storage unavailable. */}
 for(const [inst,sampler] of samplePlayers)sampler.volume.value=-5+instrumentGainDb(inst);
 for(const [inst,voice] of instrumentSynths)voice.volume.value=-7+instrumentGainDb(inst);
}
const audioEngine=ref<'samples'|'synth'>('samples');
const sampleStatus=ref('Samples load when playback starts');
const samplePlayers=new Map<string,InstanceType<typeof Tone.Sampler>>();
const samplePending=new Map<string,Promise<boolean>>();
function sampleName(inst:string):string{
 const n=inst.toLowerCase();
 return n.includes('violin')?'violin':n.includes('bass')?'contrabass':n.includes('bandoneon')?'harmonium':n.includes('voice')?'harmonium':'piano';
}
function loadSamples(inst:string):Promise<boolean>{
 if(samplePlayers.has(inst))return Promise.resolve(true);
 if(samplePending.has(inst))return samplePending.get(inst)!;
 const promise=new Promise<boolean>(resolve=>{
  let finished=false;
  let player:InstanceType<typeof Tone.Sampler>|undefined;
  const finish=(ok:boolean)=>{if(finished)return;finished=true;clearTimeout(timeout);if(ok&&player)samplePlayers.set(inst,player);else player?.dispose();resolve(ok);};
  const timeout=setTimeout(()=>finish(false),7000);
  try{
   player=new Tone.Sampler({urls:sampleName(inst)==='violin'?{A3:'A3.mp3',C4:'C4.mp3',C5:'C5.mp3',C6:'C6.mp3'}:sampleName(inst)==='contrabass'?{C2:'C2.mp3',E2:'E2.mp3',E3:'E3.mp3'}:sampleName(inst)==='harmonium'?{C3:'C3.mp3',C4:'C4.mp3',C5:'C5.mp3'}:{C3:'C3.mp3',C4:'C4.mp3',C5:'C5.mp3',C6:'C6.mp3'},baseUrl:'https://raw.githubusercontent.com/nbrosowsky/tonejs-instruments/master/samples/'+sampleName(inst)+'/',onload:()=>finish(true),onerror:()=>finish(false)}).toDestination();
   player.volume.value=-5+instrumentGainDb(inst);
  }catch{finish(false);}
 });
 samplePending.set(inst,promise);void promise.then(ok=>{if(!ok)samplePending.delete(inst);});return promise;
}
async function prepareSamples(instruments:string[]){
 if(audioEngine.value!=='samples')return;
 sampleStatus.value='Loading samples…';
 const results=await Promise.all(instruments.map(loadSamples));
 sampleStatus.value=results.every(Boolean)?'Sampled instruments ready':results.some(Boolean)?'Some samples unavailable; using synth fallback':'Samples unavailable; using synth fallback';
}
function triggerInstrument(inst:string,pitch:number,duration:number,time:number,velocity:number){
 const sampler=audioEngine.value==='samples'?samplePlayers.get(inst):undefined;
 if(sampler)sampler.triggerAttackRelease(Tone.Frequency(pitch,'midi').toNote(),duration,time,velocity);
 else instrumentSynth(inst).triggerAttackRelease(Tone.Frequency(pitch,'midi').toFrequency(),duration,time,velocity);
}
let synth:PolySynth|null=null;
async function testAudio(){
  try{
    Tone=await startAudioFromGesture();
    const ctx=Tone.getContext().rawContext as AudioContext;
    if(ctx.state!=='running')throw new Error(`AudioContext state: ${ctx.state}`);
    playExpressiveEvent(ctx,{pitch:69,durationSeconds:0.35,velocity:105},ctx.currentTime+0.02);
    audioStatus.value='Test tone sent (A4, 440 Hz). If silent, check device volume and browser audio settings.';
  }catch(error){audioStatus.value=`Audio test failed: ${String(error)}`;message.value=audioStatus.value;}
}
async function play(origin:PlaybackOrigin){
  // Both play buttons always start a fresh pass. Stop is a separate control.
  stopPlayback();
  const session=noteLoopSession;
  const startMeasure=origin==='selected'?selectedBar.value:0;
  performanceBeat.value=startMeasure*project.value.beats;
  const window=arrangementPlaybackWindow(project.value.bars.length,project.value.beats,project.value.bpm,startMeasure);
  try{
    Tone=await startAudioFromGesture();
    if(session!==noteLoopSession)return;
    synth??=new Tone.PolySynth(Tone.Synth).toDestination();
    await prepareSamples(projectInstruments(project.value));
    if(session!==noteLoopSession)return;
    const transport=Tone.getTransport();transport.stop();transport.cancel();transport.position=0;transport.bpm.value=project.value.bpm;
    let noteCount=0;
    // Voice is a pitched score part: play its notes with the same synthesizer as the instruments.
    // This is a guide tone, not sung or synthesized speech.
    for(const inst of projectInstruments(project.value)){for(const n of score.value[inst]??[]){
      const seconds=arrangementEventTime(n.start,window);
      // The requested measure is a hard start: earlier attacks are not replayed.
      if(seconds===null)continue;
      noteCount++;
      transport.schedule(time=>{
        const barIndex=Math.floor(n.start/project.value.beats);
        const event=measureLoopEvents([n],barIndex,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,project.value.expressionRanges??[],inst,project.value)[0];
        const defaultDuration=noteSoundingDuration(n)*60/project.value.bpm;
        const defaultVelocity=noteSoundingVelocity(n);
        const focusGain=performanceFocus.value&&performanceFocus.value!==inst?0.3:1;
        if(!event)return;
        if(event.slideTo!==undefined||event.endVelocity!==undefined)
          playExpressiveEvent(Tone.getContext().rawContext as AudioContext,{...event,velocity:Math.max(1,Math.round(event.velocity*focusGain)),endVelocity:event.endVelocity===undefined?undefined:Math.max(1,Math.round(event.endVelocity*focusGain))},time);
        else triggerInstrument(inst,event.pitch,event.durationSeconds||defaultDuration,time,Math.max(1,Math.round((event.velocity||defaultVelocity)*focusGain))/127);
      },seconds);
    }}
    if(!noteCount){audioStatus.value=`No notes to play from measure ${window.startMeasure+1}`;message.value=`Nothing to play from measure ${window.startMeasure+1}. Choose an earlier measure, enter notes or generate the orchestra.`;return;}
    audioStatus.value=`Playing from measure ${window.startMeasure+1} · ${noteCount} notes · audio context ${Tone.getContext().state}`;
    transport.scheduleOnce(()=>{if(session!==noteLoopSession)return;playing.value=false;playbackOrigin.value=null;audioStatus.value='Playback finished';transport.stop();synth?.releaseAll();},window.durationSeconds+0.2);
    transport.start();playing.value=true;playbackOrigin.value=origin;
  }catch(error){message.value=`Playback unavailable: ${String(error)}`;stopPlayback();}
}
// Contextual previews use the same audio transport as arrangement playback.
// Lead-sheet preview plays piano chord voicings; map preview isolates one instrument.
async function previewPart(kind:'lead'|'instrument',fromMeasure:number,toMeasure:number,instrument?:string){
  stopPlayback();
  const session=noteLoopSession;
  const beats=project.value.beats;
  const from=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(fromMeasure)));
  const to=Math.max(from,Math.min(project.value.bars.length-1,Math.floor(toMeasure)));
  try{
    Tone=await startAudioFromGesture();
    if(session!==noteLoopSession)return;
    synth??=new Tone.PolySynth(Tone.Synth).toDestination();
    await prepareSamples(kind==='lead'?['Piano']:[instrument??overviewInstrument.value]);
    if(session!==noteLoopSession)return;
    const transport=Tone.getTransport();transport.stop();transport.cancel();transport.position=0;transport.bpm.value=project.value.bpm;
    const beatSeconds=60/project.value.bpm;
    let count=0;
    if(kind==='lead'){
      for(let bar=from;bar<=to;bar++){
        const changes=parseChordSequence(project.value.bars[bar].chord,beats);
        for(let i=0;i<changes.length;i++){
          const change=changes[i];
          if(!change.chord.trim())continue;
          const next=changes[i+1]?.beat??beats;
          const duration=Math.max(0.1,(next-change.beat)*beatSeconds*0.88);
          const pitches=chordTones(change.chord).map(pc=>60+pc);
          const time=((bar-from)*beats+change.beat)*beatSeconds;
          transport.schedule(t=>synth?.triggerAttackRelease(pitches.map(p=>Tone.Frequency(p,'midi').toFrequency()),duration,t,0.55),time);
          count++;
        }
      }
    }else{
      const inst=instrument??overviewInstrument.value;
      for(const n of score.value[inst]??[]){
        if(n.start<from*beats||n.start>=(to+1)*beats)continue;
        const time=(n.start-from*beats)*beatSeconds;
        const duration=Math.max(0.04,noteSoundingDuration(n)*beatSeconds);
        const pitch=n.pitch+(project.value.transposeSemitones??0);
        transport.schedule(t=>triggerInstrument(inst,pitch,duration,t,noteSoundingVelocity(n)/127),time);
        count++;
      }
    }
    if(!count){message.value=kind==='lead'?'No chords to preview in this range.':'No generated notes for this instrument in the selected range.';return;}
    audioStatus.value=`Previewing ${kind==='lead'?'lead-sheet chords':(instrument??overviewInstrument.value)} · measures ${from+1}–${to+1}`;
    transport.scheduleOnce(()=>{if(session!==noteLoopSession)return;playing.value=false;playbackOrigin.value=null;transport.stop();synth?.releaseAll();audioStatus.value='Preview finished';},(to-from+1)*beats*beatSeconds+0.1);
    transport.start();playing.value=true;playbackOrigin.value='selected';
  }catch(error){message.value=`Preview unavailable: ${String(error)}`;stopPlayback();}
}
// A dedicated measure loop shares the Tone transport with full-score playback;
// the two modes are mutually exclusive. Note edits are read fresh on each pass.
const noteLoopPlaying=ref(false);
const noteLoopBeat=ref(-1);
let noteLoopSession=0;
let loopSynth:PolySynth|null=null;
function stopNoteLoop(){noteLoopMeasure.value=-1;if(noteLoopPlaying.value)stopPlayback();else noteLoopSession++;}
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
    // In focus mode the user can loop a phrase; ordinary mode still loops one measure.
    let loopPass=0;
    let lastRangeKey='';
    transport.scheduleRepeat(time=>{
      const range=noteFocusMode.value?noteFocusLoopRange():{from:selectedBar.value,to:selectedBar.value};
      const rangeKey=range.from+':'+range.to;
      if(rangeKey!==lastRangeKey){loopPass=0;lastRangeKey=rangeKey;}
      const bar=range.from+(loopPass++%(range.to-range.from+1));
      Tone.getDraw().schedule(()=>{if(session===noteLoopSession&&noteLoopPlaying.value)noteLoopMeasure.value=bar;},time);
      // Read the current score at the start of every pass, including manual edits.
      const events=measureLoopEvents(score.value[noteInst.value]??[],bar,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,project.value.expressionRanges??[],noteInst.value,project.value);
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
watch(active,tab=>{if(tab!=='notes'){noteFocusMode.value=false;noteFocusMore.value=false;}if(tab!=='notes'&&noteLoopPlaying.value)stopNoteLoop();if(tab!=='rhythm'&&rhythmLoopPlaying.value)stopPlayback();if(capturePlaying.value)stopPlayback();if(tab==='rhythm')void nextTick(()=>rhythmEditorRegion.value?.focus({preventScroll:true}));});
watch(()=>project.value.bpm,bpm=>{if((noteLoopPlaying.value||rhythmLoopPlaying.value||capturePlaying.value)&&Number.isFinite(bpm)&&bpm>0)Tone.getTransport().bpm.value=bpm;});
watch(()=>project.value.beats,()=>{if(noteLoopPlaying.value||rhythmLoopPlaying.value||capturePlaying.value)stopPlayback();});
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
const dynamicsScope=ref<'instrument'|'role'|'all'>('role');
const dynamicsRole=ref<Role>('melody');
const dynamicsRoles:Role[]=['melody','harmony','chords','bass','fill','variation','rest'];
const dynamicsMark=ref<DynamicMark>('mf');
const dynamicsPopupBar=ref<number|null>(null);
const dynamicsPopupRange=ref<number|null>(null);
const dynamicsPopupEndpoint=ref<'start'|'end'>('start');
const dynamicsPopupPosition=ref('');
const dynamicsPopupMark=ref('');
function dynamicNotePositions(bar:number){
 const beats=project.value.beats;
 const targets=dynamicsTargets(bar);
 const starts=new Map<number,string[]>();
 for(const inst of targets)for(const n of score.value[inst]??[]){
  if(Math.floor((n.start+1e-7)/beats)!==bar)continue;
  const pos=Number(n.start.toFixed(6));
  const labels=starts.get(pos)??[];
  labels.push(`${inst}: ${midiName(n.pitch)}`);starts.set(pos,labels);
 }
 return [...starts].sort((a,b)=>a[0]-b[0]).map(([position,labels])=>({position,label:`Beat ${Number((position-bar*beats+1).toFixed(3))} · ${labels.join(', ')}`}));
}
function openDynamicPopup(bar:number,rangeIndex:number|null=null,endpoint:'start'|'end'='start'){
 dynamicsPopupBar.value=bar;dynamicsPopupRange.value=rangeIndex;dynamicsPopupEndpoint.value=endpoint;
 const range=rangeIndex===null?null:project.value.expressionRanges?.[rangeIndex];
 const pos=range?(endpoint==='start'?range.startMeasure*project.value.beats+(range.startBeat??0):range.endMeasure*project.value.beats+(range.endBeat??project.value.beats)):bar*project.value.beats;
 dynamicsPopupPosition.value=String(pos);
 dynamicsPopupMark.value=dynamicsAt(noteInst.value,bar);
}
function saveDynamicPopup(){
 const bar=dynamicsPopupBar.value;if(bar===null)return;
 const rangeIndex=dynamicsPopupRange.value;
 if(rangeIndex===null){applyDynamicsMarkToBar(bar,dynamicsPopupMark.value);dynamicsPopupBar.value=null;return;}
 const r=project.value.expressionRanges?.[rangeIndex];if(!r)return;
 const pos=Number(dynamicsPopupPosition.value),beats=project.value.beats;
 const other=dynamicsPopupEndpoint.value==='start'?r.endMeasure*beats+(r.endBeat??beats):r.startMeasure*beats+(r.startBeat??0);
 if(!Number.isFinite(pos)||pos<0||pos>project.value.bars.length*beats||(dynamicsPopupEndpoint.value==='start'?pos>=other:pos<=other)){message.value='The start must precede the end of the hairpin.';return;}
 if(dynamicsPopupEndpoint.value==='start'){r.startMeasure=Math.floor(pos/beats);r.startBeat=Number((pos%beats).toFixed(6));}
 else{const measure=Math.min(project.value.bars.length-1,Math.floor(pos/beats));r.endMeasure=measure;r.endBeat=Number((pos-measure*beats).toFixed(6));}
 dynamicsPopupBar.value=null;
}
function removeDynamicPopup(){
 const bar=dynamicsPopupBar.value;if(bar===null)return;
 if(dynamicsPopupRange.value!==null)project.value.expressionRanges?.splice(dynamicsPopupRange.value,1);
 else applyDynamicsMarkToBar(bar,'');
 dynamicsPopupBar.value=null;
}
function dynamicsRangeEndpoints(bar:number){
 return (project.value.expressionRanges??[]).flatMap((r,index)=>{
  if(!dynamicsTargets(bar).includes(r.instrument))return [];
  const entries:{index:number;endpoint:'start'|'end';label:string}[]=[];
  if(r.startMeasure===bar)entries.push({index,endpoint:'start',label:`${r.to>=r.from?'〈':'〉'} Start · ${r.instrument}`});
  if(r.endMeasure===bar)entries.push({index,endpoint:'end',label:`${r.to>=r.from?'〈':'〉'} End · ${r.instrument}`});
  return entries;
 });
}
const dynamicsPreviewBars=computed(()=>Array.from({length:Math.min(12,project.value.bars.length)},(_,i)=>Math.max(0,Math.min(project.value.bars.length-1,selectedBar.value-2))+i).filter(b=>b<project.value.bars.length));
function dynamicsTargets(barIndex:number):Instrument[]{
  const roster=projectInstruments(project.value);
  if(dynamicsScope.value==='all')return roster;
  if(dynamicsScope.value==='instrument')return roster.includes(noteInst.value)?[noteInst.value]:[];
  const section=project.value.bars[barIndex]?.section;
  return roster.filter(inst=>project.value.roles?.[section]?.[inst]===dynamicsRole.value);
}
function dynamicsAt(inst:Instrument,barIndex:number):string{
  return project.value.measureDynamics?.[`${inst}:${barIndex}`]?.start??'';
}
function applyDynamicsMarkToBar(barIndex:number,mark:string){
  const targets=dynamicsTargets(barIndex);
  if(!targets.length){message.value='No instruments assigned to this role in this section.';return;}
  project.value.measureDynamics??={};
  for(const inst of targets){
    const key=`${inst}:${barIndex}`;
    const existing={...(project.value.measureDynamics[key]??{})};
    if(mark)existing.start=mark as DynamicMark;else delete existing.start;
    if(!existing.start&&!existing.end)delete project.value.measureDynamics[key];else project.value.measureDynamics[key]=existing;
  }
  selectedBar.value=barIndex;
  message.value=`Updated dynamics in measure ${barIndex+1} for ${targets.length} instrument(s).`;
}
function applyDynamicsGesture(shape:'crescendo'|'diminuendo'|'swell'|'constant'){
  const first=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(expressionStart.value)-1));
  const last=Math.max(first,Math.min(project.value.bars.length-1,Math.floor(expressionEnd.value)-1));
  const velocity:Record<DynamicMark,number>={ppp:24,pp:36,p:48,mp:64,mf:80,f:96,ff:112,fff:124};
  const base=velocity[dynamicsMark.value];
  const start=shape==='crescendo'?Math.max(1,base-35):shape==='diminuendo'?Math.min(127,base+30):shape==='swell'?Math.max(1,base-25):base;
  const end=shape==='crescendo'?Math.min(127,base+30):shape==='diminuendo'?Math.max(1,base-35):shape==='swell'?Math.max(1,base-25):base;
  const targets=new Set<Instrument>();
  project.value.expressionRanges??=[];
  project.value.measureDynamics??={};
  for(let bar=first;bar<=last;bar++){
    const active=dynamicsTargets(bar);
    for(const inst of active)targets.add(inst);
    const ratio=last===first?1:(bar-first)/(last-first);
    const level=shape==='swell'?start+(Math.min(1,ratio*2,2-ratio*2))*(Math.min(127,base+25)-start):start+(end-start)*ratio;
    const mark=DYNAMIC_MARKS.reduce((best,candidate)=>Math.abs(velocity[candidate]-level)<Math.abs(velocity[best]-level)?candidate:best,dynamicsMark.value);
    for(const inst of active){
      const key=`${inst}:${bar}`;
      project.value.measureDynamics[key]={...(project.value.measureDynamics[key]??{}),start:mark};
    }
  }
  if(shape!=='constant'){
    // Split by consecutive role membership, so changing roles between sections
    // never extends a gesture onto instruments outside the chosen role.
    for(const inst of targets){
      let segmentStart=-1;
      for(let bar=first;bar<=last+1;bar++){
        const active=bar<=last&&dynamicsTargets(bar).includes(inst);
        if(active&&segmentStart<0)segmentStart=bar;
        if(!active&&segmentStart>=0){
          const segmentEnd=bar-1;
          if(segmentEnd>segmentStart){
            const relative=(b:number)=>last===first?1:(b-first)/(last-first);
            const level=(b:number)=>shape==='swell'?start+Math.min(1,relative(b)*2,2-relative(b)*2)*(Math.min(127,base+25)-start):start+(end-start)*relative(b);
            project.value.expressionRanges.push({instrument:inst,startMeasure:segmentStart,endMeasure:segmentEnd,startBeat:0,endBeat:project.value.beats,from:Math.round(level(segmentStart)),to:Math.round(level(segmentEnd))});
          }
          segmentStart=-1;
        }
      }
    }
  }
  message.value=`Applied ${shape} across measures ${first+1}–${last+1} to ${targets.size} instrument(s).`;
}

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
function setMeasureDynamic(which:'start'|'end',raw:string){
  const key=`${noteInst.value}:${selectedBar.value}`;
  project.value.measureDynamics??={};
  const entry={...(project.value.measureDynamics[key]??{})};
  if(raw==='')delete entry[which];else entry[which]=raw as DynamicMark;
  if(!entry.start&&!entry.end)delete project.value.measureDynamics[key];else project.value.measureDynamics[key]=entry;
}
function currentMeasureDynamic(which:'start'|'end'):string{return project.value.measureDynamics?.[`${noteInst.value}:${selectedBar.value}`]?.[which]??'';}
function setDuckingEnabled(e:Event){project.value.melodyDucking??={enabled:true,reduction:22};project.value.melodyDucking.enabled=(e.target as HTMLInputElement).checked;}
function setDuckingReduction(e:Event){project.value.melodyDucking??={enabled:true,reduction:22};project.value.melodyDucking.reduction=Math.max(0,Math.min(75,Number((e.target as HTMLInputElement).value)));}
const currentExpressionRanges=computed(()=>project.value.expressionRanges?.map((r,index)=>({...r,index})).filter(r=>r.instrument===noteInst.value)??[]);
const slideSupported=computed(()=>noteInst.value!=='Piano'&&selectedEvent.value?.technique!=='pizzicato');
const noteInst=ref<Instrument>('Violin I');
const noteEditorRegion=ref<HTMLElement|null>(null);
const noteStep=ref(0.5);
const noteLength=ref<number|'auto'>('auto');
const newNoteArticulation=ref<'inherit'|'staccato'|'marcato_staccato'|'legato'>('inherit');
const editorAccidentals=ref<'auto'|'sharp'|'flat'>('auto');
const noteCenter=ref(72);
const noteViewStart=ref(60);
const noteViewEnd=ref(77);
const noteViewCustom=ref(false);
const noteViewOptions=computed(()=>Array.from({length:noteCtx.value.range[1]-noteCtx.value.range[0]+1},(_,i)=>noteCtx.value.range[0]+i));
function changeNoteViewStart(){
  noteViewStart.value=Math.max(noteCtx.value.range[0],Math.min(noteCtx.value.range[1],Math.round(Number(noteViewStart.value))));
  if(noteViewStart.value>noteViewEnd.value)noteViewEnd.value=noteViewStart.value;
  noteViewCustom.value=true;
}
function changeNoteViewEnd(){
  noteViewEnd.value=Math.max(noteCtx.value.range[0],Math.min(noteCtx.value.range[1],Math.round(Number(noteViewEnd.value))));
  if(noteViewEnd.value<noteViewStart.value)noteViewStart.value=noteViewEnd.value;
  noteViewCustom.value=true;
}
function shiftNoteView(semitones:number){
  const [lo,hi]=noteCtx.value.range;
  const span=noteViewEnd.value-noteViewStart.value;
  const start=Math.max(lo,Math.min(hi-span,noteViewStart.value+semitones));
  noteViewStart.value=start;noteViewEnd.value=start+span;noteViewCustom.value=true;
}

const pianoTrebleCenter=ref(73);
const pianoBassCenter=ref(49);
const pianoSplit=computed({
  get:()=>project.value.pianoSplitPitch??60,
  set:(pitch:number)=>{project.value.pianoSplitPitch=Math.max(48,Math.min(72,Math.round(pitch)));}
});
const noteSelected=ref(-1);
const writtenDurationDraft=ref('1');
watch(selectedBar,()=>{writtenDurationDraft.value='';});
type NoteDrag={
  index:number;mode:'move'|'resize-left'|'resize-right';pointerId:number;
  startX:number;startY:number;startPitch:number;startLocal:number;startDuration:number;
  cellWidth:number;rowHeight:number;moved:boolean;longPress:ReturnType<typeof setTimeout>|null
};
let noteDrag:NoteDrag|null=null;
let suppressNoteClick=false;
/** Three gestures share the same stable grid coordinates: the center moves a note
 * horizontally and vertically; the left/right grips adjust its written endpoints.
 * The note element itself can be replaced while dragging, so pointer capture belongs
 * to the persistent scroller and all changes are committed atomically.
 */
function beginNoteDrag(event:PointerEvent,pitch:number,beat:number){
  const index=noteAt(pitch,beat);if(index<0||!event.isPrimary||event.button!==0)return;
  const target=event.currentTarget as HTMLElement;
  const grid=target.closest<HTMLElement>('.note-lane-grid');
  const scroller=target.closest<HTMLElement>('.note-grid-scroll');
  if(!grid||!scroller)return;
  const handle=(event.target as HTMLElement).closest<HTMLElement>('.note-resize-handle');
  const mode:NoteDrag['mode']=handle?.classList.contains('note-resize-handle-left')?'resize-left':handle?'resize-right':'move';
  const note=noteMeasure.value[index];noteSelected.value=index;
  const gridRect=grid.getBoundingClientRect();
  const cellWidth=gridRect.width/noteBeats.value.length;
  dragHistoryStart=snapshotProject(project.value);
  noteDrag={index,mode,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
    startPitch:note.pitch,startLocal:note.start-selectedBar.value*project.value.beats,
    startDuration:note.duration,cellWidth,rowHeight:gridRect.height,moved:false,longPress:null};
  scroller.setPointerCapture(event.pointerId);
  noteDrag.longPress=setTimeout(()=>{if(noteDrag&&!noteDrag.moved){if(noteFocusMode.value)noteFocusMore.value=true;else noteDetailsPopup.value=true;suppressNoteClick=true;}},600);
}
function moveNoteDrag(event:PointerEvent){
  const drag=noteDrag;if(!drag||event.pointerId!==drag.pointerId)return;
  if(Math.abs(event.clientX-drag.startX)+Math.abs(event.clientY-drag.startY)<5)return;
  drag.moved=true;if(drag.longPress){clearTimeout(drag.longPress);drag.longPress=null;}
  const note=noteMeasure.value[drag.index];if(!note)return;
  const dx=event.clientX-drag.startX;
  const beats=project.value.beats;
  let localStart=drag.startLocal;
  let duration=drag.startDuration;
  let pitch=drag.startPitch;
  if(drag.mode==='resize-right'){
    duration=dragWrittenDuration(drag.startDuration,dx,drag.cellWidth,noteStep.value,drag.startLocal,beats);
  }else if(drag.mode==='resize-left'){
    const geometry=dragWrittenNoteLeftEdge(drag.startLocal,drag.startDuration,dx,drag.cellWidth,noteStep.value,beats);
    localStart=geometry.start;duration=geometry.duration;
  }else{
    localStart=dragWrittenNotePosition(drag.startLocal,drag.startDuration,dx,drag.cellWidth,noteStep.value,beats);
    const deltaPitch=Math.round((drag.startY-event.clientY)/drag.rowHeight);
    const [lo,hi]=noteCtx.value.range;
    pitch=Math.max(lo,Math.min(hi,drag.startPitch+deltaPitch));
  }
  const absoluteStart=selectedBar.value*beats+localStart;
  if(note.pitch===pitch&&Math.abs(note.start-absoluteStart)<1e-8&&Math.abs(note.duration-duration)<1e-8)return;
  const events=noteMeasure.value.map(n=>({...n}));
  events[drag.index]={...events[drag.index],pitch,start:absoluteStart,duration};
  try{
    project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
    // Replacing the score sorts by onset and pitch, so follow the edited note.
    const newIndex=noteMeasure.value.findIndex(n=>n.pitch===pitch&&Math.abs(n.start-absoluteStart)<1e-8&&Math.abs(n.duration-duration)<1e-8);
    if(newIndex>=0){drag.index=newIndex;noteSelected.value=newIndex;}
  }catch(error){message.value=`Cannot move or resize note: ${String(error)}`;}
}
function endNoteDrag(event:PointerEvent){
  if(!noteDrag||event.pointerId!==noteDrag.pointerId)return;
  if(noteDrag.longPress)clearTimeout(noteDrag.longPress);
  if(noteDrag.moved){
    suppressNoteClick=true;
    const note=noteMeasure.value[noteDrag.index];
    if(note){auditionEvent(note);message.value=`${noteInst.value} · measure ${selectedBar.value+1}: ${displayPitch(note.pitch)} at beat ${Number((note.start-selectedBar.value*project.value.beats+1).toFixed(2))}, duration ${note.duration} beats. Saved as a protected edit.`;}
  }
  if(dragHistoryStart){
    const before=dragHistoryStart;
    dragHistoryStart=null;
    if(JSON.stringify(before)!==JSON.stringify(project.value)){
      undoHistory.value.push(before);
      if(undoHistory.value.length>historyLimit)undoHistory.value.shift();
      redoHistory.value=[];
      historyBaseline=snapshotProject(project.value);
    }
  }
  noteDrag=null;
  setTimeout(()=>{suppressNoteClick=false;},80);
}
function nudgeSelectedNote(delta:number){
  const note=selectedEvent.value;
  if(!note)return;
  const beats=project.value.beats;
  const local=note.start-selectedBar.value*beats;
  const next=Number(Math.max(0,Math.min(beats-note.duration,local+delta)).toFixed(4));
  if(Math.abs(next-local)<1e-8){
    message.value='Cannot move note further: it must remain inside the measure.';
    return;
  }
  updateSelectedNote('start',String(next));
}
function changeNoteDuration(delta:number){
  if(!selectedEvent.value)return;
  const localStart=selectedEvent.value.start-selectedBar.value*project.value.beats;
  const next=clampWrittenDuration(localStart,Math.round((selectedEvent.value.duration+delta)*4)/4,project.value.beats);
  if(Math.abs(next-selectedEvent.value.duration)<0.0001){
    message.value=delta>0?'This note already reaches the end of the measure.':'Minimum written duration is 0.25 beats.';
    return;
  }
  updateSelectedNote('duration',String(next));
}
function noteCellClick(pitch:number,beat:number){
  if(suppressNoteClick){suppressNoteClick=false;return;}
  toggleNote(pitch,beat);
}
function noteBarClick(pitch:number,beat:number){
  if(suppressNoteClick){suppressNoteClick=false;return;}
  const index=noteAt(pitch,beat);
  if(index>=0)selectNoteEvent(index);
}

const noteCtx=computed(()=>noteEditorContext(project.value,noteInst.value,selectedBar.value));
const noteMeasure=computed(()=>[...(score.value[noteInst.value]??[])]
  .filter(n=>Math.floor((n.start+1e-7)/project.value.beats)===selectedBar.value)
  .sort((a,b)=>a.start-b.start||a.pitch-b.pitch));
const noteBeats=computed(()=>Array.from({length:Math.round(project.value.beats/noteStep.value)},(_,i)=>Number((i*noteStep.value).toFixed(4))));
function noteGridBeatLabel(beat:number):string {
  const whole=Math.floor(beat)+1;
  const subdivision=Math.round((beat-Math.floor(beat))*4);
  return subdivision===0?String(whole):subdivision===1?`${whole}e`:subdivision===2?`${whole}&`:`${whole}a`;
}

function pitchWindow(lo:number,hi:number,center:number):number[]{
  if(lo>hi)return [];
  const size=Math.min(18,hi-lo+1);
  const start=Math.max(lo,Math.min(hi-size+1,Math.round(center)-Math.floor(size/2)));
  return Array.from({length:size},(_,i)=>start+size-1-i);
}
const noteRows=computed(()=>{
  const [lo,hi]=instrumentRange(noteInst.value);
  return noteViewCustom.value
    ?Array.from({length:noteViewEnd.value-noteViewStart.value+1},(_,i)=>noteViewEnd.value-i)
    :pitchWindow(lo,hi,noteCenter.value);
});
const noteStaffViews=computed(()=>{
  if(noteInst.value!=='Piano')return [{id:'single',label:'Piano roll',clef:'',pitches:noteRows.value}];
  const [lo,hi]=instrumentRange('Piano');
  const trebleLo=Math.max(lo,pianoSplit.value,noteViewCustom.value?noteViewStart.value:lo);
  const trebleHi=Math.min(hi,noteViewCustom.value?noteViewEnd.value:hi);
  const bassLo=Math.max(lo,noteViewCustom.value?noteViewStart.value:lo);
  const bassHi=Math.min(hi,pianoSplit.value-1,noteViewCustom.value?noteViewEnd.value:hi);
  const pitches=(lower:number,upper:number,center:number)=>noteViewCustom.value
    ?(lower<=upper?Array.from({length:upper-lower+1},(_,i)=>upper-i):[])
    :pitchWindow(lower,upper,center);
  return [
    {id:'treble',label:'Right hand · upper staff',clef:'Treble clef (G)',pitches:pitches(trebleLo,trebleHi,pianoTrebleCenter.value)},
    {id:'bass',label:'Left hand · lower staff',clef:'Bass clef (F)',pitches:pitches(bassLo,bassHi,pianoBassCenter.value)}
  ].filter(staff=>staff.pitches.length>0);
});
function shiftPianoRegister(staff:'treble'|'bass',semitones:number){
  if(noteViewCustom.value){shiftNoteView(semitones);return;}
  const [lo,hi]=instrumentRange('Piano');
  if(staff==='treble')pianoTrebleCenter.value=Math.max(Math.max(lo,pianoSplit.value)+8,Math.min(hi-8,pianoTrebleCenter.value+semitones));
  else pianoBassCenter.value=Math.max(lo+8,Math.min(Math.min(hi,pianoSplit.value-1)-8,pianoBassCenter.value+semitones));
}
const selectedEvent=computed(()=>noteMeasure.value[noteSelected.value]);
watch(selectedEvent,event=>{if(event)writtenDurationDraft.value=String(event.duration);},{immediate:true});
function applyWrittenDurationDraft(){if(selectedEvent.value)updateSelectedNote('duration',writtenDurationDraft.value);}
const noteDurationPercent=computed(()=>selectedEvent.value?Math.round(selectedEvent.value.duration/project.value.beats*100):0);
const selectedDurationMax=computed(()=>selectedEvent.value?Number((project.value.beats-(selectedEvent.value.start-selectedBar.value*project.value.beats)).toFixed(3)):project.value.beats);
// Drag either measure heading horizontally to scrub whole measures. Navigation
// happens on release, keeping the note editor's active measure in sync.
const measureHeaderDrag=ref<{pointerId:number;startX:number;startBar:number}|null>(null);
function beginMeasureHeaderDrag(event:PointerEvent){
  if(event.button!==0)return;
  measureHeaderDrag.value={pointerId:event.pointerId,startX:event.clientX,startBar:selectedBar.value};
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function finishMeasureHeaderDrag(event:PointerEvent){
  const drag=measureHeaderDrag.value;
  if(!drag||drag.pointerId!==event.pointerId)return;
  measureHeaderDrag.value=null;
  const delta=event.clientX-drag.startX;
  // One measure per 48 pixels, with a small dead zone for ordinary clicks.
  if(Math.abs(delta)<16)return;
  // Swipe left advances; swipe right returns to the preceding measure.
  const steps=-Math.max(1,Math.round(Math.abs(delta)/48))*Math.sign(delta);
  const max=project.value.bars.length;
  const destination=Math.max(0,Math.min(max-1,drag.startBar+steps));
  const actualShift=destination-drag.startBar;
  if(!actualShift)return;
  const oldFrom=noteLoopFrom.value;
  const oldTo=noteLoopTo.value;
  openNoteEditor(noteInst.value,destination);
  // Keep the playback window attached to the edited measure when swiping.
  const span=oldTo-oldFrom;
  const from=Math.max(1,Math.min(max-span,oldFrom+actualShift));
  noteLoopFrom.value=from;
  noteLoopTo.value=from+span;
}
function cancelMeasureHeaderDrag(){measureHeaderDrag.value=null;}
function openNoteEditor(inst:Instrument=overviewInstrument.value,b:number=selectedBar.value){
  // Navigation updates the active loop without interrupting playback for the same instrument.
  const keepFocusLoop=noteLoopPlaying.value&&inst===noteInst.value;
  if(!keepFocusLoop)stopNoteLoop();
  if(capturePlaying.value)stopPlayback();
  const arrivingFromAnotherView=active.value!=='notes';
  if(arrivingFromAnotherView){noteFocusMode.value=false;noteFocusMore.value=false;}
  const previousBar=selectedBar.value;
  const previousLoopLength=Math.max(1,noteLoopTo.value-noteLoopFrom.value+1);
  noteInst.value=inst;selectedBar.value=Math.max(0,Math.min(project.value.bars.length-1,b));
  overviewFocus.value=selectedBar.value;
  if(noteFocusMode.value&&previousBar!==selectedBar.value){
    noteLoopFrom.value=selectedBar.value+1;
    noteLoopTo.value=Math.min(project.value.bars.length,noteLoopFrom.value+previousLoopLength-1);
  }else if(!noteFocusMode.value){noteLoopFrom.value=selectedBar.value+1;noteLoopTo.value=selectedBar.value+1;}
  const range=instrumentRange(inst);
  const existing=(score.value[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===selectedBar.value);
  const typical=inst==='Contrabass'?43:inst==='Piano'?61:inst==='Violin I'?76:inst==='Violin II'?69:inst.startsWith('Bandoneon')?67:72;
  noteCenter.value=Math.max(range[0]+9,Math.min(range[1]-8,existing.length?Math.round(existing.reduce((sum,n)=>sum+n.pitch,0)/existing.length):typical));
  if(arrivingFromAnotherView||!noteFocusMode.value){
    noteViewCustom.value=true;
    const initial=inst==='Piano'?{start:48,end:84}:{start:Math.max(range[0],noteCenter.value-9),end:Math.min(range[1],noteCenter.value+8)};
    noteViewStart.value=Math.max(range[0],initial.start);
    noteViewEnd.value=Math.min(range[1],initial.end);
  }
  if(inst==='Piano'){
    const treble=existing.filter(n=>pianoStaffForPitch(n.pitch,pianoSplit.value)===1);
    const bass=existing.filter(n=>pianoStaffForPitch(n.pitch,pianoSplit.value)===2);
    pianoTrebleCenter.value=treble.length?Math.round(treble.reduce((sum,n)=>sum+n.pitch,0)/treble.length):73;
    pianoBassCenter.value=bass.length?Math.round(bass.reduce((sum,n)=>sum+n.pitch,0)/bass.length):49;
  }
  noteSelected.value=-1;noteDetailsPopup.value=false;figurePreviewKey.value='';
  // Lyrics navigation is sequential: select the first note in the new measure.
  if(inst.startsWith('Voice')&&existing.length&&noteEditorTab.value==='notes'){
    noteSelected.value=0;
    focusSelectedLyricText();
  }
  captureFrom.value=selectedBar.value+1;captureTo.value=selectedBar.value+1;captureEditBar.value=selectedBar.value+1;
  capturePitch.value=existing[0]?.pitch??Math.max(range[0],Math.min(range[1],typical));
  const keyboard=defaultKeyboardRange(capturePitch.value,range);
  captureStartPitch.value=keyboard.start;captureEndPitch.value=keyboard.end;
  expressionStart.value=selectedBar.value+1;expressionEnd.value=selectedBar.value+1;expressionStartBeat.value=1;expressionEndBeat.value=project.value.beats;
  noteStep.value=0.25; // Editing precision is independent of arrangement difficulty.
  noteLength.value='auto'; // Derive new-note length from the active articulation unless overridden.
  newNoteArticulation.value='inherit';
  active.value='notes';
  if(arrivingFromAnotherView)noteEditorTab.value='notes';
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
    const duration=noteLength.value==='auto'
      ?newNoteWrittenDuration(project.value,noteInst.value,selectedBar.value,beat,newNoteArticulation.value)
      :Math.min(noteLength.value,project.value.beats-beat);
    const added=suggestedEditorNote(project.value,noteInst.value,selectedBar.value,beat,pitch,duration);
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
const lyricTimeline= computed(()=>noteMeasure.value.map((note,index)=>({note,index,start:note.start-selectedBar.value*project.value.beats,end:Math.min(project.value.beats,note.start-selectedBar.value*project.value.beats+note.duration)})).filter(x=>x.end>x.start).sort((a,b)=>a.start-b.start));
function focusSelectedLyricText(){
  if(active.value!=='notes'||noteEditorTab.value!=='notes'||!noteInst.value.startsWith('Voice')||noteSelected.value<0)return;
  void nextTick(()=>{
    const input=noteEditorRegion.value?.querySelector<HTMLInputElement>('.lyric-selected-editor input[type="text"]');
    if(input){
      input.focus({preventScroll:true});
      input.select();
    }
  });
}
function selectLyricSlot(index:number){
  noteSelected.value=index;
  focusSelectedLyricText();
}
// Selecting a sung note, including a newly inserted note, places the caret
// in the lyric field. Never refocus on lyric text edits themselves.
watch(noteSelected,(index)=>{if(index>=0)focusSelectedLyricText();});

function lyricSlotShift(direction:-1|1,throughPhrase=false){
  if(!noteInst.value.startsWith('Voice')||noteSelected.value<0)return;
  const ordered=[...new Set(noteMeasure.value.map(n=>n.start))].sort((a,b)=>a-b);
  const current=noteMeasure.value[noteSelected.value];
  if(!current)return;
  const source=ordered.findIndex(t=>Math.abs(t-current.start)<1e-7);
  const destination=source+direction;
  if(destination<0||destination>=ordered.length){message.value='No adjacent note onset in this measure. Navigate to the next measure to continue.';return;}
  const field=lyricVerse.value===1?'lyric':'lyric2';
  const syll=lyricVerse.value===1?'syllabic':'syllabic2';
  const ext=lyricVerse.value===1?'melisma':'melisma2';
  const keys=[field,syll,ext] as const;
  const events=noteMeasure.value.map(n=>({...n}));
  const firstAt=(time:number)=>events.findIndex(n=>Math.abs(n.start-time)<1e-7);
  const sourceIndex=firstAt(ordered[source]);
  const targetIndex=firstAt(ordered[destination]);
  if(sourceIndex<0||targetIndex<0)return;
  const get=(index:number)=>keys.map(key=>(events[index] as unknown as Record<string,unknown>)[key]);
  const set=(index:number,values:unknown[])=>{const note=events[index] as unknown as Record<string,unknown>;keys.forEach((key,i)=>{if(values[i]===undefined)delete note[key];else note[key]=values[i];});};
  if(throughPhrase){
    const indices=ordered.map(firstAt);
    const start=Math.min(source,destination);
    const stop=direction===1?indices.length-1:0;
    if(direction===1){
      const values=indices.slice(source).map(get);
      for(let i=source;i<indices.length;i++)set(indices[i],i===source?[undefined,undefined,undefined]:values[i-source-1]);
    }else{
      const values=indices.slice(0,source+1).map(get);
      for(let i=0;i<=source;i++)set(indices[i],i===source?[undefined,undefined,undefined]:values[i+1]);
    }
    void start;void stop;
  }else{
    const before=get(sourceIndex),after=get(targetIndex);
    set(sourceIndex,after);set(targetIndex,before);
  }
  try{
    project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
    noteSelected.value=noteMeasure.value.findIndex(n=>Math.abs(n.start-ordered[destination])<1e-7);
    message.value=`Moved verse ${lyricVerse.value} ${throughPhrase?'phrase':'syllable'} ${direction<0?'left':'right'} by one note onset. Pitches and timing unchanged.`;
  }catch(error){message.value=`Lyric shift failed: ${String(error)}`;}
}
// Read-only, chord-aware overview of the Voice lyric alignment.
const leadLyricOverview=computed(()=>{
  type LyricCell={beat:number;text:string;chord:string;chordStart:boolean;joinNext:boolean};
  const voice=projectInstruments(project.value).find(inst=>inst.startsWith('Voice'));
  const result=new Map<number,LyricCell[]>();
  if(!voice)return result;
  for(let bar=0;bar<project.value.bars.length;bar++){
    const beats=project.value.beats;
    const notes=(score.value[voice]??[]).filter(n=>n.start>=bar*beats&&n.start<(bar+1)*beats).sort((a,b)=>a.start-b.start);
    const changes=parseChordSequence(project.value.bars[bar].chord,beats).filter(c=>c.chord.trim());
    const entries:LyricCell[]=notes.filter(n=>!!n.lyric?.trim()).map(n=>({
      beat:n.start-bar*beats,text:n.lyric!.trim(),chord:'',chordStart:false,
      joinNext:n.syllabic==='begin'||n.syllabic==='middle'
    }));
    for(const change of changes){
      const matching=entries.find(item=>Math.abs(item.beat-change.beat)<1e-7);
      if(matching){matching.chord=change.chord;matching.chordStart=true;}
      else entries.push({beat:change.beat,text:'',chord:change.chord,chordStart:true,joinNext:false});
    }
    entries.sort((a,b)=>a.beat-b.beat||Number(b.chordStart)-Number(a.chordStart));
    result.set(bar,entries);
  }
  return result;
});
// Keep displaced lyric syllables outside the finite note timeline instead of dropping them.
type OverflowSyllable=[unknown,unknown,unknown];
const lyricOverflow=ref<Record<string,OverflowSyllable[]>>({});
const lyricOverflowKey=computed(()=>String(localSongId.value)+'|'+noteInst.value+'|'+lyricVerse.value);
const currentLyricOverflow=computed(()=>project.value.lyricOverflow?.[noteInst.value+'|'+lyricVerse.value]??[]);
function setLyricOverflow(key:string,items:OverflowSyllable[]){
 lyricOverflow.value={...lyricOverflow.value,[key]:items};
 const part=noteInst.value+'|'+lyricVerse.value;
 project.value=storeLyricSequence({...project.value,lyricOverflow:{...(project.value.lyricOverflow??{}),[part]:items}},noteInst.value,lyricVerse.value,items);
}
function getLyricOverflow(key:string):OverflowSyllable[]{
 const part=noteInst.value+'|'+lyricVerse.value;
 const inSong=project.value.lyricOverflow?.[part];
 if(inSong)return [...inSong];
 // Migrate overflow from earlier device-only versions when available.
 try{
  const raw=JSON.parse(localStorage.getItem('tango-arranger-lyric-overflow-'+key)||'[]');
  if(Array.isArray(raw))return [...raw];
 }catch{/* Ignore malformed legacy data. */}
 return [];
}
function storeLyricSequence(next:Project,inst:string,verse:1|2,overflow:OverflowSyllable[]):Project{
 const field=verse===1?'lyric':'lyric2',syll=verse===1?'syllabic':'syllabic2',ext=verse===1?'melisma':'melisma2';
 const notes=(next.generatedScore?.[inst]??score.value[inst]??[]).slice().sort((a,b)=>a.start-b.start);
 const sequence=notes.filter(n=>Boolean((n as unknown as Record<string,unknown>)[field])).map(n=>{
  const fields=n as unknown as Record<string,unknown>;
  return {text:String(fields[field]),syllabic:typeof fields[syll]==='string'?String(fields[syll]):undefined,melisma:fields[ext]===true};
 });
 for(const item of overflow){if(item[0])sequence.push({text:String(item[0]),syllabic:typeof item[1]==='string'?String(item[1]):undefined,melisma:item[2]===true});}
 return {...next,lyricSequences:{...(next.lyricSequences??{}),[inst+'|'+verse]:sequence}};
}
function rippleLyricSyllable(action:'insert'|'delete'){
  if(!noteInst.value.startsWith('Voice')||noteSelected.value<0)return;
  const selected=noteMeasure.value[noteSelected.value];
  if(!selected)return;
  const beats=project.value.beats;
  const currentBar=selectedBar.value;
  const all=score.value[noteInst.value]??[];
  // A lyric slot is a distinct note onset. Continue across every later measure.
  const byBar=new Map<number,Note[]>();
  const slots:{bar:number;index:number}[]=[];
  for(let bar=currentBar;bar<project.value.bars.length;bar++){
    const events=all.filter(n=>n.start>=bar*beats-1e-7&&n.start<(bar+1)*beats-1e-7).map(n=>({...n}));
    byBar.set(bar,events);
    const onsets=[...new Set(events.map(n=>n.start))].sort((a,b)=>a-b);
    for(const onset of onsets){
      const index=events.findIndex(n=>Math.abs(n.start-onset)<1e-7);
      if(index>=0)slots.push({bar,index});
    }
  }
  const start=slots.findIndex(slot=>slot.bar===currentBar&&Math.abs((byBar.get(slot.bar)??[])[slot.index].start-selected.start)<1e-7);
  if(start<0)return;
  const fields=lyricVerse.value===1?['lyric','syllabic','melisma']:['lyric2','syllabic2','melisma2'];
  const read=(slot:{bar:number;index:number})=>fields.map(k=>(byBar.get(slot.bar)![slot.index] as unknown as Record<string,unknown>)[k]);
  const write=(slot:{bar:number;index:number},values:unknown[])=>{
    const note=byBar.get(slot.bar)![slot.index] as unknown as Record<string,unknown>;
    fields.forEach((k,j)=>{if(values[j]===undefined)delete note[k];else note[k]=values[j];});
  };
  const previous=slots.map(read);
  const overflowKey=lyricOverflowKey.value;
  const overflow=getLyricOverflow(overflowKey);
  const hasSyllable=(values:unknown[])=>values.some(value=>value!==undefined&&value!==null&&value!=='');
  if(action==='insert'&&previous.length&&hasSyllable(previous[previous.length-1]))overflow.unshift(previous[previous.length-1] as OverflowSyllable);
  if(action==='delete'){
    for(let i=start;i<slots.length-1;i++)write(slots[i],previous[i+1]);
    write(slots[slots.length-1],overflow.shift()??[undefined,undefined,undefined]);
  }else{
    for(let i=slots.length-1;i>start;i--)write(slots[i],previous[i-1]);
    write(slots[start],[undefined,undefined,undefined]);
  }
  // Preserve all earlier measures, other verses, pitches and durations.
  // Rebuild each affected measure against the latest project score.
  let next=project.value;
  for(let bar=currentBar;bar<project.value.bars.length;bar++){
    if(!slots.some((slot,i)=>i>=start&&slot.bar===bar))continue;
    next=replaceInstrumentMeasure(next,next.generatedScore??generate(next),noteInst.value,bar,byBar.get(bar)??[]);
  }
  project.value=next;
  setLyricOverflow(overflowKey,overflow);
  message.value=action==='delete'?'Deleted syllable; following lyrics shifted left across measures.':'Inserted empty slot; following lyrics shifted right across measures.';
}
function loopLyricPhrase(){
  if(noteLoopPlaying.value){stopNoteLoop();return;}
  noteFocusMode.value=true;
  noteLoopFrom.value=selectedBar.value+1;
  noteLoopTo.value=Math.min(project.value.bars.length,selectedBar.value+2);
  void toggleNoteLoop();
}

const lyricBatch=ref('');
const lyricVerse=ref<1|2>(1);
const lyricAcrossMeasures=ref(false);
function applyLyricBatch(){
  if(!noteInst.value.startsWith('Voice'))return;
  const tokens=lyricBatch.value.trim().split(/\s+/).filter(Boolean).flatMap(word=>word.split('-').filter(Boolean).map((part,index,all)=>({text:part,syllabic:(all.length===1?'single':index===0?'begin':index===all.length-1?'end':'middle') as NonNullable<Note['syllabic']>})));
  // An underscore consumes the next note onset without adding a new syllable.
  const expanded=tokens.flatMap(t=>t.text.split('_').map((part,index)=>({text:index===0?part:'',syllabic:t.syllabic,melisma:index===0&&t.text.includes('_')})));
  if(!expanded.length){message.value='Enter some lyrics before aligning.';return;}
  const first=selectedBar.value,last=lyricAcrossMeasures.value?project.value.bars.length-1:first;
  const all=score.value[noteInst.value]??[];
  const byBar=new Map<number,Note[]>();
  for(let bar=first;bar<=last;bar++)byBar.set(bar,all.filter(n=>n.start>=bar*project.value.beats&&n.start<(bar+1)*project.value.beats).map(n=>({...n})));
  const slots=[...byBar.entries()].flatMap(([bar,notes])=>[...new Set(notes.map(n=>n.start))].sort((a,b)=>a-b).map(start=>({bar,start})));
  if(expanded.length>slots.length){message.value=`${expanded.length} lyric positions but only ${slots.length} available note onsets. Nothing changed.`;return;}
  const verse=lyricVerse.value,field=verse===1?'lyric':'lyric2',syll=verse===1?'syllabic':'syllabic2',ext=verse===1?'melisma':'melisma2';
  const affected=new Set(slots.slice(0,expanded.length).map(s=>s.bar));
  // Keep unrelated measures and the other verse untouched.
  for(const bar of affected){for(const n of byBar.get(bar)??[]){delete (n as unknown as Record<string,unknown>)[field];delete (n as unknown as Record<string,unknown>)[syll];delete (n as unknown as Record<string,unknown>)[ext];}}
  expanded.forEach((t,i)=>{const slot=slots[i],note=byBar.get(slot.bar)?.find(n=>n.start===slot.start);if(!note)return;const target=note as unknown as Record<string,unknown>;if(t.text){target[field]=t.text.slice(0,160);target[syll]=t.syllabic;}if(t.melisma)target[ext]=true;});
  let next=project.value;
  for(const bar of affected)next=replaceInstrumentMeasure(next,next.generatedScore??generate(next),noteInst.value,bar,byBar.get(bar)??[]);
  project.value=next;
  message.value=`Aligned verse ${verse} to ${expanded.length} note onsets across ${affected.size} measure(s). Edited measures protected.`;
}
function updateSelectedNote(field:'lyric'|'lyric2'|'syllabic'|'syllabic2'|'melisma'|'melisma2'|'pitch'|'start'|'duration'|'velocity'|'articulation'|'technique'|'gate'|'slideTo'|'swellTo'|'subito',raw:string){
  if(!selectedEvent.value)return;
  const events=noteMeasure.value.map(n=>({...n}));const index=noteSelected.value;const old=events[index];
  let value:number|string|boolean=raw;
  if(['pitch','start','duration','velocity','gate','slideTo','swellTo'].includes(field)&&raw!=='inherit')value=Number(raw);
  if(field==='lyric'||field==='lyric2')value=raw.trim().slice(0,160);
  if(field==='melisma'||field==='melisma2')value=raw==='true';
  if(field==='gate')value=(value as number)/100;
  if(field==='duration'){
    if(!Number.isFinite(value)||Number(value)<0.25){message.value='Duration must be at least 0.25 beats';return;}
    const localStart=old.start-selectedBar.value*project.value.beats;
    const limited=clampWrittenDuration(localStart,Number(value),project.value.beats);
    if(limited!==value)message.value=`Duration limited to ${limited} beats: the note must end within this measure.`;
    value=limited;
  }
  if(field==='start')value=selectedBar.value*project.value.beats+(value as number);
  const next={...old,[field]:value};
  if((field==='lyric'||field==='lyric2')&&!raw.trim())delete next[field];
  if(field==='articulation'){
    if(raw==='inherit')delete next.articulation;
    next.accent=raw==='marcato_staccato';
  }
  if(field==='technique'&&raw==='inherit')delete next.technique;
  if(field==='slideTo'&&raw==='inherit')delete next.slideTo;
  if(field==='swellTo'&&raw==='inherit')delete next.swellTo;
  if(field==='subito'&&raw==='inherit')delete next.subito;
  try{
    if(field==='velocity'&&(!Number.isInteger(value)||Number(value)<1||Number(value)>127))throw Error('Velocity must be 1–127');
    if(field==='gate'&&(!Number.isFinite(value)||Number(value)<=0||Number(value)>1))throw Error('Sounding length must be 1–100%');
    project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events.map((n,i)=>i===index?next:n));
    const id=noteMeasure.value.findIndex(n=>n.pitch===next.pitch&&Math.abs(n.start-next.start)<1e-8);
    noteSelected.value=id;
    if(field==='duration')message.value=`${noteInst.value} · measure ${selectedBar.value+1}: written duration set to ${next.duration} beats (saved as a protected edit).`;
    if(['pitch','start','articulation','gate','velocity','slideTo','swellTo'].includes(field))auditionEvent(next);
  }catch(error){message.value=`Note edit rejected: ${String(error)}`;}
}
function deleteSelectedNote(){
  if(!selectedEvent.value)return;
  const removed=noteSelected.value;
  const events=noteMeasure.value.filter((_,i)=>i!==removed);
  project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
  noteSelected.value=-1;
  noteDetailsPopup.value=false;
  message.value=`Deleted note from ${noteInst.value}, measure ${selectedBar.value+1}. Manual measure protected.`;
  focusSelectedNoteButton();
}
function clearNoteMeasure(){project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,[]);noteSelected.value=-1;message.value=`Cleared and protected ${noteInst.value} measure ${selectedBar.value+1}.`;}
function restoreNoteMeasure(){project.value=resetInstrumentMeasure(project.value,noteInst.value,selectedBar.value);noteSelected.value=-1;message.value=`Restored generated ${noteInst.value} measure ${selectedBar.value+1}; other protected measures retained.`;}
const currentNotes=computed(()=>INSTRUMENTS.map(inst=>({inst,notes:(score.value[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===selectedBar.value)})));
function addBar(){const previous=project.value.bars.at(-1);project.value.bars.push({chord:previous?.chord??'',melody:[],section:previous?.section??'A'});selectedBar.value=project.value.bars.length-1;}
function changeSection(e:Event){bar.value.section=(e.target as HTMLSelectElement).value;}
function addArrastre(){const inst:'Piano'='Piano';const b=selectedBar.value,offset=b*project.value.beats;const notes=[...(project.value.generatedScore??generate(project.value))[inst]];const at=offset+Math.min(2,project.value.beats-1);const target=notes.find(n=>n.start>=at)?.pitch??60;notes.push({pitch:target-2,start:at-0.5,duration:0.25,source:'manual'},{pitch:target-1,start:at-0.25,duration:0.25,source:'manual'});project.value.generatedScore={...(project.value.generatedScore??generate(project.value)),[inst]:notes};message.value=`Added a simple notated piano lead-in in measure ${b+1}. This is a prototype gesture, not yet an idiomatic arrastre model.`;}
</script>
<template>
<div class="shell" :class="{'compact-help':compactHelp}"><header class="app-topbar">
  <button class="brand brand-link" type="button" :disabled="performanceMode" @click="active='about'" aria-label="About Tango Arranger and release notes" title="About Tango Arranger and release notes"><span class="logo">𝄞</span><span class="brand-label"><strong>Tango Arranger</strong><small>v{{appVersion}}</small></span></button>
  <div class="topbar-group topbar-playback transport-bar" role="group" aria-label="Arrangement playback">
    <button type="button" :class="['icon-action','transport-play',playing&&playbackOrigin==='beginning'?'play':'primary']" @click="play('beginning')" title="Play from beginning" aria-label="Play arrangement from beginning" :aria-pressed="playing&&playbackOrigin==='beginning'"><AppIcon name="play-from-start"/></button>
    <button type="button" :class="['icon-action','transport-play',playing&&playbackOrigin==='selected'?'play':'primary']" @click="play('selected')" :title="`Play from selected measure ${selectedBar+1}`" :aria-label="`Play arrangement from selected measure ${selectedBar+1}`" :aria-pressed="playing&&playbackOrigin==='selected'"><AppIcon name="play"/><span class="selected-play-measure">{{selectedBar+1}}</span></button>
    <button type="button" class="secondary icon-action transport-stop" :disabled="!playing" @click="stopPlayback" title="Stop playback" aria-label="Stop arrangement playback"><AppIcon name="square"/></button><button type="button" class="secondary performance-topbar-button" :aria-pressed="performanceMode" @click="performanceMode=!performanceMode" :title="performanceMode?'Return to editor':'Show live performance'" :aria-label="performanceMode?'Return to editor':'Show live performance'"><AppIcon :name="performanceMode?'arrow-left':'presentation'"/><span>{{performanceMode?'Editor':'Performance'}}</span></button>
    <details v-if="!performanceMode" class="topbar-menu playback-menu" @toggle="onTopbarMenuToggle" @keydown.esc.stop.prevent="closeTopbarMenuFromKey($event)"><summary class="icon-action" title="Playback tools" aria-label="Playback tools"><AppIcon name="volume-2"/><AppIcon name="chevron-down" class="menu-chevron"/></summary><div class="topbar-menu-panel" @click="closeTopbarMenuOnAction($event)" role="group" aria-label="Playback tools"><label class="playback-engine-choice">Playback engine <select v-model="audioEngine" @change="stopPlayback" aria-label="Playback engine"><option value="samples">Sampled instruments (default)</option><option value="synth">Original synthesizer</option></select></label><span class="header-save-status" role="status">{{audioEngine==='samples'?sampleStatus:'Original synthesizer selected'}}</span><details class="playback-mix-settings" @click.stop><summary>Instrument volumes</summary><div v-for="inst in projectInstruments(project)" :key="inst" class="playback-mix-row" style="display:flex;align-items:center;gap:.5rem;margin:.45rem 0"><label :for="'mix-'+inst" style="flex:1;min-width:6rem">{{rosterDisplayName(inst)}}</label><input :id="'mix-'+inst" type="range" min="-18" max="12" step="1" :value="instrumentGainDb(inst)" @input="updateInstrumentGain(inst,$event)" :aria-label="inst+' volume adjustment in decibels'" style="width:8rem;max-width:45%"/><output style="min-width:3rem;text-align:right">{{instrumentGainDb(inst)>0?'+':''}}{{instrumentGainDb(inst)}} dB</output></div><button type="button" class="secondary" @click="resetInstrumentMix">Reset volumes</button><small class="hint">Changes apply to sampled instruments and synthesizers; saved on this device.</small></details><button type="button" class="secondary" @click="testAudio"><AppIcon name="music"/> Test audio</button><span class="header-save-status" role="status">{{audioStatus}}</span></div></details>
  </div>
  <div v-if="!performanceMode" class="topbar-group topbar-song" role="group" aria-label="Song library and actions">
    <label class="sr-only" for="header-song-picker">Song</label><select id="header-song-picker" class="header-song-picker" :value="localSongId" :disabled="!libraryReady" aria-label="Choose a locally saved song or create an example" title="Choose a local song or create an El Choclo example" @change="chooseSongFromPicker"><optgroup label="Local songs"><option v-if="!localSongs.length" value="">{{project.title||'Untitled tango'}}</option><option v-for="song in localSongs" :key="song.id" :value="song.id">{{song.title}} · {{song.measures}} bars</option></optgroup><optgroup label="Example songs"><option value="__example_el_choclo__">＋ El Choclo — orchestral study (new copy)</option><option value="__example_pequena_2__">＋ Pequeña 2 — Vals (new editable copy · provisional)</option></optgroup></select>
    <button class="secondary icon-action" type="button" title="Create new blank song" aria-label="New blank song" @click="newSongOpen=!newSongOpen"><AppIcon name="plus"/></button>
    <button class="secondary icon-action" type="button" title="Save current song now" aria-label="Save song now" :disabled="!libraryReady" @click="saveNow"><AppIcon name="save"/></button>
    <details class="topbar-menu song-menu" @toggle="onTopbarMenuToggle" @keydown.esc.stop.prevent="closeTopbarMenuFromKey($event)"><summary class="icon-action" title="More song actions" aria-label="Song actions"><AppIcon name="chevron-down"/></summary><div class="topbar-menu-panel" @click="closeTopbarMenuOnAction($event)" role="group" aria-label="Song actions"><button type="button" class="secondary" :disabled="!libraryReady" @click="duplicateLocalSong"><AppIcon name="copy"/> Duplicate current song</button><button type="button" class="secondary danger" :disabled="!libraryReady" @click="deleteCurrentLocalSong"><AppIcon name="trash"/> Delete current song</button><span class="header-save-status" role="status">{{saveStatus}}</span></div></details>
  </div>
  <div v-if="!performanceMode" class="topbar-group topbar-arrange" role="group" aria-label="Orchestration generation"><button class="primary icon-action generate-action" type="button" title="Generate or regenerate orchestra; preserve protected manual measures" aria-label="Generate orchestra" @click="regenerate"><AppIcon name="refresh-cw"/><span class="generate-label">Generate</span></button></div>
  <div v-if="!performanceMode" class="topbar-group topbar-files" role="group" aria-label="Import and export">
    <details class="topbar-menu files-menu" @toggle="onTopbarMenuToggle" @keydown.esc.stop.prevent="closeTopbarMenuFromKey($event)"><summary class="icon-action files-summary" title="Import, export and backups" aria-label="Files: import and export"><AppIcon name="folder-open"/><span class="files-label">Files</span><AppIcon name="chevron-down"/></summary><div class="topbar-menu-panel" @click="closeTopbarMenuOnAction($event)" role="group" aria-label="Import and export actions"><button type="button" class="secondary" @click="importDialogOpen=true"><AppIcon name="upload"/> Import / MuseScore round-trip</button><button type="button" class="secondary" @click="exportXml"><AppIcon name="file-down"/> Export MusicXML</button><button type="button" class="secondary" @click="exportMxl"><AppIcon name="file-down"/> Export compressed MusicXML (.mxl)</button><button type="button" class="secondary" @click="exportMscz()"><AppIcon name="file-down"/> Experimental MuseScore (.mscz)</button><label>Single-instrument MuseScore (.mscz) <select @change="($event.target as HTMLSelectElement).value && exportMscz(($event.target as HTMLSelectElement).value);($event.target as HTMLSelectElement).value=''"><option value="">Choose instrument to export…</option><option v-for="inst in activeRoster" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label><button type="button" class="secondary" @click="exportAbcLead"><AppIcon name="file-down"/> Export ABC lead sheet</button><button type="button" class="secondary" @click="exportForMobileSheets"><AppIcon name="file-down"/> Export for MobileSheets (ABC parts ZIP)</button><button type="button" class="secondary" @click="saveProject(project)"><AppIcon name="archive"/> Export .tango.json backup</button></div></details>
  </div>
  <div v-if="!performanceMode" class="topbar-group topbar-options" role="group" aria-label="Song settings and view">
    <button class="secondary icon-action header-settings" type="button" :aria-expanded="projectDrawerOpen" aria-controls="song-settings-modal" title="Settings for selected song" aria-label="Song settings" @click="projectDrawerOpen=!projectDrawerOpen"><AppIcon name="settings"/></button>
    <button type="button" class="secondary icon-action help-icon-toggle" :aria-pressed="!compactHelp" :title="compactHelp?'Show explanations':'Hide explanations'" :aria-label="compactHelp?'Show explanations':'Hide explanations'" @click="compactHelp=!compactHelp"><AppIcon name="circle-help"/></button>
  </div>
</header>
<div v-if="statusVisible && !statusDismissed && active!=='about' && !performanceMode" class="topbar-status" :style="/\b(failed|error|invalid|cannot|could not)\b/i.test(message)?{background:'#fff0f0',color:'#9b1c1c',borderColor:'#e9a2a2'}:undefined" role="status" aria-live="polite"><span class="topbar-status-text">{{message}}</span><button type="button" class="topbar-status-close" title="Dismiss status message" aria-label="Dismiss status message" @click="statusDismissed=true;statusVisible=false"><AppIcon name="x"/></button></div>
<div v-if="projectDrawerOpen" class="app-modal-backdrop" @click.self="closeSongSettings" @keydown.esc.stop.prevent="closeSongSettings" @keydown.tab="trapModalTab">
  <section id="song-settings-modal" class="app-modal" role="dialog" aria-modal="true" aria-labelledby="song-settings-title">
    <div class="app-modal-heading"><div><h2 id="song-settings-title">Song settings</h2><p>{{project.title||'Untitled tango'}}</p></div><button class="secondary icon-action modal-close" type="button" title="Close song settings" aria-label="Close song settings" @click="closeSongSettings"><AppIcon name="x"/></button></div>
    <div class="app-modal-content"><label>Title<input v-model="project.title"/></label>
      <div class="two"><label>Tempo (BPM)<input v-model.number="project.bpm" type="number" min="40" max="240"/></label><label>Beats per measure<input v-model.number="project.beats" type="number" min="2" max="4"/></label></div>
      <label>Transpose arrangement (semitones)<input type="number" min="-24" max="24" step="1" :value="project.transposeSemitones??0" @change="setTranspose"/><small class="hint">Non-destructive transposition of playback, review, chords and MusicXML.</small></label>
      <label>Orchestra profile<select v-model="project.profile"><option v-for="[id,name] in profiles" :key="id" :value="id">{{name}}</option></select></label>
      <label>Overall difficulty<select v-model="project.difficulty"><option v-for="d in difficulties" :key="d" :value="d">{{d}}</option></select></label>
      <button type="button" class="secondary" @click="convertMeter" :disabled="project.beats!==2">Convert paired 2/4 measures to 4/4</button>
    </div>
    <div class="app-modal-actions"><span class="hint">Changes are autosaved to this song.</span><button type="button" class="primary" @click="closeSongSettings">Done</button></div>
  </section>
</div>
<div v-if="importDialogOpen" class="app-modal-backdrop" @click.self="closeImportDialog" @keydown.esc.stop.prevent="closeImportDialog" @keydown.tab="trapModalTab">
  <section id="import-workflow-modal" class="app-modal" role="dialog" aria-modal="true" aria-labelledby="import-workflow-title">
    <div class="app-modal-heading"><div><h2 id="import-workflow-title">Import &amp; MuseScore round-trip</h2><p>Open a portable song, a melody, or an edited score.</p></div><button class="secondary icon-action modal-close" type="button" title="Close import" aria-label="Close import" @click="closeImportDialog"><AppIcon name="x"/></button></div>
    <div class="app-modal-content">
      <label class="file-picker">Choose .tango.json, legacy .tango, MusicXML or MIDI file<input type="file" accept=".tango,.json,.xml,.musicxml,.mid,.midi" @change="importFile"/></label>
      <div v-if="pending.length" class="import-panel" aria-label="Import track selection">
        <p class="hint">{{pending.length}} part(s) detected. Choose how to apply them.</p>
        <label>Import as<select v-model="importMode"><option value="melody">Melody only</option><option value="score">Edited full score (round-trip)</option></select></label>
        <label v-if="importMode==='melody'">Track<select v-model.number="selectedTrack"><option v-for="(track,i) in pending" :key="i" :value="i">{{track.name}} ({{track.notes.length}} notes)</option></select></label>
        <button type="button" class="primary" @click="applyImport">Apply import</button>
      </div>
      <p class="hint">For MuseScore round-trip, export MusicXML from Tango Arranger, edit it in MuseScore, then import the edited MusicXML as <strong>Edited full score</strong>. Changed instrument-measures are protected.</p>
      <p v-if="message.startsWith('Import failed')" role="alert" class="import-error">{{message}}</p>
    </div>
    <div class="app-modal-actions"><button type="button" class="secondary" @click="closeImportDialog">Close</button></div>
  </section>
</div>
 <section v-if="performanceMode" class="performance-workspace performance-expanded">
  <div class="section-heading"><h2>{{project.title||'Untitled tango'}}</h2></div>
  <div class="performance-compact-bar">
    <label class="performance-compact-seek"><span class="sr-only">Seek to measure</span><input type="range" min="0" :max="Math.max(0,project.bars.length-1)" step="1" :value="performanceBar" @change="performanceSeek(Number(($event.target as HTMLInputElement).value))" :aria-valuetext="`Measure ${performanceBar+1} of ${project.bars.length}`"/><output>{{performanceBar+1}}/{{project.bars.length}}</output></label>
    <div class="performance-section-nav" aria-label="Jump to section">
      <button v-for="(span,si) in performanceSections" :key="`${span.label}:${span.start}`" type="button" class="performance-section-jump" :class="{'performance-section-jump-active':performanceSection===span.label}" :aria-current="performanceSection===span.label?'true':undefined" :title="`Jump to section ${span.label}, measure ${span.start+1}`" @click="performanceSeek(span.start)">{{sectionLetter(si)}}</button>
      <span class="performance-compact-meta"><strong>{{project.bpm}}</strong> BPM <span aria-hidden="true">·</span> Beat <strong>{{performanceMeasureBeat.toFixed(1)}}/{{project.beats}}</strong></span>
    </div>
  </div>
  <div class="performance-roll-panel"><div class="performance-roll-heading"><button v-if="performanceDisplayedPart" type="button" class="performance-roll-part-toggle" :class="{'performance-roll-part-focused':performanceFocus===performanceDisplayedPart}" :aria-pressed="performanceFocus===performanceDisplayedPart" @click="togglePerformanceFocus(performanceDisplayedPart)">{{rosterDisplayName(performanceDisplayedPart)}} <small>{{performanceFocus?'Selected · tap to follow melody':'Melody · tap to focus'}}</small></button><h3 v-else>No melody part</h3></div><div v-if="performanceRoll" class="performance-roll" :class="{'performance-roll-with-lyrics':performanceLyricWindow.length>0}" role="group" :aria-label="`Piano roll for ${performanceDisplayedPart} around measure ${performanceBar+1}`"><div class="performance-roll-playhead" :style="{left:`${Math.max(0,Math.min(100,(performanceBeat-performanceRoll.first)/performanceRoll.length*100))}%`}"></div><span v-for="(n,i) in performanceRoll.notes" :key="i" class="performance-roll-note" :style="{left:`${Math.max(0,(n.start-performanceRoll.first)/performanceRoll.length*100)}%`,width:`${Math.max(.3,Math.min(n.duration,performanceRoll.first+performanceRoll.length-n.start)/performanceRoll.length*100)}%`,bottom:`${(n.pitch-performanceRoll.low)/(performanceRoll.high-performanceRoll.low+1)*100}%`}" :title="`MIDI ${n.pitch} · beat ${n.start+1} · duration ${n.duration}`"></span><div v-if="performanceLyricWindow.length" class="performance-lyrics-overlay"><div class="performance-lyric-line" aria-live="off"><span v-for="(item,i) in performanceLyricWindow" :key="`${item.note.start}:${i}`" :class="{'performance-lyric-active':item.active}">{{item.note.lyric||item.note.lyric2||'·'}}</span></div></div></div><p v-else class="muted">No instrument is assigned the melody role in this measure. Select a part below to view its notes.</p></div>

  <div class="performance-ensemble" aria-label="Instrument parts"><button type="button" class="performance-part" v-for="part in performanceParts" :key="part.inst" :class="{'performance-part-selected':performanceDisplayedPart===part.inst,'performance-part-focused':performanceFocus===part.inst}" :aria-pressed="performanceFocus===part.inst" @click="togglePerformanceFocus(part.inst)"><span class="performance-activity" :class="{'performance-activity-on':part.sounding}"></span><strong>{{part.inst}}</strong><span class="performance-part-role">{{part.role}}</span></button></div>
 </section>
<div v-else class="layout"><main><div v-if="newSongOpen" class="editor" role="region" aria-label="Create blank song">
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
</div><nav class="tabs" aria-label="Main work areas"><button :class="{active:active==='structure'}" @click="active='structure'">Structure, Keys &amp; Ensemble</button><button :class="{active:active==='lead'}" @click="active='lead'">Lead sheet</button><button :class="{active:active==='arrange'}" @click="active='arrange'">Orchestration</button><button :class="{active:active==='rhythm'}" @click="active='rhythm'">Rhythm editor</button><button :class="{active:active==='notes'}" @click="active='notes'">Note editor</button><button :class="{active:active==='about'}" @click="active='about'">About &amp; releases</button></nav>
<Teleport to="body">
  <div v-if="pendingKeyChange" class="key-change-backdrop" @click.self="cancelSectionKeyChange" @keydown.esc.prevent="cancelSectionKeyChange">
    <form class="editor key-change-dialog" role="dialog" aria-modal="true" aria-labelledby="key-change-title" aria-describedby="key-change-description" @submit.prevent="applySectionKeyChange">
      <div class="key-change-content">
        <h2 id="key-change-title">Change section {{pendingKeyChange.section}}: {{pendingKeyChange.from}} → {{pendingKeyChange.to}}</h2>
        <p id="key-change-description">Choose what to transpose. The new key will not be saved until you press <strong>Apply key change</strong>. Chord qualities and inversions are preserved; major/minor changes do not automatically reharmonize.</p>
        <fieldset class="key-change-options">
          <legend>What should change?</legend>
          <label class="key-change-choice" :class="{'is-selected':keyChangeMode==='chords'}">
            <input v-model="keyChangeMode" type="radio" name="section-key-mode" value="chords" />
            <span><strong>Transpose section chords</strong><small>Recommended · keep lead melody and protected notes unchanged</small></span>
          </label>
          <label class="key-change-choice" :class="{'is-selected':keyChangeMode==='chords-and-melody'}">
            <input v-model="keyChangeMode" type="radio" name="section-key-mode" value="chords-and-melody" />
            <span><strong>Transpose chords + melody</strong><small>Also transpose the lead melody and protected instrument notes</small></span>
          </label>
          <label class="key-change-choice" :class="{'is-selected':keyChangeMode==='signature'}">
            <input v-model="keyChangeMode" type="radio" name="section-key-mode" value="signature" />
            <span><strong>Key signature only</strong><small>Keep chords and all note pitches unchanged</small></span>
          </label>
        </fieldset>
        <p v-if="keyChangeError" class="key-change-error" role="alert">Unable to apply: {{keyChangeError}}. You can choose another option or cancel.</p>
      </div>
      <div class="key-change-actions">
        <button type="button" class="secondary" @click="cancelSectionKeyChange">Cancel</button>
        <button type="submit" class="primary key-change-confirm">Apply key change</button>
      </div>
    </form>
  </div>
</Teleport>
<div v-if="chordEditorOpen && active!=='about'" class="editor chord-editor" role="region" aria-label="Measure harmony editor">
  <div class="section-heading"><h2>Harmony · measure {{selectedBar+1}}</h2><button class="secondary" type="button" @click="chordEditorOpen=false">Close</button></div>
  <p class="muted">Chords belong to the measure and apply to all instruments. Leave the field empty to clear the harmony. Commas divide the measure into slots: in 4/4, <code>D,G</code> changes to G on beat 3; <code>D,D,D,G</code> changes on beat 4. Repeated symbols hold the chord.</p>
  <div class="two"><label>Chord sequence<input v-model="chordDraft" spellcheck="false" @keydown.enter.prevent="applyChordEditor" placeholder="D,D,D,G"/></label><label>Beat-by-beat preview<div class="chord-beat-preview">{{chordBeatLabels(chordDraft)}}</div></label></div>
  <div class="overview-actions"><button class="primary" @click="applyChordEditor">Apply harmony</button><button class="secondary" @click="chordEditorOpen=false">Cancel</button></div>
</div>

 <section v-if="active==='about'" class="about-page" aria-labelledby="about-title">
  <div class="section-heading"><h1 id="about-title">About Tango Arranger</h1><button type="button" class="secondary" @click="active='arrange'">← Back to arranging</button></div>
  <p class="about-intro">Tango Arranger is a local-first workbench for creating Argentine tango orchestra arrangements from a lead sheet. Start with a melody and chord progression, choose an orchestration style, and refine the result instrument by instrument.</p>
  <div class="about-grid">
    <article class="editor"><h2>Start with your song</h2><p>Enter a melody and chords in the Lead Sheet, or import MIDI or MusicXML. Define sections, measure counts, keys and your ensemble in Structure, Keys &amp; Ensemble.</p><button class="secondary" type="button" @click="active='lead'">Open Lead Sheet →</button></article>
    <article class="editor"><h2>Arrange the orchestra</h2><p>Generate parts for piano, contrabass, violins and bandoneons. Assign roles, styles, figures and articulations by section or measure in Orchestration.</p><button class="secondary" type="button" @click="active='arrange'">Open Orchestration →</button></article>
    <article class="editor"><h2>Refine individual notes</h2><p>Edit pitches, written durations, velocities, articulations and expressive gestures. Audition notes or loop a measure while you work.</p><button class="secondary" type="button" @click="active='notes'">Open Note Editor →</button></article>
    <article class="editor"><h2>Listen, save and export</h2><p>Play arrangements in your browser, save songs locally, download .tango.json backups, and export MusicXML for further editing in MuseScore.</p><button class="secondary" type="button" @click="active='arrange'">Open Orchestration &amp; score details →</button></article>
  </div>
  <div class="editor about-releases"><h2>Release notes</h2><p class="muted">Current version: v{{appVersion}}. Highlights from recent releases.</p>
    <div class="release-entry"><h3>v5.4.1 · Instrumental section groups</h3><p>Section now means an instrumental group (rhythm, melody or harmony), not a song part. Group membership is editable and saved with the song. All three map scopes show the full song; A/B/C song-part settings live in All.</p></div>
    <div class="release-entry"><h3>v5.4.0 · Scope-filtered orchestration map</h3><p>The map now follows Instrument (one instrument, whole song), Section (all instruments in the selected section), or All (complete map), retaining original measure numbers and editing behavior.</p></div>
    <div class="release-entry"><h3>v5.3.0 · Orchestration scopes</h3><p>Instrument, Section and All sub-tabs separate measure editing from section-wide settings. Section controls are grouped into compact categories; the Rhythm Editor remains in the main navigation without redundant map shortcuts.</p></div>
    <div class="release-entry"><h3>v5.2.0 · Dismissible status below toolbar</h3><p>Status messages now appear directly below the main toolbar, with a close button. Dismissing a message hides it until the next distinct message arrives; the old permanent green workspace banner is removed.</p></div>
    <div class="release-entry"><h3>v5.1.0 · Compact-by-default and mobile workspace</h3><p>Explanatory text is hidden by default; the ? icon in the main toolbar reveals it when needed. Mobile uses a stable two-row task toolbar, horizontally scrolling workspace tabs, larger touch targets, responsive dialogs and stacked editing controls without overflowing the viewport.</p></div>
    <div class="release-entry"><h3>v5.0.0 · Contextual lead-sheet editing and score consolidation</h3><p>The selected lead measure opens an inline editor immediately after its card, rather than at the bottom of the song. Section headers select a section and offer Copy chords; after choosing a source, Paste into another header confirms the destination. The Score Review tab is consolidated into a collapsible Score details panel in Orchestration, preserving note-event lists and protection toggles. The Note Inspector now sits below the piano roll without occupying the right edge.</p></div>
    <div class="release-entry"><h3>v4.9.0 · Topic-grouped toolbar and El Choclo example</h3><p>Playback precedes the song selector; new, save, duplicate and delete are grouped with the library. Generate is in the top bar, Files collects import/export/backup, and song settings remain a dialog. The redundant Arrange your tango heading is removed. The Song selector offers a new editable El Choclo study from the earlier sourced melody, now orchestrated with the current engine.</p></div><div class="release-entry"><h3>v4.8.0 · Focused song workflows</h3><p>Song settings become a modal, file import and MusicXML round-trip get a separate dialog, and the top bar uses consistent SVG icons. The orchestration map moves into Orchestration, redundant section summaries and numbered tabs are removed.</p></div><div class="release-entry"><h3>v4.7.0 · Compact song toolbar and map editing</h3><p>Local song selection, settings, import/export and playback move to the icon-first top bar. The selected instrument’s range editor sits horizontally above the orchestration map, without a redundant instrument selector.</p></div><div class="release-entry"><h3>v4.5.0 · Focus ranges and measure overview</h3><p>The Focus action is now in the upper-right of the regular Note Editor. Set the lowest and highest visible pitches, and use the Loop from/to measure range to view and navigate a multi-measure phrase while editing the selected measure below.</p></div>
    <div class="release-entry"><h3>v4.6.0 · Editor-first workspace</h3><p>Project drawer, compact note toolbar, desktop note inspector, contextual orchestration selection actions, and a larger editing surface. The rhythm and note workspaces share transport styling.</p></div><div class="release-entry"><h3>v4.4.0 · Focused note editing</h3><p>Expand the Note Editor to a full-viewport piano roll. Previous/next measure, instrument loop playback and optional loop-range bounds remain in a compact sticky toolbar; selected-note quick editing stays at the bottom. Exit focus to return to the normal tabs and controls.</p></div>
    <div class="release-entry"><h3>v4.3.3 · Correct staccato and marcato notation</h3><p>Written note lengths stay independent of sounding gates: new staccato and marcato attacks default to quarter notes, with a dot for unaccented staccato and a &gt; accent for accented attacks in MusicXML. Explicit rhythmic durations remain unchanged; the short tango playback remains available.</p></div>
    <div class="release-entry"><h3>v4.3.0 · Collapsible controls and note editor tabs</h3><p>Instrument and measure navigation remain above four note editor tabs: Notes, Live input, Figures, and Dynamics &amp; expression. Control groups can be expanded or collapsed across the workspaces without changing arrangement data.</p></div>
    <div class="release-entry"><h3>v4.3.1 · Precise horizontal note placement</h3><p>All instruments open the Note Editor with sixteenth-note drag snapping, including Easy difficulty. The grid displays subdivisions (1e, 1&amp;, 1a), resize grips leave the note center free to drag, and selected-note controls can move an onset by half a beat.</p></div>
    <div class="release-entry"><h3>v4.2.0 · Note movement and dual-edge resizing</h3><p>Drag the center of a note horizontally to change its onset or vertically to change pitch; diagonal dragging adjusts both. Resize from either edge: left keeps the note end fixed, right keeps its start fixed. Edits snap to the editor grid and remain within the measure.</p></div>
    <div class="release-entry"><h3>v4.1.0 · Contrabass styles</h3><p>Section and measure-level bass techniques: traditional, pizzicato, arco legato, marcato, walking and habanera. Styles change the generated rhythm, sounding length and articulation; MusicXML includes pizzicato/arco markings where appropriate.</p></div>
    <div class="release-entry"><h3>v4.0.0 · Custom live melody keyboard range</h3><p>Choose the start and end note independently to display any chromatic keyboard span within the instrument register, including ranges across multiple octaves. Existing captured takes are preserved when the keyboard display range changes.</p></div>
    <div class="release-entry"><h3>v3.9.0 · Playback start position</h3><p>Separate controls start arrangement playback from measure 1 or from the currently selected measure. A dedicated Stop button ends playback; starting either mode restarts from that position.</p></div>
    <div class="release-entry"><h3>v3.8.0 · Live tap capture</h3><p>Loop a measure or phrase with full orchestration, tap rhythms in real time, or play an on-screen octave keyboard to capture pitched notes. Quantize to a sixteenth-note grid, review and edit draft takes, then apply explicitly.</p></div>
    <div class="release-entry"><h3>v3.7.0 · Keyboard shortcuts for rhythm and note editing</h3><p>Delete/Backspace removes selected notes or rhythm attacks. Arrow keys navigate selections; shortcuts adjust durations, note pitch and rhythm accents, and control loops. Editable fields retain native keyboard behavior.</p></div>
    <div class="release-entry"><h3>v3.5.0 · Shift+click orchestration map ranges</h3><p>Click a map cell or measure heading to anchor a selection, then Shift+click another measure to fill From/To in the instrument range editor. Selected measures are highlighted; applying remains explicit.</p></div>
    <div class="release-entry"><h3>v3.6.0 · Violin duet harmony and manual rhythm grid</h3><p>Violin II Harmony follows Violin I Melody, including protected violin edits. Rhythm presets fill an editable attack, rest, accent and duration grid with live loop playback and selected-part application.</p></div>
    <div class="release-entry"><h3>v3.4.0 · Confirm section key changes</h3><p>Choose a section-key transposition mode, then explicitly apply it. Errors are shown in the dialog.</p></div>
    <div class="release-entry"><h3>v3.3.0 · Free chord entry, note duration and section-key choices</h3><p>Optional chord suggestions, written-duration editing feedback, and section-key transposition options.</p></div>
    <div class="release-entry"><h3>v3.2.0 · Rhythm editor</h3><p>Apply tango rhythmic presets to the rhythm section, any selected parts, a section, measure range or whole song. Preserve voicings, protect manual edits and preview accents.</p></div>
    <div class="release-entry"><h3>v3.1.0 · Accurate note durations</h3><p>Full-length piano-roll note bars, real endpoint touch handles, immediate duration slider and numeric edits, and protected-score persistence tests.</p></div>
    <div class="release-entry"><h3>v3.0.0 · About &amp; release notes</h3><p>Click the Tango Arranger title to open this guide and release history. Added an About &amp; releases navigation tab.</p></div>
    <div class="release-entry"><h3>v2.9.0 · Dynamics</h3><p>Measure start/end dynamics, crescendo and diminuendo export, individual subito markings, and melody-aware accompaniment balancing.</p></div>
    <div class="release-entry"><h3>v2.8.0 · Touch duration editing</h3><p>Larger note-resize handles, pointer capture and duration stepper buttons for touch editing.</p></div>
    <div class="release-entry"><h3>v2.7.0 · Note editor and compact workspace</h3><p>Direct note manipulation, note properties, advanced difficulty defaults, persistent playback controls and optional explanatory text.</p></div>
    <div class="release-entry"><h3>v2.6.x · Notation, mobile and audio</h3><p>Cleaner rhythmic notation, piano bass/treble separation, mobile layout improvements, audio initialization and sound testing.</p></div>
    <div class="release-entry"><h3>v2.5.0 · Piano figures and expression</h3><p>Moving inversions, countermelodies, melody responses, note slides and dynamic ranges.</p></div>
    <div class="release-entry"><h3>v2.4.0 · Violin arpeggios</h3><p>Four-note arpeggio figures spanning a full measure, with ascending, descending and alternating directions.</p></div>
    <div class="release-entry"><h3>v2.3.0 · Song structure workspace</h3><p>Dedicated Structure &amp; Keys tab and a measure-focused Orchestration.</p></div>
  </div>
  <p class="hint">Tango Arranger is an experimental arranging tool. Generated parts are starting points for musical editing, not historically verified transcriptions of individual orchestras. Songs are saved in this browser; export a .tango.json backup to transfer them between devices.</p>
</section>
<section v-if="active==='structure'" class="structure-tab"><div class="section-heading"><h2>Song structure, section keys &amp; ensemble</h2><button type="button" class="secondary" @click="active='arrange'">← Back to orchestration</button></div><p class="muted">Define the form of your tango here: the number of sections, their measure lengths, and the concert-pitch key of each section. Select the instrument roster here before preparing the Lead Sheet. Orchestration remains the workspace for instrument roles, articulation and note editing.</p>
<div class="editor"><details class="control-fold" open><summary>Song structure</summary><div class="section-heading"><h3>Song structure</h3><button class="secondary" type="button" @click="structureOpen?structureOpen=false:editStructure()">{{structureOpen?'Cancel structure edit':'Edit sections & measures'}}</button></div>
<p class="muted">Default: five 16-measure sections labeled A–E. Change the number of sections and the length of each one; MuseScore receives alphabetical rehearsal marks at every section boundary.</p>
<div class="section-summary"><span v-for="(span,i) in sectionSpans(project)" :key="i"><strong>{{sectionLetter(i)}}</strong> · {{span.measures}} bars ({{span.start+1}}–{{span.start+span.measures}})</span></div>
<div v-if="structureOpen" class="structure-editor"><div class="structure-fields"><label v-for="(length,i) in sectionLengths" :key="i">Section {{sectionLetter(i)}} · measures<input type="number" min="1" max="128" v-model.number="sectionLengths[i]"/><button v-if="i<sectionSpans(project).length" type="button" class="secondary" :disabled="sectionLengths.length!==sectionSpans(project).length||sectionLengths.some((n,j)=>n!==sectionSpans(project)[j]?.measures)||sectionLengths.length>=26||project.bars.length+sectionSpans(project)[i].measures>512" :title="`Copy section ${sectionLetter(i)} to the end, including orchestral scores and protected edits`" @click="duplicateLeadSection(i);sectionLengths=sectionSpans(project).map(span=>span.measures)"><AppIcon name="copy"/> Copy section</button></label></div><div class="overview-actions"><button class="secondary" type="button" :disabled="sectionLengths.length>=26" @click="addSection">+ Add section</button><button class="secondary" type="button" :disabled="sectionLengths.length<=1" @click="removeSection">− Remove last section</button><button class="primary" type="button" @click="applyStructure">Apply {{sectionLengths.length}} sections · {{structureTotal}} measures</button></div><p class="hint">Existing notes and chords are preserved by position within their section. Shortening a section removes its final measures; expanding inserts empty measures. Structural changes invalidate generated/imported scores and their protection flags.</p></div></details></div>
<div class="editor"><details class="control-fold" open><summary>Keys by section</summary><h3>Keys by section</h3><p class="muted">Choose a new key, then decide whether to change the signature only, transpose section chords, or transpose both chords and lead melody. Chord qualities are preserved; this is transposition, not automatic major/minor reharmonization.</p><div class="section-key-grid"><label v-for="sec in sections" :key="sec">{{sec}} key<select :value="keyForSection(sec)" @change="setSectionKey(sec,$event)"><optgroup label="Major"><option v-for="key in majorKeys" :key="key" :value="key">{{key}} major</option></optgroup><optgroup label="Minor"><option v-for="key in minorKeys" :key="key" :value="key">{{key.slice(0,-1)}} minor</option></optgroup></select></label></div></details></div>
<div class="editor"><details class="control-fold roster-management" open><summary>Orchestra roster · {{ activeRoster.length }} parts</summary>
  <p class="hint roster-help">Choose a built-in or saved roster, then add, reorder or remove instruments. Changing the roster clears generated parts but retains manual edits for instruments that remain.</p>
  <div class="two"><label>Instrument family<select v-model="newPartFamily"><option>Violin</option><option>Voice</option><option>Bandoneon</option><option>Piano</option><option>Contrabass</option><option>Guitar</option><option>Clarinet</option><option>Flute</option><option>Trumpet</option><option>Trombone</option></select></label><div class="align-bottom"><button type="button" @click="addRosterPart">+ Add instrument</button></div></div>
  <div class="role-list roster-parts"><div v-for="(inst,index) in activeRoster" :key="inst" class="role-row"><input type="text" :value="rosterDisplayName(inst)" :aria-label="`Name for ${inst}`" maxlength="80" @change="renameRosterPart(inst,$event)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" /><label v-if="inst.startsWith('Bandoneon')" title="Use treble and bass staves in MuseScore exports"><input type="checkbox" :checked="!!project.bandoneonGrandStaff?.[inst]" @change="project.bandoneonGrandStaff={...project.bandoneonGrandStaff,[inst]:($event.target as HTMLInputElement).checked}"/> Two staves</label><button type="button" class="secondary" :disabled="index===0" @click="moveRosterPart(inst,-1)">↑</button><button type="button" class="secondary" :disabled="index===activeRoster.length-1" @click="moveRosterPart(inst,1)">↓</button><button type="button" class="secondary" :disabled="activeRoster.length===1" @click="removeRosterPart(inst)">Remove</button></div></div>
  <div class="two"><label>Preset name<input v-model="rosterPresetName" placeholder="My tango orchestra"/></label><div class="align-bottom"><button type="button" @click="saveCurrentRoster">Save roster preset</button></div></div>
  <div class="two"><label>Saved rosters<select v-model="rosterPresetSelection"><option value="">Select a preset</option><option v-for="preset in rosterPresets" :key="preset.name" :value="preset.name">{{preset.name}}</option></select></label><div class="align-bottom"><button type="button" :disabled="!rosterPresetSelection" @click="loadSelectedRoster">Load</button><button type="button" class="secondary" :disabled="!rosterPresetSelection || ['Factory seven-part','Quartet','Sextet','Septet','Orquesta típica'].includes(rosterPresetSelection)" @click="deleteSelectedRoster">Delete</button></div></div>
  <button type="button" class="secondary" @click="makeRosterDefault">Set current roster as default</button> <button type="button" class="secondary" @click="applyRoster([...FACTORY_INSTRUMENTS])">Restore factory roster</button>
</details></div>
<div class="overview-actions"><button type="button" class="primary" @click="active='lead'">Continue to Lead Sheet →</button></div></section>
<section v-else-if="active==='lead'">
<div class="section-heading"><h2>Melody & harmony</h2><button type="button" class="secondary" :disabled="!undoHistory.length" @click="restoreHistory('undo')">↶ Undo</button><button type="button" class="secondary" :disabled="!redoHistory.length" @click="restoreHistory('redo')">↷ Redo</button><span>{{project.bars.length}} measures</span></div><div class="overview-actions" role="group" aria-label="Lead sheet piano preview"><button type="button" class="secondary" @click="previewPart('lead',0,project.bars.length-1)">▶ Chords from start</button><button type="button" class="secondary" @click="previewPart('lead',selectedBar,project.bars.length-1)">▶ Chords from selected measure {{selectedBar+1}}</button><button type="button" class="secondary" :disabled="!playing" @click="stopPlayback">■ Stop</button></div><p class="muted">Compose melody and harmony here; use Orchestration for instrument roles and techniques. Each section displays its key and measure range. Enter chords directly in any measure. <strong>Enter</strong> saves and advances to the next chord field; <strong>Tab</strong> / <strong>Shift+Tab</strong> move forward / back between chord fields. Type any valid chord symbol freely; suggestions are optional. Tap <strong>Suggestions</strong> to browse variants for the chord under the caret, or simply keep typing. Repeated chords like <code>C,C</code> are allowed. Completion changes only the chord at the cursor, so <code>Dm,A7</code> stays intact when you edit the second chord. For 4/4, <code>D,G</code> changes on beat 3 and <code>D,D,D,G</code> on beat 4. Diminished: <code>Ddim</code> (triad), <code>Ddim7</code> (fully diminished seventh), <code>Dm7b5</code> (half-diminished). Click a measure number to select its melody below; double-click it to focus the melody text editor.</p>
<div v-if="copySectionMode" class="lead-copy-banner" role="status"><span><strong>Copy section {{sectionLetter(copySourceIndex)}}</strong> · click the destination section header to paste. Melody, keys and instrument settings will not change.</span><button type="button" class="secondary" @click="cancelSectionCopy">Cancel</button></div>
<div class="lead-sections">
  <section v-for="(span,si) in sectionSpans(project)" :key="`${span.label}:${span.start}`" class="lead-section" :aria-label="`Section ${sectionLetter(si)}`">
    <div :class="['lead-section-heading',{'lead-copy-source':copySectionMode&&copySourceIndex===si}]">
      <div class="lead-section-title"><button type="button" class="lead-section-collapse" :aria-expanded="!collapsedLeadSections.includes(span.label)" :title="collapsedLeadSections.includes(span.label)?'Expand section':'Collapse section'" @click="toggleLeadSectionCollapsed(span.label)">{{collapsedLeadSections.includes(span.label)?'▸':'▾'}}</button><button type="button" :class="['lead-section-select',{'is-selected':project.bars[selectedBar]?.section===span.label}]" :aria-pressed="project.bars[selectedBar]?.section===span.label" :aria-label="copySectionMode&&copySourceIndex!==si?`Paste copied chords into section ${sectionLetter(si)}`:`Select section ${sectionLetter(si)}, measures ${span.start+1} to ${span.start+span.measures}`" @click="onLeadSectionHeaderClick(si)"><strong class="lead-section-letter">{{sectionLetter(si)}}</strong><span><strong>Section {{span.label}}</strong><small>Measures {{span.start+1}}–{{span.start+span.measures}} · {{span.measures}} measures</small></span></button></div>
      <div class="lead-section-actions"><button type="button" class="secondary lead-section-copy" :disabled="sectionSpans(project).length>=26||project.bars.length+span.measures>512" :title="`Duplicate section ${sectionLetter(si)} at the end of the song`" @click="duplicateLeadSection(si)"><AppIcon name="copy"/> Copy section</button><button v-if="!copySectionMode" type="button" class="secondary lead-section-copy" :aria-label="`Copy chords from section ${sectionLetter(si)}`" :title="`Copy chords from section ${sectionLetter(si)}`" @click="beginSectionCopy(si)"><AppIcon name="copy"/> Copy chords</button><button v-else-if="copySourceIndex===si" type="button" class="secondary lead-section-copy" @click="cancelSectionCopy">Cancel copy</button><button v-else type="button" class="primary lead-section-copy" :aria-label="`Copy chords into section ${sectionLetter(si)}`" @click="copyChordsToSection(si)"><AppIcon name="copy"/> Paste into {{sectionLetter(si)}}</button></div>
      <label class="lead-key-label">Key signature<select :value="keyForSection(span.label)" :aria-label="`Key for section ${span.label}`" @change="setSectionKey(span.label,$event)"><optgroup label="Major"><option v-for="key in majorKeys" :key="key" :value="key">{{key}} major</option></optgroup><optgroup label="Minor"><option v-for="key in minorKeys" :key="key" :value="key">{{key.slice(0,-1)}} minor</option></optgroup></select></label>
    </div>
    <div v-if="!collapsedLeadSections.includes(span.label)" class="lead-measure-grid">
      <template v-for="offset in span.measures" :key="span.start+offset-1"><div :class="['lead-measure',{selected:selectedBar===span.start+offset-1}]">
        <button type="button" class="lead-measure-select" @contextmenu="showLeadMeasureContext(span.start+offset-1,$event)" @touchstart.passive="startLeadMeasureLongPress(span.start+offset-1)" @touchend="cancelLeadContextTimer" @touchcancel="cancelLeadContextTimer" @touchmove="cancelLeadContextTimer" :aria-pressed="selectedBar===span.start+offset-1" :title="`Select measure ${span.start+offset}; long-press or right-click for editing options`" @click="selectLeadMeasure(span.start+offset-1)" @dblclick.stop="focusLeadMelody(span.start+offset-1)"><strong>{{span.start+offset}}</strong><small>{{project.bars[span.start+offset-1].melody.length}} melody notes</small></button>
        <div v-if="leadMeasureContext===span.start+offset-1" class="lead-measure-context" role="menu"><strong>Measure {{span.start+offset}} · Options</strong><button type="button" role="menuitem" @click="focusLeadMelody(span.start+offset-1);leadMeasureContext=null">Edit measure melody…</button><button type="button" role="menuitem" @click="openLeadVoiceLyrics(span.start+offset-1)">Open Voice note / lyric alignment</button><button type="button" role="menuitem" @click="shiftVoicePhraseFromLead(span.start+offset-1)">Shift Voice notes + lyrics in time…</button><button type="button" role="menuitem" @click="leadMeasureContext=null">Close</button></div>
        <div v-if="leadLyricOverview.get(span.start+offset-1)?.length" class="lead-lyric-overview" :aria-label="`Lyrics in measure ${span.start+offset}`" style="margin:.4rem 0;padding:.45rem;border-top:1px solid #607080">
          <div style="display:flex;align-items:flex-end;flex-wrap:wrap;gap:.12rem .25rem;line-height:1.3">
            <span v-for="(item,i) in leadLyricOverview.get(span.start+offset-1)" :key="i" :title="`Beat ${(item.beat+1).toFixed(2)}`" style="display:inline-flex;flex-direction:column;align-items:flex-start;min-width:1.4rem;white-space:nowrap">
              <strong style="font-size:.78rem;min-height:1.1rem;color:var(--accent,#b98a45)">{{item.chordStart?item.chord:''}}</strong>
              <span style="font-size:1rem">{{item.text}}{{item.joinNext?'-':''}}</span>
            </span>
          </div>
        </div>
        <div class="lead-chord-editor"><label class="lead-chord-label" :for="`lead-chord-${span.start+offset-1}`">Chords</label><input :id="`lead-chord-${span.start+offset-1}`" type="text" :data-lead-chord="span.start+offset-1" :value="leadChordText(span.start+offset-1)" :aria-label="`Chords in measure ${span.start+offset}`" :aria-expanded="leadCompletion.measure===span.start+offset-1&&leadCompletion.visible&&leadSuggestions.length>0" aria-autocomplete="list" placeholder="e.g. Dm,A7" spellcheck="false" autocomplete="off" @focus="focusLeadChord(span.start+offset-1,$event)" @input="updateLeadChord(span.start+offset-1,$event)" @click="updateLeadChord(span.start+offset-1,$event)" @blur="finishLeadChord(span.start+offset-1,$event)" @keydown="handleLeadChordKey(span.start+offset-1,$event)"/><button type="button" class="chord-suggestion-toggle secondary" :aria-expanded="leadCompletion.measure===span.start+offset-1&&leadCompletion.visible" :aria-label="`Show optional chord suggestions for measure ${span.start+offset}`" @pointerdown.prevent @click="toggleLeadSuggestions(span.start+offset-1)">⌄ Suggestions</button>
          <div v-if="leadCompletion.measure===span.start+offset-1&&leadCompletion.visible&&leadSuggestions.length" class="chord-suggestions" role="listbox" :aria-label="`Chord completions for measure ${span.start+offset}`"><button v-for="(suggestion,idx) in leadSuggestions" :key="suggestion" type="button" role="option" tabindex="-1" :aria-selected="leadCompletion.highlight===idx" :class="{'is-highlighted':leadCompletion.highlight===idx}" @mousedown.prevent @click="chooseLeadChord(span.start+offset-1,suggestion)">{{suggestion}}</button></div>
        </div>
      </div>
      <div v-if="selectedBar===span.start+offset-1&&leadMeasureEditorOpen" class="lead-measure-editor" role="region" :aria-label="`Edit melody in measure ${selectedBar+1}`"><div class="lead-measure-editor-heading"><h3>Measure {{selectedBar+1}} · melody</h3><button type="button" class="secondary" @click="leadMeasureEditorOpen=false" aria-label="Close measure editor"><AppIcon name="x"/></button></div><div class="lead-measure-editor-actions"><button type="button" class="secondary" @click="openChordEditor(selectedBar)">Expanded harmony · {{bar.chord||'No chord'}}</button><span class="hint">Section {{bar.section}} · {{keyForSection(bar.section)}} · key editable in the section header</span></div><label>Melody notes<textarea v-model="melodyText" data-lead-melody rows="3" spellcheck="false"/></label><div class="lead-measure-editor-actions"><button class="primary" @click="setMelody">Apply melody</button><button class="secondary" @click="openLeadMelodyNotes(selectedBar)"><AppIcon name="pencil"/> Edit melody-part notes</button></div><p class="hint">Lead-sheet melody remains the generative source; instrument notes are edited separately and protected from regeneration.</p></div></template>
    </div>
  </section>
</div>
<p v-if="inlineHarmonyFeedback" class="inline-harmony-feedback" role="status">{{inlineHarmonyFeedback}}</p>
<button class="secondary lead-add-measure" @click="addBar">+ Add measure to last section</button></section>
<section v-else-if="active==='arrange'" class="overview-section"><div class="section-heading"><h2>Orchestration</h2><span>{{project.bars.length}} measures · {{activeRoster.length}} parts</span></div>
<div class="orchestration-scope-tabs" role="tablist" aria-label="Orchestration editing scope">
<button v-for="scope in (['all','section','instrument'] as const)" :key="scope" type="button" role="tab" :id="`scope-${scope}`" :aria-selected="orchestrationScope===scope" :aria-controls="'scope-map-panel'" :class="{selected:orchestrationScope===scope}" @click="orchestrationScope=scope">{{scope==='instrument'?'Instrument':scope==='section'?'Section':'All'}}</button>
</div>
<div class="orchestration-map-filter" role="group" aria-label="Orchestration map filter">
<label v-if="orchestrationScope==='instrument'">Instrument <select v-model="overviewInstrument" aria-label="Instrument shown in orchestration map"><option v-for="inst in overviewInstruments" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label>
<label v-if="orchestrationScope==='section'">Orchestra group <select v-model="selectedInstrumentGroup" aria-label="Orchestra group shown in orchestration map"><option v-for="group in instrumentGroupOptions" :key="group" :value="group">{{group==='rhythm'?'Rhythm section':group==='melody'?'Melody section':'Harmony section'}}</option></select></label>
<span v-if="orchestrationScope==='all'" class="muted">All instruments · all {{project.bars.length}} measures</span>
<span v-else class="muted">{{mapVisibleInstruments.length}} {{mapVisibleInstruments.length===1?'instrument':'instruments'}} · {{mapVisibleMeasures.length}} measures</span>
</div>
<details v-if="orchestrationScope==='section'" class="orchestration-group-members"><summary>Choose instruments in this group</summary><div class="orchestration-group-checks" role="group" :aria-label="`Instruments in ${selectedInstrumentGroup} section`"><label v-for="inst in activeRoster" :key="inst"><input type="checkbox" :checked="groupMembers(selectedInstrumentGroup).includes(inst)" :disabled="groupMembers(selectedInstrumentGroup).length===1&&groupMembers(selectedInstrumentGroup).includes(inst)" @change="toggleGroupMember(inst,($event.target as HTMLInputElement).checked)"/>{{rosterDisplayName(inst)}}</label></div><p class="hint">Group membership is saved with this song. These are functional viewing groups, not the A/B/C song parts or generated musical roles.</p></details>
<div class="orchestration-instrument-scope" id="scope-map-panel" role="tabpanel" :aria-labelledby="`scope-${orchestrationScope}`">
<p class="muted orchestration-scope-help">Instrument shows one part; Section shows an editable instrumental group; All shows every part. All views cover the entire song. Select a map cell to edit its instrument and measure. Shift+click extends the range; double-click edits notes.</p>
<div class="overview-legend"><span><i class="legend-dot melody"></i> Melody</span><span><i class="legend-dot chords"></i> Chords / arpeggio / pizzicato</span><span><i class="legend-dot harmony"></i> Harmony</span><span><i class="legend-dot bass"></i> Bass</span><span><i class="legend-dot rest"></i> Rest</span><span><i class="legend-dot overridden"></i> Manual override (corner)</span></div>
<div class="map-context-toolbar" role="toolbar" aria-label="Selected orchestration measures"><strong>{{rosterDisplayName(overviewInstrument)}}</strong><span>Measures {{overviewStart}}–{{overviewEnd}}</span><button type="button" class="secondary" @click="measureSettingsOpen=true">Edit selected measures</button><button type="button" class="secondary icon-action" title="Edit notes in selected measure" aria-label="Edit notes" @click="openNoteEditor(overviewInstrument,overviewStart-1)"><AppIcon name="pencil"/></button></div>
<div v-if="measureSettingsOpen" class="note-properties-backdrop" @click.self="measureSettingsOpen=false"></div>
<div v-if="measureSettingsOpen" class="note-properties note-properties-popup measure-settings-popup" role="dialog" aria-modal="true" tabindex="-1" :aria-label="`Settings for ${rosterDisplayName(overviewInstrument)}, measures ${overviewStart}–${overviewEnd}`" @keydown.esc.stop.prevent="measureSettingsOpen=false">
<div class="note-properties-popup-header"><strong>{{rosterDisplayName(overviewInstrument)}} · measures {{overviewStart}}–{{overviewEnd}}</strong><button type="button" class="secondary" @click="measureSettingsOpen=false">✕ Close</button></div>
<div class="editor overview-edit"><p class="map-range-summary" role="status">{{rosterDisplayName(overviewInstrument)}} · measures <strong>{{overviewStart}}–{{overviewEnd}}</strong> · {{Math.max(0,overviewEnd-overviewStart+1)}} selected</p><div class="overview-controls"><label>Section shortcut<select :value="''" aria-label="Select section to set measure range" @change="selectOverviewSectionRange(Number(($event.target as HTMLSelectElement).value));($event.target as HTMLSelectElement).value=''"><option value="" disabled>Choose section…</option><option v-for="(span,i) in sectionSpans(project)" :key="`${span.start}:${i}`" :value="i">{{sectionLetter(i)}} · {{span.start+1}}–{{span.start+span.measures}}</option></select></label><label>From measure<input v-model.number="overviewStart" type="number" min="1" :max="project.bars.length" @change="anchorMapRangeFromInput"/></label><label>To measure<input v-model.number="overviewEnd" type="number" :min="overviewStart" :max="project.bars.length" @change="anchorMapRangeFromInput"/></label><label>Musical role<select v-model="overviewRole"><option value="inherit">Inherit section</option><option v-for="role in dynamicsRoles" :key="role" :value="role">{{role}}</option></select></label><label v-if="overviewInstrument.startsWith('Violin')||overviewInstrument.startsWith('Bandoneon')">Articulation<select v-model="overviewArt"><option v-for="mode in articulationModes" :key="mode" :value="mode">{{mode==='auto'?'Inherit default':mode==='legato'?(overviewInstrument.startsWith('Violin')?'Arco / legato':'Legato'):mode.replaceAll('_',' ')}}</option></select></label><label v-if="overviewInstrument.startsWith('Violin')">Chord technique<select v-model="overviewTechnique"><option value="inherit">Inherit section</option><option v-for="tech in violinTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label><label v-if="overviewInstrument==='Contrabass'">Bass technique<select v-model="overviewBassTechnique"><option value="inherit">Inherit section</option><option v-for="tech in bassTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label></div><div v-if="overviewInstrument==='Piano'" class="overview-piano-figure"><label>Piano figure · section {{chosenSection}}<select :value="pianoFigureForSection()" @change="setPianoFigure"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label><button class="secondary" @click="nextPianoFigureVariation">↻ New section piano variation</button><p class="hint">Generated Piano Chords measures in this section use the selected figure. Protected manual measures stay unchanged.</p></div><div class="overview-actions" role="toolbar" aria-label="Apply selected instrument settings"><button type="button" class="primary" title="Apply role, articulation and technique to selected measures" aria-label="Apply to range" @click="applyOverviewRange();measureSettingsOpen=false">✓ Apply</button><button type="button" class="secondary icon-action" :title="`Apply settings to entire section ${chosenSection}`" :aria-label="`Apply to section ${chosenSection}`" @click="applyOverviewSection"><AppIcon name="layers"/></button><button type="button" class="secondary icon-action" title="Select all measures in the song" aria-label="Select whole song" @click="overviewStart=1;overviewEnd=project.bars.length;mapRangeAnchor=0"><AppIcon name="list-check"/></button><button type="button" class="secondary icon-action" title="Regenerate orchestration, retaining protected edits" aria-label="Regenerate orchestration" @click="regenerate"><AppIcon name="refresh-cw"/></button><button type="button" class="secondary icon-action" title="Open note editor for selected instrument and measure" aria-label="Edit notes in selected measure" @click="openNoteEditor(overviewInstrument,overviewFocus)"><AppIcon name="pencil"/></button></div><p v-if="overviewNotice" class="hint overview-feedback" role="status">{{overviewNotice}}</p></div>
</div>
<div class="overview-workspace"><div class="overview-map-pane">
<div class="song-map-scroll"><table class="song-map"><thead><tr class="song-map-section-row"><th class="sticky-instrument">Sections</th><th v-for="group in mapSectionGroups" :key="group.start" :colspan="group.visibleCount" class="song-map-section-heading"><button type="button" class="song-map-section-toggle" :aria-expanded="!group.collapsed" :aria-label="`${group.collapsed?'Expand':'Collapse'} section ${sectionLetter(group.sectionIndex)}, measures ${group.start+1}–${group.start+group.measures}`" @click="toggleMapSection(group.start)"><strong>{{sectionLetter(group.sectionIndex)}}</strong><span>{{group.start+1}}–{{group.start+group.measures}}</span><span aria-hidden="true">{{group.collapsed?'▸':'▾'}}</span></button></th></tr><tr><th class="sticky-instrument">Instrument</th><th v-for="({bar:b,index:i}) in mapVisibleMeasures" :key="i" :class="{'section-break':i===0||b.section!==project.bars[i-1].section,'map-range-heading':i+1>=overviewStart&&i+1<=overviewEnd}"><div class="measure-chord-inline"><button type="button" class="measure-heading-select" :title="`Select measure ${i+1}; Shift+click to extend the instrument range`" @click="selectOverviewMeasureHeading(i,$event)" @keydown.shift.enter.stop.prevent="selectOverviewMeasureHeading(i,$event)"><small>{{b.section}} · {{keyForSection(b.section)}}</small><strong>{{i+1}}</strong></button><input type="text" :value="b.chord" :aria-label="`Chords in measure ${i+1}`" title="Edit harmony inline; Enter saves" placeholder="—" spellcheck="false" autocomplete="off" @focus="selectLeadMeasure(i)" @change="commitInlineChord(i,$event)" @keydown.enter.prevent="commitInlineChord(i,$event)" @keydown.esc.prevent="cancelInlineChord(i,$event)"/></div></th></tr></thead><tbody><tr v-for="inst in mapVisibleInstruments" :key="inst"><th class="sticky-instrument"><button type="button" class="instrument-heading-button" :title="`Edit chords in selected measure for ${inst}`" @click="overviewInstrument=inst;openChordEditor(overviewFocus)">{{rosterDisplayName(inst)}} <span aria-hidden="true">♫</span></button><div class="instrument-row-preview" role="group" :aria-label="`Playback ${inst}`"><button type="button" class="secondary" :title="`Play ${inst} from measure 1`" :aria-label="`Play ${inst} from start`" @click.stop="previewPart('instrument',0,project.bars.length-1,inst)">▶ 1</button><button type="button" class="secondary" :title="`Play ${inst} measures ${overviewStart}–${overviewEnd}`" :aria-label="`Play ${inst} selected measures`" @click.stop="previewPart('instrument',overviewStart-1,overviewEnd-1,inst)">▶ {{overviewStart}}–{{overviewEnd}}</button></div></th><td v-for="({bar:b,index:i}) in mapVisibleMeasures" :key="i" :class="{'section-break':i===0||b.section!==project.bars[i-1].section}"><button type="button" :class="['song-cell',`song-role-${effectiveRole(inst,i)}`,{focused:overviewFocus===i&&overviewInstrument===inst,modified:roleOverridden(inst,i)||articulationOverride(inst,i)!=='auto'||Boolean(project.measureViolinTechniques?.[`${inst}:${i}`])||Boolean(project.measureBassTechniques?.[`${inst}:${i}`]),'range-selected':overviewInstrument===inst&&i+1>=overviewStart&&i+1<=overviewEnd,'range-start':overviewInstrument===inst&&i+1===overviewStart,'range-end':overviewInstrument===inst&&i+1===overviewEnd}]" :data-map-measure="i" :data-map-instrument="inst" :aria-label="`${inst}, measure ${i+1}, ${effectiveRole(inst,i)}. Double-click or press Enter to edit notes; click then Shift+click to select a range.`" :title="`${inst} · measure ${i+1} · ${effectiveRole(inst,i)} · ${cellArticulation(inst,i)} · Double-click / Enter: edit notes`" @contextmenu="openInstrumentMeasureSettings(inst,i,$event)" @touchstart.passive="startInstrumentMeasureHold(inst,i)" @touchend="cancelMeasureSettingsHold" @touchcancel="cancelMeasureSettingsHold" @touchmove="cancelMeasureSettingsHold" @click="selectOverviewMapCell(inst,i,$event)" @dblclick.stop="onMapCellDoubleClick(inst,i,$event)" @keydown.enter.stop.prevent="onMapCellEnter(inst,i,$event)" @keydown.space.stop.prevent="selectOverviewMapCell(inst,i,$event)"><span class="cell-role">{{cellLabel(inst,i)}}</span><small>{{cellArticulation(inst,i)}}</small></button></td></tr></tbody></table></div><p v-if="inlineHarmonyFeedback" class="inline-harmony-feedback" role="status">{{inlineHarmonyFeedback}}</p>
</div>

</div>
</div>
<details v-if="orchestrationScope==='all'" class="control-fold orchestration-song-part-settings"><summary>Song-part settings · roles, techniques and expression (A/B/C…)</summary>
<div class="orchestration-section-scope">
<div class="orchestration-section-top"><strong>Song-part orchestration</strong><div class="section-tabs" role="group" aria-label="Choose section"><button v-for="s in sections" :key="s" type="button" :class="{selected:chosenSection===s}" :aria-pressed="chosenSection===s" @click="chosenSection=s">{{s}}</button></div></div>
<div class="orchestration-section-intro muted">Configure the selected A/B/C song part. This is independent of the rhythm, melody and harmony instrumental groups. For keys, song-part boundaries and the instrument roster, use Structure, Keys &amp; Ensemble.</div>
<div class="orchestration-settings-grid">
<details class="orchestration-section-settings" open><summary>Roles &amp; playing styles</summary><div class="role-list"><div v-for="inst in activeRoster" :key="inst" class="role-row"><span>{{rosterDisplayName(inst)}}</span><select :value="project.roles[chosenSection]?.[inst]??'rest'" @change="setRole(inst,$event)"><option v-for="role in roles" :key="role" :value="role">{{role}}</option></select></div></div></details><details class="orchestration-section-settings"><summary>Instrument techniques</summary><p class="hint">When Violin I plays Melody and Violin II plays Harmony, Violin II automatically follows Violin I's actual notes with a lower chord-tone harmony. Protected Violin II measures remain unchanged.</p><div class="editor"><details class="control-fold" open><summary>Piano accompaniment figure</summary><h3>Piano accompaniment figure</h3><p class="muted">For Piano with the Chords role, use a moving upper-staff figure and, for chord-inversion figures, an independent bass pulse. Variations alter inversions and register. These are arranging heuristics; use the Note Editor for individual counterlines and gestures.</p><div class="two"><label>Figure for {{chosenSection}}<select :value="pianoFigureForSection()" @change="setPianoFigure"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label><div class="align-bottom"><button class="secondary" @click="nextPianoFigureVariation">Try next piano variation ({{(project.pianoFigureVariation?.[chosenSection]??0)+1}})</button></div></div></details></div><div class="editor"><details class="control-fold" open><summary>Contrabass playing style</summary><h3>Contrabass playing style</h3><p class="muted">For the Bass role, choose a section-wide technique: traditional tango pulse, short pizzicato, sustained arco legato, emphatic marcato, quarter-note walking bass, or syncopated habanera. These change the generated notes, not merely their labels. Override individual measures in Orchestration. Protected manual notes are retained.</p><label>Contrabass style for {{chosenSection}}<select :value="bassSetting()" @change="setBassSetting"><option v-for="tech in bassTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label></details></div><div class="editor"><details class="control-fold" open><summary>Violin chord accompaniment</summary><h3>Violin chord accompaniment</h3><p class="muted">For the Chords role, tango staccato and pizzicato play exactly one chord tone per beat. Unaccented notes are extremely short; selected marcato beats are louder and longer. Choose marcato beats for each violin in this section (1-based, e.g. 1,3). Defaults depend on the style profile and can be overridden; these are arranging heuristics, not fixed composer rules. Arpeggio and pizzicato arpeggio play exactly four successive single notes across the entire measure (not four per beat). Select ascending, descending, or alternating direction below. Double stop, sustained and block remain optional techniques.</p><div class="role-list"><div v-for="inst in (['Violin I','Violin II'] as const)" :key="inst" class="role-row"><span>{{rosterDisplayName(inst)}}</span><select :value="violinSetting(inst)" @change="setViolinSetting(inst,$event)"><option v-for="tech in violinTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select><label class="hint">Arpeggio direction <select :value="violinArpeggioDirection(inst)" @change="setViolinArpeggioDirection(inst,$event)" :aria-label="`Arpeggio direction for ${inst}`"><option value="alternate">Alternate each measure</option><option value="up">Up</option><option value="down">Down</option></select></label><label class="hint">Marcato beats <input type="text" :value="violinMarcatoText(inst)" @change="setViolinMarcato(inst,$event)" placeholder="1,3" aria-label="Marcato beats for violin chord accompaniment"/></label></div></div></details></div><div class="editor"><details class="control-fold" open><summary>Bandoneon following</summary><h3>Bandoneon following</h3><p class="muted">Choose a source and how to follow it for this section. Following overrides the bandoneon's role when the source has notes.</p><div v-for="inst in (['Bandoneon I','Bandoneon II'] as const)" :key="inst" class="two"><label>{{rosterDisplayName(inst)}} follows<select :value="followSetting(inst).target" @change="setFollow(inst,'target',$event)"><option v-for="target in followTargets" :key="target" :value="target">{{rosterDisplayName(target)}}</option></select></label><label>Method<select :value="followSetting(inst).method" @change="setFollow(inst,'method',$event)"><option v-for="method in followMethods" :key="method" :value="method">{{method}}</option></select></label></div></details></div></details><details class="orchestration-section-settings"><summary>Activity &amp; expression</summary><div class="editor"><details class="control-fold" open><summary>Instrument difficulty and activity</summary><h3>Instrument difficulty and activity</h3><p class="muted">Activity is a deterministic target for measures containing musical material, not beats sounded. Explicit Rest roles remain silent. The level limits technical complexity without automatically making the part sparse.</p><div class="role-list"><div v-for="inst in activeRoster" :key="inst" class="role-row"><span>{{rosterDisplayName(inst)}}</span><select :value="instrumentDifficulty(inst)" @change="setInstrumentDifficulty(inst,$event)"><option v-for="d in difficulties" :key="d" :value="d">{{d}}</option></select><label class="hint">Activity <input type="number" min="0" max="100" step="5" :value="instrumentTarget(inst)" @change="setInstrumentTarget(inst,$event)"/> %</label><label class="hint">Dynamics offset <input type="number" min="-25" max="25" step="5" :value="instrumentDynamicsOffset(inst)" @change="setInstrumentDynamicsOffset(inst,$event)"/></label></div></div></details></div><div class="editor"><details class="control-fold" open><summary>Dynamics and phrase expression</summary><h3>Dynamics and phrase expression</h3><label><input type="checkbox" :checked="project.melodyDucking?.enabled??true" @change="setDuckingEnabled"/> Lower accompanying parts while another part carries the melody (keep contrabass unchanged)</label><label>Accompaniment reduction (%)<input type="range" min="0" max="75" step="5" :value="project.melodyDucking?.reduction??22" @input="setDuckingReduction"/>{{project.melodyDucking?.reduction??22}}%</label><label><input type="checkbox" :checked="project.expression?.enabled??true" @change="toggleExpression('enabled',$event)"/> Export dynamics and scale generated velocities</label><label>Dynamic at start of {{chosenSection}}<select :value="sectionDynamic()" @change="setSectionDynamic"><option v-for="d in dynamicMarks" :key="d" :value="d">{{d}}</option></select></label><label><input type="checkbox" :checked="project.expression?.crescendo??true" @change="toggleExpression('crescendo',$event)"/> Add section crescendos</label></details></div></details><details class="orchestration-section-settings"><summary>Articulation &amp; gestures</summary><div class="editor"><details class="control-fold" open><summary>Eight-bar articulation and measure overrides</summary><h3>Eight-bar articulation and measure overrides</h3><p class="muted">Default: approximately eight measures marcato/staccato alternating with lyrical legato (arco for bowed violin). Bandoneon legato describes connected phrasing, not bowing. Violin II and Bandoneon II switches are staggered for variation.</p><label><input type="checkbox" :checked="project.articulation?.enabled??true" @change="project.articulation??=defaultArticulation();project.articulation.enabled=($event.target as HTMLInputElement).checked"/> Generate articulation cycles</label><label>Measures per phase<input type="number" min="1" max="32" :value="project.articulation?.phraseBars??8" @change="project.articulation??=defaultArticulation();project.articulation.phraseBars=Math.max(1,Math.min(32,Number(($event.target as HTMLInputElement).value)||8))"/></label><label>Override measure<select v-model.number="selectedBar"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.section}}</option></select></label><div class="role-list"><div v-for="inst in activeRoster.filter(i=>i.startsWith('Violin')||i.startsWith('Bandoneon'))" :key="inst" class="role-row"><span>{{rosterDisplayName(inst)}}</span><select :value="barArticulation(inst)" @change="setBarArticulation(inst,$event)"><option v-for="art in articulationModes" :key="art" :value="art">{{art.replaceAll('_',' ')}}</option></select><small class="hint">{{inferredArticulation(inst)}}</small></div></div><p class="hint">Press Generate orchestra after changing articulation. An explicit override takes precedence over the default cycle.</p></details></div><div class="editor"><details class="control-fold" open><summary>Tango gestures</summary><h3>Tango gestures</h3><p class="muted">First experimental gesture: insert a two-note piano approach before beat 3 of the selected measure.</p><div class="two"><label>Target measure<select v-model.number="selectedBar"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.chord}}</option></select></label><div class="align-bottom"><button class="secondary" @click="addArrastre">+ Simple arrastre lead-in</button></div></div><p class="hint">Profiles model selected accompaniment, accent and expression tendencies; these are configurable heuristics, not transcriptions of any specific recording.</p></details></div></details></div></div></details><details class="control-fold score-review-details"><summary>Score details · {{scoreStats(score)}} notes across {{activeRoster.length}} parts</summary><p class="hint">Inspect note events for a measure, open any instrument’s notes and protect manual or imported edits from regeneration. This is not an engraved score; use Files → Export MusicXML for MuseScore.</p><div class="score-details-actions"><label>Measure<select v-model.number="selectedBar"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.section}} · {{b.chord}}</option></select></label><div class="align-bottom"><button class="secondary" @click="exportXml">Export score to MuseScore ↗</button></div></div><div class="score-rows"><div v-for="entry in currentNotes" :key="entry.inst" class="score-row"><div class="score-name"><strong>{{rosterDisplayName(entry.inst)}}</strong><button class="secondary score-edit-link" @click="openNoteEditor(entry.inst,selectedBar)">Edit notes</button><small class="muted">{{activitySummary(entry.inst)}}% measures active</small><label class="protect"><input type="checkbox" :checked="!!project.protectedBars[`${entry.inst}:${selectedBar}`]" @change="setProtected(entry.inst,selectedBar,($event.target as HTMLInputElement).checked)"/> Protect</label></div><div class="notes score-notes-shortcut" :title="`Double-click to edit ${entry.inst} notes in measure ${selectedBar+1}`" @dblclick="openNoteEditor(entry.inst,selectedBar)"><span v-for="(n,i) in entry.notes" :key="i" class="note-chip">{{midiName(n.pitch+(project.transposeSemitones??0))}} <small>{{n.duration}} beat</small></span><span v-if="!entry.notes.length" class="muted">Rest</span></div></div></div></details>
</section>
<section v-else-if="active==='rhythm'" ref="rhythmEditorRegion" class="rhythm-editor-section" tabindex="-1" @keydown="handleRhythmEditorKey">
  <div class="section-heading"><h2>Rhythm editor</h2><span>Pattern → instruments → measures</span></div>
  <p class="muted">Apply a rhythmic template to selected orchestra parts. Pitches and chord voicings are retained, including separate piano bass and treble registers. Rhythm edits are saved as protected note changes; the lead-sheet harmony is never modified.</p>
  <div class="rhythm-workspace">
    <div class="editor rhythm-primary">
      <details class="control-fold" open><summary>Rhythm pattern, loop and editing controls</summary>
      <h3>1 · Choose a rhythm</h3>
      <label>Rhythm preset<select v-model="rhythmPreset"><option v-for="preset in rhythmPresets" :key="preset.id" :value="preset.id">{{preset.label}}</option></select></label>
      <p class="hint">{{rhythmPresetInfo.description}} · Changing the preset or reference instrument reloads the grid; apply or finish your edits before switching.</p>
      <label>Reference instrument<select v-model="rhythmPreviewInstrument"><option v-for="inst in activeRoster" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label>
      <div class="rhythm-loop-controls" aria-label="Rhythm loop playback">
        <button type="button" :class="rhythmLoopPlaying?'play':'primary'" @click="toggleRhythmLoop">{{rhythmLoopPlaying?'■ Stop rhythm loop':'▶ Loop edited rhythm'}}</button>
        <label>Sound<select v-model="rhythmLoopSound"><option value="clicks">Rhythm clicks</option><option value="instrument">Selected instrument notes</option></select></label>
        <label>Measure<input v-model.number="rhythmLoopMeasure" type="number" min="1" :max="project.bars.length"/></label>
        <span class="hint" role="status">{{rhythmLoopPlaying?`Playing beat ${rhythmLoopBeat+1} of ${project.beats}`:'Stopped · edits can be heard on the next loop'}}</span>
      </div>
      <div class="editor live-capture" aria-label="Tap rhythm recording">
  <details class="control-fold" open><summary>Live tap recording · full arrangement</summary>
  <p class="hint">Loop one measure or a phrase with the entire orchestra. Tap along in real time; taps are quantized to the nearest sixteenth note. Each pass can replace or add attacks. Stop and refine the captured measure in the grid above.</p>
  <div class="live-capture-controls">
    <label>From measure<input type="number" min="1" :max="project.bars.length" v-model.number="captureFrom" :disabled="capturePlaying"/></label>
    <label>To measure<input type="number" :min="captureFrom" :max="project.bars.length" v-model.number="captureTo" :disabled="capturePlaying"/></label>
    <button type="button" class="secondary" :disabled="capturePlaying" @click="captureSetRangeToCurrent">Use selected measure</button>
    <label>Tap latency correction (ms)<input type="number" min="0" max="300" step="10" v-model.number="captureLatency"/></label>
    <label class="capture-check"><input type="checkbox" v-model="captureMetronome"/> Metronome</label><label class="capture-check"><input type="checkbox" v-model="captureCountIn" :disabled="capturePlaying"/> One-measure count-in</label>
    <button type="button" :class="capturePlaying?'play':'primary'" @click="toggleCaptureLoop">{{capturePlaying?'■ Stop recording':'▶ Loop arrangement & record'}}</button>
  </div>
  <div class="live-capture-status" role="status">{{capturePlaying?(captureCountingIn?`Count-in · beat ${capturePlayBeat+1} of ${project.beats}`:`Playing measure ${capturePlayBar+1}, beat ${capturePlayBeat+1}`):'Stopped'}} · {{captureTaps.length}} taps in draft</div>
  <button type="button" class="capture-tap-pad" :disabled="!capturePlaying" @pointerdown.prevent="capturePointerTap($event)" @click="captureKeyboardClick($event)" aria-label="Tap rhythm now">TAP RHYTHM<span>Touch or press Space / Enter on this pad</span></button>
  <div class="live-capture-actions"><button type="button" class="secondary" :disabled="!captureTaps.length" @click="captureUndo">Undo last tap</button><button type="button" class="secondary" :disabled="!captureTaps.length" @click="captureClear">Clear draft</button></div>
  <div class="live-capture-take" v-for="b in captureBarNumbers" :key="`rhythm-take-${b}`"><strong>Measure {{b+1}}</strong><div class="capture-beat-strip"><span v-for="slot in captureBarRhythm(b)" :key="slot.beat">{{Number((slot.beat+1).toFixed(2))}} · {{slot.duration}} beat</span><em v-if="!captureBarRhythm(b).length">No taps</em></div></div>
  <div class="live-capture-actions"><label>Edit captured measure<select v-model.number="captureEditBar"><option v-for="b in captureBarNumbers" :key="b" :value="b+1">{{b+1}}</option></select></label><button type="button" class="secondary" :disabled="!captureTaps.length" @click="loadCaptureBarToRhythm">Load into rhythm grid ↑</button><button type="button" class="secondary" @click="saveRhythmGridToCapture">Save edited grid to take</button><button type="button" class="primary" :disabled="capturePlaying||!captureTaps.length" @click="applyCapturedRhythm">Apply recorded take to selected instruments</button></div>
  <p class="hint">The recorded take uses the instrument selection and protected-edit setting below. For a single measure, you can instead load its rhythm into the grid and use the normal Apply edited rhythm action. When recording a phrase, save each edited measure back to the take before applying.</p>
  <p v-if="captureFeedback" class="hint" role="status" aria-live="polite">{{captureFeedback}}</p>
</details></div>
      <div class="rhythm-ruler" :style="{'--rhythm-beats':project.beats}"><span v-for="beat in project.beats" :key="beat" :class="{'rhythm-current-beat':rhythmLoopPlaying&&rhythmLoopBeat===beat-1}">{{beat}}</span></div>
      <div class="rhythm-track" role="group" aria-label="Editable rhythm attacks and durations">
        <button v-for="beat in rhythmSteps" :key="beat" type="button" class="rhythm-step-cell" :class="{'rhythm-step-downbeat':Number.isInteger(beat)}" :title="`Add attack at beat ${beat+1}`" :aria-label="`Add rhythm attack at beat ${beat+1}`" @click="rhythmAddAt(beat)"></button>
        <button v-for="(slot,i) in rhythmPreview" :key="`attack-${slot.beat}`" type="button" class="rhythm-event" :class="{'rhythm-event-accent':slot.accent,'rhythm-event-selected':rhythmSelected===i}" :style="{left:`${100*slot.beat/project.beats}%`,width:`${100*slot.duration/project.beats}%`}" :aria-label="`Attack at beat ${slot.beat+1}, duration ${slot.duration}, ${slot.accent?'accented':'unaccented'}`" @click="rhythmSelected=i">
          <span>{{slot.accent?'›':'•'}} {{slot.duration}}</span>
          <span class="rhythm-resize-handle" role="presentation" title="Drag to change written duration" @pointerdown="rhythmResizeDown($event,i)" @pointermove="rhythmResizeMove" @pointerup="rhythmResizeUp" @pointercancel="rhythmResizeUp" @click.stop>↔</span>
        </button>
      </div>
      <p class="hint">Tap an empty sixteenth-note grid cell to add an attack. Select a bar to edit it; drag its right edge to resize. Gaps are rests. A preset is only the starting point.</p>
      <p class="editor-shortcut-help"><strong>Keyboard:</strong> Delete / Backspace remove selected attack · ← → select attacks · + / − change duration · A toggle accent · S split · L loop · Esc deselect. Shortcuts pause while typing in fields.</p>
      <div v-if="rhythmSelectedSlot" class="rhythm-event-properties">
        <label>Attack beat<input type="number" min="1" :max="project.beats" step="0.25" :value="rhythmSelectedSlot.beat+1" @change="rhythmEdit({beat:Number(($event.target as HTMLInputElement).value)-1})"/></label>
        <label>Written duration (beats)<input type="number" min="0.25" :max="project.beats-rhythmSelectedSlot.beat" step="0.25" :value="rhythmSelectedSlot.duration" @change="rhythmEdit({duration:Number(($event.target as HTMLInputElement).value)})"/></label>
        <label>Accent<select :value="rhythmSelectedSlot.accent?'accent':'normal'" @change="rhythmEdit({accent:($event.target as HTMLSelectElement).value==='accent'})"><option value="accent">Accented</option><option value="normal">Normal</option></select></label>
        <div class="rhythm-step-actions"><button class="secondary" type="button" @click="rhythmDurationStep(-1)">− ¼ beat</button><button class="secondary" type="button" @click="rhythmDurationStep(1)">+ ¼ beat</button><button class="secondary" type="button" @click="rhythmSplit">Split attack</button><button class="secondary" type="button" @click="rhythmDelete">Delete attack</button></div>
      </div>
      <div class="rhythm-step-actions"><button type="button" class="secondary" @click="loadRhythmPreset">↻ Reload preset</button><button type="button" class="secondary" @click="rhythmPattern=[];rhythmSelected=-1">Clear grid</button></div>
      <label>What to apply<select v-model="rhythmMode"><option value="rhythm">Rhythm, written durations and accents</option><option value="accents">Accents and articulation only (keep timing)</option></select></label>
    </details></div>
    <div class="editor rhythm-secondary">
      <details class="control-fold" open><summary>Instrument selection and apply controls</summary>
      <h3>2 · Select instruments</h3>
      <div class="rhythm-quick"><button class="secondary" type="button" @click="chooseRhythmGroup('rhythm')">Rhythm section</button><button class="secondary" type="button" @click="chooseRhythmGroup('all')">All parts</button><button class="secondary" type="button" @click="chooseRhythmGroup('none')">Clear</button></div>
      <div class="rhythm-instruments"><label v-for="inst in activeRoster" :key="inst" class="rhythm-instrument"><input type="checkbox" :checked="rhythmTargets.includes(inst)" @change="toggleRhythmTarget(inst,($event.target as HTMLInputElement).checked)"/> {{rosterDisplayName(inst)}}</label></div>
      <h3>3 · Choose measures</h3>
      <label>Apply to<select v-model="rhythmScope"><option value="range">Measure range</option><option value="section">One section</option><option value="song">Entire song</option></select></label>
      <label v-if="rhythmScope==='section'">Section<select v-model="rhythmSection"><option v-for="section in sections" :key="section" :value="section">{{section}}</option></select></label>
      <div v-if="rhythmScope==='range'" class="two"><label>First measure<input type="number" min="1" :max="project.bars.length" v-model.number="rhythmStart"/></label><label>Last measure<input type="number" min="1" :max="project.bars.length" v-model.number="rhythmEnd"/></label></div>
      <p class="hint">{{rhythmTargets.length}} instruments × {{rhythmMeasures.length}} measures. {{rhythmProtectedCount}} already protected.</p>
      <label class="rhythm-overwrite"><input type="checkbox" v-model="rhythmOverwrite"/> Overwrite protected manual edits (confirmation required)</label>
      <button type="button" class="primary rhythm-apply" @click="applyRhythmSelection">Apply edited rhythm to selected parts</button>
      <p v-if="rhythmFeedback" class="rhythm-feedback" role="status">{{rhythmFeedback}}</p>
    </details></div>
  </div>
  <p class="hint">The editable pattern is applied to all selected parts; for piano, bass and treble retain their original pitches and voicings. Silent measures are skipped. Melody/voice changes require confirmation. Applied note edits are protected through regeneration and exported to MusicXML and .tango.json backups. Presets are starting-point heuristics, not transcriptions.</p>
</section>
<section v-else ref="noteEditorRegion" class="note-editor-section" tabindex="-1" :class="{'note-focus-mode':noteFocusMode,'note-focus-more-open':noteFocusMore}" @keydown="handleNoteEditorKey">
  <div class="section-heading note-editor-heading"><h2>Instrument note editor</h2><button type="button" class="secondary note-settings-icon" @click="noteSettingsOpen=!noteSettingsOpen" :aria-expanded="noteSettingsOpen" aria-controls="note-settings-popup" aria-label="Note editor settings" title="Note editor settings">⚙</button><button type="button" class="secondary" :disabled="!undoHistory.length" @click="restoreHistory('undo')" title="Undo last project edit">↶ Undo</button><button type="button" class="secondary" :disabled="!redoHistory.length" @click="restoreHistory('redo')" title="Redo last undone edit">↷ Redo</button><button type="button" class="secondary" :disabled="selectedBar<=0" @click="openNoteEditor(noteInst,selectedBar-1)" aria-label="Previous measure">‹</button><span class="measure-drag-header" title="Swipe left for next measure, right for previous" style="cursor:ew-resize;touch-action:pan-y;user-select:none" @pointerdown="beginMeasureHeaderDrag" @pointerup="finishMeasureHeaderDrag" @pointercancel="cancelMeasureHeaderDrag">↔ Measure {{selectedBar+1}} · {{project.bars[selectedBar].section}}</span><button type="button" class="secondary" :disabled="selectedBar>=project.bars.length-1" @click="openNoteEditor(noteInst,selectedBar+1)" aria-label="Next measure">›</button><button type="button" class="secondary note-focus-enter" @click="enterNoteFocusMode" aria-label="Expand note editor to full screen" title="Focus editor (full viewport)">⛶ Focus editor</button></div>
  <div v-if="noteFocusMode" class="note-focus-toolbar" role="toolbar" aria-label="Focused note editor navigation">
    <button type="button" class="secondary note-focus-close" @click="exitNoteFocusMode" aria-label="Exit focused note editor">↙ Exit focus</button><button type="button" class="secondary note-settings-icon" @click="noteSettingsOpen=!noteSettingsOpen" :aria-expanded="noteSettingsOpen" aria-controls="note-settings-popup" aria-label="Note editor settings" title="Note editor settings">⚙</button>
    <strong class="note-focus-identity measure-drag-header" title="Swipe left for next measure, right for previous" style="touch-action:pan-y;user-select:none;cursor:ew-resize" @pointerdown="beginMeasureHeaderDrag" @pointerup="finishMeasureHeaderDrag" @pointercancel="cancelMeasureHeaderDrag">{{rosterDisplayName(noteInst)}} · measure {{selectedBar+1}} / {{project.bars.length}} ↔</strong>
    <button type="button" class="secondary" :disabled="selectedBar<=0" @click="openNoteEditor(noteInst,selectedBar-1)">← Previous</button>
    <button type="button" class="secondary" :disabled="selectedBar>=project.bars.length-1" @click="openNoteEditor(noteInst,selectedBar+1)">Next →</button>
    <button type="button" :class="noteLoopPlaying?'play':'primary'" @click="toggleNoteLoop">{{noteLoopPlaying?'■ Stop loop':'▶ Loop instrument'}}</button>
    <label class="note-focus-range">Loop from<input type="number" min="1" :max="project.bars.length" v-model.number="noteLoopFrom" :disabled="noteLoopPlaying" @change="changeFocusLoopFrom"/></label>
    <label class="note-focus-range">To<input type="number" :min="noteLoopFrom" :max="project.bars.length" v-model.number="noteLoopTo" :disabled="noteLoopPlaying" @change="changeFocusLoopTo"/></label>
    <span v-if="noteLoopPlaying" class="note-focus-playing" role="status">Playing measure {{noteLoopMeasure>=0?noteLoopMeasure+1:'…'}} · beat {{noteLoopBeat>=0?noteLoopBeat+1:'…'}}</span>
  </div>
  <div v-if="!noteFocusMode" class="compact-note-toolbar" role="toolbar" aria-label="Note editing workspace"><button v-if="noteInst.startsWith('Voice')" type="button" class="secondary" @click="shiftVoicePhraseFromLead(selectedBar,true)">Shift notes + lyrics…</button><button type="button" class="secondary" @click="returnToMap">← Map</button><label>Instrument<select v-model="noteInst" @change="openNoteEditor(noteInst,selectedBar)"><option v-for="inst in activeRoster" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label><button type="button" class="secondary" :disabled="selectedBar<=0" @click="openNoteEditor(noteInst,selectedBar-1)">←</button><label>Measure<select v-model.number="selectedBar" @change="openNoteEditor(noteInst,selectedBar)"><option v-for="(b,i) in project.bars" :key="i" :value="i">{{i+1}} · {{b.section}}</option></select></label><button type="button" class="secondary" :disabled="selectedBar>=project.bars.length-1" @click="openNoteEditor(noteInst,selectedBar+1)">→</button><button type="button" :class="noteLoopPlaying?'play':'primary'" @click="toggleNoteLoop">{{noteLoopPlaying?'■ Stop':'▶ Loop'}}</button><button type="button" class="secondary" @click="noteInspectorOpen=!noteInspectorOpen" :aria-pressed="noteInspectorOpen">{{noteInspectorOpen?'Hide':'Show'}} inspector</button><button type="button" class="secondary" @click="enterNoteFocusMode">⛶ Focus</button></div><div class="note-editor-navigation" aria-label="Note editor navigation"><button type="button" class="secondary" @click="returnToMap">← Back to map</button><button type="button" class="secondary" :disabled="selectedBar<=0" @click="openNoteEditor(noteInst,selectedBar-1)">← Previous measure</button><button type="button" class="secondary" :disabled="selectedBar>=project.bars.length-1" @click="openNoteEditor(noteInst,selectedBar+1)">Next measure →</button><span class="editor-shortcut-help">Keyboard: Delete / Backspace remove note · ← → select notes · ↑ ↓ pitch ± semitone · + / − duration ± ¼ beat · [ ] measures · L loop · Esc map. Text fields keep normal typing.</span></div>
  <div class="note-loop-controls" aria-label="Measure playback"><button type="button" :class="noteLoopPlaying?'play':'primary'" @click="toggleNoteLoop">{{noteLoopPlaying?'■ Stop measure loop':'▶ Loop this instrument measure'}}</button><span class="hint" role="status" aria-live="polite">{{noteLoopPlaying?`Looping ${noteInst}, measure ${selectedBar+1} · beat ${noteLoopBeat<0?'…':noteLoopBeat+1}`:'Stopped · plays only the selected instrument and measure'}}</span></div>
  <div class="note-subtabs" role="tablist" aria-label="Instrument note editor tools" @keydown="handleNoteTabKey">
    <button id="note-tab-notes" type="button" role="tab" :aria-selected="noteEditorTab==='notes'" :tabindex="noteEditorTab==='notes'?0:-1" aria-controls="note-panel-notes" :class="{selected:noteEditorTab==='notes'}" @click="setNoteEditorTab('notes')">♫ Notes &amp; properties</button>
    <button id="note-tab-capture" type="button" role="tab" :aria-selected="noteEditorTab==='capture'" :tabindex="noteEditorTab==='capture'?0:-1" aria-controls="note-panel-capture" :class="{selected:noteEditorTab==='capture'}" @click="setNoteEditorTab('capture')">● Live input</button>
    <button id="note-tab-figures" type="button" role="tab" :aria-selected="noteEditorTab==='figures'" :tabindex="noteEditorTab==='figures'?0:-1" aria-controls="note-panel-figures" :class="{selected:noteEditorTab==='figures'}" @click="setNoteEditorTab('figures')">♪ Figures</button>
    <button id="note-tab-expression" type="button" role="tab" :aria-selected="noteEditorTab==='expression'" :tabindex="noteEditorTab==='expression'?0:-1" aria-controls="note-panel-expression" :class="{selected:noteEditorTab==='expression'}" @click="setNoteEditorTab('expression')">◁ Dynamics &amp; expression</button>
  </div>
  <section id="note-panel-capture" v-show="noteEditorTab==='capture'" role="tabpanel" aria-labelledby="note-tab-capture">
  <div class="editor live-capture" aria-label="Tap melody recording">
  <div class="section-heading"><h3>Live melody and rhythm input</h3><span>Full orchestra loop · draft take</span></div>
  <details class="control-fold" open><summary>Recording controls, keyboard &amp; draft take</summary>
  <p class="hint">Loop a measure or phrase and tap the pitch keys below at the right moment. By default, each new loop pass replaces the previous recorded take; select Overdub to layer notes. Each key tap records both pitch and rhythmic onset, quantized to a sixteenth note. Alternatively, select a pitch and tap the large rhythm pad. Nothing replaces the existing notes until you press Apply captured notes.</p>
  <div class="live-capture-controls">
    <label>From measure<input type="number" min="1" :max="project.bars.length" v-model.number="captureFrom" :disabled="capturePlaying"/></label>
    <label>To measure<input type="number" :min="captureFrom" :max="project.bars.length" v-model.number="captureTo" :disabled="capturePlaying"/></label>
    <button type="button" class="secondary" :disabled="capturePlaying" @click="captureSetRangeToCurrent">Current measure</button>
    <label>Loop take<select v-model="captureTakeMode" :disabled="capturePlaying"><option value="replace">Replace each pass</option><option value="overdub">Overdub (add notes)</option></select></label><label>Quantization<select v-model="captureQuantize" :disabled="capturePlaying"><option value="auto">Auto (measure articulation)</option><option value="1">Quarter</option><option value="0.5">Eighth</option><option value="0.25">Sixteenth</option><option value="0.125">Thirty-second</option></select></label><label>Recording speed<select v-model.number="captureSpeed" :disabled="capturePlaying" aria-label="Recording playback speed"><option :value="1">Normal (100%)</option><option :value="0.75">Three-quarter speed (75%)</option><option :value="0.5">Half speed (50%)</option></select></label><label>Latency correction (ms)<input type="number" min="0" max="300" step="10" v-model.number="captureLatency"/></label>
    <label class="capture-check"><input type="checkbox" v-model="captureMetronome"/> Metronome</label><label class="capture-check"><input type="checkbox" v-model="captureCountIn" :disabled="capturePlaying"/> One-measure count-in</label>
    <button type="button" :class="capturePlaying?'play':'primary'" @click="toggleCaptureLoop">{{capturePlaying?'■ Stop recording':'▶ Loop arrangement & record'}}</button>
  </div>
  <div class="live-capture-status" role="status">{{capturePlaying?(captureCountingIn?`Count-in · beat ${capturePlayBeat+1} of ${project.beats}`:`Playing measure ${capturePlayBar+1}, beat ${capturePlayBeat+1}`):'Stopped'}} · {{captureTaps.length}} pitched taps</div>
  <div class="live-capture-controls" aria-label="Melody keyboard note range"><label>Start note<select v-model.number="captureStartPitch" @change="changeCaptureKeyboardStart"><option v-for="pitch in capturePitchOptions" :key="pitch" :value="pitch">{{midiName(pitch)}}</option></select></label><label>End note<select v-model.number="captureEndPitch" @change="changeCaptureKeyboardEnd"><option v-for="pitch in capturePitchOptions" :key="pitch" :value="pitch">{{midiName(pitch)}}</option></select></label><label>Selected pitch<select v-model.number="capturePitch"><option v-for="pitch in captureKeyboardPitches" :key="pitch" :value="pitch">{{midiName(pitch)}}</option></select></label></div>
  <p class="hint capture-range-summary">Keyboard: {{midiName(captureStartPitch)}}–{{midiName(captureEndPitch)}} · {{captureKeyboardPitches.length}} semitone keys. Scroll horizontally for wider ranges. Changing the keyboard range does not remove recorded taps.</p>
  <div class="capture-piano" role="group" aria-label="Playable chromatic keyboard for melody entry, from selected start note to end note"><button v-for="pitch in captureKeyboardPitches" :key="pitch" type="button" :class="['capture-piano-key',{'capture-piano-black':[1,3,6,8,10].includes(pitch%12),'capture-piano-selected':capturePitch===pitch}]" :aria-label="`Tap ${midiName(pitch)} to record its pitch and onset`" @pointerdown.prevent="capturePianoKey($event,pitch)" @pointerup="releaseCapturePianoKey($event)" @pointercancel="releaseCapturePianoKey($event)" @lostpointercapture="releaseCapturePianoKey($event)" @click="capturePianoKeyClick($event,pitch)"><span>{{captureNoteLabels[pitch%12]}}</span><small>{{Math.floor(pitch/12)-1}}</small></button></div>
  <button type="button" class="capture-tap-pad" :disabled="!capturePlaying" @pointerdown.prevent="capturePointerTap($event,capturePitch)" @click="captureKeyboardClick($event,capturePitch)" :aria-label="`Tap rhythm at ${midiName(capturePitch)}`">TAP RHYTHM<span>Record {{midiName(capturePitch)}} at each tap · Space / Enter when focused</span></button>
  <div class="live-capture-actions"><button type="button" class="secondary" :disabled="!captureTaps.length" @click="captureUndo">Undo last tap</button><button type="button" class="secondary" :disabled="!captureTaps.length" @click="captureClear">Clear draft</button><button type="button" class="primary" :disabled="capturePlaying||!captureTaps.length" @click="applyCapturedMelody">Apply captured notes to {{rosterDisplayName(noteInst)}}</button></div>
  <div class="live-capture-take" v-for="b in captureBarNumbers" :key="`melody-take-${b}`"><strong>Measure {{b+1}}</strong><div class="capture-beat-strip"><span v-for="(n,i) in melodyFromTaps(captureTaps,b,project.beats)" :key="`${i}-${n.beat}`">{{midiName(n.pitch)}} @ {{Number((n.beat+1).toFixed(2))}} · {{n.duration}} beat</span><em v-if="!melodyFromTaps(captureTaps,b,project.beats).length">No taps</em></div></div>
  <p class="hint">The captured durations are initial guesses (up to one beat, shortened before the next attack). After applying, use the Note Editor's duration controls and note bars to refine them. Only measures containing recorded notes are replaced; the lead-sheet melody is not modified.</p>
  <p v-if="captureFeedback" class="hint" role="status" aria-live="polite">{{captureFeedback}}</p>
</details>
</div>
  </section>
  <section id="note-panel-figures" v-show="noteEditorTab==='figures'" role="tabpanel" aria-labelledby="note-tab-figures">
    <div class="figure-workbench" aria-label="Note figure generator"><details class="control-fold" open><summary>Figure generation controls</summary>
      <h3>Musical figures · selected instrument and measure</h3>
      <p class="hint">Generate chord-tone figures, moving inversions, countermelodies or answers to the lead melody. The section key, chord changes and instrument register guide the result. Variations are deterministic; manual edits elsewhere are preserved.</p>
      <div class="figure-controls"><label>Figure<select v-model="figureChoice"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label>
      <label>Variation number<input type="number" min="1" max="100" :value="figureVariation+1" @change="figureVariation=Math.max(0,Math.min(99,Number(($event.target as HTMLInputElement).value)-1||0))"/></label>
      <button class="primary" @click="applyFigure()">Apply figure</button><button class="secondary" @click="applyFigure(true)">Another variation ↻</button>
      <button class="secondary" @click="cycleFigure(1)">Next figure →</button></div>
      <p class="hint">Applying a figure replaces only this instrument-measure and protects it. Existing manually protected measures require confirmation when first replaced.</p>
    </details></div>
  </section>
  <section id="note-panel-expression" v-show="noteEditorTab==='expression'" role="tabpanel" aria-labelledby="note-tab-expression">
    <div class="figure-workbench" aria-label="Visual dynamics editor">
      <h3>Dynamics timeline</h3>
      <p class="hint">Edit by current musical role, individual instrument or whole orchestra. Role membership follows each section; instrument markings remain individually editable.</p>
      <div class="figure-controls">
        <label>Apply to<select v-model="dynamicsScope"><option value="role">Musical role</option><option value="instrument">Selected instrument</option><option value="all">Entire orchestra</option></select></label>
        <label v-if="dynamicsScope==='role'">Role<select v-model="dynamicsRole"><option v-for="role in roles" :key="role" :value="role">{{role}}</option></select></label>
        <label v-if="dynamicsScope==='instrument'">Instrument <strong>{{noteInst}}</strong></label>
        <label>Dynamic<select v-model="dynamicsMark"><option v-for="mark in dynamicMarks" :key="mark" :value="mark">{{mark}}</option></select></label>
      </div>
      <div class="expression-range-row" style="display:flex;flex-wrap:wrap;gap:.35rem;align-items:center">
        <span>Tap a measure to set</span><button class="secondary" @click="applyDynamicsGesture('constant')">Level across range</button>
        <button class="secondary" @click="applyDynamicsGesture('crescendo')">〈 Crescendo</button>
        <button class="secondary" @click="applyDynamicsGesture('diminuendo')">〉 Diminuendo</button>
        <button class="secondary" @click="applyDynamicsGesture('swell')">〈〉 Swell</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:.4rem;margin:.75rem 0">
        <button v-for="barIndex in dynamicsPreviewBars" :key="barIndex" type="button" class="secondary" :style="{borderColor:barIndex===selectedBar?'var(--accent, #579d93)':undefined}" @click="openDynamicPopup(barIndex)">
          <span style="display:block;font-size:.75rem">M{{barIndex+1}}</span>
          <strong style="display:block;font-size:1.2rem;font-style:italic">{{dynamicsTargets(barIndex).length ? (dynamicsTargets(barIndex).map(inst=>dynamicsAt(inst,barIndex)).filter(Boolean).join(' / ')||'—') : 'no role'}}</strong>
          <small>{{dynamicsTargets(barIndex).length}} parts</small>
        </button>
        <div v-for="edge in dynamicsRangeEndpoints(barIndex)" :key="`${edge.index}-${edge.endpoint}`"><button type="button" class="secondary" style="width:100%;font-size:.75rem" @click="openDynamicPopup(barIndex,edge.index,edge.endpoint)">{{edge.label}}</button></div>
      </div>
      <div v-if="dynamicsPopupBar!==null" class="note-settings-backdrop" @click.self="dynamicsPopupBar=null"><div class="note-settings-dialog" role="dialog" aria-modal="true" aria-label="Edit dynamic or hairpin endpoint">
        <div class="note-settings-title"><strong>{{dynamicsPopupRange===null?'Edit dynamic':'Edit hairpin '+dynamicsPopupEndpoint}} · measure {{dynamicsPopupBar+1}}</strong><button type="button" class="secondary" @click="dynamicsPopupBar=null">✕ Close</button></div>
        <template v-if="dynamicsPopupRange===null"><label>Dynamic<select v-model="dynamicsPopupMark"><option value="">Clear / inherit</option><option v-for="mark in dynamicMarks" :key="mark" :value="mark">{{mark}}</option></select></label></template>
        <template v-else><label>Snap endpoint to a note onset<select v-model="dynamicsPopupPosition"><option :value="String(dynamicsPopupBar*project.beats)">Start of measure · beat 1</option><option v-for="p in dynamicNotePositions(dynamicsPopupBar)" :key="p.position" :value="String(p.position)">{{p.label}}</option><option :value="String((dynamicsPopupBar+1)*project.beats)">End of measure</option></select></label>
        <label>Or exact beat position (absolute beats from beginning, zero-based)<input type="number" step="0.25" min="0" :max="project.bars.length*project.beats" v-model="dynamicsPopupPosition"/></label></template>
        <div class="expression-range-row"><button type="button" class="primary" @click="saveDynamicPopup">Save</button><button type="button" class="secondary" @click="removeDynamicPopup">{{dynamicsPopupRange===null?'Clear dynamic':'Delete hairpin'}}</button></div>
      </div></div>
      <p class="hint">Tap a measure's dynamic or a hairpin endpoint to edit it precisely. The gesture buttons use the From/Through measure fields below. Individual measure tiles set the selected dynamic immediately. Existing expression controls remain available for precise beat-level editing.</p>
    </div>
    <div class="figure-workbench" aria-label="Expression ranges"><details class="control-fold" open><summary>Dynamics and expression controls</summary>
      <h3>Expression across measures</h3><div class="two"><label>Start of this measure<select :value="currentMeasureDynamic('start')" @change="setMeasureDynamic('start',($event.target as HTMLSelectElement).value)"><option value="">Inherit</option><option v-for="d in dynamicMarks" :key="d" :value="d">{{d}}</option></select></label><label>End of this measure<select :value="currentMeasureDynamic('end')" @change="setMeasureDynamic('end',($event.target as HTMLSelectElement).value)"><option value="">Inherit</option><option v-for="d in dynamicMarks" :key="d" :value="d">{{d}}</option></select></label></div><p class="hint">Set both endpoints for a crescendo or diminuendo hairpin. A single endpoint sets an immediate dynamic marking.</p><p class="hint">Set an instrument-specific crescendo or decrescendo, including across section boundaries. Intensity offsets are applied relative to a neutral value of 80, preserving note accents; written durations do not change. MusicXML exports hairpin wedges.</p>
      <div class="figure-controls"><label>From measure<input type="number" min="1" :max="project.bars.length" v-model.number="expressionStart"/></label>
      <label>Through measure<input type="number" min="1" :max="project.bars.length" v-model.number="expressionEnd"/></label>
      <label>Start at beat<input type="number" min="1" :max="project.beats" step="0.25" v-model.number="expressionStartBeat"/></label>
      <label>End after beat<input type="number" min="0.25" :max="project.beats" step="0.25" v-model.number="expressionEndBeat"/></label>
      <label>Starting intensity (80 = neutral)<input type="number" min="1" max="127" v-model.number="expressionFrom"/></label>
      <label>Ending intensity (80 = neutral)<input type="number" min="1" max="127" v-model.number="expressionTo"/></label>
      <button class="secondary" @click="addExpressionRange">+ Add expression range</button></div>
      <div v-for="r in currentExpressionRanges" :key="r.index" class="expression-range-row"><span>Measures {{r.startMeasure+1}} (beat {{(r.startBeat??0)+1}}) – {{r.endMeasure+1}} (through beat {{r.endBeat??project.beats}}) · {{r.from}} → {{r.to}} {{r.to>=r.from?'crescendo':'decrescendo'}}</span><button class="secondary" @click="removeExpressionRange(r.index)">Remove</button></div>
    </details></div>
  </section>
  <section id="note-panel-notes" v-show="noteEditorTab==='notes'" role="tabpanel" aria-labelledby="note-tab-notes" :class="{'inspector-open':noteInspectorOpen}">
  <p v-if="false" class="muted">Click a pitch/beat cell to hear and add a note; click the filled cell again to hear and remove it. Every semitone in the instrument's range is editable, including chromatic passing notes and notes outside the chord. Cell colors distinguish chord tones, other section-key tones, and chromatic tones; they never block entry. Notes are concert pitch; global transposition is applied during playback and export. Edits are immediately protected from regeneration. For piano, the treble and bass grids edit the same measure and sound together in the loop. Violin chord accompaniment defaults to one note per beat, with editable staccato/marcato and sounding length.</p>
  <div class="editor note-editor-panel">
    <div v-if="noteSettingsOpen" id="note-settings-popup" class="note-settings-backdrop" @click.self="noteSettingsOpen=false"><div class="note-settings-dialog" role="dialog" aria-label="Note editor settings"><div class="note-settings-title"><strong>Note editor settings</strong><button type="button" class="secondary" @click="noteSettingsOpen=false">✕ Close</button></div><div class="note-tools-bar" aria-label="Note editor controls">
  <div class="note-tools-group note-tools-entry-group" aria-label="Note entry"><div class="note-editor-controls">
      <label>Drag snap resolution<select v-model.number="noteStep"><option :value="1">Quarter note</option><option :value="0.5">Eighth note</option><option :value="0.25">Sixteenth note</option></select></label>
      <label>New note duration<select v-model="noteLength"><option value="auto">Auto (written rhythm)</option><option v-for="d in [0.25,0.5,0.75,1,1.5,2,3,4]" :key="d" :value="d">{{d}} beat{{d===1?'':'s'}}</option></select></label>
      <label>New note articulation<select v-model="newNoteArticulation"><option value="inherit">Use measure setting</option><option value="staccato">Staccato · (dot, short playback)</option><option value="marcato_staccato">Marcato &gt; (accented attack)</option><option value="legato">Legato</option></select></label>
      <label>Pitch labels<select v-model="editorAccidentals"><option value="auto">Follow key signature</option><option value="sharp">Use sharps (♯)</option><option value="flat">Use flats (♭)</option></select></label>
    </div>
</div>
  <div class="note-tools-group note-tools-range-group" aria-label="Pitch range and octave"><div class="note-view-range-controls" aria-label="Visible pitch range">
      <label>Lowest note<select v-model.number="noteViewStart" @change="changeNoteViewStart"><option v-for="pitch in noteViewOptions" :key="pitch" :value="pitch">{{midiName(pitch)}}</option></select></label>
      <label>Highest note<select v-model.number="noteViewEnd" @change="changeNoteViewEnd"><option v-for="pitch in noteViewOptions" :key="pitch" :value="pitch">{{midiName(pitch)}}</option></select></label>
      <span class="hint">Visible pitch range · {{midiName(noteViewStart)}}–{{midiName(noteViewEnd)}}</span>

  <div class="note-editor-actions"><template v-if="noteInst==='Piano'&&!noteViewCustom"><button class="secondary" @click="shiftPianoRegister('treble',-12)">Treble ↓ octave</button><button class="secondary" @click="shiftPianoRegister('treble',12)">Treble ↑ octave</button><button class="secondary" @click="shiftPianoRegister('bass',-12)">Bass ↓ octave</button><button class="secondary" @click="shiftPianoRegister('bass',12)">Bass ↑ octave</button></template><template v-else><button class="secondary" @click="shiftNoteView(-12)">↓ Lower octave</button><button class="secondary" @click="shiftNoteView(12)">↑ Higher octave</button></template></div>
  <div v-if="noteInst==='Piano'" class="piano-split-setting"><label>Split between piano staves (notes at or above this pitch use treble)<select v-model.number="pianoSplit"><option v-for="pitch in [55,57,59,60,62,64,65,67]" :key="pitch" :value="pitch">{{midiName(pitch)}} · MIDI {{pitch}}</option></select></label><span class="hint">Affects piano editor and MusicXML clef assignment, not note pitches or sounding notes.</span></div>
    
  </div>
  </div>
  <div class="note-tools-group note-tools-measure-group" aria-label="Measure actions"><div class="note-measure-actions"><button class="secondary" @click="clearNoteMeasure">Clear this measure</button><button class="secondary" @click="restoreNoteMeasure">Restore generated measure</button></div></div>
</div>
</div></div><div v-if="false" class="note-focus-view-tools" aria-label="Visible pitch range">
      <template v-if="noteInst==='Piano'&&!noteViewCustom"><button type="button" class="secondary" @click="shiftPianoRegister('treble',-12)">Treble ↓ octave</button><button type="button" class="secondary" @click="shiftPianoRegister('treble',12)">Treble ↑ octave</button><button type="button" class="secondary" @click="shiftPianoRegister('bass',-12)">Bass ↓ octave</button><button type="button" class="secondary" @click="shiftPianoRegister('bass',12)">Bass ↑ octave</button></template>
      <template v-else><button type="button" class="secondary" @click="shiftNoteView(-12)">↓ View octave</button><button type="button" class="secondary" @click="shiftNoteView(12)">↑ View octave</button></template>
    </div>
    <div v-if="false" class="note-focus-phrase" aria-label="Visible measure range and note overview">
      <div class="note-focus-phrase-heading"><strong>Visible measures {{noteLoopFrom}}–{{noteLoopTo}} ({{focusVisibleMeasures.length}})</strong><span class="hint">Select a measure to edit its notes below. The same range is used for loop playback.</span></div>
      <div class="note-focus-phrase-scroll">
        <button v-for="barIndex in focusVisibleMeasures" :key="barIndex" type="button" :class="['note-focus-measure',{'current':barIndex===selectedBar,'playing':noteLoopPlaying&&noteLoopMeasure===barIndex}]" :aria-label="`Edit measure ${barIndex+1}, ${focusMeasureNotes(barIndex).length} notes`" :aria-current="barIndex===selectedBar?'true':undefined" @click="selectFocusMeasure(barIndex)">
          <span class="note-focus-measure-heading">{{barIndex+1}} · {{project.bars[barIndex].section}} <small>{{project.bars[barIndex].chord||'—'}}</small></span>
          <span class="note-focus-measure-lanes"><span v-for="(n,i) in focusMeasureNotes(barIndex)" :key="`${i}-${n.start}-${n.pitch}`" class="note-focus-measure-note" :style="{left:`${(n.start-barIndex*project.beats)/project.beats*100}%`,width:`${Math.max(1,n.duration/project.beats*100)}%`,top:`${focusNoteTop(n.pitch)}%`}" :title="`${displayPitch(n.pitch)} · ${n.duration} beats`"></span></span>
        </button>
      </div>
    </div>
    <div class="note-context-panel" aria-label="Instrument context"><div class="note-context">
      <span><strong>Role</strong> {{noteCtx.role}}</span><span><strong>Difficulty</strong> {{noteCtx.difficulty}}</span>
      <span><strong>Key</strong> {{noteCtx.key}} {{noteCtx.mode}}</span>
      <span><strong>Range</strong> {{midiName(noteCtx.range[0])}}–{{midiName(noteCtx.range[1])}}</span>
      <span><strong>Articulation</strong> {{noteCtx.articulation??'none'}}</span>
      <span v-if="noteCtx.technique"><strong>Technique</strong> {{noteCtx.technique}}</span>
      <span><strong>Dynamic</strong> {{noteCtx.dynamic}}</span><span><strong>Activity</strong> {{Math.round(noteCtx.activity*100)}}%</span>
      <span v-if="project.protectedBars[`${noteInst}:${selectedBar}`]" class="manual-status">Manual · protected</span>
    </div>
</div>
    <div :class="{'note-staff-grid':noteInst==='Piano'}">
    <div v-for="staff in noteStaffViews" :key="staff.id" class="note-staff-panel"><div v-if="noteInst==='Piano'" class="note-staff-heading"><strong>{{staff.label}}</strong><span>{{staff.clef}}</span></div><div class="note-grid-scroll" @pointermove="moveNoteDrag($event)" @pointerup="endNoteDrag($event)" @pointercancel="endNoteDrag($event)"><table class="note-grid" :style="{'--grid-steps':noteBeats.length}"><thead><tr class="note-beat-swipe-header" title="Swipe left or right here to change measures and move the loop range" @pointerdown="beginMeasureHeaderDrag" @pointerup="finishMeasureHeaderDrag" @pointercancel="cancelMeasureHeaderDrag"><th class="note-pitch-label">Pitch ↔</th><th v-for="beat in noteBeats" :key="beat" :class="{'note-downbeat':Number.isInteger(beat),'note-loop-playhead':noteLoopPlaying&&noteLoopBeat===Math.floor(beat)}"><span>{{noteGridBeatLabel(beat)}}</span><small>{{chordAt(project.bars[selectedBar].chord,project.beats,beat)||'—'}}</small></th></tr></thead><tbody>
      <tr v-for="pitch in staff.pitches" :key="pitch"><th class="note-pitch-label"><button type="button" class="note-pitch-audition" :title="`Hear ${displayPitch(pitch)}`" @click="auditionPitch(pitch)">{{displayPitch(pitch)}} ♪</button></th><td class="note-time-lane" :colspan="noteBeats.length"><div class="note-lane-grid" :style="{'--grid-steps':noteBeats.length}">
        <button v-for="beat in noteBeats" :key="beat" type="button" :class="['note-grid-cell',`note-tone-${pitchClass(pitch,beat)}`,{'note-downbeat':Number.isInteger(beat),'note-loop-playhead':noteLoopPlaying&&noteLoopBeat===Math.floor(beat)}]" :title="`Add ${displayPitch(pitch)} at beat ${beat+1}`" :aria-label="`Add ${displayPitch(pitch)} at beat ${beat+1}`" :data-note-pitch="pitch" :data-note-beat="beat" @click="noteCellClick(pitch,beat)"></button>
        <button v-for="(n,i) in noteMeasure.filter(n=>n.pitch===pitch)" :key="`${n.start}:${n.pitch}:${n.duration}:${i}`" type="button" :class="['note-bar',{'selected':selectedEvent===n}]" :style="{left:`${(n.start-selectedBar*project.beats)/project.beats*100}%`,width:`${n.duration/project.beats*100}%`}" :data-note-pitch="pitch" :title="`${displayPitch(n.pitch)} · beat ${Number((n.start-selectedBar*project.beats+1).toFixed(2))} · ${n.duration} beats. Drag center to move; drag either edge to resize.`" :aria-label="`Select ${displayPitch(n.pitch)}, ${n.duration} beats. Drag middle to move, left or right edge to resize.`" @pointerdown="beginNoteDrag($event,pitch,n.start-selectedBar*project.beats)" @click.stop="noteBarClick(pitch,n.start-selectedBar*project.beats)"><span class="note-resize-handle note-resize-handle-left" aria-hidden="true" title="Resize from start (keep note end fixed)">◂</span><span class="note-bar-label">{{n.duration}}<span class="note-bar-unit"> beat{{n.duration===1?'':'s'}}</span></span><span class="note-resize-handle note-resize-handle-right" aria-hidden="true" title="Resize from end (keep note start fixed)">▸</span></button>
      </div></td></tr>
    </tbody></table></div></div>
    </div>
    <p class="hint">The grid defaults to sixteenth notes (¼ beat) for every instrument, regardless of difficulty. Labels 1e, 1&amp;, 1a mark the subdivisions between beat 1 and beat 2. To move by half a beat, drag the middle of a note two grid cells, or use the ±½ beat buttons below.</p><p class="hint">Tap an empty cell to add a note. Tap a note to select it; its full-width bar shows the written duration. Drag the middle left/right to move in time, or up/down to change pitch (diagonal drags do both). Drag the left edge to change the start while keeping the end fixed; drag the right edge to change the end while keeping the start fixed. Press and hold to open note properties.</p><p class="hint">Color guide: <span class="note-key-legend chord">chord tone</span> <span class="note-key-legend key">key tone</span> <span class="note-key-legend chromatic">chromatic</span>. All three colors are clickable, for every instrument and role. Pitch labels can show sharps or flats without changing the sounding pitch; MusicXML spells notes according to the section key. Notes outside the visible register can be reached with Lowest/Highest note selectors or the octave buttons.</p>
    <section v-if="noteInst.startsWith('Voice')" class="lyric-workspace" aria-label="Lyric alignment editor">
      <div class="section-heading"><h3>Lyrics · note-aligned timeline</h3><button type="button" class="secondary" :disabled="selectedBar<=0" @click="openNoteEditor(noteInst,selectedBar-1)" aria-label="Previous lyrics measure">‹</button><span class="measure-drag-header" title="Drag horizontally to navigate measures" style="cursor:ew-resize;touch-action:pan-y;user-select:none" @pointerdown="beginMeasureHeaderDrag" @pointerup="finishMeasureHeaderDrag" @pointercancel="cancelMeasureHeaderDrag">Measure {{selectedBar+1}} · {{project.beats}} beats</span><button type="button" class="secondary" :disabled="selectedBar>=project.bars.length-1" @click="openNoteEditor(noteInst,selectedBar+1)" aria-label="Next lyrics measure">›</button></div>
      <p class="hint">Each segment follows the written note onset and duration. The strip joins adjacent segments visually; rests remain visible as empty space. Editing lyrics never changes note timing, pitch or playback articulation.</p>
      <div class="lyric-timeline" role="group" aria-label="Select a sung note to edit its syllable">
        <div class="lyric-timeline-ruler"><span v-for="beat in project.beats" :key="beat" :style="{left:`${100*(beat-1)/project.beats}%`}">{{beat}}</span></div>
        <div class="lyric-timeline-track">
          <button v-for="slot in lyricTimeline" :key="`${slot.index}:${slot.start}`" type="button" class="lyric-timeline-slot" :class="{'selected':noteSelected===slot.index}" :style="{left:`${100*slot.start/project.beats}%`,width:`${100*(slot.end-slot.start)/project.beats}%`}" :title="`${displayPitch(slot.note.pitch)} · beat ${slot.start+1} · ${slot.note.duration} beats`" @click="selectLyricSlot(slot.index)">{{(lyricVerse===1?slot.note.lyric:slot.note.lyric2)||'·'}}</button>
        </div>
      </div>
      <div v-if="currentLyricOverflow.length" role="alert" class="hint" style="padding:.6rem;border:1px solid #c58b37;border-radius:.4rem;margin:.5rem 0">⚠ {{currentLyricOverflow.length}} lyric syllable(s) extend beyond the last available Voice note. They are retained in the song and will return to the score when you delete and shift left. Add Voice note onsets or resolve the mismatch before exporting.</div><div class="lyric-align-actions"><button type="button" class="secondary" @click="shiftVoicePhraseFromLead(selectedBar,true)">Shift notes + lyrics in time…</button><button type="button" class="secondary" :disabled="noteSelected<0" @click="rippleLyricSyllable('delete')">Delete &amp; shift left</button><button type="button" class="secondary" :disabled="noteSelected<0" @click="rippleLyricSyllable('insert')">Insert &amp; shift right</button><button type="button" class="secondary" :disabled="noteSelected<0" @click="lyricSlotShift(-1)">← Syllable</button><button type="button" class="secondary" :disabled="noteSelected<0" @click="lyricSlotShift(1)">Syllable →</button><button type="button" class="secondary" :disabled="noteSelected<0" @click="lyricSlotShift(-1,true)">← Phrase</button><button type="button" class="secondary" :disabled="noteSelected<0" @click="lyricSlotShift(1,true)">Phrase →</button><button type="button" class="secondary" @click="loopLyricPhrase">{{noteLoopPlaying?'■ Stop loop':'▶ Loop 2 measures'}}</button></div>
      <div v-if="selectedEvent" class="lyric-selected-editor"><label>Selected syllable · {{displayPitch(selectedEvent.pitch)}} · beat {{Number((selectedEvent.start-selectedBar*project.beats+1).toFixed(2))}}<input type="text" maxlength="160" :value="(lyricVerse===1?selectedEvent.lyric:selectedEvent.lyric2)??''" placeholder="Type a syllable" @change="updateSelectedNote(lyricVerse===1?'lyric':'lyric2',($event.target as HTMLInputElement).value)"/></label><label>Syllable position<select :value="(lyricVerse===1?selectedEvent.syllabic:selectedEvent.syllabic2)??'single'" @change="updateSelectedNote(lyricVerse===1?'syllabic':'syllabic2',($event.target as HTMLSelectElement).value)"><option value="single">Single</option><option value="begin">Beginning</option><option value="middle">Middle</option><option value="end">End</option></select></label><label><input type="checkbox" :checked="(lyricVerse===1?selectedEvent.melisma:selectedEvent.melisma2)??false" @change="updateSelectedNote(lyricVerse===1?'melisma':'melisma2',String(($event.target as HTMLInputElement).checked))"/> Extend syllable across following untexted notes</label></div>
      <div class="lyric-batch-editor"><label>Verse<select v-model.number="lyricVerse"><option :value="1">Verse 1</option><option :value="2">Verse 2</option></select></label><label><input type="checkbox" v-model="lyricAcrossMeasures"/> Continue into following measures</label><label class="lyric-batch-text">Paste lyrics (hyphens split syllables; underscores reserve melisma notes)<textarea v-model="lyricBatch" rows="4" placeholder="Don-de el rí-o se que-da…"/></label><button type="button" class="secondary" @click="applyLyricBatch">Align lyrics to note onsets</button></div>
    </section>
    <h3>Notes in this measure</h3><div class="note-event-list"><button v-for="(n,i) in noteMeasure" :key="`${n.start}:${n.pitch}:${i}`" :class="['note-event-button',{selected:noteSelected===i}]" @click="selectNoteEvent(i)">{{displayPitch(n.pitch)}} · beat {{Number((n.start-selectedBar*project.beats+1).toFixed(2))}} · {{n.duration}} beats · {{n.articulation==='staccato'?'· Stacc.':n.articulation==='marcato_staccato'?'^ Marc.':n.articulation==='legato'?'Legato':'Plain'}}{{n.slideTo!==undefined?' · slide → '+displayPitch(n.slideTo):''}}{{n.swellTo!==undefined?' · swell → '+n.swellTo:''}}</button><span v-if="!noteMeasure.length" class="muted">No notes. Tap a cell to add one.</span></div>
    <div v-if="noteDetailsPopup" class="note-properties-backdrop" @click.self="noteDetailsPopup=false"></div><div v-if="selectedEvent" :class="['note-properties',{'note-properties-popup':noteDetailsPopup}]" role="region" aria-label="Selected note properties"><div v-if="noteDetailsPopup" class="note-properties-popup-header"><strong>Note properties · {{displayPitch(selectedEvent.pitch)}}</strong><button type="button" class="secondary" @click="noteDetailsPopup=false">✕ Close</button></div><div v-if="!noteFocusMode&&!noteDetailsPopup" class="inspector-heading"><strong>Note inspector</strong><button type="button" class="secondary" @click="noteInspectorOpen=false" aria-label="Close note inspector">✕</button></div><details class="control-fold selected-note-fold" open><summary>Edit selected note · {{displayPitch(selectedEvent.pitch)}}</summary><div class="note-editor-controls">
      <label>Pitch (MIDI, all semitones)<input type="number" :min="noteCtx.range[0]" :max="noteCtx.range[1]" :value="selectedEvent.pitch" @change="updateSelectedNote('pitch',($event.target as HTMLInputElement).value)"/></label>
      <label>Beat (starts at 1)<input type="number" min="1" :max="project.beats" step="0.25" :value="selectedEvent.start-selectedBar*project.beats+1" @change="updateSelectedNote('start',String(Number(($event.target as HTMLInputElement).value)-1))"/></label><div class="note-position-nudge"><span>Move onset (keep duration)</span><div class="note-nudge-buttons"><button type="button" class="secondary" aria-label="Move selected note half a beat earlier" :disabled="selectedEvent.start-selectedBar*project.beats<=0" @click="nudgeSelectedNote(-0.5)">← ½ beat</button><button type="button" class="secondary" aria-label="Move selected note half a beat later" :disabled="selectedEvent.start-selectedBar*project.beats+selectedEvent.duration>=project.beats-0.0001" @click="nudgeSelectedNote(0.5)">½ beat →</button></div></div>
      <div class="note-duration-field"><label for="note-written-duration">Written duration · {{selectedEvent.duration}} beats</label><div class="note-duration-controls"><button type="button" class="secondary" @click="changeNoteDuration(-0.25)" :disabled="selectedEvent.duration<=0.25" aria-label="Shorten note by quarter beat">−</button><input id="note-written-duration" type="number" min="0.25" :max="selectedDurationMax" step="0.25" v-model="writtenDurationDraft" @keydown.enter.prevent="applyWrittenDurationDraft" @change="applyWrittenDurationDraft"/><button type="button" class="primary" @click="applyWrittenDurationDraft">Apply</button><button type="button" class="secondary" @click="changeNoteDuration(0.25)" :disabled="selectedEvent.duration>=selectedDurationMax-0.0001" aria-label="Lengthen note by quarter beat">+</button></div><input class="note-duration-slider" type="range" min="0.25" :max="selectedDurationMax" step="0.25" :value="selectedEvent.duration" :disabled="selectedDurationMax<=0.25" aria-label="Written note duration in beats" @input="updateSelectedNote('duration',($event.target as HTMLInputElement).value)"/><div class="duration-preview" role="status" :aria-label="`Written duration ${selectedEvent.duration} beats`"><span :style="{width:`${noteDurationPercent}%`}"></span></div><small class="hint">Saved duration: <strong>{{selectedEvent.duration}} beats</strong> · starts at beat {{Number((selectedEvent.start-selectedBar*project.beats+1).toFixed(2))}} · maximum {{selectedDurationMax}} beats until the measure ends. Written length is separate from sounding length.</small></div>
      <label v-if="noteInst.startsWith('Voice')">Lyric syllable (selected note)<input type="text" maxlength="160" :value="selectedEvent.lyric??''" placeholder="e.g. cho" @change="updateSelectedNote('lyric',($event.target as HTMLInputElement).value)"/></label>
      <label v-if="noteInst.startsWith('Voice')">Syllable position<select :value="selectedEvent.syllabic??'single'" @change="updateSelectedNote('syllabic',($event.target as HTMLSelectElement).value)"><option value="single">Single syllable</option><option value="begin">Beginning of word</option><option value="middle">Middle of word</option><option value="end">End of word</option></select></label>
      <label v-if="noteInst.startsWith('Voice')">Verse 2 syllable<input type="text" maxlength="160" :value="selectedEvent.lyric2??''" @change="updateSelectedNote('lyric2',($event.target as HTMLInputElement).value)"/></label>
      <label v-if="noteInst.startsWith('Voice')">Verse 2 syllable position<select :value="selectedEvent.syllabic2??'single'" @change="updateSelectedNote('syllabic2',($event.target as HTMLSelectElement).value)"><option value="single">Single</option><option value="begin">Beginning</option><option value="middle">Middle</option><option value="end">End</option></select></label>
      <label v-if="noteInst.startsWith('Voice')"><input type="checkbox" :checked="selectedEvent.melisma??false" @change="updateSelectedNote('melisma',String(($event.target as HTMLInputElement).checked))"/> Verse 1: extend this syllable over following untexted notes</label>
      <label v-if="noteInst.startsWith('Voice')"><input type="checkbox" :checked="selectedEvent.melisma2??false" @change="updateSelectedNote('melisma2',String(($event.target as HTMLInputElement).checked))"/> Verse 2: extend this syllable over following untexted notes</label>
      <p v-if="noteInst.startsWith('Voice')" class="hint">Attach one sung syllable to each note. For multi-syllable words use begin / middle / end. MusicXML exports lyric elements to MuseScore; tied fragments do not repeat the syllable. Lyrics are saved with protected manual notes.</p>
      <label>Base velocity · {{selectedEvent.velocity??80}} / 127<input type="range" min="1" max="127" :value="selectedEvent.velocity??80" @input="updateSelectedNote('velocity',($event.target as HTMLInputElement).value)"/><input type="number" min="1" max="127" :value="selectedEvent.velocity??80" @change="updateSelectedNote('velocity',($event.target as HTMLInputElement).value)"/></label>
      <label>Articulation<select :value="selectedEvent.articulation??'inherit'" @change="updateSelectedNote('articulation',($event.target as HTMLSelectElement).value)"><option value="inherit">Unmarked</option><option value="staccato">Staccato · (short playback)</option><option value="marcato_staccato">Marcato &gt; (accented)</option><option value="legato">Legato</option></select></label>
      <label>Sounding length (%) · {{Math.round((selectedEvent.gate??(selectedEvent.articulation?ARTICULATION_GATES[selectedEvent.articulation]:0.90))*100)}}%<input type="range" min="1" max="100" step="1" :value="Math.round((selectedEvent.gate??(selectedEvent.articulation?ARTICULATION_GATES[selectedEvent.articulation]:0.90))*100)" @input="updateSelectedNote('gate',($event.target as HTMLInputElement).value)"/><input type="number" min="1" max="100" step="1" :value="Math.round((selectedEvent.gate??(selectedEvent.articulation?ARTICULATION_GATES[selectedEvent.articulation]:0.90))*100)" @change="updateSelectedNote('gate',($event.target as HTMLInputElement).value)"/></label>
      <label v-if="slideSupported">Slide to pitch (MIDI)<select :value="selectedEvent.slideTo??'inherit'" @change="updateSelectedNote('slideTo',($event.target as HTMLSelectElement).value)"><option value="inherit">No slide</option><option v-for="pitch in Array.from({length:noteCtx.range[1]-noteCtx.range[0]+1},(_,i)=>i+noteCtx.range[0])" :key="pitch" :value="pitch">{{displayPitch(pitch)}} ({{pitch}})</option></select></label>
      <label>Subito dynamic (immediate change)<select :value="selectedEvent.subito??'inherit'" @change="updateSelectedNote('subito',($event.target as HTMLSelectElement).value)"><option value="inherit">No subito</option><option v-for="mark in dynamicMarks" :key="mark" :value="mark">subito {{mark}}</option></select></label>
      <label v-if="slideSupported">Swell to velocity<select :value="selectedEvent.swellTo??'inherit'" @change="updateSelectedNote('swellTo',($event.target as HTMLSelectElement).value)"><option value="inherit">No note swell</option><option v-for="v in [35,45,55,65,75,85,95,105,115,125]" :key="v" :value="v">{{v}} / 127</option></select></label>
      <label v-if="noteInst.startsWith('Violin')||noteInst==='Contrabass'">Technique<select :value="selectedEvent.technique??'inherit'" @change="updateSelectedNote('technique',($event.target as HTMLSelectElement).value)"><option value="inherit">None</option><option value="arco">Arco</option><option value="pizzicato">Pizzicato</option></select></label>
    </div><p class="hint">Playback velocity: {{noteSoundingVelocity(selectedEvent)}} / 127 · Audible length: {{Number(noteSoundingDuration(selectedEvent).toFixed(2))}} beats. Marcato adds 14 velocity units to the base setting.</p><button class="secondary" @click="deleteSelectedNote">Delete selected note</button></details></div>
    <p class="hint">Measure loop plays the current instrument only, at the song tempo and transposition, with note articulation, attack and sounding length. The loop uses your latest edits on its next repetition. Switching measures, instruments, songs or tabs stops playback. The note-click audition switch is independent of the measure loop.</p>
    <p class="hint">Articulation does not change the written rhythmic value. New staccato and marcato notes default to a quarter note (1 beat) unless you select a different written duration. Staccato defaults to 28% sounding length; marcato to 58% with a stronger accent; legato to 94%. The sounding-length control overrides these playback defaults. MusicXML exports a dot for unaccented staccato and a &gt; accent for accented staccato/marcato; exact sounding-length percentages apply only to the app's playback. Manual notes are saved in the .tango project, used in playback and MusicXML, and retained by Generate orchestra. “Restore generated measure” removes this instrument-measure's protection without touching other edits. Lead-sheet melody is unchanged.</p>
  </div>
  </section>
  <div v-if="noteFocusMode" class="note-focus-bottom" role="region" aria-label="Selected note quick editing">
    <template v-if="selectedEvent">
      <strong>{{displayPitch(selectedEvent.pitch)}} · beat {{Number((selectedEvent.start-selectedBar*project.beats+1).toFixed(2))}} · {{selectedEvent.duration}} beats</strong>
      <button type="button" class="secondary" aria-label="Move note earlier by half a beat" @click="nudgeSelectedNote(-0.5)">← ½</button>
      <button type="button" class="secondary" aria-label="Move note later by half a beat" @click="nudgeSelectedNote(0.5)">½ →</button>
      <button type="button" class="secondary" aria-label="Shorten note by quarter beat" @click="changeNoteDuration(-0.25)">Shorter −</button>
      <button type="button" class="secondary" aria-label="Lengthen note by quarter beat" @click="changeNoteDuration(0.25)">Longer +</button>
      <label class="note-focus-articulation">Articulation<select :value="selectedEvent.articulation??'inherit'" @change="updateSelectedNote('articulation',($event.target as HTMLSelectElement).value)"><option value="inherit">Unmarked</option><option value="staccato">Staccato ·</option><option value="marcato_staccato">Marcato &gt;</option><option value="legato">Legato</option></select></label>
      <button type="button" class="secondary" @click="noteFocusMore=!noteFocusMore;noteDetailsPopup=false">{{noteFocusMore?'Close details':'All note properties'}}</button>
      <button type="button" class="secondary" @click="deleteSelectedNote">Delete</button>
    </template>
    <span v-else class="hint">Select a note in the grid to edit its timing, articulation and duration here.</span>
  </div>
</section>
</main></div><footer v-if="!performanceMode">Local-first prototype · IndexedDB autosave and multiple local songs · Export .tango.json backups · MusicXML for MuseScore</footer></div>
</template>
