## Active engineering tasks — 2026-11-20

This section records unfinished work even when an initial implementation ships. **Status refers to implemented code, not acceptance on a physical iPad or by professional musicians.** The source of truth for outstanding tasks is this board; linked issues add technical detail.

| ID | Task | State | Next acceptance / decision |
|---|---|---|---|
| TA-AUDIO-26 | Sustained sampled notes and held-note recording | **Partial in PR #19; new capture and playback fixes prepared; iPad QA pending** | Current Tone.Sampler uses finite source audio and can finish before a long written note; sustain-capable long notes switch to ADSR synth, while held live keys use a higher-sustain envelope. Confirm violin arco 0.5–8 s, bandoneon legato, long bass notes, note-off, rearticulation, overlap and stop on actual iPad Safari at recording speeds 0.5×, 0.75× and 1×. Check mix/gain continuity at sampled↔synth transitions; sample-length-aware routing or loopable sample content remains future work. |
| TA-PIANO-BASS-26 | Piano left-hand tango compás aligned with contrabass | **Implemented in PR #19; music listening QA pending** | The full 88-key range (A0–C8) is available for user notes; generator should still choose idiomatic F-clef bass notes, same harmonic root/fifth pitch classes as contrabass on major attacks, normally at a higher register. New milonga 2/4 bass pulses support upper offbeats; preserve monophonic vals bass. Check chord changes and profiles/difficulty with listening excerpts; arrangement is heuristic, not source-transcribed. |
| TA-VIOLIN-SAMPLES-26 | Articulation-specific violin sample banks | **Planned** | Use separately captured/licensed **arco/legato sustain**, **pizzicato**, **staccato**, **marcato-staccato** attacks (and optionally tremolo, bow direction, multi-velocity and round robin). Tone.Sampler can repitch sample files, but cannot derive genuine pizzicato or a looping sustain from a short arco sample. Evaluate loop points, release tails, pitch range, velocity layers, preload/download size, offline behavior, license and attribution before implementing. Existing tonejs-instruments files are labeled CC BY 3.0 with code MIT; verify all constituent recordings and attribution conditions before redistributing. |
| TA-PIANO-SAMPLE-26 | Audio quality across all 88 piano keys | **Planned** | The score now supports A0–C8, but the current piano sampler only loads C3/C4/C5/C6; very low A0 and high C8 are pitch-shifted far from the nearest recording and may sound unrealistic. Benchmark/replace with licensed distributed sample zones covering the bass and extreme treble, with velocity layers, pedal/release support if needed, browser memory/latency budgets and iPad QA. Generated tango bass should remain around a musical F-clef register instead of indiscriminately using A0. |
| TA-AUDIO-LIB-26 | Consistent orchestral sample selection | **Planned** | Many non-core instrument families currently map to generic piano samples; choose suitable flute/clarinet/brass/guitar sources where licensed, retain synth fallback, verify samples for extended notes and include a browser audio test matrix for Safari/Chrome and slow/offline connections. Consider different release envelopes for articulation rather than a universal sample/synth threshold. |
| TA-PIANO-88-26 | Full physical piano range and focus/editor reuse | **Code merged in [PR #16](https://github.com/niwrA/tango-arranger/pull/16); manual QA pending** | Verify A0 (MIDI 21) and C8 (MIDI 108) note entry/audition/import/export, adaptive recording keyboard, and upper/lower register focus on an iPad in portrait/landscape. Extend the shared performance keyboard to direct entry/editing only with an explicit edit mode to avoid interference with current tap-to-switch gestures. |
| TA-BAND-LAYOUT-26 | Bandoneon left/right and authentic systems | **Planned; [issue #18](https://github.com/niwrA/tango-arranger/issues/18)** | Start with dual adjustable note-name registers in focus/recording/editing (overlap allowed); investigate verified Rheinische 142, Einheits 144, and common unisonoric systems. Physical button display must depend on bellows push/pull and selected layout; no guessed mappings or hand assignments. |
| TA-NOTATION-26 | Read-only staff notation preview | **Investigated; [issue #17](https://github.com/niwrA/tango-arranger/issues/17)** | Prototype lazy-loaded OpenSheetMusicDisplay over existing in-memory MusicXML export, selected instrument and 2–4 measures, piano grand staff; benchmark iPad Safari, score parity, playback cursor and Voice lyrics. Engraved editing is a separate, much larger feature and should not replace piano-roll edits. |
| TA-STRING-ENTRY-26 | Reuse expanded violin/bass/piano reference diagrams for input | **Partial** | String recording and keyboard coexist; expand controllable instrument surfaces into editing with note selection, drag/hold duration and explicit mode controls. Maintain recorded pitch vs inferred fingering distinction; user-provided fingering/position overrides are still not supported. |
| TA-GESTURE-ENTRY-26 | Sirena, portamento and látigo gestures | **Planned; [issue #14](https://github.com/niwrA/tango-arranger/issues/14)** | Explicit armed gesture mode, inspectable path/duration preview and confirmation; no accidental recording from scrolling or ordinary note holds. |
| TA-BASS-ORIENTATION-26 | Contrabass string order in stage and recording | **Implemented in PR #20; iPad QA pending** | Show G2–D2–A1–E1 top to bottom, lowest E1 at bottom, in both performance compact/focus and the shared recording surface. Physical tuning and MIDI mapping remain unchanged; validate fingering-guide labels and note highlighting on an actual device. |
| TA-STAGE-ROLE-26 | Glanceable compact and expanded current/next roles | **Implemented in PR #20; iPad QA pending** | Replace cramped 2×2 focus-role tiles with a reusable present/next timeline, dominant current role, articulation, current activity and independent dynamic meters. Retain tap-to-switch, explicit mode buttons, accessibility and stable fixed-height cards. Evaluate portrait/landscape sizes and Voice/Bandoneon text wrapping with long labels. |
| TA-STAGE-DYNAMICS-26 | Dynamics shading for current and upcoming measures | **Partial in PR #20** | Written measure/section marks control restrained independent current/next background intensity with textual marks and meters; **not** real-time audio amplitude or continuous hairpin interpolation. Next phase: evaluate beat-level crescendi/decrescendi and smooth transitions only after UI and musical QA; maintain color-blind legibility and avoid masking active notes. |
| TA-STAGE-PIANO-26 | Compact performance piano follows both bass and upper notes | **Partial in PR #20** | Follow the current scored measure with a 23-white-key viewport, blue planned bass keys and amber upper keys, with distinct sounding-key highlights and an offscreen-note count. Actual hand ownership is not encoded, only staff/register split. Unusually wide notes cannot always fit on one compact keyboard; consider a two-lane or overview strip if iPad testing finds the offscreen count insufficient. Expanded piano keeps separately adjustable register windows; 88-key recording support unchanged. |
| TA-SUSTAIN-RECORD-26 | Held notes in capture and playback | **Code prepared for direct-main commit; manual audio QA pending** | Held keys now use note-on/note-off monitoring even when the recording loop is not running; applied held notes use gate=1 so inherited short violin staccato does not truncate the performed hold. Full-score playback now uses written/gated length across bar boundaries rather than the single-measure loop duration. Verify bowed violin 0.2–8s during record, note editor loop and full playback at 1× and 0.5× on iPad Safari; test polyphony, sustained crossing-bars, reattacks, stop/cancel and simultaneous recording/backing. Exact ties across bars remain a separate engraving and capture UX issue. |
| TA-VIOLIN-ATTACK-26 | Sampled attack vs sustained arco and pizzicato | **Partial code; further audio-design work** | Bowed violin routes to sustained oscillator voice instead of relying on finite source files; explicit pizzicato may keep a short sample. This is not a physically realistic bowed sample and can differ in timbre from short sampled attacks; prioritize licensed loopable arco/pizzicato/staccato/marcato-staccato banks, correct amplitude and round-robin articulation, note-off tails and sample pitch coverage. |
| TA-COMPACT-PIANO-26 | Octave cues and consistent keyboard colors | **Code prepared; manual visual QA pending** | Small piano now labels left/right register note ranges with octaves (e.g., C3–G3), and currently sounding upper notes remain warm amber rather than changing to a different hue; blue bass remains distinct. Test readability at iPad split view and portrait. Future option: lane/mini-overview for wide bass-to-upper spans when 23-white-key viewport omits some notes. |
| TA-HEADER-REFLOW-26 | One-row transport plus grouped file actions | **Code prepared; iPad Safari QA pending** | At tablet widths, keep Play/Stop and the rehearsal-speed button in one row and move workspace actions into an accessible overflow menu; keep a direct Files menu with Import, Score export, and Backup sections. Verify at widths 320, 375, 768, 1024 and landscape, tool menu click/keyboard/scroll, labels in VoiceOver, screen reader hierarchy and file-picker focus. Follow-up: convert the duplicated wide/compact actions to one action registry to prevent divergent menu behavior. |
| TA-QUIET-STATUS-26 | Silence routine success banners; errors remain visible | **Code prepared; QA pending** | Global toast now appears only on actionable errors, and routine sample/audio/autosave success statuses are hidden. Keep workflow-specific inline feedback for capture drafts, import review and editing validation. Review error classification and avoid hiding non-error warnings (such as unsaved changes or an unsupported export); consider a quiet activity log / history menu instead of unsolicited toast banners. |
| TA-RESTORE-VIEW-26 | Persist workspace location after refresh | **Code prepared; browser QA pending** | Restore last performance/ensemble/notes mode, last measure, note-editor subtab and instrument, while keeping transport stopped and not requesting browser fullscreen automatically. Test navigating away, switching songs, refresh with unsaved edits, Safari page reload/offline storage denial, private browsing, invalid instrument saved and measure count changes. Pending extension: decide whether to restore an expanded instrument focus dialog and scroll position. |
| TA-DYNAMICS-UX-26 | More intuitive Dynamics editor | **Partial code; usability research pending** | Introduce steps Who / Set loudness / Paint measures, direct pp–ff buttons, selected-measure preview and an intensity timeline. Existing hairpin and contextual options remain. Follow-up: unify range selection with a visible range bracket, allow multi-select painting and reversible draft preview, show inherited vs explicitly written dynamics per part, distinguish crescendi/hairpins from discrete dynamics, accessible no-color/keyboard controls, and offer an undo preview before applying an orchestra-wide gesture. |
| TA-STAGE-LYRICS-26 | Stable paged lyrics in both performance modes | **Implemented; physical iPad QA pending** | Replace beat-relative sliding word windows with one reusable lyric surface for Ensemble and Notes & Karaoke. Default page spans two complete measures; adapt to one measure on dense narrow displays or up to three for fast sparse passages on wide screens. Only syllable highlighting changes within a page; reserve token size to avoid reflow and keep explicit measure range visible. Reuse the Notes-mode dark-blue/white-highlight palette instead of the brown Ensemble background. Verify spoken/held syllables crossing barlines, long rests, count-in, phrase changes, different song meters, speed switching, screen-reader labels, portrait/landscape, iPad Safari, and extremely long lyrics wrapping. Follow-up: improve lyric hyphenation, multiple verses, singer selection and a user-selectable one/two/three-measure page size if performers request it. |
| TA-PERFORMANCE-QA-26 | iPad stage/focus usability | **Manual validation outstanding** | Verify fixed-height compact performance cards despite new dynamic ribbon, violin E at top and contrabass E at bottom, string finger numbers/position labels, current/next dynamics meter contrast, 1×↔0.8× timing, compact piano following bass/upper registers, larger piano two-register focus, role/cue switch and orientation. Check high contrast and screen-reader phrasing; no real-device acceptance has been performed. |

---

## MusicXML alignment & reviewable merge (2026-11-19)

- [x] Correct PlayScore 2 timing interpretation across measures, voices and staves.
- [x] Add normalized pitch and key-signature source metadata, with transparent, optional chord estimates.
- [x] Propose per-section harmonic matching and local transposition, then allow per-measure source remapping.
- [x] Present Ours / Theirs / Combine decisions, direct editing of existing protected notes and section-wide actions.
- [x] Support existing-song fit, imported piano-led structure and reference-only modes.
- [x] Keep complete pre-merge project/difficulty editions in a reversible snapshot; retain imported MusicXML and merge mapping in project data.
- [x] Constrain orchestration row playback buttons inside sticky instrument heading on iPad.
- [ ] Validate full 94/92-bar imported PlayScore arrangements visually in Safari and MuseScore.
- [ ] Expand musical alignment to detect repeated phrases, unnotated returns and more ambiguous violin passages.

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

## Contextual interaction refinement — phrase, rhythm and dynamics (19 November 2026)

- [x] Offer a phrase-block strip with long-press/right-click/keyboard/visible-menu access; keep draft changes separate from applied orchestration.
- [x] Connect phrase contextual actions to existing plan controls and the selected instrument's full phrase measure range in the Note Editor.
- [x] Add contextual attack actions in the Rhythm Editor (accent, timing, duration, split, delete) with no automatic application to instrument notes.
- [x] Add context actions on dynamics measure tiles and hairpins, including the actual-instrument note snapping for endpoints and a delete confirmation.
- [x] Centralize touch long-press and scroll-cancellation logic; test pointer release, movement, keyboard shortcuts and synthetic click suppression.
- [ ] Physical iPad Safari and desktop-browser accessibility/touch acceptance testing.

## Milestone 4 — Rhythm provenance and contextual editing (19 November 2026)

- [x] Add an explicit rhythm snap selector to Note Editor / Focus mode, with readable preset onset guides; keep free timing as default.
- [x] Snap newly entered onsets within a bounded tolerance; allow selected existing notes and simultaneous chords to snap on demand without implicit retiming of the rest of the measure.
- [x] Store app-local rhythm provenance on notes only when applied from a preset or manually edited rhythm pattern; preserve it in protected edits and independent difficulty editions, and clear stale source labels after time/duration changes.
- [x] Display rhythm-source cues in Note Editor, selected-note details, note lists and Performance mode.
- [x] Extend contextual editing: instrument-heading long press/right-click/keyboard and a visible options control, with shortcuts into existing editors; support the keyboard context-menu gesture on map cells and notes.
- [x] Add regression checks for preset onsets, tolerance, provenance persistence, manual protections, mixed-skill editions, and export timing.
- [ ] Verify iPad Safari and desktop pointer/keyboard behavior manually, including scrolling cancellation and popup focus.
- [ ] Expand per-instrument rhythm ergonomics, harmonic retiming checks and phrase-based automatic rhythm recommendations later.

## Milestone 3 — Phrase-level orchestration planning (19 November 2026)

- [x] Introduce a shared, typed phrase-plan model independent of editable instrument note editions.
- [x] Group contiguous song sections into configurable 1–32-measure phrases; validate complete form coverage.
- [x] Provide draft, preview, edit, apply and remove workflow in Orchestration, including role, activity, placement, articulation and violin/bass techniques.
- [x] Update generated note realization, orchestration map and Note Editor contexts to respect phrase plans, explicit per-measure overrides and manual protections.
- [x] Keep active difficulty editions current after applying a plan, retain other editions unchanged and flag them stale.
- [x] Add focused regression tests for form/roster changes, explicit rests, instrumental techniques, protected edits, and MusicXML/print-pack compatibility; run these in CI.
- [x] Apply phrase articulation consistently to new manual notes and their duration/playback defaults, while retaining explicit measure overrides.
- [x] Render malformed imported plans as actionable validation states; retain rebuild/discard controls and verify Vue rendering, native backup round trips and real ZIP contents in the phrase test gate.
- [x] Honor planned bandoneon leads over section follower settings and generate linked violin leads before their harmonies, even after roster reordering. Reuse a validated phrase map in the interface.
- [ ] Validate touch interaction in Safari on iPad and inspect exported phrase arrangements in MuseScore.
- [ ] Reduce duplicated phrase-plan source data in edition signatures for very large ensembles and fine-grained phrase plans; current signatures retain the complete source for staleness comparison.
- [ ] Improve phrase discovery from melodic contour and harmony, cross-part voice leading, advanced violin fingering/double stops, bandoneon/contrabass ergonomic modeling, and historical-corpus comparison.

## Milestone 2 — Independent difficulty editions (19 November 2026)

- [x] Keep the shared lead sheet, song form, chords and tempo unchanged while
  storing separate Easy, Intermediate and Advanced note editions per instrument
  in version-1 compatible `.tango.json` project data.
- [x] Make switching editions preserve each version's manual notes, protection
  and expressive gestures, without silently borrowing protected material from
  another edition. New versions can be generated on demand.
- [x] Provide selectors in Orchestration, the Note Editor and Focus mode.
- [x] Export a selected mixed-skill ensemble MusicXML plus separate printable
  MusicXML instrument parts at all three levels in one ZIP.
- [x] Mark saved alternatives stale when shared song data changes; preserve
  the old notes until the musician deliberately revises/regenerates them.
- [ ] Actual MuseScore printing and iPad Safari acceptance testing.
- [ ] More sophisticated instrument-specific difficulty metrics and phrase
  planning remain future musical-quality milestones.

## v4.4.0 — Focused Note Editor (14 November 2026)

The Instrument Note Editor now offers a full-viewport **Focus editor** mode. The sticky top bar keeps previous/next measure, instrument-loop playback and optional loop-from/loop-to measure controls within reach. The bottom quick editor keeps the selected note’s timing, written duration, articulation and deletion accessible; **All note properties** reveals the complete form. Escape exits focus mode before leaving the Note Editor. The normal Notes, Live Input, Figures and Dynamics tabs remain unchanged outside focus mode. The focused loop plays only the current instrument across the selected measure range; navigating to another measure stops playback, while preserving the loop range in focus mode. This is a CSS full-viewport workspace, not the browser Fullscreen API.

# Tango Arranger v4.3.3 — Notation-correct tango articulation

Staccato and marcato affect **how long a note sounds**, not its **written rhythmic value**. New articulated notes default to a quarter note (one beat) in the Note Editor; selecting an explicit eighth, sixteenth or other rhythmic value still overrides the default. A note at the end of a measure is capped to the available space. Existing saved notes are not rewritten.

MusicXML exports **staccato** as a dot (`<staccato/>`) for unaccented attacks and **accented staccato/marcato** as a horizontal `>` (`<accent/>`). The previous strong-accent wedge and combined wedge-plus-dot for marcato are no longer emitted. The original playback gate values (including very short violin staccato) and accent velocities remain unchanged; MuseScore receives the full written note value. Older projects containing notes previously entered with short written durations retain those values and can be corrected in the Note Editor if needed. Browser and MuseScore rendering still require manual verification.

## v4.3.1 — Completed

- [x] Decouple note drag snap from difficulty so Easy does not force whole-beat placement.
- [x] Show eighth/sixteenth subdivisions in the note grid and provide half-beat nudge controls.
- [x] Reduce handle overlap on short note bars.
- [ ] Verify real browser drag behavior and complete Vue build.

## v4.3.0 — Completed

- [x] Move shared instrument and measure selectors above note-editor tabs, with previous/next measure and loop controls.
- [x] Add Notes, Live input, Figures, and Dynamics & expression tabs; retain editor state across tab switches.
- [x] Add native collapsible disclosure sections to sidebar, rhythm editor, note controls, and other workspaces.
- [x] Keep the note grid visible by default, with note properties collapsible and accessible.
- [ ] Verify production Vue build and manual keyboard/touch browser interactions on deployed app.

## v4.2.0 — Completed

The Note Editor supports dragging a note horizontally to change its onset, vertically to change pitch, and diagonally to change both. Dragging the left resize grip changes the start while preserving the original end; dragging the right grip changes the end while preserving the start. Dragging is snapped to the current grid resolution and clamped to measure boundaries. Changes save to protected instrument-measures, survive regeneration and are exported as MusicXML.

## v4.1.1 — Azure TypeScript build fix

MusicXML note event projection explicitly retains the optional `subito` property used for per-note dynamics. Added a regression check to prevent TS2339 from returning. No change to arrangement behavior.

## v4.1.0 — Contrabass style options

Contrabass now has section and per-measure playing-style settings: traditional, pizzicato, arco legato, marcato, walking, and habanera. Styles affect generated rhythm, note length, articulation, and MusicXML technique markings where applicable. Settings persist in `.tango` projects, and protected manual measures are retained. The existing traditional bass pattern remains the default for older projects.

## v4.0.0 — Live melody keyboard note boundaries (2026-11-14)

- [x] Replace fixed octave selector with independent start and end MIDI note selectors.
- [x] Render inclusive chromatic note range with horizontal scrolling and full touch targets.
- [x] Clamp selected rhythm-pad pitch when the keyboard boundaries change, preserving draft taps.
- [x] Add domain and UI regression checks for arbitrary ranges, crossing boundaries and instrument limits.
- [ ] Verify Vue production build and touch interaction on deployed device.

## v3.9.0 — Arrangement playback starting point (2026-11-14)

- [x] Add two start controls in the sticky playback bar: beginning and selected measure.
- [x] Provide a dedicated Stop button and active-playback state.
- [x] Skip notes before the start measure and reschedule remaining events from transport zero.
- [x] Add domain and UI regression tests for playback window, timing and buttons.
- [ ] Full Vue build and real-browser audio test (npm dependencies unavailable locally).

## v3.7.0 — Editor keyboard shortcuts (2026-11-14)

- [x] Delete / Backspace for selected notes and rhythm attacks.
- [x] Arrow-key navigation, duration adjustments, loop shortcuts and editor-specific pitch/accent commands.
- [x] Protect native text input, button Space activation and modified browser shortcuts.
- [x] Visible shortcut hints, focus recovery and regression tests.
- [ ] Verify keyboard interaction and full Vue production build in deployed browser.

# Tango Arranger v3.6 — Linked violin harmony and manual rhythm editor

## Current release (v3.8.0)

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

## v3.2 Rhythm editor

The new **5 · Rhythm editor** tab offers fourteen templates (seven rhythmic figures and seven named orchestra-profile variants): Current orchestra style, Marcato en cuatro, Marcato en dos, Síncopa, 3–3–2, Habanera-inspired and Offbeat chords. Preview accents in a beat diagram. Choose the rhythm section (Piano, Contrabass, Bandoneon I/II), all parts, or any custom instrument selection. Apply to a measure range, one section or the whole song. You can apply onset/duration/accent changes or just accents/articulation while retaining original timing.

The editor preserves the original pitches, chord voicings, piano register split, and per-note gestures. Existing simultaneous chord notes stay together. Silent measures are skipped rather than inventing notes; melody/voice selections require confirmation. Protected instrument-measures are skipped by default; overriding them requires a separate opt-in and confirmation. Applied results are protected manual note edits, persist in local autosave and `.tango` archives, survive orchestral regeneration and export to MusicXML. The patterns are simple editable rhythmic templates, not transcriptions of historic orchestra recordings. For 2/4 and 3/4, the reference pattern scales across the bar; this is a pragmatic approximation, not a musicological meter conversion.

**Caution:** Replacing a rhythm changes onsets and written durations. It does not perform harmonic re-voicing when chords change within the bar; review the resulting notes if a measure has multiple harmonies. Browser UI, real audio and MuseScore rendering require deployment verification.

## v2.6.2 — Browser audio unlock
- [x] Defer Tone.js loading until an audio user gesture; avoid eager AudioContext initialization during application startup.
- [x] Create and resume native AudioContext before the first await, then adopt it with Tone.setContext.
- [x] Apply the shared unlock to full playback, measure loop, ordinary and expressive note auditions.
- [x] Add source-level audio unlock regression checks.
- [ ] Verify actual audio playback and browser console behavior on deployed Azure Static Web Apps, Chrome, Firefox and Safari.

## v2.6.1 — Azure deployment build fix

- [x] Convert `Tone.Frequency` to numeric hertz before passing it to full-score `PolySynth.triggerAttackRelease` (TS2345).
- [x] Update package version to 2.6.1 for the UI version indicator.
- [ ] Verify complete `npm run build` in CI after dependencies install.

## v2.6 completed

- [x] Fix hard-coded UI version using `package.json`.
- [x] Separate written note durations from sounding gates for generated piano, contrabass and bandoneon.
- [x] Keep default piano bass staff monophonic and upper chord figures in treble staff.
- [x] Add regression checks for notation duration and piano staff assignment.
- [ ] Validate exported score visually in MuseScore 4 on a local installation.

# Tango Arranger — project board (v2.5)

**Status definitions:** Done = code/doc is present; Partial = meaningful implementation with clear gaps; Planned = not implemented. **Verification is a separate axis**: Done does not imply MuseScore compatibility or historical fidelity.

| ID | User story / engineering task | Status | Release | Evidence / outstanding work |
|---|---|---|---|---|
| TA-WIDE-25 | Full-width responsive Song Overview and optional side-by-side piano staff rolls | Partial | v2.5 | CSS changes; browser visual QA pending |
| TA-FIG-25 | Select/cycle six arranging figures and deterministic variations; section piano patterns with bass pulse and moving inversions | Partial | v2.5 | Domain generator, Note Editor, map and Orchestration controls; 16 added regression checks; idiomatic evaluation pending |
| TA-EXPR-25 | Per-note slide/swell and instrument-specific crescendo ranges across measures | Partial | v2.5 | Web Audio automation and `.tango` persistence; MusicXML hairpins plus text for single-note gestures; MuseScore playback/engraving not verified |
| TA-ARP-24 | Whole-measure violin arpeggio: four notes per bar, ascending/descending/alternating, pizzicato variant | Partial | v2.4 | Generator, per-section direction control, structural persistence and MusicXML regression; real MuseScore/browser audition pending |
| TA-UI-23 | Separate song structure/section keys from measure orchestration map; map-first responsive editor workspace | Partial | v2.3 | Dedicated tab, read-only section strip, side-by-side map/editor, navigation tests; browser visual QA pending |
| TA-VIOLIN-22 | Beat-based violin chord accompaniment: single pizzicato/tango-staccato note per beat, style-dependent marcato and editable per-section beat accents | Partial | v2.2 | New projects default to one note/beat, sounding gate and stronger marcato; MusicXML articulation tested; named-style beat choices are heuristics, real MuseScore and audio QA pending |
| TA-PIANO-21 | Two-staff piano MusicXML with independent simultaneous voices and split-register note editor | Partial | v2.1 | Staff 1 G clef, staff 2 F clef, two voices and backup; split point saved; automatic hand assignment and MuseScore visual QA pending |
| TA-CHORD-21 | Preserve comma-separated chord tokens during autocomplete and keyboard editing | Partial | v2.1 | Input commit deferred to blur/Enter/Tab; token-level completion; repeated-chord tests; browser UX QA pending |
| TA-LOOP-20 | Loop current instrument-measure in Note Editor, live edits and beat highlight | Partial | v2.0 | Tone transport loop, gate/velocity/transpose, stop on navigation, eight tests; real browser/audio QA pending |
| TA-ART-19 | Distinct tango staccato/marcato attacks, note-level gate editor and MusicXML markings | Partial | v1.9 | Note duration separate from sounding gate; 28%/58% defaults, marcato +14 velocity; MusicXML dot/wedge; real MuseScore playback and note-level gate roundtrip not yet verified |
| TA-001 | Local-first Vue/TypeScript workbench | Done | v0.1 | `src/App.vue` |
| TA-002 | Manual melody/chord input and section roles | Partial | v0.1 | Text entry; staff editor planned |
| TA-003 | MIDI and MusicXML import | Partial | v0.1 | Complex meter, repeats, grace notes unsupported |
| TA-004 | Portable `.tango` project ZIP | Done | v0.1 | `src/io.ts` |
| TA-005 | MusicXML export and precise measure accounting | Partial | v0.2–0.4 | Regression test passes; MuseScore 4 not run |
| TA-006 | Repair missing `download` export | Done | v0.2.1 | `src/io.ts` |
| TA-007 | Standardize Vite at port 8000 strict | Done | v0.3 | `vite.config.ts` |
| TA-008 | Violin pizzicato, arpeggio, arco/sustain | Partial | v0.3 | Heuristic note realization and directions |
| TA-009 | Violin adjacent-string double stops | Partial | v0.3 | Low-position/open-string feasibility; no optimized fingering |
| TA-010 | Bandoneon following other instruments | Partial | v0.3 | Section target + exact/octave/adapt/rhythm methods |
| TA-011 | Preflight MusicXML duration validation | Done | v0.3 | Export blocked on invalid sum |
| TA-012 | Update README / goals / story board | Done | v0.3–0.4 | Root documentation |
| TA-013 | Historical, sourced orchestra-profile heuristics incl. Troilo | Partial | v0.5 | Accent, compás, voicing tendencies; not recording-calibrated |
| TA-014 | Reduce Bandoneon II unwanted rests | Done | v0.5 | Default role now harmony; empty melody maps to chords |
| TA-015 | Respect explicit rest roles | Done | v0.5 | Regression test |
| TA-016 | Per-instrument activity controls and activity report | Partial | v0.5 | Deterministic measure target; no phrase planner or cross-part collision solver |
| TA-017 | Overall and per-instrument difficulty | Partial | v0.5 | Easy/Intermediate/Advanced heuristics; ergonomics incomplete |
| TA-018 | Piano chords move between registers in same bar | Partial | v0.5 | Different voicing targets; single stave, no true hand separation |
| TA-019 | Sectional dynamics + wedges + accents + velocities | Partial | v0.5 | MusicXML directions implemented; browser expression not independently verified |
| TA-020 | Safe 2/4 → 4/4 conversion | Partial | v0.5 | Preserves time, refuses harmony/section conflicts, no pickups |
| TA-021 | Generator and export regression suite | Done | v0.5 | `tests/regression.cjs`, deterministic fixture |
| TA-022 | Actual MuseScore 4 clean-open end-to-end test | Planned | Next | Required before compatibility certification |
| TA-023 | Full production `npm run build` and CI | Planned | Next | npm registry unavailable here; Vue compilation unverified |
| TA-024 | More than one chord/change per measure | Implemented (v0.7) | Beat-aligned comma shorthand; fractional-beat changes still planned |
| TA-025 | Real phrase-level role/density planning | Planned | Next | Separate plan from notes, human overrides |
| TA-026 | Valid independent multiple-voice MusicXML and pickups | Planned | Future | Current exporter flattens overlaps to tied chords |
| TA-027 | Optimized violin fingering and bandoneon voicing | Planned | Future | Position/ergonomic checks and pitch motion optimization |
| TA-028 | Staff/piano-roll editor | Partial | v1.3 | Guided beat-grid piano roll implemented; engraved staff editor and full note notation remain planned |
| TA-029 | Three-way merge from MuseScore | Planned | Future | Currently instrument-measure protection only |
| TA-030 | Historical excerpt comparison/golden reference set | Planned | Next | Score/legal-source selection, analysis and listening validation |
| TA-031 | Per-instrument expression differences | Partial | v0.5 | `dynamicsOffset` in data model and UI; not independently listening-verified |
| TA-032 | Authenticity of Pugliese yumba and Di Sarli accompaniment | Partial | v0.5 | Approximations, not transcriptions; test in corpus |

## Executed in v0.5

- Changed default Bandoneon II fill assignment to harmonic continuity and provided an empty-melody fallback.
- Introduced per-instrument and overall difficulty and activity UI, with active-measure reporting.
- Added piano intra-bar register targets and profile-derived accents, plus a Troilo heuristic.
- Added MusicXML dynamics, crescendo and note accents and corresponding generated note velocity scaling.
- Added a conservative 2/4-to-4/4 conversion that refuses destructive merges.
- Added deterministic regression tests for continuity, rest semantics, voicing complexity, XML measure coverage/overlap, conversion, articulation and expression.
- Recorded references and explicit known limitations in README and goals.

## Release verification (environment)

- [x] TypeScript generator check using system `tsc`.
- [x] Standalone regression checks passed (10 tests).
- [x] Generated MusicXML checked for complete durations by code.
- [ ] Production Vue typecheck/build. Registry resolution (`EAI_AGAIN`) prevented dependency installation.
- [ ] Actual MuseScore 4 import to confirm no warnings.
- [ ] Historical corpus and human-ear comparison.
- [ ] Full playback and portable `.tango` browser test.


## v0.5 stories and tasks

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-033 | Global, reversible semitone transpose UI (-24..+24) | Done | Implementation in `App.vue` and project model; full browser verification pending |
| TA-034 | Transpose sounding notes and MusicXML chord symbols | Done | Regression for pitches/chord roots and measure duration |
| TA-035 | Transposed MuseScore import prevents double transposition | Partial | Inverse conversion implemented; browser round-trip test pending |
| TA-036 | Configurable eight-bar rhythmic/lyrical articulation cycle | Done | Deterministic pattern with staggered Violin II/Bandoneon II |
| TA-037 | Individual instrument, per-measure articulation override | Done | Overrides in model/UI and regression; browser usability pending |
| TA-038 | MusicXML staccato+marcato / legato direction export | Partial | XML produced; MuseScore 4 opening/rendering pending |
| TA-039 | Singer tessitura and ergonomic bandoneon fingering checks | Planned | Requires range analysis and instrument-specific fingering model |
| TA-040 | Historical recording/score corpus to validate phrase changes | Planned | User's eight-bar pattern remains optional heuristic |
| TA-041 | Ensure physical violin vs. bandoneon articulation semantics | Partial | Uses arco/pizz. for violin, legato/staccato for bandoneon; playback timbre pending |

### Work executed in v0.5

- Added transposition as a persisted scalar rather than destructive editing of imported melody or generated notes.
- Updated MusicXML chord roots and note pitches, with round-trip inverse transpose for edited-score import.
- Added configurable phrase duration and explicit measure/instrument articulation overrides.
- Added generated staccato attacks with shorter note durations and legato mode; expressed markers in MusicXML.
- Expanded smoke/regression suite; `npm run test:regression` is the reproducible check.

### Verification

- [x] System TypeScript check on `src/music.ts`.
- [x] Standalone regression tests and measure-duration export checks.
- [ ] Full Vite Vue production build with dependencies installed.
- [ ] MuseScore 4 application import, actual articulation engraving, and playback listening.
- [ ] End-to-end browser interaction/round-trip test.


## v0.6 song overview

| ID | Story / task | Status | Evidence / remaining work |
|---|---|---|---|
| TA-042 | Full-song instrument-by-measure orchestration matrix | Implemented | Vue interface with horizontal scrolling, role color, articulation label and section boundaries; browser UX unverified |
| TA-043 | Select an instrument-measure for direct editing | Implemented | Selecting a matrix cell loads instrument, measure, and explicit override values |
| TA-044 | Override instrument roles by measure and range | Implemented | `measureRoles` persisted in project JSON; generator uses it; automated regression |
| TA-045 | Override violin chord techniques by measure and range | Implemented | `measureViolinTechniques` persisted; generator uses it; automated regression |
| TA-046 | Apply articulation override across range/section/full song | Implemented | Reuses `articulation.overrides`; range editor can inherit/remove explicit overrides |
| TA-047 | Preserve section inheritance and intentional rests | Implemented | Sparse overrides; regression tests for explicit rests |
| TA-048 | Verify song overview in browser and MusicXML in MuseScore 4 | Pending | Requires installed dependencies, browser interaction and MuseScore 4 |
| TA-049 | Consolidate project documentation into exactly three files | Done | Removed legacy `README.md`, `EXPORT-FIX-NOTES.md`; `.tango` package no longer includes README.txt |

### v0.6 checks

- [x] Generator TypeScript compiled by system `tsc`.
- [x] Existing and new standalone regression suite passed.
- [ ] Full Vue production build (`npm run build`) not available in this environment without installed npm dependencies.
- [ ] Browser UX (including matrix scrolling, selection and bulk edits) needs interactive verification.
- [ ] MuseScore 4 application import remains outstanding.

## v0.7 — Beat-level harmony editing

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-050 | Multi-chord shorthand per measure (`D,G`, `D,D,D,G`) | Implemented | Parser and per-beat unit checks |
| TA-051 | Shared chord editor from Song Overview measure header | Implemented | Vue interface; browser interaction pending |
| TA-052 | Chord editor from Song Overview instrument row header | Implemented | Opens focused measure's shared harmony; browser pending |
| TA-053 | Chord editing from Lead Sheet measure tile and field | Implemented | Uses shared editor; browser pending |
| TA-054 | Active chord influences generated accompaniment and bass | Implemented | Regression checks for piano beat-four change |
| TA-055 | MusicXML multiple harmony events with beat offsets | Implemented | XML parse and offset assertions; MuseScore 4 pending |
| TA-056 | Multiple chord symbols transpose together | Implemented | Regression assertions |
| TA-057 | 2/4-to-4/4 conversion preserves harmonic changes | Implemented | Regression assertion |
| TA-058 | Import beat-aligned MusicXML harmony offsets | Implemented / unverified | DOM importer logic; browser and MuseScore round trip pending |
| TA-059 | Verify complete Vue build and browser interaction | Pending | Dependencies unavailable in this runtime |
| TA-060 | Extend harmonic events to fractional-beat positions | Planned | Requires timing-aware editor and additional XML tests |
| TA-061 | Restrict documentation to exactly three files | Done | Only `README.MD`, `PROJECT-GOALS.MD`, `PROJECT-BOARD.MD` |

### v0.7 verification

- [x] 22 regression checks pass, including new chord timing and MusicXML tests.
- [x] TypeScript domain model compiles with system `tsc`.
- [x] Generated MusicXML parses and passes per-part measure-duration checks.
- [ ] Full Vue production build with npm dependencies.
- [ ] Browser UX, import/save and actual MuseScore 4 import.

## v0.8 — New blank song

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-062 | New blank song action and setup panel | Implemented | UI source; browser UX pending |
| TA-063 | Configurable title, measure count, meter and BPM | Implemented | Domain validation regression |
| TA-064 | No demo notes, chord symbols or fabricated accompaniment | Implemented | Blank-generation regression |
| TA-065 | Empty harmony entry and clearing chords | Implemented | Parser and generator regression |
| TA-066 | Export blank measures as valid MusicXML rests | Implemented | Duration preflight regression; MuseScore pending |
| TA-067 | Confirmation before replacing an unsaved project | Implemented | UI source; browser interaction pending |
| TA-068 | Browser interaction and MuseScore 4 acceptance | Pending | Requires Vue runtime and MuseScore 4 |
| TA-069 | Keep exactly three documentation files | Done | README.MD, PROJECT-GOALS.MD, PROJECT-BOARD.MD |


## v0.9 — Section key signatures

| ID | Story / task | Status | Verification / follow-up |
|---|---|---|---|
| TA-050 | Store and edit major/minor key per section | Done | `sectionKeys`, Song Overview, Lead Sheet and Orchestration controls |
| TA-051 | Show section keys in Song Overview | Done | Section + key shown in each measure header |
| TA-052 | Export key signature changes to all MusicXML parts | Done | `<fifths>` and `<mode>` at each key transition; regression |
| TA-053 | Display relative major/minor changes despite shared accidentals | Done | Text direction above Piano at section boundaries |
| TA-054 | Keep key changes independent of notes and chords | Done | Data model separation; regression |
| TA-055 | Apply global transpose to keys alongside notes and harmony | Done | Regression for Dm→Em and F→G |
| TA-056 | Persist and load section keys in `.tango` projects | Done | JSON persistence; legacy projects receive editable first-chord guess |
| TA-057 | Read imported MusicXML key signatures | Partial | Basic key changes read and mapped to sections on melody import; browser test pending |
| TA-058 | Improved enharmonic spelling in tonal context | Partial | Diatonic spelling + minor raised leading tone; chromatic voice-leading pending |
| TA-059 | End-to-end MuseScore 4 display verification | Planned | Need to open exported score in MuseScore 4 and check section text, signatures and warnings |
| TA-060 | Vue production build / CI verification | Planned | Dependencies not available in this execution environment |

**v0.9 execution:** implemented UI, project model, MusicXML export/import key handling and automated tests. The full browser build and MuseScore 4 application test have **not** been completed.

## v1.0 — Song structure and rehearsal letters

| ID | Story / task | Status | Verification / remaining work |
|---|---|---|---|
| TA-081 | Default new song to five 16-measure sections (A–E) | Done | `blankProject()` regression: 80 bars, five spans |
| TA-082 | Choose section count and common length when creating a song | Done | UI source and custom-length regression; browser UX not run |
| TA-083 | Edit individual section lengths, add and remove sections in Song Overview | Done | Section editor, input constraints and confirmation prompts; browser UX not run |
| TA-084 | Preserve chords/melody and remap per-measure overrides on section resize | Done | Regression for relative measure positions, role and articulation remapping |
| TA-085 | Prevent silent data loss on structural edits | Partial | UI confirms shrinking and score/protection invalidation; imported score remapping not implemented |
| TA-086 | Export sequential alphabetical MusicXML rehearsal marks | Done | Regression checks first-part `<rehearsal>` A–E and legacy label migration |
| TA-087 | Preserve per-section key signatures and dynamics when renaming/reordering sections | Done | Section remapping in domain model; visual browser QA pending |
| TA-088 | Update exactly the three permitted documentation files | Done | `README.MD`, `PROJECT-GOALS.MD`, `PROJECT-BOARD.MD` only |
| TA-089 | Full Vue production build and browser interaction | Blocked | npm registry DNS failure (`EAI_AGAIN`); no browser build verification |
| TA-090 | Open exported score in MuseScore 4 and confirm rehearsal marks | Pending | MuseScore 4 unavailable in this runtime |

**v1.0 verification:** 43 standalone regression checks passed. TypeScript domain and MusicXML export modules passed a strict typecheck with temporary external-library declarations. The MusicXML duration checker passed on custom section lengths. The source archive is validated separately. No MuseScore 4 compatibility claim is made until a real import succeeds.

## v1.1 — Blank-song section editor

| Item | Status | Verification |
|---|---|---|
| Editable per-section measure counts during New blank song | Implemented | UI input bindings and domain tests |
| Default A–E with 16 measures each; section count adjustable | Implemented | `blankProject()` regression |
| Live total and optional uniform-length action | Implemented | UI source; browser interaction not verified |
| Alphabetical rehearsal letters for customized blank-song structures | Implemented | MusicXML regression |

The full Vue production build and MuseScore import are still unverified in this environment.

## v1.3 — Guided instrument note editor

| ID | Work item | Status | Evidence / caveat |
|---|---|---|---|
| TA-083 | Instrument-measure piano-roll entry and deletion | Implemented | Clickable pitch/beat grid, quarter/eighth/sixteenth resolution; browser QA pending |
| TA-084 | Role/key/chord-aware pitch palette | Implemented | Major/natural minor and beat-specific chord tones; filters are advisory |
| TA-085 | Note property editing | Implemented | MIDI pitch, beat, duration, velocity, articulation and violin technique |
| TA-086 | Preserve manual notes through regeneration | Implemented | Protected importedScore store and merge; regression tests pass |
| TA-087 | Reset a single manual instrument-measure | Implemented | Other protected measures preserved in regression |
| TA-088 | MusicXML export of manual notes | Implemented / unverified in MuseScore | Duration preflight passes; actual MuseScore 4 import pending |
| TA-089 | Browser / Vue build verification | Pending | npm dependencies unavailable; SFC compilation not confirmed |

**Verification:** 56 standalone regression checks passed. The new piano roll is a prototype and does not enforce complete instrument-specific playability, harmonic correctness or voice leading.


## v1.3: section-aware inline lead-sheet harmony

The Lead Sheet groups measures into labeled sections with key signatures and measure ranges. Section keys can be edited in their headers without changing pitches. Each measure has an inline chord-sequence input (Enter or blur to commit; Escape to discard); a measure-number button selects the melody editor. The Song Overview measure headers also expose inline chord inputs, while the expanded harmony editor remains available. Invalid chord sequences are rejected without changing the project.


## v1.4: Copy chords between sections

Historically, the Lead Sheet used a **Copy section chords** panel with source and destination selectors and an explicit overwrite confirmation. In v5.0, this is replaced by source and destination section-header controls. It copies the complete chord sequence (including multiple chords per measure and empty measures) by measure position, leaving melody, section keys, instrument roles, manually edited notes, and protection flags untouched. When section lengths differ, only the first `min(source measures, destination measures)` measures are copied; extra destination measures remain unchanged. Generated accompaniment is refreshed after a change while protected manual notes are retained. Source chord strings are validated before any change. The operation is reversible by re-entering harmony or loading an earlier `.tango` save; there is no general undo stack.

## v1.5: local library and note audition

| ID | User story / engineering task | Status | Release | Evidence / outstanding work |
|---|---|---|---|---|
| TA-053 | Debounced autosave to browser IndexedDB, even for unnamed songs | Done (browser verification pending) | v1.5 | `src/localProjects.ts`, `src/App.vue`; simulated CRUD tests |
| TA-054 | Select, restore, duplicate and delete multiple locally saved songs | Done (browser verification pending) | v1.5 | Stable song IDs, sidebar selector, confirmed delete |
| TA-055 | Restore last-opened song and preserve manually edited notes | Done (browser verification pending) | v1.5 | Complete project snapshots and last-opened pointer |
| TA-056 | Audition notes when clicked in piano roll, pitch labels and event list | Done (audio verification pending) | v1.5 | Tone.js synth; toggle; global transposition applied |
| TA-057 | IndexedDB schema migration, quota handling, automated browser E2E | Planned | Future | Not covered by simulated tests |

**Release verification:** Existing generator/MusicXML regressions plus `tests/local-library.cjs` with a simulated IndexedDB implementation. Full Vue production build, real browser persistence, audio playback, and MuseScore 4 import remain unverified.


## v1.6: Bandoneon I defaults and lead-sheet chord keyboard workflow

- New songs default **Bandoneon I** to follow **Violin II**, using the `adapt` method, in every section. **Bandoneon II** retains its existing independent/section-specific orchestration. Existing saved songs keep their explicit follow settings. Change following under Orchestration → Bandoneon following.
- In Lead Sheet, **Enter** validates/saves the chord sequence and focuses the next measure's chord field, including across section boundaries. **Tab** and **Shift+Tab** move directly among chord inputs (native tab behavior resumes at the grid edges). Invalid entries are rejected and the previous harmony is restored.
- A contextual chord-completion menu appears when typing a chord root. Arrow keys navigate suggestions; Enter accepts a highlighted suggestion; clicking a suggestion inserts it without moving to another measure. The completion replaces only the comma-delimited chord under the caret, preserving other chord slots.
- Diminished chord syntax: `Ddim` or `D°` (diminished triad), `Ddim7` or `D°7` (fully diminished seventh), `Dm7b5` or `Dø7` (half-diminished seventh). The chord-tone generator distinguishes these pitch-class sets.
- This is a keyboard-first entry aid, not an exhaustive jazz-chord grammar or spell-checker for arbitrary extensions.

## v1.7: Direct editing navigation

| ID | User story / engineering task | Status | Release | Evidence / outstanding work |
|---|---|---|---|---|
| TA-091 | Double-click a map instrument-measure to edit its notes | Done (browser verification pending) | v1.7 | `src/App.vue` cell double-click opens exact instrument and measure; single-click selection unchanged |
| TA-092 | Enter on focused map cell opens notes; Space retains selection | Done (browser verification pending) | v1.7 | Keydown handler, accessible label and tooltip |
| TA-093 | Navigate adjacent measures in Note Editor and return to focused map cell | Done (browser verification pending) | v1.7 | Buttons, `[`, `]`, `Escape`, editable-control guards, focus restoration |
| TA-094 | Direct note-edit access from Score Review note list | Done (browser verification pending) | v1.7 | Double-click note list; explicit Edit notes button retained |
| TA-095 | Double-click Lead Sheet measure number to focus melody editor | Done (browser verification pending) | v1.7 | Focus after Vue DOM update, without changing chord entry |
| TA-096 | Real-browser keyboard/mouse navigation E2E test | Planned | Future | Vue build dependencies and browser runner unavailable in this environment |

**Verification:** 71 existing music/export regressions + 6 local-library/audio wiring checks + 8 new navigation checks = **85 passing checks**. Vue script TypeScript parse passes; full Vue production build and browser behavior are not verified.

## v1.8: Unrestricted chromatic entry within instrument range

- **Done:** Every semitone in the note-editor grid is clickable, irrespective of chord, key, role, or difficulty. Harmonic coloring remains informational.
- **Done:** Editor pitch labels support automatic key-based, sharp, or flat spellings. MIDI pitch and playback do not change.
- **Done:** Regression coverage for chromatic melody/bass entries, regeneration protection, MusicXML export, and UI wiring.
- **Planned:** User-selectable per-note enharmonic spelling persisted into MusicXML (the current exporter infers spelling from section key).
- **Verification limit:** Full Vue production build, browser note interactions, and actual MuseScore 4 import still require local validation.


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

## v3.1.0 — Duration rendering and touch interaction
- [x] Replace onset-only grid coloring and misplaced resize handles with proportional note bars spanning their full written durations.
- [x] Add duration slider, immediate numeric input, explicit measure-end limits and user feedback.
- [x] Capture touch pointer on the stable grid scroller and preserve selected note across pitch reordering.
- [x] Add real duration arithmetic and protected-score persistence regression checks.
- [ ] Verify touch resizing on physical mobile browsers and complete Vue/Vite production build.


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
- Main navigation uses descriptive labels without numeric prefixes. The app opens in Orchestration, and the Note Editor returns there.


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

## v5.5.1 - Voice lyrics and built-in roster templates (2026-11-16)

- Voice Note Editor: enter a lyric syllable and select single/begin/middle/end for the selected note. Saved as note metadata with protected manual edits.
- MusicXML export: lyrics use `<lyric number="1"><syllabic>...</syllabic><text>...</text></lyric>` on the first onset, XML-escaped; tie continuations do not duplicate the syllable. MusicXML import reads lyric syllables into imported notes.
- Built-in roster templates: Quartet, Sextet, Septet and Orquesta típica, plus the original factory seven-part roster. User presets remain local and editable; built-in templates cannot be overwritten/deleted.
- Verification: source assertions and existing regression tests run; no browser or MuseScore GUI verification.

### v5.5.2 — experimental lyric editor enhancements
- Added measure-level text-to-note lyric alignment for vocal parts, with hyphenated syllables and underscore continuation placeholders.
- Added a second lyric verse per note and corresponding MusicXML import/export fields.
- Added melisma start markers in MusicXML and note properties for both verses.
- Verification: existing core regression checks and updated source checks passed. Production build and MuseScore import remain unverified; full melisma end/continue semantics are not implemented.
