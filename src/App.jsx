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
      setMeals(data || []);
    } catch (error) {
      console.error('Error fetching meals:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🛒 Grocery Go</h1>
        <nav className="nav-buttons">
          <button
            className={`nav-btn ${view === 'meals' ? 'active' : ''}`}
            onClick={() => setView('meals')}
          >
            Meals
          </button>
          <button
            className={`nav-btn ${view === 'shopping' ? 'active' : ''}`}
            onClick={() => setView('shopping')}
          >
            Shopping List{shoppingCount > 0 ? ` (${shoppingCount})` : ''}
          </button>
        </nav>
      </header>

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