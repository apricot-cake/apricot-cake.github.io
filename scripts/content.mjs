import { S3Client, GetObjectCommand, PutObjectCommand, paginateListObjectsV2 } from '@aws-sdk/client-s3';
import { mkdir, mkdtemp, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const local = resolve(root, 'content');
const operation = process.argv[2];
if (!['pull', 'upload'].includes(operation)) throw new Error('pull または upload を指定してください。');
const required = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`未設定: ${missing.join(', ')}`);
const endpoint = new URL(process.env.R2_ENDPOINT);
if (endpoint.protocol !== 'https:' || !endpoint.hostname.endsWith('.r2.cloudflarestorage.com')) {
  throw new Error('R2_ENDPOINTにはR2のHTTPSエンドポイントを指定してください。');
}
const client = new S3Client({
  region: 'auto', endpoint: endpoint.href,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const Bucket = process.env.R2_BUCKET;

function target(base, key) {
  if (!/^(blog|pages|assets)\//.test(key) || key.includes('\\') || key.includes(':') || key.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`不正なコンテンツのパス: ${key}`);
  }
  const path = resolve(base, key);
  if (!path.startsWith(resolve(base) + sep)) throw new Error('保存先がコンテンツの範囲外です。');
  return path;
}

async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const key = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('コンテンツにシンボリックリンクは使用できません。');
    if (entry.isDirectory()) result.push(...await files(resolve(directory, entry.name), key + '/'));
    else if (entry.isFile()) result.push(key);
  }
  return result;
}

try {
  if (operation === 'upload') {
    const keys = await files(local);
    for (const key of keys) target(local, key);
    if (!keys.includes('pages/links.md')) throw new Error('pages/links.mdがありません。');
    for (const Key of keys) {
      await client.send(new PutObjectCommand({ Bucket, Key, Body: await readFile(target(local, Key)), StorageClass: 'STANDARD' }));
    }
    console.log(`${keys.length}ファイルをR2へアップロードしました。リモートの削除は行いません。`);
  } else {
    const keys = [];
    for await (const page of paginateListObjectsV2({ client }, { Bucket })) {
      for (const object of page.Contents ?? []) {
        if (object.Key?.endsWith('/')) continue;
        target(local, object.Key);
        keys.push(object.Key);
      }
    }
    if (!keys.includes('pages/links.md')) throw new Error('R2にpages/links.mdがありません。取得を中止しました。');
    const stage = await mkdtemp(resolve(root, '.content-download-'));
    for (const Key of keys) {
      const response = await client.send(new GetObjectCommand({ Bucket, Key }));
      if (!response.Body) throw new Error(`取得失敗: ${Key}`);
      const path = target(stage, Key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, await response.Body.transformToByteArray());
    }
    const backup = await mkdtemp(resolve(root, '.content-backup-'));
    let hadLocal = false;
    try { await rename(local, resolve(backup, 'content')); hadLocal = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(stage, local); }
    catch (error) {
      if (hadLocal) await rename(resolve(backup, 'content'), local);
      throw error;
    }
    console.log(`${keys.length}ファイルを取得しました。以前のローカル内容は${backup}に保存しました。`);
  }
} finally { client.destroy(); }
