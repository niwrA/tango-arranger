<script setup lang="ts">
import {computed,ref,watch,onMounted,onBeforeUnmount,nextTick} from 'vue';
import AppIcon from './AppIcon.vue';
import PhrasePlanEditor from './PhrasePlanEditor.vue';
import PerformanceChordDiagram from './PerformanceChordDiagram.vue';
import MusicXmlMergeReview from './MusicXmlMergeReview.vue';
import {parseMusicXmlDetailed,type ParsedMusicXml} from './musicXmlImport';
import {applyReviewedMerge,undoReviewedMerge,previewMerge,type MergePlan} from './musicXmlMerge';
import type {PolySynth,Synth} from 'tone';
import {startAudioFromGesture} from './toneSession';
// Tone.js is loaded only after the first user audio gesture.
let Tone:typeof import('tone');
import {version as appVersion} from '../package.json';
import changelogMarkdown from '../CHANGELOG.md?raw';
import {createElChocloStudy} from './presets/el-choclo';
import pequenaStudy from './presets/pequena-2.json';
import {demoProject,blankProject,generate,mergeScores,INSTRUMENTS,FACTORY_INSTRUMENTS,projectInstruments,syncActiveInstruments,setProjectRoster,INSTRUMENT_GROUPS,instrumentsForGroup,type InstrumentGroup,pianoStaffForPitch,midiName,editorPitchName,parsePitch,scoreStats,type Project,type Note,type Instrument,type Role,defaultOrchestration,type ViolinTechnique,type BassTechnique,BASS_TECHNIQUES,bassTechniqueFor,type ArpeggioDirection,violinMarcatoBeatsFor,type FollowTarget,type FollowMethod,type Difficulty,type DynamicMark,DYNAMIC_MARKS,defaultInstrumentSettings,defaultExpression,convertTwoFourToFour,parseChordSequence,chordAt,chordTones,chordCompletions,completeChordToken,changeSectionKey,type SectionKeyChangeMode,instrumentActivity,transposeScore,defaultArticulation,measureArticulation,type Articulation,MAJOR_KEYS,MINOR_KEYS,sectionKey,parseKeySignature,inferSectionKeys,sectionSpans,sectionLetter,resizeSections,copySectionChords,noteEditorContext,noteEditorPitchClass,newNoteWrittenDuration,suggestedEditorNote,replaceInstrumentMeasure,resetInstrumentMeasure,instrumentRange,instrumentFamily,noteSoundingDuration,noteSoundingVelocity,ARTICULATION_GATES,figureMeasure,FIGURE_KINDS,assessPianoPlayability,type FigureKind} from './music';
import {listRosterPresets,saveRosterPreset,removeRosterPreset,getDefaultRoster,setDefaultRoster,type RosterPreset} from './rosterPresets';
import {download,exportMusicXml,exportCompressedMusicXml,exportMuseScoreMscz,exportAbc,exportMobileSheetsBundle,validateMusicXmlDurations,saveProject,loadProject,importMusicXml,importMidi,scoreFromParts,exportEditionPrintPack} from './io';
import {newLocalSongId,saveLocalSong,listLocalSongs,readLocalSong,deleteLocalSong,lastOpenedSongId,rememberOpenedSongId,type LocalSongSummary} from './localProjects';
import {measureLoopEvents} from './measureLoop';
import {EDITION_LEVELS,applyPhrasePlan,currentEditionLevel,getEditionInfo,regenerateInstrumentEdition,snapshotActiveEditions,switchInstrumentEdition} from './editions';
import {effectiveRole as plannedEffectiveRole,effectiveViolinTechnique as plannedViolinTechnique,effectiveBassTechnique as plannedBassTechnique,plannedArticulation,plannedMeasureActive,phraseMeasureMap,type PhrasePlan} from './phrasePlan';
import {playExpressiveEvent} from './expressiveAudio';
import {clampWrittenDuration,dragWrittenDuration,dragWrittenNotePosition,dragWrittenNoteLeftEdge} from './noteEditing';
import {RHYTHM_PRESETS,rhythmSlots,applyRhythmPattern,validateRhythmPattern,quantizeRhythmPreset,addRhythmAttack,updateRhythmAttack,splitRhythmAttack,retimeMeasure,type RhythmSlot,type RhythmPreset,type RhythmMode} from './rhythmEditor';
import {presetRhythmSlots,snapNoteToPreset,nearestRhythmSlot,rhythmAttachmentValid,rhythmAttachmentLabel,clearRhythmSourceIfRetimed} from './rhythmSnap';
import {createLongPressMenu,isContextMenuKey} from './contextPress';
import {selectMapMeasure} from './mapSelection';
import {GESTURE_PRESETS,createTangoGesture,validateGesture,transposeTangoGesture,gestureLabel,gestureSvgPoints,type GesturePreset} from './tangoGestures';
import {capturePosition,addCapturedTap,rhythmFromTaps,melodyFromTaps,type CapturedTap} from './tapCapture';
import {keyboardPitchOptions,keyboardPitches,defaultKeyboardRange,changeKeyboardBoundary,clampKeyboardPitch} from './melodyKeyboard';
import {resolveEditorShortcut,type EditorKind} from './editorShortcuts';
import {arrangementPlaybackWindow,arrangementEventTime,type PlaybackOrigin} from './arrangementPlayback';
import {splitAtMeasureBoundaries,soundingPitchesAtBeat} from './performanceCues';
import {REHEARSAL_SPEEDS,normalizeRehearsalSpeed,effectiveTempo,beatOffsetTicks,playbackDuration,type RehearsalSpeed} from './playbackSpeed';
import {suggestViolinPosition} from './violinPositions';
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
  closeRhythmMenu();closeDynamicsContext();
  closeInstrumentContext();
  phrasePlanDraft.value=undefined;
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
const noteLoopTo=ref(2);
const noteLoopMeasure=ref(-1);
function enterNoteFocusMode(){
  noteEditorTab.value='notes';noteDetailsPopup.value=false;noteFocusMore.value=false;
  syncVisibleMeasureSelection();
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
function syncVisibleMeasureSelection(){
  const first=noteLoopFrom.value-1,last=noteLoopTo.value-1;
  if(selectedBar.value<first||selectedBar.value>last)activateGridMeasure(first);
}
function changeFocusLoopFrom(){
  noteLoopFrom.value=Math.max(1,Math.min(project.value.bars.length,Math.round(Number(noteLoopFrom.value)||1)));
  if(noteLoopTo.value<noteLoopFrom.value)noteLoopTo.value=noteLoopFrom.value;
  syncVisibleMeasureSelection();
}
function changeFocusLoopTo(){
  noteLoopTo.value=Math.max(noteLoopFrom.value,Math.min(project.value.bars.length,Math.round(Number(noteLoopTo.value)||noteLoopFrom.value)));
  syncVisibleMeasureSelection();
}
/** Shift the selected continuous measure window without changing its length. */
function shiftNoteVisibleRange(delta:number){
  const max=project.value.bars.length;
  const span=noteLoopTo.value-noteLoopFrom.value;
  const from=Math.max(1,Math.min(max-span,noteLoopFrom.value+delta));
  const shift=from-noteLoopFrom.value;
  if(!shift)return;
  noteLoopFrom.value=from;noteLoopTo.value=from+span;
  activateGridMeasure(Math.max(from-1,Math.min(noteLoopTo.value-1,selectedBar.value+shift)));
}

// The visible phrase and playback loop intentionally use the same bounds.
const noteOverviewZoom=ref(110);
function setNoteOverviewCount(count:number){
  const from=selectedBar.value+1;
  noteLoopFrom.value=from;
  noteLoopTo.value=Math.min(project.value.bars.length,from+count-1);
}
const pianoPlayabilityWarnings=computed(()=>{
  if(!noteInst.value.startsWith('Piano'))return [];
  const visible=new Set(focusVisibleMeasures.value);
  return assessPianoPlayability(score.value[noteInst.value]??[],project.value,noteInst.value)
    .filter(issue=>visible.has(issue.measure));
});
const focusVisibleMeasures=computed(()=>{
  const max=project.value.bars.length;
  const from=Math.max(1,Math.min(max,Math.round(Number(noteLoopFrom.value)||1)));
  const to=Math.max(from,Math.min(max,Math.round(Number(noteLoopTo.value)||from)));
  // Two measures by default; the user's explicit start and end define the exact view.
  return Array.from({length:to-from+1},(_,i)=>from-1+i);
});
function focusMeasureNotes(bar:number){
  const beats=project.value.beats,begin=bar*beats,end=begin+beats;
  return (score.value[noteInst.value]??[]).filter(n=>n.start<end-1e-7&&n.start+n.duration>begin+1e-7);
}
function focusNoteLeft(note:{start:number;duration:number},bar:number):number{
  return Math.max(0,(note.start-bar*project.value.beats)/project.value.beats*100);
}
function focusNoteWidth(note:{start:number;duration:number},bar:number):number{
  const begin=bar*project.value.beats,end=begin+project.value.beats;
  return Math.max(1,(Math.min(end,note.start+note.duration)-Math.max(begin,note.start))/project.value.beats*100);
}
function focusNoteTop(pitch:number){
  const span=Math.max(1,noteViewEnd.value-noteViewStart.value);
  return Math.max(0,Math.min(100,(noteViewEnd.value-pitch)/span*100));
}
function activateGridMeasure(bar:number){
 if(selectedBar.value===bar)return;
 selectedBar.value=bar;
 overviewFocus.value=bar;
 noteSelected.value=-1;
}
function continuousVisibleNotes(pitch:number){
 const first=focusVisibleMeasures.value[0]??selectedBar.value;
 const last=focusVisibleMeasures.value.at(-1)??first;
 const beats=project.value.beats;
 return (score.value[noteInst.value]??[]).filter(n=>n.pitch===pitch&&n.start<(last+1)*beats-1e-7&&n.start+n.duration>first*beats+1e-7);
}
function focusMeasureOnsets(bar:number){
 return focusMeasureNotes(bar).filter(n=>Math.floor((n.start+1e-7)/project.value.beats)===bar);
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
const statusVisible=ref(false);const statusDismissed=ref(false);const projectDrawerOpen=ref(false);const importDialogOpen=ref(false);const noteEditorSettingsOpen=ref(false);const audioStatus=ref('Audio not tested');const project=ref<Project>(blankProject());const phrasePlanDraft=ref<PhrasePlan|undefined>();type WorkspaceTab='structure'|'lead'|'arrange'|'rhythm'|'notes'|'about';
const workspaceTabs:readonly WorkspaceTab[]=['structure','lead','arrange','rhythm','notes','about'];
function initialWorkspaceTab():WorkspaceTab{
  try{
    const saved=localStorage.getItem('tango-active-tab');
    if(saved&&workspaceTabs.includes(saved as WorkspaceTab))return saved as WorkspaceTab;
  }catch{/* Storage may be disabled; default to the first tab. */}
  return 'structure';
}
type ChangelogEntry={version:string;title:string;summary:string};
const releaseHistory:ChangelogEntry[]=(()=>{
  const lines=changelogMarkdown.split(/\r?\n/);
  const entries:ChangelogEntry[]=[];
  const seen=new Set<string>();
  const heading=/^#{1,3}\s+(.+)$/;
  const version=/\bv(\d+)\.(\d+)(?:\.(\d+))?\b/i;
  for(let i=0;i<lines.length;i++){
    const match=lines[i].match(heading);
    if(!match)continue;
    const number=match[1].match(version);
    if(!number)continue;
    const release=[number[1],number[2],number[3]??'0'].join('.');
    if(seen.has(release))continue;
    seen.add(release);
    const title=match[1].replace(/^.*?\bv\d+\.\d+(?:\.\d+)?\s*[-–—·:]?\s*/i,'').trim();
    const details:string[]=[];
    for(let j=i+1;j<lines.length&&details.length<3;j++){
      const line=lines[j].trim();
      if(heading.test(line))break;
      if(!line||line==='---'||line.startsWith('**Verification:**')||line.startsWith('**Status:**'))continue;
      if(line.startsWith('- '))details.push(line.slice(2));
      else if(!line.startsWith('|')&&!line.startsWith('>')&&!line.startsWith('```')&&line.length>55)details.push(line);
    }
    entries.push({version:release,title:title||'Release improvements',summary:details.join(' ').replace(/\*\*/g,'').replace(/`/g,'').slice(0,580)});
  }
  return entries.sort((a,b)=>{
    const x=a.version.split('.').map(Number),y=b.version.split('.').map(Number);
    return (y[0]-x[0])||(y[1]-x[1])||(y[2]-x[2]);
  });
})();
const active=ref<'structure'|'lead'|'arrange'|'rhythm'|'notes'|'performance'|'about'>(initialWorkspaceTab());
watch(active,tab=>{
  if(!workspaceTabs.includes(tab as WorkspaceTab))return;
  try{localStorage.setItem('tango-active-tab',tab);}catch{/* Keep navigation usable without storage. */}
});const selectedBar=ref(0);const message=ref('New blank tango: five sections of sixteen measures. Enter chords and melody, or import a song.');const importMode=ref<'melody'|'score'|'merge'>('melody');
const pendingParsed=ref<ParsedMusicXml|null>(null);
const pendingSourceName=ref('');
const pendingSourceXml=ref('');const selectedTrack=ref(0);const pending=ref<{name:string;notes:Note[]}[]>([]);const pendingChords=ref<string[]>([]);const pendingKeys=ref<string[]>([]);const playing=ref(false);const playbackOrigin=ref<PlaybackOrigin|null>(null);const score=computed(()=>{const base=project.value.generatedScore??generate(project.value);return project.value.importedScore&&Object.values(project.value.protectedBars??{}).some(Boolean)?mergeScores(project.value,base):base;});const performanceBeat=ref(0);
const rehearsalSpeed=ref<RehearsalSpeed>((()=>{
 try{return normalizeRehearsalSpeed(localStorage.getItem('tango-rehearsal-speed'));}catch{return 1;}
})());
const effectivePlaybackBpm=computed(()=>effectiveTempo(project.value.bpm,rehearsalSpeed.value));
const playbackStartBeat=ref(0);
function setRehearsalSpeed(speed:RehearsalSpeed){
 rehearsalSpeed.value=normalizeRehearsalSpeed(speed);
 try{localStorage.setItem('tango-rehearsal-speed',String(rehearsalSpeed.value));}catch{/* Browser may disallow storage. */}
 // Musical beat scheduling allows live tempo changes without restarting a bar.
 if(Tone&&(playing.value||noteLoopPlaying.value||rhythmLoopPlaying.value)&&!capturePlaying.value){
  Tone.getTransport().bpm.value=effectivePlaybackBpm.value;
 }
}
const performanceMode=ref(false);
const performanceView=ref<'ensemble'|'notes'>('ensemble');
/** A stage title never changes the saved project title. Remove bracketed revision notes,
 * retaining the full name as a tooltip on the displayed heading. */
const performanceShortTitle=computed(()=> {
 const original=project.value.title.trim()||'Untitled tango';
 return original.replace(/\s*[([{].*$/,'').trim()||original;
});
const performanceCardModes=ref<Record<string,'diagram'|'cues'>>({});
function flipPerformanceCard(inst:Instrument){performanceCardModes.value={...performanceCardModes.value,[inst]:performanceCardModes.value[inst]==='cues'?'diagram':'cues'};}
function cardShowsDiagram(inst:Instrument){return performanceCardModes.value[inst]!=='cues';}
const performanceShell=ref<HTMLElement|null>(null);
const performanceStageCompact=ref(false);
const performanceFullscreenActive=ref(false);
const performanceFullscreenHint=ref('');
function onPerformanceFullscreenChange(){
 performanceFullscreenActive.value=Boolean(document.fullscreenElement);
 if(!document.fullscreenElement)performanceStageCompact.value=false;
}
async function togglePerformanceFullscreen(){
 if(document.fullscreenElement){
  try{await document.exitFullscreen();}catch{/* Browser may already have left fullscreen. */}
  performanceFullscreenActive.value=false;performanceStageCompact.value=false;return;
 }
 if(performanceStageCompact.value){performanceStageCompact.value=false;performanceFullscreenHint.value='';return;}
 const root=performanceShell.value;
 if(root&&typeof root.requestFullscreen==='function'){
  try{
   await root.requestFullscreen();
   performanceFullscreenActive.value=true;performanceFullscreenHint.value='';
   return;
  }catch{/* Safari and other browsers may disallow element fullscreen. */}
 }
 performanceStageCompact.value=true;
 performanceFullscreenHint.value='Browser fullscreen is unavailable here. Stage view reduces app chrome, but Safari controls remain. Try opening the app from the Home Screen for a less distracting presentation.';
}
watch(performanceMode,enabled=>{
 if(enabled)return;
 performanceStageCompact.value=false;performanceFullscreenHint.value='';
 if(document.fullscreenElement)void document.exitFullscreen().catch(()=>{});
});
const performanceFocus=ref<Instrument|null>(null);
function togglePerformanceFocus(inst:Instrument){performanceFocus.value=performanceFocus.value===inst?null:inst;}
const performanceBar=computed(()=>Math.min(Math.max(0,project.value.bars.length-1),Math.floor(performanceBeat.value/project.value.beats)));
const performanceSection=computed(()=>project.value.bars[performanceBar.value]?.section??'A');
const performanceMeasureBeat=computed(()=>performanceBeat.value%project.value.beats+1);
/** Animated cue emphasis follows transport beat position rather than a free-running CSS timer. */
const performanceBeatGlow=computed(()=>{
 if(!playing.value)return '0.13';
 const phase=((performanceBeat.value%1)+1)%1;
 return (0.10+0.37*Math.pow(1-phase,2.4)).toFixed(3);
});
const performanceSections=computed(()=>sectionSpans(project.value));
/** Per-beat measure cues show the chord when it first appears, then a dash while
 * that same chord continues. Each row restarts at its own measure boundary. */
function stageMeasureChords(index:number):string[]{
 const p=project.value,bar=p.bars[index];
 if(!bar)return Array.from({length:p.beats},()=> '–');
 let previous='';
 return Array.from({length:p.beats},(_,beat)=>{
  let symbol='';
  try{symbol=chordAt(bar.chord,p.beats,beat).trim();}catch{symbol=bar.chord.split(',')[0]?.trim()??'';}
  if(!symbol)return '–';
  if(symbol===previous)return '–';
  previous=symbol;
  return symbol;
 });
}
const performanceChordBeats=computed(()=>({
 current:stageMeasureChords(performanceBar.value),
 next:stageMeasureChords(performanceBar.value+1),
 nextMeasure:Math.min(project.value.bars.length,performanceBar.value+2)
}));
const performanceParts=computed(()=>projectInstruments(project.value).map(inst=>{const bar=performanceBar.value,beat=performanceBeat.value;const notes=score.value[inst]??[];const sounding=notes.some(n=>n.start<=beat+0.0001&&n.start+noteSoundingDuration(n)>beat);return {inst,role:effectiveRole(inst,bar),sounding};}));
/** Harmonic timeline tracks intra-measure chord changes instead of assuming one chord per bar. */
const performanceHarmony=computed(()=>{
 const p=project.value,bar=performanceBar.value,current=p.bars[bar],localBeat=((performanceBeat.value%p.beats)+p.beats)%p.beats;
 const key=keyForSection(current?.section??'A');
 let upcomingKey=key,changeMeasure:number|null=null;
 for(let i=bar+1;i<p.bars.length;i++){const candidate=keyForSection(p.bars[i].section);if(candidate!==key){upcomingKey=candidate;changeMeasure=i+1;break;}}
 let chord='';try{chord=chordAt(current?.chord??'',p.beats,localBeat);}catch{chord=current?.chord.split(',')[0]?.trim()??'';}
 let nextChord='',nextChordMeasure:number|null=null,nextChordBeat:number|null=null;
 outer:for(let i=bar;i<p.bars.length;i++){
  let changes:{beat:number;chord:string}[];
  try{changes=parseChordSequence(p.bars[i].chord,p.beats);}catch{changes=[{beat:0,chord:p.bars[i].chord.split(',')[0]?.trim()??''}];}
  for(const change of changes){
   if(i===bar&&change.beat<=localBeat+0.0001)continue;
   if(!change.chord||change.chord===chord)continue;
   nextChord=change.chord;nextChordMeasure=i+1;nextChordBeat=change.beat+1;
   break outer;
  }
 }
 return {key,upcomingKey,changeMeasure,chord:chord||'—',nextChord:nextChord||'—',nextChordMeasure,nextChordBeat};
});
function performanceDynamic(inst:Instrument,bar:number):string{
 const p=project.value,b=p.bars[bar];
 if(!b)return '—';
 const explicit=p.measureDynamics?.[`${inst}:${bar}`];
 const mark=explicit?.start??p.expression?.sections[b.section]??'mf';
 return mark+(explicit?.end&&explicit.end!==mark?' → '+explicit.end:'');
}
/** Long-distance stage activity changes only at measure boundaries, not on each note gate. */
const performanceCueParts=computed(()=>performanceParts.value.map(part=>{
 const bar=performanceBar.value,p=project.value,nextBar=Math.min(bar+1,p.bars.length-1);
 const notes=score.value[part.inst]??[];
 const playingInMeasure=notes.some(n=>n.start<(bar+1)*p.beats&&n.start+noteSoundingDuration(n)>bar*p.beats);
 const nextMeasureHasNotes=nextBar!==bar&&notes.some(n=>n.start<(nextBar+1)*p.beats&&n.start+noteSoundingDuration(n)>nextBar*p.beats);
 const activePitches=playing.value?soundingPitchesAtBeat(notes,performanceBeat.value,noteSoundingDuration):[];
 // Keep the violin chart at one suggested hand position per measure rather
 // than jumping to another string position on every note attack.
 const violinMeasurePitches=instrumentFamily(part.inst)==='Violin'
  ?notes.filter(n=>n.start<(bar+1)*p.beats&&n.start+noteSoundingDuration(n)>bar*p.beats).map(n=>n.pitch)
  :[];
 const violinPosition=violinMeasurePitches.length?suggestViolinPosition(Math.max(...violinMeasurePitches)):null;
 const dimUnplayedChordTones=playing.value&&part.role==='chords'&&activePitches.length>0;
 const cueStatus=playingInMeasure?'ACTIVE':nextMeasureHasNotes?'NEXT BAR':'REST';
 return {...part,display:rosterDisplayName(part.inst),playingInMeasure,activePitches,violinPosition,dimUnplayedChordTones,cueStatus,nextRole:effectiveRole(part.inst,nextBar),
  articulation:cellArticulation(part.inst,bar),nextArticulation:cellArticulation(part.inst,nextBar),
  dynamics:performanceDynamic(part.inst,bar),nextDynamics:performanceDynamic(part.inst,nextBar)};
}));
/** Follow the lyric-bearing part, even when a different instrument's notes are selected. */
const performanceVocalCue=computed(()=>{
 const roster=projectInstruments(project.value);
 const preferred=[...roster.filter(inst=>inst.startsWith('Voice')),...roster.filter(inst=>!inst.startsWith('Voice'))];
 let instrument:Instrument|null=null,notes:Note[]=[];
 for(const inst of preferred){
  const lyrical=(score.value[inst]??[]).filter(n=>Boolean(n.lyric||n.lyric2)).sort((a,b)=>a.start-b.start);
  if(lyrical.length){instrument=inst;notes=lyrical;break;}
 }
 if(!instrument)return null;
 const beat=performanceBeat.value,beats=project.value.beats;
 const current=notes.filter(n=>n.start<=beat+0.0001).at(-1);
 const active=Boolean(current&&beat<current.start+noteSoundingDuration(current));
 const nextIndex=notes.findIndex(n=>n.start>beat+0.0001);
 const next=nextIndex>=0?notes[nextIndex]:null;
 const prior=nextIndex>0?notes[nextIndex-1]:null;
 const beginsPhrase=Boolean(next&&(!prior||next.start-(prior.start+prior.duration)>=Math.max(1,beats/2)));
 const lead=next?next.start-beat:Infinity;
 const count=beginsPhrase&&lead>0&&lead<=Math.min(4,beats)?Math.max(1,Math.ceil(lead)):null;
 const words=notes.filter(n=>n.start>=beat-beats&&n.start<beat+beats*2).slice(0,18);
 return {instrument,words,current,active,count,visible:active||count!==null||words.some(n=>n.start>=beat&&n.start<beat+beats)};
});
const performanceMelodyPart=computed<Instrument|null>(()=>{const bar=performanceBar.value;const roster=projectInstruments(project.value);const candidates=roster.filter(inst=>effectiveRole(inst,bar)==='melody');return candidates.find(inst=>(score.value[inst]??[]).some(n=>Math.floor(n.start/project.value.beats)===bar))??candidates[0]??null;});
const performanceDisplayedPart=computed(()=>performanceFocus.value??performanceMelodyPart.value);
const performanceRoll=computed(()=>{const inst=performanceDisplayedPart.value;if(!inst)return null;const beats=project.value.beats;const first=Math.max(0,performanceBar.value-1)*beats;const length=beats*4;const notes=(score.value[inst]??[]).filter(n=>n.start<first+length&&n.start+n.duration>first);const pitches=notes.flatMap(n=>[n.pitch,...(n.gesture?.points.map(p=>p.pitch)??[]),...(n.gesture?.partner?.map(p=>p.pitch)??[]),...(n.slideTo!==undefined?[n.slideTo]:[])]);
 const low=Math.max(24,Math.min(84,...pitches)-2);const high=Math.min(108,Math.max(low+12,...pitches)+2);return {first,length,low,high,notes,slices:splitAtMeasureBoundaries(notes,beats,first,length)};});
const performanceGesturePaths=computed(()=>{
 const window=performanceRoll.value;if(!window)return [];
 const paths:{id:string;points:string;partner:boolean;kind:string}[]=[];
 window.notes.forEach((n,i)=>{
  const lines=n.gesture?[n.gesture.points,...(n.gesture.partner?[n.gesture.partner]:[])]:n.slideTo!==undefined?
    [[{at:0,pitch:n.pitch},{at:1,pitch:n.slideTo}]]:[];
  lines.forEach((points,j)=>{
   const coords=points.map(pt=>{
    const x=(n.start+pt.at*n.duration-window.first)/window.length*1000;
    const y=(1-(pt.pitch-window.low)/(window.high-window.low+1))*1000;
    return x.toFixed(2)+','+y.toFixed(2);
   }).join(' ');
   paths.push({id:i+':'+j,points:coords,partner:j>0,kind:n.gesture?.kind??'slide'});
  });
 });
 return paths;
});
const performanceLyricNotes=computed(()=>{const inst=performanceDisplayedPart.value;if(!inst)return [];return (score.value[inst]??[]).filter(n=>Boolean(n.lyric||n.lyric2)).sort((a,b)=>a.start-b.start);});
const performanceCurrentLyric=computed(()=>{const beat=performanceBeat.value,notes=performanceLyricNotes.value;let index=-1;for(let i=0;i<notes.length;i++){if(notes[i].start<=beat+0.0001)index=i;else break;}const active=index>=0&&beat<notes[index].start+noteSoundingDuration(notes[index])-0.0001;return {notes,index,active};});
const performanceLyricWindow=computed(()=>{const {notes,index,active}=performanceCurrentLyric.value;if(index<0||!performanceDisplayedPart.value)return [];const beat=performanceBeat.value;const measure=Math.floor(beat/project.value.beats);const nearby=notes.filter(n=>Math.floor(n.start/project.value.beats)>=measure-1&&Math.floor(n.start/project.value.beats)<=measure+2);if(!nearby.length)return [];const at=nearby.findIndex(n=>n===notes[index]);const start=Math.max(0,at-4);return nearby.slice(start,Math.min(nearby.length,Math.max(9,at+9))).map(note=>({note,active:active&&note===notes[index]}));});
function performanceSeek(bar:number){const next=Math.max(0,Math.min(project.value.bars.length-1,bar));selectedBar.value=next;if(playing.value&&playbackOrigin.value){void play('selected');}else performanceBeat.value=next*project.value.beats;}
let performanceTicker:ReturnType<typeof setInterval>|undefined;
watch(playing,(isPlaying)=>{if(performanceTicker){clearInterval(performanceTicker);performanceTicker=undefined;}if(isPlaying&&Tone&&playbackOrigin.value){performanceTicker=setInterval(()=>{if(!playing.value||!Tone)return;const transport=Tone.getTransport();performanceBeat.value=Math.min(project.value.bars.length*project.value.beats-0.001,playbackStartBeat.value+transport.ticks/transport.PPQ);},50);}});
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
onMounted(()=>{document.addEventListener('fullscreenchange',onPerformanceFullscreenChange);window.addEventListener('keydown',handleHistoryShortcut);void initializeLocalLibrary();document.addEventListener('pointerdown',closeOpenTopbarMenusOnOutside);document.addEventListener('visibilitychange',saveIfHidden);window.addEventListener('pagehide',saveOnLeave);});
function saveIfHidden(){if(document.visibilityState==='hidden')saveOnLeave();}
onBeforeUnmount(()=>{document.removeEventListener('fullscreenchange',onPerformanceFullscreenChange);window.removeEventListener('keydown',handleHistoryShortcut);if(performanceTicker)clearInterval(performanceTicker);document.removeEventListener('pointerdown',closeOpenTopbarMenusOnOutside);document.removeEventListener('visibilitychange',saveIfHidden);window.removeEventListener('pagehide',saveOnLeave);stopPlayback();void flushAutosave().catch(()=>{});auditionSynth?.dispose();synth?.dispose();loopSynth?.dispose();rhythmLoopSynth?.dispose();captureSynth?.dispose();captureClickSynth?.dispose();});
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
const rhythmPress=createLongPressMenu();
const rhythmMenuIndex=ref<number|null>(null);
const rhythmMenuSlot=computed(()=>rhythmMenuIndex.value===null?undefined:rhythmPattern.value[rhythmMenuIndex.value]);
function closeRhythmMenu(){rhythmMenuIndex.value=null;rhythmPress.cancel();}
function openRhythmMenu(index:number){
  if(!rhythmPattern.value[index])return;
  rhythmSelected.value=index;
  rhythmMenuIndex.value=index;
  void nextTick(()=>document.querySelector<HTMLElement>('.rhythm-context-dialog')?.focus({preventScroll:true}));
}
function rhythmPointerDown(event:PointerEvent,index:number){
  if((event.target as HTMLElement).closest('.rhythm-resize-handle'))return;
  rhythmPress.start(event,()=>openRhythmMenu(index));
}
function rhythmContextKey(event:KeyboardEvent,index:number){
  if(!isContextMenuKey(event))return;
  event.preventDefault();event.stopPropagation();openRhythmMenu(index);
}
function selectRhythmAttack(index:number){
  if(rhythmPress.consumeClick())return;
  rhythmSelected.value=index;
}
function rhythmMenuAction(action:'details'|'accent'|'shorten'|'lengthen'|'earlier'|'later'|'split'|'delete'){
  const index=rhythmMenuIndex.value;
  if(index===null||!rhythmPattern.value[index]){closeRhythmMenu();return;}
  rhythmSelected.value=index;
  closeRhythmMenu();
  const slot=rhythmPattern.value[index];
  if(action==='details'){
    void nextTick(()=>rhythmEditorRegion.value?.querySelector<HTMLInputElement>('.rhythm-event-properties input')?.focus({preventScroll:true}));
  }else if(action==='accent')rhythmEdit({accent:!slot.accent});
  else if(action==='shorten')rhythmDurationStep(-1);
  else if(action==='lengthen')rhythmDurationStep(1);
  else if(action==='earlier')rhythmEdit({beat:slot.beat-rhythmGridStep});
  else if(action==='later')rhythmEdit({beat:slot.beat+rhythmGridStep});
  else if(action==='split')rhythmSplit();
  else if(action==='delete')rhythmDelete();
}
function loadRhythmPreset(){
  closeRhythmMenu();
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
    transport.bpm.value=effectivePlaybackBpm.value;
    transport.scheduleRepeat(time=>{
      // The pattern is read on every repetition so edits are audible immediately.
      const slots=rhythmPattern.value;
      const b=Math.max(0,Math.min(project.value.bars.length-1,Math.floor(rhythmLoopMeasure.value)-1));
      const inst=rhythmPreviewInstrument.value;
      const originals=(score.value[inst]??[]).filter(n=>Math.floor((n.start+1e-7)/project.value.beats)===b);
      if(rhythmLoopSound.value==='instrument'&&originals.length){
        const notes=retimeMeasure(originals,inst,b,project.value.beats,slots,'rhythm',project.value.pianoSplitPitch??60);
        const events=measureLoopEvents(notes,b,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,[],inst,project.value);
        for(const event of events)loopSynth?.triggerAttackRelease(Tone.Frequency(event.pitch,'midi').toFrequency(),playbackDuration(event.durationSeconds,rehearsalSpeed.value),time+playbackDuration(event.onsetSeconds,rehearsalSpeed.value),event.velocity/127);
      }else{
        for(const slot of slots)rhythmLoopSynth?.triggerAttackRelease(slot.accent?'C6':'G5','32n',time+slot.beat*60/effectivePlaybackBpm.value,slot.accent?0.95:0.55);
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
  const articulation=measureArticulation(project.value,noteInst.value,bar,plannedPhrasesByMeasure.value[bar]??null);
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
          if(event.gesture||event.slideTo!==undefined||event.endVelocity!==undefined)
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
  const special=targets.includes('Voice')||targets.some(inst=>rhythmMeasures.value.some(b=>effectiveRole(inst,b)==='melody'));
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
function instrumentSkillShort(inst:Instrument){return ({easy:'Easy',intermediate:'Inter.',advanced:'Adv.'} as const)[instrumentDifficulty(inst)];}
function noteAttackMark(n:Note):string{
 return n.articulation==='marcato_staccato'||n.accent?'›':n.articulation==='staccato'?'·':n.articulation==='legato'?'⌒':'';
}
function gestureText(n:Note):string{return n.gesture?gestureLabel(n.gesture):n.slideTo!==undefined?'slide → '+midiName(n.slideTo):'';}
function gestureMini(n:Note,voice:'primary'|'partner'='primary'):string{
 if(n.gesture)return gestureSvgPoints(n.gesture,voice);
 if(voice==='partner'||n.slideTo===undefined)return '';
 const min=Math.min(n.pitch,n.slideTo)-1,max=Math.max(n.pitch,n.slideTo)+1;
 return '0,'+(19-(n.pitch-min)/(max-min)*15).toFixed(2)+' 100,'+(19-(n.slideTo-min)/(max-min)*15).toFixed(2);
}
function applyReviewedPhrasePlan(plan:PhrasePlan|undefined){
 try{
  stopPlayback();
  project.value=applyPhrasePlan(project.value,plan);
  phrasePlanDraft.value=undefined;
  noteSelected.value=-1;noteDetailsPopup.value=false;
  message.value=plan?'Applied '+plan.phrases.length+' reviewed phrases; protected notes retained and stored alternatives preserved.':'Restored section-based arrangement; protected notes retained.';
 }catch(err){message.value='Phrase planning failed: '+String(err);}
}
function openPhraseNotes(firstMeasure:number,lastMeasure:number){
  const first=Math.max(0,Math.min(project.value.bars.length-1,firstMeasure));
  const last=Math.max(first,Math.min(project.value.bars.length-1,lastMeasure));
  openNoteEditor(overviewInstrument.value,first);
  noteEditorTab.value='notes';
  noteLoopFrom.value=first+1;
  noteLoopTo.value=last+1;
  message.value='Opened '+rosterDisplayName(overviewInstrument.value)+' notes for phrase measures '+(first+1)+'–'+(last+1)+'.';
}
function setInstrumentDifficulty(inst:Instrument,e:Event){switchDifficultyEdition(inst,(e.target as HTMLSelectElement).value as Difficulty);}
function switchDifficultyEdition(inst:Instrument,level:Difficulty){
  try{
    if(level===currentEditionLevel(project.value,inst))return;
    stopPlayback();
    const stored=!!project.value.partEditions?.[inst]?.[level];
    project.value=switchInstrumentEdition(project.value,inst,level);
    noteSelected.value=-1;noteDetailsPopup.value=false;
    message.value=`${rosterDisplayName(inst)}: ${level} edition selected. ${stored?'Stored notes and protected edits restored.':'A new edition was generated; the previous version is preserved.'}`;
  }catch(err){message.value='Cannot change instrument edition: '+String(err);}
}
function regenerateCurrentEdition(inst:Instrument){
  try{
    stopPlayback();
    const level=currentEditionLevel(project.value,inst);
    project.value=regenerateInstrumentEdition(project.value,inst,level);
    noteSelected.value=-1;
    message.value=`Regenerated ${rosterDisplayName(inst)} · ${level}. Protected edits retained; other instruments and stored editions unchanged.`;
  }catch(err){message.value='Could not regenerate selected edition: '+String(err);}
}
function editionDescription(inst:Instrument,level:Difficulty):string{
  const info=getEditionInfo(project.value,inst,level);
  return level+(info.active?' · selected':info.stored?' · saved':' · create on selection')+
    (info.stale?' · song changed':'')+(info.protectedCount?' · '+info.protectedCount+' protected':'');
}
async function exportDifficultyEditionPack(){
  try{
    const exported=snapshotActiveEditions(project.value);
    const blob=await exportEditionPrintPack(exported);
    const base=(project.value.title.replace(/[^a-z0-9-]+/gi,'-')||'tango').toLowerCase();
    download(blob,base+'-difficulty-editions.zip','application/zip');
    message.value='Print pack exported: chosen mixed-skill score and Easy/Intermediate/Advanced MusicXML parts. Open in MuseScore to print.';
  }catch(error){message.value='Edition print pack failed: '+String(error);}
}

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
function inferredArticulation(inst:Instrument):string{return measureArticulation(project.value,inst,selectedBar.value,plannedPhrasesByMeasure.value[selectedBar.value]??null)??'not applicable';}
function setTranspose(e:Event){const n=Number((e.target as HTMLInputElement).value);if(Number.isInteger(n)&&n>=-24&&n<=24)project.value.transposeSemitones=n;}
// Song overview: measure-level overrides are sparse and do not replace section defaults.
const orchestrationScope=ref<'instrument'|'section'|'all'>('all');
const orchestrationToolsOpen=ref(false);
const phrasePlannerVisible=ref(false);
function showOrchestrationPhrasePlanner(){phrasePlannerVisible.value=!phrasePlannerVisible.value;orchestrationToolsOpen.value=false;}
function showOrchestrationRangeSettings(){measureSettingsOpen.value=true;orchestrationToolsOpen.value=false;}
function showOrchestrationSelectedNotes(){orchestrationToolsOpen.value=false;openNoteEditor(overviewInstrument.value,overviewStart.value-1);}
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
const instrumentContext=ref<Instrument|null>(null);
let instrumentHeaderTimer:ReturnType<typeof setTimeout>|null=null;
let ignoreInstrumentHeadingClick=false;
function cancelInstrumentHeaderHold(){
 if(instrumentHeaderTimer!==null){clearTimeout(instrumentHeaderTimer);instrumentHeaderTimer=null;}
}
function openInstrumentContext(inst:Instrument,event?:MouseEvent,suppressClick=false){
 event?.preventDefault();event?.stopPropagation();cancelInstrumentHeaderHold();
 instrumentContext.value=inst;ignoreInstrumentHeadingClick=suppressClick;
 void nextTick(()=>document.querySelector<HTMLElement>('.instrument-context-dialog')?.focus({preventScroll:true}));
}
function beginInstrumentHeaderHold(inst:Instrument){
 cancelInstrumentHeaderHold();
 instrumentHeaderTimer=setTimeout(()=>{instrumentHeaderTimer=null;openInstrumentContext(inst,undefined,true);},550);
}
function closeInstrumentContext(){instrumentContext.value=null;ignoreInstrumentHeadingClick=false;}
function handleInstrumentHeaderClick(inst:Instrument){
 if(ignoreInstrumentHeadingClick){ignoreInstrumentHeadingClick=false;return;}
 overviewInstrument.value=inst;openChordEditor(overviewFocus.value);
}
function handleInstrumentContextKey(inst:Instrument,event:KeyboardEvent){
 if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
   event.preventDefault();openInstrumentContext(inst);
 }
}
function handleMapContextKey(inst:Instrument,bar:number,event:KeyboardEvent){
 if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
   event.preventDefault();openInstrumentMeasureSettings(inst,bar);
 }
}
function openRhythmFromMap(inst:Instrument){
 const same=overviewInstrument.value===inst;
 rhythmTargets.value=[inst];rhythmScope.value='range';
 rhythmStart.value=same?overviewStart.value:Math.max(1,overviewFocus.value+1);
 rhythmEnd.value=same?overviewEnd.value:Math.max(1,overviewFocus.value+1);
 rhythmPreviewInstrument.value=inst;
 rhythmOverwrite.value=false;rhythmFeedback.value='';
 closeInstrumentContext();measureSettingsOpen.value=false;
 active.value='rhythm';
}

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
    ??roster.find(inst=>effectiveRole(inst,measure)==='melody'&&!plannedRest(inst,measure))
    ??roster.find(inst=>effectiveRole(inst,measure)==='melody')
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
// Validate the shared plan once per change, rather than once per map cell or
// performance tick. null explicitly retains the legacy section-based rules.
const plannedPhrasesByMeasure=computed(()=>phraseMeasureMap(project.value));
function effectiveRole(inst:Instrument,i:number):Role{return plannedEffectiveRole(project.value,inst,i,plannedPhrasesByMeasure.value[i]??null);}
function plannedRest(inst:Instrument,i:number):boolean{return plannedMeasureActive(project.value,inst,i,plannedPhrasesByMeasure.value[i]??null)===false;}
function mapRole(inst:Instrument,i:number):Role{return plannedRest(inst,i)?'rest':effectiveRole(inst,i);}
function roleOverridden(inst:Instrument,i:number){return Object.prototype.hasOwnProperty.call(project.value.measureRoles??{},`${inst}:${i}`);}
function violinTechnique(inst:Instrument,i:number):ViolinTechnique|undefined{return inst.startsWith('Violin')?plannedViolinTechnique(project.value,inst,i,plannedPhrasesByMeasure.value[i]??null):undefined;}
function articulationOverride(inst:Instrument,i:number):Articulation{return project.value.articulation?.overrides?.[`${inst}:${i}`]??'auto';}
function cellArticulation(inst:Instrument,i:number):string{
  if(plannedRest(inst,i))return project.value.protectedBars[`${inst}:${i}`]?'Protected notes':'Phrase rest';
  const phrase=plannedPhrasesByMeasure.value[i]??null;
  const explicit=project.value.articulation?.overrides?.[`${inst}:${i}`]??plannedArticulation(project.value,inst,i,phrase);
  if(inst.startsWith('Contrabass')&&effectiveRole(inst,i)==='bass'&&!explicit){
    const technique=plannedBassTechnique(project.value,inst,i,phrase);
    if(technique!=='traditional')return technique.replaceAll('_',' ');
  }
  if(inst.startsWith('Violin')&&effectiveRole(inst,i)==='chords'&&!explicit&&['tango_staccato','pizzicato'].includes(violinTechnique(inst,i)??'')){
    const beats=violinMarcatoBeatsFor(project.value,project.value.bars[i].section,inst as 'Violin I'|'Violin II').map(n=>n+1);
    return `${violinTechnique(inst,i)==='pizzicato'?'Pizz.':'Stacc.'}${beats.length?' ^'+beats.join(','):''}`;
  }
  const mode=measureArticulation(project.value,inst,i,phrase);
  return mode==='marcato_staccato'?'Marc.':mode==='staccato'?'Stacc.':mode==='legato'?(inst.startsWith('Violin')?'Arco':'Legato'):'—';
}
function cellLabel(inst:Instrument,i:number):string{
  const role=mapRole(inst,i);if(plannedRest(inst,i))return 'rest';
  const tech=violinTechnique(inst,i);
  if(inst.startsWith('Contrabass')&&role==='bass'){
    const technique=plannedBassTechnique(project.value,inst,i,plannedPhrasesByMeasure.value[i]??null);
    return technique==='traditional'?'bass':technique.replaceAll('_',' ');
  }
  return role==='chords'&&inst==='Piano'?(project.value.pianoFigures?.[project.value.bars[i].section]??'chords_up').replaceAll('_',' '):role==='chords'&&tech?tech.replaceAll('_',' '):role;
}
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
    pendingParsed.value=null;pendingSourceName.value='';pendingSourceXml.value='';
    if(/\.tango(?:\.json)?$/i.test(file.name)){
      await flushAutosave();const imported=await loadProject(file);await adoptLocalSong(imported);
      structureOpen.value=false;message.value='Portable project imported as a separate local song.';closeImportDialog();
    }else if(/\.(mid|midi)$/i.test(file.name)){
      pending.value=importMidi(await file.arrayBuffer());importMode.value='melody';
      message.value=`Found ${pending.value.length} MIDI tracks. Choose the melody track.`;
    }else{
      const raw=await file.text(),result=parseMusicXmlDetailed(raw);
      pendingParsed.value=result;pendingSourceName.value=file.name;pendingSourceXml.value=raw;
      pending.value=result.parts.map(part=>({name:part.name,notes:part.notes}));
      pendingChords.value=result.chords;pendingKeys.value=result.keys;importMode.value='merge';
      message.value=`Parsed ${result.measureCount} measures and ${result.parts.length} MusicXML part(s). Review the alignment and choose Ours, Theirs, or Combine before applying.`;
    }
    if(pending.value.length)importDialogOpen.value=true;
  }catch(err){message.value=`Import failed: ${String(err)}`;}
  finally{(e.target as HTMLInputElement).value='';}
}
function applyImport(){if(!pending.value.length||importMode.value==='merge')return;if(importMode.value==='melody'){if(pendingChords.value.length)pendingChords.value.forEach((c,i)=>{if(c?.trim()&&project.value.bars[i])project.value.bars[i].chord=c;});if(pendingKeys.value.length){project.value.sectionKeys??={};const assigned=new Set<string>();pendingKeys.value.forEach((key,i)=>{const sec=project.value.bars[i]?.section;if(sec&&key&&!assigned.has(sec)){project.value.sectionKeys![sec]=key;assigned.add(sec);}});}const notes=pending.value[selectedTrack.value]?.notes??[];const needed=Math.ceil((Math.max(0,...notes.map(n=>n.start+n.duration)))/project.value.beats);while(project.value.bars.length<needed)project.value.bars.push({chord:'',melody:[],section:project.value.bars.at(-1)?.section??'A'});project.value.bars.forEach((b,i)=>b.melody=notes.filter(n=>Math.floor(n.start/project.value.beats)===i).map(n=>({...n,start:n.start-i*project.value.beats})));message.value=`Imported ${notes.length} melody notes. Set chords and sections, then generate.`;}else{project.value.importedScore=transposeScore(scoreFromParts(pending.value),-(project.value.transposeSemitones??0));let count=0;for(const inst of INSTRUMENTS)for(let b=0;b<project.value.bars.length;b++){const old=(project.value.generatedScore?.[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===b).map(n=>[n.pitch,n.start,n.duration]);const incoming=(project.value.importedScore[inst]??[]).filter(n=>Math.floor(n.start/project.value.beats)===b).map(n=>[n.pitch,n.start,n.duration]);if(JSON.stringify(old)!==JSON.stringify(incoming)){setProtected(inst,b,true);count++;}}message.value=`Imported edited score; ${count} instrument-measures marked protected. Review before regenerating.`;}pending.value=[];pendingChords.value=[];pendingKeys.value=[];importDialogOpen.value=false;}

async function applyMusicXmlMerge(plan:MergePlan){
 const parsed=pendingParsed.value;
 if(!parsed)return;
 try{
  const review=previewMerge(project.value,parsed,plan);
  const expected=plan.mode==='lead'?
   `The imported score defines ${parsed.measureCount} measures (currently ${project.value.bars.length}). Original material without a reliable match remains in the recoverable backup.`:
   `The existing ${project.value.bars.length}-measure structure stays unchanged.`;
  const warnings=review.conflicts.slice(0,3).join('\n');
  const okay=window.confirm(`Apply reviewed MusicXML merge?\n\n${expected}\n${review.matched} mapped measures; ${review.uncertain} uncertain/unmapped. ${review.changes} proposed changes.\n${warnings}\n\nThe complete existing song, protected parts and difficulty editions will be archived for Undo. Only explicit note choices may replace protected material.`);
  if(!okay)return;
  await flushAutosave();
  const changed=applyReviewedMerge(project.value,parsed,plan);
  changed.importReference={sourceName:pendingSourceName.value,sourceXml:pendingSourceXml.value,
    plan:JSON.parse(JSON.stringify(plan)) as MergePlan,savedAt:new Date().toISOString()};
  project.value=changed;
  selectedBar.value=0;overviewFocus.value=0;overviewStart.value=1;overviewEnd.value=Math.min(8,changed.bars.length);
  chosenSection.value=changed.bars[0]?.section??'A';noteSelected.value=-1;
  closeImportDialog();
  message.value=`MusicXML merge applied: ${changed.bars.length} measures. Original arrangement saved for Undo in Files. ${review.uncertain} mapping decisions may need review.`;
 }catch(error){message.value='MusicXML merge could not be applied: '+String(error);}
}
function keepMusicXmlReference(plan:MergePlan){
 if(!pendingParsed.value)return;
 project.value={...project.value,importReference:{
   sourceName:pendingSourceName.value,sourceXml:pendingSourceXml.value,
   plan:JSON.parse(JSON.stringify(plan)) as MergePlan,savedAt:new Date().toISOString()
 }};
 closeImportDialog();message.value='MusicXML alignment saved as a reference in this Tango project. No notes were changed.';
}
function revertMusicXmlMerge(){
 if(!project.value.importMergeBackup)return;
 if(!window.confirm('Restore the entire song as it was before the last MusicXML merge? Changes made after that merge will be lost.'))return;
 try{
  const restored=undoReviewedMerge(project.value);
  selectProjectInEditor(restored);
  message.value='Restored the song from the MusicXML merge backup.';
 }catch(error){message.value='Unable to restore merge backup: '+String(error);}
}
function closeSongSettings(){projectDrawerOpen.value=false;}
function closeImportDialog(){importDialogOpen.value=false;pending.value=[];pendingChords.value=[];pendingKeys.value=[];pendingParsed.value=null;pendingSourceName.value='';pendingSourceXml.value='';}
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
  playbackStartBeat.value=startMeasure*project.value.beats;
  const window=arrangementPlaybackWindow(project.value.bars.length,project.value.beats,project.value.bpm,startMeasure);
  try{
    Tone=await startAudioFromGesture();
    if(session!==noteLoopSession)return;
    synth??=new Tone.PolySynth(Tone.Synth).toDestination();
    await prepareSamples(projectInstruments(project.value));
    if(session!==noteLoopSession)return;
    const transport=Tone.getTransport();transport.stop();transport.cancel();transport.position=0;transport.bpm.value=effectivePlaybackBpm.value;
    let noteCount=0;
    // Voice is a pitched score part: play its notes with the same synthesizer as the instruments.
    // This is a guide tone, not sung or synthesized speech.
    for(const inst of projectInstruments(project.value)){for(const n of score.value[inst]??[]){
      // Musical tick positions preserve event timing when rehearsal speed is
      // changed mid-performance (unlike precomputed absolute seconds).
      const seconds=arrangementEventTime(n.start,window);
      if(seconds===null)continue;
      const whenTicks=beatOffsetTicks(n.start-window.startBeat,transport.PPQ);
      noteCount++;
      transport.schedule(time=>{
        const barIndex=Math.floor(n.start/project.value.beats);
        const event=measureLoopEvents([n],barIndex,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,project.value.expressionRanges??[],inst,project.value)[0];
        const defaultDuration=playbackDuration(noteSoundingDuration(n)*60/project.value.bpm,rehearsalSpeed.value);
        const defaultVelocity=noteSoundingVelocity(n);
        const focusGain=performanceFocus.value&&performanceFocus.value!==inst?0.3:1;
        if(!event)return;
        if(event.gesture||event.slideTo!==undefined||event.endVelocity!==undefined)
          playExpressiveEvent(Tone.getContext().rawContext as AudioContext,{...event,durationSeconds:playbackDuration(event.durationSeconds,rehearsalSpeed.value),velocity:Math.max(1,Math.round(event.velocity*focusGain)),endVelocity:event.endVelocity===undefined?undefined:Math.max(1,Math.round(event.endVelocity*focusGain))},time);
        else triggerInstrument(inst,event.pitch,event.durationSeconds?playbackDuration(event.durationSeconds,rehearsalSpeed.value):defaultDuration,time,Math.max(1,Math.round((event.velocity||defaultVelocity)*focusGain))/127);
      },whenTicks);
    }}
    if(!noteCount){audioStatus.value=`No notes to play from measure ${window.startMeasure+1}`;message.value=`Nothing to play from measure ${window.startMeasure+1}. Choose an earlier measure, enter notes or generate the orchestra.`;return;}
    audioStatus.value=`Playing from measure ${window.startMeasure+1} · ${noteCount} notes · audio context ${Tone.getContext().state}`;
    transport.scheduleOnce(()=>{if(session!==noteLoopSession)return;playing.value=false;playbackOrigin.value=null;audioStatus.value='Playback finished';transport.stop();synth?.releaseAll();},beatOffsetTicks((project.value.bars.length-startMeasure)*project.value.beats+0.25,transport.PPQ));
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
    const transport=Tone.getTransport();transport.stop();transport.cancel();transport.position=0;transport.bpm.value=effectivePlaybackBpm.value;
    playbackStartBeat.value=from*beats;performanceBeat.value=from*beats;
    
    let count=0;
    if(kind==='lead'){
      for(let bar=from;bar<=to;bar++){
        const changes=parseChordSequence(project.value.bars[bar].chord,beats);
        for(let i=0;i<changes.length;i++){
          const change=changes[i];
          if(!change.chord.trim())continue;
          const next=changes[i+1]?.beat??beats;
          const durationBeats=Math.max(0.1,(next-change.beat)*0.88);
          const pitches=chordTones(change.chord).map(pc=>60+pc);
          const cueBeat=(bar-from)*beats+change.beat;
          transport.schedule(t=>synth?.triggerAttackRelease(pitches.map(p=>Tone.Frequency(p,'midi').toFrequency()),durationBeats*60/effectivePlaybackBpm.value,t,0.55),beatOffsetTicks(cueBeat,transport.PPQ));
          count++;
        }
      }
    }else{
      const inst=instrument??overviewInstrument.value;
      for(const n of score.value[inst]??[]){
        if(n.start<from*beats||n.start>=(to+1)*beats)continue;
        const cueBeat=n.start-from*beats;
        const durationBeats=noteSoundingDuration(n);
        const pitch=n.pitch+(project.value.transposeSemitones??0);
        transport.schedule(t=>triggerInstrument(inst,pitch,Math.max(0.04,durationBeats*60/effectivePlaybackBpm.value),t,noteSoundingVelocity(n)/127),beatOffsetTicks(cueBeat,transport.PPQ));
        count++;
      }
    }
    if(!count){message.value=kind==='lead'?'No chords to preview in this range.':'No generated notes for this instrument in the selected range.';return;}
    audioStatus.value=`Previewing ${kind==='lead'?'lead-sheet chords':(instrument??overviewInstrument.value)} · measures ${from+1}–${to+1}`;
    transport.scheduleOnce(()=>{if(session!==noteLoopSession)return;playing.value=false;playbackOrigin.value=null;transport.stop();synth?.releaseAll();audioStatus.value='Preview finished';},beatOffsetTicks((to-from+1)*beats+0.25,transport.PPQ));
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
    transport.bpm.value=effectivePlaybackBpm.value;
    // Both editor modes loop the visible user-selected measure range.
    let loopPass=0;
    let lastRangeKey='';
    transport.scheduleRepeat(time=>{
      const range=noteFocusLoopRange();
      const rangeKey=range.from+':'+range.to;
      if(rangeKey!==lastRangeKey){loopPass=0;lastRangeKey=rangeKey;}
      const bar=range.from+(loopPass++%(range.to-range.from+1));
      Tone.getDraw().schedule(()=>{if(session===noteLoopSession&&noteLoopPlaying.value)noteLoopMeasure.value=bar;},time);
      // Read the current score at the start of every pass, including manual edits.
      const events=measureLoopEvents(score.value[noteInst.value]??[],bar,project.value.beats,project.value.bpm,project.value.transposeSemitones??0,project.value.expressionRanges??[],noteInst.value,project.value);
      for(const event of events){
        if(event.gesture||event.slideTo!==undefined||event.endVelocity!==undefined)
          playExpressiveEvent(Tone.getContext().rawContext as AudioContext,{...event,durationSeconds:playbackDuration(event.durationSeconds,rehearsalSpeed.value)},time+playbackDuration(event.onsetSeconds,rehearsalSpeed.value));
        else loopSynth?.triggerAttackRelease(Tone.Frequency(event.pitch,'midi').toFrequency(),playbackDuration(event.durationSeconds,rehearsalSpeed.value),time+playbackDuration(event.onsetSeconds,rehearsalSpeed.value),event.velocity/127);
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
watch(()=>project.value.bpm,bpm=>{if(!Tone||!Number.isFinite(bpm)||bpm<=0)return;if(capturePlaying.value)Tone.getTransport().bpm.value=bpm*captureSpeed.value;else if(playing.value||noteLoopPlaying.value||rhythmLoopPlaying.value)Tone.getTransport().bpm.value=effectivePlaybackBpm.value;});
watch(()=>project.value.beats,()=>{if(noteLoopPlaying.value||rhythmLoopPlaying.value||capturePlaying.value)stopPlayback();});
// Note audition is user-gesture initiated (browser audio policy); independent of playback.
const auditionEnabled=ref(true);
let auditionSynth:Synth|null=null;
async function auditionPitch(pitch:number,velocity=85,durationSeconds=0.24){
  if(!auditionEnabled.value)return;
  try{
    Tone=await startAudioFromGesture();
    if(audioEngine.value==='samples'){
      await prepareSamples([noteInst.value]);
      const transposed=Math.max(0,Math.min(127,pitch+(project.value.transposeSemitones??0)));
      triggerInstrument(noteInst.value,transposed,Math.max(0.025,durationSeconds),Tone.now(),Math.max(0.1,Math.min(1,velocity/127)));
      return;
    }
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
  if(note.gesture||note.slideTo!==undefined||note.swellTo!==undefined){
    void startAudioFromGesture().then(tone=>{Tone=tone;playExpressiveEvent(Tone.getContext().rawContext as AudioContext,{
      pitch:note.pitch+(project.value.transposeSemitones??0),
      slideTo:note.slideTo===undefined?undefined:note.slideTo+(project.value.transposeSemitones??0),
      gesture:note.gesture?transposeTangoGesture(note.gesture,project.value.transposeSemitones??0):undefined,
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
const dynamicsCreateShape=ref<'crescendo'|'diminuendo'|null>(null);
const dynamicsCreateInstrument=ref<Instrument|null>(null);
const dynamicsCreateStart=ref('');
const dynamicsCreateEnd=ref('');
const dynamicsCreateEndMeasure=ref(0);
const dynamicsEditEndMeasure=ref(0);
const dynamicsMeasureChoices=computed(()=>Array.from({length:project.value.bars.length},(_,i)=>i));
function hairpinNotesInMeasure(inst:string|null,measure:number){
 if(!inst)return [];
 const beats=project.value.beats;
 return (score.value[inst]??[]).filter(n=>Number.isFinite(n.start)&&n.start>=measure*beats&&n.start<(measure+1)*beats)
  .slice().sort((a,b)=>a.start-b.start).map(n=>({position:Number(n.start.toFixed(6)),label:`${midiName(n.pitch)} · starts at beat ${Number((n.start-measure*beats+1).toFixed(4))}`}));
}
const dynamicsCreateEndNotes=computed(()=>hairpinNotesInMeasure(dynamicsCreateInstrument.value,dynamicsCreateEndMeasure.value));
const dynamicsEditEndNotes=computed(()=>{const i=dynamicsEditRange.value;return i===null?[]:hairpinNotesInMeasure(project.value.expressionRanges?.[i]?.instrument??null,dynamicsEditEndMeasure.value)});
function changeCreateEndMeasure(measure:number){dynamicsCreateEndMeasure.value=measure;dynamicsCreateEnd.value=String((measure+1)*project.value.beats);}
function changeEditEndMeasure(measure:number){dynamicsEditEndMeasure.value=measure;dynamicsEditEnd.value=String((measure+1)*project.value.beats);}

const dynamicsCreateFrom=ref(55);
const dynamicsCreateTo=ref(105);
const dynamicsCreateNotes=computed(()=>{
 const inst=dynamicsCreateInstrument.value;
 if(!inst)return [];
 return (score.value[inst]??[]).filter(n=>Number.isFinite(n.start)).slice().sort((a,b)=>a.start-b.start).map(n=>({position:Number(n.start.toFixed(6)),label:`M${Math.floor(n.start/project.value.beats)+1} · beat ${Number((n.start%project.value.beats+1).toFixed(3))} · ${midiName(n.pitch)}`}));
});
function beginDynamicsHairpin(shape:'crescendo'|'diminuendo'){
 const inst=dynamicsScope.value==='instrument'?noteInst.value:dynamicsTargets(selectedBar.value)[0];
 if(!inst){message.value='Choose an instrument with notes first.';return;}
 dynamicsCreateInstrument.value=inst;
 dynamicsCreateShape.value=shape;
 const notes=(score.value[inst]??[]).filter(n=>Number.isFinite(n.start)).sort((a,b)=>a.start-b.start);
 const first=notes.find(n=>n.start>=selectedBar.value*project.value.beats)??notes[0];
 const next=notes.find(n=>first&&n.start>first.start);
 dynamicsCreateStart.value=String(first?.start??selectedBar.value*project.value.beats);
 dynamicsCreateEnd.value=String(next?.start??((selectedBar.value+1)*project.value.beats));
 dynamicsCreateEndMeasure.value=Math.max(0,Math.min(project.value.bars.length-1,Math.floor((Number(dynamicsCreateEnd.value)-0.000001)/project.value.beats)));
 dynamicsCreateFrom.value=shape==='crescendo'?55:105;
 dynamicsCreateTo.value=shape==='crescendo'?105:55;
}
function saveDynamicsHairpin(){
 const inst=dynamicsCreateInstrument.value;
 const start=Number(dynamicsCreateStart.value),end=Number(dynamicsCreateEnd.value),beats=project.value.beats;
 if(!inst||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>project.value.bars.length*beats){message.value='Choose an end note after the start note.';return;}
 project.value.expressionRanges??=[];
 const endMeasure=Math.min(project.value.bars.length-1,Math.floor(end/beats));
 project.value.expressionRanges.push({instrument:inst,startMeasure:Math.floor(start/beats),startBeat:start%beats,endMeasure,endBeat:end-endMeasure*beats,from:dynamicsCreateFrom.value,to:dynamicsCreateTo.value});
 dynamicsCreateShape.value=null;
 message.value=`Added ${dynamicsCreateFrom.value<dynamicsCreateTo.value?'crescendo':'diminuendo'} for ${inst}.`;
}
const dynamicsEditRange=ref<number|null>(null);
const dynamicsEditStart=ref('');
const dynamicsEditEnd=ref('');
function openHairpinEditor(index:number){
 const range=project.value.expressionRanges?.[index];if(!range)return;
 dynamicsEditRange.value=index;
 dynamicsEditStart.value=String(range.startMeasure*project.value.beats+(range.startBeat??0));
 dynamicsEditEnd.value=String(range.endMeasure*project.value.beats+(range.endBeat??project.value.beats));
 dynamicsEditEndMeasure.value=Math.max(0,Math.min(project.value.bars.length-1,range.endMeasure));
}
function saveHairpinEditor(){
 const index=dynamicsEditRange.value;if(index===null)return;
 const range=project.value.expressionRanges?.[index];if(!range)return;
 const beats=project.value.beats,start=Number(dynamicsEditStart.value),end=Number(dynamicsEditEnd.value);
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>project.value.bars.length*beats){message.value='Select an end note after the start note.';return;}
 const endBar=Math.min(project.value.bars.length-1,Math.floor(end/beats));
 range.startMeasure=Math.floor(start/beats);range.startBeat=start%beats;
 range.endMeasure=endBar;range.endBeat=end-endBar*beats;
 dynamicsEditRange.value=null;
}
const visibleHairpins=computed(()=> (project.value.expressionRanges??[]).map((range,index)=>{
 const start=range.startMeasure*project.value.beats+(range.startBeat??0);
 const end=range.endMeasure*project.value.beats+(range.endBeat??project.value.beats);
 const first=dynamicsPreviewBars.value[0]??0,last=(dynamicsPreviewBars.value.at(-1)??first)+1;
 return {index,range,start,end,from:Math.max(0,(start-first*project.value.beats)/((last-first)*project.value.beats)*100),to:Math.min(100,(end-first*project.value.beats)/((last-first)*project.value.beats)*100),visible:end>first*project.value.beats&&start<last*project.value.beats&&dynamicsTargets(range.startMeasure).includes(range.instrument)};
}).filter(item=>item.visible&&item.to>item.from));
type DynamicsContextTarget={kind:'measure';bar:number}|{kind:'hairpin';index:number};
const dynamicsContext=ref<DynamicsContextTarget|null>(null);
const dynamicsPress=createLongPressMenu();
const dynamicsContextRange=computed(()=>dynamicsContext.value?.kind==='hairpin'
 ?project.value.expressionRanges?.[dynamicsContext.value.index]:undefined);
function closeDynamicsContext(){dynamicsContext.value=null;dynamicsPress.cancel();}
function openDynamicsContext(kind:'measure'|'hairpin',value:number){
 if((kind==='measure'&&!project.value.bars[value])||(kind==='hairpin'&&!project.value.expressionRanges?.[value]))return;
 dynamicsContext.value=kind==='measure'?{kind,bar:value}:{kind,index:value};
 void nextTick(()=>document.querySelector<HTMLElement>('.dynamics-context-dialog')?.focus({preventScroll:true}));
}
function startDynamicsContextHold(event:PointerEvent,kind:'measure'|'hairpin',value:number){
 dynamicsPress.start(event,()=>openDynamicsContext(kind,value));
}
function dynamicsContextKey(event:KeyboardEvent,kind:'measure'|'hairpin',value:number){
 if(!isContextMenuKey(event))return;
 event.preventDefault();event.stopPropagation();openDynamicsContext(kind,value);
}
function clickDynamicsMeasure(bar:number){if(!dynamicsPress.consumeClick())openDynamicPopup(bar);}
function clickDynamicsHairpin(index:number){if(!dynamicsPress.consumeClick())openHairpinEditor(index);}
function dynamicsMenuAction(action:'edit'|'mf'|'f'|'clear'|'crescendo'|'diminuendo'|'start'|'end'|'delete'){
 const target=dynamicsContext.value;
 if(!target)return;
 closeDynamicsContext();
 if(target.kind==='measure'){
  if(action==='edit')openDynamicPopup(target.bar);
  else if(action==='mf'||action==='f')applyDynamicsMarkToBar(target.bar,action);
  else if(action==='clear')applyDynamicsMarkToBar(target.bar,'');
  else if(action==='crescendo'||action==='diminuendo'){
   selectedBar.value=target.bar;beginDynamicsHairpin(action);
  }
 }else{
  const range=project.value.expressionRanges?.[target.index];if(!range)return;
  if(action==='edit')openHairpinEditor(target.index);
  else if(action==='start')openDynamicPopup(range.startMeasure,target.index,'start');
  else if(action==='end')openDynamicPopup(range.endMeasure,target.index,'end');
  else if(action==='delete'){
   if(window.confirm('Delete this '+(range.to>=range.from?'crescendo':'diminuendo')+' hairpin for '+range.instrument+'?')){
    project.value.expressionRanges?.splice(target.index,1);
    message.value='Deleted hairpin for '+range.instrument+'.';
   }
  }
 }
}
watch([active,noteEditorTab],([tab,subtab])=>{if(tab!=='notes'||subtab!=='expression')closeDynamicsContext();});
watch(active,tab=>{if(tab!=='rhythm')closeRhythmMenu();});
const dynamicsPopupBar=ref<number|null>(null);
const dynamicsPopupRange=ref<number|null>(null);
const dynamicsPopupEndpoint=ref<'start'|'end'>('start');
const dynamicsPopupPosition=ref('');
const dynamicsPopupMark=ref('');
function dynamicNotePositions(bar:number){
 const beats=project.value.beats;
 const selectedRange=dynamicsPopupRange.value===null?undefined:project.value.expressionRanges?.[dynamicsPopupRange.value];
 const targets=selectedRange?[selectedRange.instrument]:dynamicsTargets(bar);
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
  return roster.filter(inst=>effectiveRole(inst,barIndex)===dynamicsRole.value);
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
const noteRhythmPreset=ref<'off'|RhythmPreset>('off');
const noteRhythmTargets=computed(()=>noteRhythmPreset.value==='off'?[]:presetRhythmSlots(noteRhythmPreset.value,project.value.beats,noteInst.value,project.value.profile));
const isRhythmGuideBeat=(beat:number)=>noteRhythmTargets.value.some(s=>Math.abs(s.beat-beat)<1e-6);
function rhythmCue(n:Note):string{
 return n.rhythmSource&&rhythmAttachmentValid(n,project.value.beats)?rhythmAttachmentLabel(n.rhythmSource):'';
}
function selectRhythmPreset(value:string){
 if(value==='off'||RHYTHM_PRESETS.some(p=>p.id===value))noteRhythmPreset.value=value as 'off'|RhythmPreset;
}
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
  const cellWidth=gridRect.width/(noteBeats.value.length*focusVisibleMeasures.value.length);
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
    duration=Math.max(0.25,Math.min(project.value.bars.length*beats-(selectedBar.value*beats+drag.startLocal),Math.round((drag.startDuration+dx/drag.cellWidth*noteStep.value)/noteStep.value)*noteStep.value));
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
  events[drag.index]=clearRhythmSourceIfRetimed(events[drag.index],{...events[drag.index],pitch,start:absoluteStart,duration},beats);
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
  const next=Number(Math.max(0,Math.min(beats-0.25,local+delta)).toFixed(4));
  if(Math.abs(next-local)<1e-8){
    message.value='Cannot move note further within its starting measure.';
    return;
  }
  updateSelectedNote('start',String(next));
}
function changeNoteDuration(delta:number){
  if(!selectedEvent.value)return;
  const localStart=selectedEvent.value.start-selectedBar.value*project.value.beats;
  const maxDuration=project.value.bars.length*project.value.beats-selectedEvent.value.start;
  const next=Math.max(0.25,Math.min(maxDuration,Math.round((selectedEvent.value.duration+delta)*4)/4));
  if(Math.abs(next-selectedEvent.value.duration)<0.0001){
    message.value=delta>0?'This note already reaches the end of the song.':'Minimum written duration is 0.25 beats.';
    return;
  }
  updateSelectedNote('duration',String(next));
}
function noteCellClick(pitch:number,beat:number){
  if(suppressNoteClick){suppressNoteClick=false;return;}
  toggleNote(pitch,beat);
}
function openNoteBarContext(pitch:number,beat:number,event?:MouseEvent|KeyboardEvent){
 event?.preventDefault();
 const index=noteAt(pitch,beat);if(index<0)return;
 noteSelected.value=index;
 if(noteFocusMode.value)noteFocusMore.value=true;
 else noteDetailsPopup.value=true;
}
function handleNoteBarContextKey(event:KeyboardEvent,pitch:number,beat:number){
 if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
   event.preventDefault();openNoteBarContext(pitch,beat,event);
 }
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
function snapSelectedNoteNow(){
 const original=selectedEvent.value;
 if(!original){message.value='Select a note to snap first.';return;}
 if(noteRhythmPreset.value==='off'){message.value='Choose a rhythm preset before snapping.';return;}
 const source=original.start,beats=project.value.beats;
 const at=source-selectedBar.value*beats;
 const slot=nearestRhythmSlot(at,noteRhythmPreset.value,beats,noteInst.value,project.value.profile,0.5);
 if(!slot){message.value='No rhythm-preset onset within half a beat. Move the note closer or choose another preset.';return;}
 const chord=noteMeasure.value.map(n=>({...n}));
 let changed=0;
 for(let i=0;i<chord.length;i++){
  if(Math.abs(chord[i].start-source)>1e-6)continue;
  const next=snapNoteToPreset(chord[i],beats,noteInst.value,project.value.profile,noteRhythmPreset.value,0.5);
  if(Math.abs(next.start-source)>1e-8&&chord.some((n,j)=>j!==i&&n.pitch===next.pitch&&Math.abs(n.start-next.start)<1e-8)){
   message.value='Cannot snap: another note of the same pitch already starts at that preset onset.';return;
  }
  chord[i]=next;changed++;
 }
 const chosen=chord.find(n=>n.pitch===original.pitch&&Math.abs(n.start-(selectedBar.value*beats+slot.beat))<1e-6);
 try{
  project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,chord);
  noteSelected.value=noteMeasure.value.findIndex(n=>n.pitch===original.pitch&&Math.abs(n.start-(selectedBar.value*beats+slot.beat))<1e-6);
  if(chosen)auditionEvent(chosen);
  message.value='Snapped '+changed+' simultaneous note(s) to '+rhythmAttachmentLabel(chosen!.rhythmSource!)+' · beat '+Number((slot.beat+1).toFixed(2))+'.';
 }catch(error){message.value='Cannot snap: '+String(error);}
}
function releaseSelectedRhythmSource(){
 const selected=selectedEvent.value;if(!selected?.rhythmSource)return;
 const original=selected.start;
 const notes=noteMeasure.value.map((n,i)=>i===noteSelected.value&&n.rhythmSource?(({rhythmSource,...rest})=>rest)(n):{...n});
 try{
  project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,notes);
  noteSelected.value=noteMeasure.value.findIndex(n=>n.pitch===selected.pitch&&Math.abs(n.start-original)<1e-6);
  message.value='Cleared rhythm source label; note timing was not changed.';
 }catch(error){message.value='Could not clear rhythm source: '+String(error);}
}
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
const selectedDurationMax=computed(()=>selectedEvent.value?Number((project.value.bars.length*project.value.beats-selectedEvent.value.start).toFixed(3)):project.value.beats);
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
  shiftNoteVisibleRange(steps);
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
  if(arrivingFromAnotherView||previousBar!==selectedBar.value){
    const count=arrivingFromAnotherView?Math.min(2,project.value.bars.length):Math.min(previousLoopLength,project.value.bars.length);
    const first=Math.max(0,Math.min(selectedBar.value,project.value.bars.length-count));
    noteLoopFrom.value=first+1;
    noteLoopTo.value=first+count;
  }
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
function pitchClass(pitch:number,beat:number,bar=selectedBar.value){return noteEditorPitchClass(project.value,noteInst.value,bar,beat,pitch);}
/** Color conveys harmonic context, never permission to enter a pitch. */
function displayPitch(pitch:number){
  const accidentals=editorAccidentals.value==='auto'
    ?(parseKeySignature(noteCtx.value.key).fifths<0?'flat':'sharp')
    :editorAccidentals.value;
  return editorPitchName(pitch,accidentals);
}
function noteAt(pitch:number,beat:number){return noteMeasure.value.findIndex(n=>n.pitch===pitch&&Math.abs(n.start-selectedBar.value*project.value.beats-beat)<0.00001);}
function toggleNote(pitch:number,beat:number){
 const preset=noteRhythmPreset.value;
 const slot=preset==='off'?undefined:nearestRhythmSlot(beat,preset,project.value.beats,noteInst.value,project.value.profile,0.5);
 const targetBeat=slot?.beat??beat;
 const index=noteAt(pitch,targetBeat),events=noteMeasure.value.map(n=>({...n}));
 // Tapping beside an occupied preset onset selects it rather than deleting an unexpected note.
 if(index>=0&&slot&&Math.abs(beat-targetBeat)>1e-6){selectNoteEvent(index);return;}
 if(index>=0){auditionEvent(events[index]);events.splice(index,1);noteSelected.value=-1;}
 else{
   const duration=noteLength.value==='auto'
     ?newNoteWrittenDuration(project.value,noteInst.value,selectedBar.value,targetBeat,newNoteArticulation.value)
     :Math.min(noteLength.value,project.value.beats-targetBeat);
   const added=suggestedEditorNote(project.value,noteInst.value,selectedBar.value,targetBeat,pitch,duration);
   if(slot&&preset!=='off')added.rhythmSource={
     kind:'preset',preset,targetBeat:slot.beat,originalBeat:beat,targetDuration:added.duration,accent:slot.accent
   };
   if(newNoteArticulation.value!=='inherit'){
     added.articulation=newNoteArticulation.value;
     added.accent=newNoteArticulation.value==='marcato_staccato';
     delete added.gate;
   }
   auditionEvent(added);events.push(added);
 }
 project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
 if(index<0)noteSelected.value=noteMeasure.value.findIndex(n=>n.pitch===pitch&&Math.abs(n.start-selectedBar.value*project.value.beats-targetBeat)<1e-5);
 message.value=`${noteInst.value} · measure ${selectedBar.value+1}: ${index>=0?'removed':'added'} ${displayPitch(pitch)} at beat ${Number((targetBeat+1).toFixed(2))}${slot?' · preset onset':''}. Manual measure protected.`;
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
    const limited=Math.min(Number(value),project.value.bars.length*project.value.beats-old.start);
    if(limited!==value)message.value=`Duration limited to ${limited} beats: the note must end within the song.`;
    value=limited;
  }
  if(field==='start')value=selectedBar.value*project.value.beats+(value as number);
  const next={...old,[field]:value};
  if((field==='start'||field==='duration')&&old.rhythmSource&&(Math.abs(old.start-next.start)>1e-6||Math.abs(old.duration-next.duration)>1e-6))delete next.rhythmSource;
  if(field==='pitch'&&old.gesture&&typeof value==='number')next.gesture=transposeTangoGesture(old.gesture,value-old.pitch);
  if(field==='slideTo'&&raw!=='inherit')delete next.gesture;
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

function gesturePresetForNote(n:Note):string{
 const g=n.gesture;
 if(!g)return '';
 if(g.kind==='sirena')return 'sirena_'+(g.partner?'double':'single')+'_'+g.contour+(g.tremolo?'_tremolo':'');
 return g.kind+'_'+g.contour;
}
function setSelectedGesturePreset(preset:string){
 if(!selectedEvent.value)return;
 const old=selectedEvent.value,events=noteMeasure.value.map(n=>({...n})),index=noteSelected.value;
 const next:Note={...old};
 try{
  if(!preset)delete next.gesture;
  else{
   next.gesture=createTangoGesture(old,noteInst.value,preset as GesturePreset,noteCtx.value.range);
   next.gate=1; // Sustain the whole contour; players may override the sounding length later.
   delete next.slideTo;
  }
  project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,
    events.map((n,i)=>i===index?next:n));
  noteSelected.value=noteMeasure.value.findIndex(n=>n.pitch===next.pitch&&Math.abs(n.start-next.start)<1e-7);
  message.value=next.gesture?'Applied '+gestureLabel(next.gesture)+' (saved as protected edit)':'Cleared expressive gesture';
  auditionEvent(next);
 }catch(error){message.value='Gesture unavailable: '+String(error);}
}
function updateSelectedGesturePitch(voice:'points'|'partner',index:number,raw:string){
 const old=selectedEvent.value;if(!old?.gesture)return;
 const pitch=Number(raw);
 const range=noteCtx.value.range;
 if(!Number.isInteger(pitch)||pitch<range[0]||pitch>range[1]){message.value='Gesture target must be an available instrument pitch';return;}
 const gesture={...old.gesture,points:old.gesture.points.map(p=>({...p})),
   ...(old.gesture.partner?{partner:old.gesture.partner.map(p=>({...p}))}:{})};
 const path=gesture[voice];if(!path||!path[index])return;
 path[index].pitch=pitch;
 try{
  validateGesture(old,noteInst.value,gesture,range);
  const next={...old,gesture};
  const events=noteMeasure.value.map((n,i)=>i===noteSelected.value?next:n);
  project.value=replaceInstrumentMeasure(project.value,score.value,noteInst.value,selectedBar.value,events);
  noteSelected.value=noteMeasure.value.findIndex(n=>n.pitch===next.pitch&&Math.abs(n.start-next.start)<1e-7);
  auditionEvent(next);
 }catch(error){message.value='Gesture pitch rejected: '+String(error);}
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
<div ref="performanceShell" class="shell" :class="{'compact-help':compactHelp,'performance-stage-compact':performanceStageCompact,'performance-live':performanceMode}"><header class="app-topbar">
  <button class="brand brand-link" type="button" :disabled="performanceMode" @click="active='about'" aria-label="About Tango Arranger and release notes" title="About Tango Arranger and release notes"><span class="logo">𝄞</span><span class="brand-label"><strong>Tango Arranger</strong><small>v{{appVersion}}</small></span></button>
  <div v-if="performanceMode" class="performance-topbar-song-title" :title="project.title||'Untitled tango'">{{performanceShortTitle}}</div>
  <div class="topbar-group topbar-playback transport-bar" role="group" aria-label="Arrangement playback">
    <button type="button" :class="['icon-action','transport-play',playing&&playbackOrigin==='beginning'?'play':'primary']" @click="play('beginning')" title="Play from beginning" aria-label="Play arrangement from beginning" :aria-pressed="playing&&playbackOrigin==='beginning'"><AppIcon name="play-from-start"/></button>
    <button type="button" :class="['icon-action','transport-play',playing&&playbackOrigin==='selected'?'play':'primary']" @click="play('selected')" :title="`Play from selected measure ${selectedBar+1}`" :aria-label="`Play arrangement from selected measure ${selectedBar+1}`" :aria-pressed="playing&&playbackOrigin==='selected'"><AppIcon name="play"/><span class="selected-play-measure">{{selectedBar+1}}</span></button>
    <button type="button" class="secondary icon-action transport-stop" :disabled="!playing" @click="stopPlayback" title="Stop playback" aria-label="Stop arrangement playback"><AppIcon name="square"/></button>
    <details class="topbar-menu playback-speed-menu" @toggle="onTopbarMenuToggle" @keydown.esc.stop.prevent="closeTopbarMenuFromKey($event)">
      <summary class="playback-speed-summary" :title="'Playback speed '+Math.round(rehearsalSpeed*100)+'% · '+Math.round(effectivePlaybackBpm)+' BPM'" :aria-label="'Playback speed '+rehearsalSpeed+' times song tempo. Tap to adjust'">{{rehearsalSpeed}}×<AppIcon name="chevron-down"/></summary>
      <div class="topbar-menu-panel playback-speed-options" role="group" aria-label="Rehearsal playback speed" @click="closeTopbarMenuOnAction($event)">
        <button v-for="speed in REHEARSAL_SPEEDS" :key="speed" type="button" :class="{'selected':rehearsalSpeed===speed}" :aria-pressed="rehearsalSpeed===speed" @click="setRehearsalSpeed(speed)"><strong>{{speed}}×</strong><small>{{Math.round(project.bpm*speed)}} BPM</small></button>
        <span class="playback-speed-note">Changes playback tempo, not the song's BPM.</span>
      </div>
    </details>
    <button v-if="!performanceMode" type="button" class="secondary performance-topbar-button" @click="performanceMode=true" title="Show live performance" aria-label="Show live performance"><AppIcon name="presentation"/><span>Performance</span></button>
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
    <details class="topbar-menu files-menu" @toggle="onTopbarMenuToggle" @keydown.esc.stop.prevent="closeTopbarMenuFromKey($event)"><summary class="icon-action files-summary" title="Import, export and backups" aria-label="Files: import and export"><AppIcon name="folder-open"/><span class="files-label">Files</span><AppIcon name="chevron-down"/></summary><div class="topbar-menu-panel" @click="closeTopbarMenuOnAction($event)" role="group" aria-label="Import and export actions"><button type="button" class="secondary" @click="importDialogOpen=true"><AppIcon name="upload"/> Import / MuseScore round-trip</button><button type="button" class="secondary" @click="exportXml"><AppIcon name="file-down"/> Export MusicXML</button><button type="button" class="secondary" @click="exportMxl"><AppIcon name="file-down"/> Export compressed MusicXML (.mxl)</button><button type="button" class="secondary" @click="exportMscz()"><AppIcon name="file-down"/> Experimental MuseScore (.mscz)</button>
      <button type="button" class="secondary" @click="exportDifficultyEditionPack"><AppIcon name="file-down"/> Printable difficulty editions (.zip)</button>
      <button v-if="project.importMergeBackup" type="button" class="secondary" @click="revertMusicXmlMerge">Undo last MusicXML merge</button><label>Single-instrument MuseScore (.mscz) <select @change="($event.target as HTMLSelectElement).value && exportMscz(($event.target as HTMLSelectElement).value);($event.target as HTMLSelectElement).value=''"><option value="">Choose instrument to export…</option><option v-for="inst in activeRoster" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label><button type="button" class="secondary" @click="exportAbcLead"><AppIcon name="file-down"/> Export ABC lead sheet</button><button type="button" class="secondary" @click="exportForMobileSheets"><AppIcon name="file-down"/> Export for MobileSheets (ABC parts ZIP)</button><button type="button" class="secondary" @click="saveProject(project)"><AppIcon name="archive"/> Export .tango.json backup</button></div></details>
  </div>
  <div v-if="!performanceMode" class="topbar-group topbar-options" role="group" aria-label="Song settings and view">
    <button class="secondary icon-action header-settings" type="button" :aria-expanded="projectDrawerOpen" aria-controls="song-settings-modal" title="Settings for selected song" aria-label="Song settings" @click="projectDrawerOpen=!projectDrawerOpen"><AppIcon name="settings"/></button>
    <button type="button" class="secondary icon-action help-icon-toggle" :aria-pressed="!compactHelp" :title="compactHelp?'Show explanations':'Hide explanations'" :aria-label="compactHelp?'Show explanations':'Hide explanations'" @click="compactHelp=!compactHelp"><AppIcon name="circle-help"/></button>
  </div>
  <div v-if="performanceMode" class="performance-topbar-actions" role="group" aria-label="Stage display options">
    <div class="performance-topbar-view-switch" role="group" aria-label="Performance views">
      <button type="button" :class="{selected:performanceView==='ensemble'}" :aria-pressed="performanceView==='ensemble'" @click="performanceView='ensemble'">Ensemble</button>
      <button type="button" :class="{selected:performanceView==='notes'}" :aria-pressed="performanceView==='notes'" @click="performanceView='notes'">Notes &amp; karaoke</button>
    </div>
    <div class="performance-stage-actions" role="group" aria-label="Stage and editor controls">
      <button type="button" class="secondary performance-stage-action performance-fullscreen-button" :aria-pressed="performanceFullscreenActive||performanceStageCompact" :title="performanceFullscreenActive?'Exit browser full screen':performanceStageCompact?'Exit compact stage view':'Enter full screen (if supported)'" :aria-label="performanceFullscreenActive?'Exit browser full screen':performanceStageCompact?'Exit compact stage view':'Enter full screen'" @click="togglePerformanceFullscreen">
        <AppIcon :name="performanceFullscreenActive||performanceStageCompact?'minimize':'maximize'"/><span>{{performanceFullscreenActive||performanceStageCompact?'Exit screen':'Full screen'}}</span>
      </button>
      <button type="button" class="secondary performance-stage-action performance-editor-button" title="Leave performance mode and return to editor" aria-label="Leave performance mode and return to editor" @click="performanceMode=false">
        <AppIcon name="arrow-left"/><span>Editor</span>
      </button>
    </div>
  </div>
</header>
<div v-if="statusVisible && !statusDismissed && !performanceMode" class="topbar-status" :style="/\b(failed|error|invalid|cannot|could not)\b/i.test(message)?{background:'#fff0f0',color:'#9b1c1c',borderColor:'#e9a2a2'}:undefined" role="status" aria-live="polite"><span class="topbar-status-text">{{message}}</span><button type="button" class="topbar-status-close" title="Dismiss status message" aria-label="Dismiss status message" @click="statusDismissed=true;statusVisible=false"><AppIcon name="x"/></button></div>
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
  <section id="import-workflow-modal" class="app-modal" :class="{'musicxml-merge-modal':importMode==='merge'&&pendingParsed}" role="dialog" aria-modal="true" aria-labelledby="import-workflow-title">
    <div class="app-modal-heading"><div><h2 id="import-workflow-title">Import &amp; MuseScore round-trip</h2><p>Open a portable song, a melody, or an edited score.</p></div><button class="secondary icon-action modal-close" type="button" title="Close import" aria-label="Close import" @click="closeImportDialog"><AppIcon name="x"/></button></div>
    <div class="app-modal-content">
      <label class="file-picker">Choose .tango.json, legacy .tango, MusicXML or MIDI file<input type="file" accept=".tango,.json,.xml,.musicxml,.mid,.midi" @change="importFile"/></label>
      <div v-if="pending.length" class="import-panel" aria-label="Import track selection">
        <p class="hint">{{pending.length}} part(s) detected. Choose how to apply them.</p>
        <label>Import as<select v-model="importMode"><option v-if="pendingParsed" value="merge">Align &amp; merge (review before applying)</option><option value="melody">Melody only (legacy)</option><option value="score">Edited full score (legacy positional import)</option></select></label>
        <MusicXmlMergeReview v-if="importMode==='merge'&&pendingParsed" :project="project" :parsed="pendingParsed" :source-name="pendingSourceName" @apply="applyMusicXmlMerge" @reference="keepMusicXmlReference" @cancel="closeImportDialog"/>
        <label v-if="importMode==='melody'">Track<select v-model.number="selectedTrack"><option v-for="(track,i) in pending" :key="i" :value="i">{{track.name}} ({{track.notes.length}} notes)</option></select></label>
        <button v-if="importMode!=='merge'" type="button" class="primary" @click="applyImport">Apply legacy import</button>
      </div>
      <p class="hint">MusicXML alignment supports per-measure transposition, harmony proposals, source-measure remapping, and protected-note editing. The original song remains available for Undo. Use the legacy positional import only for compatible round-trips with matching structure and parts.</p>
      <p v-if="message.startsWith('Import failed')" role="alert" class="import-error">{{message}}</p>
    </div>
    <div class="app-modal-actions"><button type="button" class="secondary" @click="closeImportDialog">Close</button></div>
  </section>
</div>
 <section v-if="performanceMode" class="performance-workspace performance-expanded">
  <div class="performance-stage-top" role="region" aria-label="Performance measure, section and beat">
   
   <div class="performance-stage-controls">
    <div class="performance-top-seek">
      <span class="performance-seek-index">{{performanceBar+1}}/{{project.bars.length}}</span>
      <label class="performance-compact-seek"><span class="sr-only">Seek to measure</span><input type="range" min="0" :max="Math.max(0,project.bars.length-1)" step="1" :value="performanceBar" @change="performanceSeek(Number(($event.target as HTMLInputElement).value))" :aria-valuetext="`Measure ${performanceBar+1} of ${project.bars.length}`"/></label>
    </div>
    <div class="performance-top-section">
     <div class="performance-section-grid" role="group" aria-label="Jump to section">
      <button v-for="(span,si) in performanceSections" :key="`${span.label}:${span.start}`" type="button" class="performance-section-jump" :class="{'performance-section-jump-active':performanceSection===span.label}" :aria-current="performanceSection===span.label?'true':undefined" :aria-label="`Jump to section ${span.label}, measure ${span.start+1}`" @click="performanceSeek(span.start)">{{sectionLetter(si)}}</button>
     </div>
    </div>
    <div class="performance-top-beat" :aria-label="`Beat ${Math.floor(performanceMeasureBeat)} of ${project.beats}`">
      <div class="performance-beat-display"><strong>{{Math.floor(performanceMeasureBeat)}}</strong><span class="performance-top-beat-count">/{{project.beats}}</span><span class="performance-compact-tempo">{{project.bpm}}</span></div>
      <div class="performance-beat-strip" aria-hidden="true"><span v-for="beat in project.beats" :key="beat" :class="{'current':beat===Math.floor(performanceMeasureBeat),'elapsed':beat<performanceMeasureBeat}"></span></div>
    </div>
   </div>
   <div v-if="performanceVocalCue&&performanceVocalCue.visible" class="performance-vocal-cue" role="region" aria-label="Vocal karaoke and count-in">
    <div class="performance-vocal-heading"><strong>{{rosterDisplayName(performanceVocalCue.instrument)}} · lyrics</strong><span v-if="performanceVocalCue.count!==null">Entrance in {{performanceVocalCue.count}} beat{{performanceVocalCue.count===1?'':'s'}}</span><span v-else>Follow the highlighted syllable</span></div>
    <div v-if="performanceVocalCue.count!==null" class="performance-count-beats" aria-label="Visual lyric entrance count"><span v-for="beat in Math.min(4,project.beats)" :key="beat" :class="{'current':beat===performanceVocalCue.count,'passed':beat>performanceVocalCue.count}">{{beat}}</span></div>
    <div class="performance-lyric-line" aria-live="off"><span v-for="(note,i) in performanceVocalCue.words" :key="`${note.start}:${i}`" :class="{'performance-lyric-active':performanceVocalCue.active&&performanceVocalCue.current===note}">{{note.lyric||note.lyric2||'·'}}</span></div>
   </div>
  </div>
  <p v-if="performanceFullscreenHint" role="status" class="performance-fullscreen-hint">{{performanceFullscreenHint}}</p>
  <div class="performance-stage-main performance-stage-only">
  <div v-if="performanceView==='notes'" class="performance-roll-panel"><div class="performance-roll-heading"><button v-if="performanceDisplayedPart" type="button" class="performance-roll-part-toggle" :class="{'performance-roll-part-focused':performanceFocus===performanceDisplayedPart}" :aria-pressed="performanceFocus===performanceDisplayedPart" @click="togglePerformanceFocus(performanceDisplayedPart)">{{rosterDisplayName(performanceDisplayedPart)}} <span class="instrument-skill-tag" :title="`Difficulty: ${instrumentDifficulty(performanceDisplayedPart)}`">{{instrumentSkillShort(performanceDisplayedPart)}}</span> <small>{{performanceFocus?'Selected · tap to follow melody':'Melody · tap to focus'}}</small></button><h3 v-else>No melody part</h3></div><div v-if="performanceRoll" class="performance-roll" :class="{'performance-roll-with-lyrics':performanceLyricWindow.length>0}" role="group" :aria-label="`Piano roll for ${performanceDisplayedPart} around measure ${performanceBar+1}`"><div class="performance-roll-playhead" :style="{left:`${Math.max(0,Math.min(100,(performanceBeat-performanceRoll.first)/performanceRoll.length*100))}%`}"></div><span v-for="(slice,i) in performanceRoll.slices" :key="i" class="performance-roll-note" :class="{'performance-note-accent':slice.note.accent||slice.note.articulation==='marcato_staccato','performance-note-staccato':slice.note.articulation==='staccato'&&!slice.note.accent,'performance-note-expressive':Boolean(slice.note.gesture||slice.note.slideTo!==undefined),'performance-note-rhythm':Boolean(rhythmCue(slice.note)),'performance-note-continuation':slice.continued,'performance-note-tied':slice.continues}" :style="{left:`${(slice.start-performanceRoll.first)/performanceRoll.length*100}%`,width:`${slice.duration/performanceRoll.length*100}%`,bottom:`${(slice.note.pitch-performanceRoll.low)/(performanceRoll.high-performanceRoll.low+1)*100}%`}" :title="`MIDI ${slice.note.pitch} · beat ${slice.note.start+1} · duration ${slice.note.duration} · ${gestureText(slice.note)}${rhythmCue(slice.note)?' · '+rhythmCue(slice.note):''}`"><span v-if="!slice.continued&&noteAttackMark(slice.note)" class="performance-attack-mark">{{noteAttackMark(slice.note)}}</span><span v-if="!slice.continued&&rhythmCue(slice.note)" class="performance-rhythm-mark" aria-hidden="true">◆</span></span><svg v-if="performanceGesturePaths.length" class="performance-gesture-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><polyline v-for="line in performanceGesturePaths" :key="line.id" :points="line.points" :class="['performance-gesture-path',{'secondary':line.partner,'latigo':line.kind==='latigo'}]"/></svg><div v-if="performanceLyricWindow.length" class="performance-lyrics-overlay"><div class="performance-lyric-line" aria-live="off"><span v-for="(item,i) in performanceLyricWindow" :key="`${item.note.start}:${i}`" :class="{'performance-lyric-active':item.active}">{{item.note.lyric||item.note.lyric2||'·'}}</span></div></div></div><p v-else class="muted">No instrument is assigned the melody role in this measure. Select a part below to view its notes.</p></div>

  <div v-if="performanceView==='notes'" class="performance-ensemble" aria-label="Instrument parts"><button type="button" class="performance-part" v-for="part in performanceParts" :key="part.inst" :class="{'performance-part-selected':performanceDisplayedPart===part.inst,'performance-part-focused':performanceFocus===part.inst}" :aria-pressed="performanceFocus===part.inst" @click="togglePerformanceFocus(part.inst)"><span class="performance-activity" :class="{'performance-activity-on':part.sounding}"></span><strong>{{part.inst}}</strong><span class="performance-part-role">{{part.role}}</span><span class="instrument-skill-tag" :title="`Difficulty: ${instrumentDifficulty(part.inst)}`">{{instrumentSkillShort(part.inst)}}</span></button></div>
  <div v-if="performanceView==='ensemble'" class="performance-cue-grid performance-diagram-grid" aria-label="Instrument chord diagrams and role cues">
    <button v-for="part in performanceCueParts" :key="part.inst" class="performance-cue-panel performance-diagram-card" type="button"
      :class="{'performance-cue-playing':part.playingInMeasure,'performance-cue-rest':!part.playingInMeasure,'performance-cue-focus':performanceFocus===part.inst,'performance-cue-change':part.nextRole!==part.role}"
      :style="{'--cue-beat-glow':performanceBeatGlow}" :aria-label="`${part.display}, current role: ${part.role}. ${cardShowsDiagram(part.inst)?'Chord diagram':'Role and dynamics'}. Tap to switch view`"
      :aria-pressed="!cardShowsDiagram(part.inst)" @click="flipPerformanceCard(part.inst)">
      <span class="performance-cue-identity">
        <strong :title="part.display">{{part.display}}</strong>
        <span class="performance-card-role" :title="`Current role: ${part.role}`">{{part.role}}</span>
        <span v-if="!part.playingInMeasure" class="performance-card-rest-cue">{{part.cueStatus==='NEXT BAR'?'↪':'–'}}</span>
      </span>
      <PerformanceChordDiagram v-if="cardShowsDiagram(part.inst)" :instrument="part.inst" :chord="performanceHarmony.chord" :next-chord="performanceHarmony.nextChord" :current-beats="performanceChordBeats.current" :upcoming-beats="performanceChordBeats.next" :active-beat="Math.floor(performanceMeasureBeat)" :active-pitches="part.activePitches" :dim-unplayed-chord-tones="part.dimUnplayedChordTones" :violin-position="part.violinPosition"/>
      <template v-else>
        <span class="performance-cue-role"><small>Current role</small><strong>{{part.role}}</strong><small>{{part.articulation}}</small></span>
        <span class="performance-cue-next"><span><small>Next role</small><strong>{{part.nextRole}}</strong><small>{{part.nextArticulation}}</small></span><span><small>Dynamics</small><strong>{{part.dynamics}}</strong><small>Next {{part.nextDynamics}}</small></span></span>
      </template>
      <span v-if="!cardShowsDiagram(part.inst)" class="performance-card-mode-hint">⇄</span>
    </button>
  </div>
  </div>
 </section>
<div v-else class="layout"><main :class="{'note-workspace-main':active==='notes'}"><div v-if="newSongOpen" class="editor" role="region" aria-label="Create blank song">
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
</div><nav class="tabs workspace-menu" aria-label="Main work areas"><button :class="{active:active==='structure'}" @click="active='structure'">Structure, Keys &amp; Ensemble</button><button :class="{active:active==='lead'}" @click="active='lead'">Lead sheet</button><button :class="{active:active==='arrange'}" @click="active='arrange'">Orchestration</button><button :class="{active:active==='rhythm'}" @click="active='rhythm'">Rhythm editor</button><button :class="{active:active==='notes'}" @click="active='notes'">Note editor</button><button :class="{active:active==='about'}" @click="active='about'">About &amp; releases</button></nav>
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
  <div class="about-hero"><div><p class="about-eyebrow">THE WORKBENCH</p><h1 id="about-title">Tango Arranger</h1><p class="about-version">Version {{appVersion}} · Local-first orchestral arranging</p></div><div class="about-hero-mark" aria-hidden="true">𝄞</div></div>
  <p class="about-intro">Create Argentine tango arrangements from a melody and chords, shape each orchestral part, and refine the performance note by note. Your songs stay in your browser until you choose to export them.</p>
  <div class="about-content-columns">
  <div class="about-grid">
    <article class="editor"><h2>Start with your song</h2><p>Enter a melody and chords in the Lead Sheet, or import MIDI or MusicXML. Define sections, measure counts, keys and your ensemble in Structure, Keys &amp; Ensemble.</p><button class="secondary" type="button" @click="active='lead'">Open Lead Sheet →</button></article>
    <article class="editor"><h2>Arrange the orchestra</h2><p>Generate parts for piano, contrabass, violins and bandoneons. Assign roles, styles, figures and articulations by section or measure in Orchestration.</p><button class="secondary" type="button" @click="active='arrange'">Open Orchestration →</button></article>
    <article class="editor"><h2>Refine individual notes</h2><p>Edit pitches, written durations, velocities, articulations and expressive gestures. Audition notes or loop a measure while you work.</p><button class="secondary" type="button" @click="active='notes'">Open Note Editor →</button></article>
    <article class="editor"><h2>Listen, save and export</h2><p>Play arrangements in your browser, save songs locally, download .tango.json backups, and export native .mscz scores for MuseScore.</p><button class="secondary" type="button" @click="active='arrange'">Open Orchestration &amp; score details →</button></article>
  </div>
  <div class="editor about-releases"><h2>Release notes</h2><p class="muted">App version: v{{appVersion}} · Versioned history is loaded from CHANGELOG.md.</p>
    <div class="release-entry"><h3>Latest improvements · Not yet assigned a version</h3><p>Native .mscz crescendo and diminuendo hairpins, interactive Dynamics Timeline editing, sampled note audition, compact workspace controls, responsive About layout and restoration of the last selected tab.</p></div>
    <div v-for="release in releaseHistory" :key="release.version" class="release-entry"><h3>v{{release.version}} · {{release.title}}</h3><p>{{release.summary}}</p></div>
    <p class="hint">For the full technical history and verification notes, see CHANGELOG.md in the repository.</p>
  </div>
  </div>
  <p class="hint">Tango Arranger is an experimental arranging tool. Generated parts are starting points for musical editing, not historically verified transcriptions of individual orchestras. Songs are saved in this browser; export a .tango.json backup to transfer them between devices.</p>
</section>
<section v-if="active==='structure'" class="structure-tab"><p class="muted">Define the form of your tango here: the number of sections, their measure lengths, and the concert-pitch key of each section. Select the instrument roster here before preparing the Lead Sheet. Orchestration remains the workspace for instrument roles, articulation and note editing.</p>
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
<div class="lead-command-bar" role="group" aria-label="Lead sheet controls">
  <div class="lead-preview-controls" role="group" aria-label="Chord preview">
    <button type="button" class="secondary" title="Preview chords from the beginning" @click="previewPart('lead',0,project.bars.length-1)">▶ Chords from start</button>
    <button type="button" class="secondary" title="Preview chords from the selected measure" @click="previewPart('lead',selectedBar,project.bars.length-1)">▶ Chords from selected measure {{selectedBar+1}}</button>
    <button type="button" class="secondary" title="Stop chord preview" :disabled="!playing" @click="stopPlayback">■ Stop</button>
  </div>
  <div class="lead-history-controls" role="group" aria-label="Edit history">
    <button type="button" class="secondary" title="Undo the last project edit" aria-label="Undo last edit" :disabled="!undoHistory.length" @click="restoreHistory('undo')">↶ Undo</button>
    <button type="button" class="secondary" title="Redo the last undone project edit" aria-label="Redo last edit" :disabled="!redoHistory.length" @click="restoreHistory('redo')">↷ Redo</button>
  </div>
  <span class="lead-measure-count" aria-label="Number of measures">{{project.bars.length}} measures</span>
</div><p class="muted">Compose melody and harmony here; use Orchestration for instrument roles and techniques. Each section displays its key and measure range. Enter chords directly in any measure. <strong>Enter</strong> saves and advances to the next chord field; <strong>Tab</strong> / <strong>Shift+Tab</strong> move forward / back between chord fields. Type any valid chord symbol freely; suggestions are optional. Tap <strong>Suggestions</strong> to browse variants for the chord under the caret, or simply keep typing. Repeated chords like <code>C,C</code> are allowed. Completion changes only the chord at the cursor, so <code>Dm,A7</code> stays intact when you edit the second chord. For 4/4, <code>D,G</code> changes on beat 3 and <code>D,D,D,G</code> on beat 4. Diminished: <code>Ddim</code> (triad), <code>Ddim7</code> (fully diminished seventh), <code>Dm7b5</code> (half-diminished). Click a measure number to select its melody below; double-click it to focus the melody text editor.</p>
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
<section v-else-if="active==='arrange'" class="overview-section">
<div class="orchestration-top-row">
  <div class="orchestration-top-actions">
    <div class="orchestration-scope-tabs" role="tablist" aria-label="Orchestration editing scope">
      <button v-for="scope in (['all','section','instrument'] as const)" :key="scope" type="button" role="tab" :id="`scope-${scope}`" :aria-selected="orchestrationScope===scope" :aria-controls="'scope-map-panel'" :class="{selected:orchestrationScope===scope}" @click="orchestrationScope=scope">{{scope==='instrument'?'Instrument':scope==='section'?'Section':'All'}}</button>
    </div>
    <div class="orchestration-tool-wrap">
      <button type="button" class="secondary orchestration-more-button" aria-label="Orchestration tools and selected measure actions" aria-controls="orchestration-tools-popup" :aria-expanded="orchestrationToolsOpen" @click="orchestrationToolsOpen=!orchestrationToolsOpen">⋯ <span>Tools</span></button>
      <div v-if="orchestrationToolsOpen" id="orchestration-tools-popup" class="orchestration-tools-popup" role="group" aria-label="Orchestration tools">
        <strong>{{rosterDisplayName(overviewInstrument)}} · measures {{overviewStart}}–{{overviewEnd}}</strong>
        <button type="button" @click="showOrchestrationRangeSettings">Edit selected measures</button>
        <button type="button" @click="showOrchestrationSelectedNotes">Edit selected notes</button>
        <button type="button" :aria-expanded="phrasePlannerVisible" @click="showOrchestrationPhrasePlanner">{{phrasePlannerVisible?'Close':'Open'}} phrase planner</button>
        <p>Select a cell to edit; long-press or right-click a cell or instrument label for contextual options. Shift+click extends the selected range.</p>
      </div>
    </div>
  </div>
  <div class="overview-legend orchestration-right-legend" aria-label="Orchestration role colors">
    <span><i class="legend-dot melody"></i> Melody</span><span><i class="legend-dot chords"></i> Chords / arpeggio / pizzicato</span><span><i class="legend-dot harmony"></i> Harmony</span><span><i class="legend-dot bass"></i> Bass</span><span><i class="legend-dot rest"></i> Rest</span><span><i class="legend-dot overridden"></i> Manual override</span>
  </div>
</div>
<PhrasePlanEditor :project="project" :start-open="true" v-if="phrasePlannerVisible" :draft="phrasePlanDraft" @update:draft="phrasePlanDraft=$event" @apply="applyReviewedPhrasePlan" @open-notes="openPhraseNotes"/>
<div v-if="orchestrationScope!=='all'" class="orchestration-map-filter" role="group" aria-label="Orchestration map filter">
  <label v-if="orchestrationScope==='instrument'">Instrument <select v-model="overviewInstrument" aria-label="Instrument shown in orchestration map"><option v-for="inst in overviewInstruments" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label>
  <label v-if="orchestrationScope==='section'">Orchestra group <select v-model="selectedInstrumentGroup" aria-label="Orchestra group shown in orchestration map"><option v-for="group in instrumentGroupOptions" :key="group" :value="group">{{group==='rhythm'?'Rhythm section':group==='melody'?'Melody section':'Harmony section'}}</option></select></label>
</div>
<details v-if="orchestrationScope==='section'" class="orchestration-group-members"><summary>Choose instruments in this group</summary><div class="orchestration-group-checks" role="group" :aria-label="`Instruments in ${selectedInstrumentGroup} section`"><label v-for="inst in activeRoster" :key="inst"><input type="checkbox" :checked="groupMembers(selectedInstrumentGroup).includes(inst)" :disabled="groupMembers(selectedInstrumentGroup).length===1&&groupMembers(selectedInstrumentGroup).includes(inst)" @change="toggleGroupMember(inst,($event.target as HTMLInputElement).checked)"/>{{rosterDisplayName(inst)}}</label></div><p class="hint">Group membership is saved with this song. These are functional viewing groups, not the A/B/C song parts or generated musical roles.</p></details>
<div class="orchestration-instrument-scope" id="scope-map-panel" role="tabpanel" :aria-labelledby="`scope-${orchestrationScope}`">
<div v-if="measureSettingsOpen" class="note-properties-backdrop" @click.self="measureSettingsOpen=false"></div>
<div v-if="measureSettingsOpen" class="note-properties note-properties-popup measure-settings-popup" role="dialog" aria-modal="true" tabindex="-1" :aria-label="`Settings for ${rosterDisplayName(overviewInstrument)}, measures ${overviewStart}–${overviewEnd}`" @keydown.esc.stop.prevent="measureSettingsOpen=false">
<div class="note-properties-popup-header"><strong>{{rosterDisplayName(overviewInstrument)}} · measures {{overviewStart}}–{{overviewEnd}}</strong><button type="button" class="secondary" @click="measureSettingsOpen=false">✕ Close</button></div>
<div class="editor overview-edit"><p class="map-range-summary" role="status">{{rosterDisplayName(overviewInstrument)}} · measures <strong>{{overviewStart}}–{{overviewEnd}}</strong> · {{Math.max(0,overviewEnd-overviewStart+1)}} selected</p><div class="overview-controls"><label>Section shortcut<select :value="''" aria-label="Select section to set measure range" @change="selectOverviewSectionRange(Number(($event.target as HTMLSelectElement).value));($event.target as HTMLSelectElement).value=''"><option value="" disabled>Choose section…</option><option v-for="(span,i) in sectionSpans(project)" :key="`${span.start}:${i}`" :value="i">{{sectionLetter(i)}} · {{span.start+1}}–{{span.start+span.measures}}</option></select></label><label>From measure<input v-model.number="overviewStart" type="number" min="1" :max="project.bars.length" @change="anchorMapRangeFromInput"/></label><label>To measure<input v-model.number="overviewEnd" type="number" :min="overviewStart" :max="project.bars.length" @change="anchorMapRangeFromInput"/></label><label>Musical role<select v-model="overviewRole"><option value="inherit">Inherit section</option><option v-for="role in dynamicsRoles" :key="role" :value="role">{{role}}</option></select></label><label v-if="overviewInstrument.startsWith('Violin')||overviewInstrument.startsWith('Bandoneon')">Articulation<select v-model="overviewArt"><option v-for="mode in articulationModes" :key="mode" :value="mode">{{mode==='auto'?'Inherit default':mode==='legato'?(overviewInstrument.startsWith('Violin')?'Arco / legato':'Legato'):mode.replaceAll('_',' ')}}</option></select></label><label v-if="overviewInstrument.startsWith('Violin')">Chord technique<select v-model="overviewTechnique"><option value="inherit">Inherit section</option><option v-for="tech in violinTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label><label v-if="overviewInstrument==='Contrabass'">Bass technique<select v-model="overviewBassTechnique"><option value="inherit">Inherit section</option><option v-for="tech in bassTechniques" :key="tech" :value="tech">{{tech.replaceAll('_',' ')}}</option></select></label></div><div v-if="overviewInstrument==='Piano'" class="overview-piano-figure"><label>Piano figure · section {{chosenSection}}<select :value="pianoFigureForSection()" @change="setPianoFigure"><option v-for="kind in FIGURE_KINDS" :key="kind" :value="kind">{{figureLabels[kind]}}</option></select></label><button class="secondary" @click="nextPianoFigureVariation">↻ New section piano variation</button><p class="hint">Generated Piano Chords measures in this section use the selected figure. Protected manual measures stay unchanged.</p></div><div class="overview-actions" role="toolbar" aria-label="Apply selected instrument settings"><button type="button" class="primary" title="Apply role, articulation and technique to selected measures" aria-label="Apply to range" @click="applyOverviewRange();measureSettingsOpen=false">✓ Apply</button><button type="button" class="secondary icon-action" :title="`Apply settings to entire section ${chosenSection}`" :aria-label="`Apply to section ${chosenSection}`" @click="applyOverviewSection"><AppIcon name="layers"/></button><button type="button" class="secondary icon-action" title="Select all measures in the song" aria-label="Select whole song" @click="overviewStart=1;overviewEnd=project.bars.length;mapRangeAnchor=0"><AppIcon name="list-check"/></button><button type="button" class="secondary icon-action" title="Regenerate orchestration, retaining protected edits" aria-label="Regenerate orchestration" @click="regenerate"><AppIcon name="refresh-cw"/></button><button type="button" class="secondary icon-action" title="Open note editor for selected instrument and measure" aria-label="Edit notes in selected measure" @click="openNoteEditor(overviewInstrument,overviewFocus)"><AppIcon name="pencil"/></button><button type="button" class="secondary" title="Work with rhythm in the selected measures for this instrument" @click="openRhythmFromMap(overviewInstrument)">Edit rhythm →</button></div><p v-if="overviewNotice" class="hint overview-feedback" role="status">{{overviewNotice}}</p></div>
</div>
<div class="overview-workspace"><div class="overview-map-pane">
<Teleport to="body"><div v-if="instrumentContext" class="instrument-context-backdrop" @click.self="closeInstrumentContext()">
  <div class="instrument-context-dialog" role="dialog" aria-modal="true" tabindex="-1" :aria-label="'Options for '+rosterDisplayName(instrumentContext!)" @keydown.esc.stop.prevent="closeInstrumentContext()">
    <div class="instrument-context-header"><strong>{{rosterDisplayName(instrumentContext!)}} · options</strong><button type="button" class="secondary" @click="closeInstrumentContext()">✕ Close</button></div>
    <p>Measure {{overviewFocus+1}} · selected range {{overviewStart}}–{{overviewEnd}}. These shortcuts open existing tools without changing note data.</p>
    <div class="instrument-context-actions">
      <button type="button" class="secondary" @click="openNoteEditor(instrumentContext!,overviewFocus);closeInstrumentContext()">Edit notes in selected measure</button>
      <button type="button" class="secondary" @click="overviewInstrument=instrumentContext!;openChordEditor(overviewFocus);closeInstrumentContext()">Edit measure chords</button>
      <button type="button" class="secondary" @click="openInstrumentMeasureSettings(instrumentContext!,overviewFocus);closeInstrumentContext()">Role and technique for measure(s)</button>
      <button type="button" class="secondary" @click="openRhythmFromMap(instrumentContext!)">Edit rhythm for this instrument</button>
      <button type="button" class="secondary" @click="previewPart('instrument',0,project.bars.length-1,instrumentContext!);closeInstrumentContext()">▶ Play instrument from start</button>
    </div>
    <label>Instrument difficulty edition<select :value="instrumentDifficulty(instrumentContext!)" @change="switchDifficultyEdition(instrumentContext!,($event.target as HTMLSelectElement).value as Difficulty);closeInstrumentContext()">
      <option v-for="level in EDITION_LEVELS" :key="level" :value="level">{{editionDescription(instrumentContext!,level)}}</option>
    </select></label>
    <div class="instrument-context-edition-actions"><button type="button" class="secondary" @click="regenerateCurrentEdition(instrumentContext!);closeInstrumentContext()">↻ Regenerate selected edition</button><button type="button" class="secondary" @click="exportDifficultyEditionPack();closeInstrumentContext()">Export all editions (.zip)</button></div>
    <small>Long-press or right-click an instrument label to open this menu. Use Shift+F10 or the menu key with a keyboard.</small>
  </div>
</div></Teleport>
<div class="song-map-scroll"><table class="song-map"><thead><tr class="song-map-section-row"><th class="sticky-instrument">Sections</th><th v-for="group in mapSectionGroups" :key="group.start" :colspan="group.visibleCount" class="song-map-section-heading"><button type="button" class="song-map-section-toggle" :aria-expanded="!group.collapsed" :aria-label="`${group.collapsed?'Expand':'Collapse'} section ${sectionLetter(group.sectionIndex)}, measures ${group.start+1}–${group.start+group.measures}`" @click="toggleMapSection(group.start)"><strong>{{sectionLetter(group.sectionIndex)}}</strong><span>{{group.start+1}}–{{group.start+group.measures}}</span><span aria-hidden="true">{{group.collapsed?'▸':'▾'}}</span></button></th></tr><tr><th class="sticky-instrument">Instrument</th><th v-for="({bar:b,index:i}) in mapVisibleMeasures" :key="i" :class="{'section-break':i===0||b.section!==project.bars[i-1].section,'map-range-heading':i+1>=overviewStart&&i+1<=overviewEnd}"><div class="measure-chord-inline"><button type="button" class="measure-heading-select" :title="`Select measure ${i+1}; Shift+click to extend the instrument range`" @click="selectOverviewMeasureHeading(i,$event)" @keydown.shift.enter.stop.prevent="selectOverviewMeasureHeading(i,$event)"><small>{{b.section}} · {{keyForSection(b.section)}}</small><strong>{{i+1}}</strong></button><input type="text" :value="b.chord" :aria-label="`Chords in measure ${i+1}`" title="Edit harmony inline; Enter saves" placeholder="—" spellcheck="false" autocomplete="off" @focus="selectLeadMeasure(i)" @change="commitInlineChord(i,$event)" @keydown.enter.prevent="commitInlineChord(i,$event)" @keydown.esc.prevent="cancelInlineChord(i,$event)"/></div></th></tr></thead><tbody><tr v-for="inst in mapVisibleInstruments" :key="inst"><th class="sticky-instrument"><div class="instrument-heading-layout"><button type="button" class="instrument-heading-button" :title="`Edit chords in selected measure for ${inst}; long-press, right-click or Shift+F10 for instrument options`" @contextmenu.prevent.stop="openInstrumentContext(inst,$event)" @touchstart.passive="beginInstrumentHeaderHold(inst)" @touchend="cancelInstrumentHeaderHold" @touchcancel="cancelInstrumentHeaderHold" @touchmove="cancelInstrumentHeaderHold" @keydown="handleInstrumentContextKey(inst,$event)" @click="handleInstrumentHeaderClick(inst)">{{rosterDisplayName(inst)}} <span class="instrument-skill-tag" :title="`Difficulty: ${instrumentDifficulty(inst)}`">{{instrumentSkillShort(inst)}}</span><span aria-hidden="true">♫</span></button><button type="button" class="instrument-context-trigger" :aria-label="`More options for ${rosterDisplayName(inst)}`" :title="`Instrument options for ${rosterDisplayName(inst)}`" @click.stop="openInstrumentContext(inst)">⋯</button><div class="instrument-row-preview" role="group" :aria-label="`Playback ${inst}`"><button type="button" class="secondary" :title="`Play ${inst} from measure 1`" :aria-label="`Play ${inst} from start`" @click.stop="previewPart('instrument',0,project.bars.length-1,inst)">▶ 1</button><button type="button" class="secondary" :title="`Play ${inst} measures ${overviewStart}–${overviewEnd}`" :aria-label="`Play ${inst} selected measures`" @click.stop="previewPart('instrument',overviewStart-1,overviewEnd-1,inst)">▶ {{overviewStart}}–{{overviewEnd}}</button></div></div></th><td v-for="({bar:b,index:i}) in mapVisibleMeasures" :key="i" :class="{'section-break':i===0||b.section!==project.bars[i-1].section}"><button type="button" :class="['song-cell',`song-role-${mapRole(inst,i)}`,{focused:overviewFocus===i&&overviewInstrument===inst,modified:roleOverridden(inst,i)||articulationOverride(inst,i)!=='auto'||Boolean(project.measureViolinTechniques?.[`${inst}:${i}`])||Boolean(project.measureBassTechniques?.[`${inst}:${i}`]),'range-selected':overviewInstrument===inst&&i+1>=overviewStart&&i+1<=overviewEnd,'range-start':overviewInstrument===inst&&i+1===overviewStart,'range-end':overviewInstrument===inst&&i+1===overviewEnd}]" :data-map-measure="i" :data-map-instrument="inst" :aria-label="`${inst}, measure ${i+1}, ${mapRole(inst,i)}. Double-click or press Enter to edit notes; click then Shift+click to select a range.`" :title="`${inst} · measure ${i+1} · ${mapRole(inst,i)} · ${cellArticulation(inst,i)} · Double-click / Enter: edit notes`" @contextmenu="openInstrumentMeasureSettings(inst,i,$event)" @touchstart.passive="startInstrumentMeasureHold(inst,i)" @touchend="cancelMeasureSettingsHold" @touchcancel="cancelMeasureSettingsHold" @touchmove="cancelMeasureSettingsHold" @click="selectOverviewMapCell(inst,i,$event)" @dblclick.stop="onMapCellDoubleClick(inst,i,$event)" @keydown.enter.stop.prevent="onMapCellEnter(inst,i,$event)" @keydown.space.stop.prevent="selectOverviewMapCell(inst,i,$event)" @keydown="handleMapContextKey(inst,i,$event)"><span class="cell-role">{{cellLabel(inst,i)}}</span><small>{{cellArticulation(inst,i)}}</small></button></td></tr></tbody></table></div><p v-if="inlineHarmonyFeedback" class="inline-harmony-feedback" role="status">{{inlineHarmonyFeedback}}</p>
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
      <Teleport to="body"><div v-if="rhythmMenuSlot" class="context-sheet-backdrop" @click.self="closeRhythmMenu()">
  <div class="context-sheet-dialog rhythm-context-dialog" role="dialog" aria-modal="true" tabindex="-1" :aria-label="'Rhythm attack options for beat '+(rhythmMenuSlot.beat+1)" @keydown.esc.stop.prevent="closeRhythmMenu()">
    <div class="context-sheet-header"><strong>Rhythm attack · beat {{Number((rhythmMenuSlot.beat+1).toFixed(2))}}</strong><button type="button" class="secondary" @click="closeRhythmMenu()">✕ Close</button></div>
    <p>Duration {{rhythmMenuSlot.duration}} beats · {{rhythmMenuSlot.accent?'accented':'unaccented'}}. Changes affect the editable grid; apply the pattern separately to change instrument notes.</p>
    <button type="button" class="secondary" @click="rhythmMenuAction('details')">Edit beat and written duration…</button>
    <button type="button" class="secondary" @click="rhythmMenuAction('accent')">{{rhythmMenuSlot.accent?'Remove accent':'Add accent'}}</button>
    <div class="context-sheet-two"><button type="button" class="secondary" :disabled="rhythmMenuSlot.beat<=0" @click="rhythmMenuAction('earlier')">← Move ¼ beat</button><button type="button" class="secondary" :disabled="rhythmMenuSlot.beat+rhythmGridStep>=project.beats" @click="rhythmMenuAction('later')">Move ¼ beat →</button></div>
    <div class="context-sheet-two"><button type="button" class="secondary" :disabled="rhythmMenuSlot.duration<=rhythmGridStep" @click="rhythmMenuAction('shorten')">Shorten ¼ beat</button><button type="button" class="secondary" @click="rhythmMenuAction('lengthen')">Lengthen ¼ beat</button></div>
    <button type="button" class="secondary" :disabled="rhythmMenuSlot.duration<rhythmGridStep*2" @click="rhythmMenuAction('split')">Split attack</button>
    <button type="button" class="secondary danger" @click="rhythmMenuAction('delete')">Delete attack</button>
  </div>
</div></Teleport>
<div class="rhythm-track" role="group" aria-label="Editable rhythm attacks and durations">
        <button v-for="beat in rhythmSteps" :key="beat" type="button" class="rhythm-step-cell" :class="{'rhythm-step-downbeat':Number.isInteger(beat)}" :title="`Add attack at beat ${beat+1}`" :aria-label="`Add rhythm attack at beat ${beat+1}`" @click="rhythmAddAt(beat)"></button>
        <button v-for="(slot,i) in rhythmPreview" :key="`attack-${slot.beat}`" type="button" class="rhythm-event" :class="{'rhythm-event-accent':slot.accent,'rhythm-event-selected':rhythmSelected===i}" :style="{left:`${100*slot.beat/project.beats}%`,width:`${100*slot.duration/project.beats}%`}" :aria-label="`Attack at beat ${slot.beat+1}, duration ${slot.duration}, ${slot.accent?'accented':'unaccented'}. Long-press or right-click for options.`" :title="`Beat ${slot.beat+1} · long press, right-click or Shift+F10 for options`" @pointerdown="rhythmPointerDown($event,i)" @pointermove="rhythmPress.move($event)" @pointerup="rhythmPress.end($event)" @pointercancel="rhythmPress.cancel()" @contextmenu.prevent.stop="openRhythmMenu(i)" @keydown="rhythmContextKey($event,i)" @click="selectRhythmAttack(i)">
          <span>{{slot.accent?'›':'•'}} {{slot.duration}}</span><span class="rhythm-context-hint" aria-hidden="true">⋯</span>
          <span class="rhythm-resize-handle" role="presentation" title="Drag to change written duration" @pointerdown="rhythmResizeDown($event,i)" @pointermove="rhythmResizeMove" @pointerup="rhythmResizeUp" @pointercancel="rhythmResizeUp" @click.stop>↔</span>
        </button>
      </div>
      <p class="hint">Tap an empty sixteenth-note grid cell to add an attack. Select a bar to edit it; drag its right edge to resize. Long-press, right-click, Shift+F10 or choose ⋯ Options for nearby settings. Gaps are rests. A preset is only the starting point.</p>
      <p class="editor-shortcut-help"><strong>Keyboard:</strong> Delete / Backspace remove selected attack · ← → select attacks · + / − change duration · A toggle accent · S split · L loop · Esc deselect. Shortcuts pause while typing in fields.</p>
      <div v-if="rhythmSelectedSlot" class="rhythm-event-properties">
        <div class="rhythm-selected-context-action"><strong>Selected attack · beat {{Number((rhythmSelectedSlot.beat+1).toFixed(2))}}</strong><button type="button" class="secondary" @click="openRhythmMenu(rhythmSelected)">⋯ Options</button></div>
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
<section v-else-if="active==='notes'" ref="noteEditorRegion" class="note-editor-section" tabindex="-1" :class="{'note-focus-mode':noteFocusMode,'note-focus-more-open':noteFocusMore}" @keydown="handleNoteEditorKey">
  <div v-if="noteFocusMode" class="note-focus-toolbar note-unified-focus-toolbar" role="toolbar" aria-label="Focused note editor controls">
    <button type="button" class="secondary note-focus-close" @click="exitNoteFocusMode" aria-label="Exit focused note editor">↙ Exit focus</button>
    <button type="button" class="secondary note-settings-icon" @click="noteSettingsOpen=!noteSettingsOpen" :aria-expanded="noteSettingsOpen" aria-controls="note-settings-popup" aria-label="Note editor settings" title="Note editor settings">⚙</button>
    <button type="button" class="secondary" :disabled="!undoHistory.length" @click="restoreHistory('undo')" title="Undo last project edit">↶ Undo</button>
    <button type="button" class="secondary" :disabled="!redoHistory.length" @click="restoreHistory('redo')" title="Redo last undone edit">↷ Redo</button>
    <strong class="note-focus-identity">{{rosterDisplayName(noteInst)}} · {{project.bars[selectedBar].section}} · {{instrumentSkillShort(noteInst)}}</strong>
    <label class="note-focus-range">Edition<select :value="instrumentDifficulty(noteInst)" :aria-label="'Active difficulty for '+rosterDisplayName(noteInst)" @change="switchDifficultyEdition(noteInst,($event.target as HTMLSelectElement).value as Difficulty)"><option v-for="level in EDITION_LEVELS" :key="level" :value="level">{{editionDescription(noteInst,level)}}</option></select></label>
    <button type="button" class="secondary" :disabled="noteLoopPlaying||noteLoopFrom<=1" @click="shiftNoteVisibleRange(-1)" aria-label="Previous measure range">←</button>
    <label class="note-focus-range">Start measure<select v-model.number="noteLoopFrom" :disabled="noteLoopPlaying" @change="changeFocusLoopFrom"><option v-for="(bar,i) in project.bars" :key="i" :value="i+1">{{i+1}} · {{bar.section}}</option></select></label>
    <label class="note-focus-range">End measure<select v-model.number="noteLoopTo" :disabled="noteLoopPlaying" @change="changeFocusLoopTo"><option v-for="(bar,i) in project.bars" :key="i" :value="i+1">{{i+1}} · {{bar.section}}</option></select></label>
    <button type="button" class="secondary" :disabled="noteLoopPlaying||noteLoopTo>=project.bars.length" @click="shiftNoteVisibleRange(1)" aria-label="Next measure range">→</button>
    <button type="button" :class="noteLoopPlaying?'play':'primary'" @click="toggleNoteLoop">{{noteLoopPlaying?'■ Stop loop':'▶ Loop'}}</button>
    <span v-if="noteLoopPlaying" class="note-focus-playing" role="status">Playing measure {{noteLoopMeasure>=0?noteLoopMeasure+1:'…'}} · beat {{noteLoopBeat>=0?noteLoopBeat+1:'…'}}</span>
  </div>
  <div v-if="!noteFocusMode" class="compact-note-toolbar note-unified-toolbar" role="toolbar" aria-label="Note editing workspace">
    <button v-if="noteInst.startsWith('Voice')" type="button" class="secondary" @click="shiftVoicePhraseFromLead(selectedBar,true)">Shift notes + lyrics…</button>
    <button type="button" class="secondary" @click="returnToMap">← Map</button>
    <label>Instrument<select v-model="noteInst" @change="openNoteEditor(noteInst,selectedBar)"><option v-for="inst in activeRoster" :key="inst" :value="inst">{{rosterDisplayName(inst)}}</option></select></label>
    <label class="note-edition-selector">Edition<select :value="instrumentDifficulty(noteInst)" :aria-label="'Active difficulty for '+rosterDisplayName(noteInst)" @change="switchDifficultyEdition(noteInst,($event.target as HTMLSelectElement).value as Difficulty)"><option v-for="level in EDITION_LEVELS" :key="level" :value="level">{{editionDescription(noteInst,level)}}</option></select></label>
    <button type="button" class="secondary" :disabled="noteLoopPlaying||noteLoopFrom<=1" @click="shiftNoteVisibleRange(-1)" aria-label="Previous measure range">←</button>
    <label>Start measure<select v-model.number="noteLoopFrom" :disabled="noteLoopPlaying" @change="changeFocusLoopFrom"><option v-for="(bar,i) in project.bars" :key="i" :value="i+1">{{i+1}} · {{bar.section}}</option></select></label>
    <label>End measure<select v-model.number="noteLoopTo" :disabled="noteLoopPlaying" @change="changeFocusLoopTo"><option v-for="(bar,i) in project.bars" :key="i" :value="i+1">{{i+1}} · {{bar.section}}</option></select></label>
    <button type="button" class="secondary" :disabled="noteLoopPlaying||noteLoopTo>=project.bars.length" @click="shiftNoteVisibleRange(1)" aria-label="Next measure range">→</button>
    <button type="button" :class="noteLoopPlaying?'play':'primary'" @click="toggleNoteLoop">{{noteLoopPlaying?'■ Stop':'▶ Loop'}}</button>
    <button type="button" class="secondary" :disabled="!undoHistory.length" @click="restoreHistory('undo')" title="Undo last project edit">↶ Undo</button>
    <button type="button" class="secondary" :disabled="!redoHistory.length" @click="restoreHistory('redo')" title="Redo last undone edit">↷ Redo</button>
    <button type="button" class="secondary note-settings-icon" @click="noteSettingsOpen=!noteSettingsOpen" :aria-expanded="noteSettingsOpen" aria-controls="note-settings-popup" aria-label="Note editor settings" title="Note editor settings">⚙</button>
    <button type="button" class="secondary note-focus-enter" @click="enterNoteFocusMode" aria-label="Expand note editor to full screen">⛶ Focus</button>
  </div>
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
        <button class="secondary" @click="beginDynamicsHairpin('crescendo')">〈 Crescendo</button>
        <button class="secondary" @click="beginDynamicsHairpin('diminuendo')">〉 Diminuendo</button>
        <button class="secondary" @click="applyDynamicsGesture('swell')">〈〉 Swell</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(76px,1fr));gap:.4rem;margin:.75rem 0">
        <div v-for="barIndex in dynamicsPreviewBars" :key="barIndex" class="dynamics-measure-tile">
        <button type="button" class="secondary dynamics-measure-main" :style="{borderColor:barIndex===selectedBar?'var(--accent, #579d93)':undefined}" :aria-label="'Dynamics in measure '+(barIndex+1)+'; long press or right click for options'" :title="'Measure '+(barIndex+1)+' · right-click, long press or Shift+F10 for options'" @pointerdown="startDynamicsContextHold($event,'measure',barIndex)" @pointermove="dynamicsPress.move($event)" @pointerup="dynamicsPress.end($event)" @pointercancel="dynamicsPress.cancel()" @contextmenu.prevent.stop="openDynamicsContext('measure',barIndex)" @keydown="dynamicsContextKey($event,'measure',barIndex)" @click="clickDynamicsMeasure(barIndex)">
          <span style="display:block;font-size:.75rem">M{{barIndex+1}}</span>
          <strong style="display:block;font-size:1.2rem;font-style:italic">{{dynamicsTargets(barIndex).length ? (dynamicsTargets(barIndex).map(inst=>dynamicsAt(inst,barIndex)).filter(Boolean).join(' / ')||'—') : 'no role'}}</strong>
          <small>{{dynamicsTargets(barIndex).length}} parts</small>
        </button>
        <button type="button" class="secondary dynamics-more" :aria-label="'More dynamics options for measure '+(barIndex+1)" @click="openDynamicsContext('measure',barIndex)">⋯</button>
        </div>
      </div>
      <Teleport to="body"><div v-if="dynamicsContext" class="context-sheet-backdrop" @click.self="closeDynamicsContext()">
        <div class="context-sheet-dialog dynamics-context-dialog" role="dialog" aria-modal="true" tabindex="-1" :aria-label="dynamicsContext.kind==='measure'?'Dynamics measure options':'Hairpin options'" @keydown.esc.stop.prevent="closeDynamicsContext()">
          <div class="context-sheet-header"><strong>{{dynamicsContext.kind==='measure'?'Dynamics · measure '+(dynamicsContext.bar+1):'Hairpin · '+dynamicsContextRange?.instrument}}</strong><button type="button" class="secondary" @click="closeDynamicsContext()">✕ Close</button></div>
          <template v-if="dynamicsContext.kind==='measure'">
            <p>Actions use the current dynamics scope (instrument, role or orchestra). Open the full editor for precise settings.</p>
            <button type="button" class="secondary" @click="dynamicsMenuAction('edit')">Edit dynamic…</button>
            <div class="context-sheet-two"><button type="button" class="secondary" @click="dynamicsMenuAction('mf')">Set mf</button><button type="button" class="secondary" @click="dynamicsMenuAction('f')">Set f</button></div>
            <button type="button" class="secondary" @click="dynamicsMenuAction('clear')">Clear dynamic in scope</button>
            <div class="context-sheet-two"><button type="button" class="secondary" @click="dynamicsMenuAction('crescendo')">Create crescendo…</button><button type="button" class="secondary" @click="dynamicsMenuAction('diminuendo')">Create diminuendo…</button></div>
          </template>
          <template v-else-if="dynamicsContextRange">
            <p>{{dynamicsContextRange.to>=dynamicsContextRange.from?'Crescendo':'Diminuendo'}} · {{dynamicsContextRange.instrument}}. Existing note and endpoint editors remain authoritative.</p>
            <button type="button" class="secondary" @click="dynamicsMenuAction('edit')">Edit both endpoints…</button>
            <button type="button" class="secondary" @click="dynamicsMenuAction('start')">Edit start endpoint…</button>
            <button type="button" class="secondary" @click="dynamicsMenuAction('end')">Edit end endpoint…</button>
            <button type="button" class="secondary danger" @click="dynamicsMenuAction('delete')">Delete hairpin…</button>
          </template>
        </div>
      </div></Teleport>
      <div v-if="visibleHairpins.length" style="position:relative;min-height:70px;margin:.65rem 0;border-top:1px solid var(--border, #888);border-bottom:1px solid var(--border, #888)">
        <div v-for="item in visibleHairpins" :key="item.index" class="dynamics-hairpin-item" :style="{position:'absolute',left:item.from+'%',width:(item.to-item.from)+'%',top:(item.index%2)*34+'px',height:'30px'}">
          <button type="button" class="secondary dynamics-hairpin-main" :title="item.range.instrument+' · right-click, long press or Shift+F10 for hairpin options'" @pointerdown="startDynamicsContextHold($event,'hairpin',item.index)" @pointermove="dynamicsPress.move($event)" @pointerup="dynamicsPress.end($event)" @pointercancel="dynamicsPress.cancel()" @contextmenu.prevent.stop="openDynamicsContext('hairpin',item.index)" @keydown="dynamicsContextKey($event,'hairpin',item.index)" @click="clickDynamicsHairpin(item.index)">{{item.range.to>=item.range.from?'〈 Crescendo':'〉 Diminuendo'}} · {{item.range.instrument}}</button>
          <button type="button" class="secondary dynamics-hairpin-more" :aria-label="'More options for '+item.range.instrument+' hairpin'" @click.stop="openDynamicsContext('hairpin',item.index)">⋯</button>
        </div>
      </div>
      <div v-if="dynamicsEditRange!==null" class="note-settings-backdrop" @click.self="dynamicsEditRange=null"><div class="note-settings-dialog" role="dialog" aria-modal="true" aria-label="Edit hairpin">
        <div class="note-settings-title"><strong>Edit hairpin · {{project.expressionRanges?.[dynamicsEditRange]?.instrument}}</strong><button type="button" class="secondary" @click="dynamicsEditRange=null">✕ Close</button></div>
        <template v-if="project.expressionRanges?.[dynamicsEditRange]">
          <label>Start note<select v-model="dynamicsEditStart"><option v-for="n in (score[project.expressionRanges[dynamicsEditRange].instrument]??[])" :key="n.start" :value="String(n.start)">M{{Math.floor(n.start/project.beats)+1}} · beat {{Number((n.start%project.beats+1).toFixed(3))}} · {{midiName(n.pitch)}}</option></select></label>
          <label>End measure<select :value="dynamicsEditEndMeasure" @change="changeEditEndMeasure(Number(($event.target as HTMLSelectElement).value))"><option v-for="m in dynamicsMeasureChoices" :key="m" :value="m">Measure {{m+1}}</option></select></label>
          <label>End at<select v-model="dynamicsEditEnd"><option :value="String((dynamicsEditEndMeasure+1)*project.beats)">End of measure {{dynamicsEditEndMeasure+1}}</option><option v-for="n in dynamicsEditEndNotes" :key="n.position" :value="String(n.position)">{{n.label}}</option></select></label>
        </template>
        <div class="expression-range-row"><button class="primary" @click="saveHairpinEditor">Save endpoints</button><button class="secondary" @click="project.expressionRanges?.splice(dynamicsEditRange,1);dynamicsEditRange=null">Delete hairpin</button></div>
      </div></div>
      <div v-if="dynamicsCreateShape!==null" class="note-settings-backdrop" @click.self="dynamicsCreateShape=null"><div class="note-settings-dialog" role="dialog" aria-modal="true" aria-label="Create hairpin">
        <div class="note-settings-title"><strong>{{dynamicsCreateShape==='crescendo'?'Create crescendo':'Create diminuendo'}}</strong><button type="button" class="secondary" @click="dynamicsCreateShape=null">✕ Close</button></div>
        <label>Instrument<select v-model="dynamicsCreateInstrument"><option v-for="inst in projectInstruments(project)" :key="inst" :value="inst">{{inst}}</option></select></label>
        <label>Start note<select v-model="dynamicsCreateStart"><option v-for="n in dynamicsCreateNotes" :key="n.position" :value="String(n.position)">{{n.label}}</option></select></label>
        <label>End measure<select :value="dynamicsCreateEndMeasure" @change="changeCreateEndMeasure(Number(($event.target as HTMLSelectElement).value))"><option v-for="m in dynamicsMeasureChoices" :key="m" :value="m">Measure {{m+1}}</option></select></label>
        <label>End at<select v-model="dynamicsCreateEnd"><option :value="String((dynamicsCreateEndMeasure+1)*project.beats)">End of measure {{dynamicsCreateEndMeasure+1}}</option><option v-for="n in dynamicsCreateEndNotes" :key="n.position" :value="String(n.position)">{{n.label}}</option></select></label>
        <div class="two"><label>Start intensity<input type="number" min="1" max="127" v-model.number="dynamicsCreateFrom"/></label><label>End intensity<input type="number" min="1" max="127" v-model.number="dynamicsCreateTo"/></label></div>
        <p class="hint">Creates one hairpin between the chosen notes without overwriting dynamic markings in other measures.</p>
        <button type="button" class="primary" @click="saveDynamicsHairpin">Create hairpin</button>
      </div></div>
      <div v-if="dynamicsPopupBar!==null" class="note-settings-backdrop" @click.self="dynamicsPopupBar=null"><div class="note-settings-dialog" role="dialog" aria-modal="true" aria-label="Edit dynamic or hairpin endpoint">
        <div class="note-settings-title"><strong>{{dynamicsPopupRange===null?'Edit dynamic':'Edit hairpin '+dynamicsPopupEndpoint}} · measure {{dynamicsPopupBar+1}}</strong><button type="button" class="secondary" @click="dynamicsPopupBar=null">✕ Close</button></div>
        <template v-if="dynamicsPopupRange===null"><label>Dynamic<select v-model="dynamicsPopupMark"><option value="">Clear / inherit</option><option v-for="mark in dynamicMarks" :key="mark" :value="mark">{{mark}}</option></select></label></template>
        <template v-else><label>Snap endpoint to a note onset<select v-model="dynamicsPopupPosition"><option :value="String(dynamicsPopupBar*project.beats)">Start of measure · beat 1</option><option v-for="p in dynamicNotePositions(dynamicsPopupBar)" :key="p.position" :value="String(p.position)">{{p.label}}</option><option :value="String((dynamicsPopupBar+1)*project.beats)">End of measure</option></select></label>
        <label>Or exact beat position (absolute beats from beginning, zero-based)<input type="number" step="0.25" min="0" :max="project.bars.length*project.beats" v-model="dynamicsPopupPosition"/></label></template>
        <div class="expression-range-row"><button type="button" class="primary" @click="saveDynamicPopup">Save</button><button type="button" class="secondary" @click="removeDynamicPopup">{{dynamicsPopupRange===null?'Clear dynamic':'Delete hairpin'}}</button></div>
      </div></div>
      <p class="hint">Tap a measure or hairpin to edit it; use ⋯, long press, right-click or Shift+F10 for contextual settings and endpoint shortcuts. Measure actions use the current scope. Exact beat positions remain editable in the existing dialogs.</p>
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
  <section id="note-panel-notes" v-show="noteEditorTab==='notes'" role="tabpanel" aria-labelledby="note-tab-notes" class="inspector-open">
  <p v-if="false" class="muted">Click a pitch/beat cell to hear and add a note; click the filled cell again to hear and remove it. Every semitone in the instrument's range is editable, including chromatic passing notes and notes outside the chord. Cell colors distinguish chord tones, other section-key tones, and chromatic tones; they never block entry. Notes are concert pitch; global transposition is applied during playback and export. Edits are immediately protected from regeneration. For piano, the treble and bass grids edit the same measure and sound together in the loop. Violin chord accompaniment defaults to one note per beat, with editable staccato/marcato and sounding length.</p>
  <div class="editor note-editor-panel">
    <div v-if="noteSettingsOpen" id="note-settings-popup" class="note-settings-backdrop" @click.self="noteSettingsOpen=false"><div class="note-settings-dialog" role="dialog" aria-label="Note editor settings"><div class="note-settings-title"><strong>Note editor settings</strong><button type="button" class="secondary" @click="noteSettingsOpen=false">✕ Close</button></div><div class="note-tools-bar" aria-label="Note editor controls">
  <div class="note-tools-group note-tools-entry-group" aria-label="Note entry"><div class="note-editor-controls">
      <label>Rhythm preset for snapping<select :value="noteRhythmPreset" @change="selectRhythmPreset(($event.target as HTMLSelectElement).value)"><option value="off">Off · free timing</option><option v-for="preset in rhythmPresets" :key="preset.id" :value="preset.id">{{preset.label}}</option></select></label>
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
    <div v-if="pianoPlayabilityWarnings.length" class="note-playability-warnings" role="status">
      <strong>Possible piano hand-reach issues ({{pianoPlayabilityWarnings.length}})</strong>
      <span v-for="(issue,index) in pianoPlayabilityWarnings.slice(0,4)" :key="index">Measure {{issue.measure+1}}, beat {{Number((issue.beat+1).toFixed(2))}}: {{issue.message}}</span>
      <small v-if="pianoPlayabilityWarnings.length>4">More warnings are available within the selected measure range.</small>
      <small>Staff split approximates hands; imported and manually edited notes are never moved automatically.</small>
    </div>
    <div class="note-rhythm-snap-bar" role="group" aria-label="Rhythm snap guides">
      <label>Snap note onsets to<select :value="noteRhythmPreset" aria-label="Snap to rhythm preset" @change="selectRhythmPreset(($event.target as HTMLSelectElement).value)">
        <option value="off">Off · free timing</option>
        <option v-for="preset in rhythmPresets" :key="preset.id" :value="preset.id">{{preset.label}}</option>
      </select></label>
      <small v-if="noteRhythmPreset!=='off'">Gold tick marks show preset attacks. New notes within ½ beat snap to them; other onsets remain free. The note label records a real snap, not a guessed pattern.</small>
      <small v-else>Free timing · choose a preset to show attack guides and snap nearby notes.</small>
    </div>
    <div :class="{'note-staff-grid':noteInst==='Piano'}">
    <div v-for="staff in noteStaffViews" :key="staff.id" class="note-staff-panel"><div v-if="noteInst==='Piano'" class="note-staff-heading"><strong>{{staff.label}}</strong><span>{{staff.clef}}</span></div>
<div class="note-grid-scroll" @pointermove="moveNoteDrag($event)" @pointerup="endNoteDrag($event)" @pointercancel="endNoteDrag($event)">
  <div class="note-continuous-grid" :style="{minWidth:(64+focusVisibleMeasures.length*noteBeats.length*28)+'px','--grid-steps':noteBeats.length*focusVisibleMeasures.length,'--visible-measures':focusVisibleMeasures.length}">
    <div class="note-continuous-row note-continuous-measures">
      <div class="note-continuous-pitch-title">Pitch</div>
      <div class="note-continuous-measure-heads">
        <button v-for="barIndex in focusVisibleMeasures" :key="barIndex" type="button" class="note-multibar-title" :class="{'note-multibar-active':selectedBar===barIndex}" @click="activateGridMeasure(barIndex)">Measure {{barIndex+1}} · {{project.bars[barIndex].chord||'—'}}</button>
      </div>
    </div>
    <div class="note-continuous-row note-continuous-beats">
      <div class="note-continuous-pitch-title">Pitch ↔</div>
      <div class="note-continuous-beat-heads note-beat-swipe-header" title="Swipe to navigate measures" @pointerdown="beginMeasureHeaderDrag" @pointerup="finishMeasureHeaderDrag" @pointercancel="cancelMeasureHeaderDrag">
        <template v-for="barIndex in focusVisibleMeasures" :key="barIndex">
          <div v-for="beat in noteBeats" :key="barIndex+'-'+beat" class="note-continuous-beat" :class="{'note-downbeat':beat===0,'note-loop-playhead':noteLoopPlaying&&noteLoopBeat===Math.floor(beat)&&noteLoopMeasure===barIndex,'note-rhythm-guide':isRhythmGuideBeat(beat)}"><span>{{noteGridBeatLabel(beat)}}</span><small>{{chordAt(project.bars[barIndex].chord,project.beats,beat)||'—'}}</small></div>
        </template>
      </div>
    </div>
    <div v-for="pitch in staff.pitches" :key="pitch" class="note-continuous-row note-continuous-pitch-row">
      <button type="button" class="note-pitch-audition note-continuous-pitch-label" :title="'Hear '+displayPitch(pitch)" @click="auditionPitch(pitch)">{{displayPitch(pitch)}} ♪</button>
      <div class="note-lane-grid" :style="{'--grid-steps':noteBeats.length*focusVisibleMeasures.length}">
        <template v-for="barIndex in focusVisibleMeasures" :key="barIndex">
          <button v-for="beat in noteBeats" :key="barIndex+'-'+beat" type="button" :class="['note-grid-cell','note-tone-'+pitchClass(pitch,beat,barIndex),{'note-downbeat':beat===0,'note-loop-playhead':noteLoopPlaying&&noteLoopBeat===Math.floor(beat)&&noteLoopMeasure===barIndex,'note-rhythm-guide':isRhythmGuideBeat(beat)}]" :title="'Add '+displayPitch(pitch)+' in measure '+(barIndex+1)+', beat '+(beat+1)" @click="activateGridMeasure(barIndex);noteCellClick(pitch,beat)"></button>
        </template>
        <button v-for="(n,i) in continuousVisibleNotes(pitch)" :key="n.start+':'+n.pitch+':'+i" type="button" :class="['note-bar',{'selected':selectedEvent===n,'note-bar-accented':n.accent||n.articulation==='marcato_staccato','note-bar-staccato':n.articulation==='staccato'&&!n.accent,'note-bar-gestured':!!n.gesture,'note-bar-rhythm':Boolean(rhythmCue(n))}]" :style="{left:(Math.max(n.start,focusVisibleMeasures[0]*project.beats)-focusVisibleMeasures[0]*project.beats)/(project.beats*focusVisibleMeasures.length)*100+'%',width:(Math.min(n.start+n.duration,(focusVisibleMeasures[focusVisibleMeasures.length-1]+1)*project.beats)-Math.max(n.start,focusVisibleMeasures[0]*project.beats))/(project.beats*focusVisibleMeasures.length)*100+'%'}" :title="displayPitch(n.pitch)+' · '+n.duration+' beats · '+(gestureText(n)||'no gesture')+(rhythmCue(n)?' · rhythm: '+rhythmCue(n):'')+'. Drag either edge to resize across measures.'" @pointerdown="activateGridMeasure(Math.floor(n.start/project.beats));beginNoteDrag($event,pitch,n.start%project.beats)" @contextmenu.prevent.stop="activateGridMeasure(Math.floor(n.start/project.beats));openNoteBarContext(pitch,n.start%project.beats,$event)" @keydown="handleNoteBarContextKey($event,pitch,n.start%project.beats)" @click.stop="activateGridMeasure(Math.floor(n.start/project.beats));noteBarClick(pitch,n.start%project.beats)"><span class="note-resize-handle note-resize-handle-left" aria-hidden="true">◂</span><span v-if="noteAttackMark(n)" class="note-attack-mark" aria-hidden="true">{{noteAttackMark(n)}}</span><svg v-if="n.gesture||n.slideTo!==undefined" class="note-gesture-mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline :points="gestureMini(n)" /><polyline v-if="n.gesture?.partner" class="secondary" :points="gestureMini(n,'partner')" /></svg><span v-if="n.gesture" class="note-gesture-label">{{gestureLabel(n.gesture)}}</span><span v-else class="note-bar-label">{{n.duration}} beats</span><span v-if="rhythmCue(n)" class="note-rhythm-cue" :title="'Snapped to '+rhythmCue(n)" aria-hidden="true">◆</span><span class="note-resize-handle note-resize-handle-right" aria-hidden="true">▸</span></button>
      </div>
    </div>
  </div>
</div>
</div>
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
    <h3>Notes in this measure</h3><div class="note-event-list"><button v-for="(n,i) in noteMeasure" :key="`${n.start}:${n.pitch}:${i}`" :class="['note-event-button',{selected:noteSelected===i}]" @click="selectNoteEvent(i)">{{displayPitch(n.pitch)}} · beat {{Number((n.start-selectedBar*project.beats+1).toFixed(2))}} · {{n.duration}} beats · {{n.articulation==='staccato'?'· Stacc.':n.articulation==='marcato_staccato'?'^ Marc.':n.articulation==='legato'?'Legato':'Plain'}}{{n.gesture?' · '+gestureLabel(n.gesture):n.slideTo!==undefined?' · slide → '+displayPitch(n.slideTo):''}}{{n.swellTo!==undefined?' · swell → '+n.swellTo:''}}{{rhythmCue(n)?' · ◆ '+rhythmCue(n):''}}</button><span v-if="!noteMeasure.length" class="muted">No notes. Tap a cell to add one.</span></div>
    <div v-if="noteDetailsPopup" class="note-properties-backdrop" @click.self="noteDetailsPopup=false"></div><div v-if="selectedEvent" :class="['note-properties',{'note-properties-popup':noteDetailsPopup}]" role="region" aria-label="Selected note properties"><div v-if="noteDetailsPopup" class="note-properties-popup-header"><strong>Note properties · {{displayPitch(selectedEvent.pitch)}}</strong><button type="button" class="secondary" @click="noteDetailsPopup=false">✕ Close</button></div><div v-if="!noteFocusMode&&!noteDetailsPopup" class="inspector-heading"><strong>Note inspector</strong></div><details class="control-fold selected-note-fold" open><summary>Edit selected note · {{displayPitch(selectedEvent.pitch)}}</summary><div class="note-editor-controls">
      <div class="note-rhythm-inspector" role="group" aria-label="Selected note rhythm source">
        <span v-if="rhythmCue(selectedEvent)">◆ {{rhythmCue(selectedEvent)}} · preset beat {{Number((selectedEvent.rhythmSource!.targetBeat+1).toFixed(2))}}</span>
        <span v-else>Free timing · no recorded rhythm source</span>
        <button type="button" class="secondary" :disabled="noteRhythmPreset==='off'" @click="snapSelectedNoteNow">Snap note / chord to preset</button>
        <button v-if="selectedEvent.rhythmSource" type="button" class="secondary" @click="releaseSelectedRhythmSource">Release rhythm label</button>
      </div>
      <label>Pitch (MIDI, all semitones)<input type="number" :min="noteCtx.range[0]" :max="noteCtx.range[1]" :value="selectedEvent.pitch" @change="updateSelectedNote('pitch',($event.target as HTMLInputElement).value)"/></label>
      <label>Beat (starts at 1)<input type="number" min="1" :max="project.beats" step="0.25" :value="selectedEvent.start-selectedBar*project.beats+1" @change="updateSelectedNote('start',String(Number(($event.target as HTMLInputElement).value)-1))"/></label><div class="note-position-nudge"><span>Move onset (keep duration)</span><div class="note-nudge-buttons"><button type="button" class="secondary" aria-label="Move selected note half a beat earlier" :disabled="selectedEvent.start-selectedBar*project.beats<=0" @click="nudgeSelectedNote(-0.5)">← ½ beat</button><button type="button" class="secondary" aria-label="Move selected note half a beat later" :disabled="selectedEvent.start-selectedBar*project.beats+selectedEvent.duration>=project.beats-0.0001" @click="nudgeSelectedNote(0.5)">½ beat →</button></div></div>
      <div class="note-duration-field"><label for="note-written-duration">Written duration · {{selectedEvent.duration}} beats</label><div class="note-duration-controls"><button type="button" class="secondary" @click="changeNoteDuration(-0.25)" :disabled="selectedEvent.duration<=0.25" aria-label="Shorten note by quarter beat">−</button><input id="note-written-duration" type="number" min="0.25" :max="selectedDurationMax" step="0.25" v-model="writtenDurationDraft" @keydown.enter.prevent="applyWrittenDurationDraft" @change="applyWrittenDurationDraft"/><button type="button" class="primary" @click="applyWrittenDurationDraft">Apply</button><button type="button" class="secondary" @click="changeNoteDuration(0.25)" :disabled="selectedEvent.duration>=selectedDurationMax-0.0001" aria-label="Lengthen note by quarter beat">+</button></div><input class="note-duration-slider" type="range" min="0.25" :max="selectedDurationMax" step="0.25" :value="selectedEvent.duration" :disabled="selectedDurationMax<=0.25" aria-label="Written note duration in beats" @input="updateSelectedNote('duration',($event.target as HTMLInputElement).value)"/><div class="duration-preview" role="status" :aria-label="`Written duration ${selectedEvent.duration} beats`"><span :style="{width:`${noteDurationPercent}%`}"></span></div><small class="hint">Saved duration: <strong>{{selectedEvent.duration}} beats</strong> · starts at beat {{Number((selectedEvent.start-selectedBar*project.beats+1).toFixed(2))}} · maximum {{selectedDurationMax}} beats until the song ends. Written length is separate from sounding length.</small></div>
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

      <div v-if="slideSupported" class="tango-gesture-editor" aria-label="Tango gestures">
        <label>Expressive gesture<select :value="gesturePresetForNote(selectedEvent)" @change="setSelectedGesturePreset(($event.target as HTMLSelectElement).value)">
          <option value="">No special gesture</option>
          <option v-for="preset in GESTURE_PRESETS.filter(g=>noteInst.startsWith('Violin')||!g.value.startsWith('sirena'))" :key="preset.value" :value="preset.value">{{preset.label}}</option>
        </select></label>
        <template v-if="selectedEvent.gesture">
          <label v-for="(point,index) in selectedEvent.gesture.points.slice(1)" :key="'primary-'+index">
            {{index===0&&selectedEvent.gesture.points.length===3?'Turning pitch':'End pitch'}} · voice 1
            <select :value="point.pitch" @change="updateSelectedGesturePitch('points',index+1,($event.target as HTMLSelectElement).value)">
              <option v-for="pitch in Array.from({length:noteCtx.range[1]-noteCtx.range[0]+1},(_,i)=>i+noteCtx.range[0])" :key="pitch" :value="pitch">{{displayPitch(pitch)}}</option>
            </select>
          </label>
          <label v-for="(point,index) in (selectedEvent.gesture.partner??[])" :key="'partner-'+index">
            {{index===0?'Second voice start':index===1&&selectedEvent.gesture.partner?.length===3?'Second voice turn':'Second voice end'}}
            <select :value="point.pitch" @change="updateSelectedGesturePitch('partner',index,($event.target as HTMLSelectElement).value)">
              <option v-for="pitch in Array.from({length:noteCtx.range[1]-noteCtx.range[0]+1},(_,i)=>i+noteCtx.range[0])" :key="pitch" :value="pitch">{{displayPitch(pitch)}}</option>
            </select>
          </label>
          <small>Contours follow the written note length. Double sirenas require conservatively reachable adjacent violin strings. The stored gesture is preserved in .tango files.</small>
        </template>
      </div>
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
      <label class="note-focus-articulation">Gesture<select :value="gesturePresetForNote(selectedEvent)" @change="setSelectedGesturePreset(($event.target as HTMLSelectElement).value)"><option value="">None</option><option v-for="preset in GESTURE_PRESETS.filter(g=>noteInst.startsWith('Violin')||!g.value.startsWith('sirena'))" :key="preset.value" :value="preset.value">{{preset.label}}</option></select></label>
      <button type="button" class="secondary" @click="noteFocusMore=!noteFocusMore;noteDetailsPopup=false">{{noteFocusMore?'Close details':'All note properties'}}</button>
      <button type="button" class="secondary" @click="deleteSelectedNote">Delete</button>
    </template>
    <span v-else class="hint">Select a note in the grid to edit its timing, articulation and duration here.</span>
  </div>
</section>
</main></div><footer v-if="!performanceMode">Local-first prototype · IndexedDB autosave and multiple local songs · Export .tango.json backups · MusicXML for MuseScore</footer></div>
</template>

<style>
/* About and release notes: responsive editorial layout, aligned with the DAW shell. */
.about-page{width:100%;max-width:1180px;margin:0 auto;padding:clamp(8px,1.5vw,20px) 0 32px;min-width:0}
.about-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:clamp(22px,3.5vw,42px);border:1px solid #3b4d5b;border-radius:16px;background:radial-gradient(ellipse at 90% 0%,rgba(202,166,111,.13),transparent 58%),linear-gradient(125deg,#263645,#192630);box-shadow:0 10px 28px rgba(0,0,0,.13)}
.about-hero h1{margin:4px 0 8px;font-size:clamp(28px,4.5vw,48px);line-height:1.1;letter-spacing:-.035em;color:#f2f3f5}
.about-eyebrow{margin:0;color:#d4ad77;font-size:11px;font-weight:750;letter-spacing:.15em}
.about-version{margin:0;color:#b5c4ce;font-size:13px}
.about-hero-mark{font-size:clamp(62px,10vw,116px);line-height:1;color:#d0a970;opacity:.75;flex:0 0 auto}
.about-page .about-intro{max-width:760px;margin:20px 0 24px;font-size:clamp(15px,1.5vw,18px);line-height:1.65;color:#c6d1da}
.about-page .about-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.about-page .about-grid .editor{display:flex;flex-direction:column;align-items:flex-start;gap:10px;min-width:0;margin:0;padding:clamp(16px,2vw,23px);border:1px solid #354654;border-radius:12px;background:linear-gradient(155deg,#23313e,#1b2833);box-shadow:inset 0 1px rgba(255,255,255,.035);transition:border-color .16s ease,transform .16s ease,box-shadow .16s ease}
.about-page .about-grid .editor:hover{border-color:#5b6b77;box-shadow:0 6px 20px rgba(0,0,0,.12);transform:translateY(-2px)}
.about-page .about-grid .editor h2{font-size:17px;line-height:1.3;margin:0;color:#e8edf1}
.about-page .about-grid .editor p{flex:1;margin:0;color:#b6c5cf;line-height:1.55;font-size:13px}
.about-page .about-grid .editor button{margin-top:6px;min-height:36px;padding:7px 12px;border-radius:8px;font-size:12px}
.about-page .about-releases{margin:20px 0 0;padding:clamp(17px,2.5vw,28px);border:1px solid #354654;border-radius:13px;background:#1b2833}
.about-page .about-releases>h2{margin:0 0 5px;font-size:21px}
.about-page .about-releases>.muted{margin:0 0 14px}
.about-page .release-entry{padding:15px 0;border-top:1px solid #344452}
.about-page .release-entry h3{font-size:14px;line-height:1.45;color:#e4c18d;margin:0 0 5px}
.about-page .release-entry p{font-size:13px;line-height:1.65;margin:0;color:#bac7d0}
@media(max-width:700px){
 .about-page{padding:4px 0 24px}
 .about-hero{padding:20px;gap:12px;border-radius:12px}
 .about-hero-mark{font-size:60px}
 .about-page .about-grid{grid-template-columns:1fr;gap:10px}
 .about-page .about-grid .editor{padding:17px}
 .about-page .about-intro{margin:16px 0 20px}
}
@media(max-width:380px){.about-hero-mark{display:none}}
@media(prefers-reduced-motion:reduce){.about-page .about-grid .editor{transition:none}.about-page .about-grid .editor:hover{transform:none}}

/* About page follows the full-width workbench, with releases alongside features. */
.about-page{max-width:none;width:100%;box-sizing:border-box;margin:0;padding:clamp(8px,1.4vw,22px) 0 32px}
.about-page .about-hero{width:100%;box-sizing:border-box}
.about-page .about-intro{max-width:1000px}
.about-content-columns{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(360px,.95fr);gap:clamp(14px,1.8vw,28px);align-items:start;min-width:0}
.about-content-columns>.about-grid{min-width:0;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start}
.about-content-columns>.about-releases{min-width:0;margin:0}
.about-page>.hint{margin-top:20px;line-height:1.55}
@media(max-width:1250px){
 .about-content-columns{grid-template-columns:minmax(0,1fr) minmax(320px,.9fr)}
 .about-content-columns>.about-grid{grid-template-columns:1fr}
}
@media(max-width:850px){
 .about-content-columns{grid-template-columns:minmax(0,1fr)}
 .about-content-columns>.about-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:600px){
 .about-content-columns>.about-grid{grid-template-columns:1fr}
 .about-page .about-hero{padding:20px}
}

/* Consecutive piano-roll measures share a horizontal row; two fit on tablet screens. */
.note-multibar-grid{display:grid;grid-template-columns:repeat(var(--visible-measures,1),minmax(360px,1fr));gap:8px;align-items:start;width:100%;min-width:max-content}
.note-multibar-measure{min-width:0}
.note-multibar-measure .note-grid{min-width:0;width:100%;table-layout:fixed}
.note-multibar-measure .note-grid .note-pitch-label{width:58px;min-width:58px}
.note-multibar-measure .note-grid thead th:not(.note-pitch-label){width:auto;min-width:0;padding-left:0;padding-right:0;font-size:10px}
.note-multibar-measure .note-grid .note-beat-swipe-header small{font-size:9px}
@media(max-width:740px){.note-multibar-grid{grid-template-columns:repeat(var(--visible-measures,1),minmax(320px,1fr))}}

/* One continuous time axis: note bars extend naturally across measure boundaries. */
.note-continuous-grid{width:100%;min-width:max-content}
.note-continuous-table{min-width:calc(58px + var(--grid-steps)*22px);width:100%;table-layout:fixed}
.note-continuous-table .note-pitch-label{width:58px;min-width:58px}
.note-continuous-table thead th:not(.note-pitch-label){min-width:0;width:auto;padding:2px 0;font-size:10px}
.note-continuous-table .note-multibar-title{width:100%;min-height:30px}

/* Explicit CSS-grid rows avoid Safari's unstable colspan table sizing. */
.note-continuous-grid{width:100%;box-sizing:border-box;min-width:0}
.note-continuous-row{display:grid;grid-template-columns:64px minmax(0,1fr);width:100%;box-sizing:border-box}
.note-continuous-measures{min-height:40px}
.note-continuous-beats{min-height:45px}
.note-continuous-pitch-title,.note-continuous-pitch-label{background:#253440!important;color:#e2c38d;border:0;border-right:1px solid #455361;border-bottom:1px solid #3b4a59;box-sizing:border-box;padding:5px 3px;text-align:center;white-space:nowrap;overflow:hidden}
.note-continuous-pitch-title{font-size:11px;color:#d8e1e9;display:flex;align-items:center;justify-content:center}
.note-continuous-grid .note-pitch-audition{width:100%;min-height:0;height:28px;display:flex;justify-content:center;align-items:center;font-size:11px}
.note-continuous-measure-heads{display:grid;grid-template-columns:repeat(var(--visible-measures),minmax(0,1fr));min-width:0}
.note-continuous-measure-heads .note-multibar-title{width:100%;min-width:0;min-height:40px;padding:4px;white-space:nowrap;overflow:hidden;border-radius:0;border:1px solid #455361;background:#293947;color:#dbe5ed;font-size:12px}
.note-continuous-measure-heads .note-multibar-active{background:#445365;color:#ffe1ad}
.note-continuous-beat-heads{display:grid;grid-template-columns:repeat(var(--grid-steps),minmax(0,1fr));width:100%;min-width:0}
.note-continuous-beat{min-width:0;background:#263642;border-right:1px solid #3b4a59;border-bottom:1px solid #3b4a59;padding:5px 0;text-align:center;color:#d8e1e9;font-size:10px;overflow:hidden}
.note-continuous-beat small{display:block;white-space:nowrap;overflow:hidden;font-size:9px;color:#c9ae85}
.note-continuous-beat.note-downbeat,.note-continuous-pitch-row .note-grid-cell.note-downbeat{border-left:2px solid #73899a}
.note-continuous-pitch-row{min-height:28px}
.note-continuous-pitch-row .note-lane-grid{width:100%;min-width:0}
.note-continuous-grid .note-bar{min-height:0;height:24px}

/* Unified Note Editor controls: one panel in normal mode, one in focus. */
.note-unified-toolbar{align-items:end;gap:8px 10px}
.note-unified-toolbar label{flex:1 1 110px;min-width:105px;max-width:220px}
.note-unified-toolbar .note-focus-enter{margin-left:auto;border:1px solid #d0a66b;font-weight:700}
.note-unified-focus-toolbar{align-items:center}
.note-unified-focus-toolbar .note-focus-identity{white-space:nowrap}
.note-unified-focus-toolbar .note-focus-range{display:flex;align-items:center;gap:6px}
.note-unified-focus-toolbar .note-focus-range select{min-width:85px;max-width:150px;margin:0;padding:7px 5px}
@media(max-width:700px){
  .note-unified-toolbar{gap:6px}
  .note-unified-toolbar label{flex:1 1 120px;max-width:none}
  .note-unified-toolbar .note-focus-enter{margin-left:0}
  .note-unified-focus-toolbar .note-focus-range{flex:1 1 145px;flex-wrap:wrap;white-space:normal}
  .note-unified-focus-toolbar .note-focus-range select{width:100%;max-width:none}
}

/* Use the actual workspace width in normal mode, rather than offsetting a
   100%-wide section beyond the main content box with a negative margin.
   This also handles iPad breakpoints where the main padding differs. */
.layout>main.note-workspace-main{padding-inline:4px}
.note-editor-section:not(.note-focus-mode){
  width:100%;
  max-width:none;
  margin-inline:0;
  padding-inline:0;
}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar{
  display:flex;
  align-items:center;
  flex-wrap:nowrap;
  gap:5px;
  padding:3px 4px;
  margin:0 0 4px;
  border-radius:6px;
  max-width:100%;
  min-width:0;
  box-sizing:border-box;
  overflow-x:auto;
  overflow-y:hidden;
  -webkit-overflow-scrolling:touch;
}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar button{
  flex:0 0 auto;
  padding:5px 7px;
  min-height:36px;
  font-size:12px;
}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar label{
  flex:0 0 135px;
  min-width:0;
  max-width:none;
  font-size:10px;
  white-space:nowrap;
}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar label:first-of-type{flex-basis:172px}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar select{
  width:100%;
  min-width:0;
  max-width:100%;
  margin-top:1px;
  padding:4px 5px;
  height:35px;
  box-sizing:border-box;
}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar .note-focus-enter{
  margin-left:auto;
  white-space:nowrap;
}
.note-editor-section:not(.note-focus-mode) .note-subtabs{margin:3px 0 4px;padding:0;gap:4px}
.note-editor-section:not(.note-focus-mode) .note-subtabs button{padding:7px 10px}
.note-editor-section:not(.note-focus-mode) .note-editor-panel{
  padding:0;
  margin:0;
  border-radius:4px;
}
.note-editor-section:not(.note-focus-mode) #note-panel-notes.inspector-open .note-editor-panel{padding-right:0}
.note-editor-section:not(.note-focus-mode) .note-staff-panel{margin:2px 0 4px}
.note-editor-section:not(.note-focus-mode) .note-context-panel{margin:2px 0 3px;padding:2px 3px}

.note-editor-section.note-focus-mode{
  padding:0 3px calc(96px + env(safe-area-inset-bottom));
}
.note-editor-section.note-focus-mode .note-unified-focus-toolbar{
  margin:0 -3px 3px;
  padding:3px 5px;
  display:flex;
  flex-wrap:nowrap;
  gap:5px;
  overflow-x:auto;
  overflow-y:hidden;
  -webkit-overflow-scrolling:touch;
}
.note-editor-section.note-focus-mode .note-unified-focus-toolbar button{
  min-height:36px;
  padding:5px 7px;
  flex:0 0 auto;
}
.note-editor-section.note-focus-mode .note-unified-focus-toolbar .note-focus-identity{
  margin-right:auto;
  flex:0 0 auto;
}
.note-editor-section.note-focus-mode .note-unified-focus-toolbar .note-focus-range{
  flex:0 0 auto;
  white-space:nowrap;
}
.note-editor-section.note-focus-mode .note-unified-focus-toolbar .note-focus-range select{
  min-width:82px;
  max-width:120px;
  padding:4px;
  height:35px;
}
.note-editor-section.note-focus-mode .note-editor-panel{margin:0;padding:0;border-radius:3px}
.note-editor-section.note-focus-mode .note-staff-panel{margin:2px 0 4px}
.note-editor-section.note-focus-mode .note-context-panel{margin:2px 0 3px;padding:2px 3px}
.note-editor-section .note-context-panel .note-context{margin:0;gap:3px 4px}
.note-editor-section .note-context-panel .note-context span{padding:3px 5px}
@media(max-width:700px){
  .note-editor-section:not(.note-focus-mode){padding-inline:2px}
  .note-editor-section:not(.note-focus-mode) .note-unified-toolbar{flex-wrap:nowrap;gap:4px;padding:2px}
  .note-editor-section:not(.note-focus-mode) .note-unified-toolbar label{flex:0 0 125px}
  .note-editor-section:not(.note-focus-mode) .note-unified-toolbar label:first-of-type{flex-basis:148px}
  .note-editor-section.note-focus-mode{padding-inline:2px}
  .note-editor-section.note-focus-mode .note-unified-focus-toolbar{margin-inline:-2px;padding:2px 3px;gap:4px}
  .note-editor-section.note-focus-mode .note-unified-focus-toolbar .note-focus-identity{flex-basis:auto}
  .note-editor-section.note-focus-mode .note-unified-focus-toolbar .note-focus-range{flex:0 0 auto;flex-wrap:nowrap}
  .note-editor-section.note-focus-mode .note-unified-focus-toolbar .note-focus-range select{width:auto;max-width:120px}
}

.note-playability-warnings{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#372b21;border:1px solid #a9844b;border-radius:6px;padding:5px 8px;margin:3px 0 5px;font-size:11px}
.note-playability-warnings strong{color:#f6d39c}
.note-playability-warnings span{padding:2px 5px;border-radius:3px;background:#4a3626}
.note-playability-warnings small{color:#d0b79a}

/* Milestone 1: explicit articulations, expressive pitch trajectories and skills. */
.instrument-skill-tag{display:inline-flex;align-items:center;justify-content:center;border:1px solid #8b9ca9;border-radius:4px;padding:1px 5px;font-size:10px;font-weight:750;color:#e8d5a7;white-space:nowrap;background:#30404d;line-height:1.2}
.note-bar-accented{border-top:3px solid #f6d08c}
.note-bar-staccato{border-top:2px dotted #e7edf5}
.note-attack-mark{position:absolute;top:-15px;left:13px;font-size:19px;line-height:18px;color:#ffe1aa;text-shadow:0 0 2px #142432;pointer-events:none;font-weight:900}
.note-gesture-mini{position:absolute;inset:1px 11px auto 11px;height:21px;width:calc(100% - 22px);overflow:visible;pointer-events:none}
.note-gesture-mini polyline{fill:none;stroke:#1c4055;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.note-gesture-mini polyline.secondary{stroke:#8b361d;stroke-dasharray:3 2}
.note-gesture-label{display:block;position:relative;z-index:1;font-size:9px;line-height:20px;letter-spacing:.02em;text-shadow:0 0 3px #efd8ad;pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tango-gesture-editor{display:flex;flex-wrap:wrap;align-items:end;gap:6px;border:1px solid #6d8292;border-radius:6px;padding:5px;margin:3px 0}
.tango-gesture-editor label{min-width:125px;flex:1 1 150px}
.tango-gesture-editor small{flex:1 1 100%;color:#b2c5d0}
.performance-roll-note.performance-note-accent{background:#e3a34f;border-color:#ffdf9d}
.performance-roll-note.performance-note-staccato{border-top:3px dotted #f1f5f9}
.performance-roll-note.performance-note-expressive{border-color:#b5e4ed}
.performance-attack-mark{position:absolute;top:-15px;left:0;color:#f6d08c;font-size:18px;font-weight:900;text-shadow:0 1px 3px #111;pointer-events:none}
.performance-gesture-layer{position:absolute;inset:0;width:100%;height:100%;overflow:hidden;pointer-events:none;z-index:2}
.performance-gesture-path{fill:none;stroke:#86e6f2;stroke-width:3;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;opacity:.9}
.performance-gesture-path.secondary{stroke:#efba75;stroke-dasharray:4 3}
.performance-gesture-path.latigo{stroke:#f6b55f;stroke-width:4}


/* Independent editable part editions, not a global simplified-score switch. */
.orchestration-editions-bar{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:4px 0 8px;padding:7px;border:1px solid #556472;border-radius:7px;background:#24323d}
.orchestration-editions-bar>.hint{margin:0;flex:1 1 390px;font-size:11px}
.orchestration-edition-selectors{width:100%;display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:5px}
.instrument-edition-label{display:flex;flex-direction:column;gap:1px;font-size:11px;min-width:0}
.instrument-edition-label select{width:100%;max-width:100%;padding:5px 6px;margin:0}
.note-editor-section:not(.note-focus-mode) .note-unified-toolbar label.note-edition-selector{flex-basis:150px}
@media(max-width:700px){.orchestration-edition-selectors{grid-template-columns:repeat(auto-fit,minmax(145px,1fr))}.orchestration-editions-bar{padding:4px}}

/* Milestone 4: deliberate preset-onset cues and contextual instrument menus. */
.note-rhythm-snap-bar{display:flex;align-items:center;gap:7px 13px;flex-wrap:wrap;padding:4px 6px;border-top:1px solid #536574;border-bottom:1px solid #536574;margin:3px 0 6px;background:#263540}
.note-rhythm-snap-bar label{display:flex;align-items:center;gap:7px;margin:0;font-size:11px;white-space:nowrap}
.note-rhythm-snap-bar select{max-width:190px;min-width:145px;margin:0;padding:4px 5px;font-size:11px;min-height:32px}
.note-rhythm-snap-bar small{font-size:11px;color:#c5d1dc;line-height:1.35;flex:1 1 200px}
.note-continuous-beat.note-rhythm-guide{box-shadow:inset 3px 0 0 #e9be73}
.note-continuous-beat.note-rhythm-guide::after{content:'◆';position:absolute;right:3px;top:0;font-size:8px;color:#f6c879}
.note-continuous-pitch-row .note-grid-cell.note-rhythm-guide{box-shadow:inset 2px 0 0 rgba(236,191,115,.52)}
.note-bar-rhythm{outline:1px solid #f0d48f;outline-offset:-3px}
.note-rhythm-cue{position:absolute;right:11px;top:-2px;font-size:12px;line-height:1;color:#704016;text-shadow:0 0 1px #fff0b8;pointer-events:none}
.note-rhythm-inspector{display:flex;flex-wrap:wrap;align-items:center;gap:7px;padding:6px;border:1px solid #4b6174;border-radius:5px;background:#293a46}
.note-rhythm-inspector>span{font-size:12px;flex:1 1 175px;color:#eed6a7}
.note-rhythm-inspector button{min-height:34px}
.performance-roll-note.performance-note-rhythm{box-shadow:inset 0 -2px 0 #f1c879}
.performance-rhythm-mark{position:absolute;right:-2px;top:-13px;color:#f1c879;font-size:11px;line-height:11px;pointer-events:none}
.instrument-context-trigger{display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;min-width:28px;min-height:30px;border:1px solid #607382;border-radius:5px;background:#293c4b;color:#f3deb3;padding:3px 6px;margin-left:3px;cursor:pointer}
.instrument-context-trigger:hover,.instrument-context-trigger:focus-visible{background:#405b6f}
.instrument-context-backdrop{position:fixed;inset:0;z-index:25000;background:rgba(6,12,18,.68);display:flex;align-items:center;justify-content:center;padding:12px}
.instrument-context-dialog{width:min(410px,100%);max-height:calc(100dvh - 24px);overflow:auto;background:#263642;color:#e6eef4;border:1px solid #8797a7;box-shadow:0 12px 35px #0008;border-radius:9px;padding:12px;display:grid;gap:8px}
.instrument-context-header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.instrument-context-header strong{font-size:16px}.instrument-context-dialog p,.instrument-context-dialog small{font-size:12px;color:#c2d1db;margin:0;line-height:1.4}
.instrument-context-actions{display:grid;grid-template-columns:1fr;gap:6px}
.instrument-context-actions button{text-align:left;min-height:38px}
.instrument-context-dialog label{display:grid;gap:3px;font-size:12px;margin:0}
.instrument-context-dialog select{min-height:40px;margin:0}
@media (max-width:580px){.note-rhythm-snap-bar{padding:3px;gap:3px}.note-rhythm-snap-bar select{max-width:168px}.instrument-context-dialog{max-width:100%}}


/* Contextual sheets reuse the same editors rather than storing a parallel edit state. */
.context-sheet-backdrop{position:fixed;inset:0;z-index:28000;background:rgba(6,12,18,.7);display:flex;align-items:center;justify-content:center;padding:12px}
.context-sheet-dialog{display:grid;gap:7px;background:#253642;color:#edf3f6;border:1px solid #8599a8;border-radius:9px;box-shadow:0 14px 35px #0009;padding:12px;width:min(430px,100%);max-height:calc(100dvh - 24px);overflow:auto}
.context-sheet-header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.context-sheet-header strong{font-size:15px}.context-sheet-dialog p{font-size:12px;line-height:1.45;color:#cbd8e0;margin:2px 0}
.context-sheet-dialog>button{min-height:38px;text-align:left}
.context-sheet-two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.context-sheet-two>button{min-height:38px}
.rhythm-event{touch-action:pan-y;user-select:none;-webkit-user-select:none}
.rhythm-context-hint{font-weight:bold;font-size:13px;opacity:.75;pointer-events:none;margin-left:4px}
.rhythm-selected-context-action{display:flex;align-items:center;gap:8px;justify-content:space-between;flex-wrap:wrap;grid-column:1/-1}
.rhythm-selected-context-action strong{font-size:12px}.rhythm-selected-context-action button{min-height:34px}
.dynamics-measure-tile{position:relative;min-width:0}
.dynamics-measure-main{width:100%;min-height:77px;padding-right:27px;overflow:hidden;word-wrap:break-word}
.dynamics-more{position:absolute;right:2px;top:3px;min-height:30px;min-width:26px;padding:1px 4px;border:1px solid #607380;border-radius:5px;font-size:17px}
.dynamics-hairpin-item{display:flex;align-items:stretch;min-width:0;overflow:visible}
.dynamics-hairpin-main{flex:1;min-width:0;padding:2px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:11px;border-radius:4px 0 0 4px}
.dynamics-hairpin-more{flex:0 0 25px;padding:0;border-radius:0 4px 4px 0;border-left:0;font-size:17px}
.dynamics-measure-main:focus-visible,.dynamics-more:focus-visible,.dynamics-hairpin-main:focus-visible,.dynamics-hairpin-more:focus-visible{outline:2px solid #f3c77c;outline-offset:1px}
@media(max-width:480px){.context-sheet-dialog{padding:8px}.context-sheet-two{gap:5px}.context-sheet-two button{font-size:11px}.dynamics-hairpin-more{flex-basis:23px}}

/* Desktop: a full-width modern menu. iPad portrait keeps accessible horizontal navigation. */
.tabs.workspace-menu{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:5px;width:100%;margin:12px 0 16px;padding:5px;border:1px solid #405263;border-radius:12px;background:linear-gradient(180deg,#24313d,#18232e);box-shadow:0 6px 22px #0003;overflow:visible}
.tabs.workspace-menu button{min-width:0;min-height:48px;padding:9px 8px;border:1px solid transparent;border-radius:9px;white-space:normal;line-height:1.25;text-wrap:balance;color:#ccd6df;font-size:clamp(11px,1vw,14px);font-weight:650;background:transparent;box-shadow:none!important;transition:background-color .15s,border-color .15s}
.tabs.workspace-menu button:hover{background:#354859}
.tabs.workspace-menu button.active{color:#1d2229;background:linear-gradient(180deg,#f2d3a1,#caa16b);border-color:#f4d5a3;box-shadow:inset 0 1px #fff5,0 2px 10px #0004!important}
.tabs.workspace-menu button:focus-visible{outline:2px solid #f3d4a1;outline-offset:1px}
@media(max-width:820px){.tabs.workspace-menu{display:flex;overflow-x:auto;scrollbar-width:thin;overscroll-behavior-x:contain}.tabs.workspace-menu button{flex:0 0 138px;white-space:normal}}
.instrument-context-edition-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.instrument-context-edition-actions button{min-width:0;min-height:43px;font-size:12px;line-height:1.3;text-align:center}
.performance-workspace.performance-expanded{width:100%;max-width:none;min-height:calc(100dvh - 84px);padding:clamp(8px,1.5vw,22px);gap:12px;display:flex;flex-direction:column}
.performance-stage-header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px}
.performance-stage-header h2{font-size:clamp(18px,2vw,27px);margin:0;line-height:1.15;overflow-wrap:anywhere}
.performance-eyebrow{display:block;color:#e4bf84;font-weight:750;text-transform:uppercase;letter-spacing:.15em;font-size:10px;margin-bottom:3px}
.performance-view-switch{display:flex;gap:4px;padding:4px;border:1px solid #405364;background:#1b2935;border-radius:10px}
.performance-view-switch button{border:0;background:transparent;border-radius:7px;padding:9px 14px;min-height:40px;font-size:13px}
.performance-view-switch button.selected{background:#d4ac75;color:#182430;font-weight:800}
.performance-harmony-bar{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1.5fr);gap:8px}
.performance-harmony-bar>div{min-width:0;background:#23323f;border:1px solid #475a6b;border-radius:12px;padding:12px 15px;display:flex;flex-direction:column;gap:4px;justify-content:center}
.performance-harmony-bar span,.performance-harmony-bar small{font-size:clamp(11px,1.05vw,14px);color:#b9cbd9;line-height:1.25}
.performance-harmony-bar strong{font-size:clamp(20px,3.3vw,48px);color:#ffe0ad;line-height:1.05;overflow-wrap:anywhere}
.performance-harmony-next strong{color:#d9e7f2}
.performance-harmony-pulse strong{font-size:clamp(16px,2vw,25px)}
.performance-beat-strip{display:grid;grid-auto-columns:1fr;grid-auto-flow:column;gap:5px;margin-top:5px}
.performance-beat-strip span{height:8px;border-radius:4px;background:#415565}
.performance-beat-strip span.elapsed{background:#897454}
.performance-beat-strip span.current{background:#ffd28b;box-shadow:0 0 0 2px #ffd28b44}
.performance-compact-bar{margin:0}
.performance-cue-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));grid-auto-rows:minmax(175px,1fr);gap:10px;flex:1;align-content:stretch}
.performance-cue-panel{display:flex;flex-direction:column;text-align:left;align-items:stretch;min-width:0;gap:9px;padding:12px 14px;border:1px solid #526475;border-radius:12px;background:linear-gradient(160deg,#293a48,#1b2834);box-shadow:inset 0 1px #ffffff14;color:#f3f6f8}
.performance-cue-panel.performance-cue-playing{border-color:#d5aa6d;box-shadow:inset 0 3px #d8a862,0 0 0 1px #d8a86222}
.performance-cue-panel.performance-cue-rest{opacity:.78}
.performance-cue-panel.performance-cue-focus{outline:2px solid #8bc5f3;outline-offset:0}
.performance-cue-identity{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.performance-cue-identity>strong{font-size:clamp(15px,1.6vw,22px);margin-right:auto}
.performance-cue-activity{font-size:11px;color:#c1cbd3;padding:3px 7px;border:1px solid #5a6d79;border-radius:99px}
.performance-cue-activity.is-playing{color:#c4ffdf;border-color:#489b74;background:#285440}
.performance-cue-role{display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:5px 0}
.performance-cue-role strong{font-size:clamp(22px,2.4vw,34px);text-transform:capitalize;line-height:1.05;color:#ffe0ae}
.performance-cue-panel small{font-size:clamp(10px,.95vw,12px);color:#b5c6d2;overflow-wrap:anywhere}
.performance-cue-next{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;border-top:1px solid #506273;padding-top:9px;margin-top:auto}
.performance-cue-next>span{display:flex;flex-direction:column;gap:3px;min-width:0}
.performance-cue-next strong{font-size:clamp(16px,1.6vw,24px);line-height:1.1;text-transform:capitalize;color:#e0eaf2;overflow-wrap:anywhere}
.performance-cue-entry{color:#f7d79d;font-size:12px;font-weight:700}
.performance-vocal-cue{display:grid;gap:6px;padding:10px 16px;border:1px solid #af9067;border-radius:12px;background:#392f29}
.performance-vocal-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px}
.performance-vocal-heading>span{color:#f5d3a4}
.performance-vocal-cue .performance-lyric-line{min-height:0;font-size:clamp(18px,2vw,30px);gap:5px 12px}
.performance-count-beats{display:flex;justify-content:center;gap:10px}
.performance-count-beats span{display:flex;align-items:center;justify-content:center;width:clamp(34px,4vw,52px);height:clamp(34px,4vw,52px);font-size:20px;font-weight:850;border-radius:50%;border:2px solid #716254;background:#302924;color:#a89785}
.performance-count-beats span.current{background:#ffd48d;color:#1d2630;border-color:#fff0c9;transform:scale(1.13)}
.performance-count-beats span.passed{background:#674c2d;color:#f6d49e}
.performance-roll-note.performance-note-continuation{border-left-style:dashed;border-top-left-radius:0;border-bottom-left-radius:0}
.performance-roll-note.performance-note-tied{border-right-style:dashed;border-top-right-radius:0;border-bottom-right-radius:0}
@media(max-width:720px){.performance-harmony-bar{grid-template-columns:repeat(2,minmax(0,1fr))}.performance-harmony-bar>div{padding:8px}.performance-cue-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(185px,1fr)}.performance-cue-panel{padding:8px;gap:5px}.performance-cue-next{gap:5px}.performance-cue-next strong{font-size:15px}}
@media(max-width:430px){.performance-cue-grid{grid-template-columns:minmax(0,1fr)}.performance-cue-next strong{font-size:17px}.performance-view-switch{width:100%}.performance-view-switch button{flex:1}}


/* Stage v2: keep key/chord/form in one predictable, glanceable right-hand panel. */
.performance-workspace.performance-expanded{gap:7px;min-height:calc(100dvh - 70px)}
.performance-stage-header{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;min-height:30px}
.performance-stage-title{font-size:clamp(13px,1.5vw,18px);font-weight:650;color:#dbe5ed;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.performance-stage-label{font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#e2bd82;white-space:nowrap;font-weight:750}
.performance-stage-layout{display:grid;grid-template-columns:minmax(0,1fr) clamp(275px,23vw,375px);gap:12px;flex:1;min-height:0;align-items:stretch}
.performance-stage-main{min-width:0;display:flex;flex-direction:column;gap:9px;min-height:0}
.performance-stage-main .performance-compact-bar{padding:0 1px;gap:6px;flex-wrap:wrap}
.performance-stage-main .performance-compact-seek{min-width:170px;flex:1 1 200px}
.performance-stage-main .performance-section-nav{display:flex;gap:4px;margin-left:auto;align-items:center}
.performance-stage-main .performance-roll-panel{min-width:0;flex:1}
.performance-stage-main .performance-roll{height:clamp(230px,39dvh,490px)}
.performance-stage-main .performance-ensemble{min-width:0}
.performance-harmony-sidebar{display:flex;flex-direction:column;gap:12px;min-width:0;border:1px solid #63778a;border-radius:14px;padding:14px;background:linear-gradient(165deg,#243746,#192734);box-shadow:inset 0 1px #ffffff16}
.performance-harmony-sidebar h3{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:#f2d0a0;margin:0;font-weight:800}
.performance-harmony-group{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.performance-harmony-item{display:flex;flex-direction:column;align-items:flex-start;justify-content:start;min-height:110px;min-width:0;padding:10px 9px;border:1px solid #536879;border-radius:9px;background:#263948;gap:6px}
.performance-harmony-item small{font-size:clamp(11px,.95vw,13px);line-height:1.2;color:#b6c8d6;font-weight:700}
.performance-harmony-item strong{font-size:clamp(28px,3.1vw,49px);font-weight:850;line-height:1.06;max-width:100%;overflow-wrap:anywhere;color:#ffdfae}
.performance-harmony-item span{font-size:11px;color:#c8d7e3;line-height:1.25}
.performance-harmony-upcoming strong{color:#e7f0f8}
.performance-harmony-imminent{border-color:#e4b477;background:#3d372f}
.performance-harmony-imminent strong{color:#ffdc9f}
.performance-chord-group .performance-harmony-item strong{font-size:clamp(25px,2.8vw,43px)}
.performance-harmony-progress{margin-top:auto;display:grid;gap:7px;padding:12px 10px;border:1px solid #526c7a;border-radius:10px;background:#1d303d}
.performance-harmony-progress .performance-harmony-meter{font-size:clamp(13px,1.1vw,16px);font-weight:700;color:#d7e5f1}
.performance-harmony-progress strong{font-size:clamp(21px,2.25vw,32px);line-height:1.1;color:#ffe0af}
.performance-harmony-progress .performance-beat-strip{margin:5px 0 2px}
.performance-harmony-progress .performance-beat-strip span{height:12px}
.performance-harmony-tempo{font-size:14px;font-weight:750;color:#dfc7a3}
.performance-topbar-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin-left:auto;min-width:0}
.performance-topbar-view-switch{display:flex;gap:4px;align-items:center;padding:3px;border:1px solid #526676;border-radius:9px;background:#1b2b36}
.performance-topbar-view-switch button{border:0;border-radius:6px;background:transparent;padding:8px 12px;min-height:36px;white-space:nowrap;font-size:12px;color:#deebf3}
.performance-topbar-view-switch button.selected{background:#e2b780;color:#18222c;font-weight:800}
.performance-topbar-actions .performance-fullscreen-button{min-height:40px;padding:8px 11px;font-size:12px;white-space:nowrap;border-color:#718392}
.performance-fullscreen-hint{font-size:12px;line-height:1.4;color:#f0d5ac;background:#393124;border:1px solid #8b7251;border-radius:7px;padding:7px 12px;margin:0}
.performance-cue-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));grid-auto-rows:minmax(205px,1fr);align-content:stretch;gap:9px;min-height:0}
.performance-cue-panel{height:100%;min-height:205px;gap:7px;padding:12px 14px;overflow:hidden}
.performance-cue-panel.performance-cue-rest{opacity:.9}
.performance-cue-panel.performance-cue-change{border-bottom:3px solid #e9bc7b}
.performance-cue-identity{min-height:35px}
.performance-cue-identity>strong{font-size:clamp(16px,1.6vw,23px);line-height:1.12;overflow-wrap:anywhere}
.performance-cue-role{padding:5px 0;min-height:67px}
.performance-cue-role strong{font-size:clamp(25px,2.5vw,39px);line-height:1.02}
.performance-cue-role small{font-size:12px}
.performance-cue-next{grid-template-columns:minmax(0,1fr) minmax(0,.9fr);margin-top:auto;padding-top:9px;gap:9px}
.performance-cue-next strong{font-size:clamp(17px,1.75vw,25px)}
.performance-cue-next small{font-size:clamp(11px,.95vw,13px)}
.performance-cue-activity{display:inline-flex;align-items:center;justify-content:center;min-width:70px;min-height:25px;font-size:11px;font-weight:750;white-space:nowrap;font-variant-numeric:tabular-nums}
.performance-cue-activity.is-upcoming{color:#ffe3b6;background:#55412d;border-color:#d1a36f}
.performance-stage-compact .app-topbar{padding:4px 10px;min-height:49px}
.performance-stage-compact .app-topbar .brand{display:none}
.performance-stage-compact .performance-workspace.performance-expanded{padding:5px 8px;min-height:calc(100dvh - 50px)}
.shell:fullscreen{height:100dvh;overflow:auto;background:#10151b}
@media(max-width:1000px){
 .performance-stage-layout{grid-template-columns:minmax(0,1fr) 256px;gap:8px}
 .performance-harmony-sidebar{padding:9px;gap:8px}
 .performance-harmony-group{gap:5px}
 .performance-harmony-item{padding:8px 6px;min-height:95px}
 .performance-harmony-item strong{font-size:clamp(25px,3vw,35px)}
 .performance-cue-grid{grid-template-columns:repeat(auto-fit,minmax(min(100%,208px),1fr))}
 .performance-cue-panel{padding:9px 11px}
}
@media(max-width:750px){
 .performance-stage-layout{display:flex;flex-direction:column}
 .performance-harmony-sidebar{order:-1}
 .performance-harmony-sidebar h3{display:none}
 .performance-harmony-group{grid-template-columns:repeat(2,minmax(0,1fr))}
 .performance-harmony-sidebar{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
 .performance-harmony-progress{grid-column:1/-1;margin:0}
 .performance-harmony-item{min-height:78px}
 .performance-cue-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(198px,1fr)}
 .performance-cue-panel{min-height:198px}
 .performance-topbar-actions{margin-left:0}
}
@media(max-width:480px){
 .performance-topbar-actions{width:100%;justify-content:space-between}
 .performance-topbar-view-switch{flex:1}
 .performance-topbar-view-switch button{flex:1;min-width:0}
 .performance-stage-label{display:none}
 .performance-harmony-sidebar{display:flex;flex-direction:column}
 .performance-harmony-group{grid-template-columns:repeat(2,minmax(0,1fr))}
 .performance-cue-grid{grid-template-columns:1fr;grid-auto-rows:minmax(190px,auto)}
}

/* iPad performance-stage layout correction: the former 200px flex basis was
   applied to HEIGHT because the seek container was a column, leaving a large
   empty band above the instrument tiles. Keep the controls a compact row. */
.performance-stage-main .performance-compact-bar{
 display:grid;grid-template-columns:minmax(0,1fr) auto;
 align-items:center;gap:8px;min-height:42px;
 flex:0 0 auto;align-self:stretch;flex-wrap:nowrap;
}
.performance-stage-main .performance-compact-seek{
 width:auto;min-width:0;flex:none;align-self:center;margin:0;
}
.performance-stage-main .performance-section-nav{
 margin:0;justify-content:flex-end;flex:0 0 auto;flex-wrap:nowrap;
}
.performance-stage-layout{align-items:start}
.performance-harmony-sidebar{align-self:start;height:auto}
.performance-harmony-progress{margin-top:0}
.performance-stage-main .performance-cue-grid{
 flex:0 0 auto;align-content:start;grid-auto-rows:minmax(190px,auto);
}
/* At tablet landscape dimensions, fit three stable rows of cues without a
   seek-bar gap pushing the final row below the visible screen. */
@media(min-width:751px) and (max-width:1200px) and (orientation:landscape){
 .performance-workspace.performance-expanded{padding:7px 10px;gap:5px}
 .performance-stage-header{min-height:25px}
 .performance-stage-main{gap:6px}
 .performance-stage-main .performance-compact-bar{min-height:38px;gap:7px}
 .performance-stage-main .performance-cue-grid{grid-auto-rows:minmax(163px,auto);gap:7px}
 .performance-cue-panel{min-height:163px;padding:8px 10px;gap:3px}
 .performance-cue-identity{min-height:26px;gap:4px}
 .performance-cue-identity>strong{font-size:clamp(13px,1.45vw,19px)}
 .performance-cue-activity{min-width:57px;min-height:22px;font-size:10px}
 .performance-cue-role{min-height:50px;padding:1px 0}
 .performance-cue-role strong{font-size:clamp(22px,2.3vw,31px)}
 .performance-cue-role small{font-size:11px}
 .performance-cue-next{padding-top:5px;gap:5px}
 .performance-cue-next strong{font-size:clamp(15px,1.5vw,20px)}
 .performance-cue-next small{font-size:10px}
 .performance-harmony-sidebar{gap:8px}
}
@media(max-width:750px){
 .performance-stage-main .performance-compact-bar{grid-template-columns:minmax(0,1fr);gap:3px}
 .performance-stage-main .performance-section-nav{justify-content:flex-start}
 .performance-stage-main .performance-cue-grid{grid-auto-rows:minmax(198px,auto)}
}


/* Orchestration: context-first, clean one-line scope + legend toolbar. */
.orchestration-top-row{display:flex;align-items:center;justify-content:space-between;gap:10px 22px;flex-wrap:wrap;margin:2px 0 10px;min-width:0}
.orchestration-top-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
.orchestration-top-row .orchestration-scope-tabs{display:flex;align-items:center;gap:3px;margin:0;padding:3px;border:1px solid #405365;border-radius:10px;background:#1a2632;overflow:visible}
.orchestration-top-row .orchestration-scope-tabs button{border:0;border-radius:7px;box-shadow:none;min-height:38px;height:38px;padding:6px 15px}
.orchestration-top-row .orchestration-scope-tabs button.selected{background:#d1a875;color:#18232c;box-shadow:none;font-weight:800}
.orchestration-top-row .orchestration-right-legend{display:flex;justify-content:flex-end;align-items:center;flex:1 1 450px;gap:6px 13px;margin:0;font-size:11px;min-width:0}
.orchestration-top-row .orchestration-right-legend span{white-space:nowrap}
.orchestration-tool-wrap{position:relative;z-index:16}
.orchestration-top-row .orchestration-more-button{min-height:42px;white-space:nowrap;padding:8px 12px;font-size:13px;border-color:#536a7d}
.orchestration-tools-popup{position:absolute;top:calc(100% + 7px);left:0;z-index:30;min-width:min(340px,85vw);max-width:calc(100vw - 24px);display:grid;gap:6px;padding:12px;border:1px solid #8295a6;border-radius:10px;background:#233440;box-shadow:0 14px 34px #000b}
.orchestration-tools-popup>strong{font-size:13px;color:#f5dbb4;padding-bottom:4px}
.orchestration-tools-popup button{width:100%;text-align:left;min-height:38px;padding:8px 10px}
.orchestration-tools-popup p{font-size:11px;line-height:1.45;color:#bacbd8;margin:4px 0 0}
.orchestration-top-row+.orchestration-map-filter{margin:5px 0}
.overview-section>.phrase-planner{margin:2px 0 10px}
.overview-section .orchestration-instrument-scope{min-width:0}
@media(max-width:920px){.orchestration-top-row{gap:9px}.orchestration-top-row .orchestration-right-legend{justify-content:flex-end;flex-basis:100%}}
@media(max-width:550px){.orchestration-top-actions{width:100%}.orchestration-top-row .orchestration-scope-tabs{flex:1;min-width:0}.orchestration-top-row .orchestration-scope-tabs button{flex:1;min-width:0;padding:5px}.orchestration-top-row .orchestration-right-legend{justify-content:flex-start}.orchestration-tools-popup{left:auto;right:0}}

/* Stage: chord is the long-distance information, key becomes a quiet footnote. */
.performance-harmony-sidebar{gap:9px}
.performance-chord-group{order:0}
.performance-key-group{order:1}
.performance-harmony-progress{order:2}
.performance-chord-group .performance-harmony-item{min-height:129px}
.performance-chord-group .performance-harmony-item strong{font-size:clamp(36px,3.7vw,61px);font-weight:900}
.performance-key-group .performance-harmony-item{min-height:70px;padding:7px 9px;gap:2px;border-color:#3b4c5d;background:#1e303d}
.performance-key-group .performance-harmony-item small{font-size:11px}
.performance-key-group .performance-harmony-item strong{font-size:clamp(18px,1.5vw,24px);font-weight:700;color:#b7cbd9}
.performance-key-group .performance-harmony-item span{font-size:10px;color:#aabfcf}
.performance-key-group .performance-harmony-imminent{border-color:#b89361;background:#332e2b}
.performance-key-group .performance-harmony-imminent strong{color:#efc894}

/* A stage panel is now an upright, predictable cue card rather than a wide tile. */
.performance-stage-main{container-name:performance-parts;container-type:inline-size}
.performance-stage-main .performance-cue-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(235px,auto);gap:9px;align-content:start}
.performance-stage-main .performance-cue-panel{min-height:235px;height:100%;gap:6px;padding:12px 11px;background:linear-gradient(160deg,#293a48,#1b2834)}
.performance-stage-main .performance-cue-identity{align-content:start;min-height:36px}
.performance-stage-main .performance-cue-identity>strong{font-size:clamp(15px,1.55vw,22px)}
.performance-stage-main .performance-cue-role{min-height:80px;align-items:center;justify-content:center;text-align:center;gap:4px}
.performance-stage-main .performance-cue-role strong{font-size:clamp(24px,2.5vw,37px)}
.performance-stage-main .performance-cue-next{margin-top:auto}
.performance-cue-panel.performance-cue-playing{
 border-color:#bd9b66;
 box-shadow:inset 0 0 0 2px rgba(247,193,111,var(--cue-beat-glow,0.13)),0 0 12px rgba(240,182,95,0.10);
 background:linear-gradient(160deg,rgba(228,175,100,calc(var(--cue-beat-glow,0.13)*0.20)),transparent 75%),linear-gradient(160deg,#293a48,#1b2834);
 transition:box-shadow .08s linear,background-color .08s linear;
}
.performance-cue-panel.performance-cue-rest{opacity:.91}
.performance-cue-activity.is-playing{background:#314b42;border-color:#5d9a78;color:#d4f3df}
@container performance-parts (max-width:700px){
 .performance-stage-main .performance-cue-grid{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(213px,auto)}
 .performance-stage-main .performance-cue-panel{min-height:213px;padding:9px}
}
@container performance-parts (max-width:520px){
 .performance-stage-main .performance-cue-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(205px,auto)}
 .performance-stage-main .performance-cue-panel{min-height:205px}
}
@media(min-width:751px) and (max-width:1200px) and (orientation:landscape){
 .performance-stage-main .performance-cue-grid{grid-auto-rows:minmax(213px,auto)}
 .performance-stage-main .performance-cue-panel{min-height:213px}
}
@media(max-width:750px){
 .performance-stage-main .performance-cue-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(205px,auto)}
 .performance-stage-main .performance-cue-panel{min-height:205px}
}
@media(max-width:430px){
 .performance-stage-main .performance-cue-grid{grid-template-columns:1fr}
}
@media(prefers-reduced-motion:reduce){
 .performance-cue-panel.performance-cue-playing{transition:none;box-shadow:inset 0 3px 0 #d5aa6d;background:linear-gradient(160deg,#293a48,#1b2834)}
}


/* Stage v4: one navigation / section / beat panel, instruments below, no side drawer. */
.performance-workspace.performance-expanded{gap:10px;min-height:calc(100dvh - 65px)}
.performance-stage-top{border:1px solid #586f80;border-radius:12px;background:linear-gradient(155deg,#243745,#1c2c38);padding:12px 15px;display:grid;gap:8px;min-width:0}
.performance-stage-top-title{display:flex;align-items:center;justify-content:space-between;gap:14px;min-width:0}
.performance-stage-top-title strong{font-size:clamp(13px,1.35vw,19px);font-weight:730;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.performance-stage-top-title>span{font-size:11px;color:#a8bccb;text-align:right;flex:0 0 auto}
.performance-stage-controls{display:grid;grid-template-columns:minmax(180px,1fr) minmax(175px,auto) 153px;gap:12px;align-items:center}
.performance-top-seek,.performance-top-section,.performance-top-beat{min-width:0;display:flex;flex-direction:column;gap:5px;justify-content:center}
.performance-top-caption{color:#cad6df;font-size:12px;font-weight:750;letter-spacing:.01em}
.performance-top-seek .performance-compact-seek{display:flex;align-items:center;width:100%;height:30px;flex:none;margin:0}
.performance-top-seek .performance-compact-seek input{width:100%;margin:0;min-width:0;accent-color:#e7bf83}
.performance-section-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(36px,1fr));gap:4px;min-width:175px}
.performance-section-grid .performance-section-jump{min-width:36px;min-height:37px;padding:5px 7px;border-radius:7px;font-size:14px}
.performance-top-beat{align-items:flex-start;border-left:1px solid #5b7181;padding-left:14px}
.performance-beat-display{display:flex;gap:7px;align-items:baseline}
.performance-beat-display strong{font-size:clamp(24px,3vw,41px);line-height:1;font-variant-numeric:tabular-nums;color:#ffe0ab}
.performance-top-beat-count{font-size:15px;color:#e0e9f1;font-weight:700}
.performance-top-beat .performance-beat-strip{width:100%;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:5px;margin:0}
.performance-top-beat .performance-beat-strip span{height:7px}
.performance-stage-top .performance-vocal-cue{margin-top:4px;max-width:none}
.performance-stage-only{width:100%;flex:1;min-height:0;display:flex;flex-direction:column;gap:11px}
.performance-stage-only .performance-cue-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(287px,auto);gap:10px;align-content:start;width:100%;flex:0 0 auto}
.performance-stage-only .performance-diagram-card{min-height:287px;padding:13px 13px 10px;gap:7px;justify-content:flex-start}
.performance-diagram-card .performance-cue-identity{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-height:33px;margin:0 0 3px}
.performance-diagram-card .performance-cue-identity>strong{font-size:clamp(15px,1.4vw,22px);line-height:1.12;margin-right:auto;text-align:left}
.performance-card-beats{display:flex;align-items:center;gap:4px;flex:0 0 auto;min-height:22px}
.performance-card-beats i{display:inline-block;height:8px;width:8px;flex:0 0 8px;border:1px solid #667c87;background:#415461;border-radius:50%}
.performance-card-beats i.is-current{background:#ffd18c;border-color:#f8dfa8;box-shadow:0 0 0 3px rgba(255,212,153,.13)}
.performance-card-rest-cue{color:#b4c7d6;font-size:10px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;font-weight:680}
.performance-card-mode-hint{display:block;margin-top:auto;border-top:1px solid #49606e;padding-top:7px;text-align:center;color:#bdccd8;font-size:10px;line-height:1.2;letter-spacing:.02em;flex:0 0 auto}
.performance-diagram-card .performance-cue-role{min-height:125px}
.performance-diagram-card .performance-cue-next{margin-top:0}
.performance-diagram-card:focus-visible{outline:3px solid #f4d39f;outline-offset:2px}
@media(max-width:1040px){
 .performance-stage-only .performance-cue-grid{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(280px,auto)}
 .performance-stage-only .performance-diagram-card{min-height:280px}
 .performance-stage-controls{grid-template-columns:minmax(125px,1fr) auto 125px;gap:9px}
 .performance-top-beat{padding-left:9px}
}
@media(min-width:920px) and (max-width:1200px) and (orientation:landscape){
 .performance-stage-only .performance-cue-grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-rows:minmax(270px,auto);gap:8px}
 .performance-stage-only .performance-diagram-card{min-height:270px}
}
@media(min-width:751px) and (max-width:919px) and (orientation:landscape){
 .performance-stage-only .performance-cue-grid{grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:minmax(267px,auto);gap:8px}
 .performance-stage-only .performance-diagram-card{min-height:267px}
}
@media(max-width:750px){
 .performance-stage-controls{grid-template-columns:minmax(0,1fr) 128px;gap:10px}
 .performance-top-section{grid-column:1 / -1;grid-row:2}
 .performance-top-beat{grid-column:2;grid-row:1}
 .performance-top-seek{grid-column:1;grid-row:1}
 .performance-stage-only .performance-cue-grid{grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:minmax(282px,auto)}
 .performance-stage-only .performance-diagram-card{min-height:282px}
 .performance-stage-top-title{flex-wrap:wrap;gap:4px}
 .performance-stage-top-title>span{text-align:left}
}
@media(max-width:470px){
 .performance-stage-top{padding:9px 10px}
 .performance-stage-controls{grid-template-columns:minmax(0,1fr) 95px;gap:7px}
 .performance-stage-only .performance-cue-grid{grid-template-columns:1fr;grid-auto-rows:minmax(282px,auto)}
}
@media(prefers-reduced-motion:reduce){
 .performance-card-beats i.is-current{box-shadow:none}
}


/* Stage v5: one-line title in the playback bar. Preserve full title on hover/touch
 * accessibility, but remove bracketed recording notes only from the display. */
.performance-live .app-topbar{display:flex;align-items:center;flex-wrap:nowrap;gap:9px;padding:6px 11px;min-height:54px}
.performance-live .app-topbar .brand{display:none!important}
.performance-live .app-topbar .performance-topbar-song-title{display:block;order:1;flex:1 1 auto;min-width:50px;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:clamp(20px,2.55vw,36px);font-weight:800;line-height:1.08;letter-spacing:-.025em;color:#e9eff3}
.performance-live .app-topbar .topbar-playback{order:2;flex:0 0 auto;margin:0;padding:0}
.performance-live .app-topbar .performance-topbar-actions{order:3;flex:0 0 auto;margin-left:0}
.performance-live .app-topbar .topbar-playback .icon-action{height:39px;min-height:39px}
.performance-live .performance-workspace.performance-expanded{padding:7px 11px;gap:8px}
.performance-live .performance-stage-top{padding:5px 10px;gap:4px}
.performance-live .performance-stage-controls{display:grid;grid-template-columns:minmax(120px,1fr) auto auto;gap:9px;align-items:center}
.performance-live .performance-top-seek{display:flex;flex-direction:row;align-items:center;gap:8px;min-width:0}
.performance-live .performance-seek-index{color:#f4d7a8;font-size:clamp(14px,1.3vw,18px);line-height:1;white-space:nowrap;font-weight:800;font-variant-numeric:tabular-nums}
.performance-live .performance-top-seek .performance-compact-seek{width:auto;min-width:90px;flex:1 1 auto;height:26px}
.performance-live .performance-top-seek .performance-compact-seek input{width:100%;min-width:0}
.performance-live .performance-top-section{display:flex;flex-direction:row;align-items:center}
.performance-live .performance-section-grid{display:grid;grid-template-columns:repeat(4,minmax(34px,1fr));min-width:0;gap:4px}
.performance-live .performance-section-grid .performance-section-jump{font-size:14px;min-width:34px;min-height:34px;height:34px;padding:4px 8px}
.performance-live .performance-top-beat{border-left:1px solid #506577;padding:0 0 0 10px;align-items:center;gap:2px}
.performance-live .performance-beat-display{display:flex;align-items:baseline;gap:4px}
.performance-live .performance-beat-display strong{font-size:clamp(22px,2.4vw,33px);line-height:1;color:#f9d49d}
.performance-live .performance-top-beat-count{font-size:14px}
.performance-live .performance-compact-tempo{font-size:11px;color:#aebfcb;font-weight:700;font-variant-numeric:tabular-nums;padding-left:4px}
.performance-live .performance-top-beat .performance-beat-strip{width:100%;max-width:94px;gap:3px}
.performance-live .performance-top-beat .performance-beat-strip span{height:5px}
.performance-live .performance-stage-only .performance-cue-grid{grid-auto-rows:minmax(238px,auto);gap:9px}
.performance-live .performance-stage-only .performance-diagram-card{min-height:238px;padding:9px 10px 7px;gap:5px}
/* Keep the current role beside the name without growing the card header. */
.performance-live .performance-diagram-card .performance-cue-identity{height:26px;min-height:26px;flex:0 0 26px;flex-wrap:nowrap;min-width:0;margin:0;gap:6px}
.performance-live .performance-diagram-card .performance-cue-identity>strong{font-size:clamp(16px,1.55vw,23px);min-width:0;margin-right:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.performance-live .performance-diagram-card .performance-card-role{flex:0 0 auto;margin-right:auto;padding-left:6px;border-left:1px solid #667987;color:#cbd9e3;font-size:clamp(11px,1.1vw,14px);font-weight:600;line-height:1.2;text-transform:capitalize;white-space:nowrap}
.performance-live .performance-diagram-card .performance-card-rest-cue{flex:0 0 auto;font-size:18px;line-height:1}
.performance-live .performance-diagram-card .performance-card-mode-hint{margin-top:auto;padding:2px 0 0;line-height:1;font-size:16px;border-top:0}
.performance-live .performance-stage-top .performance-vocal-cue{margin:3px 0 0}
@media(min-width:751px) and (max-width:1200px) and (orientation:landscape){
 .performance-live .performance-stage-only .performance-cue-grid{grid-auto-rows:minmax(236px,auto)}
 .performance-live .performance-stage-only .performance-diagram-card{min-height:236px}
}
@media(max-width:850px){
 .performance-live .app-topbar .performance-topbar-song-title{font-size:clamp(17px,2.25vw,26px)}
 .performance-live .app-topbar{gap:5px}
 .performance-live .performance-stage-controls{gap:6px}
}
@media(max-width:750px){
 .performance-live .app-topbar{flex-wrap:wrap}
 .performance-live .app-topbar .performance-topbar-song-title{flex:1 1 100%;order:0;font-size:clamp(19px,4vw,29px)}
 .performance-live .app-topbar .topbar-playback{order:1;margin-right:auto}
 .performance-live .app-topbar .performance-topbar-actions{order:2}
 .performance-live .performance-stage-controls{grid-template-columns:minmax(0,1fr) auto}
 .performance-live .performance-top-seek{grid-column:1;grid-row:1}
 .performance-live .performance-top-section{grid-column:1;grid-row:2}
 .performance-live .performance-top-beat{grid-column:2;grid-row:1 / span 2}
 .performance-live .performance-stage-only .performance-cue-grid{grid-auto-rows:minmax(245px,auto)}
 .performance-live .performance-stage-only .performance-diagram-card{min-height:245px}
}
@media(max-width:480px){
 .performance-live .app-topbar .performance-topbar-song-title{font-size:19px}
 .performance-live .performance-compact-tempo{display:none}
 .performance-live .performance-stage-top{padding:5px 7px}
 .performance-live .performance-stage-controls{gap:5px}
 .performance-live .performance-section-grid .performance-section-jump{min-width:30px;padding:3px 5px}
 .performance-live .performance-stage-only .performance-cue-grid{grid-auto-rows:minmax(235px,auto)}
 .performance-live .performance-stage-only .performance-diagram-card{min-height:235px}
}


/* Fixed-height ensemble rows: MIDI activity changes paint only, not layout.
 * The 270px slot accommodates each of the instrument-specific static diagrams.
 * Avoid minmax(X,auto), which silently reintroduces row growth on a note change. */
.performance-live .performance-stage-only .performance-cue-grid{
 grid-auto-rows:270px!important;align-content:start;
}
.performance-live .performance-stage-only .performance-diagram-card{
 height:270px!important;min-height:270px!important;max-height:270px!important;
 box-sizing:border-box;overflow:hidden;
}
@media(max-width:750px){
 .performance-live .performance-stage-only .performance-cue-grid{grid-auto-rows:282px!important}
 .performance-live .performance-stage-only .performance-diagram-card{
  height:282px!important;min-height:282px!important;max-height:282px!important;
 }
}
/* A segmented switch's *outer* height now matches the 42px buttons. */
.performance-live .performance-topbar-view-switch{
 height:42px!important;min-height:42px!important;padding:3px!important;box-sizing:border-box;
}
.performance-live .performance-topbar-view-switch button{
 height:34px!important;min-height:34px!important;padding:4px 12px!important;
}
/* Identical stage-control and transport touch targets. Full screen and returning
 * to the editor are distinct, adjacent actions with consistent visual rhythm. */
.performance-live .app-topbar{gap:7px;min-height:57px}
.performance-live .app-topbar .topbar-playback{gap:4px;border-right:0;padding:0}
.performance-live .app-topbar .topbar-playback .transport-play,
.performance-live .app-topbar .topbar-playback .transport-stop{
 width:42px!important;min-width:42px!important;height:42px!important;min-height:42px!important;
 padding:7px!important;display:inline-flex;align-items:center;justify-content:center;border-radius:9px;
}
.performance-live .performance-topbar-actions{gap:7px;align-items:center}
.performance-live .performance-topbar-view-switch{gap:3px;padding:3px;border-radius:10px}
.performance-live .performance-topbar-view-switch button{
 height:42px;min-height:42px;padding:7px 12px;line-height:1.15;
 display:inline-flex;align-items:center;justify-content:center;border-radius:7px;
}
.performance-live .performance-stage-actions{
 display:inline-flex;align-items:center;gap:4px;min-width:0;
 padding-left:8px;border-left:1px solid #445766;
}
.performance-live .performance-stage-actions .performance-stage-action,
.performance-live .performance-topbar-actions .performance-fullscreen-button{
 display:inline-flex;align-items:center;justify-content:center;gap:6px;
 height:42px!important;min-height:42px!important;min-width:42px;
 padding:7px 11px!important;white-space:nowrap;font-size:12px;line-height:1;
 font-weight:650;border-radius:9px;border:1px solid #647787;
 background:#263744;color:#e6edf2;box-shadow:none;
}
.performance-live .performance-stage-actions .performance-stage-action:hover{background:#34495a;border-color:#9aaab5}
.performance-live .performance-stage-actions .performance-stage-action:focus-visible{outline:2px solid #f4d19d;outline-offset:2px}
.performance-live .performance-stage-actions .performance-fullscreen-button[aria-pressed="true"]{
 background:#455563;border-color:#d5ae77;color:#fff1da;
}
.performance-live .performance-stage-actions .performance-editor-button{border-color:#80705c;background:#322d29;color:#f4dcbf}
.performance-live .performance-stage-actions .app-icon{width:18px;height:18px;flex:0 0 18px}
@media(max-width:1100px){
 .performance-live .performance-stage-actions .performance-stage-action span{display:none}
 .performance-live .performance-stage-actions .performance-stage-action{width:42px;padding:7px!important}
}
@media(max-width:750px){
 .performance-live .performance-topbar-view-switch button{min-height:42px;height:42px}
 .performance-live .performance-stage-actions{padding-left:5px;gap:3px}
}

/* Rehearsal speed is available in both editor and live stage. */
.app-topbar .playback-speed-menu{position:relative;flex:0 0 auto}
.app-topbar .playback-speed-summary{display:inline-flex;gap:4px;align-items:center;justify-content:center;height:42px;min-height:42px;min-width:65px;padding:6px 8px;cursor:pointer;list-style:none;white-space:nowrap;border:1px solid #637686;border-radius:9px;background:#263744;color:#f6dda7;font-weight:800;font-size:13px;font-variant-numeric:tabular-nums}
.app-topbar .playback-speed-summary::-webkit-details-marker{display:none}
.app-topbar .playback-speed-summary .app-icon{width:13px;height:13px;flex:0 0 13px;color:#d0dde7}
.app-topbar .playback-speed-menu[open] .playback-speed-summary{border-color:#e3b77a;background:#364756}
.app-topbar .playback-speed-summary:focus-visible{outline:2px solid #f5d4a0;outline-offset:2px}
.app-topbar .playback-speed-options{min-width:245px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;right:0;left:auto}
.app-topbar .playback-speed-options button{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:0;min-height:52px;padding:5px 6px;border-radius:7px}
.app-topbar .playback-speed-options button strong{font-size:16px}
.app-topbar .playback-speed-options button small{font-size:10px;color:#c9d3db;white-space:nowrap}
.app-topbar .playback-speed-options button.selected{background:#695135;border:1px solid #dfb982}
.app-topbar .playback-speed-note{grid-column:1/-1;font-size:10px;line-height:1.3;color:#c1d2df;margin:3px 1px 0}
@media(max-width:760px){.app-topbar .playback-speed-options{right:-45px}.app-topbar .playback-speed-summary{min-width:61px;padding:5px 6px}}

</style>
