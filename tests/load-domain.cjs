/** Load the real TypeScript domain graph in Node, without a browser or bundler.
 * Cache modules before execution so ordinary CommonJS cycles keep working.
 * Individual suites may replace browser-facing packages without stubbing the
 * music, planning or edition logic under test. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const cp=require('node:child_process');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..');
const localRequire=createRequire(path.join(root,'package.json'));
let ts;
try{ts=localRequire('typescript');}
catch{ts=require(path.join(cp.execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim(),'typescript'));}

function createDomainLoader({imports={},globals={}}={}){
 const cache=new Map();
 function load(filename){
  const absolute=path.resolve(root,filename);
  if(cache.has(absolute))return cache.get(absolute).exports;
  if(absolute.endsWith('.json')){
   const value=JSON.parse(fs.readFileSync(absolute,'utf8'));
   cache.set(absolute,{exports:value});return value;
  }
  const mod={exports:{}};cache.set(absolute,mod);
  const source=fs.readFileSync(absolute,'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  function resolve(request){
   if(Object.prototype.hasOwnProperty.call(imports,request))return imports[request];
   if(request.startsWith('.')){
    const base=path.resolve(path.dirname(absolute),request);
    const next=[base,base+'.ts',base+'.js',base+'.json',path.join(base,'index.ts')]
     .find(candidate=>fs.existsSync(candidate)&&fs.statSync(candidate).isFile());
    if(!next)throw Error('Cannot resolve '+request+' from '+filename);
    return load(next);
   }
   // io.ts is compiled with TypeScript's default esModuleInterop=false.
   if(request==='jszip')return {default:localRequire(request)};
   return localRequire(request);
  }
  try{
   const names=Object.keys(globals);
   const execute=vm.runInThisContext('(function(require,module,exports'+(names.length?','+names.join(','):'')+'){'+code+'\n})',{filename:absolute});
   execute(resolve,mod,mod.exports,...Object.values(globals));
  }catch(error){cache.delete(absolute);throw error;}
  return mod.exports;
 }
 return load;
}
module.exports={createDomainLoader};
