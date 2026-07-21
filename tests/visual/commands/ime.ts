// Node-side vitest browser command: drive Chromium's real IME pipeline over
// CDP. `Input.imeSetComposition` opens a composition on the focused editable
// (fires real compositionstart/compositionupdate), `Input.insertText` commits
// it (real textInput + compositionend + DOM mutation) — the same code path a
// Chinese IME takes for a one-shot fullwidth-punctuation commit, minus the OS
// IME itself. Synthetic CompositionEvent dispatch cannot reach this path.
import type { BrowserCommand } from 'vitest/node';
// Side-effect type import: augments BrowserCommandContext with the playwright
// `page`/`context` members used below.
import type {} from '@vitest/browser-playwright';

export const ime_commit: BrowserCommand<[text: string]> = async (ctx, text) => {
  const page = ctx.page;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.imeSetComposition', {
      text,
      selectionStart: text.length,
      selectionEnd: text.length,
    });
    await session.send('Input.insertText', { text });
  } finally {
    await session.detach();
  }
};

// macOS-style direct punctuation commit: the IME calls insertText: with no
// composition session at all.
export const ime_insert_text: BrowserCommand<[text: string]> = async (ctx, text) => {
  const page = ctx.page;
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.insertText', { text });
  } finally {
    await session.detach();
  }
};
