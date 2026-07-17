import { describe, expect, it } from 'vitest';
import { parseArguments } from '../src/cli.js';

describe('CLI argument parsing', () => {
  it('parses repeatable ignore options', () => {
    const parsed = parseArguments(['snapshot', '.', '--ignore', '*.log', '--ignore', 'cache/**']);
    expect(parsed.command).toBe('snapshot');
    expect(parsed.positionals).toEqual(['.']);
    expect(parsed.ignores).toEqual(['*.log', 'cache/**']);
  });

  it('parses report options', () => {
    const parsed = parseArguments(['compare', 'one', 'two', '-f', 'html', '-o', 'report.html', '--force']);
    expect(parsed).toMatchObject({
      command: 'compare',
      positionals: ['one', 'two'],
      format: 'html',
      output: 'report.html',
      force: true,
    });
  });

  it('rejects unknown options', () => {
    expect(() => parseArguments(['snapshot', '--telemetry'])).toThrow(/Unknown option/u);
  });

  it('rejects unsupported formats', () => {
    expect(() => parseArguments(['compare', 'a', 'b', '--format', 'xml'])).toThrow(/Unsupported format/u);
  });

  it('allows dash-prefixed positional values after a separator', () => {
    const parsed = parseArguments(['snapshot', '--', '-folder']);
    expect(parsed.positionals).toEqual(['-folder']);
  });
});
