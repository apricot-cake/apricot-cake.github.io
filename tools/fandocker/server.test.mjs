import { test } from 'node:test';
import { get } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { startServer } from './server.mjs';
import { parse } from 'yaml';

test('保存、再起動、親子タグ、競合、外部アクセス、元画像の保持', async () => {
  const temp=await mkdtemp(path.join(os.tmpdir(),'tagger-test-'));
  await writeFile(path.join(temp,'sample.png'),'original-image');
  const dataDir=path.join(temp,'data');
  let server=await startServer({folder:temp,dataDir,port:0});
  let base=`http://127.0.0.1:${server.address().port}`;
  const put=doc=>fetch(base+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(doc)});
  try {
    const boot=await (await fetch(base+'/api/state')).json();
    assert.deepEqual(boot.files,['sample.png']);
    const doc={...boot.document,context:boot.context,tags:[{id:'work',name:'作品'},{id:'character',name:'キャラ',parent:'work'}],images:{'sample.png':['character']}};
    assert.equal((await put(doc)).status,200);
    assert.equal((await put(doc)).status,409);
    assert.equal((await put({...doc,revision:1,images:{'sample.png':['missing']}})).status,400);
    assert.equal((await fetch(base+'/api/state',{method:'PUT',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify(doc)})).status,403);
    assert.equal(await new Promise((resolve,reject)=>get(base+'/api/state',{headers:{Host:'example.com'}},r=>{r.resume();resolve(r.statusCode)}).on('error',reject)),403);
    assert.equal((await fetch(base+'/images/unknown.png')).status,404);
    assert.deepEqual(parse(await (await fetch(base+'/api/export?kind=tags')).text()),doc.tags);
    assert.deepEqual(parse(await (await fetch(base+'/api/export?kind=illustrations')).text())[0].tags,['character']);
    await new Promise(resolve=>server.close(resolve));
    server=await startServer({folder:temp,dataDir,port:0}); base=`http://127.0.0.1:${server.address().port}`;
    const restored=await (await fetch(base+'/api/state')).json(); assert.deepEqual(restored.document.images,doc.images);
    assert.equal((await put({...restored.document,context:restored.context,images:{'sample.png':[]}})).status,200);
    assert.deepEqual(parse(await readFile(path.join(dataDir,'catalog.yaml.bak'),'utf8')).images,doc.images);
    assert.equal(await readFile(path.join(temp,'sample.png'),'utf8'),'original-image');
  } finally { await new Promise(resolve=>server.close(resolve)); await rm(temp,{recursive:true,force:true}); }
});



test('フォルダー切り替えは選択先のYAMLを読み、古い画面からの保存を拒否する', async () => {
  const temp=await mkdtemp(path.join(os.tmpdir(),'tagger-folder-'));
  const {mkdir}=await import('node:fs/promises');
  const first=path.join(temp,'first'), second=path.join(temp,'second');
  await mkdir(first); await mkdir(second);
  await writeFile(path.join(first,'one.png'),'one'); await writeFile(path.join(second,'two.png'),'two');
  await writeFile(path.join(second,'catalog.yaml'),'version: 1\nrevision: 0\ntags: []\nimages: {}\n');
  let choice=second;
  const server=await startServer({folder:first,port:0,chooseFolder:async()=>choice});
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const old=await (await fetch(base+'/api/state')).json();
    const switched=await (await fetch(base+'/api/folder',{method:'POST',headers:{'X-Tagger-Context':old.context}})).json();
    assert.deepEqual(switched.files,['two.png']); assert.equal(switched.dataDir,second);
    assert.equal((await fetch(base+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...old.document,context:old.context})})).status,409);
    assert.equal((await fetch(base+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...switched.document,context:switched.context})})).status,200);
    choice=null;
    assert.equal((await (await fetch(base+'/api/folder',{method:'POST',headers:{'X-Tagger-Context':switched.context}})).json()).cancelled,true);
    assert.equal((await (await fetch(base+'/api/state')).json()).folder,second);
  } finally { await new Promise(resolve=>server.close(resolve)); await rm(temp,{recursive:true,force:true}); }
});

test('JSONの最新編集をYAMLへ一度だけ移し、移行前データを保持する', async () => {
  const temp=await mkdtemp(path.join(os.tmpdir(),'fandocker-migrate-'));
  const {readdir}=await import('node:fs/promises');
  const old='version: 1\nrevision: 0\ntags: []\nimages: {}\n';
  const latest={version:1,revision:7,tags:[{id:'work',name:'作品'}],images:{'sample.png':['work']}};
  await writeFile(path.join(temp,'sample.png'),'original');
  await writeFile(path.join(temp,'catalog.yaml'),old);
  await writeFile(path.join(temp,'.tagger-catalog.json'),JSON.stringify(latest));
  let server;
  try {
    server=await startServer({folder:temp,port:0});
    const base=`http://127.0.0.1:${server.address().port}`;
    const boot=await (await fetch(base+'/api/state')).json();
    assert.deepEqual(boot.document,latest);
    assert.equal('destination' in boot,false);
    assert.deepEqual(parse(await readFile(path.join(temp,'catalog.yaml'),'utf8')),latest);
    const names=await readdir(temp);
    assert.equal(names.includes('.tagger-catalog.json'),false);
    assert.equal(await readFile(path.join(temp,names.find(n=>n.startsWith('catalog.yaml.before-migration-'))),'utf8'),old);
    assert.deepEqual(JSON.parse(await readFile(path.join(temp,names.find(n=>n.startsWith('.tagger-catalog.json.migrated-'))),'utf8')),latest);
    assert.equal((await fetch(base+'/api/copy',{method:'POST'})).status,405);
    assert.equal((await fetch(base+'/api/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...latest,context:boot.context,images:{'sample.png':[]}})})).status,200);
    await new Promise(resolve=>server.close(resolve));server=null;
    server=await startServer({folder:temp,port:0});
    const restored=await (await fetch(`http://127.0.0.1:${server.address().port}/api/state`)).json();
    assert.equal(restored.document.revision,8);
    assert.deepEqual(restored.document.images,{'sample.png':[]});
    assert.equal(await readFile(path.join(temp,'sample.png'),'utf8'),'original');
  } finally {if(server)await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true})}
});
