#!/usr/bin/env node

import { lstat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compareManifests, inspectManifest } from './compare.js';
import { loadConfig } from './config.js';
import { VERSION, DEFAULT_CONFIG } from './constants.js';
import { asHelpfulError, DirChordError } from './errors.js';
import { atomicWrite } from './io.js';
import { createManifest, loadManifest, manifestToJson } from './manifest.js';
import { relativePortablePath } from './paths.js';
import {
  comparisonToJson,
  renderComparisonHtml,
  renderComparisonTerminal,
  renderInspectTerminal,
} from './report.js';
import type { DirChordConfig, Manifest, ReportFormat } from './types.js';

interface ParsedArguments {
  command?: string;
  positionals: string[];
  output?: string;
  format?: ReportFormat;
  config?: string;
  ignores: string[];
  force: boolean;
  color: boolean;
  help: boolean;
  version: boolean;
}

const HELP = `DirChord ${VERSION}
Deterministic folder manifests and private, local comparisons.

Usage:
  dirchord snapshot [folder] [--output file] [--ignore glob] [--force]
  dirchord compare <left> <right> [--format terminal|json|html] [--output file]
  dirchord verify <folder> <manifest> [--format terminal|json|html]
  dirchord inspect <manifest> [--format terminal|json]
  dirchord init [folder] [--force]

Inputs to compare may be folders or .dirchord.json manifests.

Options:
  -o, --output <file>     Write output to a file; use - for stdout
  -f, --format <format>   terminal (default), json, or html
      --ignore <glob>     Add an ignore pattern; repeat as needed
      --config <file>     Use an explicit configuration file
      --force             Replace an existing output file
      --no-color          Disable ANSI colors
  -h, --help              Show help
  -v, --version           Show version

Exit codes: 0 in sync/success, 1 differences found, 2 usage or runtime error.
`;

function takeValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) {
    throw new DirChordError('USAGE', `${option} needs a value.`);
  }
  return value;
}

export function parseArguments(args: string[]): ParsedArguments {
  const parsed: ParsedArguments = {
    positionals: [],
    ignores: [],
    force: false,
    color: true,
    help: false,
    version: false,
  };
  let positionalOnly = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index] ?? '';
    if (argument === '--') {
      positionalOnly = true;
      continue;
    }
    if (!positionalOnly && (argument === '--help' || argument === '-h')) {
      parsed.help = true;
    } else if (!positionalOnly && (argument === '--version' || argument === '-v')) {
      parsed.version = true;
    } else if (!positionalOnly && argument === '--force') {
      parsed.force = true;
    } else if (!positionalOnly && argument === '--no-color') {
      parsed.color = false;
    } else if (!positionalOnly && (argument === '--output' || argument === '-o')) {
      parsed.output = takeValue(args, index, argument);
      index += 1;
    } else if (!positionalOnly && (argument === '--format' || argument === '-f')) {
      const value = takeValue(args, index, argument);
      if (!['terminal', 'json', 'html'].includes(value)) {
        throw new DirChordError('USAGE', `Unsupported format: ${value}`);
      }
      parsed.format = value as ReportFormat;
      index += 1;
    } else if (!positionalOnly && argument === '--config') {
      parsed.config = takeValue(args, index, argument);
      index += 1;
    } else if (!positionalOnly && argument === '--ignore') {
      parsed.ignores.push(takeValue(args, index, argument));
      index += 1;
    } else if (!positionalOnly && argument.startsWith('-')) {
      throw new DirChordError('USAGE', `Unknown option: ${argument}`);
    } else if (parsed.command === undefined) {
      parsed.command = argument;
    } else {
      parsed.positionals.push(argument);
    }
  }
  return parsed;
}

async function isDirectory(input: string): Promise<boolean> {
  try {
    return (await lstat(input)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new DirChordError('INPUT_NOT_FOUND', `Input not found: ${input}`);
    }
    throw error;
  }
}

function safeLabel(input: string): string {
  return path.basename(path.resolve(input)) || 'folder';
}

function outputIgnore(root: string, output?: string): string[] {
  if (output === undefined || output === '-') return [];
  const absoluteRoot = path.resolve(root);
  const absoluteOutput = path.resolve(output);
  const relative = path.relative(absoluteRoot, absoluteOutput);
  if (relative === '' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return [];
  return [relativePortablePath(absoluteRoot, absoluteOutput)];
}

async function optionsForRoot(root: string, parsed: ParsedArguments, output?: string): Promise<DirChordConfig & { extraIgnores: string[] }> {
  const config = await loadConfig(path.resolve(root), parsed.config);
  return {
    ...config,
    ignores: [...config.ignores, ...parsed.ignores],
    extraIgnores: outputIgnore(root, output),
  };
}

async function resolveInput(input: string, parsed: ParsedArguments): Promise<Manifest> {
  if (await isDirectory(input)) {
    return createManifest(input, await optionsForRoot(input, parsed, parsed.output));
  }
  return loadManifest(input);
}

async function emit(content: string, output: string | undefined, force: boolean): Promise<void> {
  if (output === undefined || output === '-') {
    process.stdout.write(content);
  } else {
    await atomicWrite(output, content, force);
    process.stdout.write(`Wrote ${path.basename(output)}\n`);
  }
}

async function runSnapshot(parsed: ParsedArguments): Promise<number> {
  if (parsed.positionals.length > 1) throw new DirChordError('USAGE', 'snapshot accepts one folder.');
  if (parsed.format !== undefined && parsed.format !== 'json') {
    throw new DirChordError('USAGE', 'snapshot writes a JSON manifest; --format is not needed.');
  }
  const root = parsed.positionals[0] ?? '.';
  const defaultName = `${safeLabel(root)}.dirchord.json`;
  const output = parsed.output ?? defaultName;
  const manifest = await createManifest(root, await optionsForRoot(root, parsed, output));
  await emit(manifestToJson(manifest), output, parsed.force);
  if (output !== '-') {
    process.stdout.write(
      `${manifest.summary.files.toLocaleString()} files, ${manifest.summary.symlinks.toLocaleString()} symlinks\n`,
    );
  }
  return 0;
}

function renderComparison(
  result: ReturnType<typeof compareManifests>,
  format: ReportFormat,
  labels: { left: string; right: string },
  color: boolean,
): string {
  if (format === 'json') return comparisonToJson(result, labels);
  if (format === 'html') return renderComparisonHtml(result, labels);
  return renderComparisonTerminal(result, labels, { color });
}

async function runCompare(parsed: ParsedArguments, verifyMode: boolean): Promise<number> {
  if (parsed.positionals.length !== 2) {
    throw new DirChordError('USAGE', `${verifyMode ? 'verify' : 'compare'} needs exactly two inputs.`);
  }
  const leftInput = parsed.positionals[0] ?? '';
  const rightInput = parsed.positionals[1] ?? '';
  if (verifyMode && !(await isDirectory(leftInput))) {
    throw new DirChordError('USAGE', 'verify expects a folder followed by a manifest.');
  }
  const [left, right] = verifyMode
    ? [await loadManifest(rightInput), await resolveInput(leftInput, parsed)]
    : await Promise.all([resolveInput(leftInput, parsed), resolveInput(rightInput, parsed)]);
  const labels = verifyMode
    ? { left: safeLabel(rightInput), right: safeLabel(leftInput) }
    : { left: safeLabel(leftInput), right: safeLabel(rightInput) };
  const result = compareManifests(left, right);
  const format = parsed.format ?? (parsed.output?.endsWith('.html') === true ? 'html' : 'terminal');
  await emit(renderComparison(result, format, labels, parsed.color && process.stdout.isTTY), parsed.output, parsed.force);
  return result.equal ? 0 : 1;
}

async function runInspect(parsed: ParsedArguments): Promise<number> {
  if (parsed.positionals.length !== 1) throw new DirChordError('USAGE', 'inspect needs one manifest.');
  if (parsed.format === 'html') throw new DirChordError('USAGE', 'inspect supports terminal or JSON output.');
  const input = parsed.positionals[0] ?? '';
  const result = inspectManifest(await loadManifest(input));
  const content = parsed.format === 'json'
    ? `${JSON.stringify({ format: 'dirchord-inspection/v1', ...result }, null, 2)}\n`
    : renderInspectTerminal(result, safeLabel(input), { color: parsed.color && process.stdout.isTTY });
  await emit(content, parsed.output, parsed.force);
  return 0;
}

async function runInit(parsed: ParsedArguments): Promise<number> {
  if (parsed.positionals.length > 1) throw new DirChordError('USAGE', 'init accepts one folder.');
  const root = path.resolve(parsed.positionals[0] ?? '.');
  if (!(await isDirectory(root))) throw new DirChordError('ROOT_NOT_DIRECTORY', 'init target must be a folder.');
  const output = path.join(root, '.dirchord.json');
  const content = `${JSON.stringify({
    ignores: [...DEFAULT_CONFIG.ignores, '*.tmp', '*.log'],
    concurrency: DEFAULT_CONFIG.concurrency,
    maxFiles: DEFAULT_CONFIG.maxFiles,
    maxFileBytes: DEFAULT_CONFIG.maxFileBytes,
    maxTotalBytes: DEFAULT_CONFIG.maxTotalBytes,
  }, null, 2)}\n`;
  await atomicWrite(output, content, parsed.force);
  process.stdout.write('Created .dirchord.json\n');
  return 0;
}

export async function runCli(args: string[]): Promise<number> {
  const parsed = parseArguments(args);
  if (parsed.version) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.help || parsed.command === undefined) {
    process.stdout.write(HELP);
    return 0;
  }

  switch (parsed.command) {
    case 'snapshot': return runSnapshot(parsed);
    case 'compare': return runCompare(parsed, false);
    case 'verify': return runCompare(parsed, true);
    case 'inspect': return runInspect(parsed);
    case 'init': return runInit(parsed);
    default: throw new DirChordError('USAGE', `Unknown command: ${parsed.command}`);
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    const helpful = asHelpfulError(error);
    process.stderr.write(`DirChord error [${helpful.code}]: ${helpful.message}\n`);
    if (helpful.code === 'USAGE') process.stderr.write('Run dirchord --help for usage.\n');
    process.exitCode = 2;
  }
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}
