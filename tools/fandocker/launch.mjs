import { spawn } from 'node:child_process';
const url='http://127.0.0.1:4317';
try {
  const response=await fetch(url+'/api/state');
  const body=await response.json();
  if(!response.ok || !Array.isArray(body.files) || !body.document) throw Error('別のアプリが同じポートを使っています');
} catch(e) {
  if(e.message==='別のアプリが同じポートを使っています') throw e;
  const { startServer } = await import('./server.mjs');
  await startServer({dev:true});
}
spawn('explorer.exe',[url],{windowsHide:true,detached:true,stdio:'ignore'}).unref();

