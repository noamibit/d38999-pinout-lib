import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { renderSvg } from './render.ts';
import type { Arrangement } from './types.ts';

const require = createRequire(import.meta.url);
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats').default;

export const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const schema = JSON.parse(readFileSync(path.join(REPO_ROOT, 'schema/arrangement.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

export interface ValidateOptions {
  /** Production library: only approved, no synthetic data. */
  production: boolean;
  /** Expected file name (without extension); checked against id. */
  fileId?: string;
  /** Family folder name; checked against family. */
  familyDir?: string;
  /** Committed SVG content, if any; must equal render(json). */
  svg?: string | null;
}

export interface Report {
  errors: string[];
  warnings: string[];
}

const LABEL_OK = /^[A-Za-z0-9*+\-]+$/;

export function validateArrangement(data: unknown, opts: ValidateOptions): Report {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!validateSchema(data)) {
    for (const e of validateSchema.errors ?? []) errors.push(`schema: ${e.instancePath || '/'} ${e.message}`);
    return { errors, warnings };
  }
  const a = data as Arrangement;

  if (a.id !== a.prefix + a.number) errors.push(`id "${a.id}" != prefix+number "${a.prefix}${a.number}"`);
  if (opts.fileId !== undefined && opts.fileId !== a.id) errors.push(`file name "${opts.fileId}" != id "${a.id}"`);
  if (opts.familyDir !== undefined && opts.familyDir !== a.family.toLowerCase()) {
    errors.push(`folder "${opts.familyDir}" != family "${a.family}" (expected lowercase folder name)`);
  }

  if (opts.production) {
    if (a.status !== 'approved') errors.push(`status "${a.status}" not allowed in production library`);
    if (a.tags?.includes('synthetic')) errors.push('synthetic data not allowed in production library');
  }

  const seen = new Set<string>();
  for (const c of a.contacts) {
    if (seen.has(c.label)) errors.push(`duplicate label "${c.label}"`);
    seen.add(c.label);
    if (!LABEL_OK.test(c.label)) warnings.push(`unusual characters in label "${c.label}"`);
  }

  if (a.expectedContacts != null && a.expectedContacts !== a.contacts.length) {
    errors.push(`contacts: found ${a.contacts.length}, expected ${a.expectedContacts}`);
  }

  const { width: W, height: H } = a.canvas;
  const outside = (x: number, y: number, r = 0) => x - r < 0 || y - r < 0 || x + r > W || y + r > H;
  for (const c of a.contacts) {
    if (outside(c.cx, c.cy, c.r)) errors.push(`contact "${c.label}" outside canvas`);
    if (c.text && outside(c.text.x, c.text.y)) errors.push(`label "${c.label}" outside canvas`);
  }
  if (a.insert && outside(a.insert.cx, a.insert.cy, a.insert.r)) warnings.push('insert circle exceeds canvas (crop?)');

  for (let i = 0; i < a.contacts.length; i++) {
    for (let j = i + 1; j < a.contacts.length; j++) {
      const p = a.contacts[i], q = a.contacts[j];
      if (Math.hypot(p.cx - q.cx, p.cy - q.cy) < p.r + q.r) warnings.push(`contacts "${p.label}" and "${q.label}" overlap`);
    }
  }

  if (a.insert) {
    for (const c of a.contacts) {
      if (Math.hypot(c.cx - a.insert.cx, c.cy - a.insert.cy) + c.r > a.insert.r) {
        warnings.push(`contact "${c.label}" outside insert circle`);
      }
    }
  }

  if (opts.svg !== undefined) {
    if (opts.svg === null) errors.push('svg missing — run `npm run render`');
    else if (normalizeEol(opts.svg) !== renderSvg(a)) errors.push('svg is stale (differs from render(json)) — run `npm run render`');
  }

  return { errors, warnings };
}

function normalizeEol(s: string): string {
  return s.replace(/\r\n/g, '\n');
}

export interface FileReport extends Report {
  file: string;
  arrangement?: Arrangement;
}

export function validateFile(jsonPath: string, production: boolean, checkSvg = true): FileReport {
  const file = path.relative(REPO_ROOT, jsonPath).replaceAll('\\', '/');
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    return { file, errors: [`invalid JSON: ${(e as Error).message}`], warnings: [] };
  }
  const svgPath = jsonPath.replace(/\.json$/, '.svg');
  const report = validateArrangement(data, {
    production,
    fileId: path.basename(jsonPath, '.json'),
    familyDir: path.basename(path.dirname(jsonPath)),
    svg: checkSvg ? (existsSync(svgPath) ? readFileSync(svgPath, 'utf8') : null) : undefined,
  });
  return { file, ...report, arrangement: report.errors.length ? undefined : (data as Arrangement) };
}
