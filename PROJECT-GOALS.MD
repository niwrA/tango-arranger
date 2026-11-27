## Current product direction — intelligent musical editing and composition

The immediate product goal is to evolve Tango Arranger from an arrangement generator with a note editor into an integrated composition, arrangement, notation and practice environment. The ordered implementation backlog and desktop validation handoff are maintained in [PROJECT-BOARD.MD](PROJECT-BOARD.MD); that priority order supersedes older feature sequencing in this historical document.

- Score and note grid are equal editing surfaces, with synchronized selection, musical viewport and preview state; split view is supported. Preserve surface-specific gestures and detailed inspectors.
- Select, Create and Erase share one contextual, instrument-aware command system. Preview is independent of interaction mode; audition, commit/cancel and atomic undo/redo use the same musical edit result.
- Local role-aware composition, musical brushes and intelligent transformations should reuse the arrangement engine's harmony, rhythm, technique, difficulty and register knowledge. Generation must not implicitly change arrangement roles or overwrite existing material.
- Distinguish written and sounding pitch/duration, notation and playback expression, and selection, preview, playback and Tutor feedback. Keep instrument-specific constraints, manual assignments and protected difficulty editions intact.
- The shared editing infrastructure passes local build and regression checks and hosted CI. The project board records the verified desktop interactions and outstanding device and musical acceptance. Advanced graphical editing, overlays, brushes, optimization and expressive transformations remain on the roadmap. [Project board](PROJECT-BOARD.MD)

---

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

## v4.3.1 — Precise note positioning

The Note Editor always starts at a sixteenth-note (0.25 beat) snap grid, independently of instrument difficulty. A half-beat offset is therefore available for every instrument. Beat headers show sixteenth subdivisions, the two resize grips are narrower to keep a usable center drag target on short notes, and selected-note controls include explicit half-beat nudges. Notes remain constrained to the current measure and protected edits persist through regeneration and MusicXML export. Browser touch interaction remains unverified.

## v4.3.0 — Editor layout and collapsibility

Provide a focused tabbed instrument note editor with shared measure/instrument navigation and playback controls outside the tab content. Allow control sections throughout the application to be collapsed without affecting notes or persisted project data. Keep note editing immediately available and accessible with keyboard and screen reader semantics.

## v4.2.0 — Direct note manipulation

The Note Editor supports dragging a note horizontally to change its onset, vertically to change pitch, and diagonally to change both. Dragging the left resize grip changes the start while preserving the original end; dragging the right grip changes the end while preserving the start. Dragging is snapped to the current grid resolution and clamped to measure boundaries. Changes save to protected instrument-measures, survive regeneration and are exported as MusicXML.

## v4.1.1 — Azure TypeScript build fix

MusicXML note event projection explicitly retains the optional `subito` property used for per-note dynamics. Added a regression check to prevent TS2339 from returning. No change to arrangement behavior.

## v4.1.0 — Contrabass style options

Contrabass now has section and per-measure playing-style settings: traditional, pizzicato, arco legato, marcato, walking, and habanera. Styles affect generated rhythm, note length, articulation, and MusicXML technique markings where applicable. Settings persist in `.tango` projects, and protected manual measures are retained. The existing traditional bass pattern remains the default for older projects.

## Configurable live melody input keyboard (v4.0.0)

The live melody keyboard should be independently configurable by **start note** and **end note**, rather than being locked to one C-to-B octave. Display every chromatic note in the inclusive range within the current instrument's register, with usable touch targets and horizontal scrolling for wide ranges. Keep the rhythm-pad selected pitch within the visible keyboard range without discarding previously recorded draft notes. This is a view/input-range control, not a transposition or score-edit operation.

## Playback navigation (v3.9.0)

- [x] Offer explicit start-from-beginning and start-from-selected-measure playback controls.
- [x] Keep Stop separate, including when switching between start positions.
- [x] Use the song-wide selected measure and schedule remaining notes relative to that position.
- [ ] Verify playback navigation in a real browser after Azure deployment.

## v3.7.0 — Keyboard-accessible manual editing

The note and rhythm editors offer keyboard deletion, navigation and duration adjustments with input-safe handling and visible shortcut hints. Changes in the note editor persist to protected score measures; rhythm-grid changes remain drafts until explicitly applied.

# Tango Arranger v3.7 — Keyboard editing for notes and rhythm

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

## Browser audio activation (v2.6.2)
Audio must start only after a real user gesture. The application should not initialize Tone.js or Web Audio on page load; first playback or note audition synchronously creates and resumes an AudioContext, and subsequent actions reuse it. A blocked context must produce a useful error rather than silently failing. Browser-specific verification remains outstanding.

## v2.6.1 — Build compatibility

The Tone.js full-score playback path now converts its MIDI frequency wrapper to a numeric hertz value before invoking the synthesizer. This resolves the reported TS2345 type mismatch in the Azure build. CI should still run `npm run build` to catch future type errors before deployment.

## v2.6 notation quality

Keep rhythmic notation readable: encode performance length as a note gate, not a fractional written duration. Default piano figures have single bass notes in the F clef and chordal/melodic material in the G clef; preserve user-defined manual piano arrangements.

# Project goals — Tango Arranger

## Vision

Turn a simple tango lead sheet (melody plus harmony) into a usable, editable orquesta típica arrangement. The main value is **idiomatic, technically feasible orchestration**, not replacing MuseScore's engraving or a professional arranger's artistic judgment.

## v2.5 implementation direction

Keep Song Overview as the wide primary workspace. Provide reusable and adjustable musical figures for each instrument-measure, with section-level piano accompaniment choices and independent bass/chord staff behavior. Model tango-specific piano inversion movement, countermelody and response as editable heuristics rather than rigid stylistic rules. Preserve manual edits when regenerating other material.

Support expressive gestures independently of written duration: continuous pitch slides and single-note amplitude swells on sustain-capable instruments, plus instrument-specific crescendo/decrescendo spans across measures. Browser playback should approximate these effects; MusicXML must preserve score readability and honestly distinguish notated hairpins from textual approximations of unimplemented glissando engraving. True historical fidelity, instrument-specific physical playability and MuseScore import validation remain goals, not achieved claims.

## Musical objectives

1. **Tango-specific vocabulary:** marcato in four/two, syncopation, arrastre, yumba-inspired patterns, rubato/phrasing where supported, pizzicato/arco, melodic doubling, countermelody, chordal accompaniment and deliberate silence.
2. **Continuity without clutter:** each non-rest instrumental role should contribute over most relevant measures, especially Bandoneon II. Do not interpret high part activity as playing every beat; preserve purposeful gaps and occasional entire-measure rests.
3. **Idiomatic instruments:** piano with independent rhythmic/harmonic logic and shifting voicing registers; contrabass compás and register; playable violin arpeggios/double stops; bandoneon melodic and chordal interplay. Avoid simplistic note copies that exceed comfortable ranges.
4. **Difficulty-aware orchestration:** Easy/Intermediate/Advanced per ensemble and per instrument constrain technical complexity and register movement without silencing players by default.
5. **Dynamics and form:** dynamic contrast across sections, phrase crescendos, articulations and generated velocities coherent with printed indications. A/B/A/B/C is a starting point, not a compulsory form.
6. **Historical grounding:** profiles inspired by stylistic research on D'Arienzo, Di Sarli, Troilo, Pugliese, Canaro and Fresedo; distinguish documented characteristics from heuristics. Avoid claiming to imitate a specific recording or period with insufficient evidence.

**Violin chord-accompaniment objective (v2.2):** prefer one harmonically selected note per beat, in pizzicato or exceptionally short bowed tango staccato, with composer/style-inspired marcato placement that can be overridden for each violin and section. Keep beat placement and notation independent from playback sounding gates. Do not treat profile accent defaults as historically verified transcriptions.

**Editing-workflow objective (v2.3):** keep Song Overview as the default, high-frequency orchestration workspace. Separate structural form and section-key editing into a dedicated tab, retaining a compact key/form summary in the map and one-click navigation. Place the map and measure-range editor together for efficient instrument-level editing, with a responsive stacked layout on smaller screens.

## Technical and interoperability objectives

1. Local-first Vue/TypeScript interface, development port 8000 strict.
2. MIDI/MusicXML import, manual melody/chord entry, portable `.tango` ZIP.
3. MusicXML export with exact measure-duration coverage for every instrument and correct chord, tie, rest, meter, accent, direction and dynamics semantics. **Acceptance:** open exported score in MuseScore 4 without incomplete-measure warnings, supported by an actual application test.
4. Preserve manually edited measures on regeneration; eventually support robust three-way merging of imported MuseScore edits.
5. Explicit, safe 2/4 → 4/4 conversion where there is no harmonic/section loss; later extend the harmony schema to permit multiple chords per measure, pickups and changing meter.
6. Automated regression tests, later CI and a golden reference suite of score excerpts and playable arrangements.

## Architecture

Maintain a distinct **orchestration planning layer** between lead-sheet input and note rendering. It should assign phrase-based roles/density/technique, then realize them for each instrument using range, ergonomic and difficulty constraints, then render expression and MusicXML. v0.5 approximates this with section roles, per-measure heuristics and per-instrument options; a full explicit phrase-plan representation remains open.

## Milestone 4 design: rhythm source metadata and instrument-context actions

Rhythmic *timing* and a note's recorded *source* are separate concepts. User-applied preset snapping and retiming from the Rhythm Editor record original and target onset, target written duration, and originating preset (or edited grid). Identical timing entered freely is not labeled. Manual onset/length edits invalidate the old attribution; metadata survives protected notes and independent difficulty editions. MusicXML receives musical timing and accents, not proprietary provenance. Note Editor guides are contextual, do not force quantization outside a half-beat tolerance, and never retime old notes without explicit action. Contextual menus should be accessible with long touch press, desktop right-click and keyboard Menu/Shift+F10 without replacing ordinary click/Enter/Shift+click interactions.

## Milestone 3 architecture: phrase planner

The explicit orchestration layer now represents reviewed phrases (inclusive measure bounds within section boundaries) and, per part, the role, target active-measure percentage, placement in the phrase, articulation, and violin or contrabass technique. This is an opt-in deterministic planning tool, not audio/musicological phrase inference. Existing measure overrides retain priority, manually protected note data remains authoritative, and earlier project files without a plan preserve their generation behavior. A stale plan caused by song form, meter or ensemble changes is ignored until explicitly rebuilt. The planner realizes each active instrument at its independently selected difficulty and does not mutate stored alternative difficulty editions. Further musical-intelligence milestones will improve theoretical voice leading, technique-specific difficulty, and idiomatic string/bandoneon gestural generation.

## Acceptance tests and measurable outcomes

- Rhythm: all 7 exported parts have exactly the expected duration per complete 4/4 bar; no doubled clock advance for simultaneous notes.
- MusicXML importer: zero incomplete-measure warnings in MuseScore 4 for supported straightforward scores. This is currently **not yet verified**.
- Continuity: a full default demo generates content for Bandoneon II and its activity is inspectable. Explicit rest roles produce no notes in that section.
- Skill controls: easy piano is less dense and has less register travel than advanced; violin's constrained techniques remain playable by a documented conservative model.
- Dynamics: printed sectional dynamics/accent directions and MIDI-like velocities both reflect the same level setting; browser play remains approximate.
- Historical accuracy: compare selected transcribed rhythmic/voicing excerpts and listening judgments with generated output; record mismatches, not self-assigned authenticity scores.
- Round trip: protect edited instrument-measures from regeneration and report conflicts in future three-way merge implementation.

## Sources and limits

Refer to the scholarly and educational references in `README.MD`. Sources establish such principles as strong-beat accents, piano/bass foundation, bandoneon/violin melodic interplay, yumba and evolving Di Sarli styles. They **do not** establish universal 85% Bandoneon II measure activity, a fixed Pugliese voicing, or a universal difficulty rubric. All numeric values here are tuneable design defaults pending corpus evaluation.


## v0.5: transposition and articulation

- A non-destructive global semitone transposition, from -24 to +24, must affect rendered pitches, browser playback, chord names and MusicXML equally; persisted original notes must not drift after repeated changes.
- Edited MusicXML produced at transposed pitch must be mapped back to the project's source pitch on import.
- Default violin and bandoneon articulation should alternate rhythmic marcato/staccato and lyrical legato phases at an eight-measure cadence, with controlled differences between parts; treat the cadence as a user preference, not an established universal rule.
- Users can override each instrument's articulation in any selected measure and regenerate the score. Explicit `rest` roles stay silent.
- Violin expressive changes should distinguish bowed `arco` from plucked `pizzicato`; bandoneon should use `legato` rather than literal `arco`.
- Exported MusicXML should include accent/staccato notation and pass strict measure duration tests; MuseScore 4 acceptance remains a separate verification.
- Future: singer-range presets with tessitura detection, ergonomic bandoneon key-layout optimization, transposition-dependent revoicing and a richer phrase map for diverse historical orchestras.


## Song overview and measure editing (v0.6)

- Offer a song-wide, horizontally scrollable overview of all instrument-measures, showing role (melody, harmony, chords, bass, fill, variation, rest) and articulation (marcato/staccato, staccato, arco for violin, legato for bandoneon).
- Permit one-click focus of a measure/instrument and bulk application to a measure range, section or whole song. Support violin pizzicato, pizzicato arpeggio, arpeggio, double stops, sustained and block chord technique per measure.
- Model a sparse map of explicit per-measure role and technique overrides so defaults remain inherited and can be restored; explicit Rest remains silent. Document unfinished MuseScore and production-build verification.
- Keep exactly three repository documentation files: `README.MD`, `PROJECT-GOALS.MD`, `PROJECT-BOARD.MD`.

## v0.7 harmonic rhythm goals

- Support chord changes within a 4/4 measure without changing melody or instrumental orchestration roles.
- Provide the same simple chord editor from the Song Overview measure headings, instrument headings (focused measure), and Lead Sheet measure tiles.
- Interpret comma-delimited symbols as timed chord slots: `D,G` means D on counts 1–2 and G on 3–4; `D,D,D,G` means G arrives on count 4. Display the effective chord on every beat before applying.
- Use the active harmony when generating accompaniment, bass notes, arpeggios and second voices, including late-measure changes.
- Keep harmonic rhythm through global transposition, `.tango` persistence, MusicXML export and conservative 2/4 → 4/4 conversion.
- Reject malformed input and excessive chord slots instead of silently producing incorrect harmony.
- Preserve the musical distinction between harmonic changes (shared score context) and per-instrument orchestration roles (independently editable).

**Deferred:** off-beat harmony changes, enharmonic spelling optimization, score-aware harmonic validation, full MuseScore 4 round-trip verification and complex imported multi-voice scores.

## v0.8: blank composition workflow

- Offer a discoverable **New blank song** action with configurable title, bar count, tempo and meter; 4/4 tango is the default.
- Never prepopulate a new song with demo notes or placeholder chords. Until the user enters musical material, generation must remain silent and MusicXML must contain only correctly timed rests.
- Protect unsaved work with confirmation, retain existing import/save workflows and ensure entered melody/chords can be orchestrated immediately.
- Preserve a single shared harmony editor; empty chord input means no harmony, not an implicit C-major chord.


## Sectional tonality (v0.9)

- Support major and minor key signatures independently per musical section; relative major/minor contrast is a useful tango convention but is not mandatory.
- Treat **key signature**, **harmonic progression** and **global transpose** as three distinct concepts. A key change alone must not silently alter the musical pitches or the chord symbols.
- Export each key change in MusicXML on every staff, with both fifths and mode. Provide a visible section/key label for relative-key transitions sharing an accidental signature.
- Preserve section keys in portable projects and preserve/transpose them in MusicXML. Use a conventional key-signature spelling algorithm, with explicit future work for sophisticated enharmonic notation and non-diatonic modulation.
- Acceptance criteria: a 4/4 A1 D minor → B1 F major → A2 D minor score exports distinct mode metadata at measures 1, 9 and 17, displays labels for each transition, and retains complete rhythmic measures. Actual MuseScore 4 display remains an unverified integration criterion.

## Adjustable sectional form and notation (v1.0)

- **Default song structure:** 5 × 16 measures, 4/4 tango, with contiguous section labels A–E. This is a **user-selected product default**, not a universal musicological rule; historical tango forms vary.
- Allow the user to choose 1–26 sections and 1–128 measures per section (maximum 512 total), with individually adjustable section lengths after creation.
- Preserve chord sequences, melodies, section keys, role presets and instrument-level overrides when expanding or shifting sections; require confirmation before removing existing measures.
- Invalidate cached/generated/imported scores and protected-measure flags after structural changes because their absolute beat indices are no longer trustworthy. A future task is a safe three-way remapping of imported score edits.
- Export **alphabetical rehearsal marks** (A, B, C, D, E, …) at section boundaries in the top part of the MusicXML score, independent of legacy internal names. Export all section-specific key changes to every part.
- Acceptance: a blank default song has 80 measures and five section spans; resizing preserves the retained measure content and per-measure overrides; the exported MusicXML has the correct ordered rehearsal marks and complete durations.

## v1.1 blank-song creation requirements

- The new-song dialog must expose the same per-section measure lengths as the Song Overview structure editor, before creating the song.
- Default to five sections of 16 measures (A–E); allow 1–26 sections with individually configurable lengths (1–128 each, at most 512 total).
- The MusicXML export must emit alphabetical rehearsal marks at the beginning of each created section.

## v1.3 note-editor requirements

- Provide a lightweight instrument-specific piano roll with selectable measure, pitch, beat, duration and editable note properties. It must be reachable from Song Overview and Score Review.
- Surface effective per-measure role, difficulty, activity, articulation, technique, section key, instrument MIDI range, and harmony at the selected beat. Offer role-aware chord/key suggestions without prohibiting chromatic or manually chosen notes.
- Keep manual instrument-measure edits in the project, protect them during orchestra regeneration, and include them in MusicXML and browser playback. Permit resetting one edited measure without affecting other protected measures.
- Support a fully blank lead sheet: a manually added note should not fabricate notes in other parts. Validate pitch, onset, duration and measure bounds.
- Scope: this is not a full engraved staff editor, fingering optimizer or a music-theory correctness guarantee.


## v1.3: section-aware inline lead-sheet harmony

The Lead Sheet groups measures into labeled sections with key signatures and measure ranges. Section keys can be edited in their headers without changing pitches. Each measure has an inline chord-sequence input (Enter or blur to commit; Escape to discard); a measure-number button selects the melody editor. The Song Overview measure headers also expose inline chord inputs, while the expanded harmony editor remains available. Invalid chord sequences are rejected without changing the project.


## v1.4: Copy chords between sections

The Lead Sheet now has a **Copy section chords** panel with source and destination selectors and an explicit overwrite confirmation. It copies the complete chord sequence (including multiple chords per measure and empty measures) by measure position, leaving melody, section keys, instrument roles, manually edited notes, and protection flags untouched. When section lengths differ, only the first `min(source measures, destination measures)` measures are copied; extra destination measures remain unchanged. Generated accompaniment is refreshed after a change while protected manual notes are retained. Source chord strings are validated before any change. The operation is reversible by re-entering harmony or loading an earlier `.tango` save; there is no general undo stack.

## v1.5: local song library and audible note editing

- Maintain a stable, locally unique project identity independent of its user-editable title. Persist complete project state (including protected notes) to IndexedDB with debounced autosave and an explicit save control. Restore the most recently opened project after refresh.
- Support multiple local songs, including several unnamed songs, and safe switching, duplication and confirmed deletion. Do not depend on cloud services or logins. Clearly communicate that clearing browser storage can erase the local library and recommend portable `.tango` backups.
- Provide immediate pitch feedback on piano-roll cell clicks, pitch-label clicks and existing note selections. Use the existing Tone.js dependency, browser audio unlock on user gesture, and a toggle to disable note audition. Respect global transposition and do not alter note data when auditioning.
- Future: browser-based end-to-end tests, migration/versioning strategy for the local IndexedDB schema, storage quota handling, and more realistic per-instrument timbres.


## v1.6: Bandoneon I defaults and lead-sheet chord keyboard workflow

- New songs default **Bandoneon I** to follow **Violin II**, using the `adapt` method, in every section. **Bandoneon II** retains its existing independent/section-specific orchestration. Existing saved songs keep their explicit follow settings. Change following under Orchestration → Bandoneon following.
- In Lead Sheet, **Enter** validates/saves the chord sequence and focuses the next measure's chord field, including across section boundaries. **Tab** and **Shift+Tab** move directly among chord inputs (native tab behavior resumes at the grid edges). Invalid entries are rejected and the previous harmony is restored.
- A contextual chord-completion menu appears when typing a chord root. Arrow keys navigate suggestions; Enter accepts a highlighted suggestion; clicking a suggestion inserts it without moving to another measure. The completion replaces only the comma-delimited chord under the caret, preserving other chord slots.
- Diminished chord syntax: `Ddim` or `D°` (diminished triad), `Ddim7` or `D°7` (fully diminished seventh), `Dm7b5` or `Dø7` (half-diminished seventh). The chord-tone generator distinguishes these pitch-class sets.
- This is a keyboard-first entry aid, not an exhaustive jazz-chord grammar or spell-checker for arbitrary extensions.

## v1.7: Fast, contextual editing navigation

- Keep a single click in the Song Overview as an orchestration-selection action, but make a double click or Enter on the focused cell open the Note Editor at precisely that instrument/measure. Avoid altering the musical project simply by navigating.
- Offer previous/next measure controls within the Note Editor, boundary-safe keyboard shortcuts, and a return path to the original map cell with keyboard focus restored. Never intercept typing inside text, numeric, or select controls.
- Allow direct navigation from the Score Review note list and from a Lead Sheet measure number to its melody editor, without disrupting the existing chord-entry workflow.
- Verify wiring and keyboard guards with automated checks; add actual browser interaction and keyboard accessibility tests when the frontend build toolchain is available.

## v1.8: Chromatic freedom in the note editor

The note editor must permit chromatic and out-of-chord notes for all instruments, including melody, bass, and chord roles. Chord and key pitch-class coloring is advisory, never a restriction. The editor offers sharp/flat display labels without changing concert pitch; explicit per-note enharmonic export spelling is a separate future enhancement. Instrument range and measure bounds remain enforced.

## Articulation acceptance criteria (v1.9)

- Preserve rhythmic notation separately from audible note length. A written quarter note remains a quarter note in MusicXML even when performed as very short tango staccato.
- Make marcato louder and longer than tango staccato at equal base velocity, with user-editable per-note playback gate and base velocity.
- Encode staccato as a MusicXML dot and tango marcato as a strong-accent wedge with staccato, without relying solely on text directions.
- Make note-level articulation available for all instruments and retain it through protected-measure regeneration and local `.tango` saving.
- **Limitations:** exact playback gate is application-specific and does not round-trip as a standard MusicXML attribute; actual MuseScore rendering, instrument-specific samples and detailed historical calibration remain unverified.

## Measure-loop playback acceptance criteria (v2.0)

- The Note Editor can loop **only the currently selected instrument-measure** at the project tempo, with a clear play/stop toggle, keyboard shortcut and active-beat indication.
- Play sounding notes with their **current** pitch (plus global transposition), start beat, velocity and note-level articulation gate. Do not change written durations or exported MusicXML. Clip playback tails to the loop boundary.
- Re-read note events on each loop pass so manually edited notes are heard without restarting playback. Do not regenerate or modify project data merely to play a loop.
- Stop and cancel the loop when the instrument, measure, song or tab changes, and avoid overlapping the whole-arrangement playback transport.
- Test timing and state wiring without requiring a real browser. **Outstanding:** actual browser playback, browser automation and representative instrument samples.

## Piano grand-staff and chord-entry acceptance criteria (v2.1)

- Export one piano part with two staves, numbered G/F clefs, separate voice and staff tags, and an exact measure-duration backup between upper and lower voices. A bass note and an upper chord at the same beat must remain simultaneous, not sequential. Preserve articulation and key changes.
- Offer a piano-specific two-register note editor with independently adjustable visible octaves. Keep a single piano instrument, one loop and one protected measure per edit; persist an editable MIDI split pitch with a middle-C default. Do not silently change pitches when reassigning staves.
- Accept comma-separated repeated chords such as `C,C`, `C,G`, `C,C,C,G`. Filter chord suggestions based on the token under the caret and replace only that token on selection. Do not auto-commit incomplete sequences during typing. Save on Enter/Tab/blur, and reject malformed completed sequences without corrupting the previous harmony.
- Regression tests must validate independent staff durations and the comma-preserving token behavior. Real Vue/browser keyboard testing and actual MuseScore 4 import remain separate acceptance gates.

## v2.4 — Whole-measure arpeggio semantics

- Arpeggio and pizzicato arpeggio produce exactly four consecutive monophonic chord tones per complete measure, not repeated per accompaniment beat.
- Allow per-section, per-violin ascending, descending or alternating arpeggio direction, preserving settings in `.tango` and section resizing.
- Use the harmony at each of the four note onsets, including comma-separated mid-measure changes.
- Maintain written rhythmic durations for MusicXML, with pizzicato articulation and short local playback gate.
- Verify with regression tests; actual MuseScore 4 import and browser playback remain pending.


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

## v3.1.0 — Correct note duration rendering and editing
Render every note as a continuous horizontal piano-roll bar whose width represents its **written duration**, including off-grid onsets. Resize at the bar's real right edge, not at the onset grid cell. Keep touch pointer capture stable during rerender and pitch movement. Expose immediate duration editing with numeric, slider and +/- controls. Clamp at measure boundaries and preserve manual edits through generation, playback and MusicXML. Automated domain tests verify persistence; physical touch and browser acceptance remain outstanding.


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

## v5.5.1 addition

- Voice note lyrics should be stored on note events, remain with protected manual edits, and export to MusicXML using standard syllabic/text elements.
- Offer built-in quartet, sextet, septet and orquesta típica rosters, retaining the existing factory seven-part default and user-defined preset support.

### Lyric editing follow-up
Support multiple verses, per-measure lyric alignment and melisma marking without altering note timing or protected edits. Future work: full MusicXML melisma start/continue/stop semantics, multi-measure alignment, preview and MuseScore validation.
