import type { ComparisonResult, Difference, InspectResult } from './types.js';

interface ReportLabels {
  left: string;
  right: string;
}

interface TerminalOptions {
  color?: boolean;
}

const ANSI = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  green: '\u001B[32m',
  red: '\u001B[31m',
  yellow: '\u001B[33m',
  cyan: '\u001B[36m',
};

function paint(value: string, code: string, enabled: boolean): string {
  return enabled ? `${code}${value}${ANSI.reset}` : value;
}

function safeDisplay(value: string): string {
  return [...value].map((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f)) {
      return `\\u${codePoint.toString(16).padStart(4, '0')}`;
    }
    return character;
  }).join('');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes / 1024;
  let unit = units[0] ?? 'KiB';
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index] ?? unit;
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

function differenceLine(difference: Difference, color: boolean): string {
  switch (difference.kind) {
    case 'added':
      return `${paint('+', ANSI.green, color)} ${safeDisplay(difference.path)}`;
    case 'removed':
      return `${paint('-', ANSI.red, color)} ${safeDisplay(difference.path)}`;
    case 'modified':
      return `${paint('~', ANSI.yellow, color)} ${safeDisplay(difference.path)}`;
    case 'moved':
      return `${paint('>', ANSI.cyan, color)} ${safeDisplay(difference.from)}  ->  ${safeDisplay(difference.to)}`;
  }
}

export function renderComparisonTerminal(
  result: ComparisonResult,
  labels: ReportLabels,
  options: TerminalOptions = {},
): string {
  const color = options.color ?? false;
  const lines = [
    paint('DIRCHORD', ANSI.bold, color),
    `${safeDisplay(labels.left)}  <->  ${safeDisplay(labels.right)}`,
    '',
  ];
  if (result.equal) {
    lines.push(paint('In sync', ANSI.green, color), `${result.summary.unchanged.toLocaleString()} matching entries`);
  } else {
    lines.push(
      paint('Differences found', ANSI.yellow, color),
      [
        `${result.summary.modified} modified`,
        `${result.summary.moved} moved`,
        `${result.summary.added} added`,
        `${result.summary.removed} removed`,
        `${result.summary.unchanged} unchanged`,
      ].join('  |  '),
      '',
      ...result.differences.map((difference) => differenceLine(difference, color)),
    );
  }

  const leftCollisions = result.portability.leftCaseCollisions.length;
  const rightCollisions = result.portability.rightCaseCollisions.length;
  if (leftCollisions + rightCollisions > 0) {
    lines.push(
      '',
      paint('Portability warning', ANSI.yellow, color),
      `${leftCollisions} case-collision group(s) on the left; ${rightCollisions} on the right.`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function renderInspectTerminal(result: InspectResult, label: string, options: TerminalOptions = {}): string {
  const color = options.color ?? false;
  const duplicateBytes = result.duplicateGroups.reduce(
    (total, group) => total + group.size * Math.max(0, group.paths.length - 1),
    0,
  );
  const lines = [
    paint('DIRCHORD MANIFEST', ANSI.bold, color),
    safeDisplay(label),
    '',
    `${result.summary.files.toLocaleString()} files`,
    `${result.summary.symlinks.toLocaleString()} symlinks`,
    `${formatBytes(result.summary.bytes)} total`,
    `${result.duplicateGroups.length.toLocaleString()} duplicate group(s) (${formatBytes(duplicateBytes)} repeated)`,
    `${result.caseCollisions.length.toLocaleString()} case-collision group(s)`,
  ];

  if (result.duplicateGroups.length > 0) {
    lines.push('', paint('Duplicate content', ANSI.cyan, color));
    for (const group of result.duplicateGroups) {
      lines.push(`  ${formatBytes(group.size)} x ${group.paths.length}`);
      for (const itemPath of group.paths) lines.push(`    ${safeDisplay(itemPath)}`);
    }
  }
  if (result.caseCollisions.length > 0) {
    lines.push('', paint('Case collisions', ANSI.yellow, color));
    for (const group of result.caseCollisions) lines.push(`  ${group.paths.map(safeDisplay).join('  |  ')}`);
  }
  return `${lines.join('\n')}\n`;
}

export function comparisonToJson(result: ComparisonResult, labels: ReportLabels): string {
  return `${JSON.stringify({ format: 'dirchord-comparison/v1', labels, ...result }, null, 2)}\n`;
}

function escapeHtml(value: string): string {
  return safeDisplay(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function differenceHtml(difference: Difference): string {
  if (difference.kind === 'moved') {
    return `<li class="moved"><span class="mark">MOVED</span><code>${escapeHtml(difference.from)}</code><span aria-hidden="true">→</span><code>${escapeHtml(difference.to)}</code></li>`;
  }
  return `<li class="${difference.kind}"><span class="mark">${difference.kind.toUpperCase()}</span><code>${escapeHtml(difference.path)}</code></li>`;
}

export function renderComparisonHtml(result: ComparisonResult, labels: ReportLabels): string {
  const title = result.equal ? 'Folders are in sync' : 'Folder differences';
  const differences = result.differences.length === 0
    ? '<p class="empty">No content differences found.</p>'
    : `<ul class="differences">${result.differences.map(differenceHtml).join('')}</ul>`;
  const collisionCount =
    result.portability.leftCaseCollisions.length + result.portability.rightCaseCollisions.length;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${escapeHtml(title)} | DirChord</title>
  <style>
    :root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e8edf6;background:#0a0d14;line-height:1.5;--panel:#121824;--line:#273249;--muted:#9aa8bd;--mint:#64e6b4;--amber:#ffcf70;--red:#ff7c86;--blue:#7dc8ff}*{box-sizing:border-box}body{margin:0;padding:clamp(1rem,4vw,4rem)}main{max-width:70rem;margin:auto}.eyebrow{font-weight:800;letter-spacing:.14em;color:var(--mint)}h1{font-size:clamp(2rem,6vw,4.6rem);line-height:1.02;margin:.45rem 0 1rem}.pair{color:var(--muted);overflow-wrap:anywhere}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr));gap:.75rem;margin:2rem 0}.card,.panel{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:1rem}.value{font-size:1.8rem;font-weight:800;display:block}.label{color:var(--muted)}.status{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:.35rem .7rem;color:${result.equal ? 'var(--mint)' : 'var(--amber)'}}h2{margin-top:0}.differences{list-style:none;padding:0;margin:0;display:grid;gap:.55rem}.differences li{display:flex;align-items:center;gap:.7rem;padding:.8rem;border-radius:.7rem;background:#0d121c;overflow-wrap:anywhere}.mark{font-size:.72rem;font-weight:800;min-width:5.3rem}.added .mark{color:var(--mint)}.removed .mark{color:var(--red)}.modified .mark,.moved .mark{color:var(--amber)}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.note{color:var(--muted);margin-top:1rem}.empty{color:var(--mint)}footer{margin-top:1.5rem;color:var(--muted);font-size:.9rem}@media (prefers-color-scheme:light){:root{color:#182132;background:#f4f7fb;--panel:#fff;--line:#d8e0eb;--muted:#5d6b7e;--mint:#087b58;--amber:#8a5700;--red:#b42331;--blue:#075f9c}.differences li{background:#f7f9fc}}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">DIRCHORD</div>
  <h1>${escapeHtml(title)}</h1>
  <p class="pair">${escapeHtml(labels.left)} <span aria-hidden="true">↔</span> ${escapeHtml(labels.right)}</p>
  <span class="status">${result.equal ? 'IN SYNC' : 'REVIEW NEEDED'}</span>
  <section class="summary" aria-label="Comparison summary">
    <div class="card"><span class="value">${result.summary.modified}</span><span class="label">Modified</span></div>
    <div class="card"><span class="value">${result.summary.moved}</span><span class="label">Moved</span></div>
    <div class="card"><span class="value">${result.summary.added}</span><span class="label">Added</span></div>
    <div class="card"><span class="value">${result.summary.removed}</span><span class="label">Removed</span></div>
    <div class="card"><span class="value">${result.summary.unchanged}</span><span class="label">Unchanged</span></div>
  </section>
  <section class="panel">
    <h2>Content differences</h2>
    ${differences}
    ${collisionCount > 0 ? `<p class="note">Portability warning: ${collisionCount} case-collision group(s) may behave differently across filesystems.</p>` : ''}
  </section>
  <footer>Generated locally by DirChord. File contents are never embedded in this report.</footer>
</main>
</body>
</html>
`;
}
