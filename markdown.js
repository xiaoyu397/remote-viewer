import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import hljs from 'highlight.js/lib/common';
import { readmeBlocks, readmeFragment } from './readme-html.js';
import './markdown.css';

const parser = new MarkdownIt({
  html: true,
  linkify: true,
  highlight(code, language) {
    if (code.length > 32768 || !language || !hljs.getLanguage(language)) return '';
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
}).use(taskLists).use(readmeBlocks);

export function renderMarkdown(source, fileUrl) {
  const article = document.createElement('article');
  article.className = 'markdown-body';
  const fragment = readmeFragment(parser.render(source), fileUrl);
  const anchors = new Set();
  for (const heading of fragment.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const slug = heading.textContent.trim().toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N} _-]/gu, '').replace(/ /g, '-');
    let name = slug;
    for (let i = 1; anchors.has(name); i++) name = slug + '-' + i;
    anchors.add(name);
    heading.id = 'markdown-heading-' + name;
  }
  article.append(fragment);
  return article;
}
