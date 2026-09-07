import { useState, useEffect, useRef } from 'react';
import { groceryKey } from '../groceryItems';
import './IngredientInput.css';

const MAX_SUGGESTIONS = 6;

// Free-text ingredient name with suggestions from the grocery catalogue.
// Picking one fills in the item's category and stores.
export default function IngredientInput({
  value,
  onChange,
  onPick,
  catalogue,
  label,
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);

  const query = groceryKey(value);
  const matches =
    query.length === 0
      ? []
      : catalogue
          // An exact match is already resolved — nothing left to suggest.
          .filter(
            (item) => item.name_key.includes(query) && item.name_key !== query
          )
          .slice(0, MAX_SUGGESTIONS);

  const showing = open && matches.length > 0;

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (!showing) return;

    const onDocClick = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showing]);

  const pick = (item) => {
    onPick(item);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!showing) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter') {
      // Otherwise Enter would submit the meal form.
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === 'Escape') {
      // Close the suggestions without also closing the modal.
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="ingredient-input" ref={rootRef}>
      <input
        type="text"
        placeholder="e.g., Eggs"
        aria-label={label}
        role="combobox"
        aria-expanded={showing}
        aria-autocomplete="list"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showing && (
        <ul className="ingredient-suggestions" role="listbox">
          {matches.map((item, i) => (
            <li key={item.name_key}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`ingredient-suggestion${
                  i === active ? ' active' : ''
                }`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
              >
                <span className="suggestion-name">{item.name}</span>
                <span className="suggestion-meta">
                  {[item.category, ...item.stores].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
