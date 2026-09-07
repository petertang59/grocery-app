import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import ModalHeader from './ModalHeader';
import ConfirmModal from './ConfirmModal';
import { useToast } from './ToastProvider';
import './SettingsList.css';

const key = (name) => (name ?? '').trim().toLowerCase();

export default function StoreManager({ open, onClose, onChanged }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  // storeId -> groceries stocked there, and how many list no other store.
  const [usage, setUsage] = useState({});
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

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

    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .order('name');

    if (storesError) {
      console.error('Error loading stores:', storesError);
    } else {
      setRows(stores || []);
    }

    const { data: links, error: linksError } = await supabase
      .from('grocery_item_stores')
      .select('grocery_item_id, store_id');

    if (linksError) {
      console.error('Error counting groceries:', linksError);
    } else {
      // How many stores each grocery has, so a delete can say which of them
      // would be left with none at all.
      const perItem = {};
      for (const link of links ?? []) {
        perItem[link.grocery_item_id] = (perItem[link.grocery_item_id] ?? 0) + 1;
      }

      const tally = {};
      for (const link of links ?? []) {
        const entry = tally[link.store_id] ?? { count: 0, onlyStore: 0 };
        entry.count += 1;
        if (perItem[link.grocery_item_id] === 1) entry.onlyStore += 1;
        tally[link.store_id] = entry;
      }
      setUsage(tally);
    }
    setLoading(false);
  };

  const startEdit = (row) => {
    setAdding(false);
    setEditingId(row.id);
    setDraftName(row.name);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName('');
    setError('');
  };

  // Everything joins on store_id, so the name is the only thing to change.
  const saveEdit = async (row) => {
    const name = draftName.trim();

    if (!name) {
      setError('Give the store a name.');
      return;
    }
    if (name === row.name) {
      cancelEdit();
      return;
    }
    if (rows.some((r) => r.id !== row.id && key(r.name) === key(name))) {
      setError(`“${name}” is already a store.`);
      return;
    }

    setSaving(true);
    try {
      const { error: renameError } = await supabase
        .from('stores')
        .update({ name })
        .eq('id', row.id);

      if (renameError) throw renameError;

      cancelEdit();
      await load();
      onChanged?.();
    } catch (err) {
      console.error('Error renaming store:', err);
      setError('Couldn’t rename that store. Try again!');
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

  const addStore = async () => {
    const name = newName.trim();

    if (!name) {
      setError('Give the store a name.');
      return;
    }
    if (rows.some((r) => key(r.name) === key(name))) {
      setError(`“${name}” is already a store.`);
      return;
    }

    setSaving(true);
    try {
      const { error: addError } = await supabase.from('stores').insert({ name });
      if (addError) throw addError;

      cancelAdd();
      await load();
      onChanged?.();
    } catch (err) {
      console.error('Error adding store:', err);
      setError('Couldn’t add that store. Try again!');
    } finally {
      setSaving(false);
    }
  };

  // grocery_item_stores cascades on store_id, so the links go with the row.
  const deleteStore = async (row) => {
    try {
      const { error: deleteError } = await supabase
        .from('stores')
        .delete()
        .eq('id', row.id);

      if (deleteError) throw deleteError;

      await load();
      onChanged?.();
    } catch (err) {
      console.error('Error deleting store:', err);
      toast('Couldn’t delete that store. Try again!', 'error');
    }
  };

  if (!open) return null;

  const usageFor = (row) => usage[row.id] ?? { count: 0, onlyStore: 0 };

  const deleteMessage = (row) => {
    if (row.count === 0) {
      return 'No groceries are bought there, so nothing else changes.';
    }
    const items = `${row.count} ${row.count === 1 ? 'grocery' : 'groceries'}`;
    const stranded =
      row.onlyStore > 0
        ? ` ${row.onlyStore} of them would be left with no store at all, and show under “No store” on your shopping list.`
        : '';
    return `${items} would no longer list ${row.name}.${stranded} This can’t be undone.`;
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} role="presentation">
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-label="Stores"
          onClick={(e) => e.stopPropagation()}
        >
          <ModalHeader title="Stores" onClose={onClose} />

          <div className="modal-body">
            {loading ? (
              <p className="settings-list-empty">Loading your stores...</p>
            ) : (
              <ul className="settings-list">
                {rows.map((row) => {
                  const { count } = usageFor(row);

                  return (
                    <li className="settings-list-row" key={row.id}>
                      {editingId === row.id ? (
                        <>
                          <input
                            type="text"
                            className="settings-list-input"
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
                            className="settings-list-action primary"
                            onClick={() => saveEdit(row)}
                            disabled={saving}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            type="button"
                            className="settings-list-action"
                            onClick={cancelEdit}
                            disabled={saving}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="settings-list-name">{row.name}</span>
                          <span className="settings-list-count">
                            {count} {count === 1 ? 'grocery' : 'groceries'}
                          </span>
                          <button
                            type="button"
                            className="settings-list-action"
                            onClick={() => startEdit(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="settings-list-action danger"
                            onClick={() =>
                              setPendingDelete({ ...row, ...usageFor(row) })
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}

                <li className="settings-list-row settings-list-add">
                  {adding ? (
                    <>
                      <input
                        type="text"
                        className="settings-list-input"
                        placeholder="e.g., Costco"
                        aria-label="New store name"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value);
                          if (error) setError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addStore();
                          } else if (e.key === 'Escape') {
                            e.stopPropagation();
                            cancelAdd();
                          }
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        className="settings-list-action primary"
                        onClick={addStore}
                        disabled={saving}
                      >
                        {saving ? 'Adding...' : 'Add'}
                      </button>
                      <button
                        type="button"
                        className="settings-list-action"
                        onClick={cancelAdd}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="settings-list-add-btn"
                      onClick={startAdd}
                    >
                      <span aria-hidden="true">+</span> Add store
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
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete store?'}
        message={pendingDelete ? deleteMessage(pendingDelete) : ''}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        onConfirm={() => {
          deleteStore(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}
