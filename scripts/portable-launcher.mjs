// Installed as server.mjs. Each child runs from its own immutable release directory.
import {fork} from 'node:child_process';
import {readFileSync, renameSync, writeFileSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const home = path.dirname(fileURLToPath(import.meta.url));
const versions = path.join(home, '.updates');
const pointer = path.join(versions, 'current');
const valid = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
let current = '', child, stopping = false;
try {
  current = readFileSync(pointer, 'utf8').trim();
  if (!valid(current)) throw Error('无效的版本记录');
} catch (error) { if (error.code !== 'ENOENT') throw error; }

function stopChild() {
  if (!child) return;
  const target = child;
  target.kill('SIGTERM');
  const deadline = setTimeout(() => target.kill('SIGKILL'), 8000);
  deadline.unref();
  target.once('exit', () => clearTimeout(deadline));
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
  stopping = true;
  stopChild();
});

function run(version, trial, notice) {
  const dir = version ? path.join(versions, version) : home;
  return new Promise(resolve => {
    const worker = fork(path.join(dir, 'service.mjs'), process.argv.slice(2), {
      stdio: ['inherit','inherit','inherit','ipc'],
      env: {...process.env, RV_INSTALL_ROOT:home, RV_UPDATE_PHASE:trial ? 'restarting' : 'idle', RV_UPDATE_NOTICE:notice}
    });
    child = worker;
    let next, ready = false;
    const deadline = trial ? setTimeout(stopChild, 30000) : undefined;
    worker.on('message', message => {
      if (stopping) return;
      if (message?.type === 'ready' && !ready) {
        clearTimeout(deadline);
        if (trial) {
          const tmp = pointer + '.' + randomUUID();
          try {
            writeFileSync(tmp, version + '\n', {flag:'wx'});
            renameSync(tmp, pointer);
          } catch (error) {
            console.error('保存更新版本失败', error.message);
            rmSync(tmp, {force:true});
            stopChild();
            return;
          }
          current = version;
        }
        ready = true;
        worker.send({type:'active'});
      } else if (message?.type === 'activate' && ready && !next && valid(message.version) && message.version !== version) {
        next = message.version;
        stopChild();
      }
    });
    worker.on('error', error => console.error('服务进程错误', error.message));
    worker.once('close', (code, signal) => {
      clearTimeout(deadline);
      child = null;
      resolve({next, ready, code:code ?? (signal ? 1 : 0)});
    });
  });
}

let version = current, trial = false, notice = '';
while (!stopping) {
  const result = await run(version, trial, notice);
  if (stopping) break;
  if (result.next) {
    version = result.next;
    trial = true;
    notice = '';
  } else if (trial && !result.ready) {
    version = current;
    trial = false;
    notice = '新版未能启动，已恢复上一个版本。';
    console.error(notice);
  } else {
    process.exitCode = result.code;
    break;
  }
}
