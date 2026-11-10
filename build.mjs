import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import './renderer.js';
const root = new URL('./', import.meta.url);
const data = JSON.parse(await readFile(new URL('content.json',root),'utf8'));
const html = globalThis.YousifContent.page(data);
await writeFile(new URL('index.html',root),html);
await mkdir(new URL('dist/',root),{recursive:true});
const allowed = /\.(?:html|css|js|json|svg|xml|txt)$/;
for (const file of await readdir(root,{withFileTypes:true})) {
  if (file.name === 'data') { await cp(new URL('data/',root),new URL('dist/data/',root),{recursive:true}); continue; }
  if (!file.isFile() || !allowed.test(file.name) || ['package.json','package-lock.json','vercel.json','studio-app-manifest.json'].includes(file.name)) continue;
  await cp(new URL(file.name,root),new URL('dist/'+file.name,root));
}
console.log('Built Yousif.J0 static pages and assets.');
