import {defineConfig,loadEnv} from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({mode})=>{
  const build=loadEnv(mode,process.cwd(),'VITE_').VITE_APP_BUILD_SHA;
  return {
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
