import { renderMarkdown } from './markdown.js';
const $=id=>document.getElementById(id), status=s=>$('status').textContent=s;
const gs=/\.(ply|splat|ksplat|spz|sog)$/i, img=/\.(jpg|jpeg|jfif|png|webp|bmp|gif|avif|ico|tiff?|heic|heif)$/i, video=/\.(mp4|webm|ogv|mov|m4v|mkv|avi)$/i, audio=/\.(mp3|wav|ogg|flac|m4a)$/i, text=/\.(txt|json|jsonl|csv|tsv|log|py|js|ts|jsx|tsx|html|css|xml|yaml|yml|toml|ini|cfg|conf|sh|bash|cpp|c|h|hpp|rs|go|java|sql|obj|mtl|ipynb)$/i;
const markdown=/\.(?:md|markdown)$/i;
const url=e=>'/model/'+e.path.split('/').map(encodeURIComponent).join('/');
let cache=new Map(), expanded=new Set(['']), tabs=[], active=null, generation=0, gsModule, gsQueue=Promise.resolve();
async function list(p){const r=await fetch('/api/list?path='+encodeURIComponent(p));const d=await r.json();if(!r.ok)throw Error(d.error);cache.set(p,d.items);}
function draw(){const q=$('search').value.toLowerCase();$('files').replaceChildren();function walk(p,depth){for(const e of cache.get(p)||[]){if(q&&!e.directory&&!e.name.toLowerCase().includes(q))continue;const b=document.createElement('button');b.style.paddingLeft=(10+depth*16)+'px';b.title=e.path;b.className=active?.path===e.path?'selected':'';b.textContent=(e.directory?(expanded.has(e.path)?'⌄ 📂 ':'› 📁 '):'   '+(gs.test(e.name)?'◇':img.test(e.name)?'▧':video.test(e.name)?'▶':'▤')+' ')+e.name;b.onclick=async()=>{if(!e.directory)return open(e);if(expanded.has(e.path))expanded.delete(e.path);else{expanded.add(e.path);try{if(!cache.has(e.path))await list(e.path);}catch(err){expanded.delete(e.path);status(err.message);}}draw();};$('files').append(b);if(e.directory&&expanded.has(e.path))walk(e.path,depth+1);}}walk('',0);}
function drawTabs(){$('tabs').replaceChildren();for(const e of tabs){const b=document.createElement('button');b.className=active?.path===e.path?'active':'';b.textContent=e.name+'  ';b.onclick=()=>open(e);const x=document.createElement('span');x.textContent='×';x.title='关闭';x.style.padding='4px';x.onclick=ev=>{ev.stopPropagation();tabs=tabs.filter(t=>t.path!==e.path);if(active?.path===e.path){if(tabs.length)open(tabs.at(-1));else reset();}drawTabs();};b.append(x);$('tabs').append(b);}}
function reset(){generation++;active=null;hideMarkdownControl();gsModule?.clearKeys();$('gsbar').hidden=$('view').hidden=$('posebar').hidden=true;$('preview').hidden=false;$('preview').textContent='从左侧目录选择文件';$('filename').textContent='请选择文件';$('pano').hidden=$('download').hidden=true;status('就绪');draw();}
async function open(e,pano=false){const id=++generation;hideMarkdownControl();active=e;if(!tabs.some(t=>t.path===e.path))tabs.push(e);drawTabs();draw();gsModule?.clearKeys();$('filename').textContent=e.path;$('download').hidden=false;$('pano').hidden=!img.test(e.name);$('pano').textContent=pano?'普通图片':'360° 全景';$('pano').onclick=()=>open(e,!pano);$('download').onclick=()=>{const a=document.createElement('a');a.href=url(e);a.download=e.name;a.click();};const isGS=gs.test(e.name);$('gsbar').hidden=$('view').hidden=$('posebar').hidden=!isGS;const p=$('preview');p.hidden=isGS;p.replaceChildren();status(e.name+' · '+(e.size/1048576).toFixed(2)+' MB');try{if(isGS){gsQueue=gsQueue.catch(()=>{}).then(async()=>{if(id!==generation)return;gsModule=await import('./src.js');if(id===generation)await gsModule.load(e);});await gsQueue;return;}if(pano){const f=document.createElement('iframe');f.allowFullscreen=true;f.onload=()=>f.contentWindow.postMessage({type:'pano',url:url(e),name:e.name},location.origin);f.src='/pano.html';p.append(f);return;}if(video.test(e.name)){showVideo(e,p,id);return;}if(img.test(e.name)||audio.test(e.name)){const el=document.createElement(img.test(e.name)?'img':video.test(e.name)?'video':'audio');el.controls=true;el.preload='metadata';el.onerror=()=>{if(id===generation)status('浏览器无法解码该格式或文件已损坏，可下载后转换格式');};el.src=url(e);p.append(el);if(img.test(e.name))el.onload=()=>{if(id===generation){status(`${e.name} · ${el.naturalWidth} × ${el.naturalHeight}`);if(Math.abs(el.naturalWidth/el.naturalHeight-2)<.04)$('pano').textContent='360° 全景（推荐）';}};return;}if(markdown.test(e.name)||text.test(e.name)||!e.name.includes('.')){
  const options=e.size===0?{}:{headers:{Range:'bytes=0-2097151'}};
  const r=await fetch(url(e),options);
  if(!r.ok)throw Error('HTTP '+r.status);
  const data=await r.text();
  if(id!==generation)return;
  showText(e,p,data);
  return;
}p.textContent='该格式暂不支持在线预览，可点击下载。';}catch(err){if(id===generation)status('打开失败：'+err.message);}}
$('search').oninput=draw;$('collapse').onclick=()=>{expanded=new Set(['']);draw();};$('refresh').onclick=async()=>{try{await Promise.all([...expanded].map(list));draw();}catch(e){status(e.message);}};list('').then(draw).catch(e=>status(e.message));

function hideMarkdownControl() {
  $('markdown-control').hidden = true;
  $('markdown-render').onchange = null;
}

function showText(file, preview, source) {
  const canRender = markdown.test(file.name);
  const toggle = $('markdown-render');
  const notice = file.size > 2097152 ? '[仅预览前 2 MiB，请下载查看完整文件]' : '';

  function drawText() {
    if (canRender && toggle.checked) {
      const article = renderMarkdown(source, url(file));
      if (notice) {
        const footer = document.createElement('p');
        footer.textContent = notice;
        article.append(footer);
      }
      preview.replaceChildren(article);
    } else {
      const pre = document.createElement('pre');
      pre.textContent = source + (notice ? '\n\n' + notice : '');
      preview.replaceChildren(pre);
    }
    preview.scrollTop = 0;
  }

  if (canRender) {
    $('markdown-control').hidden = false;
    toggle.onchange = drawText;
  }
  drawText();
}

function showVideo(e,p,id){
 const wrap=document.createElement('div');wrap.style.cssText='width:100%;height:100%;display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px';
 const bar=document.createElement('div'), original=document.createElement('button'), compat=document.createElement('button'), info=document.createElement('span'), v=document.createElement('video');
 original.textContent='原始播放';compat.textContent='兼容播放 (FFmpeg)';info.style.marginLeft='10px';bar.append(original,compat,info);v.controls=true;v.preload='metadata';v.style.cssText='min-height:0;flex:1;max-width:100%;width:100%';wrap.append(bar,v);p.append(wrap);
 let epoch=0, mode='native';const query='?path='+encodeURIComponent(e.path);const current=t=>id===generation&&t===epoch;
 async function request(endpoint,method='GET'){const r=await fetch('/api/video/'+endpoint+query,{method});const d=await r.json().catch(()=>({error:'HTTP '+r.status}));if(!r.ok)throw Error(d.error);return d;}
 async function convert(){const t=++epoch;mode='pending';v.pause();v.removeAttribute('src');v.load();compat.disabled=true;info.textContent='正在请求转码…';try{let d=await request('convert','POST');while(current(t)){if(d.state==='ready'){mode='compat';info.textContent='兼容模式 · 已缓存';v.src='/api/video/play'+query;return;}if(d.state==='error')throw Error(d.error);info.textContent='正在 CPU 转码 '+(d.time||'');await new Promise(r=>setTimeout(r,1500));if(!current(t))return;d=await request('status');}}catch(err){if(current(t)){mode='failed';info.textContent=err.message;status('兼容播放失败：'+err.message);}}finally{if(current(t))compat.disabled=false;}}
 function native(){epoch++;mode='native';compat.disabled=false;info.textContent='原始视频';v.src=url(e);}
 v.onerror=()=>{if(id!==generation)return;if(mode==='native')convert();else if(mode==='compat'){info.textContent='转码后仍无法播放';status('请检查浏览器或网络');}};
 original.onclick=native;compat.onclick=convert;native();
}
