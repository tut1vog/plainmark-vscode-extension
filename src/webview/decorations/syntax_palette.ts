// Light-palette (VS Code Light+) hexes, mirroring the :root values in
// theme/root_defaults.ts. Inline fallbacks keep token coloring alive if the
// host-injected :root defaults are ever absent (THEME-V-1 / THEME-V-8).
const syntax_token_fallbacks = {
  keyword: '#0000ff',
  comment: '#008000',
  string: '#a31515',
  number: '#098658',
  function: '#795e26',
  variable: '#001080',
  type: '#267f99',
  property: '#001080',
  tag: '#800000',
  meta: '#000000',
  punctuation: '#000000',
  invalid: '#cd3131',
} as const;

export type SyntaxTokenClass = keyof typeof syntax_token_fallbacks;

export const syntax_token_classes = Object.keys(
  syntax_token_fallbacks,
) as readonly SyntaxTokenClass[];

export function syntax_token_color(token: SyntaxTokenClass): string {
  return `var(--plainmark-syntax-${token}-color, ${syntax_token_fallbacks[token]})`;
}
