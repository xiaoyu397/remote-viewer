export function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const divider = document.getElementById('splitter');
  const toggle = document.getElementById('toggle-files');
  const workspace = document.getElementById('workspace');
  const key = 'remote-viewer.sidebar-width';
  let preferred = null;
  try {
    const stored = Number(localStorage.getItem(key));
    if (Number.isFinite(stored) && stored > 0) preferred = stored;
  } catch { /* The width still works with browser storage disabled. */ }

  function bounds() {
    const available = workspace.clientWidth;
    const max = Math.max(80, Math.min(available * (available < 600 ? .55 : .65), available - 150));
    return { min: Math.min(available < 600 ? 112 : 172, max), max: Math.floor(max) };
  }
  function apply(width) {
    const { min, max } = bounds();
    const value = Math.max(min, Math.min(max, Math.round(width)));
    sidebar.style.width = value + 'px';
    divider.setAttribute('aria-valuenow', value);
    divider.setAttribute('aria-valuemin', min);
    divider.setAttribute('aria-valuemax', max);
    divider.setAttribute('aria-valuetext', value + ' 像素');
    return value;
  }
  function save() {
    try { localStorage.setItem(key, String(preferred)); } catch { /* Optional storage. */ }
  }
  let drag = null;
  divider.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    divider.focus();
    drag = { id: event.pointerId, start: event.clientX, width: sidebar.offsetWidth };
    divider.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
  };
  divider.onpointermove = event => {
    if (drag?.id === event.pointerId) preferred = apply(drag.width + event.clientX - drag.start);
  };
  divider.onlostpointercapture = () => {
    drag = null;
    document.body.classList.remove('resizing');
    if (preferred !== null) save();
  };
  divider.onkeydown = event => {
    const { min, max } = bounds();
    const next = { ArrowLeft: sidebar.offsetWidth - 16, ArrowRight: sidebar.offsetWidth + 16, Home: min, End: max };
    if (!Object.hasOwn(next, event.key)) return;
    event.preventDefault();
    preferred = apply(next[event.key]);
    save();
  };
  toggle.onclick = () => {
    sidebar.hidden = !sidebar.hidden;
    divider.hidden = sidebar.hidden;
    toggle.setAttribute('aria-expanded', String(!sidebar.hidden));
  };
  function fit() {
    apply(preferred ?? Math.min(288, workspace.clientWidth * .38));
  }
  new ResizeObserver(fit).observe(workspace);
  fit();
}
