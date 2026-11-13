# Project goals — Tango Arranger

## Vision

Turn a simple tango lead sheet (melody plus harmony) into a usable, editable orquesta típica arrangement. The main value is **idiomatic, technically feasible orchestration**, not replacing MuseScore's engraving or a professional arranger's artistic judgment.

## Musical objectives

1. **Tango-specific vocabulary:** marcato in four/two, syncopation, arrastre, yumba-inspired patterns, rubato/phrasing where supported, pizzicato/arco, melodic doubling, countermelody, chordal accompaniment and deliberate silence.
2. **Continuity without clutter:** each non-rest instrumental role should contribute over most relevant measures, especially Bandoneon II. Do not interpret high part activity as playing every beat; preserve purposeful gaps and occasional entire-measure rests.
3. **Idiomatic instruments:** piano with independent rhythmic/harmonic logic and shifting voicing registers; contrabass compás and register; playable violin arpeggios/double stops; bandoneon melodic and chordal interplay. Avoid simplistic note copies that exceed comfortable ranges.
4. **Difficulty-aware orchestration:** Easy/Intermediate/Advanced per ensemble and per instrument constrain technical complexity and register movement without silencing players by default.
5. **Dynamics and form:** dynamic contrast across sections, phrase crescendos, articulations and generated velocities coherent with printed indications. A/B/A/B/C is a starting point, not a compulsory form.
6. **Historical grounding:** profiles inspired by stylistic research on D'Arienzo, Di Sarli, Troilo, Pugliese, Canaro and Fresedo; distinguish documented characteristics from heuristics. Avoid claiming to imitate a specific recording or period with insufficient evidence.

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
