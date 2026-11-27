import DOMPurify from 'dompurify';

// Some rich-text clipboard exports escape every tag in a centered README header.
// Handle that specific paragraph shape without changing code blocks or ordinary escapes.
export function readmeBlocks(md) {
  md.core.ruler.before('inline', 'copied_readme_html', state => {
    const tokens = state.tokens;
    for (let i = 1; i + 1 < tokens.length; i++) {
      const token = tokens[i];
      if (token.type !== 'inline' || tokens[i-1].type !== 'paragraph_open' || tokens[i+1].type !== 'paragraph_close') continue;
      const wrapper = /^\\<(p|div|h[1-6])\s+align=["'](?:center|left|right)["']\s*>/i.exec(token.content);
      if (!wrapper || !token.content.toLowerCase().includes('\\</' + wrapper[1].toLowerCase() + '>')) continue;
      tokens[i-1].hidden = tokens[i+1].hidden = true;
      token.type = 'html_block';
      token.content = token.content.replace(/\\([<*&~])/g, '$1')
        .replace(/(\bhref\s*=\s*)(["'])\[https?:\/\/[^"'\]\n]+\]\((https?:\/\/[^"'\s]+)\)\2/gi, '$1$2$3$2');
    }
  });
  // markdown-it normally emits an inline style for aligned table columns.
  for (const type of ['th_open', 'td_open']) {
    md.renderer.rules[type] = (tokens, index, options, env, renderer) => {
      const token = tokens[index];
      const alignment = token.attrGet('style')?.match(/^text-align:(left|center|right)$/);
      if (alignment) token.attrs = [['align', alignment[1]]];
      return renderer.renderToken(tokens, index, options);
    };
  }
}

const tags = 'a abbr b blockquote br caption code dd del details div dl dt em figcaption figure h1 h2 h3 h4 h5 h6 hr i img input ins kbd li mark ol p picture pre q s samp small source span strong sub summary sup table tbody td th thead tr ul video';
const attributes = 'align alt checked class colspan controls disabled height href media open poster rowspan scope src srcset start title type width';

function resourceUrl(value, fileUrl, link = false) {
  const ref = value.trim();
  if (!ref) return null;
  try {
    const absolute = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref);
    const base = new URL(fileUrl.slice('/model'.length), location.origin);
    const url = new URL(ref, base);
    if (link && url.protocol === 'mailto:') return url.href;
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return absolute ? url.href : '/model' + url.pathname + url.search + url.hash;
  } catch { return null; }
}

function isVideoFile(reference) {
  return /\.(?:mp4|webm|ogv|mov|m4v)(?:[?#]|$)/i.test(reference);
}

function replaceWithVideo(node, source) {
  const video = document.createElement('video');
  video.setAttribute('src', source);
  if (node.getAttribute('alt')) video.setAttribute('aria-label', node.getAttribute('alt'));
  node.replaceWith(video);
}

function resolveAttr(node, attr, fileUrl) {
  if (!node.hasAttribute(attr)) return;
  const resolved = resourceUrl(node.getAttribute(attr), fileUrl, attr === 'href');
  if (resolved) node.setAttribute(attr, resolved);
  else node.removeAttribute(attr);
}

function resolveSrcset(node, fileUrl) {
  const candidates = [];
  for (const part of node.getAttribute('srcset').split(',')) {
    const match = /^(\S+)(?:\s+(\d+w|\d*\.?\d+x))?$/.exec(part.trim());
    if (!match) continue;
    const url = resourceUrl(match[1], fileUrl);
    if (url) candidates.push([url, match[2]].filter(Boolean).join(' '));
  }
  if (candidates.length) node.setAttribute('srcset', candidates.join(', '));
  else node.removeAttribute('srcset');
}

export function readmeFragment(html, fileUrl) {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: tags.split(' '),
    ALLOWED_ATTR: attributes.split(' '),
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false
  });

  for (const node of fragment.querySelectorAll('[class]')) {
    for (const name of [...node.classList]) {
      if (!/^(?:hljs(?:-[\w-]+)?|language-[\w+-]+|task-list-item(?:-checkbox)?|contains-task-list|function_|class_|inherited__)$/.test(name)) node.classList.remove(name);
    }
  }
  for (const input of fragment.querySelectorAll('input')) {
    if (input.type !== 'checkbox') input.remove();
    else input.disabled = true;
  }
  for (const node of fragment.querySelectorAll('img, video, source')) {
    resolveAttr(node, 'src', fileUrl);
    if (node.hasAttribute('srcset')) resolveSrcset(node, fileUrl);
  }
  for (const image of fragment.querySelectorAll('img[src]')) {
    if (isVideoFile(image.getAttribute('src')) && !image.closest('picture, a')) {
      replaceWithVideo(image, image.getAttribute('src'));
      continue;
    }
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
  }
  for (const link of fragment.querySelectorAll('a[href]')) {
    const ref = link.getAttribute('href');
    if (ref.startsWith('#')) {
      link.setAttribute('href', '#markdown-heading-' + ref.slice(1));
    } else {
      resolveAttr(link, 'href', fileUrl);
      if (!link.hasAttribute('href')) continue;
      if (link.parentElement?.matches('p') && link.parentElement.childNodes.length === 1 &&
          ref === link.textContent && isVideoFile(ref)) {
        replaceWithVideo(link, link.getAttribute('href'));
        continue;
      }
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
  }
  for (const video of fragment.querySelectorAll('video')) {
    resolveAttr(video, 'poster', fileUrl);
    video.controls = true;
    video.playsInline = true;
    video.preload = 'metadata';
  }
  return fragment;
}
