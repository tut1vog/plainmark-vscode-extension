import prettier from 'prettier';
import html_plugin from 'prettier/plugins/html';

export async function normalize_for_snapshot(root: HTMLElement): Promise<string> {
  const clone = root.cloneNode(true) as HTMLElement;

  clone.querySelectorAll('style').forEach((s) => s.remove());

  // CM6 StyleModule class names (ͼ*) are generated from theme-instance creation
  // order, so adding/reordering any EditorView.theme() anywhere renames them and
  // churns every golden. They carry no semantic content — strip them.
  clone.querySelectorAll('[class]').forEach((el) => {
    const stable = Array.from(el.classList).filter((c) => !c.startsWith('ͼ'));
    if (stable.length !== el.classList.length) el.setAttribute('class', stable.join(' '));
  });

  // Cursor presence and position are computed asynchronously and race widget
  // measurement (math typeset, table layout) — strip them so snapshots assert
  // only on document content, not on cursor draw state.
  clone.querySelectorAll('.cm-cursor').forEach((c) => c.remove());

  // CM6's virtualization spacer (`.cm-gap`) carries an estimated pixel height
  // that can drift between measure passes — drop it so a partial snapshot
  // (large-doc) asserts on rendered content, not on the height estimate.
  clone.querySelectorAll('.cm-gap').forEach((g) => g.removeAttribute('style'));

  // Blockquote and callout lines carry a per-line inline hanging indent
  // (padding-left / text-indent) computed from the MEASURED `> ` marker width
  // (BQ-R-12 / CALL-R-10) — a font/platform-dependent px value set asynchronously
  // by the probe. Strip it so the snapshot asserts on content, not the measured
  // indent (the geometry is covered by selection-alignment.spec.ts), same as
  // cursor / .cm-gap above.
  clone
    .querySelectorAll('.plainmark-blockquote[style], .plainmark-callout[style]')
    .forEach((el) => el.removeAttribute('style'));

  // Composition snapshots intentionally elide MathJax subtrees: source TeX is
  // not embedded — targeted-query widget tests cover content. Snapshot answers
  // only "did anything else in the document change".
  clone.querySelectorAll('mjx-container').forEach((c) => {
    const placeholder = document.createElement('math-placeholder');
    placeholder.setAttribute(
      'display',
      c.getAttribute('display') === 'true' ? 'block' : 'inline',
    );
    c.replaceWith(placeholder);
  });

  const html = clone.outerHTML.replace(/​/g, '');
  return await prettier.format(html, { parser: 'html', plugins: [html_plugin] });
}
