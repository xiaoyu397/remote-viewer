import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js/lib/common';
import './markdown.css';

const parser = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, language) {
    if (code.length > 32768 || !language || !hljs.getLanguage(language)) return '';
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
}).use(taskLists);

// Resolve local references within the browsed file tree, including paths starting with /.
function resourceUrl(reference, fileUrl) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(reference)) return reference;
  const path = fileUrl.slice('/model'.length);
  const resolved = new URL(reference, location.origin + path);
  return '/model' + resolved.pathname + resolved.search + resolved.hash;
}

export function renderMarkdown(source, fileUrl) {
  const article = document.createElement('article');
  article.className = 'markdown-body';
  const template = document.createElement('template');
  template.innerHTML = parser.render(source);

  for (const image of template.content.querySelectorAll('img')) {
    image.src = resourceUrl(image.getAttribute('src'), fileUrl);
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
  }
  const anchors = new Set();
  for (const heading of template.content.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const slug = heading.textContent.trim().toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '').replace(/ /g, '-');
    let name = slug;
    for (let i = 1; anchors.has(name); i++) name = slug + '-' + i;
    anchors.add(name);
    heading.id = 'markdown-heading-' + name;
  }
  for (const link of template.content.querySelectorAll('a[href]')) {
    const reference = link.getAttribute('href');
    if (reference.startsWith('#')) {
      link.setAttribute('href', '#markdown-heading-' + reference.slice(1));
      continue;
    }
    link.href = resourceUrl(reference, fileUrl);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  }

  article.append(template.content);
  return article;
}
