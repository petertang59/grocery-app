import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Groceries.css';

const COLUMNS = [
  { key: 'name', label: 'Name', numeric: false },
  { key: 'category', label: 'Category', numeric: false },
  { key: 'meals', label: 'Used in', numeric: true },
  { key: 'stores', label: 'Stores', numeric: false },
];

export default function Groceries() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    loadItems();
  }, []);

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

            <div className="groceries-table-wrap">
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
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => (
                    <tr key={row.id}>
                      <td className="col-name">{row.name}</td>
                      <td className="col-category">{row.category}</td>
                      <td className="col-meals">
                        {row.meals.length > 0 ? (
                          `${row.meals.length} ${
                            row.meals.length === 1 ? 'meal' : 'meals'
                          }`
                        ) : (
                          <span className="cell-empty">—</span>
                        )}
                      </td>
                      <td>
                        {row.stores.length > 0 ? (
                          <span className="cell-pills">
                            {row.stores.map((store) => (
                              <span key={store} className="cell-pill">
                                {store}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="cell-empty">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
