const api = '/api/gpu/sessions';
async function post(path, data, signal) {
  const response = await fetch(path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data), signal});
  if (!response.ok) {
    const error = Error((await response.json().catch(() => ({}))).error || 'HTTP ' + response.status);
    error.status = response.status;
    throw error;
  }
  return response;
}

export function createRemoteRenderer(canvas, onError) {
  const context = canvas.getContext('2d');
  const abort = new AbortController();
  let id, file, busy=false, last=0;
  function release() {
    // The host page survives removal of an individual model iframe.
    if (id) {
      const owner = window.frameElement ? window.parent : window;
      owner.fetch(api + '/' + id, {method:'DELETE', keepalive:true}).catch(() => {});
    }
    id = null;
  }
  async function load(path) {
    file = path;
    const reply = await post(api, {path}, abort.signal);
    const info = await reply.json();
    id = info.id;
    if (abort.signal.aborted) release();
    return info;
  }
  async function frame(view) {
    const scale = Math.min(1, 1600 / Math.max(view.width, view.height), 1200 / Math.sqrt(view.width * view.height));
    const width = Math.max(1, Math.floor(view.width * scale)), height = Math.max(1, Math.floor(view.height * scale));
    const response = await post(api + '/' + id + '/frame', {...view, width, height}, abort.signal);
    const image = await createImageBitmap(await response.blob());
    try {
      if (abort.signal.aborted) return;
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      context.drawImage(image, 0, 0);
    } finally { image.close(); }
  }
  return {
    load,
    draw(view) {
      if (busy || performance.now() - last < 80) return;
      busy = true;
      last = performance.now();
      frame(view).catch(async error => {
        if (abort.signal.aborted) return;
        if (error.status === 410) await load(file);
        else throw error;
      }).catch(error => { if (!abort.signal.aborted) onError(error); }).finally(() => { busy = false; });
    },
    dispose() { abort.abort(); release(); }
  };
}
