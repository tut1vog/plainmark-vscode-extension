// Single source of truth for configurable table-operation shortcuts, shared by
// the host (resolves `plainmark.tableKeybindings`, injects the result) and the
// webview (builds the cell keymap + menu hints from the injected result). Pure —
// no vscode, DOM, or CodeMirror imports — so it bundles into both targets and the
// resolver is exercised by tier-a unit tests. → docs/spec/tables.md TBL-I-28..31

export const TABLE_ACTION_IDS = [
  'insert_row_above',
  'insert_row_below',
  'insert_column_left',
  'insert_column_right',
  'delete_row',
  'delete_column',
  'delete_table',
  'swap_row_up',
  'swap_row_down',
  'swap_column_left',
  'swap_column_right',
  'align_left',
  'align_center',
  'align_right',
  'align_none',
] as const;

export type TableActionId = (typeof TABLE_ACTION_IDS)[number];

export type ResolvedTableKeybindings = Record<TableActionId, string | null>;

// insert_row_below = Mod-Enter (Ctrl/Cmd+Enter) per owner request; the other
// insert + swap defaults mirror the pre-config hardcoded cell keymap; delete_row
// matches Typora (`Mod` = Cmd on macOS, Ctrl elsewhere). delete_column, delete_table,
// and the four align ops ship unbound but stay user-assignable.
export const TABLE_KEYBINDING_DEFAULTS: ResolvedTableKeybindings = {
  insert_row_above: 'Alt-Shift-ArrowUp',
  insert_row_below: 'Mod-Enter',
  insert_column_left: 'Alt-Shift-ArrowLeft',
  insert_column_right: 'Alt-Shift-ArrowRight',
  delete_row: 'Mod-Shift-Backspace',
  delete_column: null,
  delete_table: null,
  swap_row_up: 'Alt-ArrowUp',
  swap_row_down: 'Alt-ArrowDown',
  swap_column_left: 'Alt-ArrowLeft',
  swap_column_right: 'Alt-ArrowRight',
  align_left: null,
  align_center: null,
  align_right: null,
  align_none: null,
};

// Fixed precedence order so a combo normalizes to one canonical string regardless
// of how the user ordered the modifiers.
const MODIFIERS = ['Mod', 'Meta', 'Ctrl', 'Cmd', 'Alt', 'Shift'] as const;
const MODIFIER_SET: ReadonlySet<string> = new Set(MODIFIERS);

interface ParsedCombo {
  mods: ReadonlySet<string>;
  key: string;
}

function parse_combo(value: string): ParsedCombo | null {
  if (value.length === 0) return null;
  const parts = value.split('-');
  if (parts.some((p) => p.length === 0)) return null; // empty token (e.g. trailing '-')
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  for (const m of mods) {
    if (!MODIFIER_SET.has(m)) return null; // unknown modifier token
  }
  if (MODIFIER_SET.has(key)) return null; // a modifier name cannot be the key
  return { mods: new Set(mods), key };
}

function normalize_combo(parsed: ParsedCombo): string {
  return [...MODIFIERS.filter((m) => parsed.mods.has(m)), parsed.key].join('-');
}

// Structural keys the cell keymap owns; a binding MUST NOT shadow them. Bare
// Tab/Enter/Arrows are also caught by the modifier-required rule, but listing
// them keeps the reserved set explicit.
const RESERVED_COMBOS: ReadonlySet<string> = new Set(
  [
    'Tab',
    'Shift-Tab',
    'Enter',
    'Shift-Enter',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Mod-z',
    'Mod-Shift-z',
    'Mod-y',
  ].map((c) => normalize_combo(parse_combo(c) as ParsedCombo)),
);

const KNOWN_IDS: ReadonlySet<string> = new Set(TABLE_ACTION_IDS);

export interface TableKeybindingResolution {
  resolved: ResolvedTableKeybindings;
  /** Operator-visible warnings; the caller logs them (console.warn, no modal). */
  warnings: string[];
}

export function resolve_table_keybindings(raw: unknown): TableKeybindingResolution {
  const resolved: ResolvedTableKeybindings = { ...TABLE_KEYBINDING_DEFAULTS };
  const warnings: string[] = [];

  if (raw !== undefined && raw !== null) {
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      warnings.push('plainmark.tableKeybindings: expected an object — ignored.');
      return { resolved, warnings };
    }
    for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!KNOWN_IDS.has(id)) {
        warnings.push(`plainmark.tableKeybindings: unknown action "${id}" — ignored.`);
        continue;
      }
      const action = id as TableActionId;
      if (value === '') {
        resolved[action] = null; // explicit unbind
        continue;
      }
      if (typeof value !== 'string') {
        warnings.push(`plainmark.tableKeybindings.${id}: expected a key string — kept default.`);
        continue;
      }
      const parsed = parse_combo(value);
      if (!parsed) {
        warnings.push(
          `plainmark.tableKeybindings.${id}: "${value}" is not a valid key combo — kept default.`,
        );
        continue;
      }
      if (parsed.mods.size === 0) {
        warnings.push(
          `plainmark.tableKeybindings.${id}: "${value}" needs a modifier (Mod/Alt/Ctrl) — kept default.`,
        );
        continue;
      }
      if (RESERVED_COMBOS.has(normalize_combo(parsed))) {
        warnings.push(
          `plainmark.tableKeybindings.${id}: "${value}" is reserved for editing/navigation — kept default.`,
        );
        continue;
      }
      resolved[action] = value;
    }
  }

  // Deduplicate in canonical action order — the first claimant keeps the key,
  // later collisions are unbound.
  const claimed = new Map<string, TableActionId>();
  for (const action of TABLE_ACTION_IDS) {
    const key = resolved[action];
    if (key === null) continue;
    const parsed = parse_combo(key);
    if (!parsed) continue;
    const normalized = normalize_combo(parsed);
    const owner = claimed.get(normalized);
    if (owner === undefined) {
      claimed.set(normalized, action);
    } else {
      resolved[action] = null;
      warnings.push(
        `plainmark.tableKeybindings.${action}: "${key}" already bound to "${owner}" — unbound.`,
      );
    }
  }

  return { resolved, warnings };
}
