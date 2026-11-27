function element(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

export async function showCheckpoint(file, preview, signal) {
  preview.textContent = '正在读取检查点参数…';
  let data;
  try {
    const response = await fetch('/api/checkpoint?path=' + encodeURIComponent(file.path), { signal });
    data = await response.json();
    if (!response.ok) throw Error(data.error || '无法读取检查点。');
  } catch (error) {
    if (!signal.aborted) preview.textContent = '检查点预览失败：' + error.message;
    return;
  }
  if (signal.aborted) return;
  if (!data.rows.length) {
    preview.textContent = '检查点中没有可预览的张量。';
    return;
  }
  const section = element('section');
  section.className = 'checkpoint';
  const search = element('input');
  search.type = 'search';
  search.placeholder = '按参数名筛选';
  search.setAttribute('aria-label', search.placeholder);
  const info = element('p');
  info.setAttribute('aria-live', 'polite');
  const table = element('table');
  const head = table.createTHead().insertRow();
  for (const label of ['参数名', '形状', '数据类型', '元素数']) head.append(element('th', label));
  const body = table.createTBody();
  const more = element('button', '显示更多');
  let matches = [], shown = 0;
  function appendPage() {
    const end = Math.min(shown + 200, matches.length);
    for (; shown < end; shown++) {
      const row = matches[shown];
      const tr = body.insertRow();
      for (const value of [row.name, '[' + row.shape.join(', ') + ']', row.dtype, BigInt(row.elements).toLocaleString()]) {
        tr.insertCell().textContent = value;
      }
    }
    more.hidden = shown === matches.length;
  }
  function filter() {
    const query = search.value.toLowerCase();
    matches = data.rows.filter(row => row.name.toLowerCase().includes(query));
    info.textContent = (query ? '匹配 ' + matches.length + ' / ' : '') + data.rows.length + ' 个张量'
      + (data.truncated ? '（仅预览前 ' + data.rows.length + ' 个）' : '');
    body.replaceChildren();
    table.hidden = !matches.length;
    shown = 0;
    appendPage();
  }
  search.oninput = filter;
  more.onclick = appendPage;
  section.append(search, info, table, more);
  filter();
  preview.replaceChildren(section);
}
