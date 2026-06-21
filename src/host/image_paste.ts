// Pure path/name helpers for the paste-image feature. No `vscode` and no Node
// `path` (INV-HOST-1): callers pass URI path strings and rebuild URIs themselves.

export interface SaveDirPlan {
  base: 'workspace' | 'document';
  relative: string;
}

const WORKSPACE_VAR = '${documentWorkspaceFolder}';
const BASENAME_VAR = '${documentBaseName}';

function clean_relative(p: string): string {
  return p
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .join('/');
}

export function plan_save_dir(template: string, document_base_name: string): SaveDirPlan {
  const expanded = template.split(BASENAME_VAR).join(document_base_name);
  if (expanded.includes(WORKSPACE_VAR)) {
    return { base: 'workspace', relative: clean_relative(expanded.split(WORKSPACE_VAR).join('')) };
  }
  return { base: 'document', relative: clean_relative(expanded) };
}

export function document_base_name(path: string): string {
  const file = path.split('/').filter(Boolean).pop() ?? '';
  const dot = file.lastIndexOf('.');
  return dot > 0 ? file.slice(0, dot) : file;
}

export function ext_for_mime(mime: string): string {
  switch (mime.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'png';
  }
}

export function format_image_timestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${day}-${time}`;
}

export function image_file_name(date: Date, mime: string): string {
  return `image-${format_image_timestamp(date)}.${ext_for_mime(mime)}`;
}

export function dedupe_file_name(desired: string, taken: ReadonlySet<string>): string {
  if (!taken.has(desired)) return desired;
  const dot = desired.lastIndexOf('.');
  const stem = dot > 0 ? desired.slice(0, dot) : desired;
  const ext = dot > 0 ? desired.slice(dot) : '';
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function relative_path(from_dir: string, to_file: string): string {
  const from = from_dir.split('/').filter(Boolean);
  const to = to_file.split('/').filter(Boolean);
  let i = 0;
  while (i < from.length && i < to.length && from[i] === to[i]) i++;
  const ups = Array.from({ length: from.length - i }, () => '..');
  return [...ups, ...to.slice(i)].join('/') || '.';
}
