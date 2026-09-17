import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,unlink} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createOrganizer,distinctFolders} from './organizer.mjs';
import {startServer} from './server.mjs';
test('ハッシュ判定、複数分類、同名保護、再実行、変更済みコピーの取り消し保護',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tagger-organizer-'));
 try {
  const source=path.join(root,'source'),dest=path.join(root,'dest');await mkdir(source);await mkdir(dest);
  await writeFile(path.join(source,'a.png'),'a');await mkdir(path.join(dest,'作品','A'),{recursive:true});await writeFile(path.join(dest,'作品','A','別名.png'),'a');
  const o=createOrganizer();let result=await o.scan(source,dest,['a.png']);assert.equal(result.matches['a.png'].length,1);
  await mkdir(path.join(dest,'作品','B'));await writeFile(path.join(dest,'作品','B','a.png'),'different');
  const plans=[{file:'a.png',targets:[['作品','A'],['作品','B']]}];
  result=await o.copy(source,dest,plans);assert.equal(result.copied,1);assert.equal(result.skipped,1);assert.deepEqual(result.errors,[]);
  assert.equal(await readFile(path.join(dest,'作品','B','a.png'),'utf8'),'different');assert.equal(await readFile(path.join(source,'a.png'),'utf8'),'a');
  result=await o.copy(source,dest,plans);assert.equal(result.copied,0);assert.equal(result.skipped,2);
  await writeFile(path.join(dest,'作品','B','a (1).png'),'edited');await assert.rejects(o.undo());
  await writeFile(path.join(dest,'作品','B','a (1).png'),'a');await o.undo();assert.deepEqual(await readdir(path.join(dest,'作品','B')),['a.png']);
  await o.renameFolder(dest,['作品','A'],'C');assert.equal((await o.scan(source,dest,['a.png'])).matches['a.png'][0].parts[1],'C');
  await assert.rejects(o.renameFolder(dest,['作品','C'],'B'));await assert.rejects(o.copy(source,dest,[{file:'a.png',targets:[['..']]}]));await assert.rejects(distinctFolders(source,source));await assert.rejects(distinctFolders(root,dest));
  await unlink(path.join(dest,'作品','C','別名.png'));assert.equal((await o.scan(source,dest,['a.png'])).matches['a.png'].length,0);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('整理APIと設定復元、YAML引き継ぎ',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'tagger-copy-api-'));let server;
 try{
  const source=path.join(root,'source'),dest=path.join(root,'dest');await mkdir(source);await mkdir(dest);await writeFile(path.join(source,'a.png'),'image');
  await writeFile(path.join(source,'catalog.yaml'),JSON.stringify({version:1,revision:0,tags:[{id:'w',name:'作品'},{id:'c',name:'キャラ',parent:'w'}],images:{'a.png':['c']}}));
  server=await startServer({folder:source,port:0,chooseFolder:async()=>dest});let base=`http://127.0.0.1:${server.address().port}`;
  let state=await(await fetch(base+'/api/state')).json();const post=(route,data={})=>fetch(base+'/api/'+route,{method:'POST',headers:{'Content-Type':'application/json','X-Tagger-Context':state.context},body:JSON.stringify(data)});
  assert.equal((await post('destination')).status,200);let copied=await(await post('copy',{files:['a.png'],revision:0})).json();assert.equal(copied.result.copied,1);assert.equal(copied.classification.matches['a.png'].length,1);
  await new Promise(r=>server.close(r));server=await startServer({folder:source,port:0});base=`http://127.0.0.1:${server.address().port}`;state=await(await fetch(base+'/api/state')).json();assert.equal(state.destination,dest);assert.equal(state.classification.matches['a.png'].length,1);
  assert.equal((await post('rename-tag',{id:'c',name:'変更後'})).status,200);assert.equal(await readFile(path.join(dest,'作品','変更後','a.png'),'utf8'),'image');assert.ok(JSON.parse(await readFile(path.join(source,'.tagger-catalog.json'),'utf8')));
 }finally{if(server)await new Promise(r=>server.close(r));await rm(root,{recursive:true,force:true})}
});
