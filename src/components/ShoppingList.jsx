import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import CategorySelect from './CategorySelect';
import { useToast } from './ToastProvider';
import { CATEGORIES, guessCategory } from '../categories';
import './ShoppingList.css';

// Alphabetical for the picker; the list itself keeps its aisle order.
const CATEGORY_OPTIONS = [...CATEGORIES].sort((a, b) => a.localeCompare(b));

export default function ShoppingList({ onShoppingChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showFixedProgress, setShowFixedProgress] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [addError, setAddError] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const observerRef = useRef(null);

  // Callback ref: attach an IntersectionObserver to the top progress bar as
  // soon as it mounts, so the fixed bottom bar shows only once it's scrolled
  // out of view.
  const setTopProgressRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      const observer = new IntersectionObserver(
        ([entry]) => setShowFixedProgress(!entry.isIntersecting),
        { threshold: 0 }
      );
      observer.observe(node);
      observerRef.current = observer;
    } else {
      setShowFixedProgress(false);
    }
  }, []);

  // Close on Escape and lock background scroll while the modal is open.
  useEffect(() => {
    if (!showAddModal) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeAddModal();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [showAddModal]);

  const toggleCategory = (category) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  // Load the whole shopping list and keep it in sync across devices.
  useEffect(() => {
    loadShoppingList();

    const subscription = supabase
      .channel('shopping_list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items' },
        () => loadShoppingList()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadShoppingList = async () => {
    try {
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*, ingredients(name, category), meals(name)');

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading shopping list:', error);
    } finally {
      setLoading(false);
    }
  };

  // Merge items that share an ingredient name into a single line.
  const groups = (() => {
    const map = new Map();
    for (const item of items) {
      const rawName = item.ingredients?.name ?? 'Unknown item';
      const key = rawName.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: rawName.trim(),
          ids: [],
          manualIngredientIds: [],
          checkedCount: 0,
          meals: new Set(),
          category: item.ingredients?.category || 'Other',
        });
      }
      const group = map.get(key);
      group.ids.push(item.id);
      if (item.is_checked) group.checkedCount += 1;
      if (item.meals?.name) group.meals.add(item.meals.name);
      // No meal means the ingredient row exists only for this list entry.
      if (!item.meal_id && item.ingredient_id) {
        group.manualIngredientIds.push(item.ingredient_id);
      }
    }

    return [...map.values()]
      .map((g) => ({
        ...g,
        count: g.ids.length,
        checked: g.checkedCount === g.ids.length,
        mealList: [...g.meals].sort(),
      }))
      // Alphabetical only — keep a stable order so checking doesn't reorder.
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  // Bucket the merged items by category, in standard aisle order.
  const categoryOrder = [...CATEGORIES];
  const categorySections = categoryOrder
    .map((category) => ({
      category,
      items: groups.filter((g) => g.category === category),
    }))
    .filter((section) => section.items.length > 0);

  const grabbedCount = groups.filter((g) => g.checked).length;

  // How many distinct meals contributed items to the list.
  const mealCount = new Set(
    items.map((item) => item.meals?.name).filter(Boolean)
  ).size;

  const toggleGroup = async (group) => {
    const target = !group.checked;

    // Optimistic UI update for every underlying row.
    setItems((prev) =>
      prev.map((item) =>
        group.ids.includes(item.id) ? { ...item, is_checked: target } : item
      )
    );

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({
          is_checked: target,
          checked_at: target ? new Date().toISOString() : null,
        })
        .in('id', group.ids);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating item:', error);
      toast('Couldn’t update that item. Try again!', 'error');
      loadShoppingList(); // resync on failure
    }
  };

  const removeGroup = async (group) => {
    const idsToRemove = group.ids;
    // Optimistically drop the item; this only touches the shopping list,
    // never the meal's ingredient list.
    setItems((prev) => prev.filter((item) => !idsToRemove.includes(item.id)));

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', idsToRemove);

      if (error) throw error;

      if (group.manualIngredientIds.length > 0) {
        await supabase
          .from('ingredients')
          .delete()
          .in('id', group.manualIngredientIds);
      }

      onShoppingChanged?.();
    } catch (error) {
      console.error('Error removing item:', error);
      toast('Couldn’t remove that item. Try again!', 'error');
      loadShoppingList();
    }
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setNewItemName('');
    setNewItemCategory('');
    setAddError('');
  };

  // Manually-added items get an ingredient row with no meal attached, which
  // is what marks them as "not from a recipe" everywhere else in the app.
  const addManualItem = async (e) => {
    e.preventDefault();
    const name = newItemName.trim();

    if (!name) {
      setAddError('Give the item a name first.');
      return;
    }

    setSavingItem(true);
    setAddError('');

    try {
      const { data: ingredient, error: ingredientError } = await supabase
        .from('ingredients')
        .insert({
          name,
          category: newItemCategory || guessCategory(name),
          meal_id: null,
        })
        .select()
        .single();

      if (ingredientError) throw ingredientError;

      const { error: itemError } = await supabase
        .from('shopping_list_items')
        .insert({
          ingredient_id: ingredient.id,
          meal_id: null,
          is_checked: false,
        });

      if (itemError) throw itemError;

      closeAddModal();
      loadShoppingList();
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error adding item:', error);
      setAddError('Couldn’t add that item. Try again!');
    } finally {
      setSavingItem(false);
    }
  };

  const clearList = async () => {
    const ids = items.map((item) => item.id);
    const manualIngredientIds = items
      .filter((item) => !item.meal_id && item.ingredient_id)
      .map((item) => item.ingredient_id);
    setItems([]); // optimistic

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', ids);

      if (error) throw error;

      if (manualIngredientIds.length > 0) {
        await supabase.from('ingredients').delete().in('id', manualIngredientIds);
      }

      onShoppingChanged?.();
    } catch (error) {
      console.error('Error clearing list:', error);
      toast('Couldn’t clear the list. Try again!', 'error');
      loadShoppingList();
    }
  };

  return (
    <div className="shopping-list">
      <section className="list-section">
        <div className="list-header">
          <h2>Shopping List</h2>
          <button
            type="button"
            className="btn-add-item"
            onClick={() => setShowAddModal(true)}
            aria-label="Add Item"
          >
            <span className="add-plus" aria-hidden="true">+</span>
            <span className="btn-add-label">Add Item</span>
          </button>
        </div>

        {!loading && groups.length > 0 && (
          <p className="meals-added-count">
            {mealCount} {mealCount === 1 ? 'meal' : 'meals'} added
          </p>
        )}

        {loading ? (
          <p className="empty-list">
            <span>Loading your list...</span>
          </p>
        ) : groups.length === 0 ? (
          <div className="empty-list">
            <p>Your shopping list is empty.</p>
            <p className="empty-hint">
              Go to the <strong>Meals</strong> tab and tap
              "Add to Shopping List" on the meals you're cooking this week.
            </p>
          </div>
        ) : (
          <>
            <div className="progress" ref={setTopProgressRef}>
              <div className="progress-top">
                <p className="progress-text">
                  {grabbedCount} of {groups.length} items grabbed
                </p>
                <button
                  className="btn-clear"
                  onClick={() => setShowClearConfirm(true)}
                >
                  Clear List
                </button>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(grabbedCount / groups.length) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Always mounted so it can slide in and out. */}
            <div
              className={`progress progress-fixed${
                showFixedProgress ? ' visible' : ''
              }`}
            >
              <p className="progress-text">
                {grabbedCount} of {groups.length} items grabbed
              </p>
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(grabbedCount / groups.length) * 100}%` }}
                ></div>
              </div>
            </div>
            {categorySections.map((section) => (
              <div className="category-section" key={section.category}>
                <button
                  type="button"
                  className={`category-header${
                    collapsed.has(section.category) ? ' collapsed' : ''
                  }`}
                  onClick={() => toggleCategory(section.category)}
                  aria-expanded={!collapsed.has(section.category)}
                >
                  <span className="category-title">
                    {section.category}{' '}
                    <span className="category-count">
                      ({section.items.filter((g) => g.checked).length}/
                      {section.items.length})
                    </span>
                  </span>
                  <svg
                    className="category-chevron"
                    width="18"
                    height="18"
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
                <div
                  className={`category-body${
                    collapsed.has(section.category) ? ' collapsed' : ''
                  }`}
                >
                  <ul className="items-list">
                    {section.items.map((group) => (
                    <li
                      key={group.key}
                      className={`list-item ${group.checked ? 'checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={group.checked}
                        onChange={() => toggleGroup(group)}
                        id={`item-${group.key}`}
                      />
                      <label htmlFor={`item-${group.key}`}>
                        <span className="item-name">{group.name}</span>
                        {group.mealList.length > 0 && (
                          <span className="item-meals-list">
                            <span className="item-for">For:</span>
                            {group.mealList.map((mealName) => (
                              <span key={mealName} className="item-meals">
                                {mealName}
                              </span>
                            ))}
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        className="btn-remove-item"
                        onClick={() => removeGroup(group)}
                        aria-label={`Remove ${group.name} from the list`}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                  </ul>
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      {showAddModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddModal(false)}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add an Item"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2>Add an Item</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeAddModal}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={addManualItem} className="add-item-form">
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="newItemName">Item</label>
                  <div className="ingredient-row">
                    <input
                      id="newItemName"
                      type="text"
                      placeholder="e.g., Paper towels"
                      value={newItemName}
                      onChange={(e) => {
                        setNewItemName(e.target.value);
                        if (addError) setAddError('');
                      }}
                      autoFocus
                    />
                    <CategorySelect
                      value={newItemCategory || guessCategory(newItemName)}
                      options={CATEGORY_OPTIONS}
                      onChange={setNewItemCategory}
                    />
                  </div>
                </div>

                {addError && <p className="form-error">{addError}</p>}
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save-meal"
                  disabled={savingItem}
                >
                  {savingItem ? 'Adding...' : 'Add to List'}
                </button>
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={closeAddModal}
                  disabled={savingItem}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={showClearConfirm}
        title="Clear shopping list?"
        message="This removes every item from your shopping list. This can't be undone."
        confirmLabel="Clear List"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          clearList();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
