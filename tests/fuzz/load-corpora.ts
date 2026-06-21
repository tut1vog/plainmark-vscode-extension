// Spec-corpus loaders for the fuzz suite (T28.2).
//
// CommonMark: vendored from https://spec.commonmark.org/0.31.2/spec.json
// (652 entries, JSON `{markdown, html, example, start_line, end_line, section}[]`).
// GFM extensions: vendored from
// https://raw.githubusercontent.com/github/cmark-gfm/master/test/extensions.txt
// in the standard CommonMark `.txt` example block format
// (`<delim> example\n<markdown>\n.\n<html>\n<delim>\n`).

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export interface SpecEntry {
  markdown: string;
  html: string;
  example: number;
  start_line: number;
  end_line: number;
  section: string;
  source: 'commonmark' | 'gfm';
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

export function load_commonmark(): SpecEntry[] {
  const raw = readFileSync(join(FIXTURES, 'commonmark-spec.json'), 'utf8');
  const parsed = JSON.parse(raw) as Omit<SpecEntry, 'source'>[];
  return parsed.map((e) => ({ ...e, source: 'commonmark' }));
}

// Parses cmark-gfm's `extensions.txt` (CommonMark `.txt` example-block format).
// Each example is a fenced block opened by a long run of backticks followed by
// ` example` and closed by the same run on its own line; inside the block, a
// lone `.` line separates the markdown input from the expected HTML.
export function load_gfm_extensions(): SpecEntry[] {
  const raw = readFileSync(join(FIXTURES, 'gfm-extensions.txt'), 'utf8');
  const lines = raw.split('\n');
  const entries: SpecEntry[] = [];
  let section = '';
  let i = 0;
  let example_no = 0;
  while (i < lines.length) {
    const line = lines[i];
    const section_match = /^#{1,6}\s+(.*)$/.exec(line);
    if (section_match) {
      section = section_match[1].trim();
      i++;
      continue;
    }
    const open_match = /^(`{32,})\s+example\s*$/.exec(line);
    if (!open_match) {
      i++;
      continue;
    }
    const fence = open_match[1];
    const start_line = i + 1;
    i++;
    const md_lines: string[] = [];
    while (i < lines.length && lines[i] !== '.') {
      md_lines.push(lines[i]);
      i++;
    }
    if (i >= lines.length) break;
    i++; // skip the `.` separator
    const html_lines: string[] = [];
    while (i < lines.length && lines[i] !== fence) {
      html_lines.push(lines[i]);
      i++;
    }
    const end_line = i + 1;
    if (i < lines.length) i++; // skip the closing fence
    example_no++;
    entries.push({
      markdown: md_lines.join('\n') + (md_lines.length ? '\n' : ''),
      html: html_lines.join('\n') + (html_lines.length ? '\n' : ''),
      example: example_no,
      start_line,
      end_line,
      section,
      source: 'gfm',
    });
  }
  return entries;
}

export function load_all(): SpecEntry[] {
  return [...load_commonmark(), ...load_gfm_extensions()];
}
