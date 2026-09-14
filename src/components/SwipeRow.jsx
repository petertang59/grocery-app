import { useEffect, useRef } from 'react';
import './SwipeRow.css';

// How far the row slides to show the action.
const ACTION_WIDTH = 88;
// Movement allowed before deciding whether the finger is swiping the row or
// scrolling the page.
const SLOP = 8;

// A list row that slides left under a finger to reveal one action behind it.
// Touch only: a mouse never fires these handlers, so desktop keeps whatever
// buttons the row already shows.
//
// `open` is owned by the parent so only one row is open at a time.
export default function SwipeRow({
  open,
  onOpenChange,
  actionLabel,
  onAction,
  className = '',
  children,
}) {
  const rowRef = useRef(null);
  const contentRef = useRef(null);
  // { x, y, base, offset, horizontal } for the touch in progress.
  const gesture = useRef(null);
  // Set after a swipe so the tap the browser may synthesise on release
  // doesn't also check the item or open the editor.
  const suppressClick = useRef(false);

  // The drag writes to the DOM directly rather than through state, so the
  // whole list doesn't re-render on every touchmove.
  const setOffset = (px, animate) => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transition = animate ? '' : 'none';
    el.style.transform = px ? `translateX(${px}px)` : '';
  };

  // Follow the parent, e.g. this row closing because another one opened.
  useEffect(() => {
    setOffset(open ? -ACTION_WIDTH : 0, true);
  }, [open]);

  // A tap anywhere outside an open row puts it away.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rowRef.current?.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onOpenChange]);

  const onTouchStart = (e) => {
    suppressClick.current = false;
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    const base = open ? -ACTION_WIDTH : 0;
    gesture.current = {
      x: touch.clientX,
      y: touch.clientY,
      base,
      offset: base,
      horizontal: null,
    };
  };

  const onTouchMove = (e) => {
    const g = gesture.current;
    if (!g) return;

    const touch = e.touches[0];
    const dx = touch.clientX - g.x;
    const dy = touch.clientY - g.y;

    if (g.horizontal === null) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      g.horizontal = Math.abs(dx) > Math.abs(dy);
      // Mostly vertical: it's a scroll. The page moves on, so an open row
      // tucks its action away rather than being left hanging.
      if (!g.horizontal) {
        gesture.current = null;
        if (open) onOpenChange(false);
        return;
      }
    }

    let next = Math.min(0, g.base + dx);
    // Past the action the row resists rather than stopping dead.
    if (next < -ACTION_WIDTH) {
      next = -ACTION_WIDTH + (next + ACTION_WIDTH) / 3;
    }
    g.offset = next;
    setOffset(next, false);
  };

  const onTouchEnd = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g?.horizontal) return;

    suppressClick.current = true;
    const shouldOpen = g.offset < -ACTION_WIDTH / 2;
    // Snap into place here too: when the state doesn't change, the effect
    // above won't run to do it.
    setOffset(shouldOpen ? -ACTION_WIDTH : 0, true);
    if (shouldOpen !== open) onOpenChange(shouldOpen);
  };

  const onClickCapture = (e) => {
    const swallow = () => {
      e.preventDefault();
      e.stopPropagation();
    };

    if (suppressClick.current) {
      suppressClick.current = false;
      swallow();
      return;
    }
    // Tapping an open row closes it rather than acting on what's underneath.
    if (open && !e.target.closest('.swipe-action')) {
      swallow();
      onOpenChange(false);
    }
  };

  return (
    <li
      ref={rowRef}
      className={`swipe-row ${className}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onClickCapture={onClickCapture}
    >
      <button
        type="button"
        className="swipe-action"
        style={{ width: ACTION_WIDTH }}
        aria-label={actionLabel}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onAction}
      >
        Remove
      </button>
      <div className="swipe-content" ref={contentRef}>
        {children}
      </div>
    </li>
  );
}
