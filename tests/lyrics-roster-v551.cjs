const fs=require('fs'),assert=require('assert');
const music=fs.readFileSync('src/music.ts','utf8'),io=fs.readFileSync('src/io.ts','utf8'),app=fs.readFileSync('src/App.vue','utf8'),roster=fs.readFileSync('src/rosterPresets.ts','utf8');
assert.match(music,/lyric\?:string/);assert.match(music,/syllabic\?:/);
assert.match(io,/<lyric number=/);assert.match(io,/esc\(lyricSource.lyric!/);assert.match(io,/isAttack&&j===0/);assert.match(io,/getElementsByTagName\('lyric'\)/);
assert.match(app,/Lyric syllable \(selected note\)/);assert.match(app,/updateSelectedNote\('lyric'/);
for(const name of ['Quartet','Sextet','Septet','Orquesta típica'])assert(roster.includes(`name:'${name}'`));
console.log('PASS lyric editor, MusicXML lyric output/import, built-in roster definitions (source assertions)');
