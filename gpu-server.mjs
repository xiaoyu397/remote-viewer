import express from 'express';
import {chromium} from 'playwright-core';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function validView(view) {
  const vector=(v,n) => Array.isArray(v) && v.length===n && v.every(Number.isFinite);
  return view && [view.width,view.height].every(n => Number.isInteger(n) && n>0 && n<=1600)
    && view.width*view.height<=1440000 && vector(view.position,3) && vector(view.quaternion,4)
    && Number.isFinite(view.fov) && view.fov>=20 && view.fov<=120 && Number.isFinite(view.near)
    && Number.isFinite(view.far) && view.near>0 && view.far>view.near && typeof view.flipped==='boolean';
}

export function installGpu(app,{enabled,root,resolve,models,dist}) {
  app.get('/api/gpu',(_req,res)=>res.json({enabled}));
  if (!enabled) return;
  const sessions=new Map();
  // Renderer pages load only this loopback server's viewer bundle and model route.
  const workerApp=express();
  workerApp.use(models,express.static(dist));
  const listener=workerApp.listen(0,'127.0.0.1');
  let launching;
  function browser() {
    if (!launching) {
      launching=chromium.launch({
        executablePath:process.env.GPU_CHROMIUM || '/usr/bin/chromium', chromiumSandbox:true,
        args:['--enable-gpu','--use-gl=angle','--use-angle=gl','--disable-software-rasterizer']
      }).then(instance=>{
        instance.once('disconnected',()=>{launching=undefined; sessions.clear();});
        return instance;
      }).catch(error=>{
        launching=undefined;
        console.error('GPU Chromium:',error.message);
        throw Error('服务器 Chromium 启动失败，请检查 GPU_CHROMIUM、沙箱和驱动');
      });
    }
    return launching;
  }
  async function close(id) {
    const session=sessions.get(id);
    sessions.delete(id);
    await session?.page?.close().catch(()=>{});
  }
  setInterval(()=>{
    for (const [id,s] of sessions) if (Date.now()>s.deadline) void close(id);
  },10000).unref();
  const api=express.Router();
  app.use('/api/gpu/sessions',api);
  api.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    if (req.method==='POST' && !req.is('application/json')) return res.sendStatus(415);
    next();
  },express.json({limit:'4kb'}));
  api.post('/',async(req,res)=>{
    let relative;
    try {
      const file=await resolve(req.body?.path);
      relative=path.relative(root,file);
      if (relative.split(path.sep).some(part=>part.startsWith('.')) ||
          !/\.(ply|splat|ksplat|spz|sog)$/i.test(relative) || !(await fs.stat(file)).isFile()) throw Error();
    } catch {return res.status(400).json({error:'无效的模型文件'});}
    if (sessions.size>=4) return res.status(429).json({error:'服务器的四个模型视窗均在使用中'});
    const id=randomUUID(), session={deadline:Date.now()+300000};
    sessions.set(id,session);
    res.once('close',()=>{if (!res.writableEnded) void close(id);});
    try {
      const page=await (await browser()).newPage({viewport:{width:64,height:64}});
      if (!sessions.has(id)) { await page.close(); throw Error('GPU 会话已关闭'); }
      session.page=page;
      await page.goto('http://127.0.0.1:'+listener.address().port+'/model.html?worker');
      await page.waitForFunction(()=>Boolean(window.gpuWorker));
      const info=await page.evaluate(p=>window.gpuWorker.load(p),relative);
      session.deadline=Date.now()+90000;
      res.json({id,...info});
    } catch (error) {
      await close(id);
      if (!res.destroyed) res.status(503).json({error:error.message});
    }
  });
  api.post('/:id/frame',async(req,res)=>{
    const id=req.params.id, session=sessions.get(id);
    if (!session?.page) return res.status(410).json({error:'GPU 会话已过期'});
    if (!validView(req.body)) return res.status(400).json({error:'无效的相机参数'});
    if (session.pending) return res.sendStatus(409);
    session.pending=true;
    session.deadline=Date.now()+90000;
    try {
      const data=await session.page.evaluate(view=>window.gpuWorker.frame(view),req.body);
      res.type('jpeg').send(Buffer.from(data,'base64'));
    } catch {
      if (!sessions.has(id)) return res.status(410).json({error:'GPU 会话已过期'});
      await close(id);
      res.status(503).json({error:'服务器渲染中断，请重试'});
    } finally {session.pending=false;}
  });
  api.delete('/:id',async(req,res)=>{await close(req.params.id); res.sendStatus(204);});
}
