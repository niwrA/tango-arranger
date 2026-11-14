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
