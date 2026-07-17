import { describe, expect, it } from 'vitest';
import { compilePatterns, globToRegExp, isIgnored, normalizePattern } from '../src/glob.js';

describe('glob matching', () => {
  it('matches a basename anywhere', () => {
    const expression = globToRegExp('*.log');
    expect(expression.test('debug.log')).toBe(true);
    expect(expression.test('nested/debug.log')).toBe(true);
    expect(expression.test('debug.txt')).toBe(false);
  });

  it('supports globstars', () => {
    const expression = globToRegExp('cache/**');
    expect(expression.test('cache/')).toBe(true);
    expect(expression.test('cache/nested/file.bin')).toBe(true);
    expect(expression.test('other/cache/file.bin')).toBe(false);
  });

  it('supports single-character wildcards', () => {
    const expression = globToRegExp('slot-?.sav');
    expect(expression.test('slot-1.sav')).toBe(true);
    expect(expression.test('slot-10.sav')).toBe(false);
  });

  it('applies ordered negation', () => {
    const patterns = compilePatterns(['*.log', '!keep.log']);
    expect(isIgnored('nested/error.log', patterns)).toBe(true);
    expect(isIgnored('keep.log', patterns)).toBe(false);
  });

  it('normalizes separators', () => {
    expect(normalizePattern('.\\cache\\**')).toBe('cache/**');
  });
});
