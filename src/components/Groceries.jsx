import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import CategorySelect from './CategorySelect';
import StoreSelect from './StoreSelect';
import { useToast } from './ToastProvider';
import ModalHeader from './ModalHeader';
import ConfirmModal from './ConfirmModal';
import { guessCategory } from '../categories';
import { useCategories } from '../useCategories';
import { useStores } from '../useStores';
import { groceryKey, syncGroceryItemStores } from '../groceryItems';
import { shouldFlipMenu } from '../menuPlacement';
import './Groceries.css';


const COLUMNS = [
  { key: 'name', label: 'Name', numeric: false },
  { key: 'category', label: 'Category', numeric: false },
  { key: 'meals', label: 'Used in', numeric: true },
  { key: 'stores', label: 'Stores', numeric: false },
];

export default function Groceries({ onMealsChanged }) {
  const toast = useToast();
  const { options: CATEGORY_OPTIONS } = useCategories();
  const { stores } = useStores();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newStores, setNewStores] = useState([]);
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuUp, setMenuUp] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const tableWrapRef = useRef(null);

  useEffect(() => {
    loadItems();
  }, []);

  // Close on Escape and lock background scroll while the modal is open.
  useEffect(() => {
    if (!showCreate) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeCreate();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [showCreate]);

  // Close the open row menu on any outside click or Escape.
  useEffect(() => {
    if (openMenuId === null) return;

    const onDocClick = () => setOpenMenuId(null);
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openMenuId]);

  // The table clips its own overflow, so a menu near the bottom opens upward.
  const toggleMenu = (rowId, button) => {
    if (openMenuId === rowId) {
      setOpenMenuId(null);
      return;
    }
    setMenuUp(shouldFlipMenu(button, tableWrapRef.current));
    setOpenMenuId(rowId);
  };

  const openCreate = () => {
    setEditingItem(null);
    setNewName('');
    setNewCategory('');
    setNewStores([]);
    setCreateError('');
    setShowCreate(true);
  };

  const openEdit = (row) => {
    setEditingItem(row);
    setNewName(row.name);
    setNewCategory(row.category);
    setNewStores(row.stores);
    setCreateError('');
    setShowCreate(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setShowCreate(false);
  };

  const toggleNewStore = (storeName) => {
    setNewStores((prev) =>
      prev.includes(storeName)
        ? prev.filter((name) => name !== storeName)
        : [...prev, storeName]
    );
  };

  const saveItem = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    const category = newCategory || guessCategory(name);

    if (!name) {
      setCreateError('Give the item a name first.');
      return;
    }
    // The catalogue is one row per real item, so a repeat name is a mistake
    // rather than something to silently merge. An item keeps its own name.
    const clash = items.some(
      (item) =>
        groceryKey(item.name) === groceryKey(name) &&
        item.id !== editingItem?.id
    );
    if (clash) {
      setCreateError(`“${name}” is already in your groceries.`);
      return;
    }

    setSaving(true);
    setCreateError('');

    const storeIds = newStores
      .map((storeName) => stores.find((s) => s.name === storeName)?.id)
      .filter(Boolean);

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('grocery_items')
          .update({ name, category })
          .eq('id', editingItem.id);

        if (error) throw error;
        await syncGroceryItemStores(editingItem.id, storeIds);
      } else {
        const { data: created, error } = await supabase
          .from('grocery_items')
          .insert({ name, category })
          .select('id')
          .single();

        if (error) throw error;

        if (storeIds.length > 0) {
          const { error: linkError } = await supabase
            .from('grocery_item_stores')
            .insert(
              storeIds.map((storeId) => ({
                grocery_item_id: created.id,
                store_id: storeId,
              }))
            );
          if (linkError) throw linkError;
        }
      }

      setShowCreate(false);
      setEditingItem(null);
      loadItems();
    } catch (error) {
      console.error('Error saving grocery item:', error);
      setCreateError('Couldn’t save that item. Try again!');
    } finally {
      setSaving(false);
    }
  };

  const loadItems = async () => {
    try {
      // Meals are derived through the ingredient rows rather than stored on
      // the item, so they can't drift out of sync with the meals themselves.
      const { data, error } = await supabase
        .from('grocery_items')
        .select(
          'id, name, category, ingredients(meals(name)), grocery_item_stores(stores(id, name))'
        )
        .order('name');

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error loading groceries:', error);
    } finally {
      setLoading(false);
    }
  };

  const rows = items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category || 'Other',
    meals: [
      ...new Set(
        (item.ingredients || [])
          .map((ing) => ing.meals?.name)
          .filter(Boolean)
      ),
    ].sort((a, b) => a.localeCompare(b)),
    stores: (item.grocery_item_stores || [])
      .map((link) => link.stores?.name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  }));

  const changeCategory = async (itemId, category) => {
    const previous = items;
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, category } : item))
    );

    const { error } = await supabase
      .from('grocery_items')
      .update({ category })
      .eq('id', itemId);

    if (error) {
      console.error('Error updating category:', error);
      toast('Couldn’t change that category. Try again!', 'error');
      setItems(previous);
    }
  };

  // An item can be stocked at several stores, so each one toggles on its own.
  const toggleStore = async (itemId, storeName) => {
    const store = stores.find((s) => s.name === storeName);
    if (!store) return;

    const item = items.find((i) => i.id === itemId);
    const linked = (item?.grocery_item_stores || []).some(
      (link) => link.stores?.id === store.id
    );
    const previous = items;

    setItems((prev) =>
      prev.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              grocery_item_stores: linked
                ? entry.grocery_item_stores.filter(
                    (link) => link.stores?.id !== store.id
                  )
                : [
                    ...entry.grocery_item_stores,
                    { stores: { id: store.id, name: store.name } },
                  ],
            }
          : entry
      )
    );

    try {
      const { error } = linked
        ? await supabase
            .from('grocery_item_stores')
            .delete()
            .eq('grocery_item_id', itemId)
            .eq('store_id', store.id)
        : await supabase
            .from('grocery_item_stores')
            .insert({ grocery_item_id: itemId, store_id: store.id });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating stores:', error);
      toast('Couldn’t change that store. Try again!', 'error');
      setItems(previous);
    }
  };

  // Ingredients point at the catalogue, so those rows have to go first — and
  // deleting them cascades to any shopping list lines that referenced them.
  const deleteItem = async (row) => {
    try {
      const { error: ingredientError } = await supabase
        .from('ingredients')
        .delete()
        .eq('grocery_item_id', row.id);

      if (ingredientError) throw ingredientError;

      const { error } = await supabase
        .from('grocery_items')
        .delete()
        .eq('id', row.id);

      if (error) throw error;

      // The edit modal would otherwise be left pointing at a deleted row.
      if (editingItem?.id === row.id) {
        setShowCreate(false);
        setEditingItem(null);
      }
      loadItems();
      // Meals just lost an ingredient; the shopping list updates over realtime.
      if (row.meals.length > 0) onMealsChanged?.();
    } catch (error) {
      console.error('Error deleting grocery item:', error);
      toast('Couldn’t delete that item. Try again!', 'error');
    }
  };

  // Counts sort largest-first on the first click; text sorts A-Z.
  const toggleSort = (key) => {
    const column = COLUMNS.find((c) => c.key === key);
    if (key === sortKey) {
      setSortDir((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(column?.numeric ? 'desc' : 'asc');
    }
  };

  const compare = (a, b) => {
    switch (sortKey) {
      case 'meals':
        return a.meals.length - b.meals.length;
      case 'category':
        return a.category.localeCompare(b.category);
      case 'stores':
        // Items with no store sort to the end either way, so the populated
        // rows stay together.
        if (a.stores.length === 0 || b.stores.length === 0) {
          return a.stores.length === b.stores.length
            ? 0
            : a.stores.length === 0
            ? 1
            : -1;
        }
        return a.stores[0].localeCompare(b.stores[0]);
      default:
        return a.name.localeCompare(b.name);
    }
  };

  const sorted = [...rows].sort((a, b) => {
    const result = compare(a, b);
    const directed = sortDir === 'asc' ? result : -result;
    // Name breaks ties so the order is stable between renders.
    return directed || a.name.localeCompare(b.name);
  });

  return (
    <div className="groceries">
      <section className="groceries-section">
        <div className="groceries-header">
          <h2>Groceries</h2>
          <button
            type="button"
            className="btn-create-item"
            onClick={openCreate}
            aria-label="Create Item"
          >
            <span className="create-item-plus" aria-hidden="true">+</span>
            <span className="btn-create-item-label">Create Item</span>
          </button>
        </div>

        {loading ? (
          <p className="groceries-empty">Loading your groceries...</p>
        ) : sorted.length === 0 ? (
          <div className="groceries-empty">
            <p>No grocery items yet.</p>
            <p className="groceries-empty-hint">
              Items appear here as you add ingredients to your meals.
            </p>
          </div>
        ) : (
          <>
            <p className="groceries-count">
              Showing {sorted.length} {sorted.length === 1 ? 'item' : 'items'}
            </p>

            <div className="groceries-table-wrap" ref={tableWrapRef}>
              <table className="groceries-table">
                <thead>
                  <tr>
                    {COLUMNS.map((column) => (
                      <th
                        key={column.key}
                        scope="col"
                        aria-sort={
                          sortKey === column.key
                            ? sortDir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button
                          type="button"
                          className={`th-sort${
                            sortKey === column.key ? ' active' : ''
                          }`}
                          onClick={() => toggleSort(column.key)}
                        >
                          {column.label}
                          <svg
                            className={`sort-arrow${
                              sortKey === column.key && sortDir === 'desc'
                                ? ' desc'
                                : ''
                            }`}
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                      </th>
                    ))}
                    <th
                      scope="col"
                      className="col-actions"
                      aria-label="Actions"
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr
                      key={row.id}
                      className="grocery-row"
                      onClick={() => openEdit(row)}
                    >
                      <td className="col-name">{row.name}</td>
                      <td
                        className="col-category"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CategorySelect
                          variant="inline"
                          label={`Category for ${row.name}`}
                          value={row.category}
                          options={CATEGORY_OPTIONS}
                          onChange={(category) =>
                            changeCategory(row.id, category)
                          }
                        />
                      </td>
                      <td className="col-meals">
                        {row.meals.length > 0
                          ? `${row.meals.length} ${
                              row.meals.length === 1 ? 'meal' : 'meals'
                            }`
                          : '—'}
                      </td>
                      <td
                        className="col-stores"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <StoreSelect
                          variant="inline"
                          label={`Stores for ${row.name}`}
                          values={row.stores}
                          options={stores}
                          onToggle={(store) => toggleStore(row.id, store)}
                        />
                      </td>
                      <td
                        className="col-actions"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grocery-row-menu">
                          <button
                            type="button"
                            className="btn-more"
                            aria-label={`More options for ${row.name}`}
                            aria-haspopup="true"
                            aria-expanded={openMenuId === row.id}
                            onClick={(e) => toggleMenu(row.id, e.currentTarget)}
                          >
                            ⋮
                          </button>
                          {openMenuId === row.id && (
                            <div
                              className={`dropdown-menu${menuUp ? ' up' : ''}`}
                              role="menu"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                className="dropdown-item"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  openEdit(row);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="dropdown-item danger"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setPendingDelete(row);
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {showCreate && (
        <div
          className="modal-overlay"
          onClick={closeCreate}
          role="presentation"
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={editingItem ? 'Edit Item' : 'Create an Item'}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHeader
              title={editingItem ? 'Edit Item' : 'Create an Item'}
              onClose={closeCreate}
            />

            <form onSubmit={saveItem} className="grocery-form">
              <div className="modal-body">
                <div className="form-group">
                  <label htmlFor="newGroceryName">Name</label>
                  <input
                    id="newGroceryName"
                    type="text"
                    placeholder="e.g., Olive oil"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (createError) setCreateError('');
                    }}
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label>Category</label>
                  <CategorySelect
                    label="Category"
                    value={newCategory || guessCategory(newName)}
                    options={CATEGORY_OPTIONS}
                    onChange={setNewCategory}
                  />
                </div>

                <div className="form-group">
                  <label>Stores</label>
                  <StoreSelect
                    label="Stores"
                    values={newStores}
                    options={stores}
                    onToggle={toggleNewStore}
                  />
                </div>

                {createError && <p className="form-error">{createError}</p>}
              </div>

              <div className="form-actions">
                <button type="submit" className="btn-save-meal" disabled={saving}>
                  {saving
                    ? 'Saving...'
                    : editingItem
                    ? 'Save changes'
                    : 'Create Item'}
                </button>
                <button
                  type="button"
                  className="btn-cancel-edit"
                  onClick={closeCreate}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete item?"
        message={
          pendingDelete
            ? pendingDelete.meals.length > 0
              ? `“${pendingDelete.name}” is used in ${
                  pendingDelete.meals.length
                } ${
                  pendingDelete.meals.length === 1 ? 'meal' : 'meals'
                } (${pendingDelete.meals.join(', ')}). Deleting it removes the ` +
                `ingredient from ${
                  pendingDelete.meals.length === 1 ? 'that meal' : 'those meals'
                } and from your shopping list. This can’t be undone.`
              : `“${pendingDelete.name}” isn’t used in any meals. This can’t be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          deleteItem(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
