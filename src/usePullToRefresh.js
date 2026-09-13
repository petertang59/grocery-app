import { useEffect, useRef, useState } from 'react';

// How far the finger has to travel before the pull counts.
const THRESHOLD = 70;
// The indicator stops following past this, so a long drag doesn't run away.
const MAX_PULL = 110;
// Resistance: the sheet moves at half the speed of the finger.
const FRICTION = 0.5;
// Movement allowed before deciding whether a touch is a pull at all. Until
// then the page is left alone, so a sideways swipe never gets swallowed.
const SLOP = 10;

// Pull down from the top of the page to reload. Mobile only — on a desktop
// there's no gesture to make, and the mouse wheel shouldn't trigger a fetch.
//
// Anything that scrolls sideways (the store tabs, say) should carry
// `data-scroll-x`; touches that start inside it are never treated as a pull.
export function usePullToRefresh(onRefresh) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Handlers are attached once, so anything they read lives in a ref.
  // `start` is the touch origin; `pulling` flips on once the gesture has
  // clearly gone downward.
  const start = useRef(null);
  const pulling = useRef(false);
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

    const abandon = () => {
      start.current = null;
      pulling.current = false;
      if (pullRef.current) setPullTo(0);
    };

    const onTouchStart = (e) => {
      // A modal locks body scroll; dragging inside one isn't a page pull.
      const modalOpen = document.body.style.overflow === 'hidden';
      if (
        !onPhone() ||
        busy.current ||
        modalOpen ||
        window.scrollY > 0 ||
        e.touches.length !== 1 ||
        e.target.closest?.('[data-scroll-x]')
      ) {
        return;
      }
      const touch = e.touches[0];
      start.current = { x: touch.clientX, y: touch.clientY };
      pulling.current = false;
    };

    const onTouchMove = (e) => {
      if (!start.current) return;

      const touch = e.touches[0];
      const dx = touch.clientX - start.current.x;
      const dy = touch.clientY - start.current.y;

      if (!pulling.current) {
        // Too small to tell yet — let the browser carry on as normal.
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // Sideways or upward: not ours. Hand the whole gesture back.
        if (dy <= 0 || Math.abs(dx) >= Math.abs(dy)) {
          abandon();
          return;
        }
        pulling.current = true;
      }

      if (dy <= 0) {
        abandon();
        return;
      }

      setPullTo(Math.min(MAX_PULL, dy * FRICTION));
      // Stops the page rubber-banding underneath the indicator.
      if (e.cancelable) e.preventDefault();
    };

    const onTouchEnd = async () => {
      if (!start.current) return;
      const wasPulling = pulling.current;
      start.current = null;
      pulling.current = false;

      if (!wasPulling || pullRef.current < THRESHOLD) {
        if (pullRef.current) setPullTo(0);
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
