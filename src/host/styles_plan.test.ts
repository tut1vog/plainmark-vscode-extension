import { describe, it, expect } from 'vitest';
import {
  plan_plainmark_styles,
  plan_style_watch,
  type Disposable,
  type PlannedStyle,
  type StyleBases,
  type StyleReloadMessage,
  type StyleUriOps,
  type StyleWatcher,
  type StyleWatchOps,
} from './styles_plan.js';

// Encodes the `plainmark.styles` resolution + watch contract (theming.md
// THEME-R-1/3/4/5/9) against the vscode-free planner extracted from styles.ts.
// The real vscode URI arithmetic is injected behind the StyleUriOps /
// StyleWatchOps facades; here we pass a self-consistent STRING-URI algebra so we
// can assert the CONTRACT — which base each entry resolves against, what
// warnings aggregate, which resource roots are emitted and how they dedup —
// rather than echoing vscode's URI encoding (that thin wiring lives in
// styles.ts). Fake URIs are `/`-delimited path strings; `parent()` pops the last
// segment and `join()` resolves `.`/`..`, mirroring vscode.Uri.joinPath closely
// enough that dedup and base selection are exercised faithfully.

const WS = 'file:///ws'; // fake first-workspace-folder URI
const DOC = 'file:///docdir'; // fake bound-document directory URI

function join_fake(base: string, rel: string): string {
  const segs = base.split('/');
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (segs.length > 1) segs.pop();
      continue;
    }
    segs.push(seg);
  }
  return segs.join('/');
}

function parent_fake(uri: string): string {
  const segs = uri.split('/');
  segs.pop();
  return segs.join('/');
}

// Each op tags its output so a resolved local_uri reveals WHICH branch produced
// it: `parse_file_uri` keeps the `file:` string verbatim, `from_absolute_path`
// prefixes `abs:`, and `join` composes onto the chosen base.
function make_ops(): StyleUriOps<string> {
  return {
    parse_file_uri: (raw) => raw,
    from_absolute_path: (raw) => `abs:${raw.replace(/\\/g, '/')}`,
    join: join_fake,
    parent: parent_fake,
    to_string: (u) => u,
    to_webview_href: (u) => `webview:${u}`,
  };
}

function bases(workspace_folder: string | null, on_doc_dir?: () => void): StyleBases<string> {
  return {
    workspace_folder,
    document_dir: () => {
      on_doc_dir?.();
      return DOC;
    },
  };
}

describe('plan_plainmark_styles — non-array config THEME-R-1', () => {
  it('resolves any non-array value to an empty set with NO warnings', () => {
    for (const raw of [undefined, null, 42, 'a-string', {}, true]) {
      expect(plan_plainmark_styles(raw, bases(WS), make_ops())).toEqual({
        resolved: [],
        resource_roots: [],
        warnings: [],
      });
    }
  });

  it('an empty array resolves to an empty set with no warnings', () => {
    expect(plan_plainmark_styles([], bases(WS), make_ops())).toEqual({
      resolved: [],
      resource_roots: [],
      warnings: [],
    });
  });
});

describe('plan_plainmark_styles — per-kind base selection THEME-R-4', () => {
  it('routes file:/absolute/relative each through its own resolver, in order', () => {
    const raw = [
      'file:///Users/me/theme.css', // file_uri  → parse_file_uri (verbatim)
      '/etc/plainmark/x.css', // absolute posix → from_absolute_path
      'C:\\Users\\me\\win.css', // absolute windows drive → from_absolute_path
      './rel.css', // relative dot → join(base, …)
      'sub/nested.css', // bare relative → join(base, …)
    ];
    const plan = plan_plainmark_styles(raw, bases(WS), make_ops());
    expect(plan.resolved.map((r) => r.local_uri)).toEqual([
      'file:///Users/me/theme.css',
      'abs:/etc/plainmark/x.css',
      'abs:C:/Users/me/win.css',
      'file:///ws/rel.css',
      'file:///ws/sub/nested.css',
    ]);
    expect(plan.warnings).toEqual([]);
  });

  it('relative entries prefer the workspace folder and never consult the document dir', () => {
    let doc_dir_calls = 0;
    const plan = plan_plainmark_styles(
      ['theme.css'],
      bases(WS, () => doc_dir_calls++),
      make_ops(),
    );
    expect(plan.resolved[0].local_uri).toBe('file:///ws/theme.css');
    // Fallback order matters: with a folder present the doc dir is never touched.
    expect(doc_dir_calls).toBe(0);
  });

  it('relative entries fall back to the document dir when there is no workspace folder', () => {
    let doc_dir_calls = 0;
    const plan = plan_plainmark_styles(
      ['theme.css'],
      bases(null, () => doc_dir_calls++),
      make_ops(),
    );
    expect(plan.resolved[0].local_uri).toBe('file:///docdir/theme.css');
    expect(doc_dir_calls).toBe(1);
  });

  it('file: and absolute entries bypass the relative base entirely (doc dir untouched even with no folder)', () => {
    let doc_dir_calls = 0;
    const plan = plan_plainmark_styles(
      ['file:///a/x.css', '/abs/y.css', 'C:\\z\\w.css'],
      bases(null, () => doc_dir_calls++),
      make_ops(),
    );
    expect(plan.resolved.map((r) => r.local_uri)).toEqual([
      'file:///a/x.css',
      'abs:/abs/y.css',
      'abs:C:/z/w.css',
    ]);
    expect(doc_dir_calls).toBe(0);
  });

  it('an untitled/no-dir document (folderless) still resolves relatives against its dir thunk', () => {
    // The bound-document dir thunk is the sole base when no folder exists; the
    // caller supplies whatever Uri.joinPath(document_uri, '..') yields for an
    // untitled doc. The planner just consumes it.
    const plan = plan_plainmark_styles(['a.css'], bases(null), make_ops());
    expect(plan.resolved[0].local_uri).toBe('file:///docdir/a.css');
  });
});

describe('plan_plainmark_styles — warning aggregation THEME-R-3', () => {
  it('declines a remote entry with a warning but still resolves the rest', () => {
    const plan = plan_plainmark_styles(
      ['https://cdn/x.css', './ok.css'],
      bases(WS),
      make_ops(),
    );
    expect(plan.warnings).toEqual([
      'plainmark.styles: ignored remote URL "https://cdn/x.css" — http(s):// is unsupported in v1',
    ]);
    expect(plan.resolved.map((r) => r.local_uri)).toEqual(['file:///ws/ok.css']);
  });

  it('warns on invalid (empty / non-string) entries with the classifier reason, and continues', () => {
    const plan = plan_plainmark_styles(['', 42, null, {}, './ok.css'], bases(WS), make_ops());
    expect(plan.warnings).toEqual([
      'plainmark.styles: ignored entry — empty string',
      'plainmark.styles: ignored entry — not a string',
      'plainmark.styles: ignored entry — not a string',
      'plainmark.styles: ignored entry — not a string',
    ]);
    expect(plan.resolved.map((r) => r.local_uri)).toEqual(['file:///ws/ok.css']);
  });

  it('aggregates declined + invalid warnings in entry order, without aborting resolution', () => {
    const plan = plan_plainmark_styles(
      ['https://a', 'good1.css', 'http://b', '', 'good2.css'],
      bases(WS),
      make_ops(),
    );
    expect(plan.warnings).toEqual([
      'plainmark.styles: ignored remote URL "https://a" — http(s):// is unsupported in v1',
      'plainmark.styles: ignored remote URL "http://b" — http(s):// is unsupported in v1',
      'plainmark.styles: ignored entry — empty string',
    ]);
    expect(plan.resolved.map((r) => r.local_uri)).toEqual([
      'file:///ws/good1.css',
      'file:///ws/good2.css',
    ]);
  });

  it('a resolver throw is caught, warned as "failed to parse", and does not abort the rest', () => {
    const ops: StyleUriOps<string> = {
      ...make_ops(),
      parse_file_uri: () => {
        throw new Error('malformed URI');
      },
    };
    const plan = plan_plainmark_styles(['file:///bad', './ok.css'], bases(WS), ops);
    expect(plan.warnings).toEqual(['plainmark.styles: failed to parse "file:///bad"']);
    expect(plan.resolved.map((r) => r.local_uri)).toEqual(['file:///ws/ok.css']);
  });
});

describe('plan_plainmark_styles — resource roots + href THEME-R-5', () => {
  it("exposes each stylesheet's href via the webview facade", () => {
    const plan = plan_plainmark_styles(['a.css'], bases(WS), make_ops());
    expect(plan.resolved).toEqual([{ href: 'webview:file:///ws/a.css', local_uri: 'file:///ws/a.css' }]);
  });

  it('adds the parent directory (not the file) to resource roots', () => {
    const plan = plan_plainmark_styles(['a.css'], bases(WS), make_ops());
    // The root is the PARENT dir, never the stylesheet file itself.
    expect(plan.resource_roots).toEqual(['file:///ws']);
  });

  it('deduplicates two stylesheets sharing a directory into ONE resource root', () => {
    const plan = plan_plainmark_styles(['a.css', 'b.css'], bases(WS), make_ops());
    expect(plan.resolved).toHaveLength(2);
    expect(plan.resource_roots).toEqual(['file:///ws']);
  });

  it('keeps distinct parent dirs, each exactly once, in first-seen order', () => {
    const plan = plan_plainmark_styles(
      ['a.css', 'sub/b.css', 'sub/c.css', 'd.css'],
      bases(WS),
      make_ops(),
    );
    // a.css + d.css → file:///ws; sub/{b,c}.css → file:///ws/sub (deduped).
    expect(plan.resource_roots).toEqual(['file:///ws', 'file:///ws/sub']);
  });

  it('dedup is by string identity: parents equal as strings collapse to one root', () => {
    // ./a.css and a.css both resolve under the workspace folder → identical
    // parent string → a single root, proving dedup keys on to_string(parent).
    const plan = plan_plainmark_styles(['./a.css', 'a.css'], bases(WS), make_ops());
    expect(plan.resolved).toHaveLength(2);
    expect(plan.resource_roots).toEqual(['file:///ws']);
  });
});

// --- watch orchestration THEME-R-9 -------------------------------------------

interface WatchHarness {
  ops: StyleWatchOps<string>;
  posts: StyleReloadMessage[];
  created: string[];
  disposed: string[];
  sub_disposes: number;
  change_handlers: Map<string, () => void>;
  create_handlers: Map<string, () => void>;
}

function make_watch_harness(opts: { throw_on?: (uri: string) => boolean } = {}): WatchHarness {
  const h: WatchHarness = {
    posts: [],
    created: [],
    disposed: [],
    sub_disposes: 0,
    change_handlers: new Map(),
    create_handlers: new Map(),
    ops: undefined as unknown as StyleWatchOps<string>,
  };
  h.ops = {
    create_watcher: (local_uri) => {
      if (opts.throw_on?.(local_uri)) throw new Error('unwatchable on this target');
      h.created.push(local_uri);
      const watcher: StyleWatcher & Disposable = {
        on_change: (handler) => {
          h.change_handlers.set(local_uri, handler);
          return { dispose: () => h.sub_disposes++ };
        },
        on_create: (handler) => {
          h.create_handlers.set(local_uri, handler);
          return { dispose: () => h.sub_disposes++ };
        },
        dispose: () => h.disposed.push(local_uri),
      };
      return watcher;
    },
    post_message: (m) => h.posts.push(m),
  };
  return h;
}

const RESOLVED: PlannedStyle<string>[] = [
  { href: 'webview:a', local_uri: 'file:///ws/a.css' },
  { href: 'webview:b', local_uri: 'file:///ws/b.css' },
];

describe('plan_style_watch — one watcher per resolved file THEME-R-9', () => {
  it('creates exactly one watcher per resolved stylesheet', () => {
    const h = make_watch_harness();
    plan_style_watch(RESOLVED, h.ops);
    expect(h.created).toEqual(['file:///ws/a.css', 'file:///ws/b.css']);
  });

  it('posts style_reload with the file href on BOTH change and create events', () => {
    const h = make_watch_harness();
    plan_style_watch(RESOLVED, h.ops);
    h.change_handlers.get('file:///ws/a.css')!();
    h.create_handlers.get('file:///ws/a.css')!();
    h.change_handlers.get('file:///ws/b.css')!();
    expect(h.posts).toEqual([
      { type: 'style_reload', href: 'webview:a' },
      { type: 'style_reload', href: 'webview:a' },
      { type: 'style_reload', href: 'webview:b' },
    ]);
  });

  it('nothing is posted until a change/create fires', () => {
    const h = make_watch_harness();
    plan_style_watch(RESOLVED, h.ops);
    expect(h.posts).toEqual([]);
  });
});

describe('plan_style_watch — disposal THEME-R-9', () => {
  it('dispose() releases every watcher and every subscription', () => {
    const h = make_watch_harness();
    const handle = plan_style_watch(RESOLVED, h.ops);
    handle.dispose();
    expect(h.disposed).toEqual(['file:///ws/a.css', 'file:///ws/b.css']);
    // Two subscriptions (change + create) per file, each disposed once.
    expect(h.sub_disposes).toBe(4);
  });

  it('an empty resolved set installs no watchers and disposes cleanly', () => {
    const h = make_watch_harness();
    const handle = plan_style_watch([], h.ops);
    expect(h.created).toEqual([]);
    expect(() => handle.dispose()).not.toThrow();
    expect(h.disposed).toEqual([]);
  });
});

describe('plan_style_watch — registration failures swallowed THEME-R-9', () => {
  it('swallows a create_watcher throw and still watches the remaining files', () => {
    const h = make_watch_harness({ throw_on: (u) => u.includes('bad') });
    const resolved: PlannedStyle<string>[] = [
      { href: 'webview:a', local_uri: 'file:///ws/a.css' },
      { href: 'webview:bad', local_uri: 'file:///ws/bad.css' },
      { href: 'webview:c', local_uri: 'file:///ws/c.css' },
    ];
    const handle = plan_style_watch(resolved, h.ops);
    // The unwatchable entry is skipped; the others still register and fire.
    expect(h.created).toEqual(['file:///ws/a.css', 'file:///ws/c.css']);
    h.change_handlers.get('file:///ws/a.css')!();
    expect(h.posts).toEqual([{ type: 'style_reload', href: 'webview:a' }]);
    // Disposal only releases the two successful watchers.
    handle.dispose();
    expect(h.disposed).toEqual(['file:///ws/a.css', 'file:///ws/c.css']);
  });
});
