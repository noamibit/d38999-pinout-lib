import { useEffect, useMemo, useState } from 'react';
import { fetchLibraryIndex, findItem, libraryUrl, type LibraryIndex } from '../lib/library';
import { useWakeLock } from '../hooks/useWakeLock';
import PinoutCanvas from './PinoutCanvas';

interface Props {
  familyId: string;
  itemId: string;
  onHome: () => void;
}

export default function Viewer({ familyId, itemId, onHome }: Props) {
  const [index, setIndex] = useState<LibraryIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mirrored, setMirrored] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    fetchLibraryIndex()
      .then(setIndex)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  // Mirror always starts off for a freshly opened arrangement.
  useEffect(() => {
    setMirrored(false);
  }, [familyId, itemId]);

  useWakeLock(true);

  const family = index?.families.find((f) => f.id === familyId);
  const item = useMemo(() => findItem(family, itemId), [family, itemId]);

  const svgUrl = item ? libraryUrl(mirrored ? item.svgMirror : item.svg) : null;

  return (
    <div className={`viewer ${mirrored ? 'is-mirrored' : ''}`}>
      {mirrored && <div className="mirror-banner">MIRRORED</div>}

      <div className="viewer-toolbar">
        <button className="tool-btn" onClick={onHome} aria-label="Home">
          ⌂ Home
        </button>
        <div className="viewer-title">
          {item ? (
            <>
              <span className="viewer-title-main">{item.title}</span>
              {item.viewCaption && <span className="viewer-caption">{item.viewCaption}</span>}
            </>
          ) : (
            <span>{familyId} / {itemId}</span>
          )}
        </div>
        <button className="tool-btn" onClick={() => setResetSignal((n) => n + 1)} aria-label="Fit / reset">
          ⤢ Fit
        </button>
        <button
          className={`tool-btn ${mirrored ? 'active' : ''}`}
          onClick={() => setMirrored((m) => !m)}
          aria-label="Mirror"
          aria-pressed={mirrored}
        >
          ⇋ Mirror
        </button>
      </div>

      <div className="viewer-stage">
        {error && <p className="error">Failed to load library: {error}</p>}
        {!error && !index && <p className="loading">Loading…</p>}
        {!error && index && !item && <p className="error">Arrangement not found: {familyId}/{itemId}</p>}
        {svgUrl && item && (
          <PinoutCanvas
            svgUrl={svgUrl}
            itemKey={item.id}
            mirrored={mirrored}
            resetSignal={resetSignal}
          />
        )}
      </div>
    </div>
  );
}
