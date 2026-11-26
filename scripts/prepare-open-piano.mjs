// Node 20+ and ffmpeg required. Generate optional, compact CC0 piano assets.
import {mkdir,writeFile,rm,rename,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=new URL('../public/samples/open-piano/',import.meta.url);
const output=decodeURIComponent(root.pathname);
const commit='c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e';
const anchors=['A#0','E1','A#1','E2','A#2','E3','A#3','E4','A#4','E5','A#5','E6','A#6','E7'];
const base='https://raw.githubusercontent.com/sgossner/VCSL/'+commit+'/Chordophones/Zithers/Grand%20Piano%2C%20Steinway%20B/NoSus/';
const temp=await mkdtemp(join(tmpdir(),'tango-piano-'));
try {
 await mkdir(output,{recursive:true});
 await rm(join(output,'manifest.json'),{force:true});
 for(const p of anchors){
  const url=base+encodeURIComponent('JHPiano_NoSus_Close_'+p+'_vl3_rr1.wav');
  const response=await fetch(url,{signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error('Download '+p+': '+response.status);
  const wav=join(temp,'source.wav');
  await writeFile(wav,Buffer.from(await response.arrayBuffer()));
  const name=p.replace('#','s')+'.mp3';
  const result=spawnSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-i',wav,'-ar','44100','-codec:a','libmp3lame','-b:a','128k',join(temp,name)],{stdio:'inherit'});
  if(result.status!==0)throw Error('ffmpeg failed for '+p);
  await rename(join(temp,name),join(output,name)).catch(async()=>{const {copyFile}=await import('node:fs/promises');await copyFile(join(temp,name),join(output,name));});
 }
 await writeFile(join(output,'manifest.json'),JSON.stringify({version:1,source:'VCSL Steinway B',license:'CC0-1.0',commit,anchors},null,2));
 console.log('Generated '+anchors.length+' piano samples.');
}finally{await rm(temp,{recursive:true,force:true});}
