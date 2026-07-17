import { describe, expect, it } from 'vitest';
import { compareManifests } from '../src/compare.js';
import { comparisonToJson, formatBytes, renderComparisonHtml, renderComparisonTerminal } from '../src/report.js';
import type { Manifest } from '../src/types.js';

function manifest(path: string, hash: string): Manifest {
  return {
    format: 'dirchord/v1',
    createdBy: 'DirChord test',
    options: { algorithm: 'sha256', ignores: [], symlinks: 'hash-target-without-following' },
    summary: { files: 1, symlinks: 0, bytes: 1 },
    entries: [{ type: 'file', path, size: 1, sha256: hash.repeat(64) }],
  };
}

describe('reports', () => {
  it('formats byte quantities', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.00 KiB');
  });

  it('renders readable terminal differences', () => {
    const result = compareManifests(manifest('old', 'a'), manifest('new', 'a'));
    expect(renderComparisonTerminal(result, { left: 'one', right: 'two' })).toContain('old  ->  new');
  });

  it('escapes untrusted paths in HTML', () => {
    const result = compareManifests(manifest('safe', 'a'), manifest('<img src=x onerror=alert(1)>', 'b'));
    const html = renderComparisonHtml(result, { left: '<left>', right: 'right' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('&lt;left&gt;');
  });

  it('produces machine-readable JSON', () => {
    const result = compareManifests(manifest('same', 'a'), manifest('same', 'a'));
    const parsed = JSON.parse(comparisonToJson(result, { left: 'a', right: 'b' })) as { equal: boolean };
    expect(parsed.equal).toBe(true);
  });

  it('renders terminal control characters visibly', () => {
    const result = compareManifests(manifest('safe', 'a'), manifest('line\nname', 'b'));
    const terminal = renderComparisonTerminal(result, { left: 'left', right: 'right' });
    expect(terminal).toContain('line\\u000aname');
    expect(terminal).not.toContain('line\nname');
  });
});
