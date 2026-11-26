import {defineConfig,loadEnv} from 'vite';
import vue from '@vitejs/plugin-vue';
import {execFileSync} from 'node:child_process';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'VITE_');
  let build=process.env.VITE_APP_BUILD_SHA||env.VITE_APP_BUILD_SHA||'';
  if(!build){
    try{build=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{/* Source archive without Git metadata. */}
  }
  if(!/^[a-f0-9]{40}$/i.test(build))build='';
  return {
    define:{'import.meta.env.VITE_APP_BUILD_SHA':JSON.stringify(build)},
    plugins:[
      vue(),
      {
        name:'tango-build-meta',
        transformIndexHtml(){
          return build?[{tag:'meta',attrs:{name:'tango-build',content:build}}]:[];
        },
      },
    ],
    server:{port:8000,strictPort:true},
  };
});
