import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Shows a small "Update available" banner when a new service worker is
 * waiting to activate. Library updates are atomic: the new SW only takes
 * over (and the new library becomes visible) once fully precached.
 */
export default function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Poll for updates periodically so long-lived offline sessions notice
      // a new build once connectivity returns.
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {});
      }, 60 * 60 * 1000);
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="update-banner" role="status">
      <span>Update available</span>
      <button
        type="button"
        onClick={() => {
          setNeedRefresh(false);
          updateServiceWorker(true);
        }}
      >
        Reload
      </button>
    </div>
  );
}
