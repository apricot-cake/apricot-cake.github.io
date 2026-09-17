import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { readdir, stat, lstat, realpath, mkdir, copyFile, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
const image = /\.(png|jpe?g|webp|gif|avif)$/i;
export function validName(name) {
  if (typeof name !== 'string' || !name.trim() || name !== name.trim() || /[<>:"/\\|?*]/.test(name) || [...name].some(c=>c.charCodeAt(0)<32) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || name.length>100) throw Error('フォルダー名に使えない名前です');
  return name;
}
export async function distinctFolders(source, destination) {
  const a=(await realpath(source)).toLowerCase(), b=(await realpath(destination)).toLowerCase();
  if(a===b || a.startsWith(b+path.sep) || b.startsWith(a+path.sep)) throw Error('元画像と整理先には、互いに含まれない別のフォルダーを選んでください');
}
export function createOrganizer() {
  const cache=new Map();
  let history=[];
  async function hash(file, fresh=false) {
    const info=await lstat(file); if(!info.isFile()||info.isSymbolicLink()) throw Error('通常の画像ファイルだけを扱えます');
    const key=`${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
    if(!fresh&&cache.get(file)?.key===key) return cache.get(file).hash;
    const digest=createHash('sha256'); for await(const chunk of createReadStream(file)) digest.update(chunk);
    const after=await stat(file); if(after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs) throw Error('画像が変更されました。再確認してください');
    const value=digest.digest('hex');cache.set(file,{key,hash:value});return value;
  }
  async function scan(source, destination, files) {
    await distinctFolders(source,destination);
    const index=new Map(), folders=[];
    async function walk(dir,parts=[]) {
      for(const entry of await readdir(dir,{withFileTypes:true})) {
        if(entry.isSymbolicLink()) continue;
        const next=path.join(dir,entry.name);
        if(entry.isDirectory()&&parts.length<2) {const p=[...parts,entry.name];folders.push(p);await walk(next,p)}
        else if(entry.isFile()&&image.test(entry.name)) {const h=await hash(next);index.set(h,[...(index.get(h)||[]),{path:next,parts}])}
      }
    }
    await walk(destination);
    const matches={};for(const file of files) matches[file]=index.get(await hash(path.join(source,file)))||[];
    return {matches,folders,canUndo:history.length>0};
  }
  async function copy(source,destination,plans) {
    await distinctFolders(source,destination);
    // 全件の分類先を検査してからファイルを作成する。
    for(const plan of plans) {if(path.basename(plan.file)!==plan.file) throw Error('画像名が不正です');if(!plan.targets.length) throw Error('分類先を選んでください');for(const parts of plan.targets) {if(parts.length<1||parts.length>2) throw Error('分類先が不正です');parts.forEach(validName)}}
    const created=[],errors=[];let skipped=0;
    for(const plan of plans) {
      try {
        const sourcePath=path.join(source,plan.file), digest=await hash(sourcePath,true);
        for(const parts of plan.targets) {
          let dir=destination;
          for(const name of parts) {dir=path.join(dir,name);await mkdir(dir,{recursive:true});const info=await lstat(dir);if(info.isSymbolicLink()||!info.isDirectory()) throw Error('リンク先フォルダーにはコピーできません')}
          const entries=await readdir(dir,{withFileTypes:true});let exists=false;
          for(const entry of entries) if(entry.isFile()&&image.test(entry.name)&&await hash(path.join(dir,entry.name))===digest) {exists=true;break}
          if(exists) {skipped++;continue}
          const ext=path.extname(plan.file), stem=path.basename(plan.file,ext);let target;
          for(let n=0;;n++) {target=path.join(dir,n?`${stem} (${n})${ext}`:plan.file);try {await copyFile(sourcePath,target,constants.COPYFILE_EXCL);break} catch(e) {if(e.code!=='EEXIST') throw e}}
          if(await hash(target,true)!==digest) {await unlink(target);throw Error('コピー中に元画像が変更されました')}
          created.push({path:target,hash:digest});
        }
      } catch(e) {errors.push(`${plan.file}: ${e.message}`)}
    }
    if(created.length) history.push(created);
    return {copied:created.length,skipped,errors};
  }
  async function undo() {
    const batch=history.at(-1);if(!batch) throw Error('取り消せるコピーがありません');
    for(const file of batch) if(await hash(file.path,true)!==file.hash) throw Error('コピー後に変更された画像があるため取り消せません');
    while(batch.length) {await unlink(batch.at(-1).path);batch.pop()}
    history.pop();
  }
  async function renameFolder(destination,parts,name) {
    parts.forEach(validName);validName(name);
    let old=destination;
    for(const part of parts) {old=path.join(old,part);const info=await lstat(old);if(info.isSymbolicLink()||!info.isDirectory()) throw Error('通常のフォルダーだけ名前を変更できます')}
    const next=path.join(path.dirname(old),name);if(next===old)return;
    try {await lstat(next);throw Error('同名フォルダーが存在します')} catch(e) {if(e.code!=='ENOENT')throw e}
    await rename(old,next);history=[];
  }
  return {scan,copy,undo,renameFolder,clearHistory(){history=[]}};
}
