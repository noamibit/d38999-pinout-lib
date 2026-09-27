// Thin wrapper so `npm run convert` works cross-platform without hardcoding the venv
// python path at the call site. See README.md for manual venv setup.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const venvPython = path.join(here, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

if (!existsSync(venvPython)) {
  console.error(`No venv found at ${venvPython}. Set it up first — see tools/converter/README.md.`);
  process.exit(1);
}

// `python -m d38999conv` must run with cwd=tools/converter (it's a plain source dir,
// not pip-installed). Paths on the command line, though, are relative to wherever
// this script was invoked from (repo root, via `npm run convert`) -- resolve them to
// absolute paths first so the cwd switch doesn't break them.
const invokedFrom = process.cwd();
const args = process.argv.slice(2).map((arg, i, all) => {
  const isPathArg = i === 1 || all[i - 1] === '--out';
  return isPathArg && !arg.startsWith('-') ? path.resolve(invokedFrom, arg) : arg;
});

const result = spawnSync(venvPython, ['-m', 'd38999conv', ...args], { cwd: here, stdio: 'inherit' });
process.exit(result.status ?? 1);
