import {
  TABLE_ACTION_IDS,
  TABLE_KEYBINDING_DEFAULTS,
  type ResolvedTableKeybindings,
  type TableActionId,
} from '../../common/table_keybindings.js';

declare global {
  interface Window {
    __plainmark_table_keybindings?: Partial<Record<TableActionId, string | null>>;
  }
}

// The host injects the fully-resolved map at boot (TBL-I-28). Fall back to the
// built-in defaults when it is absent (e.g. the headless test harness, which has
// no host), filling any missing action from defaults. → TBL-I-8 / TBL-I-27
export function get_table_keybindings(): ResolvedTableKeybindings {
  const injected =
    typeof window !== 'undefined' ? window.__plainmark_table_keybindings : undefined;
  const resolved: ResolvedTableKeybindings = { ...TABLE_KEYBINDING_DEFAULTS };
  if (injected && typeof injected === 'object') {
    for (const action of TABLE_ACTION_IDS) {
      const value = injected[action];
      if (typeof value === 'string' || value === null) resolved[action] = value;
    }
  }
  return resolved;
}
