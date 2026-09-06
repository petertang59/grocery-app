import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import './StoreSelect.css';

// Multi-select: an item can be stocked at several stores, and none checked
// simply means it isn't mapped to any.
export default function StoreSelect({
  values,
  options,
  onToggle,
  label,
  variant = 'field',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const measureRef = useRef(null);
  const caretRef = useRef(null);
  // How many pills fit on one line; the rest collapse into a "+N".
  const [shownCount, setShownCount] = useState(values.length);
  const collapses = variant === 'inline';

  useLayoutEffect(() => {
    if (!collapses || values.length === 0) {
      setShownCount(values.length);
      return;
    }

    const measure = () => {
      const root = rootRef.current;
      const bench = measureRef.current;
      if (!root || !bench) return;

      const trigger = root.querySelector('.store-trigger');
      const triggerStyle = getComputedStyle(trigger);
      const gap = parseFloat(getComputedStyle(bench).columnGap) || 0;
      const caret = caretRef.current?.getBoundingClientRect().width ?? 0;

      // Width the pills can occupy: the cell, less the trigger's own padding
      // and the caret that sits beside them.
      const available =
        root.clientWidth -
        parseFloat(triggerStyle.paddingLeft) -
        parseFloat(triggerStyle.paddingRight) -
        caret -
        gap;

      const benched = [...bench.children];
      const badge = benched[benched.length - 1].getBoundingClientRect().width;
      const widths = benched
        .slice(0, -1)
        .map((el) => el.getBoundingClientRect().width);

      const total =
        widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1);
      if (total <= available) {
        setShownCount(widths.length);
        return;
      }

      let used = 0;
      let fits = 0;
      for (let i = 0; i < widths.length; i += 1) {
        const next = used + widths[i] + (i > 0 ? gap : 0);
        // Every truncated state needs room for the "+N" badge as well.
        if (next + gap + badge <= available) {
          used = next;
          fits += 1;
        } else {
          break;
        }
      }
      // Always show at least one pill, even in a very narrow column.
      setShownCount(Math.max(1, fits));
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (rootRef.current) observer.observe(rootRef.current);
    return () => observer.disconnect();
  }, [collapses, values]);

  const shown = collapses ? values.slice(0, shownCount) : values;
  const overflow = values.length - shown.length;

  useEffect(() => {
    if (!open) return;

    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={`store-select ${variant}`} ref={rootRef}>
      <button
        type="button"
        className={`store-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={label}
      >
        {values.length > 0 ? (
          <span className="store-pills">
            {shown.map((value) => (
              <span key={value} className="store-pill">
                {value}
              </span>
            ))}
            {overflow > 0 && (
              <span className="store-pill store-pill-more">+{overflow}</span>
            )}
          </span>
        ) : (
          <span className="store-none">—</span>
        )}
        <svg
          ref={caretRef}
          className="store-caret"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {collapses && values.length > 0 && (
        <span className="store-pills store-pills-bench" ref={measureRef} aria-hidden="true">
          {values.map((value) => (
            <span key={value} className="store-pill">
              {value}
            </span>
          ))}
          <span className="store-pill">+{values.length}</span>
        </span>
      )}

      {open && (
        <div className="store-menu" role="group" aria-label={label}>
          {options.length === 0 ? (
            <p className="store-menu-empty">No stores yet</p>
          ) : (
            options.map((option) => (
              // The menu stays open so several stores can be ticked in one go.
              <label key={option.id} className="store-option">
                <input
                  type="checkbox"
                  checked={values.includes(option.name)}
                  onChange={() => onToggle(option.name)}
                />
                <span>{option.name}</span>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}
