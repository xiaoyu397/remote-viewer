// Run against the unpacked release so the launcher, archive layout and real HTTP
// handlers are tested together. Only the connection to GitHub is replaced.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const bundle=process.env.RV_TEST_BUNDLE;
test('portable updates verify, activate, survive restart and roll back', {skip:!bundle,timeout:90000}, async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'rv-update-test-'));
  const home=path.join(tmp,'installed'), assets=path.join(tmp,'fixture');
  await fs.cp(bundle,home,{recursive:true});
  await fs.mkdir(assets);
  const fakeBin=path.join(tmp,'bin');
  await fs.mkdir(fakeBin);
  await fs.writeFile(path.join(fakeBin,'curl'),`#!/usr/bin/env node
const fs=require('node:fs'),args=process.argv.slice(2),dir=process.env.TEST_RELEASE;
const index=args.indexOf('--output');
if(index<0) process.stdout.write(fs.readFileSync(dir+'/latest.json'));
else fs.copyFileSync(dir+'/asset.tgz',args[index+1]);
`,{mode:0o755});
  const modelDir=path.join(tmp,'models');
  await fs.mkdir(modelDir); await fs.writeFile(path.join(modelDir,'keep.txt'),'original');
  const probe=net.createServer();
  probe.listen(0,'127.0.0.1'); await once(probe,'listening');
  const port=probe.address().port; await new Promise(done=>probe.close(done));
  const origin='http://127.0.0.1:'+port;
  const original=(await fs.readFile(path.join(home,'REVISION'),'utf8')).trim();
  const first='a'.repeat(40), broken='b'.repeat(40);
  const tag=id=>'build-'+id.slice(0,12);
  const status=async()=> (await fetch(origin+'/api/update/status')).json();
  async function waitFor(predicate) {
    for (let n=0;n<160;n++) {
      try {const s=await status(); if (predicate(s)) return s;} catch {}
      await delay(100);
    }
    throw Error('Service did not reach the expected state');
  }
  async function fixture(version,{badHash=false,badBoot=false}={}) {
    const stage=path.join(assets,'remote-viewer');
    await fs.rm(stage,{recursive:true,force:true});
    await fs.cp(bundle,stage,{recursive:true});
    await fs.writeFile(path.join(stage,'REVISION'),version+'\n');
    if (badBoot) await fs.writeFile(path.join(stage,'service.mjs'),'process.exit(1);\n');
    execFileSync('tar',['-czf',path.join(assets,'asset.tgz'),'-C',assets,'remote-viewer']);
    const digest=createHash('sha256').update(await fs.readFile(path.join(assets,'asset.tgz'))).digest('hex');
    await fs.writeFile(path.join(assets,'latest.json'),JSON.stringify({tag_name:tag(version),assets:[
      {name:'remote-viewer.tar.gz',digest:'sha256:'+(badHash?'0'.repeat(64):digest)}
    ]}));
  }
  let service;
  function start() {
    service=spawn(process.execPath,[path.join(home,'server.mjs'),'--root',modelDir,'--port',String(port),'--no-server-gpu'],{
      env:{...process.env,PATH:fakeBin+path.delimiter+process.env.PATH,TEST_RELEASE:assets},stdio:'ignore'
    });
  }
  async function stop() {
    if (!service || service.exitCode!==null || service.signalCode!==null) return;
    const closed=once(service,'close'); service.kill(); await closed;
  }
  const apply=(version,from=origin)=>fetch(origin+'/api/update/install',{method:'POST',
    headers:{Origin:from,'Content-Type':'application/json'},body:JSON.stringify({tag:tag(version)})});
  try {
    await fixture(first,{badHash:true});
    start(); const s=await waitFor(s=>s.current===original);
    assert.equal(s.canInstall,true);
    assert.equal((await apply(first,'http://example.invalid')).status,403);
    assert.equal((await apply(first)).status,202);
    await waitFor(s=>s.current===original && s.notice.includes('SHA-256'));
    await stop();
    await fixture(first); start(); await waitFor(s=>s.current===original);
    assert.equal((await apply(first)).status,202);
    await waitFor(s=>s.current===first && s.phase==='idle');
    assert.equal(await (await fetch(origin+'/model/keep.txt')).text(),'original');
    assert.equal((await (await fetch(origin+'/api/gpu')).json()).enabled,false);
    await stop();
    await fixture(broken,{badBoot:true}); start(); await waitFor(s=>s.current===first);
    assert.equal((await apply(broken)).status,202);
    await waitFor(s=>s.current===first && s.notice.includes('已恢复'));
    assert.equal((await fs.readFile(path.join(home,'.updates','current'),'utf8')).trim(),first);
    assert.equal(await fs.readFile(path.join(modelDir,'keep.txt'),'utf8'),'original');
  } finally {await stop(); await fs.rm(tmp,{recursive:true,force:true});}
});
