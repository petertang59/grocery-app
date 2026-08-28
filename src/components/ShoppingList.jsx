import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';
import { CATEGORIES } from '../categories';
import './ShoppingList.css';

export default function ShoppingList({ onShoppingChanged }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showFixedProgress, setShowFixedProgress] = useState(false);
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
          checkedCount: 0,
          meals: new Set(),
          category: item.ingredients?.category || 'Other',
        });
      }
      const group = map.get(key);
      group.ids.push(item.id);
      if (item.is_checked) group.checkedCount += 1;
      if (item.meals?.name) group.meals.add(item.meals.name);
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
      onShoppingChanged?.();
    } catch (error) {
      console.error('Error removing item:', error);
      toast('Couldn’t remove that item. Try again!', 'error');
      loadShoppingList();
    }
  };

  const clearList = async () => {
    const ids = items.map((item) => item.id);
    setItems([]); // optimistic

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .delete()
        .in('id', ids);

      if (error) throw error;
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
          {groups.length > 0 && (
            <button className="btn-clear" onClick={() => setShowClearConfirm(true)}>
              Clear List
            </button>
          )}
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
