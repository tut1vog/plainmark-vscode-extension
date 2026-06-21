import { describe, it, expect, vi, afterEach } from 'vitest';
import { create_logger } from './log.js';

type DebugGlobal = { __PLAINMARK_DEBUG__?: boolean };

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as DebugGlobal).__PLAINMARK_DEBUG__;
});

describe('create_logger', () => {
  it('debug is silent unless __PLAINMARK_DEBUG__ is set, then emits with the tag', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = create_logger('sync');

    log.debug('quiet', 1);
    expect(spy).not.toHaveBeenCalled();

    (globalThis as DebugGlobal).__PLAINMARK_DEBUG__ = true;
    log.debug('loud', 2);
    expect(spy).toHaveBeenCalledWith('[sync]', 'loud', 2);
  });

  it('debug evaluates function args lazily — never with debug off, unwrapped when on', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = create_logger('sync');
    const thunk = vi.fn(() => ({ doc_len: 42 }));

    log.debug('quiet', thunk);
    expect(thunk).not.toHaveBeenCalled();

    (globalThis as DebugGlobal).__PLAINMARK_DEBUG__ = true;
    log.debug('loud', thunk);
    expect(thunk).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('[sync]', 'loud', { doc_len: 42 });
  });

  it('warn and error always emit with the namespace tag prepended', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = create_logger('init');

    log.warn('w', { a: 1 });
    log.error('e', { b: 2 });

    expect(warn).toHaveBeenCalledWith('[init]', 'w', { a: 1 });
    expect(error).toHaveBeenCalledWith('[init]', 'e', { b: 2 });
  });
});
