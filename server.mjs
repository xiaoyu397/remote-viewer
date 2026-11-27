import {installCheckpoints} from './checkpoint.mjs';
import {installVideo} from './transcode.mjs';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
const {values:o}=parseArgs({options:{root:{type:'string',default:'.'},port:{type:'string',default:'8080'},host:{type:'string',default:'127.0.0.1'}}});
const root=await fs.realpath(o.root), base=path.dirname(fileURLToPath(import.meta.url));
const ext=new Set(['.ply','.splat','.ksplat','.spz','.sog']);
const allowed=p=>p===root||p.startsWith(root.endsWith(path.sep)?root:root+path.sep);
async function resolve(p){if(typeof p!=='string')throw Error('Invalid path');const target=await fs.realpath(path.resolve(root,p));if(!allowed(target))throw Error('Outside model directory');return target;}
const app=express();app.disable('x-powered-by');
app.get('/api/list',async(req,res)=>{
  try {
    const dir = await resolve(req.query.path ?? '');
    const relative = path.relative(root,dir);
    if (relative.split(path.sep).some(x => x.startsWith('.'))) throw Error('Hidden directory');
    const entries = await fs.readdir(dir,{withFileTypes:true});
    const items = entries.filter(e => (e.isDirectory() || e.isFile()) && !e.name.startsWith('.'))
      .map(e => ({name:e.name, path:path.join(relative,e.name), directory:e.isDirectory()}));
    if (req.query.sizes !== '0') {
      await Promise.all(items.map(async item => {
        item.size = item.directory ? 0 : (await fs.stat(path.join(root,item.path))).size;
      }));
    }
    items.sort((a,b) => Number(b.directory)-Number(a.directory) || a.name.localeCompare(b.name));
    res.json({path:relative,items});
  } catch(e) { res.status(400).json({error:e.message}); }
});
app.get('/model/*parts',async(req,res)=>{try{const p=await resolve(req.params.parts.join('/'));if(path.relative(root,p).split(path.sep).some(x=>x.startsWith('.')))return res.sendStatus(403);const file=await fs.stat(p);if(!file.isFile())return res.sendStatus(403);res.set('X-Content-Type-Options','nosniff');res.set('Content-Security-Policy',"sandbox; default-src 'none'");if(!/\.(jpg|jpeg|jfif|png|webp|bmp|gif|avif|ico|svg|mp4|webm|ogv|mov|m4v|mkv|avi|mp3|wav|ogg|flac)$/i.test(p))res.type('application/octet-stream');res.sendFile(p,{dotfiles:'deny',acceptRanges:file.size>0});}catch{res.sendStatus(404);}});
installCheckpoints(app,resolve,root);
await installVideo(app,resolve,root);
app.use(express.static(path.join(base,'dist')));
app.listen(Number(o.port),o.host,()=>console.log(`GS Viewer: http://${o.host}:${o.port}\nModels: ${root}`));
