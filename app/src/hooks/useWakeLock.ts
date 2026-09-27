import { useEffect, useRef } from 'react';

/**
 * Requests a screen wake lock while the calling component is mounted.
 * Silently no-ops if the Wake Lock API is unsupported. Re-acquires the
 * lock when the tab becomes visible again (locks are released by the
 * browser when a page is hidden).
 */
export function useWakeLock(enabled: boolean): void {
  const lockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!('wakeLock' in navigator)) return;

    let cancelled = false;

    async function acquire() {
      try {
        const sentinel = await (navigator as Navigator & {
          wakeLock: { request(type: 'screen'): Promise<WakeLockSentinel> };
        }).wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        lockRef.current = sentinel;
      } catch {
        // Ignore: permission denied, unsupported, or page not visible.
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        acquire();
      }
    }

    acquire();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      lockRef.current?.release().catch(() => {});
      lockRef.current = null;
    };
  }, [enabled]);
}

// Minimal ambient type for browsers/TS libs that don't yet ship WakeLockSentinel.
interface WakeLockSentinel {
  released: boolean;
  release(): Promise<void>;
}
