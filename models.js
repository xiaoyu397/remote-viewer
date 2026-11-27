const container = document.getElementById('view');
const layoutControl = document.getElementById('model-layout');
const singleButton = document.getElementById('layout-single');
const gridButton = document.getElementById('layout-grid');
const panes = new Map();
let active;
let layout = 'grid';

function updateLayout(visible = !container.hidden) {
  const single = layout === 'single';
  container.classList.toggle('single-layout', single);
  layoutControl.hidden = panes.size === 0 || !active;
  singleButton.setAttribute('aria-pressed', String(single));
  gridButton.setAttribute('aria-pressed', String(!single));

  for (const pane of panes.values()) {
    const paneVisible = visible && (!single || pane === active);
    pane.tile.hidden = single && pane !== active;
    pane.frame.contentWindow?.postMessage({type:'model-visible', visible:paneVisible}, location.origin);
  }
}

singleButton.addEventListener('click', () => {
  layout = 'single';
  updateLayout();
});
gridButton.addEventListener('click', () => {
  layout = 'grid';
  updateLayout();
});

export function showModel(file, select) {
  let pane = panes.get(file.path);
  if (!pane) {
    const tile = document.createElement('section');
    tile.className = 'model-tile';
    const heading = document.createElement('button');
    heading.textContent = file.path;
    heading.title = file.path;
    heading.onclick = () => select(file);
    const frame = document.createElement('iframe');
    frame.title = file.path;
    frame.allowFullscreen = true;
    frame.src = '/model.html?' + new URLSearchParams({path:file.path});
    pane = {tile, frame, select: () => select(file)};
    panes.set(file.path, pane);
    tile.append(heading, frame);
    container.append(tile);
  }
  active?.tile.classList.remove('selected');
  active = pane;
  active.tile.classList.add('selected');
  active.tile.scrollIntoView({block:'nearest',inline:'nearest'});
  updateLayout(true);
}

export function setModelsVisible(visible) {
  if (!visible) {
    active?.tile.classList.remove('selected');
    active = null;
  }
  updateLayout(visible);
}

export function closeModel(path) {
  const pane = panes.get(path);
  if (!pane) return;
  // Release a remote session before removing the document that owns its requests.
  pane.frame.contentDocument?.dispatchEvent(new Event('model-close'));
  pane.tile.remove();
  panes.delete(path);
  if (active === pane) active = null;
  updateLayout();
}

window.addEventListener('message', e => {
  if (e.origin !== location.origin) return;
  for (const pane of panes.values()) {
    if (e.source !== pane.frame.contentWindow) continue;
    if (e.data?.type === 'model-focus' && active !== pane) pane.select();
    if (e.data?.type === 'model-ready') {
      const visible = !container.hidden && (layout !== 'single' || pane === active);
      pane.frame.contentWindow.postMessage({type:'model-visible', visible}, location.origin);
    }
    break;
  }
});
