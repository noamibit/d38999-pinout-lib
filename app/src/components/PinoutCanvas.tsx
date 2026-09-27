import { useEffect, useRef } from 'react';
import { clampRect, meetScale, mirrorRect, type Rect } from '../lib/geometry';

interface Props {
  svgUrl: string;
  /** Identifies the arrangement; changing it triggers a full fit reset. */
  itemKey: string;
  mirrored: boolean;
  /** Bump to force a fit/reset. */
  resetSignal: number;
}

const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_PX = 30;
const TAP_MOVE_PX = 10;

function prepareSvg(text: string): { markup: string; fit: Rect } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  let fit: Rect;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const [x, y, w, h] = vb.trim().split(/\s+/).map(Number);
    fit = { x, y, w, h };
  } else {
    const w = parseFloat(svg.getAttribute('width') || '100') || 100;
    const h = parseFloat(svg.getAttribute('height') || '100') || 100;
    fit = { x: 0, y: 0, w, h };
  }
  // Force the SVG to size to its container; viewBox alone drives zoom.
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `${fit.x} ${fit.y} ${fit.w} ${fit.h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  const markup = new XMLSerializer().serializeToString(svg);
  return { markup, fit };
}

export default function PinoutCanvas({ svgUrl, itemKey, mirrored, resetSignal }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgElRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<Rect | null>(null);
  const fitRef = useRef<Rect | null>(null);
  const prevKeyRef = useRef<string | null>(null);
  const prevMirroredRef = useRef<boolean>(false);
  const resetSignalRef = useRef(resetSignal);

  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const tapStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  function applyRect(rect: Rect) {
    viewRef.current = rect;
    svgElRef.current?.setAttribute('viewBox', `${rect.x} ${rect.y} ${rect.w} ${rect.h}`);
  }

  function screenToSvg(clientX: number, clientY: number): { x: number; y: number } | null {
    const container = containerRef.current;
    const view = viewRef.current;
    if (!container || !view) return null;
    const box = container.getBoundingClientRect();
    const scale = meetScale(view, box.width, box.height);
    const renderedW = view.w * scale;
    const renderedH = view.h * scale;
    const offsetX = (box.width - renderedW) / 2;
    const offsetY = (box.height - renderedH) / 2;
    return {
      x: view.x + (clientX - box.left - offsetX) / scale,
      y: view.y + (clientY - box.top - offsetY) / scale,
    };
  }

  function zoomAt(pt: { x: number; y: number }, factor: number) {
    const view = viewRef.current;
    const fit = fitRef.current;
    if (!view || !fit) return;
    const newW = view.w / factor;
    const scale = Math.min(fit.w, Math.max(fit.w / 40, newW)) / view.w;
    const rect: Rect = {
      x: pt.x - (pt.x - view.x) * scale,
      y: pt.y - (pt.y - view.y) * scale,
      w: view.w * scale,
      h: view.h * scale,
    };
    applyRect(clampRect(rect, fit));
  }

  function panBy(dxSvg: number, dySvg: number) {
    const view = viewRef.current;
    const fit = fitRef.current;
    if (!view || !fit) return;
    applyRect(clampRect({ x: view.x + dxSvg, y: view.y + dySvg, w: view.w, h: view.h }, fit));
  }

  // Load / swap the SVG source: full reset on a new arrangement, mirrored
  // view-rect preservation when only the mirror flag flipped.
  useEffect(() => {
    let cancelled = false;
    fetch(svgUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load SVG: ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const { markup, fit } = prepareSvg(text);
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = markup;
        svgElRef.current = container.querySelector('svg');

        const isNewArrangement = prevKeyRef.current !== itemKey;
        const isMirrorToggle = !isNewArrangement && prevMirroredRef.current !== mirrored;

        let newView: Rect;
        if (isMirrorToggle && viewRef.current && fitRef.current) {
          newView = mirrorRect(viewRef.current, fitRef.current);
        } else {
          newView = { ...fit };
        }

        fitRef.current = fit;
        applyRect(clampRect(newView, fit));
        prevKeyRef.current = itemKey;
        prevMirroredRef.current = mirrored;
      })
      .catch((err) => {
        if (!cancelled) console.error(err);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgUrl]);

  // Fit/Reset button.
  useEffect(() => {
    if (resetSignalRef.current === resetSignal) return;
    resetSignalRef.current = resetSignal;
    if (fitRef.current) applyRect({ ...fitRef.current });
  }, [resetSignal]);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 1) {
      tapStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    } else if (pointersRef.current.size === 2) {
      tapStartRef.current = null;
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      pinchRef.current = { dist };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointersRef.current.has(e.pointerId)) return;
    const prev = pointersRef.current.get(e.pointerId)!;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 1) {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      const view = viewRef.current;
      const container = containerRef.current;
      if (!view || !container) return;
      const box = container.getBoundingClientRect();
      const scale = meetScale(view, box.width, box.height);
      panBy(-dx / scale, -dy / scale);
      if (tapStartRef.current) {
        const moved = Math.hypot(e.clientX - tapStartRef.current.x, e.clientY - tapStartRef.current.y);
        if (moved > TAP_MOVE_PX) tapStartRef.current = null;
      }
    } else if (pointersRef.current.size === 2 && pinchRef.current) {
      const pts = [...pointersRef.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const factor = dist / (pinchRef.current.dist || dist);
      const svgPt = screenToSvg(mid.x, mid.y);
      if (svgPt && Number.isFinite(factor) && factor > 0) {
        zoomAt(svgPt, factor);
      }
      pinchRef.current = { dist };
    }
  }

  function endPointer(e: React.PointerEvent) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (tapStartRef.current) {
      const elapsed = Date.now() - tapStartRef.current.time;
      const moved = Math.hypot(e.clientX - tapStartRef.current.x, e.clientY - tapStartRef.current.y);
      if (elapsed < DOUBLE_TAP_MS && moved < TAP_MOVE_PX) {
        const last = lastTapRef.current;
        const now = Date.now();
        if (
          last &&
          now - last.time < DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - last.x, e.clientY - last.y) < DOUBLE_TAP_PX
        ) {
          const svgPt = screenToSvg(e.clientX, e.clientY);
          if (svgPt) zoomAt(svgPt, 2);
          lastTapRef.current = null;
        } else {
          lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }
      }
      tapStartRef.current = null;
    }

    // Resume single-finger pan from the remaining pointer without a jump.
    if (pointersRef.current.size === 1) {
      const [id, pos] = [...pointersRef.current.entries()][0];
      pointersRef.current.set(id, pos);
    }
  }

  // React attaches onWheel as a passive listener, so preventDefault() there
  // throws in some browsers; register natively as non-passive instead.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const svgPt = screenToSvg(e.clientX, e.clientY);
      if (!svgPt) return;
      const factor = Math.pow(1.0015, -e.deltaY);
      zoomAt(svgPt, factor);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="pinout-canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    />
  );
}
