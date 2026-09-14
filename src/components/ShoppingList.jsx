import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import ConfirmModal from './ConfirmModal';
import CategorySelect from './CategorySelect';
import ModalHeader from './ModalHeader';
import { useToast } from './ToastProvider';
import { guessCategory } from '../categories';
import { useCategories } from '../useCategories';
import { useStores } from '../useStores';
import {
  resolveGroceryItems,
  groceryKey,
  syncGroceryItemStores,
  fetchCatalogue,
} from '../groceryItems';
import StoreSelect from './StoreSelect';
import IngredientInput from './IngredientInput';
import { CategoryIcon } from '../categoryIcons';
import './ShoppingList.css';

// Alphabetical for the picker; the list itself keeps its aisle order.
const ALL_STORES = 'All stores';
const NO_STORE = 'No store';
const ALL_CATEGORIES = 'All categories';

// The store tab survives a reload or a trip to another app mid-shop. Storage
// can throw (private mode, blocked site data), in which case it's just "All".
const STORE_KEY = 'shoppingList.store';

const readSavedStore = () => {
  try {
    return localStorage.getItem(STORE_KEY) || ALL_STORES;
  } catch {
    return ALL_STORES;
  }
};

export default function ShoppingList({ onShoppingChanged, refreshKey = 0 }) {
  const toast = useToast();
  const { categories, options: CATEGORY_OPTIONS, reload: reloadCategories } =
    useCategories();
  const { stores: storeOptions, reload: reloadStores } = useStores();

  // A pull-to-refresh bumps refreshKey; skip the initial render, which the
  // mount effects already cover.
  useEffect(() => {
    if (!refreshKey) return;
    loadShoppingList();
    reloadCategories();
    reloadStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);
  const [showFixedProgress, setShowFixedProgress] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [addError, setAddError] = useState('');
  const [savingItem, setSavingItem] = useState(false);
  const [newItemStores, setNewItemStores] = useState([]);
  // Set once the user edits a field themselves, so prefilling from the
  // catalogue stops overwriting their choice as they keep typing.
  const [detailsTouched, setDetailsTouched] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [activeTab, setActiveTab] = useState(readSavedStore);
  const observerRef = useRef(null);

  // Only picking a store saves the choice. When the saved store has nothing
  // on the list, another one shows for now, and the saved one comes back as
  // soon as it has items again.
  const chooseTab = (tab) => {
    setActiveTab(tab);
    try {
      localStorage.setItem(STORE_KEY, tab);
    } catch {
      // Not saved; the tab still switches for this visit.
    }
  };

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
        .select(
          '*, ingredients(name, category, grocery_item_id, grocery_items(id, name, category, grocery_item_stores(stores(name)))), meals(name)'
        );

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading shopping list:', error);
    } finally {
      setLoading(false);
    }
  };

  // Merge items that refer to the same catalogue entry into a single line.
  const groups = (() => {
    const map = new Map();
    for (const item of items) {
      const catalogueItem = item.ingredients?.grocery_items ?? null;
      const rawName = catalogueItem?.name ?? item.ingredients?.name ?? 'Unknown item';
      // Fall back to the name until every row has been linked to the catalogue.
      const key = catalogueItem
        ? `item-${catalogueItem.id}`
        : rawName.trim().toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          key,
          name: rawName.trim(),
          groceryItemId: catalogueItem?.id ?? null,
          groceryStores: (catalogueItem?.grocery_item_stores || [])
            .map((link) => link.stores?.name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b)),
          ids: [],
          manualIngredientIds: [],
          checkedCount: 0,
          checkedAt: '',
          category:
            catalogueItem?.category || item.ingredients?.category || 'Other',
        });
      }
      const group = map.get(key);
      group.ids.push(item.id);
      if (item.is_checked) group.checkedCount += 1;
      // ISO timestamps compare correctly as strings.
      if (item.checked_at && item.checked_at > group.checkedAt) {
        group.checkedAt = item.checked_at;
      }
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
      }))
      // Alphabetical only — keep a stable order so checking doesn't reorder.
      .sort((a, b) => a.name.localeCompare(b.name));
  })();

  const storesOnList = [
    ...new Set(groups.flatMap((group) => group.groceryStores)),
  ].sort((a, b) => a.localeCompare(b));
  const hasUnassigned = groups.some((group) => group.groceryStores.length === 0);

  const tabs = [
    ...storesOnList,
    ...(hasUnassigned ? [NO_STORE] : []),
  ];
  // "All" only earns its place when there's more than one thing to filter by.
  if (tabs.length > 1) tabs.unshift(ALL_STORES);

  // The selected tab can vanish — the last T&T item gets checked off and
  // removed, say — so fall back rather than showing an empty list.
  const currentTab = tabs.includes(activeTab) ? activeTab : tabs[0] ?? ALL_STORES;

  const matchesTab = (group) => {
    if (currentTab === ALL_STORES) return true;
    if (currentTab === NO_STORE) return group.groceryStores.length === 0;
    // An item sold at several stores belongs under each of them.
    return group.groceryStores.includes(currentTab);
  };

  const visibleGroups = groups.filter(matchesTab);

  const remainingFor = (tab) =>
    groups.filter((group) => {
      if (group.checked) return false;
      if (tab === ALL_STORES) return true;
      if (tab === NO_STORE) return group.groceryStores.length === 0;
      return group.groceryStores.includes(tab);
    }).length;

  // Aisle order from Settings; anything unrecognised sorts to the end.
  const categoryRank = (category) => {
    const index = categories.indexOf(category);
    return index === -1 ? categories.length : index;
  };

  // The filter only offers categories with something still to get here, so
  // picking one never lands on an empty list.
  const remainingHere = visibleGroups.filter((g) => !g.checked);
  const remainingByCategory = new Map();
  for (const group of remainingHere) {
    remainingByCategory.set(
      group.category,
      (remainingByCategory.get(group.category) ?? 0) + 1
    );
  }
  const categoryFilterOptions = [
    ALL_CATEGORIES,
    ...[...remainingByCategory.keys()].sort(
      (a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b)
    ),
  ];
  const categoryCounts = {
    [ALL_CATEGORIES]: remainingHere.length,
    ...Object.fromEntries(remainingByCategory),
  };

  // A category with nothing left (checked off here, or on someone else's
  // phone) drops out of the options, and the list shows every category.
  const currentCategory = categoryFilterOptions.includes(categoryFilter)
    ? categoryFilter
    : ALL_CATEGORIES;

  const matchesCategory = (group) =>
    currentCategory === ALL_CATEGORIES || group.category === currentCategory;

  // Still to get: grouped by aisle without the headers, then A–Z, so similar
  // things sit together.
  const remainingItems = remainingHere
    .filter(matchesCategory)
    .sort(
      (a, b) =>
        categoryRank(a.category) - categoryRank(b.category) ||
        a.name.localeCompare(b.name)
    );

  // Most recently checked first, so undoing a mis-tap is right at the top.
  const completedItems = visibleGroups
    .filter((g) => g.checked && matchesCategory(g))
    .sort(
      (a, b) =>
        b.checkedAt.localeCompare(a.checkedAt) || a.name.localeCompare(b.name)
    );

  const grabbedCount = visibleGroups.filter((g) => g.checked).length;
  const visibleCount = visibleGroups.length;

  // How many distinct meals contributed items to the list.
  const mealCount = new Set(
    items.map((item) => item.meals?.name).filter(Boolean)
  ).size;

  const toggleGroup = async (group) => {
    const target = !group.checked;
    const checkedAt = target ? new Date().toISOString() : null;

    // Checking off the last item in the filtered category clears the filter
    // for good, rather than it springing back if that item is unchecked.
    if (
      target &&
      group.category === currentCategory &&
      remainingByCategory.get(group.category) === 1
    ) {
      setCategoryFilter(ALL_CATEGORIES);
    }

    // Optimistic UI update for every underlying row. checked_at goes in too,
    // so the item lands at the top of Completed straight away.
    setItems((prev) =>
      prev.map((item) =>
        group.ids.includes(item.id)
          ? { ...item, is_checked: target, checked_at: checkedAt }
          : item
      )
    );

    try {
      const { error } = await supabase
        .from('shopping_list_items')
        .update({
          is_checked: target,
          checked_at: checkedAt,
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

  const renderItem = (group) => (
    <li
      key={group.key}
      className={`list-item ${group.checked ? 'checked' : ''}`}
    >
      <input
        type="checkbox"
        checked={group.checked}
        onChange={() => toggleGroup(group)}
        id={`item-${group.key}`}
        aria-label={group.name}
      />
      {/* Not a <label>: only the checkbox itself should toggle the item. The
          rest of the row opens the editor. */}
      <div
        className="item-body"
        role="button"
        tabIndex={0}
        aria-label={`Edit ${group.name}`}
        onClick={() => openEditModal(group)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openEditModal(group);
          }
        }}
      >
        <span className="item-name">{group.name}</span>
        <span className="item-category">
          <CategoryIcon
            name={group.category}
            size={14}
            className="item-category-icon"
          />
          {group.category}
        </span>
      </div>
      {/* Removing is the only thing this button does; editing is the row. */}
      <div className="item-menu" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="btn-remove-item"
          aria-label={`Remove ${group.name}`}
          onClick={() => setPendingRemove(group)}
        >
          ✕
        </button>
      </div>
    </li>
  );

  // Refreshed each time the modal opens so a name typed here matches whatever
  // the catalogue holds right now.
  const openAddModal = async () => {
    setEditingItem(null);
    setNewItemName('');
    setNewItemCategory('');
    setNewItemStores([]);
    setDetailsTouched(false);
    setAddError('');
    setShowAddModal(true);

    try {
      setCatalogue(await fetchCatalogue());
    } catch (error) {
      console.error('Error loading the grocery catalogue:', error);
    }
  };

  // Clicking a row edits the catalogue entry behind it, so a rename or a store
  // change follows the item everywhere it appears, not just on this list.
  const openEditModal = (group) => {
    if (!group.groceryItemId) return;
    setEditingItem(group);
    setNewItemName(group.name);
    setNewItemCategory(group.category);
    setNewItemStores(group.groceryStores);
    setDetailsTouched(true);
    setAddError('');
    setShowAddModal(true);
  };

  // Choosing a suggestion is an explicit pick, so it fills the details in even
  // if the fields were edited by hand first.
  const pickCatalogueItem = (item) => {
    setNewItemName(item.name);
    setNewItemCategory(item.category);
    setNewItemStores(item.stores);
    setDetailsTouched(false);
    setAddError('');
  };

  // Typing the name of an item that already exists fills in its category and
  // stores, so saving can't blank out details the item already had.
  const onNameChange = (value) => {
    setNewItemName(value);
    if (addError) setAddError('');
    if (detailsTouched) return;

    const match = catalogue.find((item) => item.name_key === groceryKey(value));
    setNewItemCategory(match?.category ?? '');
    setNewItemStores(match?.stores ?? []);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setEditingItem(null);
    setDetailsTouched(false);
    setNewItemName('');
    setNewItemCategory('');
    setNewItemStores([]);
    setAddError('');
  };

  const toggleNewItemStore = (storeName) => {
    setDetailsTouched(true);
    setNewItemStores((prev) =>
      prev.includes(storeName)
        ? prev.filter((name) => name !== storeName)
        : [...prev, storeName]
    );
  };

  const storeIdsFor = (names) =>
    names
      .map((name) => storeOptions.find((s) => s.name === name)?.id)
      .filter(Boolean);

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

    // Editing writes to the catalogue entry, which is what every view reads.
    if (editingItem) {
      try {
        const category = newItemCategory || guessCategory(name);
        const renamed = groceryKey(name) !== groceryKey(editingItem.name);

        if (renamed) {
          const { data: clash } = await supabase
            .from('grocery_items')
            .select('id')
            .eq('name_key', groceryKey(name))
            .neq('id', editingItem.groceryItemId);

          if (clash?.length) {
            setAddError(`“${name}” is already in your groceries.`);
            setSavingItem(false);
            return;
          }
        }

        const { error: itemError } = await supabase
          .from('grocery_items')
          .update({ name, category })
          .eq('id', editingItem.groceryItemId);

        if (itemError) throw itemError;

        // The ingredient rows keep their own copy of the name and category,
        // which is what the meal editor shows, so they move together.
        const { error: ingredientError } = await supabase
          .from('ingredients')
          .update({ name, category })
          .eq('grocery_item_id', editingItem.groceryItemId);

        if (ingredientError) throw ingredientError;

        await syncGroceryItemStores(
          editingItem.groceryItemId,
          storeIdsFor(newItemStores)
        );

        closeAddModal();
        loadShoppingList();
        onShoppingChanged?.();
      } catch (error) {
        console.error('Error saving item:', error);
        setAddError('Couldn’t save those changes. Try again!');
      } finally {
        setSavingItem(false);
      }
      return;
    }

    try {
      const category = newItemCategory || guessCategory(name);
      const catalogue = await resolveGroceryItems([{ name, category }]);
      const itemId = catalogue.get(groceryKey(name));

      const { data: ingredient, error: ingredientError } = await supabase
        .from('ingredients')
        .insert({
          name,
          category,
          meal_id: null,
          grocery_item_id: itemId,
        })
        .select()
        .single();

      if (ingredientError) throw ingredientError;

      if (itemId) {
        await syncGroceryItemStores(itemId, storeIdsFor(newItemStores));
      }

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
        <div className="page-header list-header">
          <h2>Shopping List</h2>
          <button
            type="button"
            className="btn-add-item"
            onClick={openAddModal}
            aria-label="Add Item"
          >
            <span className="add-plus" aria-hidden="true">+</span>
            <span className="btn-add-label">Add Item</span>
          </button>
        </div>

        <div className="page-content">
          {!loading && groups.length > 0 && (
            <p className="meals-added-count">
              {mealCount} {mealCount === 1 ? 'meal' : 'meals'} added
            </p>
          )}

          {/* Store first, then category: narrow to where you are, then to
              the aisle. */}
          {!loading && groups.length > 0 && (
            <div className="list-filters">
              {tabs.length > 1 && (
                <CategorySelect
                  variant="compact"
                  label="Filter by store"
                  value={currentTab}
                  options={tabs}
                  counts={Object.fromEntries(
                    tabs.map((tab) => [tab, remainingFor(tab)])
                  )}
                  showIcons={false}
                  onChange={chooseTab}
                />
              )}
              <CategorySelect
                variant="compact"
                label="Filter by category"
                value={currentCategory}
                options={categoryFilterOptions}
                counts={categoryCounts}
                allOption={ALL_CATEGORIES}
                onChange={setCategoryFilter}
              />
            </div>
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
                    {grabbedCount} of {visibleCount} items grabbed
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
                    style={{ width: `${(grabbedCount / Math.max(1, visibleCount)) * 100}%` }}
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
                  {grabbedCount} of {visibleCount} items grabbed
                </p>
                {/* Only shown on mobile, where this bar replaces the one at
                    the top of the list that normally carries Clear List. */}
                <button
                  className="btn-clear btn-clear-docked"
                  onClick={() => setShowClearConfirm(true)}
                >
                  Clear List
                </button>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${(grabbedCount / Math.max(1, visibleCount)) * 100}%` }}
                  ></div>
                </div>
              </div>
              <div className="list-card">
                <p className="list-card-heading">
                  Remaining
                  <span className="list-card-count">
                    ({remainingItems.length})
                  </span>
                </p>
                {remainingItems.length > 0 ? (
                  <ul className="items-list">{remainingItems.map(renderItem)}</ul>
                ) : (
                  <p className="list-card-empty">Everything’s in the cart.</p>
                )}
              </div>

              {/* Checked items park down here, out of the way of what's still
                  to find. Collapsed until asked for. */}
              {completedItems.length > 0 && (
                <div className="list-card">
                  <button
                    type="button"
                    className={`completed-header${
                      completedOpen ? '' : ' collapsed'
                    }`}
                    onClick={() => setCompletedOpen((open) => !open)}
                    aria-expanded={completedOpen}
                  >
                    <span className="list-card-heading">
                      Completed
                      <span className="list-card-count">
                        ({completedItems.length})
                      </span>
                    </span>
                    <svg
                      className="completed-chevron"
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
                    className={`completed-body${
                      completedOpen ? '' : ' collapsed'
                    }`}
                  >
                    <div className="completed-body-inner">
                      <ul className="items-list">
                        {completedItems.map(renderItem)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
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
            aria-label={editingItem ? 'Edit Item' : 'Add Item'}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHeader
              title={editingItem ? 'Edit Item' : 'Add Item'}
              onClose={closeAddModal}
            />

            <form onSubmit={addManualItem} className="add-item-form">
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="newItemName">Name</label>
                  <IngredientInput
                    id="newItemName"
                    label="Item name"
                    placeholder="e.g., Paper towels"
                    value={newItemName}
                    onChange={onNameChange}
                    onPick={pickCatalogueItem}
                    catalogue={catalogue}
                  />
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <CategorySelect
                    label="Category"
                    value={newItemCategory || guessCategory(newItemName)}
                    options={CATEGORY_OPTIONS}
                    onChange={(category) => {
                      setDetailsTouched(true);
                      setNewItemCategory(category);
                    }}
                  />
                </div>

                <div className="form-group">
                  <label>Stores</label>
                  <StoreSelect
                    label="Stores"
                    values={newItemStores}
                    options={storeOptions}
                    onToggle={toggleNewItemStore}
                  />
                </div>

                {addError && <p className="form-error">{addError}</p>}
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn-save-meal"
                  disabled={savingItem}
                >
                  {savingItem
                    ? 'Saving...'
                    : editingItem
                    ? 'Save changes'
                    : 'Add'}
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
        open={!!pendingRemove}
        title={
          pendingRemove ? `Remove ${pendingRemove.name}?` : 'Remove item?'
        }
        message="This takes it off your shopping list. It won't change any of your saved meals."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          removeGroup(pendingRemove);
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />

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
