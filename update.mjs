import express from 'express';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);
const repo = 'xiaoyu397/remote-viewer';
const curl = ['--disable','--fail','--silent','--show-error','--location','--proto','=https','--proto-redir','=https','--connect-timeout','12'];
const loopback = host => ['localhost','127.0.0.1','::1','[::1]','::ffff:127.0.0.1'].includes(host);

async function latestRelease() {
  const {stdout} = await run('curl', [...curl,'--max-time','30','https://api.github.com/repos/'+repo+'/releases/latest']);
  const data = JSON.parse(stdout);
  const asset = data.assets?.find(a => a.name === 'remote-viewer.tar.gz');
  if (!/^build-[a-f0-9]{12}$/.test(data.tag_name) || !/^sha256:[a-f0-9]{64}$/.test(asset?.digest))
    throw Error('发布包缺少有效版本或 SHA-256 校验信息');
  return {tag:data.tag_name, digest:asset.digest.slice(7)};
}

async function stageRelease(home, release, progress) {
  const store = path.join(home,'.updates');
  await fs.mkdir(store,{recursive:true});
  const temp = await fs.mkdtemp(path.join(store,'stage-'));
  try {
    const archive = path.join(temp,'release.tar.gz');
    const url = 'https://github.com/'+repo+'/releases/download/'+release.tag+'/remote-viewer.tar.gz';
    await run('curl',[...curl,'--max-time','180','--max-filesize','104857600','--output',archive,url]);
    progress('verifying');
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(archive)) hash.update(chunk);
    if (hash.digest('hex') !== release.digest) throw Error('下载包的 SHA-256 校验失败');
    await run('tar',['-xzf',archive,'--no-same-owner','--no-same-permissions','-C',temp],{timeout:60000});
    const unpacked = path.join(temp,'remote-viewer');
    const version = (await fs.readFile(path.join(unpacked,'REVISION'),'utf8')).trim();
    if (!/^[a-f0-9]{40}$/.test(version) || release.tag !== 'build-'+version.slice(0,12))
      throw Error('下载包的版本与发布记录不一致');
    for (const file of ['service.mjs','dist/index.html','dist/model.html']) await fs.access(path.join(unpacked,file));
    try { await fs.rename(unpacked,path.join(store,version)); }
    catch (error) { if (!['ENOTEMPTY','EEXIST'].includes(error.code)) throw error; }
    return version;
  } finally { await fs.rm(temp,{recursive:true,force:true}); }
}

export async function installUpdates(app, {base, host}) {
  let current = '';
  try { current = (await fs.readFile(path.join(base,'REVISION'),'utf8')).trim(); }
  catch {
    try { current = (await run('git',['-C',base,'rev-parse','HEAD'])).stdout.trim(); } catch {}
  }
  const home = process.send && process.env.RV_INSTALL_ROOT;
  let phase = home ? process.env.RV_UPDATE_PHASE || 'idle' : 'idle';
  let notice = home ? process.env.RV_UPDATE_NOTICE || '' : '';
  let checking, cached, checkedAt = 0;
  const check = () => {
    if (cached && Date.now()-checkedAt < 30000) return Promise.resolve(cached);
    if (!checking) checking = latestRelease().then(result => {
      cached=result; checkedAt=Date.now(); return result;
    }).finally(()=>{ checking=null; });
    return checking;
  };
  if (home) process.on('message', message => { if (message?.type==='active') phase='idle'; });
  const api = express.Router();
  app.use('/api/update',api);
  api.use((_req,res,next)=>{res.set('Cache-Control','no-store'); next();});
  function canInstall(req) {
    return Boolean(home && loopback(host) && loopback(req.socket.remoteAddress) && loopback(req.hostname)
      && !req.headers.forwarded && !req.headers['x-forwarded-for'] && !req.headers['x-forwarded-host']);
  }
  api.get('/status',(req,res)=>res.json({current,phase,notice,portable:Boolean(home),canInstall:canInstall(req)}));
  api.get('/check',async (_req,res)=>{
    try { const {tag}=await check(); res.json({tag, available:tag!=='build-'+current.slice(0,12)}); }
    catch { res.status(502).json({error:'无法检查 GitHub 更新，请检查服务器的网络连接及 curl。'}); }
  });
  api.post('/install',express.json({limit:'1kb'}),async(req,res)=>{
    if (!canInstall(req) || !req.is('application/json') || req.get('origin')!=='http://'+req.get('host'))
      return res.status(403).json({error:'请用本机或 SSH 转发的 localhost 地址打开免安装版。'});
    if (phase!=='idle') return res.status(409).json({error:'正在更新，请稍候。'});
    phase='checking'; notice='';
    let release;
    try {
      release = await check();
      if (release.tag!==req.body?.tag || release.tag==='build-'+current.slice(0,12)) {
        phase='idle'; return res.status(409).json({error:'版本信息已变化，请重新检查。'});
      }
    } catch {
      phase='idle'; return res.status(502).json({error:'无法获取 GitHub 发布信息。'});
    }
    phase='downloading';
    res.status(202).json({phase});
    try {
      const version=await stageRelease(home,release,step=>{phase=step;});
      phase='restarting';
      process.send({type:'activate',version});
    } catch (error) {
      phase='idle'; notice='更新失败，当前版本继续运行。'+error.message;
      console.error(notice);
    }
  });
}
