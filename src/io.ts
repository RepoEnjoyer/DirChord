import { randomBytes } from 'node:crypto';
import { lstat, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DirChordError } from './errors.js';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export async function atomicWrite(filePath: string, content: string, force: boolean): Promise<void> {
  const absolutePath = path.resolve(filePath);
  if (!force && (await pathExists(absolutePath))) {
    throw new DirChordError('OUTPUT_EXISTS', `Output already exists: ${filePath}. Use --force to replace it.`);
  }

  const temporaryPath = path.join(
    path.dirname(absolutePath),
    `.${path.basename(absolutePath)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DirChordError('OUTPUT_DIRECTORY_MISSING', `Output directory does not exist: ${path.dirname(filePath)}`);
    }
    throw error;
  }
}
