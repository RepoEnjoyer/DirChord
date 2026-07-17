import { DirChordError } from './errors.js';

const REGEX_SPECIAL = /[\\^$+?.()|[\]{}]/g;

export function normalizePattern(pattern: string): string {
  const trimmed = pattern.trim().replaceAll('\\', '/');
  if (trimmed.includes('\0')) {
    throw new DirChordError('INVALID_IGNORE', 'Ignore patterns cannot contain null bytes.');
  }
  return trimmed.startsWith('./') ? trimmed.slice(2) : trimmed;
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = normalizePattern(pattern);
  let source = '';

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index] ?? '';
    const next = normalized[index + 1];

    if (character === '*' && next === '*') {
      const afterGlobstar = normalized[index + 2];
      if (afterGlobstar === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
      continue;
    }

    if (character === '*') {
      source += '[^/]*';
      continue;
    }

    if (character === '?') {
      source += '[^/]';
      continue;
    }

    source += character.replace(REGEX_SPECIAL, '\\$&');
  }

  const prefix = normalized.includes('/') ? '^' : '^(?:.*/)?';
  return new RegExp(`${prefix}${source}$`, 'u');
}

interface CompiledPattern {
  negated: boolean;
  expression: RegExp;
}

export function compilePatterns(patterns: string[]): CompiledPattern[] {
  return patterns
    .map(normalizePattern)
    .filter((pattern) => pattern !== '' && !pattern.startsWith('#'))
    .map((pattern) => {
      const negated = pattern.startsWith('!');
      const body = negated ? pattern.slice(1) : pattern;
      if (body === '') {
        throw new DirChordError('INVALID_IGNORE', 'A negated ignore pattern needs a value.');
      }
      return { negated, expression: globToRegExp(body) };
    });
}

export function isIgnored(path: string, patterns: CompiledPattern[]): boolean {
  let ignored = false;
  for (const pattern of patterns) {
    if (pattern.expression.test(path)) ignored = !pattern.negated;
  }
  return ignored;
}
