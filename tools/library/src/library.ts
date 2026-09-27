import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderSvg } from './render.ts';
import type { Arrangement, IndexItem, LibraryIndex } from './types.ts';
import { validateFile, type FileReport } from './validate.ts';

/** All `<family>/<ID>.json` files in a library dir, sorted. */
export function listArrangementFiles(libraryDir: string): string[] {
  if (!existsSync(libraryDir)) return [];
  const files: string[] = [];
  for (const fam of readdirSync(libraryDir).sort()) {
    const famDir = path.join(libraryDir, fam);
    if (!statSync(famDir).isDirectory()) continue;
    for (const f of readdirSync(famDir).sort()) {
      if (f.endsWith('.json')) files.push(path.join(famDir, f));
    }
  }
  return files;
}

export function validateLibrary(libraryDir: string, production: boolean, checkSvg = true): FileReport[] {
  const reports = listArrangementFiles(libraryDir).map((f) => validateFile(f, production, checkSvg));
  const ids = new Map<string, string>();
  for (const r of reports) {
    if (!r.arrangement) continue;
    const key = `${r.arrangement.family}/${r.arrangement.id}`;
    const prev = ids.get(key);
    if (prev) r.errors.push(`duplicate id ${key} (also in ${prev})`);
    ids.set(key, r.file);
  }
  return reports;
}

export function renderLibrary(libraryDir: string): string[] {
  const written: string[] = [];
  for (const f of listArrangementFiles(libraryDir)) {
    const r = validateFile(f, false, false);
    if (!r.arrangement) continue;
    const svgPath = f.replace(/\.json$/, '.svg');
    writeFileSync(svgPath, renderSvg(r.arrangement));
    written.push(svgPath);
  }
  return written;
}

export function compareItems(a: { prefix: string; number: string }, b: { prefix: string; number: string }): number {
  return a.prefix.localeCompare(b.prefix, 'en') || Number(a.number) - Number(b.number);
}

export function buildIndex(arrangements: Arrangement[], builtAt: string, libraryVersion: string): LibraryIndex {
  const byFamily = new Map<string, Arrangement[]>();
  for (const a of arrangements) {
    const list = byFamily.get(a.family) ?? [];
    list.push(a);
    byFamily.set(a.family, list);
  }
  const families = [...byFamily.keys()].sort().map((fam) => {
    const dir = fam.toLowerCase();
    const items: IndexItem[] = byFamily
      .get(fam)!
      .slice()
      .sort(compareItems)
      .map((a) => ({
        id: a.id,
        prefix: a.prefix,
        number: a.number,
        title: a.title ?? a.id,
        svg: `${dir}/${a.id}.svg`,
        svgMirror: `${dir}/${a.id}.mirror.svg`,
        viewCaption: a.viewCaption ?? null,
        contacts: a.contacts.length,
      }));
    return { id: fam, title: fam, items };
  });
  return { schemaVersion: 1, libraryVersion, builtAt, families };
}

export interface BuildResult {
  reports: FileReport[];
  index?: LibraryIndex;
}

/** Validates, renders SVG + mirror SVG and writes index.json into outDir. Nothing is written on errors. */
export function buildLibrary(libraryDir: string, outDir: string, production: boolean): BuildResult {
  const reports = validateLibrary(libraryDir, production);
  if (reports.some((r) => r.errors.length)) return { reports };

  const arrangements = reports.map((r) => r.arrangement!);
  const files = new Map<string, string>();
  for (const a of arrangements) {
    const dir = a.family.toLowerCase();
    files.set(`${dir}/${a.id}.svg`, renderSvg(a));
    files.set(`${dir}/${a.id}.mirror.svg`, renderSvg(a, { mirror: true }));
  }

  const hash = createHash('sha256');
  for (const key of [...files.keys()].sort()) hash.update(key).update('\0').update(files.get(key)!).update('\0');
  const index = buildIndex(arrangements, new Date().toISOString(), hash.digest('hex').slice(0, 8));

  rmSync(outDir, { recursive: true, force: true });
  for (const [rel, content] of files) {
    const p = path.join(outDir, rel);
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
  return { reports, index };
}
