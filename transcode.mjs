import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
export async function installVideo(app, resolve, root) {
 const cache=await fs.mkdtemp(path.join(os.tmpdir(),'remote-viewer-'));
 const jobs=new Map(); let running=0;
 async function source(q){const p=await resolve(q);if(path.relative(root,p).split(path.sep).some(x=>x.startsWith('.'))||!/\.(mp4|webm|ogv|mov|m4v|mkv|avi)$/i.test(p))throw Error('不允许的视频路径');const s=await fs.stat(p);if(!s.isFile())throw Error('不是文件');return {p,key:createHash('sha256').update(JSON.stringify([p,s.size,s.mtimeMs])).digest('hex')};}
 function launch(p,key){const out=path.join(cache,key+'.mp4'), tmp=out+'.partial.mp4';const job={state:'running',progress:0};jobs.set(key,job);running++;let stderr='',done=false;const child=spawn(process.env.FFMPEG||'ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-threads','2','-i',p,'-map','0:v:0','-map','0:a:0?','-vf','scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-threads','2','-preset','fast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart','-progress','pipe:1','-y',tmp],{stdio:['ignore','pipe','pipe']});let buf='';child.stdout.on('data',b=>{buf+=b;let lines=buf.split('\n');buf=lines.pop();for(const l of lines)if(l.startsWith('out_time='))job.time=l.slice(9).trim();});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-2000);});async function finish(err){if(done)return;done=true;clearTimeout(timer);try{if(err)throw Error(err);await fs.rename(tmp,out);job.state='ready';}catch(e){job.state='error';job.error=e.message;await fs.rm(tmp,{force:true}).catch(()=>{});}finally{running--;}}const timer=setTimeout(()=>child.kill('SIGKILL'),2*60*60*1000);child.on('error',e=>finish(e.code==='ENOENT'?'服务器没有 FFmpeg，请先安装 ffmpeg':e.message));child.on('close',code=>finish(code===0?null:stderr||'FFmpeg 转码失败或超时'));return job;}
 app.post('/api/video/convert',async(req,res)=>{try{const {p,key}=await source(req.query.path);let j=jobs.get(key);if(!j||j.state==='error'){if(running>=1)return res.status(429).json({error:'已有视频正在转码，请稍后重试'});j=launch(p,key);}res.json({key,...j});}catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/video/status',async(req,res)=>{try{const {key}=await source(req.query.path);const j=jobs.get(key);if(!j)return res.sendStatus(404);res.json({key,...j});}catch(e){res.status(400).json({error:e.message});}});
 app.get('/api/video/play',async(req,res)=>{try{const {key}=await source(req.query.path);if(jobs.get(key)?.state!=='ready')return res.sendStatus(404);res.type('video/mp4');res.sendFile(path.join(cache,key+'.mp4'));}catch{res.sendStatus(404);}});
 console.log('Video cache (current session): '+cache);
}
