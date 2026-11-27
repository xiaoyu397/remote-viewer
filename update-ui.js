const button = document.querySelector('#check-update');
const dialog = document.querySelector('#update-dialog');
const version = document.querySelector('#update-version');
const message = document.querySelector('#update-message');
const apply = document.querySelector('#apply-update');
const reload = document.querySelector('#reload-update');
const phases = {checking:'正在确认版本…', downloading:'正在下载新版…', verifying:'正在校验并解压…', restarting:'正在重启服务…'};
let generation=0, target;
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));

async function api(route, options) {
  const response=await fetch('/api/update/'+route, {signal:AbortSignal.timeout(35000), ...options});
  const data=await response.json();
  if (!response.ok) throw Error(data.error || '请求失败');
  return data;
}
function showVersion(status) {
  version.textContent='当前版本：'+(status.current?.slice(0,12) || '未知');
}
async function monitor(id) {
  const end=Date.now()+360000;
  while (id===generation && Date.now()<end) {
    await sleep(1000);
    if (id!==generation) return;
    let state;
    try { state=await api('status'); }
    catch { if (id===generation) message.textContent='正在等待服务重新连接…'; continue; }
    if (id!==generation) return;
    showVersion(state);
    if (state.phase==='idle') {
      message.textContent=state.notice || '服务已就绪，刷新页面以使用当前版本。';
      reload.hidden=Boolean(state.notice);
      return;
    }
    message.textContent=phases[state.phase] || '正在更新…';
  }
  if (id===generation) message.textContent='等待超时。请稍后重新检查，或查看服务日志。';
}
button.onclick=async()=>{
  const id=++generation;
  target=null; apply.hidden=true; reload.hidden=true; version.textContent='';
  message.textContent='正在检查更新…';
  dialog.showModal();
  try {
    const status=await api('status');
    if (id!==generation) return;
    showVersion(status);
    if (status.phase!=='idle') return monitor(id);
    const release=await api('check');
    if (id!==generation) return;
    if (!release.available) {message.textContent=status.notice || '已是最新版本。'; return;}
    const latest='发现新版本 '+release.tag.slice(6)+'。';
    if (!status.portable) {message.textContent=latest+'源码安装请从发布说明下载免安装包。'; return;}
    if (!status.canInstall) {message.textContent=latest+'请通过本机或 SSH 转发的 localhost 地址访问仅监听本机的服务后更新。'; return;}
    target=release.tag;
    message.textContent=(status.notice ? status.notice+' ' : '')+latest+'安装完成后将重启服务，当前连接会短暂中断。';
    apply.hidden=false;
  } catch (error) {if (id===generation) message.textContent=error.message;}
};
apply.onclick=async()=>{
  const id=generation;
  apply.hidden=true; message.textContent=phases.checking;
  try {
    await api('install',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tag:target})});
    await monitor(id);
  } catch (error) {if (id===generation) message.textContent=error.message;}
};
reload.onclick=()=>location.reload();
dialog.addEventListener('close',()=>{generation++;});
