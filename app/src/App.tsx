import { useEffect, useState } from 'react';
import Home from './components/Home';
import Viewer from './components/Viewer';
import UpdateBanner from './components/UpdateBanner';

type Route = { name: 'home' } | { name: 'viewer'; familyId: string; itemId: string };

function parseHash(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '');
  const parts = clean.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length >= 2) {
    return { name: 'viewer', familyId: parts[0], itemId: parts[1] };
  }
  return { name: 'home' };
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  function openViewer(familyId: string, itemId: string) {
    window.location.hash = `#/${encodeURIComponent(familyId)}/${encodeURIComponent(itemId)}`;
  }

  function goHome() {
    window.location.hash = '#/';
  }

  return (
    <>
      {route.name === 'home' && <Home onOpen={openViewer} />}
      {route.name === 'viewer' && (
        <Viewer familyId={route.familyId} itemId={route.itemId} onHome={goHome} />
      )}
      <UpdateBanner />
    </>
  );
}
