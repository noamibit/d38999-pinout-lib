import { useEffect, useMemo, useState } from 'react';
import { fetchLibraryIndex, lettersOf, numbersOf, type LibraryIndex } from '../lib/library';

interface Props {
  onOpen: (familyId: string, itemId: string) => void;
}

export default function Home({ onOpen }: Props) {
  const [index, setIndex] = useState<LibraryIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [letter, setLetter] = useState<string | null>(null);

  useEffect(() => {
    fetchLibraryIndex()
      .then(setIndex)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  const family = index?.families[0];
  const letters = useMemo(() => (family ? lettersOf(family) : []), [family]);
  const numbers = useMemo(
    () => (family && letter ? numbersOf(family, letter) : []),
    [family, letter],
  );

  return (
    <div className="home">
      <header className="home-header">
        <h1>D38999 / Pinout Lib</h1>
        {index && <span className="lib-version">v{index.libraryVersion}</span>}
      </header>

      {error && (
        <p className="error">
          Failed to load library: {error}
          <br />
          Make sure you are online at least once, or that the library was built.
        </p>
      )}

      {!index && !error && <p className="loading">Loading…</p>}

      {family && !letter && (
        <section aria-label="Select letter">
          <h2 className="section-title">Letter</h2>
          <div className="grid">
            {letters.map((l) => (
              <button key={l} className="big-btn" onClick={() => setLetter(l)}>
                {l}
              </button>
            ))}
          </div>
        </section>
      )}

      {family && letter && (
        <section aria-label="Select number">
          <div className="section-row">
            <button className="back-btn" onClick={() => setLetter(null)} aria-label="Back to letters">
              ← {letter}
            </button>
            <h2 className="section-title">Number</h2>
          </div>
          <div className="grid">
            {numbers.map((item) => (
              <button
                key={item.id}
                className="big-btn"
                onClick={() => onOpen(family.id, item.id)}
              >
                {item.number}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
