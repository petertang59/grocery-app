import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MealManager from './components/MealManager';
import ShoppingList from './components/ShoppingList';
import './App.css';

function App() {
  const [view, setView] = useState('meals'); // 'meals' or 'shopping'
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shoppingCount, setShoppingCount] = useState(0);

  // Fetch meals on mount
  useEffect(() => {
    fetchMeals();
  }, []);

  // Set up real-time subscription for meals
  useEffect(() => {
    const subscription = supabase
      .channel('meals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, () => {
        fetchMeals();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Keep the shopping-list count (unique ingredient names) live in the nav.
  useEffect(() => {
    loadShoppingCount();

    const subscription = supabase
      .channel('shopping_count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items' },
        () => loadShoppingCount()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadShoppingCount = async () => {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('ingredients(name)');

    if (error) {
      console.error('Error loading shopping count:', error);
      return;
    }
    // Merge duplicate names, matching how the shopping list displays them.
    const unique = new Set(
      (data || []).map((row) =>
        (row.ingredients?.name ?? 'Unknown item').trim().toLowerCase()
      )
    );
    setShoppingCount(unique.size);
  };

  const fetchMeals = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('meals')
        .select('*, ingredients(*)');
      
      if (error) throw error;
      const sorted = (data || []).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      setMeals(sorted);
    } catch (error) {
      console.error('Error fetching meals:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <h1 className="app-title">🛒 Grocery Go</h1>
        <nav className="nav-buttons">
          <button
            className={`nav-btn ${view === 'meals' ? 'active' : ''}`}
            onClick={() => setView('meals')}
          >
            <svg
              className="nav-icon"
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
              <path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" />
              <path d="M15 15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7" />
              <path d="m2.1 21.8 6.4-6.3" />
              <path d="m19 5-7 7" />
            </svg>
            Meals
          </button>
          <button
            className={`nav-btn ${view === 'shopping' ? 'active' : ''}`}
            onClick={() => setView('shopping')}
          >
            <svg
              className="nav-icon"
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
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            Shopping List{shoppingCount > 0 ? ` (${shoppingCount})` : ''}
          </button>
        </nav>
      </aside>

      <main className="app-main">
        {loading ? (
          <div className="loading">Loading your meals...</div>
        ) : (
          <>
            {view === 'meals' && (
              <MealManager
                meals={meals}
                onMealAdded={fetchMeals}
                onShoppingChanged={loadShoppingCount}
              />
            )}
            {view === 'shopping' && (
              <ShoppingList onShoppingChanged={loadShoppingCount} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;