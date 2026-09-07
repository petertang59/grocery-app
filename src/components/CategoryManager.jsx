import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { fetchCategories } from '../categories';
import ModalHeader from './ModalHeader';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';
import './CategoryManager.css';

// Where groceries land when their category is deleted, and what guessCategory
// falls back to — so it can't be removed or renamed away.
const FALLBACK = 'Other';

const key = (name) => (name ?? '').trim().toLowerCase();

export default function CategoryManager({ open, onClose, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!open) return;

    load();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const load = async () => {
    setLoading(true);
    setEditingId(null);
    setAdding(false);
    setNewName('');
    setError('');

    const categories = await fetchCategories();
    setMissingTable(!categories);
    setRows(categories ?? []);

    // Counted from the catalogue rather than stored, so it can't drift.
    const { data, error: itemsError } = await supabase
      .from('grocery_items')
      .select('category');

    if (itemsError) {
      console.error('Error counting groceries:', itemsError);
    } else {
      const tally = {};
      for (const item of data ?? []) {
        const k = key(item.category) || key(FALLBACK);
        tally[k] = (tally[k] ?? 0) + 1;
      }
      setCounts(tally);
    }
    setLoading(false);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setDraftName(row.name);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName('');
    setError('');
  };

  // Renaming has to carry the groceries with it: the item rows store the
  // category as text, so they'd point at a name that no longer exists.
  const saveEdit = async (row) => {
    const name = draftName.trim();

    if (!name) {
      setError('Give the category a name.');
      return;
    }
    if (name === row.name) {
      cancelEdit();
      return;
    }
    if (rows.some((r) => r.id !== row.id && key(r.name) === key(name))) {
      setError(`“${name}” is already a category.`);
      return;
    }

    setSaving(true);
    try {
      const { error: renameError } = await supabase
        .from('grocery_categories')
        .update({ name })
        .eq('id', row.id);

      if (renameError) throw renameError;

      const { error: itemsError } = await supabase
        .from('grocery_items')
        .update({ category: name })
        .eq('category', row.name);

      if (itemsError) throw itemsError;

      // Ingredient rows keep their own copy, used until an item is linked.
      await supabase
        .from('ingredients')
        .update({ category: name })
        .eq('category', row.name);

      cancelEdit();
      await load();
      onChanged?.();
    } catch (err) {
      console.error('Error renaming category:', err);
      setError('Couldn’t rename that category. Try again!');
    } finally {
      setSaving(false);
    }
  };

  const startAdd = () => {
    setEditingId(null);
    setAdding(true);
    setNewName('');
    setError('');
  };

  const cancelAdd = () => {
    setAdding(false);
    setNewName('');
    setError('');
  };

  const addCategory = async () => {
    const name = newName.trim();

    if (!name) {
      setError('Give the category a name.');
      return;
    }
    if (rows.some((r) => key(r.name) === key(name))) {
      setError(`“${name}” is already a category.`);
      return;
    }

    setSaving(true);
    try {
      const last = Math.max(0, ...rows.map((r) => r.sort_order ?? 0));

      const { error: addError } = await supabase
        .from('grocery_categories')
        .insert({ name, sort_order: last + 1 });

      if (addError) throw addError;

      // Other is the catch-all, so it stays at the end of the aisle order
      // rather than being overtaken by whatever was just added.
      const fallbackRow = rows.find((r) => key(r.name) === key(FALLBACK));
      if (fallbackRow) {
        await supabase
          .from('grocery_categories')
          .update({ sort_order: last + 2 })
          .eq('id', fallbackRow.id);
      }

      cancelAdd();
      await load();
      onChanged?.();
    } catch (err) {
      console.error('Error adding category:', err);
      setError('Couldn’t add that category. Try again!');
    } finally {
      setSaving(false);
    }
  };

  const deleteCategory = async (row) => {
    try {
      const { error: moveError } = await supabase
        .from('grocery_items')
        .update({ category: FALLBACK })
        .eq('category', row.name);

      if (moveError) throw moveError;

      await supabase
        .from('ingredients')
        .update({ category: FALLBACK })
        .eq('category', row.name);

      const { error: deleteError } = await supabase
        .from('grocery_categories')
        .delete()
        .eq('id', row.id);

      if (deleteError) throw deleteError;

      await load();
      onChanged?.();
    } catch (err) {
      console.error('Error deleting category:', err);
      toast('Couldn’t delete that category. Try again!', 'error');
    }
  };

  if (!open) return null;

  const countFor = (row) => counts[key(row.name)] ?? 0;

  return (
    <>
      <div className="modal-overlay" onClick={onClose} role="presentation">
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Grocery Categories"
          onClick={(e) => e.stopPropagation()}
        >
          <ModalHeader title="Grocery Categories" onClose={onClose} />

          <div className="modal-body">
            {loading ? (
              <p className="category-empty">Loading your categories...</p>
            ) : missingTable ? (
              <p className="category-empty">
                Categories aren’t set up in your database yet. Run the
                003_grocery_categories migration in Supabase, then reopen this.
              </p>
            ) : (
              <ul className="category-rows">
                {rows.map((row) => {
                  const count = countFor(row);
                  const protectedRow = key(row.name) === key(FALLBACK);

                  return (
                    <li className="category-row" key={row.id}>
                      {editingId === row.id ? (
                        <>
                          <input
                            type="text"
                            className="category-input"
                            value={draftName}
                            aria-label={`Rename ${row.name}`}
                            onChange={(e) => {
                              setDraftName(e.target.value);
                              if (error) setError('');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                saveEdit(row);
                              } else if (e.key === 'Escape') {
                                e.stopPropagation();
                                cancelEdit();
                              }
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className="category-action primary"
                            onClick={() => saveEdit(row)}
                            disabled={saving}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="category-action"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="category-name">{row.name}</span>
                          <span className="category-count">
                            {count} {count === 1 ? 'grocery' : 'groceries'}
                          </span>
                          <button
                            type="button"
                            className="category-action"
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="category-action danger"
                            onClick={() => setPendingDelete({ ...row, count })}
                            disabled={protectedRow}
                            title={
                              protectedRow
                                ? 'Other is where uncategorised groceries go, so it stays.'
                                : undefined
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}

                <li className="category-row category-add">
                  {adding ? (
                    <>
                      <input
                        type="text"
                        className="category-input"
                        placeholder="e.g., Snacks"
                        aria-label="New category name"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value);
                          if (error) setError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addCategory();
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            cancelAdd();
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="category-action primary"
                        onClick={addCategory}
                        disabled={saving}
                      >
                        {saving ? 'Adding...' : 'Add'}
                      </button>
                      <button
                        type="button"
                        className="category-action"
                        onClick={cancelAdd}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="category-add-btn"
                      onClick={startAdd}
                    >
                      <span aria-hidden="true">+</span> Add category
                    </button>
                  )}
                </li>
              </ul>
            )}

            {error && <p className="form-error">{error}</p>}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete category?'}
        message={
          pendingDelete
            ? pendingDelete.count > 0
              ? `${pendingDelete.count} ${
                  pendingDelete.count === 1 ? 'grocery moves' : 'groceries move'
                } to ${FALLBACK}. This can’t be undone.`
              : 'Nothing is using it, so nothing else changes.'
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          deleteCategory(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
