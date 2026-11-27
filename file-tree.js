const pageSize = 200;

export function createFileTree({ root, search, refresh, collapse, openFile, fileIcon }) {
  const cache = new Map();
  const requests = new Map();
  const expanded = new Set();
  const limits = new Map();
  let selected = null;
  let selectedRow = null;

  function list(path) {
    if (requests.has(path)) return requests.get(path);
    const params = new URLSearchParams({ path, sizes: '0' });
    const request = fetch('/api/list?' + params).then(async response => {
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw Error(error.error || 'HTTP ' + response.status);
      }
      const { items } = await response.json();
      if (requests.get(path) === request) cache.set(path, items);
      return items;
    }).finally(() => {
      if (requests.get(path) === request) requests.delete(path);
    });
    requests.set(path, request);
    return request;
  }

  function openDirectory(path, container, depth) {
    if (cache.has(path)) return render(path, container, depth);
    const loading = document.createElement('div');
    loading.textContent = '正在加载…';
    container.replaceChildren(loading);
    list(path).then(() => {
      if (loading.isConnected) render(path, container, depth);
    }).catch(error => {
      if (!loading.isConnected) return;
      const retry = document.createElement('button');
      retry.textContent = '加载失败，点击重试 · ' + error.message;
      retry.onclick = () => openDirectory(path, container, depth);
      container.replaceChildren(retry);
    });
  }

  function render(path, container, depth) {
    const query = search.value.toLowerCase();
    const entries = cache.get(path);
    const rows = query ? entries.filter(e => e.directory || e.name.toLowerCase().includes(query)) : entries;
    container.replaceChildren();
    if (!rows.length) {
      container.textContent = entries.length ? '没有匹配的文件' : '空文件夹';
      return;
    }
    let count = 0;
    function appendRows(limit) {
      const fragment = document.createDocumentFragment();
      const folders = [];
      while (count < Math.min(limit, rows.length)) {
        const entry = rows[count++];
        const row = document.createElement('button');
        row.style.setProperty('--indent', (4 + depth * 16) + 'px');
        row.title = entry.path;
        fragment.append(row);
        if (!entry.directory) {
          row.dataset.kind = fileIcon(entry.name);
          row.textContent = entry.name;
          if (entry.path === selected) {
            row.classList.add('selected');
            selectedRow = row;
          }
          row.onclick = () => openFile(entry);
          continue;
        }

        const children = document.createElement('div');
        fragment.append(children);
        row.textContent = entry.name;
        function setExpanded(isOpen) {
          row.setAttribute('aria-expanded', String(isOpen));
          children.hidden = !isOpen;
        }
        setExpanded(expanded.has(entry.path));
        if (expanded.has(entry.path)) folders.push([entry.path, children]);
        row.onclick = event => {
          if (event.detail > 1) return;
          const isOpen = !expanded.has(entry.path);
          setExpanded(isOpen);
          if (isOpen) {
            expanded.add(entry.path);
            openDirectory(entry.path, children, depth + 1);
          } else {
            expanded.delete(entry.path);
            children.replaceChildren();
          }
        };
      }
      if (count < rows.length) {
        const more = document.createElement('button');
        more.textContent = '显示更多（还有 ' + (rows.length - count) + ' 项）';
        more.onclick = () => {
          more.remove();
          limits.set(path, count + pageSize);
          appendRows(count + pageSize);
        };
        fragment.append(more);
      }
      container.append(fragment);
      for (const [folder, children] of folders) openDirectory(folder, children, depth + 1);
    }
    appendRows(limits.get(path) || pageSize);
  }

  // Each root render gets its own target so late responses cannot repaint an old tree.
  function redraw() {
    const contents = document.createElement('div');
    root.replaceChildren(contents);
    selectedRow = null;
    openDirectory('', contents, 0);
  }
  search.oninput = () => { limits.clear(); redraw(); };
  collapse.onclick = () => { expanded.clear(); limits.clear(); redraw(); };
  refresh.onclick = () => { cache.clear(); requests.clear(); redraw(); };
  redraw();

  return function select(path) {
    selectedRow?.classList.remove('selected');
    selected = path;
    selectedRow = path == null ? null : root.querySelector('button[title=' + CSS.escape(path) + ']');
    selectedRow?.classList.add('selected');
  };
}
