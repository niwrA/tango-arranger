const assert=require('node:assert/strict');
const {DOMParser}=require('@xmldom/xmldom');
const {createDomainLoader}=require('./load-domain.cjs');
const build='1234567890abcdef1234567890abcdef12345678';
const shell=new URL('https://arranger.example/');
const signal=new AbortController().signal;
let html=`<html><head><meta name="tango-build" content="${build}"/></head></html>`;
let reachable=true;
const {fetchAppBuild,appUpdateUrl,cleanAppUpdateUrl}=createDomainLoader({globals:{
 DOMParser,fetch:async(url,options)=>{
  assert.equal(url.href,shell.href);
  assert.equal(options.cache,'no-store');
  assert.equal(options.signal,signal);
  return {ok:reachable,text:async()=>html};
 },
}})('src/appUpdate.ts');

(async()=>{
 assert.equal(await fetchAppBuild(shell,signal),build);
 html='<html><head><meta name="tango-build" content="invalid"/></head></html>';
 assert.equal(await fetchAppBuild(shell,signal),null);
 reachable=false;
 assert.equal(await fetchAppBuild(shell,signal),null);
 const original='https://arranger.example/?existing=1#score';
 const update=appUpdateUrl(original,build);
 assert.equal(update.searchParams.get('__tango_build'),build);
 assert.equal(update.hash,'#score');
 assert.equal(cleanAppUpdateUrl(update.href,'0'.repeat(40)),null);
 assert.equal(cleanAppUpdateUrl(update.href,build).href,original);
 console.log('Update checks bypass the cache and reload URLs preserve existing view parameters.');
})().catch(error=>{console.error(error);process.exitCode=1;});
