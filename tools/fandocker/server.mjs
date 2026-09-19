import { pickFolder } from './folder-picker.mjs';
import { createServer } from 'node:http';
import { readFile, writeFile, rename, mkdir, readdir, copyFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { parse, stringify } from 'yaml';

const here = path.dirname(fileURLToPath(import.meta.url));
export async function startServer({ folder = process.env.TAGGER_IMAGES || 'C:/Users/apricot/local/media/描いた絵/upload', dataDir = process.env.TAGGER_DATA || folder, port = Number(process.env.PORT || 4317), dev = false, chooseFolder = pickFolder, openFolder = directory => spawn('explorer.exe', [directory], { windowsHide: true, detached: true, stdio: 'ignore' }).unref() } = {}) {
  folder = path.resolve(folder);
  dataDir = path.resolve(dataDir);
  let files = (await readdir(folder, { withFileTypes: true })).filter(f => f.isFile() && /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name)).map(f => f.name).sort((a,b) => a.localeCompare(b, 'en', {numeric:true}));
  const readDates = async (dir,names) => Object.fromEntries(await Promise.all(names.map(async name => {const info=await stat(path.join(dir,name));return [name,{modified:info.mtimeMs,created:info.birthtimeMs}]})));
  let dates = await readDates(folder,files);
  let fileSet = new Set(files);
  await mkdir(dataDir, { recursive:true });
  let storePath = path.join(dataDir, 'catalog.yaml');
  let document = await readCatalog(dataDir);
  function validate(doc) {
    if (!doc || doc.version !== 1 || !Number.isSafeInteger(doc.revision) || !Array.isArray(doc.tags) || !doc.images || Array.isArray(doc.images) || typeof doc.images !== 'object') throw Error('保存データの形式が不正です');
    const ids = new Set();
    for (const t of doc.tags) {
      if (!t || typeof t.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(t.id) || ids.has(t.id) || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 100 || (t.parent !== undefined && typeof t.parent !== 'string')) throw Error('タグの形式が不正です');
      ids.add(t.id);
    }
    for (const t of doc.tags) if (t.parent && !doc.tags.some(p => p.id === t.parent && !p.parent)) throw Error('キャラの親作品が見つかりません');
    const names = new Set();
    for (const t of doc.tags) { const key = `${t.parent || ''}\0${t.name.trim()}`; if(names.has(key)) throw Error('同じ名前のタグがあります'); names.add(key); }
    for (const [name, tags] of Object.entries(doc.images)) if (path.basename(name) !== name || !Array.isArray(tags) || tags.some(id => !ids.has(id)) || new Set(tags).size !== tags.length) throw Error('画像のタグが不正です');
  }
  async function readCatalog(dir) {
    const yamlPath = path.join(dir, 'catalog.yaml');
    const legacyPath = path.join(dir, '.tagger-catalog.json');
    let legacy;
    try { legacy = JSON.parse(await readFile(legacyPath, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (legacy) {
      validate(legacy);
      const suffix = randomUUID();
      try { await copyFile(yamlPath, yamlPath + '.before-migration-' + suffix + '.bak'); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const tmp = yamlPath + '.' + suffix + '.tmp';
      await writeFile(tmp, stringify(legacy), 'utf8');
      await rename(tmp, yamlPath);
      await rename(legacyPath, legacyPath + '.migrated-' + suffix + '.bak');
      return legacy;
    }
    let value = { version:1, revision:0, tags:[], images:{} };
    try { value = parse(await readFile(yamlPath, 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
    validate(value);
    return value;
  }
  const bootState=()=>({document,files,folder,dataDir,context,dates});
  let context = randomUUID();
  let picking = false;
  let vite;
  let queue = Promise.resolve();
  const send = (res, code, body) => { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
  const server = createServer(async (req,res) => {
    try {
      const actualPort = server.address().port;
      const host = req.headers.host;
      if (![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(host)) return send(res,403,{error:'許可されていない接続です'});
      if(req.headers.origin && ![`http://127.0.0.1:${actualPort}`,`http://localhost:${actualPort}`].includes(req.headers.origin)) return send(res,403,{error:'別のページからの操作はできません'});
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === '/api/state' && req.method === 'GET') {await queue;return send(res,200,bootState())}
      if (url.pathname === '/api/folder' && req.method === 'POST') {
        if (req.headers['x-tagger-context'] !== context) return send(res,409,{error:'フォルダーが変更されています。再読み込みしてください。'});
        if (picking) return send(res,409,{error:'フォルダー選択中です'});
        picking = true;
        try {
          const chosen = await chooseFolder();
          if (!chosen) return send(res,200,{cancelled:true});
          const job = queue.then(async () => {
            const nextFolder = path.resolve(chosen);
            const nextFiles = (await readdir(nextFolder,{withFileTypes:true})).filter(f=>f.isFile() && /\.(png|jpe?g|webp|gif|avif)$/i.test(f.name)).map(f=>f.name).sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
            const nextPath = path.join(nextFolder,'catalog.yaml');
            const next = await readCatalog(nextFolder);
            const nextDates = await readDates(nextFolder,nextFiles);
            dates=nextDates; folder=nextFolder; dataDir=nextFolder; storePath=nextPath; files=nextFiles; fileSet=new Set(files); document=next; context=randomUUID();
            send(res,200,bootState());
          });
          queue=job.catch(()=>{}); await job;
        } finally { picking=false; }
        return;
      }
      if (url.pathname === '/api/open-folder' && req.method === 'POST') {
        if (req.headers['x-tagger-context'] !== context) return send(res,409,{error:'フォルダーが変更されています。再読み込みしてください。'});
        await openFolder(folder);
        return send(res,204,{});
      }
      if (url.pathname === '/api/state' && req.method === 'PUT') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res,415,{error:'JSONが必要です'});
        let body = ''; for await(const chunk of req) { body += chunk; if(Buffer.byteLength(body)>2_000_000) return send(res,413,{error:'データが大きすぎます'}); }
        let next; try { next=JSON.parse(body); validate(next); } catch(e) { return send(res,400,{error:e.message}); }
        const job = queue.then(async () => {
          if(next.context !== context || next.revision !== document.revision) return send(res,409,{error:'別の画面で変更されています。再読み込みして確認してください。'});
          for(const name of Object.keys(next.images)) if(!fileSet.has(name) && !(name in document.images)) return send(res,400,{error:'存在しない画像です'});
          next = {version:1,revision:document.revision+1,tags:next.tags,images:next.images};
          const tmp = storePath + '.' + randomUUID() + '.tmp';
          await writeFile(tmp,stringify(next),'utf8');
          try { await copyFile(storePath,storePath+'.bak'); } catch(e) { if(e.code!=='ENOENT') throw e; }
          await rename(tmp,storePath);
          document=next;
          send(res,200,{revision:document.revision});
        });
        queue=job.catch(()=>{}); await job; return;
      }
      if(url.pathname === '/api/export' && req.method === 'GET') {
        const kind=url.searchParams.get('kind');
        const value=kind==='tags' ? document.tags : files.map(file => ({id:file.replace(/\.[^.]+$/,''),file,tags:document.images[file]||[]}));
        res.writeHead(200,{'Content-Type':'application/yaml; charset=utf-8','Content-Disposition':`attachment; filename="${kind==='tags'?'tags':'illustrations'}.yaml"`}); res.end(stringify(value)); return;
      }
      if(url.pathname.startsWith('/images/') && req.method==='GET') {
        const name=decodeURIComponent(url.pathname.slice(8));
        if(!fileSet.has(name)) return send(res,404,{error:'画像がありません'});
        const filePath=path.join(folder,name); const info=await stat(filePath);
        const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'};
        res.writeHead(200,{'Content-Type':types[path.extname(name).toLowerCase()],'Content-Length':info.size,'Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'});
        createReadStream(filePath).on('error',()=>res.destroy()).pipe(res); return;
      }
      if(req.method!=='GET') return send(res,405,{error:'対応していない操作です'});
      if (vite) { vite.middlewares(req,res,()=>send(res,404,{error:'ファイルがありません'})); return; }
      const requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      const dist=path.join(here,'dist'); const filePath=path.resolve(dist,requested);
      if(!filePath.startsWith(dist+path.sep)) return send(res,403,{error:'アクセスできません'});
      const data=await readFile(filePath);
      const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
      res.writeHead(200,{'Content-Type':mime[path.extname(filePath)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}); res.end(data);
    } catch(e) { if(!res.headersSent) send(res,e.code==='ENOENT'?404:500,{error:e.code==='ENOENT'?'ファイルがありません':e.message}); else res.destroy(); }
  });
  if (dev) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({root:here,server:{middlewareMode:true,hmr:{server}},appType:'spa'});
    server.on('close',()=>void vite.close());
  }
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  console.log(`Fandocker: http://127.0.0.1:${server.address().port}`);
  return server;
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await startServer({dev:!process.argv.includes('--production')});
