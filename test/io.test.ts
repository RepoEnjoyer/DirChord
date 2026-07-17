import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { atomicWrite } from '../src/io.js';

const temporaryPaths: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dirchord-io-test-'));
  temporaryPaths.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map((item) => rm(item, { recursive: true, force: true })));
});

describe('atomic output', () => {
  it('writes a new file', async () => {
    const output = path.join(await temporaryDirectory(), 'manifest.json');
    await atomicWrite(output, 'first', false);
    expect(await readFile(output, 'utf8')).toBe('first');
  });

  it('refuses accidental overwrite', async () => {
    const output = path.join(await temporaryDirectory(), 'manifest.json');
    await writeFile(output, 'original');
    await expect(atomicWrite(output, 'replacement', false)).rejects.toThrow(/already exists/u);
    expect(await readFile(output, 'utf8')).toBe('original');
  });

  it('replaces only when forced', async () => {
    const output = path.join(await temporaryDirectory(), 'manifest.json');
    await writeFile(output, 'original');
    await atomicWrite(output, 'replacement', true);
    expect(await readFile(output, 'utf8')).toBe('replacement');
  });
});
