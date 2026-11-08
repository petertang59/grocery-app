import { useEffect, useState } from 'react';
import ModalHeader from './ModalHeader';
import { CategoryIcon } from '../categoryIcons';
import './AddMealModal.css';

// Pick which of a meal's ingredients go on the shopping list — everything is
// ticked to start, so skipping what's already in the cupboard is one tap.
export default function AddMealModal({ meal, onCancel, onConfirm }) {
  const ingredients = meal?.ingredients ?? [];
  // Everything starts ticked. The modal is mounted per meal (see the key
  // where it's rendered), so last time's choices never carry over.
  const [skipped, setSkipped] = useState(() => new Set());

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onCancel]);

  if (!meal) return null;

  const toggle = (id) =>
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const chosen = ingredients.filter((ing) => !skipped.has(ing.id));
  const allChosen = skipped.size === 0;

  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal add-meal-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Add ${meal.name} to shopping list`}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader title="Add to Shopping List" onClose={onCancel} />

        <div className="add-meal-intro">
          <p className="add-meal-meal">{meal.name}</p>
          <button
            type="button"
            className="add-meal-toggle-all"
            onClick={() =>
              setSkipped(
                allChosen ? new Set(ingredients.map((ing) => ing.id)) : new Set()
              )
            }
          >
            {allChosen ? 'Clear all' : 'Select all'}
          </button>
        </div>

        <ul className="add-meal-list">
          {ingredients.map((ingredient) => {
            const checked = !skipped.has(ingredient.id);
            return (
              <li key={ingredient.id} className="add-meal-item">
                <label className="add-meal-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(ingredient.id)}
                  />
                  <span className="add-meal-name">{ingredient.name}</span>
                  <span className="add-meal-category">
                    <CategoryIcon
                      name={ingredient.category}
                      size={14}
                      className="add-meal-category-icon"
                    />
                    {ingredient.category}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="form-actions">
          <button type="button" className="btn-cancel-edit" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-save-meal"
            onClick={() => onConfirm(chosen)}
            disabled={chosen.length === 0}
            autoFocus
          >
            Add {chosen.length}{' '}
            {chosen.length === 1 ? 'item' : 'items'}
          </button>
        </div>
      </div>
    </div>
  );
}
