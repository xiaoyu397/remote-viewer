import {Box3, Euler, PerspectiveCamera, Vector3} from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createRemoteRenderer} from './remote-renderer.js';

const el = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// The loopback rendering page uses the same scene and shader code as a local pane.
if (params.has('worker')) {
  const canvas = document.querySelector('canvas');
  let stage;
  window.gpuWorker = {
    async load(path) {
      const {createRenderer} = await import('./src.js');
      stage = createRenderer(canvas, true);
      return stage.load(path);
    },
    frame(view) {
      stage.draw(view);
      return canvas.toDataURL('image/jpeg', .82).split(',')[1];
    }
  };
} else {
  initPane(params.get('path'));
}

function initPane(path) {
  const surface = el('surface'), camera = new PerspectiveCamera(90,1,.001,10000);
  const orbit = new OrbitControls(camera,surface);
  orbit.enableDamping = true;
  orbit.enabled = false;
  const look = new Euler(0,0,0,'YXZ'), direction = new Vector3();
  const keys = new Set(), movement = new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight']);
  let stage, bounds, ready=false, flipped=false, visible=true, drag, epoch=0, raf=0, last=0;
  let canvas = document.querySelector('canvas');
  const tellParent = type => { if (parent !== window) parent.postMessage({type},location.origin); };
  document.addEventListener('pointerdown', () => tellParent('model-focus'), true);
  document.addEventListener('focusin', () => tellParent('model-focus'));
  function tick(time) {
    raf = 0;
    if (!ready || !visible || document.hidden) return;
    const dt = Math.min((time-last)/1000,.05);
    last = time;
    if (orbit.enabled) orbit.update();
    else if (keys.size) {
      const axis = (positive,negative) => Number(keys.has(positive))-Number(keys.has(negative));
      direction.set(axis('KeyD','KeyA'),0,axis('KeyS','KeyW')).applyQuaternion(camera.quaternion);
      direction.y += axis('KeyE','KeyQ');
      const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
      camera.position.addScaledVector(direction.normalize(),dt * Number(el('speed').value) * (fast ? 4 : 1));
    }
    const width=surface.clientWidth, height=surface.clientHeight;
    if (width && height) {
      camera.aspect = width/height;
      camera.updateProjectionMatrix();
      const ratio = el('backend').value === 'server' ? 1 : Math.min(devicePixelRatio,2);
      try {
        stage.draw({width:Math.max(1,Math.round(width*ratio)),height:Math.max(1,Math.round(height*ratio)),
          position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,
          near:camera.near,far:camera.far,flipped});
      } catch (error) { fail(error); return; }
      el('pose').textContent = camera.position.toArray().map(n => n.toFixed(3)).join(', ');
    }
    raf = requestAnimationFrame(tick);
  }
  function wake() { if (!raf && ready && visible && !document.hidden) raf=requestAnimationFrame(tick); }
  function clear() { keys.clear(); drag=null; }
  function dispose() {
    epoch++;
    ready=false;
    cancelAnimationFrame(raf); raf=0;
    stage?.dispose(); stage=null;
    clear();
  }
  function fail(error) {
    dispose();
    el('status').textContent = '预览失败：' + error.message;
    el('retry').hidden=false;
  }
  async function load({autoServer=false, notice=''} = {}) {
    dispose();
    const id=epoch;
    const nextCanvas=canvas.cloneNode(false);
    canvas.replaceWith(nextCanvas);
    canvas=nextCanvas;
    el('retry').hidden=true;
    el('status').textContent=notice || '正在加载模型…';
    try {
      if (el('backend').value === 'server') {
        stage=createRemoteRenderer(canvas, error => { if (id===epoch) fail(error); });
      } else {
        const {createRenderer}=await import('./src.js');
        if (id!==epoch) return;
        stage=createRenderer(canvas);
      }
      const info=await stage.load(path, e => {
        if (id===epoch) el('status').textContent=notice+'正在加载 '+(e.total ? Math.round(100*e.loaded/e.total)+'%' : Math.round(e.loaded/1048576)+' MB');
      });
      if (id!==epoch) return;
      bounds=new Box3(new Vector3(...info.min),new Vector3(...info.max));
      ready=true;
      el('status').textContent=notice+info.count.toLocaleString()+' Gaussians';
      wake();
    } catch (error) {
      if (id!==epoch) return;
      if (autoServer && (error.status===503 || error.status===429)) {
        el('backend').value='local';
        return load({notice:'服务器 GPU 暂不可用，已切换到本机 · '});
      }
      fail(error);
    }
  }
  function setFov(value) {
    camera.fov=Math.max(20,Math.min(120,value));
    el('fov').value=camera.fov;
    el('angle').textContent=Math.round(camera.fov)+'°';
  }
  function setMode(orbiting) {
    clear(); orbit.enabled=orbiting;
    el('mode').textContent=orbiting?'全局环绕':'第一人称';
    canvas.focus();
  }
  function frame() {
    if (!bounds) return;
    const center=bounds.getCenter(new Vector3()), radius=Math.max(bounds.getSize(new Vector3()).length()/2,.01);
    if (!Number.isFinite(radius+center.length())) return;
    if (flipped) { center.y*=-1; center.z*=-1; }
    const half=camera.fov*Math.PI/360;
    const distance=radius*1.1/Math.sin(Math.min(half,Math.atan(Math.tan(half)*camera.aspect)));
    setMode(true); orbit.target.copy(center); camera.position.copy(center).z+=distance;
    camera.near=Math.max(.00001,radius/10000); camera.far=Math.max(100,distance+100*radius);
    orbit.update();
  }
  el('global').onclick=frame;
  el('flip').onclick=() => { flipped=!flipped; if (orbit.enabled) frame(); };
  el('reset').onclick=() => {
    setMode(false); look.set(0,0,0,'YXZ'); camera.position.set(0,0,0); camera.quaternion.identity();
    camera.near=.001; camera.far=10000; setFov(90);
  };
  el('fps').onclick=() => { setMode(false); look.setFromQuaternion(camera.quaternion,'YXZ'); };
  el('fov').oninput=e => setFov(Number(e.target.value));
  el('speed').oninput=e => { el('speedval').textContent=Number(e.target.value).toFixed(1); };
  el('full').onclick=() => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
  surface.addEventListener('pointerdown', e => {
    canvas.focus();
    if (orbit.enabled || e.button!==0) return;
    drag={id:e.pointerId,x:e.clientX,y:e.clientY};
    surface.setPointerCapture(e.pointerId);
  });
  surface.onpointermove=e => {
    if (!drag || drag.id!==e.pointerId) return;
    look.y-=(e.clientX-drag.x)*.003;
    look.x=Math.max(-Math.PI/2+.001,Math.min(Math.PI/2-.001,look.x-(e.clientY-drag.y)*.003));
    drag.x=e.clientX; drag.y=e.clientY;
    camera.quaternion.setFromEuler(look);
  };
  for (const event of ['pointerup','pointercancel','lostpointercapture']) surface.addEventListener(event,()=>{drag=null;});
  surface.addEventListener('wheel',e => {
    if (!orbit.enabled) { e.preventDefault(); setFov(camera.fov+Math.sign(e.deltaY)*3); }
  },{passive:false});
  surface.onkeydown=e => {
    if (orbit.enabled || e.metaKey || e.ctrlKey || e.altKey || !movement.has(e.code)) return;
    keys.add(e.code); e.preventDefault();
  };
  window.onkeyup=e => keys.delete(e.code);
  surface.addEventListener('focusout',clear);
  window.addEventListener('blur',clear);
  document.addEventListener('model-close',dispose);
  window.addEventListener('pagehide',dispose);
  document.addEventListener('visibilitychange',()=>{clear(); wake();});
  window.addEventListener('message',e => {
    if (e.origin===location.origin && e.source===parent && e.data?.type==='model-visible') {
      visible=e.data.visible;
      if (!visible) clear();
      wake();
    }
  });
  el('retry').onclick=()=>load();
  el('backend').onchange=() => {
    try { sessionStorage.setItem('model-backend',el('backend').value); } catch {}
    load();
  };
  tellParent('model-ready');
  async function start() {
    const initialEpoch=epoch;
    const backend=el('backend');
    let enabled=false, preferred;
    try {
      const response=await fetch('/api/gpu');
      if (response.ok) enabled=(await response.json()).enabled===true;
    } catch {}
    if (initialEpoch!==epoch) return;
    try { preferred=sessionStorage.getItem('model-backend'); } catch {}
    backend.querySelector('[value="server"]').disabled=!enabled;
    backend.value=enabled && preferred!=='local' ? 'server' : 'local';
    backend.disabled=false;
    await load({autoServer:backend.value==='server' && preferred!=='server'});
  }
  start();
}
