import { serialize_table } from './widgets/table_serialize.js';

const INLINE_MARKERS: Record<string, string> = {
  strong: '**',
  b: '**',
  em: '*',
  i: '*',
  del: '~~',
  s: '~~',
  strike: '~~',
};

const TEX_ANNOTATION = 'annotation[encoding="application/x-tex"]';

function wrap_inline(content: string, marker: string): string {
  // Markers never land against whitespace (CTX-I-6 parity) — shift it outside.
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(content) as RegExpExecArray;
  if (match[2].length === 0) return content;
  return match[1] + marker + match[2] + marker + match[3];
}

function longest_backtick_run(text: string): number {
  return Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
}

// Google Docs wraps its whole payload in `<b style="font-weight:normal">`.
function is_neutralized_bold(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag !== 'b' && tag !== 'strong') return false;
  return /font-weight\s*:\s*(normal|400)\b/i.test(el.getAttribute('style') ?? '');
}

function tex_of(el: Element): string | null {
  const tex = el.querySelector(TEX_ANNOTATION)?.textContent?.trim() ?? '';
  return tex.length > 0 ? tex : null;
}

function inline_markdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return (node.nodeValue ?? '').replace(/\s+/g, ' ');
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === 'br') return '\n';
  if (tag === 'img') {
    const alt = (el.getAttribute('alt') ?? '').trim();
    const src = el.getAttribute('src') ?? '';
    return src.length > 0 && !src.startsWith('data:') ? `![${alt}](${src})` : alt;
  }
  if (el.classList.contains('katex-display')) {
    const tex = tex_of(el);
    if (tex !== null) return `$$${tex}$$`;
  }
  if (el.classList.contains('katex')) {
    const tex = tex_of(el);
    if (tex !== null) return `$${tex}$`;
  }
  const content = Array.from(el.childNodes).map(inline_markdown).join('');
  const marker = INLINE_MARKERS[tag];
  if (marker !== undefined && !is_neutralized_bold(el)) return wrap_inline(content, marker);
  if (tag === 'code') return wrap_inline(content, '`'.repeat(longest_backtick_run(content) + 1));
  if (tag === 'a') {
    const href = el.getAttribute('href');
    const label = content.trim();
    if (href && label.length > 0) return `[${label}](${href})`;
    if (href && /^[a-z][a-z0-9+.-]*:/i.test(href)) return `<${href}>`;
  }
  // Block children inside a cell stack as soft breaks (`<br>` on serialize).
  if (tag === 'p' || tag === 'div') return content + '\n';
  return content;
}

function cell_markdown(cell: Element): string {
  return inline_markdown(cell).trim();
}

function table_rows(table: Element): string[][] {
  const rows: string[][] = [];
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells = Array.from(tr.querySelectorAll('td, th'));
    if (cells.length > 0) rows.push(cells.map(cell_markdown));
  }
  return rows;
}

// Declines spans, ragged rows, and a lone cell; each `<tr>` is one row and the
// first row becomes the header.
export function table_markdown_from_element(table: Element): string | null {
  for (const cell of Array.from(table.querySelectorAll('td, th'))) {
    const colspan = cell.getAttribute('colspan') ?? '1';
    const rowspan = cell.getAttribute('rowspan') ?? '1';
    if (colspan !== '1' || rowspan !== '1') return null;
  }
  const rows = table_rows(table);
  if (rows.length === 0) return null;
  // Ragged rows would silently lose cells to serialize_table's header-wins policy — decline like the TSV gate.
  if (rows.some((row) => row.length !== rows[0].length)) return null;
  if (rows.length < 2 && rows[0].length < 2) return null;
  return serialize_table({
    rows,
    alignment: rows[0].map(() => null),
  });
}

const CONTAINER_TAGS = new Set([
  'body',
  'html',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'nav',
  'aside',
  'figure',
  'details',
  'form',
  'fieldset',
  'center',
  'dl',
  'li',
]);
const PARAGRAPH_TAGS = new Set(['p', 'figcaption', 'summary', 'dt', 'dd', 'address']);
const HEADING_RE = /^h([1-6])$/;
const BLOCK_TAGS = new Set([
  ...CONTAINER_TAGS,
  ...PARAGRAPH_TAGS,
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'blockquote',
  'pre',
  'hr',
  'table',
]);
const BLOCK_SELECTOR = [...BLOCK_TAGS].filter((tag) => tag !== 'body' && tag !== 'html').join(',');
const SEMANTIC_SELECTOR =
  'h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,hr,table,img,strong,b,em,i,code,del,s,strike,a[href],' +
  TEX_ANNOTATION;
const LIST_BLOCK_RE = /^(?:- |\d+\. )/;

function paragraph_text(nodes: Node[]): string {
  return nodes
    .map(inline_markdown)
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

function render_blocks(parent: Node): string[] {
  const blocks: string[] = [];
  let run: Node[] = [];
  const flush = (): void => {
    if (run.length === 0) return;
    const text = paragraph_text(run);
    if (text.length > 0) blocks.push(text);
    run = [];
  };
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      if (BLOCK_TAGS.has(el.tagName.toLowerCase())) {
        flush();
        blocks.push(...render_block(el));
        continue;
      }
      // An inline wrapper around blocks (Google Docs' <b> around a whole list) is a container.
      if (el.querySelector(BLOCK_SELECTOR) !== null) {
        flush();
        blocks.push(...render_blocks(el));
        continue;
      }
    }
    run.push(child);
  }
  flush();
  return blocks;
}

function render_block(el: Element): string[] {
  const tag = el.tagName.toLowerCase();
  if (PARAGRAPH_TAGS.has(tag)) {
    const text = paragraph_text(Array.from(el.childNodes));
    return text.length > 0 ? [text] : [];
  }
  const heading = HEADING_RE.exec(tag);
  if (heading) {
    const text = paragraph_text(Array.from(el.childNodes)).replace(/\n+/g, ' ').trim();
    return text.length > 0 ? ['#'.repeat(Number(heading[1])) + ' ' + text] : [];
  }
  if (tag === 'ul' || tag === 'ol') {
    const list = render_list(el);
    return list === null ? [] : [list];
  }
  if (tag === 'blockquote') {
    const inner = render_blocks(el).join('\n\n');
    if (inner.length === 0) return [];
    return [
      inner
        .split('\n')
        .map((line) => (line.length > 0 ? '> ' + line : '>'))
        .join('\n'),
    ];
  }
  if (tag === 'pre') return [fenced_code(el)];
  if (tag === 'hr') return ['---'];
  if (tag === 'table') {
    const table = table_markdown_from_element(el);
    if (table !== null) return [table];
    const rows = table_rows(el)
      .map((row) => row.join(' ').trim())
      .filter((row) => row.length > 0);
    return rows.length > 0 ? [rows.join('\n')] : [];
  }
  return render_blocks(el);
}

function fenced_code(pre: Element): string {
  const codes = pre.querySelectorAll('code');
  // The toolbar chrome chat UIs place beside the code inside the same <pre> is not code.
  const source = codes.length === 1 ? codes[0] : pre;
  const body = (source.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const class_names = `${source.getAttribute('class') ?? ''} ${pre.getAttribute('class') ?? ''}`;
  const language = /(?:^|\s)(?:language|lang)-(\S+)/.exec(class_names)?.[1] ?? '';
  const fence = '`'.repeat(Math.max(3, longest_backtick_run(body) + 1));
  return body.length > 0
    ? `${fence}${language}\n${body}\n${fence}`
    : `${fence}${language}\n${fence}`;
}

function task_marker(li: Element): string {
  const input = li.querySelector(
    ':scope > input[type="checkbox"], :scope > p > input[type="checkbox"]',
  );
  if (input === null) return '';
  const checked = input.hasAttribute('checked') || (input as HTMLInputElement).checked;
  input.remove();
  return checked ? '[x] ' : '[ ] ';
}

function render_list(list: Element): string | null {
  const ordered = list.tagName.toLowerCase() === 'ol';
  const start = Number(list.getAttribute('start') ?? '1') || 1;
  const items: { marker: string; blocks: string[] }[] = [];
  for (const child of Array.from(list.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'li') {
      const marker = (ordered ? `${start + items.length}. ` : '- ') + task_marker(child);
      items.push({ marker, blocks: render_blocks(child) });
      continue;
    }
    // A list nested directly in a list (no <li>) belongs to the item above it.
    if ((tag === 'ul' || tag === 'ol') && items.length > 0) {
      const nested = render_list(child);
      if (nested !== null) items[items.length - 1].blocks.push(nested);
    }
  }
  if (items.length === 0) return null;
  return items.map(({ marker, blocks }) => render_item(marker, blocks)).join('\n');
}

function render_item(marker: string, blocks: string[]): string {
  if (blocks.length === 0) return marker.trimEnd();
  const indent = ' '.repeat(marker.length);
  let body = blocks[0];
  for (const block of blocks.slice(1)) {
    body += (LIST_BLOCK_RE.test(block) ? '\n' : '\n\n') + block;
  }
  return (
    marker +
    body
      .split('\n')
      .map((line, i) => (i === 0 || line.length === 0 ? line : indent + line))
      .join('\n')
  );
}

function has_semantic_markup(body: Element): boolean {
  return Array.from(body.querySelectorAll(SEMANTIC_SELECTOR)).some(
    (el) => !is_neutralized_bold(el),
  );
}

export function parse_clipboard_html(html: string): Document | null {
  if (typeof DOMParser === 'undefined') return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // Non-rendered text is not content (Google Sheets ships a body-level <style>).
  for (const el of Array.from(doc.body.querySelectorAll('style, script, template, noscript'))) {
    el.remove();
  }
  return doc;
}

// Rich-text gate: only markup that carries formatting the plain flavor has
// already lost qualifies; bare paragraphs, divs, spans, and style attributes
// (a VS Code editor copy, a Google Docs copy) stay on the plain-text path.
export function markdown_from_html(html: string): string | null {
  const doc = parse_clipboard_html(html);
  if (doc === null || !has_semantic_markup(doc.body)) return null;
  const markdown = render_blocks(doc.body).join('\n\n').trim();
  return markdown.length > 0 ? markdown : null;
}
