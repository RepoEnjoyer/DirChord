import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT_FILES = [
  'README.md',
  'CHANGELOG.md',
  'ROADMAP.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'AI_HANDOFF.md',
  'LICENSE',
  'package.json',
];

async function filesBelow(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(entryPath));
    else if (entry.isFile()) result.push(entryPath);
  }
  return result;
}

describe('publication privacy regression', () => {
  it('contains no local absolute paths or email addresses in authored files', async () => {
    const files = [
      ...ROOT_FILES.map((file) => path.resolve(file)),
      ...await filesBelow(path.resolve('src')),
      ...await filesBelow(path.resolve('docs')),
      ...await filesBelow(path.resolve('.github')),
    ];
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      expect(content, file).not.toMatch(/(?:\/Users\/|\/home\/|\/workspace\/|\/root\/|[A-Za-z]:\\Users\\)/u);
      expect(content, file).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u);
    }
  });

  it('uses only the public username for package authorship', async () => {
    const packageJson = JSON.parse(await readFile(path.resolve('package.json'), 'utf8')) as { author?: string };
    expect(packageJson.author).toBe('RepoEnjoyer');
  });
});
