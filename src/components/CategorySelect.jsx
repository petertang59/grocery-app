import { useState, useEffect, useRef } from 'react';
import { CategoryIcon } from '../categoryIcons';
import './CategorySelect.css';

// A custom dropdown so the menu can be styled to match the app (a native
// <select> renders an OS-level menu that CSS can't reach).
export default function CategorySelect({
  value,
  options,
  onChange,
  label = 'Category',
  variant = 'field',
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation(); // don't also close the modal
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  return (
    <div
      className={`category-select-wrap${
        variant === 'inline' ? ' inline' : ''
      }`}
      ref={rootRef}
    >
      <button
        type="button"
        className={`category-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="category-value">
          <CategoryIcon name={value} size={16} className="category-icon" />
          <span className="category-label">{value}</span>
        </span>
        <svg
          className="category-caret"
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

      {open && (
        <div className="category-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={option === value}
              className={`category-option${
                option === value ? ' selected' : ''
              }`}
              onClick={() => {
                onChange(option);
                setOpen(false);
              }}
            >
              <span className="category-value">
                <CategoryIcon
                  name={option}
                  size={16}
                  className="category-icon"
                />
                <span className="category-label">{option}</span>
              </span>
              {option === value && (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
