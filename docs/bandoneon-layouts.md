# Bandoneon pitch ranges

Ranges are sounding MIDI pitches (middle C is C4, MIDI 60). The Ensemble setting is per part. The default is the 142 Rheinische layout, including its playable bass register, not the narrower arranging preference.

| Model | Left-hand pitches | Right-hand pitches | Source |
| --- | --- | --- | --- |
| 142 Rheinische (tango) | C2–B4, without B♭4 on this chart | A3–B6, without B♭6 | [Bandonionfabrik 142 chart](https://bandonionfabrik.de/ES/assets/142.pdf) |
| 152 Rheinische extended (Gutjahr) | B1–B4 | G♯3–B6, without B♭6 | [Klaus Gutjahr's Argentinian system](https://www.klausgutjahr.de/argentinisches-system.html) |
| 144 Einheits (German) | C2–B♭4 | G3–A6 | [Bandonionfabrik 144 chart](https://bandonionfabrik.de/assets/144.pdf) |
| 146 Peguri (unisonoric) | F♯2–C♯5 | A3–B6 | [Bandonionfabrik Peguri chart](https://bandonionfabrik.de/assets/146p.pdf) |

These are specific layouts, not exhaustive definitions of every model sold with that key count. Pitches include either bellows direction. This list does not certify that a chord or passage is playable in one direction or with a given fingering. An explicit written staff is retained; otherwise a pitch available to just one hand is assigned to that hand and shared pitches use the display split.

Selecting a different model does not rewrite imported notes, protected measures, or saved copies. Changing the model affects newly generated material and the playable-note checks. Saved scores can still show existing out-of-model notes so they can be reviewed deliberately.

The bundled *Hasta Siempre Amor* removed the unplayable held D1 in the opening of each bandoneon part (measure 2). The valid D2s in both parts at measure 74 and the opening piano bass were retained. All example arrangements are checked by `node tests/bandoneon-range.cjs`.
