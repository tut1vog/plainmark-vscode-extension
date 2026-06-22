import { CLAUDIFY_CSS } from './claudify.js';
import { GITHUB_DARK_CSS } from './github_dark.js';
import { GITHUB_LIGHT_CSS } from './github_light.js';

const THEME_CSS: Record<string, string> = {
  'github-light': GITHUB_LIGHT_CSS,
  'github-dark': GITHUB_DARK_CSS,
  claudify: CLAUDIFY_CSS,
};

export type ThemeId = 'default' | 'github-light' | 'github-dark' | 'claudify';

// Unknown or missing values fall back to the adaptive default so a stale setting never breaks rendering.
export function normalize_theme_id(theme: unknown): ThemeId {
  if (theme === 'github-light' || theme === 'github-dark' || theme === 'claudify') return theme;
  return 'default';
}

export function theme_css_for(theme: unknown): string {
  return THEME_CSS[normalize_theme_id(theme)] ?? '';
}
