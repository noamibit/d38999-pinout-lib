import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildIndex, buildLibrary, compareItems } from '../src/library.ts';
import { renderSvg } from '../src/render.ts';
import type { Arrangement } from '../src/types.ts';
import { validateArrangement } from '../src/validate.ts';

function base(): Arrangement {
  return {
    schemaVersion: 1,
    id: 'H35', family: 'D38999', prefix: 'H', number: '35',
    canvas: { width: 100, height: 80 },
    insert: { cx: 50, cy: 40, r: 38 },
    contacts: [
      { label: 'A', cx: 30, cy: 40, r: 5, text: { x: 36, y: 30, size: 6, anchor: 'start', rotate: 15 } },
      { label: 'a', cx: 70, cy: 40, r: 5 },
    ],
    shapes: [{ type: 'line', x1: 10, y1: 10, x2: 20, y2: 10 }],
    annotations: [{ text: 'KEY', x: 10, y: 5, anchor: 'start' }],
    status: 'approved',
    revision: 1,
  };
}

const errs = (a: unknown, production = true) => validateArrangement(a, { production }).errors;

test('renderer is deterministic', () => {
  assert.equal(renderSvg(base()), renderSvg(structuredClone(base())));
});

test('renderer escapes labels', () => {
  const a = base();
  a.contacts[0].label = 'A<&>';
  const svg = renderSvg(a);
  assert.match(svg, /A&lt;&amp;&gt;/);
  assert.doesNotMatch(svg, /A<&>/);
});

test('mirror flips geometry group but not text glyphs', () => {
  const svg = renderSvg(base(), { mirror: true });
  assert.match(svg, /<g class="geometry"[^>]*transform="matrix\(-1 0 0 1 100 0\)"/);
  // label A: x 36 → 64, anchor start → end, rotate 15 → -15
  assert.match(svg, /<text class="label" x="64" y="30" font-size="6" text-anchor="end" transform="rotate\(-15 64 30\)">A<\/text>/);
  // annotation moves but keeps readable glyphs (no scale transform on text)
  assert.match(svg, /<text class="annotation" x="90" y="5" font-size="12" text-anchor="end">KEY<\/text>/);
  assert.doesNotMatch(svg.split('<g class="text"')[1], /scale|matrix/);
  assert.match(svg, /data-mirrored="true"/);
});

test('non-mirrored render keeps source positions', () => {
  const plain = renderSvg(base());
  assert.match(plain, /<text class="label" x="36" y="30" font-size="6" text-anchor="start" transform="rotate\(15 36 30\)">A<\/text>/);
  assert.doesNotMatch(plain, /matrix/);
});

test('valid arrangement passes', () => {
  assert.deepEqual(errs(base()), []);
});

test('schema errors are reported', () => {
  const a: any = base();
  a.contacts[0].r = -1;
  a.extra = 1;
  const e = errs(a);
  assert.ok(e.some((m) => m.startsWith('schema:')));
});

test('labels are case-sensitive and must be unique', () => {
  assert.deepEqual(errs(base()), []); // "A" and "a" are distinct
  const a = base();
  a.contacts[1].label = 'A';
  assert.ok(errs(a).some((m) => m.includes('duplicate label')));
});

test('id must equal prefix+number and match file name', () => {
  const a = base();
  a.number = '36';
  assert.ok(errs(a).some((m) => m.includes('prefix+number')));
  const r = validateArrangement(base(), { production: true, fileId: 'H36', familyDir: 'd38999' });
  assert.ok(r.errors.some((m) => m.includes('file name')));
});

test('expectedContacts mismatch is an error', () => {
  const a = base();
  a.expectedContacts = 3;
  assert.ok(errs(a).some((m) => m.includes('expected 3')));
});

test('contacts outside canvas are errors', () => {
  const a = base();
  a.contacts[0].cx = 98;
  assert.ok(errs(a).some((m) => m.includes('outside canvas')));
});

test('production forbids draft and synthetic, dev allows them', () => {
  const a = base();
  a.status = 'draft';
  a.tags = ['synthetic'];
  const e = errs(a, true);
  assert.ok(e.some((m) => m.includes('status')));
  assert.ok(e.some((m) => m.includes('synthetic')));
  assert.deepEqual(errs(a, false), []);
});

test('overlap produces a warning', () => {
  const a = base();
  a.contacts[1].cx = 33;
  const r = validateArrangement(a, { production: true });
  assert.ok(r.warnings.some((m) => m.includes('overlap')));
});

test('stale or missing svg is an error', () => {
  const a = base();
  assert.ok(validateArrangement(a, { production: true, svg: null }).errors.some((m) => m.includes('missing')));
  assert.ok(validateArrangement(a, { production: true, svg: '<svg/>' }).errors.some((m) => m.includes('stale')));
  assert.deepEqual(validateArrangement(a, { production: true, svg: renderSvg(a).replace(/\n/g, '\r\n') }).errors, []);
});

test('index sorts numbers numerically', () => {
  const mk = (prefix: string, number: string) => ({ ...base(), id: prefix + number, prefix, number });
  const idx = buildIndex([mk('H', '35'), mk('B', '8'), mk('H', '8'), mk('H', '101')], 't', 'v');
  assert.deepEqual(idx.families[0].items.map((i) => i.id), ['B8', 'H8', 'H35', 'H101']);
  assert.equal(compareItems({ prefix: 'A', number: '9' }, { prefix: 'A', number: '10' }) < 0, true);
});

test('build writes svg, mirror svg and index; writes nothing on error', () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'lib-'));
  try {
    const lib = path.join(tmp, 'library', 'd38999');
    mkdirSync(lib, { recursive: true });
    const a = base();
    writeFileSync(path.join(lib, 'H35.json'), JSON.stringify(a));
    writeFileSync(path.join(lib, 'H35.svg'), renderSvg(a));
    const out = path.join(tmp, 'out');

    const ok = buildLibrary(path.join(tmp, 'library'), out, true);
    assert.ok(ok.index);
    assert.equal(ok.index.libraryVersion.length, 8);
    assert.ok(existsSync(path.join(out, 'd38999/H35.mirror.svg')));
    const index = JSON.parse(readFileSync(path.join(out, 'index.json'), 'utf8'));
    assert.equal(index.families[0].items[0].svgMirror, 'd38999/H35.mirror.svg');

    rmSync(out, { recursive: true });
    writeFileSync(path.join(lib, 'H35.svg'), '<svg/>');
    const bad = buildLibrary(path.join(tmp, 'library'), out, true);
    assert.equal(bad.index, undefined);
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
