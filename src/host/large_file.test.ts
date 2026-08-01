import { describe, expect, it } from 'vitest';
import {
  LARGE_FILE_WARN_THRESHOLD,
  large_file_warning_message,
  should_warn_large_file,
} from './large_file.js';

describe('large-document advisory SHELL-C-16', () => {
  it('stays quiet at and below the threshold', () => {
    expect(should_warn_large_file(0, false)).toBe(false);
    expect(should_warn_large_file(LARGE_FILE_WARN_THRESHOLD - 1, false)).toBe(false);
    expect(should_warn_large_file(LARGE_FILE_WARN_THRESHOLD, false)).toBe(false);
  });

  it('warns above the threshold when not yet warned', () => {
    expect(should_warn_large_file(LARGE_FILE_WARN_THRESHOLD + 1, false)).toBe(true);
  });

  it('warns at most once per session', () => {
    expect(should_warn_large_file(LARGE_FILE_WARN_THRESHOLD + 1, true)).toBe(false);
  });

  it('message states the size in MB and points at the built-in text editor', () => {
    const message = large_file_warning_message(3 * 1024 * 1024);
    expect(message).toContain('3.0 MB');
    expect(message).toContain('built-in text editor');
    expect(message).toContain('Reopen Editor With');
  });
});
