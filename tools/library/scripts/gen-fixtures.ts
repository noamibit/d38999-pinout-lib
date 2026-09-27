// Generates SYNTHETIC arrangements for development and tests. Not real D38999 layouts.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderSvg } from '../src/render.ts';
import type { Arrangement, Contact } from '../src/types.ts';
import { REPO_ROOT } from '../src/validate.ts';

const LABELS = [
  ...'ABCDEFGHJKLMNPRSTUVWXYZ',
  ...'abcdefghjkmnprstuvwxyz',
  ...['AA', 'BB', 'CC', 'DD', 'EE', 'FF', 'GG', 'HH', 'JJ', 'KK'],
];

const W = 800, H = 800, CX = 400, CY = 400, R = 360;

interface Ring { count: number; radius: number; r: number; phase?: number }

function contacts(rings: Ring[]): Contact[] {
  const out: Contact[] = [];
  let i = 0;
  for (const ring of rings) {
    for (let k = 0; k < ring.count; k++) {
      const ang = -Math.PI / 2 + (ring.phase ?? 0) + (2 * Math.PI * k) / ring.count;
      const cx = ring.radius === 0 ? CX : CX + ring.radius * Math.cos(ang);
      const cy = ring.radius === 0 ? CY : CY + ring.radius * Math.sin(ang);
      const size = Math.max(14, ring.r * 0.9);
      // Labels to the upper right with anchor=start, so mirroring visibly swaps anchors.
      out.push({
        label: LABELS[i++],
        cx: round(cx), cy: round(cy), r: ring.r,
        style: 'hollow',
        text: { x: round(cx + ring.r * 0.9), y: round(cy - ring.r - size * 0.4), size: round(size), anchor: 'start', rotate: 0 },
      });
    }
  }
  return out;
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function arrangement(prefix: string, number: string, rings: Ring[]): Arrangement {
  const id = prefix + number;
  const c = contacts(rings);
  return {
    schemaVersion: 1,
    id, family: 'D38999', prefix, number, title: id,
    viewCaption: 'SYNTHETIC TEST DATA — not a real arrangement',
    expectedContacts: c.length,
    canvas: { width: W, height: H },
    insert: { cx: CX, cy: CY, r: R },
    contacts: c,
    shapes: [
      { type: 'path', d: `M ${CX - 22} ${CY - R + 4} L ${CX + 22} ${CY - R + 4} L ${CX} ${CY - R + 40} Z`, fill: true },
      { type: 'circle', cx: CX + R - 30, cy: CY + 60, r: 8, fill: true },
    ],
    annotations: [{ text: 'SYNTHETIC', x: 20, y: 30, size: 22, anchor: 'start', rotate: 0 }],
    source: { file: null, sha256: null, ref: 'synthetic' },
    qa: { confidence: null, warnings: [] },
    status: 'approved',
    revision: 1,
    series: null, manufacturer: null, partNumbers: [], shell: null, notes: null,
    tags: ['synthetic'],
    createdAt: '2026-09-27', updatedAt: '2026-09-27',
  };
}

const fixtures = [
  arrangement('A', '98', [{ count: 1, radius: 0, r: 26 }, { count: 6, radius: 170, r: 26 }]),
  arrangement('A', '99', [{ count: 1, radius: 0, r: 20 }, { count: 6, radius: 120, r: 20 }, { count: 6, radius: 240, r: 20, phase: Math.PI / 6 }]),
  arrangement('B', '97', [{ count: 1, radius: 0, r: 16 }, { count: 6, radius: 90, r: 16 }, { count: 12, radius: 190, r: 16 }]),
  arrangement('B', '99', [{ count: 1, radius: 0, r: 12 }, { count: 8, radius: 80, r: 12 }, { count: 14, radius: 165, r: 12 }, { count: 20, radius: 260, r: 12 }]),
  arrangement('C', '98', [{ count: 4, radius: 110, r: 34, phase: Math.PI / 4 }, { count: 24, radius: 260, r: 12 }]),
];

const dir = path.join(REPO_ROOT, 'fixtures/library/d38999');
mkdirSync(dir, { recursive: true });
for (const a of fixtures) {
  writeFileSync(path.join(dir, `${a.id}.json`), JSON.stringify(a, null, 2) + '\n');
  writeFileSync(path.join(dir, `${a.id}.svg`), renderSvg(a));
}
console.log(`wrote ${fixtures.length} synthetic fixtures to ${path.relative(REPO_ROOT, dir)}`);
