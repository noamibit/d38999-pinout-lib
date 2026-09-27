import path from 'node:path';
import { parseArgs } from 'node:util';
import { buildLibrary, renderLibrary, validateLibrary } from './library.ts';
import type { FileReport } from './validate.ts';
import { REPO_ROOT } from './validate.ts';

const USAGE = `usage: cli.ts <validate|render|build> --library <dir> [--out <dir>] [--dev]
  --dev   non-production rules: allows draft/rejected status and synthetic data`;

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    library: { type: 'string', default: 'library' },
    out: { type: 'string', default: 'app/public/library' },
    dev: { type: 'boolean', default: false },
  },
});

const cmd = positionals[0];
const libraryDir = path.resolve(REPO_ROOT, values.library!);
const production = !values.dev;

function print(reports: FileReport[]): boolean {
  let errors = 0;
  let warnings = 0;
  for (const r of reports) {
    if (!r.errors.length && !r.warnings.length) continue;
    console.log(r.file);
    for (const e of r.errors) console.log(`  ERROR   ${e}`);
    for (const w of r.warnings) console.log(`  warning ${w}`);
    errors += r.errors.length;
    warnings += r.warnings.length;
  }
  console.log(`${reports.length} arrangement(s), ${errors} error(s), ${warnings} warning(s)`);
  if (!reports.length) console.log(`note: no arrangements in ${path.relative(REPO_ROOT, libraryDir) || '.'}`);
  return errors === 0;
}

switch (cmd) {
  case 'validate': {
    process.exitCode = print(validateLibrary(libraryDir, production)) ? 0 : 1;
    break;
  }
  case 'render': {
    const written = renderLibrary(libraryDir);
    console.log(`rendered ${written.length} svg(s)`);
    process.exitCode = print(validateLibrary(libraryDir, production)) ? 0 : 1;
    break;
  }
  case 'build': {
    const outDir = path.resolve(REPO_ROOT, values.out!);
    const { reports, index } = buildLibrary(libraryDir, outDir, production);
    const ok = print(reports);
    if (ok && index) {
      const n = index.families.reduce((s, f) => s + f.items.length, 0);
      console.log(`built ${n} item(s), libraryVersion ${index.libraryVersion} → ${path.relative(REPO_ROOT, outDir)}`);
    }
    process.exitCode = ok ? 0 : 1;
    break;
  }
  default:
    console.error(USAGE);
    process.exitCode = 2;
}
