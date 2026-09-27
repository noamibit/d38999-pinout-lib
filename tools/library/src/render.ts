import type { Anchor, Arrangement, Shape, TextPlacement } from './types.ts';

export interface RenderOptions {
  mirror?: boolean;
}

const FONT = 'Arial, Helvetica, sans-serif';

export function fmt(n: number): string {
  const v = Math.round(n * 1000) / 1000;
  return Object.is(v, -0) ? '0' : String(v);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function strokeWidth(a: Arrangement): number {
  return Math.max(1, Math.min(a.canvas.width, a.canvas.height) / 400);
}

function shapeSvg(s: Shape, sw: number): string {
  const w = fmt(s.width ?? sw);
  switch (s.type) {
    case 'line':
      return `<line x1="${fmt(s.x1)}" y1="${fmt(s.y1)}" x2="${fmt(s.x2)}" y2="${fmt(s.y2)}" stroke-width="${w}"/>`;
    case 'circle':
      return `<circle cx="${fmt(s.cx)}" cy="${fmt(s.cy)}" r="${fmt(s.r)}" stroke-width="${w}"${s.fill ? ' fill="#000"' : ''}/>`;
    case 'path':
      return `<path d="${esc(s.d)}" stroke-width="${w}"${s.fill ? ' fill="#000"' : ''}/>`;
  }
}

const SWAP: Record<Anchor, Anchor> = { start: 'end', middle: 'middle', end: 'start' };

function textSvg(content: string, t: Required<TextPlacement>, width: number, mirror: boolean, cls: string): string {
  const x = mirror ? width - t.x : t.x;
  const anchor = mirror ? SWAP[t.anchor] : t.anchor;
  const rotate = mirror ? -t.rotate : t.rotate;
  const rot = rotate ? ` transform="rotate(${fmt(rotate)} ${fmt(x)} ${fmt(t.y)})"` : '';
  return `<text class="${cls}" x="${fmt(x)}" y="${fmt(t.y)}" font-size="${fmt(t.size)}" text-anchor="${anchor}"${rot}>${esc(content)}</text>`;
}

/** Default label placement when the source position is unknown: centered above the contact. */
export function labelPlacement(c: Arrangement['contacts'][number]): Required<TextPlacement> {
  const size = c.text?.size ?? Math.max(c.r * 1.2, 6);
  return {
    x: c.text?.x ?? c.cx,
    y: c.text?.y ?? c.cy - c.r - size * 0.6,
    size,
    anchor: c.text?.anchor ?? 'middle',
    rotate: c.text?.rotate ?? 0,
  };
}

export function renderSvg(a: Arrangement, opts: RenderOptions = {}): string {
  const mirror = opts.mirror ?? false;
  const { width, height } = a.canvas;
  const sw = strokeWidth(a);
  const out: string[] = [];

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}" data-id="${esc(a.id)}" data-mirrored="${mirror}">`,
  );
  out.push(`<rect width="${fmt(width)}" height="${fmt(height)}" fill="#fff"/>`);

  const geomTransform = mirror ? ` transform="matrix(-1 0 0 1 ${fmt(width)} 0)"` : '';
  out.push(`<g class="geometry" fill="none" stroke="#000" stroke-width="${fmt(sw)}"${geomTransform}>`);
  if (a.insert) {
    out.push(`<circle class="insert" cx="${fmt(a.insert.cx)}" cy="${fmt(a.insert.cy)}" r="${fmt(a.insert.r)}"/>`);
  }
  for (const s of a.shapes ?? []) out.push(shapeSvg(s, sw));
  for (const c of a.contacts) {
    const fill = c.style === 'filled' ? ' fill="#000"' : '';
    out.push(`<circle class="contact" data-label="${esc(c.label)}" cx="${fmt(c.cx)}" cy="${fmt(c.cy)}" r="${fmt(c.r)}"${fill}/>`);
  }
  out.push('</g>');

  out.push(`<g class="text" fill="#000" font-family="${FONT}" dominant-baseline="central">`);
  for (const c of a.contacts) out.push(textSvg(c.label, labelPlacement(c), width, mirror, 'label'));
  for (const n of a.annotations ?? []) {
    const t = { x: n.x, y: n.y, size: n.size ?? 12, anchor: n.anchor ?? 'middle', rotate: n.rotate ?? 0 };
    out.push(textSvg(n.text, t, width, mirror, 'annotation'));
  }
  out.push('</g>');
  out.push('</svg>');
  return out.join('\n') + '\n';
}
