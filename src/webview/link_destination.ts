// CommonMark link destinations come in two forms: a bare run (no unescaped
// spaces allowed) or an angle-bracketed `<...>` run, which is the spec's way to
// write a destination containing spaces. The lezer `URL` node includes the
// `<`/`>` delimiters in the angle form, so the raw node slice is not the
// destination — strip the delimiters here. Shared by inline links, reference
// definitions (links.ts), and images (image.ts); autolinks are unaffected
// (their angle brackets are separate LinkMark nodes).
export function effective_destination(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('<') && raw.endsWith('>')) {
    return raw.slice(1, -1);
  }
  return raw;
}
