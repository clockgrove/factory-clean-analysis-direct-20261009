import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

const root=dirname(dirname(fileURLToPath(import.meta.url)));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical={bytes:812556,sha256:'c961927b45ee0205608382d14b481a5e3761c51304b3de09c7e5cc18a2f466ac'};
const generator=join(root,'data/generate.mjs'),fields=join(root,'data/FIELDS.md');

{
 const manifest=readFileSync(join(root,'package.json')),lock=readFileSync(join(root,'package-lock.json'));
 const pkg=JSON.parse(manifest);assert.equal(pkg.devDependencies.playwright,'1.64.0');
 const identity={manifest:hash(manifest),lock:hash(lock)},receipt=join(root,'.runtime/npm-installed.json');
 mkdirSync(dirname(receipt),{recursive:true});
 let ready=false;
 try {ready=JSON.stringify(JSON.parse(readFileSync(receipt,'utf8')))===JSON.stringify(identity)&&JSON.parse(readFileSync(join(root,'node_modules/playwright/package.json'),'utf8')).version==='1.64.0';}catch{}
 if(!ready){
  const output=execFileSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund','--cache',join(root,'.runtime/npm-cache')],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
  process.stdout.write(output);assert.equal(JSON.parse(readFileSync(join(root,'node_modules/playwright/package.json'),'utf8')).version,'1.64.0');
  writeFileSync(receipt,JSON.stringify(identity)+'\n');
 }
 assert.deepEqual(readFileSync(join(root,'package.json')),manifest);
 assert.deepEqual(readFileSync(join(root,'package-lock.json')),lock);
}

{
 const source=readFileSync(generator),meaning=readFileSync(fields);
 assert.equal(hash(source),'56122c733cf865cd70477a742dde306a3de5a878dda9c19bb418e87ed100cec3');
 assert.equal(hash(meaning),'24e2d874fdee93e1e74a6f563c0f680a041796a1ae06717550bfd36332f832e1');
 const path=join(root,'.runtime/incidents.json');
 if(existsSync(path)){const before=readFileSync(path);assert.equal(before.length,canonical.bytes);assert.equal(hash(before),canonical.sha256);}
 execFileSync(process.execPath,[generator],{cwd:root,timeout:10000});const first=readFileSync(path);
 execFileSync(process.execPath,[generator],{cwd:root,timeout:10000});const second=readFileSync(path);
 assert.deepEqual(second,first);assert.equal(first.length,canonical.bytes);assert.equal(hash(first),canonical.sha256);
 assert.deepEqual(readFileSync(generator),source);assert.deepEqual(readFileSync(fields),meaning);
 const rows=JSON.parse(first);assert.equal(rows.length,2400);assert.equal(new Set(rows.map(x=>x.id)).size,2400);
 assert.equal(new Set(rows.map(x=>x.openedAt.slice(0,10))).size,90);
 for(const row of rows){assert.deepEqual(Object.keys(row),['id','title','description','service','severity','status','openedAt','resolvedAt','team','region','tags']);assert.match(row.id,/^INC-[0-9]{6}$/);assert.ok(['critical','high','medium','low'].includes(row.severity));assert.ok(['open','in_progress','resolved'].includes(row.status));assert.equal(row.status==='resolved',row.resolvedAt!==null);assert.ok(Array.isArray(row.tags));}
 assert.equal(rows.filter(x=>x.description.includes('\n')).length,59);
 process.stdout.write(JSON.stringify({canonicalData:{...canonical,records:rows.length,uniqueIds:2400,utcDates:90,newlineDescriptions:59},generatorSourceSha256:hash(source),fieldMeaningSha256:hash(meaning),sourceAndRepeatedGeneratedBytesEqual:true})+'\n');
}
