## Section shortcuts and ensemble-aware transposition (2026-11-25)

- Expand Note Editor pitch bounds to include existing imported and adapted notes, even when their stored pitches exceed the sounding instrument range.

- Keep pitch labels and time headers visible while scrolling the note grid; use native two-axis touch scrolling instead of custom horizontal panning.

- Align the five measure-range controls in a compact row, including the section selector, with responsive toolbar grouping.

- Select a whole section from measure-range controls using buttons or a compact dropdown. Manual start-measure changes update the displayed section without automatically selecting its full range.
- Preview the destination key of the opening section for each transposition interval, preserving major or minor mode.
- Choose automatic, whole-part, phrase, individual-note or exact register strategies per instrument. Phrase optimization uses score boundaries, rests and ties, melodic intervals, instrument tessitura and ensemble crossing/unison penalties.
- Updated About to display dated development notes as well as numbered releases. The existing package version remains unchanged; deployed builds retain their commit identifier.
- Build and browser acceptance of these latest changes remain to be verified.

## Structure, keys and adaptive transposition (2026-11-24)

- Organized Structure into Form, Keys, Transpose & Adapt and Ensemble subtabs. Added matching-key section scope and explicit whole-song transposition analysis.
- Added range-aware transposition preview and playback integration, octave corrections and optional accompaniment chord-tone suggestions.
- Added the Hasta Siempre Amor example arrangement.

## Complete score import and instrument practice improvements (2026-11-23)

- Added complete MusicXML song import with independent roster, part previews and section review.
- Added automatic chromatic tuning, live intonation feedback, target-note highlighting and fingerboard feedback.
- Added compact karaoke harmony and optional vocal pitch contour, microphone volume envelope and raw recorded pitch contour.
- Added tango sounding-duration options for practice and recording analysis, improved Learn layout and persistent pizzicato/arco notation.

## Instrument-specific Note Editor capture · phase 1 (2026-11-20)

- Added direct violin finger-trace input on the existing string surface. Holding a note preserves written duration, moving to another fret on the same string can record a portamento **into the final written pitch**, repeated small movements can mark vibrato, and a broad returning sweep can create a tango sirena contour. An explicit Notes/Slide/Vibrato mode and a visible draft marking allow correction when automatic classification is unsuitable.
- Each pointer has its own hold lifecycle, so simultaneous keyboard and string notes can be recorded without one finger releasing the other finger's note; shared sounding pitches share an audio preview voice. Pointer cancellation does not write a note.
- New `approachSlideFrom` and `vibrato` fields persist on protected manual notes, in JSON/edition state and in text annotations in MusicXML/MuseScore export. Existing sirena gestures use the validated gesture model. Selected violin notes expose editable portamento-from and vibrato controls.
- Reused adaptive keyboard auto-fit for any instrument; the full playable instrument range remains available on demand by horizontal scrolling.
- Replaced expanded performance instrument's labelled speed selector with a compact, unlabelled **1×** dropdown matching the normal playback controls and menu contents.
- Added independent classifier/notation regression tests. **iPad Safari multigesture tests and engraving review are still outstanding.** Schematic finger distance is not a calibrated vibrato-rate/depth measurement; detailed vibrato synthesis/editing remains a later investigation.

## Loop-driven dynamics, compact piano and speed menu (2026-11-20)

- Replaced dynamics paint-on-tap with explicit measure selection inside the Note Editor's Start/End loop. Multi-select uses touch toggles, desktop Shift-click, Select loop and Clear selection; no score changes happen on selection.
- Quick dynamics apply to the selected measures and current instrument/role/orchestra scope. Phrase gestures use consecutive selected bars only; unrelated bars are never included. Context menus and exact hairpin endpoint editors remain available.
- Added a conservative crescendo/diminuendo suggestion when explicit dynamics at the selected phrase's endpoints agree on a direction. Suggestions are optional until applied.
- Split the compact performance piano into independent LH/RH views. Each adjusts its pitch span to cover the scored and sounding notes for its hand, retaining colors and the fixed card height.
- Kept the wide workspace topbar on one row, aligned the rehearsal speed control with adjacent buttons, and replaced the four-column speed popup with a Files-style list showing percent and effective BPM.
- Updated regression checks. **Physical iPad Safari QA remains outstanding** for wrapping, keyboard readability, dropdown placement and touch gestures.

## Phrase planner reliability (2026-11-19)

- New manual violin notes inherit reviewed phrase articulation before automatic beat-pattern defaults; explicit measure overrides still win.
- Invalid saved plans display validation and rebuilding controls without crashing the phrase editor. Invalid drafts can still be discarded.
- Explicit planned bandoneon leads take priority over section-follow settings, and linked violin generation follows lead-before-harmony order for reordered rosters. Shared interface role readers reuse the validated phrase map.
- Expanded the phrase CI gate with protected-note/edition preservation, native JSON and ZIP backup round trips, real MusicXML ZIP validation, and actual Vue server-rendering checks for invalid data. Browser/device interaction remains separately unverified.

## Intelligent MusicXML Import & Merge (2026-11-19)

- Replaced division-per-measure fallbacks with a persistent MusicXML timing parser supporting multi-voice and multi-staff OMR exports.
- Added a wide comparison preview with source-measure remapping, local pitch shift, per-measure and section-level Ours/Theirs/Combine choices, and editable protected pitches.
- Added an imported-source-led structure mode, optional chord inference, and high/low evidence indicators. A reversible project backup and source/alignment reference are saved in the portable Tango song.
- Bounded sticky orchestration-row buttons so they no longer overlap measure 1 on iPad.
- Added focused XML import/merge tests to the Azure CI build. Full PlayScore/MuseScore and Safari device checks remain necessary.

## Lead Sheet toolbar refinement (2026-11-19)

- Moved Undo and Redo into the same compact action row as chord preview and Stop, rather than leaving history buttons on their own line.
- Grouped playback and editing-history actions with accessible labels, kept the measure count aligned at the far right, and added deliberate wrapping on narrow screens.
- Preserved existing undo, redo and chord-preview behavior; added a contextual UI regression check.

## Contextual interaction refinement — phrase, rhythm and dynamics (2026-11-19)

- Added compact phrase blocks with contextual draft editing, previous-phrase copying, activity/placement shortcuts and direct Note Editor navigation.
- Added Rhythm Editor attack context actions for accent, onset, duration, split, delete and properties, preserving the separate Apply step.
- Added Dynamics Timeline measure/hairpin context actions for existing dynamic and endpoint editors, with deletion confirmation.
- Shared touch/pen hold gesture handling cancels on scrolling and avoids duplicate click effects; keyboard Menu/Shift+F10 and visible menu buttons are provided.
- Added focused interaction regression tests to CI. Touch and browser GUI acceptance remain outstanding.

## Milestone 4 — Rhythm snapping, visual cues and contextual menus (2026-11-19)

- Added selectable rhythm-preset onset guides and bounded note snapping in standard and focused Note Editor views; original free timing is default.
- Added explicit provenance on notes retimed with a predefined or edited pattern, cues in Note Editor and Performance mode, and selected-note snap/release controls.
- Added instrument-heading context menus through long touch press, desktop right-click, keyboard Shift+F10/Menu and visible more-options access, linking existing note/chord/rhythm/role/difficulty tools.
- Added right-click and keyboard context access for notes and orchestration measure cells.
- Added regression checks in CI for preset quantization, metadata integrity, protections and edition/MusicXML compatibility.
- Actual iPad Safari interaction and MuseScore display remain acceptance checks, not verified.

## Milestone 3 — Editable phrase planning (2026-11-19)

- Added a shared phrase-level orchestration layer with section-aware phrase segmentation and explicit instrument roles/activity/placement.
- Added an Orchestration draft editor that previews active measures, violin/contrabass techniques, and articulation before applying changes.
- Generation now follows the reviewed plan, while per-measure overrides and protected manual notes take priority. Legacy songs remain unchanged without an applied plan.
- Applying or removing a plan refreshes selected editions while leaving independently saved alternative difficulty levels intact, marked stale for review.
- Added targeted CI tests for planning, transitions, edition isolation, MuseScore MusicXML/ZIP output, and persistence.
- Instrument-specific fingering/hand feasibility, advanced double stops, richer contrapuntal harmony and full device/MuseScore testing remain future work.

## Milestone 2 — Independent instrument difficulty editions (2026-11-19)

- Added independently editable Easy, Intermediate and Advanced versions for
  each instrument in the existing portable project, while sharing one song
  form, melody, harmony and tempo.
- Edition switches preserve each variant's note data, gestures and
  protected manual measures, with on-demand generation of missing versions.
- Added instrument edition selectors to the Orchestration and Note Editor
  workspaces, including Focus mode.
- Added a printable ZIP containing the selected mixed-level score and each
  instrument's three MusicXML editions; stale saved alternatives are flagged.
- Targeted regression checks run in CI. MuseScore layout/print and Safari
  touch tests still require device/application verification.

# Tango Arranger — release notes and version history

This file preserves the historical release notes previously included in README.MD. Earlier entries describe the application as it existed at the time; for current behavior see [README.MD](README.MD).

## v5.5.3 - Lyrics export and alignment follow-up

- Multi-measure lyric alignment option in the Note Editor, beginning at the selected measure; syllables and underscore-reserved melisma notes follow chronological note onsets.
- MusicXML exports melisma start, continue, and stop extenders across barlines for both verses, while retaining the original note-level melisma flags.
- MusicXML import recognizes only extender starts as melisma flags; continuation/stop markers are derived from the note sequence on export.
- No full production build or MuseScore visual import verification was possible in this environment; dependency installation and manual verification remain required.

## v5.5.0 — Dynamic orchestra roster and El Choclo in 4/4 (2026-11-15)

- The factory roster remains Piano, Contrabass, Violin I, Violin II, Bandoneon I, Bandoneon II and Voice. Songs may now store an optional custom `instruments` array; legacy `.tango` projects without this field continue to use the factory roster.
- Orchestration → Orchestra roster supports adding numbered Violin, Bandoneon and Voice parts, reordering and removing parts. Roster presets can be named, saved, loaded and deleted in browser local storage; any current roster can be set as the default for newly created songs. Existing songs retain their own roster.
- Additional Voice parts with the Harmony role follow the active Voice melody line in rhythm and receive chord-tone harmony pitches. Protected manually edited measures remain unchanged on regeneration. The original Voice remains silent by default until assigned an active role.
- MusicXML now enumerates the project's active roster, including additional violin and vocal parts.
- El Choclo now merges the source's 64 2/4 measures into 32 4/4 measures, retaining source melodic timing and harmony changes and regenerating the orchestration with the current engine. It remains a study from the supplied earlier ABC transcription, not an authenticated historical edition; pickups and repeats remain simplified.
- Added dynamic-roster and 4/4 example tests. Full browser build and MuseScore visual validation remain pending where npm dependencies cannot be installed.

## v5.0.0 · Contextual Lead Sheet and score consolidation (2026-11-15)

- Lead Sheet measure-heading selection opens a full-width inline melody editor immediately following the selected measure in the section grid; chord fields retain uninterrupted keyboard navigation and are not forced to open the melody editor.
- Each section header is a selectable control with Copy chords; select the destination header's Paste into action to request confirmation. Copying retains the established harmony-only behavior and safeguards for different section lengths and overwrites.
- The Score Review tab is removed; its per-instrument note events, protected-measure checkboxes and edit-note shortcuts are preserved in the collapsed Score details panel in Orchestration. MusicXML export remains in Files.
- The Note Inspector now appears below the piano roll in regular mode; Focus mode and long-press note-property popup remain unchanged.
- Existing three-document project convention and Vite port 8000 are retained.

## v4.9.0 — grouped top bar and El Choclo example

- Remove the redundant “Arrange your tango” heading; Generate now lives in the global toolbar.
- Toolbar order: playback (beginning/selected/stop, audio-test menu), song picker and New/Save/duplicate/delete, Generate, Files (import/MusicXML export/.tango backup), selected-song Settings, View options. Topic-specific menus replace the generic ellipsis.
- Song picker offers **El Choclo — orchestral study (new copy)** as a separate, editable local song. Selecting the example does not replace or modify an existing song.
- The example is based on the **previously supplied John Chambers (2005) ABC transcription study**: 64 measures in 2/4, simplified A/B/A/B/C structure, chords and melody retained. Current arranging features are applied: section keys, roles, section-specific violin/bandoneon/bass techniques, piano figures, articulation, expression, dynamic ranges, melody ducking, and generated orchestral parts. The generated orchestration is modern application output, **not a historical transcription**; the source's pickups, repeats and final cadence remain simplified.
- Provenance: https://abcnotation.com/tunePage?a=trillian.mit.edu%2F~jc%2Fmusic%2Fabc%2FFinland%2FOI20181020%2F0002 ; historical 1913 score: https://www.loc.gov/item/2016782583/ .

## v4.5.0 — Focus view navigation and range controls

- Focus editor action is visible at the top-right of the ordinary Note Editor heading.
- Lowest/Highest note selectors control the pitch range displayed in the note grid, including both piano staves; this is independent of live capture keyboard range.
- Focus view shows the measure range chosen by Loop from / To as a scrollable note overview. Click any measure to make it the editable measure below. Playback loops the same measure range.
- Only the selected measure is directly draggable/resizable; the phrase overview is navigational and does not allow dragging across measure boundaries.

## v4.4.0 — Focused Note Editor (14 November 2026)

The Instrument Note Editor now offers a full-viewport **Focus editor** mode. The sticky top bar keeps previous/next measure, instrument-loop playback and optional loop-from/loop-to measure controls within reach. The bottom quick editor keeps the selected note’s timing, written duration, articulation and deletion accessible; **All note properties** reveals the complete form. Escape exits focus mode before leaving the Note Editor. The normal Notes, Live Input, Figures and Dynamics tabs remain unchanged outside focus mode. The focused loop plays only the current instrument across the selected measure range; navigating to another measure stops playback, while preserving the loop range in focus mode. This is a CSS full-viewport workspace, not the browser Fullscreen API.

# Tango Arranger v4.3.3 — Notation-correct tango articulation

Staccato and marcato affect **how long a note sounds**, not its **written rhythmic value**. New articulated notes default to a quarter note (one beat) in the Note Editor; selecting an explicit eighth, sixteenth or other rhythmic value still overrides the default. A note at the end of a measure is capped to the available space. Existing saved notes are not rewritten.

MusicXML exports **staccato** as a dot (`<staccato/>`) for unaccented attacks and **accented staccato/marcato** as a horizontal `>` (`<accent/>`). The previous strong-accent wedge and combined wedge-plus-dot for marcato are no longer emitted. The original playback gate values (including very short violin staccato) and accent velocities remain unchanged; MuseScore receives the full written note value. Older projects containing notes previously entered with short written durations retain those values and can be corrected in the Note Editor if needed. Browser and MuseScore rendering still require manual verification.

# Tango Arranger v4.3.1 — Half-beat note placement

The Note Editor always starts at a sixteenth-note (0.25 beat) snap grid, independently of instrument difficulty. A half-beat offset is therefore available for every instrument. Beat headers show sixteenth subdivisions, the two resize grips are narrower to keep a usable center drag target on short notes, and selected-note controls include explicit half-beat nudges. Notes remain constrained to the current measure and protected edits persist through regeneration and MusicXML export. Browser touch interaction remains unverified.

# Tango Arranger v4.3.0 — Collapsible controls and instrument editor tabs

The Instrument Note Editor now groups Notes & Properties, Live Input, Figures, and Dynamics & Expression into tabs. Shared instrument selection, measure selection, previous/next navigation and measure loop controls remain above the tabs. Control panels in the song workspaces and sidebar can be expanded/collapsed using native disclosure headings; note-entry settings and selected note properties are also foldable. The note grid is visible by default. Tab changes do not alter song data.

# Tango Arranger v4.2.0 — Move and resize notes from either edge

The Note Editor supports dragging a note horizontally to change its onset, vertically to change pitch, and diagonally to change both. Dragging the left resize grip changes the start while preserving the original end; dragging the right grip changes the end while preserving the start. Dragging is snapped to the current grid resolution and clamped to measure boundaries. Changes save to protected instrument-measures, survive regeneration and are exported as MusicXML.

## v4.1.1 — Azure TypeScript build fix

MusicXML note event projection explicitly retains the optional `subito` property used for per-note dynamics. Added a regression check to prevent TS2339 from returning. No change to arrangement behavior.

## v4.1.0 — Contrabass style options

Contrabass now has section and per-measure playing-style settings: traditional, pizzicato, arco legato, marcato, walking, and habanera. Styles affect generated rhythm, note length, articulation, and MusicXML technique markings where applicable. Settings persist in `.tango` projects, and protected manual measures are retained. The existing traditional bass pattern remains the default for older projects.

## v4.0.0 — Configurable live melody keyboard (2026-11-14)

The Note Editor live-capture keyboard now has independent **Start note** and **End note** selectors, with all semitones in the selected instrument register available. The inclusive range can be a single note, part of an octave, or multiple octaves. The keyboard scrolls horizontally for wide spans and uses full-size touch targets. The selected pitch dropdown follows the displayed range; if either endpoint excludes its former pitch, the selected pitch is clamped to the nearest displayed key. Recorded draft taps are preserved when changing the keyboard display range. Opening a different instrument defaults the keyboard to the octave containing the initial note. This affects only the live-input keyboard, not the instrument range, note-editor pitch grid, or previously captured notes.

## v3.9.0 — Playback from beginning or selected measure

The sticky playback bar now has **From beginning**, **From measure N**, and **Stop** controls. The selected measure is the same measure highlighted in Song Overview or chosen in the lead-sheet and note editors. Either start button restarts playback from its chosen position, including while another playback mode is active. Notes with attacks before the selected measure are not replayed; all remaining events are scheduled relative to that measure, and playback ends at the song end. The note and rhythm loop controls remain independent.

# Tango Arranger v3.8 — Live tap recording

## Current release (v3.8.0)

Both editors offer a full-arrangement loop for one measure or a range, with optional metronome and configurable input latency. The Rhythm Editor has a large tap pad and a per-measure draft preview; captured measures can be loaded into the editable rhythm grid, modified, and saved back to the take before applying to selected parts. The Note Editor adds a one-octave on-screen piano keyboard: tapping a key while recording captures its pitch and quantized onset; the rhythm pad uses the selected pitch. Captured notes replace only the recorded instrument-measures after explicit confirmation, and remain editable/protected. This is touch or keyboard input, not microphone or MIDI capture.

# Tango Arranger v3.7 — Keyboard shortcuts for note and rhythm editing

## v3.7.0

Keyboard editing: in the Note Editor or Rhythm Editor, select a note/attack and press Delete or Backspace to remove it. Left/Right arrows move selection, +/- change duration in 0.25-beat steps, and L toggles the respective loop. Note Editor also supports Up/Down to transpose the selected note by one semitone, [ and ] to navigate measures, and Escape to return to the map (or close note properties). Rhythm Editor supports A to toggle accent, S to split an attack, and Escape to deselect. Shortcuts are ignored in inputs, textareas, selects and contenteditable fields and when Ctrl/Alt/Meta is held (Shift is ignored except for the usual Shift+= plus key). Space toggles looping only when a native button is not focused, preserving Space-to-activate accessibility. Deleting a note keeps its instrument-measure protected; deleting a rhythm attack only changes the working pattern until Apply is pressed.


**Violin duet:** In Orchestration, set **Violin I → Melody** and **Violin II → Harmony**. The harmony follows Violin I's sounding pitches and onset/duration positions, including protected manual edits, using chord tones below the melody. Changes to section roles regenerate unprotected parts immediately. The Song Overview measure-role editor also supports these combinations.

**Manual rhythm:** Open **5 · Rhythm editor**. Select a preset and reference instrument to fill the sixteenth-note grid. Select an attack to change its onset, duration or accent; drag its right edge, split it, delete it, or click an empty grid step to add a new attack. Gaps are rests. Press **Loop edited rhythm** to hear click accents or retimed notes from a selected instrument/measure. Select target parts and measure scope, then press **Apply edited rhythm to selected parts**. Existing protected edits are skipped unless overwrite is explicitly confirmed. Applied rhythm is saved as protected note events; the unsaved grid pattern itself is an editor buffer.

**Known limitation:** Full Vue production compilation, browser touch interaction, and actual MuseScore import were not verified in this environment because npm registry access was unavailable. Domain TypeScript and automated regression tests passed.

---

# Tango Arranger v3.3 — Free chord editing, duration controls and section-key transposition

## Lead Sheet chords

Chord fields accept freely typed symbols, including comma-separated sequences such as `C,C`, `Dm,A7`, `G7/B`, and `Cmaj7/G`. The suggestion list is **optional**: tap **Suggestions** to see completions for the chord at the caret, then explicitly select one. Merely typing does not force a selection. If the parser rejects an unfinished symbol on blur or Enter, the unsaved draft stays visible for correction instead of reverting silently. Only valid chord sequences are committed to the arrangement. Enter and Tab still support keyboard navigation.

## Note Editor duration

The selected note's **written duration** has separate `−` / `+`, slider, numeric entry and **Apply** controls. Numeric edits are committed on Change, Enter or Apply rather than on every intermediate keystroke. The duration bar's width is proportional to the actual saved duration and is keyed by that duration to force a fresh render; a second proportional preview and the saved duration label provide immediate independent feedback. The maximum is constrained by the note's start position and the end of the measure; it is not a sounding-length/gate control. Touch resize still needs testing in a real browser; source-level and domain tests cannot establish that every device behaves correctly.

## Changing a section key

Selecting a new key opens a decision dialog with three operations: **key signature only**, **transpose section chords**, or **transpose section chords and lead melody**. The latter also transposes protected instrument notes in the section, rejecting out-of-range notes without applying a partial change. Unprotected generated parts are regenerated from the new harmony. All other sections are left untouched. Chord qualities, inversions and comma slot positions are preserved. The spelling favors flats or sharps according to the destination key. A major/minor mode change on the same tonic is **not** automatic reharmonization; its chord qualities remain unchanged. The global arrangement transpose setting is unaffected.

**Verification:** automated tests cover section-local transposition, slash chords, protected notes, invalid keys, optional chord suggestions and duration-control wiring. Full Vue/Vite build, touchscreen interactions and MuseScore rendering remain to be verified in the deployed environment.

---

# Tango Arranger v3.2 — Rhythm Editor

The new **5 · Rhythm editor** tab offers fourteen templates (seven rhythmic figures and seven named orchestra-profile variants): Current orchestra style, Marcato en cuatro, Marcato en dos, Síncopa, 3–3–2, Habanera-inspired and Offbeat chords. Preview accents in a beat diagram. Choose the rhythm section (Piano, Contrabass, Bandoneon I/II), all parts, or any custom instrument selection. Apply to a measure range, one section or the whole song. You can apply onset/duration/accent changes or just accents/articulation while retaining original timing.

The editor preserves the original pitches, chord voicings, piano register split, and per-note gestures. Existing simultaneous chord notes stay together. Silent measures are skipped rather than inventing notes; melody/voice selections require confirmation. Protected instrument-measures are skipped by default; overriding them requires a separate opt-in and confirmation. Applied results are protected manual note edits, persist in local autosave and `.tango` archives, survive orchestral regeneration and export to MusicXML. The patterns are simple editable rhythmic templates, not transcriptions of historic orchestra recordings. For 2/4 and 3/4, the reference pattern scales across the bar; this is a pragmatic approximation, not a musicological meter conversion.

**Caution:** Replacing a rhythm changes onsets and written durations. It does not perform harmonic re-voicing when chords change within the bar; review the resulting notes if a measure has multiple harmonies. Browser UI, real audio and MuseScore rendering require deployment verification.

## v2.6.2 — Browser audio activation / Azure playback

The application no longer imports Tone.js during initial page load. Some browsers warn that a Web Audio `AudioContext` was started without a user gesture even when the app has not requested playback. On the first Play, measure-loop or note-audition action, `src/toneSession.ts` synchronously creates/resumes a native `AudioContext` during the user's gesture, dynamically loads Tone.js, and assigns that already-resumed context to Tone. This also supports the expressive-note audition path. Browser autoplay policies still apply: the user must click Play or a note before audio can start; a site cannot silently unlock audio. Actual deployed-browser testing is required to verify whether warnings are eliminated in each browser. The workflow and Azure Static Web Apps configuration do not need changing.

## v2.6.1 — Azure build TypeScript hotfix

Corrected the full-score Tone.js playback call in `src/App.vue` to pass `Tone.Frequency(event.pitch, 'midi').toFrequency()` to `PolySynth.triggerAttackRelease`. The previous `FrequencyClass<number>` object failed `vue-tsc` (TS2345) on line 442. The measure loop and note audition already used `.toFrequency()`. Package version is 2.6.1; the UI reads it from `package.json`. The full Vue production build remains unverified in this environment because npm dependencies could not be installed.

## v2.6 — Rhythmic notation, piano registers and UI version

The app header displays the version from `package.json` rather than a hard-coded 2.0 label. Generated piano accompaniment uses monophonic bass notes below the configurable split (bass clef) and the chosen upper figure above it (treble clef). Contrabass and bandoneon use conventional written durations with playback gates for short articulation. Existing imported or manually edited notes retain their explicit written durations. The sample user MusicXML was used for diagnostic analysis, not bundled with the app.

# Tango Arranger v2.5

Local-first experimental tango orchestration workbench built with Vue 3, TypeScript, Vite and Tone.js. Enter or import a single lead-sheet melody, specify harmony and sectional roles, generate a six-part **orquesta típica** score (piano, contrabass, two violins, two bandoneons; optional voice), and export MusicXML for editing in MuseScore.

**Status:** prototype. The algorithm is style-informed, but is **not** a transcription of a historic orchestra or a validated replacement for a professional arranger. No automatic acceptance in MuseScore 4 can be claimed until an actual MuseScore 4 import test passes. See `PROJECT-BOARD.MD`.

## Wide workspace, piano figures and expression (v2.5)

The application now uses the full available browser width rather than a 1500px centered layout. Song Overview retains a horizontal instrument-by-measure map with a side editing panel; the Piano Note Editor can display its upper and lower registers side by side on very wide screens (1700px+), with horizontal scrolling within each grid.

**Piano accompaniment:** For a section where Piano has the **Chords** role, select a figure in **Song Overview** or **Orchestration**: single notes ascending/descending, moving chord inversions ascending/descending, countermelody, or melody response. Chord inversion figures add independent bass pulses in the lower piano register, and the upper part moves through chord tones and inversions with optional octave displacement. These are deterministic style-informed *starting points*, not verified transcriptions of historical Argentine piano arrangements. The selected section pattern and variation are saved in the project. The generator retains manually protected instrument-measures.

**Figure workbench:** In the Note Editor, choose any of the six figures for the selected instrument-measure, apply it, or cycle to another variation. Chord changes within the measure are honored. The figure replaces **only that instrument-measure** and protects it from later orchestral regeneration; the first replacement of an existing manually protected measure requires confirmation. Counters and responses use the lead-sheet melody when available; otherwise they use a simple fallback. Counterpoint quality, fingering and historical idiom remain areas for improvement.

**Note gestures:** Non-piano, non-pizzicato notes can specify a **slide-to MIDI pitch** and **swell-to velocity**. The native Web Audio preview and playback interpolate pitch and amplitude over the note's sounding duration; the written rhythmic duration is unchanged. These properties persist in local autosave and `.tango` projects. MusicXML currently exports *text indications* (e.g. `gliss. to G5`, `cresc. to velocity 110`) for these single-note gestures, **not a guaranteed MuseScore glissando line or precise velocity envelope**. Piano and pizzicato notes cannot receive sustained slides/swells.

**Expression across measures:** In the Note Editor, create instrument-specific crescendo/decrescendo ranges by selecting start/end measures, optional beats within those measures, and start/end intensities (80 = neutral). The browser playback applies a gradual velocity offset while preserving individual note accents; the MusicXML exporter adds standard hairpin wedges at the range boundaries. These can span multiple measures and sections. Restructuring the song clears expression ranges because their absolute measure positions are no longer reliable; the app warns before applying such a change. The older section-wide crescendo option remains available.

**Verification:** the regression suite includes 16 additional figure/expression checks and MusicXML duration validation; domain, loop and Web Audio modules pass TypeScript checking. The Vue production build, browser playback and actual MuseScore 4 import remain unverified in this environment.

## Whole-measure violin arpeggios (v2.4)

For a violin with the **Chords** role and the **Arpeggio** or **Pizzicato arpeggio** technique, the generator now plays **exactly four single notes over one complete measure**, not a small arpeggio repeated on every beat. In 4/4 these are four quarter-note events at beats 1–4; in 2/4 they are four eighth-note events; in 3/4 they are four equal subdivisions of the bar. For a D-minor triad the rising figure is D–F–A–D (octave) and the falling figure is D–A–F–D (starting at the higher D). Seventh chords use root, third, fifth and seventh rather than repeating the root.

In **Orchestration → Violin chord accompaniment**, each violin has a **direction** setting: **Up**, **Down**, or **Alternate each measure** (default). The direction is measured across the full bar, and alternating starts with Up at the beginning of each section. For measures with comma-separated chords, each note uses the chord active at its own onset; the four-note total remains unchanged. The setting is stored in `.tango` projects and retained when resizing sections. A per-measure violin technique override still selects arpeggio or pizzicato arpeggio, using the section's direction.

**Pizzicato arpeggio** uses plucked notes and a short 22% sounding gate; bowed arpeggio uses arco. Notes remain editable and audible in the Note Editor, and their four written durations are exported to MusicXML. This is a simple register-aware arpeggio heuristic, not an optimized fingering model; actual MuseScore display and browser audio require verification.

## Dedicated structure and keys workspace (v2.3)

At the time of v2.3 the application opened in **1 · Song overview**, the primary measure-level orchestration workspace (superseded by later navigation changes). **2 · Structure & keys** is a separate tab for changing section count, measure lengths, and concert-pitch major/minor key signatures. The structure tab preserves the existing confirmation and reset behavior when resizing measures, and the same MusicXML rehearsal marks and section key changes continue to export. Changing a key does not transpose existing pitches or chords.

The Song Overview no longer contains the two large structure/key editors. Instead it displays a compact read-only section strip with **letter, key, and measure range**, plus **Edit structure & keys** to jump to the dedicated tab. The instrument-by-measure map and range editor are placed together in a responsive workspace: on wider screens, the range editor stays in a right-hand panel beside the horizontally scrollable map; on narrower screens, it stacks below the map. Double-click/Enter-to-edit notes, inline chords, section/whole-song role overrides, and local autosave are unchanged. The Lead Sheet still displays editable section keys for convenience when composing harmony.

**Verification:** new navigation checks assert tab separation, default overview, structure editing isolation, and the map/editor workspace. Browser layout and full Vue production build still require verification on a machine with npm dependencies.

## Violin tango chord accompaniment (v2.2)

When **Violin I** or **Violin II** has the **Chords** role, the new **Tango staccato** and **Pizzicato** techniques generate **one note on every beat**, not a three-note chord or arpeggio. Each note is selected from the harmony active at that beat, including comma-separated mid-measure changes. Written notes occupy one beat, while synthesized playback is much shorter: unaccented tango staccato uses a **16% sounding gate**, unaccented pizzicato **22%**, and marcato **58%** plus a stronger attack. These are editable heuristics rather than empirically calibrated tango performance timings. Articulations are exported to MusicXML as dots and marcato wedges; exact gate percentages remain local to `.tango` and browser playback.

In **Orchestration → Violin chord accompaniment**, choose Tango staccato or Pizzicato for each violin, and optionally set **Marcato beats** per section using comma-separated, one-based beat numbers (e.g. `1,3`, or `2,4`; empty means no marcato). The selected style profile provides initial accent beats; these are **arranging defaults, not fixed rules or transcriptions of the named composer**. The Song Overview shows the technique and marcato beat positions. In the Note Editor, new violin chord notes inherit the technique and per-beat articulation; existing notes can still be edited individually. An explicit measure-level articulation override takes precedence over the generated beat pattern. Existing arpeggio, double-stop, sustained, and block techniques remain available by choice.

Changing violin technique or section marcato beats refreshes generated notes while merging protected manual measures. Older `.tango` projects retain their saved violin techniques; newly created projects use the new chord-accompaniment defaults. Dedicated regression tests cover note density, beat placement, meter, mid-measure chord changes, accent profiles and overrides, editor suggestions, MusicXML, and structural changes. Actual browser audio and MuseScore 4 interpretation remain to be verified.

## Piano grand staff and comma-safe harmony editing (v2.1)

**Piano note editor:** selecting **Piano** in **6 · Note editor** now displays two independently scrollable piano rolls for the **upper (treble)** and **lower (bass)** registers. Both edit the same Piano instrument-measure, so notes in both rolls sound together in the existing measure loop and remain protected from regeneration. Use separate octave buttons to navigate each register. A **Split between piano staves** setting (default middle C, MIDI 60) changes which roll and exported staff receives each pitch. The split is saved in local autosave and `.tango` projects; older projects use the default. This is a pitch/register-based split, not a hand-fingering or voice-leading inference: move the split to accommodate left-hand chords higher in the register.

**MuseScore / MusicXML:** Piano now exports as a **single two-staff piano part** with numbered treble and bass clefs, voice 1 on staff 1, voice 2 on staff 2, and a MusicXML `<backup>` between the two full-measure rhythmic streams. Bass notes and upper chords can therefore sound simultaneously without the previous single-clef or collapsed-voice layout. Empty sections of each staff are represented by timed rests. Section key signatures, rehearsal marks, articulations and written durations remain in the export. The split threshold follows the score's global transposition so staff membership is stable when transposing. Real MuseScore 4 visual import and engraving quality still need verification.

**Lead Sheet chord input:** autocomplete is **non-destructive** and affects only the comma-separated chord at the cursor. `C,C`, `C,G` and `C,C,C,G` are valid in 4/4, including repeated chord slots. The input is no longer committed on each native `change` event; it is validated and saved on **Enter**, **Tab**, **Shift+Tab**, or when focus leaves the field. Click a suggestion to replace only the active chord token, then continue typing a comma and the next chord. An unfinished token such as `C,` is allowed while typing, but cannot be saved until completed. The existing section-aware chord copying and inline Song Overview harmony editing are unchanged.

**Verification:** dedicated regression tests cover independent piano voices and measure timing, configurable staff split, transposition, repeated chord tokens, and deferred Lead Sheet commit. The XML was parsed with a standard XML parser; a full Vue production build and actual MuseScore import remain unverified in this environment.

## Live measure loop in the Note Editor (v2.0)

Open **6 · Note editor**, select an instrument and measure, then click **▶ Loop this instrument measure**. The editor repeats exactly the current instrument's measure, at the song tempo, without starting the entire orchestra. Click **■ Stop measure loop** or press **L** (when not typing in an input) to stop/start. The active beat is highlighted in the piano roll. Individual click-to-hear audition remains independently switchable.

- Playback respects **global transposition**, note velocity, staccato/marcato attack and the **sounding-length gate**. Written MusicXML durations remain unchanged. Notes sounding beyond the measure are cut off at the loop boundary.
- **Edits made while looping are heard on the next repetition**, because the current notes are read at the beginning of every pass. Empty measures loop silently, providing a rhythmic timing reference via the beat highlight.
- Navigating to another measure, instrument, song or tab stops the loop. Full-arrangement playback and measure looping are mutually exclusive, preventing duplicate transport schedules. The app releases voices and cancels transport events on stop or unmount.
- Audio is synthesized with Tone.js and requires a browser user gesture; it is not authentic instrument sampling. The full browser audio experience is not yet verified in this environment.

**Verification:** Eight new self-contained measure-loop checks cover timing, instrument/measure filtering, articulation gates, velocity, transposition, boundary clipping and UI integration. Run `npm run test:regression` for all test suites.

## Tango articulation and note editing (v1.9)

The **Instrument Note Editor** offers an articulation selector for **every instrument**, including piano and contrabass. Choose the default articulation for newly clicked notes, or select any note event to change its articulation, base velocity, or **sounding length (%)**. A new note is selected automatically so you can edit it immediately. Editing articulation or sounding length auditions the new sound. These settings are saved in the `.tango` project and protected from regeneration.

The note's **written duration remains unchanged** when you select an articulation. Synthesized playback uses these editable defaults: tango **staccato** = 28% of written duration, **marcato** = 58% plus a stronger attack (+14 MIDI velocity units, capped at 127), **legato** = 94%. Unmarked notes use 90%. These are adjustable performance heuristics, not exact universal timing standards. For a single note, setting a sounding-length percentage overrides the articulation's default gate; changing articulation retains an existing manual gate override.

MusicXML exports a staccato **dot** (`<staccato/>`) and a marcato **wedge** (`<strong-accent type="up"/>`), with the dot also applied to the combined tango marcato-staccato articulation. The MusicXML note/rest durations stay rhythmic values; the app's precise playback-gate percentage is not directly represented in standard MusicXML, so MuseScore may interpret playback lengths differently. The app's synthesis remains a simple approximation, not a sampled tango orchestra. Existing saved projects load without needing a migration; regenerate unprotected measures to apply the new default articulation behavior to old generated scores.

---

## New in v0.7: multiple chords per measure

- **Chord editor in Song Overview:** click a measure's numbered chord heading to edit its harmonic progression; clicking an instrument's row heading opens the same editor for the currently focused measure. The chord progression belongs to the measure, not to an individual instrument.
- **Lead Sheet:** click a measure tile or its chord button to open the same editor. Input accepts comma-separated chord symbols and shows the chord on each beat before saving.
- **Examples in 4/4:** `D` holds D for all four beats; `D,G` assigns D to beats 1–2 and G to 3–4; `D,D,D,G` changes to G on beat 4. Up to four comma-separated slots are supported in 4/4. A three-symbol entry begins at beats 1, 2 and 3; for unambiguous timing use four slots.
- **Generation:** chord voicings, bass and harmonic parts follow the active harmony at each beat, while melodic roles retain their independent line. Editing a chord invalidates the cached generated score; explicit protected imports are still preserved when using **Generate orchestra**.
- **MusicXML:** harmony changes are emitted with MusicXML harmony offsets, in divisions. Global transpose applies to every symbol. The importer reads beat-aligned harmony offsets from the first part and reconstructs the sequence where representable.
- **2/4 → 4/4:** joining two bars with different harmonies now preserves both symbols instead of refusing conversion.

**Limits:** Chord changes are quarter-beat-aligned, not arbitrary fractions of a beat. The MusicXML importer is a prototype; unusual imported voices and harmony offsets still require real-world round-trip tests. MuseScore 4 import is not yet verified in this environment.

**Documentation policy:** only `README.MD`, `PROJECT-GOALS.MD` and `PROJECT-BOARD.MD` are documentation files in the source ZIP.

## v1.1 — Blank song setup

**New blank song** now offers one editable measure count per section before creation, defaulting to A–E at 16 measures each. Changing the section count adds or removes individual section-length fields while preserving the remaining lengths. An optional **Apply to all sections** action sets a uniform length; the total updates live. Limits are 1–26 sections, 1–128 measures each and 512 measures overall. The resulting A/B/C… rehearsal marks and per-section keys are retained in MusicXML export.

## v1.3 — Guided instrument note editor

Open **Note editor**, or double-click an instrument-measure in **Orchestration**. The collapsible **Score details** panel in Orchestration also provides an **Edit notes** button for each part. Select the instrument and measure, then click a piano-roll cell to add/remove a note. Change the grid resolution (quarter/eighth/sixteenth), default duration, pitch register and suggestion filter. The note list below the grid supports individual pitch, onset, duration, velocity, articulation and violin technique changes. The editor works on blank songs as well as generated scores.

The panel displays the instrument's **effective measure role**, difficulty, activity, dynamic, articulation and violin technique; the section's major/minor key and instrument range; and the chord active at each grid column (including mid-measure changes). **Follow role** suggests chord tones for bass/chord/harmony roles, or section-key tones for melodic roles. **In section key** uses major or *natural minor* pitch classes; **All chromatic pitches** allows any note within the instrument's supported MIDI range. These are editing aids, **not automatic voice-leading, counterpoint or fingering validation**. Existing out-of-filter notes remain removable.

Manual changes replace exactly one instrument-measure in both the visible score and the protected edit store. **Generate orchestra** retains the protected measure while regenerating other measures. **Restore generated measure** removes protection for just that instrument-measure and recalculates its generated notes. Empty protected measures stay silent. Manual notes are persisted in `.tango` and exported to MusicXML; global transposition is applied only during playback/export, not to the stored source pitches.

**Verification:** 56 standalone regression checks pass, including role/key/chord guidance, per-measure protection, empty-measure edits, restoring generated notes and MusicXML duration checks. A full Vue production build and actual MuseScore 4 import remain unverified in this environment because the npm dependencies were unavailable.


## v1.3: section-aware inline lead-sheet harmony

The Lead Sheet groups measures into labeled sections with key signatures and measure ranges. Section keys can be edited in their headers without changing pitches. Each measure has an inline chord-sequence input (Enter or blur to commit; Escape to discard); a measure-number button selects the melody editor. The Song Overview measure headers also expose inline chord inputs, while the expanded harmony editor remains available. Invalid chord sequences are rejected without changing the project.


## v1.4: Copy chords between sections

In v1.4, the Lead Sheet had a **Copy section chords** panel with source and destination selectors and an explicit overwrite confirmation. In v5.0 this was replaced with **Copy chords** on the source section header followed by selecting the destination section header. It copies the complete chord sequence (including multiple chords per measure and empty measures) by measure position, leaving melody, section keys, instrument roles, manually edited notes, and protection flags untouched. When section lengths differ, only the first `min(source measures, destination measures)` measures are copied; extra destination measures remain unchanged. Generated accompaniment is refreshed after a change while protected manual notes are retained. Source chord strings are validated before any change. The operation is reversible by re-entering harmony or loading an earlier `.tango` save; there is no general undo stack.

## v1.5: automatic local saves, multiple songs, and note audition

- **Autosave:** The app creates an IndexedDB song record on first launch, saves edits after approximately 650 ms of inactivity, and flushes pending edits when switching songs, creating a new song, or importing a `.tango` project. Status is visible in the sidebar. There is also **Save now**. A browser must permit IndexedDB; otherwise the UI reports that autosave is unavailable and portable `.tango` export remains possible.
- **Local library:** The sidebar lists locally saved songs with title, number of measures, and last saved time. Opening a song restores its chords, melody, orchestration, keys, manual note edits and protected measures. The last opened song is restored on reload. **Duplicate song** creates a separate record. **Delete song** requires confirmation and deletes only the selected record. Multiple songs may share the same title, including `Untitled Tango`, because records use stable IDs.
- **No cloud sync:** Browser-local storage is scoped to the current origin and browser profile. Clearing site data, using private browsing, or moving to another device can remove access to these songs. Use **Export .tango backup** regularly and keep those files somewhere durable. A different port/origin has a separate library.
- **Note audition:** In **6 · Note editor**, click a piano-roll cell to hear the corresponding pitch while adding or removing a note. Click a pitch label or an existing note chip to hear it again. **Hear notes when clicked** is enabled by default and can be turned off. A short Tone.js synthesized tone is used; its pitch reflects the current global transposition. The browser may require a click to unlock audio. This is a pitch preview, not an authentic instrument sample.
- **Verification:** Generator/MusicXML regression suite and simulated IndexedDB CRUD tests. A complete Vue build, actual browser persistence test, audio device test, and MuseScore 4 import still need local verification.


## v1.6: Bandoneon I defaults and lead-sheet chord keyboard workflow

- New songs default **Bandoneon I** to follow **Violin II**, using the `adapt` method, in every section. **Bandoneon II** retains its existing independent/section-specific orchestration. Existing saved songs keep their explicit follow settings. Change following under Orchestration → Bandoneon following.
- In Lead Sheet, **Enter** validates/saves the chord sequence and focuses the next measure's chord field, including across section boundaries. **Tab** and **Shift+Tab** move directly among chord inputs (native tab behavior resumes at the grid edges). Invalid entries are rejected and the previous harmony is restored.
- A contextual chord-completion menu appears when typing a chord root. Arrow keys navigate suggestions; Enter accepts a highlighted suggestion; clicking a suggestion inserts it without moving to another measure. The completion replaces only the comma-delimited chord under the caret, preserving other chord slots.
- Diminished chord syntax: `Ddim` or `D°` (diminished triad), `Ddim7` or `D°7` (fully diminished seventh), `Dm7b5` or `Dø7` (half-diminished seventh). The chord-tone generator distinguishes these pitch-class sets.
- This is a keyboard-first entry aid, not an exhaustive jazz-chord grammar or spell-checker for arbitrary extensions.

## v1.7: Direct note editing and navigation shortcuts

- **Song Overview:** a single click on an instrument/measure cell still selects its role, articulation and technique overrides. **Double-click** that cell, or focus it with the keyboard and press **Enter**, to open the Note Editor at that exact instrument and measure. **Space** on a focused cell retains the single-click selection behavior. The map cells expose descriptive accessible labels and tooltips.
- **Note Editor:** **Previous measure** and **Next measure** buttons move within the same instrument; the buttons are disabled at song boundaries. When not typing in an input, select or textarea, **[** and **]** move one measure backward/forward, and **Escape** returns to the Song Overview with the original instrument/measure selected and focused. Keyboard shortcuts are disabled while entering note properties so they do not interfere with typing.
- **Orchestration → Score details (since v5.0):** double-click an instrument's displayed note list to open that instrument and measure in the Note Editor. The existing explicit **Edit notes** button remains available.
- **Lead Sheet:** double-click a measure number to select it and focus its **Melody notes** text editor. Since v5.0, a single click toggles the contextual measure editor immediately below the selected card. Harmony input shortcuts and completion behavior are unchanged.
- These navigation actions do not change project data, autosave or manual-measure protection. Only actual note or setting edits modify the song.

**Verification:** the existing 71 generator/MusicXML checks, 6 local-library/audition checks, and 8 navigation/source-integrity checks pass (85 total). The navigation suite includes a TypeScript parse of the Vue `<script setup>` content; it is not a full Vue template compilation or interactive browser test. The production build, keyboard/mouse interactions in a browser, and actual MuseScore 4 import remain unverified without installed npm dependencies.

## v1.8: Chromatic note entry without harmonic restrictions

- Every pitch/beat cell within the instrument's supported register can be clicked, regardless of the chord, section key, instrument role, or difficulty. Clicking a cell adds/removes the note and auditions its pitch (if enabled). Instrument-range and measure-duration validation remain active.
- Piano-roll colors are informational: **chord tone**, **other section-key tone**, or **chromatic tone**. Classification updates at intra-measure chord changes. The selected note is still protected from orchestral regeneration and included in MusicXML.
- The **Pitch labels** control offers **Follow key signature**, **Use sharps**, or **Use flats**. For example, D♯4 and E♭4 denote the same MIDI pitch. This is an editor display preference, not an explicit enharmonic override in the saved note; MusicXML continues to choose note spelling from the section key.
- The grid covers a scrolling 18-semitone window. Use the octave buttons to reach the rest of the instrument's supported range. Chromatic notes outside that range are still rejected.
- Regression coverage includes out-of-chord melody and bass notes, manual-note persistence, MusicXML duration validity, enharmonic display labels, and a source check that the grid has no harmonic disabled state.


### v2.6.3 mobile and audio diagnostics
Playback controls are now at the top of the main workspace, with a direct 440 Hz Test sound control and visible audio status. Mobile project settings and local song library are collapsed behind a toggle; tabs scroll horizontally and the transport remains sticky on small screens. A blank song with no generated notes now displays a clear message rather than silently appearing to play. Actual browser audio on Azure/mobile devices still requires device testing.


## v2.7 — Note editor and workspace ergonomics
- New projects default to Advanced overall and instrument difficulty; saved songs retain their chosen settings.
- The transport stays visible while scrolling on desktop and mobile.
- A global Show/Hide explanations control stores the choice locally in this browser.
- The Note Editor supports dragging a note's right edge to change written duration and its center vertically to transpose, with long-press opening the properties panel. Existing notes are selected on tap rather than deleted; deletion remains in the properties panel.
- Note properties have velocity and sounding-length sliders alongside precise numeric inputs.
- Less-used global actions are also grouped under More tools; existing access points are retained.


## v2.8 Note duration editing
Touch note resize now uses pointer capture, a larger resize handle, visible note-length preview, and duration stepper controls. Written duration remains independent from articulation gate.

### v2.9 dynamics and melody balance
- Optional measure start/end ppp–fff marks per instrument; both endpoints export a MusicXML hairpin.
- Optional note-level subito mark; MusicXML exports the immediate dynamic.
- Automatic accompaniment ducking while another part has the melody; contrabass is exempt, with configurable reduction.
- Playback applies the measure dynamic envelope and accompaniment reduction at note onset; soundfont/realistic dynamics and MuseScore playback still require verification.


## v3.0.0 About and release notes
The clickable Tango Arranger header opens an in-app About page explaining the workflow and summarizing recent releases. The About & releases tab also provides access. The page is responsive and includes shortcuts to the main editing areas.

## v3.1.0 — Note duration editor correction
The note grid now renders each note as a **single bar with actual horizontal width proportional to its written duration**; the resize handle is located at the note's true endpoint, not the right edge of the onset cell. Notes with onsets between grid divisions also display at their actual position. Dragging the handle on a touchscreen captures the pointer on the stable grid scroller, so dragging remains active when Vue rerenders the note. The selected-note editor has immediate numeric and slider duration controls and 0.25-beat stepper buttons, with an explicit maximum at the measure boundary. Every successful edit updates the protected manual score and MusicXML. A new executable regression test checks duration math, persistence through regeneration and MusicXML validity. Browser touchscreen verification is still required.


## v3.4.0 — Explicit section-key confirmation (2026-11-14)

The Structure & Keys and Lead Sheet section-key selectors now open a modal with selectable radio options (transpose chords, transpose chords and melody, or change signature only). Chord transposition is the default. The user must explicitly press **Apply key change**; **Cancel** preserves the song. Errors are shown inside the dialog, not only in the page status behind the modal. The modal has a fixed visible action footer and is teleported to the document body for reliable stacking and touch interaction.


## v3.5.0 — Shift+click measure range selection (2026-11-14)

The Song orchestration map supports selecting an inclusive measure range for the Edit instrument measures panel: click a cell or measure heading to set an anchor, then Shift+click the ending measure in either direction. Shift+click twice also works. The range is highlighted in the map for the selected instrument, and the From/To inputs are populated automatically. The first endpoint's editing settings are preserved when extending the range; no edits occur until Apply to range is pressed. Keyboard support includes Shift+Enter and Shift+Space on instrument cells, and Shift+Enter on measure headings. Normal double-click or Enter still opens the note editor. The anchor is cleared when switching songs.


## v3.6.0 — Violin harmony and manual rhythm editing

- When Violin I is assigned Melody and Violin II Harmony in the same section/measure, generate a chord-tone lower harmony line from Violin I's actual notes, including protected manual Violin I edits. Changing section roles regenerates unprotected notes immediately; manual Violin II notes remain protected.
- The Rhythm Editor now loads any existing preset into a manually editable sixteenth-note attack grid. Add/delete attacks, move onset by beat entry, edit duration by number/stepper/right-edge drag, and set accents. Gaps are rests; attacks cannot overlap.
- Loop the current edited pattern as percussion-like clicks or hear the selected instrument's existing pitches retimed to the pattern. The next loop uses current edits.
- Apply the edited pattern to chosen instruments and measures, respecting protected notes unless overwrite is explicitly confirmed. Piano register and chord voicings remain separate. The pattern itself is a transient editing buffer; applied note events are saved in the project and exported to MusicXML.


## v3.8 — Live tap recording (14 November 2026)

- Rhythm and note editors can loop the full orchestral arrangement over one measure or a chosen measure range, with an optional metronome.
- Large touch/keyboard-accessible rhythm pad captures quantized attack times; the note editor also provides a playable one-octave chromatic keyboard for pitched taps.
- Captures are draft takes. Review, undo, clear, edit rhythm measures in the grid, and explicitly apply. Protected note measures require confirmation.
- Taps quantize to 0.25-beat steps, with adjustable input-latency correction. Short-tap durations are inferred as at most one beat; refine note durations afterward.
- Browser audio playback and touch latency must be verified on a deployed device; the recording is not microphone or MIDI input.


## v4.3.2 — Articulation-aware new-note duration (superseded in v4.3.3)

In the Instrument Note Editor, **New note duration** defaults to **Auto (from articulation)**. Newly added staccato notes default to 0.25 beats, marcato-staccato notes to 0.5 beats and legato notes to 1 beat. Measure/section articulation is inherited, including the alternating marcato and staccato violin chord accents; explicit per-note articulation takes priority. A manually chosen fixed duration overrides Auto. These are *written* durations for newly created notes only; changing articulation on an existing note does not rewrite its rhythm. Playback sounding gates remain independently editable.


## v4.6.0 — Workspace redesign
The project settings and local library are available from a drawer rather than a permanent sidebar. The Note Editor has a sticky compact transport and measure selector, a larger piano roll, and a contextual note inspector (desktop side panel/mobile lower panel). The Song Overview exposes actions for selected instrument-measure ranges. The existing focused editor, keyboard shortcuts, rhythm editor and all music data/export behavior remain available.


## v4.7.0 — Compact top toolbar and contextual map editing

- The global top bar now provides local song selection, new song, save, file import, MusicXML and .tango export, selected-song settings, and playback from the beginning or selected measure. Controls use concise icons with native tooltips and accessible names. Duplicate/delete, regeneration, help visibility and test audio are in the overflow menu; deletion still requires confirmation.
- The selected-song settings drawer holds tempo, meter, transpose, orchestra profile, difficulty and import options. Song selection and library actions no longer require opening this drawer. Local autosave and manual backup behavior are unchanged.
- Song Overview places the selected instrument's From/To, role, articulation and technique controls horizontally above the orchestration map, without a redundant instrument selector. Clicking a cell chooses the instrument; Shift+click extends the range. Applying edits remains an explicit action. The selected-instrument label and note/rhythm actions remain visible above the controls.
- Keyboard, mouse and touch accessibility: icon buttons have descriptive title tooltips and accessible labels. The layout wraps on narrower screens.


## v4.8.0 — Consolidated orchestration and modal song workflows

- Song settings are in a centered, dismissible dialog from the top-bar settings icon. Only current-song properties (title, tempo, meter, transposition, profile, difficulty) appear there. Changes remain autosaved. Escape and the close button dismiss the dialog.
- Import and MusicXML/MIDI round-trip have a separate dialog from the top-bar Import icon. The workflow lets you select a file, choose melody-only or edited-score import, select a track when needed, and apply. Importing a .tango project continues to create a separate local song. MusicXML export and .tango backup remain separate top-bar actions.
- Top-bar actions use consistent inline SVG line icons with tooltips and accessible names, not assorted Unicode glyphs.
- The redundant Song Overview tab and section/key summary strip have been removed. The measure-level orchestration map, Shift+click range selection and edit controls now live at the top of the Orchestration tab. Section-level orchestration settings are in a collapsible panel below. Structure & keys remains the authoritative section form/key editor.
- Main navigation uses descriptive labels without numeric prefixes. At the time of v4.8 the app opened in Orchestration; current builds restore the last workspace tab and otherwise open Structure, Keys & Ensemble.


## v5.1.0 — Compact workspace and mobile improvements

Explanatory help is hidden by default for new sessions. The top-bar question-mark button toggles explanations and persists the choice in localStorage. Mobile now uses three predictable task rows (transport, song library, generation/files/settings), scrollable single-line workspace tabs, touch-sized actions, responsive editors and dialogs. Existing songs and arrangement data are unchanged.


## v5.2 status banner
The status message appears immediately below the top toolbar only after a new status event. It can be dismissed with the close icon and reappears when a different status message is emitted. The previous permanent green message in the workspace has been removed.


## v5.3.0 — Orchestration scopes

Orchestration now has Instrument, Section and All sub-tabs. Instrument contains the measure map and selected instrument-range controls; Section contains section-role and technique settings grouped into compact collapsible panels; All displays both. The redundant Edit Rhythm shortcut was removed from the orchestration map; the dedicated Rhythm Editor remains in the main navigation. Section keys remain managed in Structure & Keys.


## v5.4.0 — Scope-filtered orchestration map

The Instrument scope shows only the selected instrument across all song measures. Section shows every available instrument for the chosen section's measures, and All shows the complete instrument-by-measure map. Instrument and section selectors appear next to the scope tabs. The map retains original measure indices for editing, selection, chord changes and regeneration; section-level settings remain under Section and All.


## v5.4.1 — Instrumental groups (terminology correction)

The Orchestration sub-tab **Section** refers to a functional orchestral group (Rhythm, Melody, Harmony), not a formal song part such as A, B, or C. Group membership is customizable for each song, stored in `project.orchestralGroups`, and included in local saves and `.tango` backups. Default groups are Rhythm (Piano, Contrabass), Melody (Violin I, Bandoneon I, Voice), and Harmony (Violin II, Bandoneon II); they are editable organizational presets, not claims that an instrument always performs that musical role. An instrument can be included in multiple groups. Instrument and Section views show the entire song, filtered by one instrument or the selected instrumental group respectively; All shows every instrument and measure. The former A/B/C orchestration settings are retained as a collapsed **Song-part settings** panel in All. Existing measure selection and editing use absolute measure indices.

## v5.5.1 - Lyrics and roster templates

For Voice parts, select a note in the Note Editor and enter a lyric syllable. Choose single, begin, middle or end to indicate its position within a word. The lyric is saved with the note and exported as a MusicXML lyric for MuseScore. Multi-note melismas and verse management remain future work.

Built-in roster templates are Factory seven-part, Quartet, Sextet, Septet and Orquesta típica. They are configurable examples rather than fixed historical orchestrations. The factory seven-part roster remains the initial default.

### Lyrics enhancements (v5.5.2 experimental)
In a Voice part's Note Editor, enter lyrics per note for verses 1 and 2, or use **Align lyrics across this measure**. Spaces separate words, hyphens separate syllables (`tan-go`), and an underscore reserves an additional note onset for a sustained syllable (`love_`). The alignment applies only to the selected measure and protects the manually edited measure from regeneration. MusicXML writes numbered lyric elements for both verses and an extension-start marker for a marked melisma. Full cross-note extension termination and MuseScore visual validation remain outstanding.
