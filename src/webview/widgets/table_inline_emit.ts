import type { Text } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { math_cache_key, type MathResult } from './math.js';
import { resolve_image_url } from './image.js';
import { BR_HTML_SOURCE } from './table_serialize.js';

// lezer-markdown emits no Text nodes inside a TableCell — plain prose is the gaps between explicit inline children.

const BR_HTML = new RegExp(`^${BR_HTML_SOURCE}$`, 'i');

function unescape_text(raw: string): string {
  // the Escape node spans backslash + char; the rendered form drops the backslash
  return raw.replace(/\\(.)/g, '$1');
}

function emit_text(parent: Node, text: string): void {
  if (text.length === 0) return;
  parent.appendChild(document.createTextNode(text));
}

function emit_children(parent: Node, node: SyntaxNode, doc: Text, cache: Map<string, MathResult>, image_base: string | null): void {
  let cursor = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    emit_text(parent, doc.sliceString(cursor, child.from));
    emit_node(parent, child, doc, cache, image_base);
    cursor = child.to;
  }
  emit_text(parent, doc.sliceString(cursor, node.to));
}

function emit_wrapped(tag: string, parent: Node, node: SyntaxNode, doc: Text, cache: Map<string, MathResult>, image_base: string | null): void {
  const el = document.createElement(tag);
  // emphasis-family firstChild/lastChild are syntax markers — content sits strictly between them
  const first = node.firstChild;
  const last = node.lastChild;
  // SyntaxNode cursors return fresh wrappers each call — compare by position, not identity
  if (first && last && first.from < last.from) {
    let cursor = first.to;
    for (
      let child = first.nextSibling;
      child && child.from < last.from;
      child = child.nextSibling
    ) {
      emit_text(el, doc.sliceString(cursor, child.from));
      emit_node(el, child, doc, cache, image_base);
      cursor = child.to;
    }
    emit_text(el, doc.sliceString(cursor, last.from));
  } else {
    emit_text(el, doc.sliceString(node.from, node.to));
  }
  parent.appendChild(el);
}

function emit_inline_code(parent: Node, node: SyntaxNode, doc: Text): void {
  const code = document.createElement('code');
  // bare <code> falls through to VS Code's webview default stylesheet (textPreformat colors)
  code.className = 'plainmark-inline-code';
  const first = node.firstChild;
  const last = node.lastChild;
  // CodeMark children bound the literal content; code spans render verbatim (no escapes).
  const inner =
    first && last && first.from < last.from
      ? doc.sliceString(first.to, last.from)
      : doc.sliceString(node.from, node.to);
  code.textContent = inner;
  parent.appendChild(code);
}

function emit_link(parent: Node, node: SyntaxNode, doc: Text, cache: Map<string, MathResult>, image_base: string | null): void {
  const a = document.createElement('a');
  // the bracketed label sits between the `[` and `]` LinkMarks and can itself contain inline nodes
  const first = node.firstChild;
  let label_to: number | null = null;
  let url_node: SyntaxNode | null = null;
  // capture the FIRST closing `]` only; do not break — the URL child sits past it
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'URL' && !url_node) url_node = child;
    if (
      label_to === null &&
      child.name === 'LinkMark' &&
      doc.sliceString(child.from, child.to) === ']'
    ) {
      label_to = child.from;
    }
  }
  const effective_label_to = label_to ?? node.to;
  const label_from = first && first.name === 'LinkMark' ? first.to : node.from;
  if (url_node) a.setAttribute('href', doc.sliceString(url_node.from, url_node.to));

  let cursor = label_from;
  for (
    let child = first?.nextSibling ?? null;
    child && child.from < effective_label_to;
    child = child.nextSibling
  ) {
    emit_text(a, doc.sliceString(cursor, child.from));
    emit_node(a, child, doc, cache, image_base);
    cursor = child.to;
  }
  emit_text(a, doc.sliceString(cursor, effective_label_to));
  parent.appendChild(a);
}

function emit_image(parent: Node, node: SyntaxNode, doc: Text, image_base: string | null): void {
  let url_node: SyntaxNode | null = null;
  let alt_to = node.to;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === 'URL') url_node = child;
    if (child.name === 'LinkMark' && doc.sliceString(child.from, child.to) === ']') {
      alt_to = child.from;
    }
  }
  const alt_from = node.from + 2; // skip the `![` opening LinkMark
  const alt = unescape_text(doc.sliceString(alt_from, Math.max(alt_from, alt_to)));
  const raw_url = url_node ? doc.sliceString(url_node.from, url_node.to) : '';
  const img = document.createElement('img');
  img.alt = alt;
  const resolved = resolve_image_url(raw_url, image_base);
  if (resolved) img.src = resolved;
  parent.appendChild(img);
}

function emit_math(parent: Node, node: SyntaxNode, doc: Text, cache: Map<string, MathResult>, display: boolean): void {
  // InlineMath/BlockMath wrap the source between their mark children (single `$` or `$$`).
  const first = node.firstChild;
  const last = node.lastChild;
  const src =
    first && last && first.from < last.from
      ? doc.sliceString(first.to, last.from)
      : doc.sliceString(node.from, node.to);
  const result = cache.get(math_cache_key(display, src)) ?? null;
  const el = document.createElement(display ? 'div' : 'span');
  const base = display ? 'plainmark-math-block' : 'plainmark-math-inline';
  if (result?.ok) {
    el.className = base;
    el.innerHTML = result.html;
  } else if (result) {
    el.className = `${base} plainmark-math-error`;
    el.title = result.message;
    el.textContent = display ? `$$${src}$$` : `$${src}$`;
  } else {
    el.className = `${base} plainmark-math-pending`;
  }
  parent.appendChild(el);
}

function emit_html_inline(parent: Node, node: SyntaxNode, doc: Text): void {
  const raw = doc.sliceString(node.from, node.to);
  // BR1: <br> becomes a real line break; every other raw inline HTML wraps in
  // a chrome span MATCHING the main-view .plainmark-html-inline +
  // .plainmark-syntax-tag DOM shape. The inner .plainmark-syntax-tag wrap is
  // required because the scoped CSS rule
  // `.plainmark-html-inline .plainmark-syntax-tag { color: ... }` is what
  // applies the syntax-tag-color. Without the inner span, the chrome's own
  // color chain (--plainmark-html-inline-color → --plainmark-code-color →
  // --vscode-foreground) shows — a dim foreground, not the tag color.
  // The main view's lang-html overlay splits the tag into multiple syntax-tag
  // spans (open / tag-name / close); a single span here covers the whole tag
  // range, which is visually identical for plain tags and a minor degradation
  // for attributed tags (attribute coloring is lost in the static render,
  // restored once the caret enters the cell and the subview takes over).
  if (BR_HTML.test(raw.trim())) {
    parent.appendChild(document.createElement('br'));
    return;
  }
  const chrome = document.createElement('span');
  chrome.className = 'plainmark-html-inline';
  const tag = document.createElement('span');
  tag.className = 'plainmark-syntax-tag';
  tag.textContent = raw;
  chrome.appendChild(tag);
  parent.appendChild(chrome);
}

function emit_node(parent: Node, node: SyntaxNode, doc: Text, cache: Map<string, MathResult>, image_base: string | null): void {
  switch (node.name) {
    case 'Escape':
      emit_text(parent, unescape_text(doc.sliceString(node.from, node.to)));
      return;
    case 'StrongEmphasis':
      emit_wrapped('strong', parent, node, doc, cache, image_base);
      return;
    case 'Emphasis':
      emit_wrapped('em', parent, node, doc, cache, image_base);
      return;
    case 'Strikethrough':
      emit_wrapped('del', parent, node, doc, cache, image_base);
      return;
    case 'InlineCode':
      emit_inline_code(parent, node, doc);
      return;
    case 'Link':
      emit_link(parent, node, doc, cache, image_base);
      return;
    case 'Image':
      emit_image(parent, node, doc, image_base);
      return;
    case 'InlineMath':
      emit_math(parent, node, doc, cache, false);
      return;
    case 'BlockMath':
      emit_math(parent, node, doc, cache, true);
      return;
    case 'HTMLTag':
    case 'Comment':
    case 'ProcessingInstruction':
      emit_html_inline(parent, node, doc);
      return;
    default:
      // Unknown inline node — emit its source verbatim rather than dropping it.
      emit_text(parent, doc.sliceString(node.from, node.to));
  }
}

export function emit_table_cell(
  cell: SyntaxNode,
  doc: Text,
  math_cache: Map<string, MathResult>,
  image_base: string | null,
): DocumentFragment {
  const fragment = document.createDocumentFragment();
  emit_children(fragment, cell, doc, math_cache, image_base);
  return fragment;
}
