import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/config.js';
import { DirChordError } from '../src/errors.js';

describe('configuration validation', () => {
  it('fills defaults', () => {
    const config = validateConfig({});
    expect(config.concurrency).toBe(8);
    expect(config.ignores).toContain('.git/**');
  });

  it('accepts intentional limits', () => {
    const config = validateConfig({ concurrency: 4, maxFiles: 10, maxFileBytes: 20, maxTotalBytes: 30 });
    expect(config).toMatchObject({ concurrency: 4, maxFiles: 10, maxFileBytes: 20, maxTotalBytes: 30 });
  });

  it('rejects unknown keys', () => {
    expect(() => validateConfig({ telemetry: true })).toThrowError(DirChordError);
  });

  it('rejects unsafe concurrency', () => {
    expect(() => validateConfig({ concurrency: 0 })).toThrow(/concurrency/u);
    expect(() => validateConfig({ concurrency: 65 })).toThrow(/concurrency/u);
  });

  it('rejects non-string ignores', () => {
    expect(() => validateConfig({ ignores: ['valid', 42] })).toThrow(/array of strings/u);
  });
});
