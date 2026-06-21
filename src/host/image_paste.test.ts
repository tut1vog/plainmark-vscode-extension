import { describe, expect, it } from 'vitest';
import {
  dedupe_file_name,
  document_base_name,
  ext_for_mime,
  format_image_timestamp,
  image_file_name,
  plan_save_dir,
  relative_path,
} from './image_paste.js';

describe('plan_save_dir — location setting + variables (IMG-I-7)', () => {
  it('default "." saves next to the document', () => {
    expect(plan_save_dir('.', 'post')).toEqual({ base: 'document', relative: '' });
  });

  it('strips a leading "./" and trailing slash', () => {
    expect(plan_save_dir('./assets', 'post')).toEqual({ base: 'document', relative: 'assets' });
    expect(plan_save_dir('assets/', 'post')).toEqual({ base: 'document', relative: 'assets' });
  });

  it('expands ${documentBaseName} against the document folder', () => {
    expect(plan_save_dir('assets/${documentBaseName}', 'post')).toEqual({
      base: 'document',
      relative: 'assets/post',
    });
    expect(plan_save_dir('${documentBaseName}/imgs', 'my.note')).toEqual({
      base: 'document',
      relative: 'my.note/imgs',
    });
  });

  it('resolves ${documentWorkspaceFolder} against the workspace root', () => {
    expect(plan_save_dir('${documentWorkspaceFolder}', 'post')).toEqual({
      base: 'workspace',
      relative: '',
    });
    expect(plan_save_dir('${documentWorkspaceFolder}/assets', 'post')).toEqual({
      base: 'workspace',
      relative: 'assets',
    });
  });

  it('combines both variables', () => {
    expect(plan_save_dir('${documentWorkspaceFolder}/assets/${documentBaseName}', 'post')).toEqual({
      base: 'workspace',
      relative: 'assets/post',
    });
  });
});

describe('document_base_name', () => {
  it('strips directory and extension', () => {
    expect(document_base_name('/a/notes/post.md')).toBe('post');
    expect(document_base_name('/a/notes/post.markdown')).toBe('post');
  });

  it('keeps interior dots, drops only the last extension', () => {
    expect(document_base_name('/a/my.note.md')).toBe('my.note');
  });

  it('handles a name with no extension and a trailing slash', () => {
    expect(document_base_name('/a/README')).toBe('README');
    expect(document_base_name('/a/notes/')).toBe('notes');
  });
});

describe('ext_for_mime — filename extension (IMG-I-9)', () => {
  it('defaults to png and respects jpeg/gif/webp', () => {
    expect(ext_for_mime('image/png')).toBe('png');
    expect(ext_for_mime('image/jpeg')).toBe('jpg');
    expect(ext_for_mime('image/gif')).toBe('gif');
    expect(ext_for_mime('image/webp')).toBe('webp');
  });

  it('is case-insensitive and defaults unknown types to png', () => {
    expect(ext_for_mime('IMAGE/JPEG')).toBe('jpg');
    expect(ext_for_mime('image/svg+xml')).toBe('png');
    expect(ext_for_mime('')).toBe('png');
  });
});

describe('format_image_timestamp / image_file_name (IMG-I-9)', () => {
  it('formats local time as YYYYMMDD-HHMMSS', () => {
    expect(format_image_timestamp(new Date(2026, 5, 21, 10, 15, 0))).toBe('20260621-101500');
  });

  it('zero-pads every field', () => {
    expect(format_image_timestamp(new Date(2026, 0, 1, 0, 0, 0))).toBe('20260101-000000');
    expect(format_image_timestamp(new Date(2026, 11, 9, 9, 5, 3))).toBe('20261209-090503');
  });

  it('builds image-<ts>.<ext>', () => {
    const date = new Date(2026, 5, 21, 10, 15, 0);
    expect(image_file_name(date, 'image/png')).toBe('image-20260621-101500.png');
    expect(image_file_name(date, 'image/jpeg')).toBe('image-20260621-101500.jpg');
  });
});

describe('dedupe_file_name — never overwrite (IMG-I-9)', () => {
  it('returns the desired name when free', () => {
    expect(dedupe_file_name('x.png', new Set())).toBe('x.png');
  });

  it('appends -2, -3, … on collision', () => {
    expect(dedupe_file_name('x.png', new Set(['x.png']))).toBe('x-2.png');
    expect(dedupe_file_name('x.png', new Set(['x.png', 'x-2.png']))).toBe('x-3.png');
    expect(dedupe_file_name('x.png', new Set(['x.png', 'x-2.png', 'x-3.png']))).toBe('x-4.png');
  });

  it('inserts the suffix before the extension', () => {
    expect(
      dedupe_file_name('image-20260621-101500.png', new Set(['image-20260621-101500.png'])),
    ).toBe('image-20260621-101500-2.png');
  });

  it('handles names with no extension and leading-dot names', () => {
    expect(dedupe_file_name('noext', new Set(['noext']))).toBe('noext-2');
    expect(dedupe_file_name('.gitignore', new Set(['.gitignore']))).toBe('.gitignore-2');
  });
});

describe('relative_path — document folder → saved file with .. segments (IMG-I-6)', () => {
  it('same directory yields a bare filename', () => {
    expect(relative_path('/a/notes', '/a/notes/img.png')).toBe('img.png');
  });

  it('descends into a subdirectory', () => {
    expect(relative_path('/a/notes', '/a/notes/assets/img.png')).toBe('assets/img.png');
  });

  it('ascends to a sibling directory with ..', () => {
    expect(relative_path('/a/notes', '/a/assets/img.png')).toBe('../assets/img.png');
  });

  it('ascends multiple levels to the workspace root', () => {
    expect(relative_path('/ws/docs/sub', '/ws/img.png')).toBe('../../img.png');
    expect(relative_path('/a/b/notes', '/a/assets/img.png')).toBe('../../assets/img.png');
  });

  it('handles disjoint roots', () => {
    expect(relative_path('/a/notes', '/x/y/img.png')).toBe('../../x/y/img.png');
  });

  it('normalizes a trailing slash on the source directory', () => {
    expect(relative_path('/a/notes/', '/a/notes/img.png')).toBe('img.png');
  });

  it('handles the filesystem root as the source', () => {
    expect(relative_path('/', '/img.png')).toBe('img.png');
  });

  it('ascends one level for a file one directory up', () => {
    expect(relative_path('/a/b/c', '/a/b/img.png')).toBe('../img.png');
  });
});
