import { useEffect, useRef, useState } from 'react';

// How far the finger has to travel before the pull counts.
const THRESHOLD = 70;
// The indicator stops following past this, so a long drag doesn't run away.
const MAX_PULL = 110;
// Resistance: the sheet moves at half the speed of the finger.
const FRICTION = 0.5;

// Pull down from the top of the page to reload. Mobile only — on a desktop
// there's no gesture to make, and the mouse wheel shouldn't trigger a fetch.
export function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Handlers are attached once, so anything they read lives in a ref.
  const startY = useRef(null);
  const pullRef = useRef(0);
  const busy = useRef(false);
  const refresh = useRef(onRefresh);
  refresh.current = onRefresh;

  useEffect(() => {
    // Checked per gesture rather than once here, so rotating a tablet or
    // resizing a window doesn't leave the listeners in the wrong mode.
    const onPhone = () => window.matchMedia('(max-width: 768px)').matches;

    const setPullTo = (value) => {
      pullRef.current = value;
      setPull(value);
    };

    const onTouchStart = (e) => {
      // A modal locks body scroll; dragging inside one isn't a page pull.
      const modalOpen = document.body.style.overflow === 'hidden';
      if (
        !onPhone() ||
        busy.current ||
        modalOpen ||
        window.scrollY > 0 ||
        e.touches.length !== 1
      ) {
        return;
      }
      startY.current = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (startY.current === null) return;

      const delta = e.touches[0].clientY - startY.current;
      // Scrolling up instead: hand the gesture back to the page.
      if (delta <= 0) {
        startY.current = null;
        setPullTo(0);
        return;
      }

      setPullTo(Math.min(MAX_PULL, delta * FRICTION));
      // Stops the page rubber-banding underneath the indicator.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;

      if (pullRef.current < THRESHOLD) {
        setPullTo(0);
        return;
      }

      busy.current = true;
      setPullTo(THRESHOLD);
      setRefreshing(true);
      try {
        await refresh.current?.();
      } catch (error) {
        console.error('Pull to refresh failed:', error);
      } finally {
        setRefreshing(false);
        setPullTo(0);
        busy.current = false;
      }
    };

    // touchmove has to be non-passive to be able to preventDefault.
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return { pull, refreshing, ready: pull >= THRESHOLD };
}
