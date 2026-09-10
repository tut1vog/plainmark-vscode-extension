import type { Extension } from '@codemirror/state';
import { EditorView, type Panel, type ViewUpdate, runScopeHandlers } from '@codemirror/view';
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from '@codemirror/search';

interface SearchPanelOptions {
  // Quiet time after the last keystroke before the query applies, so a
  // half-typed word does not light up every letter in the document.
  debounce_ms: number;
}

type Attrs = Record<string, string | boolean | undefined>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs,
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key === 'checked' && node instanceof HTMLInputElement) node.checked = value === true;
    else if (key === 'value' && node instanceof HTMLInputElement) node.value = String(value);
    else node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children) node.append(child);
  return node;
}

// Beyond this the count reads "1000+"; the full-document scan stays bounded.
const COUNT_CAP = 1000;

function is_command_key(e: KeyboardEvent): boolean {
  return e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape' || /^F\d+$/.test(e.key);
}

class PlainmarkSearchPanel implements Panel {
  readonly dom: HTMLElement;
  readonly top = true;
  private query: SearchQuery;
  private pending: ReturnType<typeof setTimeout> | null = null;
  private readonly search_field: HTMLInputElement;
  private readonly replace_field: HTMLInputElement;
  private readonly case_field: HTMLInputElement;
  private readonly re_field: HTMLInputElement;
  private readonly word_field: HTMLInputElement;
  private readonly count_el: HTMLElement;

  constructor(
    private readonly view: EditorView,
    private readonly debounce_ms: number,
  ) {
    const phrase = (text: string): string => view.state.phrase(text);
    this.query = getSearchQuery(view.state);
    const q = this.query;

    this.search_field = el('input', {
      class: 'cm-textfield',
      name: 'search',
      'main-field': 'true',
      form: '',
      placeholder: phrase('Find'),
      'aria-label': phrase('Find'),
      value: q.search,
    });
    this.search_field.addEventListener('input', () => this.schedule());

    this.replace_field = el('input', {
      class: 'cm-textfield',
      name: 'replace',
      form: '',
      placeholder: phrase('Replace'),
      'aria-label': phrase('Replace'),
      value: q.replace,
    });
    this.replace_field.addEventListener('input', () => this.commit());

    const checkbox = (name: string, checked: boolean): HTMLInputElement => {
      const box = el('input', { type: 'checkbox', name, form: '', checked });
      box.addEventListener('change', () => this.commit());
      return box;
    };
    this.case_field = checkbox('case', q.caseSensitive);
    this.re_field = checkbox('re', q.regexp);
    this.word_field = checkbox('word', q.wholeWord);

    const button = (
      name: string,
      label: string,
      title: string | null,
      onclick: () => void,
    ): HTMLButtonElement => {
      const b = el(
        'button',
        {
          class: 'cm-button',
          name,
          type: 'button',
          title: title ?? undefined,
          'aria-label': title ?? undefined,
        },
        [label],
      );
      b.addEventListener('click', onclick);
      return b;
    };
    const option = (box: HTMLInputElement, label: string): HTMLLabelElement =>
      el('label', { class: 'plainmark-search-option' }, [box, label]);

    this.count_el = el('span', { class: 'plainmark-search-count', 'aria-live': 'polite' });

    const rows: HTMLElement[] = [
      el('div', { class: 'plainmark-search-row' }, [
        this.search_field,
        this.count_el,
        button('prev', '↑', phrase('Previous match'), () => this.run(findPrevious)),
        button('next', '↓', phrase('Next match'), () => this.run(findNext)),
      ]),
    ];
    if (!view.state.readOnly) {
      rows.push(
        el('div', { class: 'plainmark-search-row' }, [
          this.replace_field,
          button('replace', phrase('Replace'), null, () => this.run(replaceNext)),
          button('replaceAll', phrase('Replace all'), null, () => this.run(replaceAll)),
        ]),
      );
    }
    rows.push(
      el('div', { class: 'plainmark-search-row plainmark-search-options' }, [
        option(this.case_field, phrase('Match case')),
        option(this.re_field, phrase('Regex')),
        option(this.word_field, phrase('Whole word')),
      ]),
    );

    const close = el(
      'button',
      { name: 'close', type: 'button', 'aria-label': phrase('close'), title: phrase('Close') },
      ['×'],
    );
    close.addEventListener('click', () => closeSearchPanel(view));

    this.dom = el('div', { class: 'cm-search' }, [...rows, close]);
    this.dom.addEventListener('keydown', (e) => this.keydown(e));
    this.refresh_count();
  }

  get pos(): number {
    return 80;
  }

  mount(): void {
    this.search_field.select();
  }

  update(update: ViewUpdate): void {
    let query_changed = false;
    for (const tr of update.transactions) {
      for (const effect of tr.effects) {
        if (!effect.is(setSearchQuery)) continue;
        query_changed = true;
        if (!effect.value.eq(this.query)) this.set_query(effect.value);
      }
    }
    if (query_changed || update.docChanged || update.selectionSet) this.refresh_count();
  }

  destroy(): void {
    this.cancel();
  }

  private keydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' && e.target === this.search_field) {
      e.preventDefault();
      this.run(e.shiftKey ? findPrevious : findNext);
      return;
    }
    if (e.key === 'Enter' && e.target === this.replace_field) {
      e.preventDefault();
      this.run(replaceNext);
      return;
    }
    // Scope handlers (F3 / Mod-g / Escape) read the committed query, so a
    // pending keystroke must land first.
    if (is_command_key(e)) this.flush();
    if (runScopeHandlers(this.view, e, 'search-panel')) e.preventDefault();
  }

  private run(command: (view: EditorView) => boolean): void {
    this.flush();
    command(this.view);
  }

  private schedule(): void {
    this.cancel();
    this.pending = setTimeout(() => {
      this.pending = null;
      this.commit();
    }, this.debounce_ms);
  }

  private cancel(): void {
    if (this.pending === null) return;
    clearTimeout(this.pending);
    this.pending = null;
  }

  private flush(): void {
    if (this.pending === null) return;
    this.cancel();
    this.commit();
  }

  private commit(): void {
    const query = new SearchQuery({
      search: this.search_field.value,
      caseSensitive: this.case_field.checked,
      regexp: this.re_field.checked,
      wholeWord: this.word_field.checked,
      replace: this.replace_field.value,
    });
    if (query.eq(this.query)) return;
    this.query = query;
    this.view.dispatch({ effects: setSearchQuery.of(query) });
  }

  private refresh_count(): void {
    const { state } = this.view;
    const query = getSearchQuery(state);
    if (!query.valid) {
      this.count_el.textContent = '';
      this.count_el.classList.remove('plainmark-search-count-none');
      return;
    }
    const { from, to } = state.selection.main;
    let total = 0;
    let current = 0;
    const cursor = query.getCursor(state);
    for (let step = cursor.next(); !step.done && total < COUNT_CAP; step = cursor.next()) {
      total++;
      if (step.value.from === from && step.value.to === to) current = total;
    }
    const total_text = total >= COUNT_CAP ? `${COUNT_CAP}+` : String(total);
    this.count_el.textContent =
      total === 0
        ? this.view.state.phrase('No results')
        : current > 0
          ? `${current} of ${total_text}`
          : `${total_text} ${total === 1 ? 'match' : 'matches'}`;
    this.count_el.classList.toggle('plainmark-search-count-none', total === 0);
  }

  private set_query(query: SearchQuery): void {
    this.cancel();
    this.query = query;
    this.search_field.value = query.search;
    this.replace_field.value = query.replace;
    this.case_field.checked = query.caseSensitive;
    this.re_field.checked = query.regexp;
    this.word_field.checked = query.wholeWord;
  }
}

export function plainmark_search_panel(options: SearchPanelOptions): (view: EditorView) => Panel {
  return (view) => new PlainmarkSearchPanel(view, options.debounce_ms);
}

// CM6's panel + search-match colors come from its light baseTheme (the
// darkTheme facet is unset) and its controls sit at 70% of the body font —
// route everything through --vscode-* vars, mirroring autocomplete_theme.
export const search_panel_theme: Extension = EditorView.theme({
  // Float over the scroller like VS Code's find widget instead of taking a
  // full-width flex row that pushes the document down.
  '.cm-panels.cm-panels-top': {
    position: 'absolute',
    top: '0',
    right: '28px',
    left: 'auto',
    width: 'max-content',
    maxWidth: 'calc(100% - 56px)',
    zIndex: '300',
    backgroundColor:
      'var(--vscode-editorWidget-background, var(--vscode-editor-background, #ffffff))',
    color: 'var(--vscode-editorWidget-foreground, var(--vscode-foreground, inherit))',
    border: '1px solid var(--vscode-widget-border, var(--vscode-editorWidget-border, transparent))',
    borderTop: 'none',
    borderRadius: '0 0 4px 4px',
    boxShadow: '0 0 8px 2px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.16))',
  },
  '.cm-panel.cm-search': {
    fontFamily: 'var(--vscode-font-family, system-ui, sans-serif)',
    fontSize: 'var(--vscode-font-size, 13px)',
    padding: '6px 28px 6px 8px',
    position: 'relative',
  },
  '.cm-panel.cm-search .plainmark-search-row': {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    marginBottom: '4px',
  },
  '.cm-panel.cm-search .plainmark-search-options': {
    gap: '10px',
    marginBottom: '0',
  },
  '.cm-panel.cm-search .plainmark-search-option': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    whiteSpace: 'nowrap',
  },
  '.cm-panel.cm-search .cm-textfield, .cm-panel.cm-search .cm-button, .cm-panel.cm-search label': {
    font: 'inherit',
    margin: '0',
  },
  '.cm-panel.cm-search .plainmark-search-count': {
    minWidth: '5.5em',
    whiteSpace: 'nowrap',
    textAlign: 'center',
    color: 'var(--vscode-descriptionForeground, inherit)',
  },
  '.cm-panel.cm-search .plainmark-search-count-none': {
    color: 'var(--vscode-errorForeground, #f14c4c)',
  },
  '.cm-panel.cm-search input[type="checkbox"]': {
    margin: '0',
    accentColor: 'var(--vscode-focusBorder, #0078d4)',
  },
  '.cm-panel.cm-search .cm-textfield': {
    flex: '1 1 200px',
    minWidth: '200px',
    padding: '3px 6px',
    backgroundColor: 'var(--vscode-input-background, #ffffff)',
    color: 'var(--vscode-input-foreground, inherit)',
    border: '1px solid var(--vscode-input-border, var(--vscode-editorWidget-border, transparent))',
    borderRadius: '2px',
  },
  '.cm-panel.cm-search .cm-textfield::placeholder': {
    color: 'var(--vscode-input-placeholderForeground, inherit)',
    opacity: '0.7',
  },
  '.cm-panel.cm-search .cm-textfield:focus': {
    outline: '1px solid var(--vscode-focusBorder, #0090f1)',
    outlineOffset: '-1px',
  },
  '.cm-panel.cm-search .cm-button': {
    minHeight: '24px',
    padding: '2px 8px',
    backgroundImage: 'none',
    backgroundColor:
      'var(--vscode-button-secondaryBackground, var(--vscode-button-background, #5f6a79))',
    color: 'var(--vscode-button-secondaryForeground, var(--vscode-button-foreground, #ffffff))',
    border: '1px solid var(--vscode-button-border, transparent)',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  '.cm-panel.cm-search .cm-button:hover': {
    backgroundColor:
      'var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground, #4c5561))',
  },
  '.cm-panel.cm-search [name="close"]': {
    position: 'absolute',
    top: '4px',
    right: '6px',
    width: '20px',
    height: '20px',
    padding: '0',
    margin: '0',
    border: 'none',
    borderRadius: '3px',
    background: 'transparent',
    font: 'inherit',
    fontSize: '16px',
    lineHeight: '1',
    cursor: 'pointer',
    color: 'var(--vscode-icon-foreground, var(--vscode-editorWidget-foreground, inherit))',
  },
  '.cm-panel.cm-search [name="close"]:hover': {
    backgroundColor: 'var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2))',
  },
  '.cm-searchMatch': {
    backgroundColor: 'var(--vscode-editor-findMatchHighlightBackground, rgba(234, 92, 0, 0.33))',
    outline: '1px solid var(--vscode-editor-findMatchHighlightBorder, rgba(234, 92, 0, 0.6))',
    borderRadius: '2px',
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'var(--vscode-editor-findMatchBackground, rgba(234, 92, 0, 0.6))',
    outline: '1px solid var(--vscode-editor-findMatchBorder, var(--vscode-focusBorder, #0078d4))',
  },
  // The inline-code mark nests inside the (lowest-precedence, outermost)
  // search span and would paint its opaque background over the match.
  '.cm-searchMatch .plainmark-inline-code': {
    backgroundColor: 'transparent',
  },
});
