import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MealManager from './components/MealManager';
import ShoppingList from './components/ShoppingList';
import { useTheme } from './useTheme';
import './App.css';

function App() {
  const { theme, setTheme } = useTheme();
  const [view, setView] = useState('meals'); // 'meals' or 'shopping'
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [shoppingMealIds, setShoppingMealIds] = useState([]);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  // Keep the shopping-list status (nav count + which meals are on the list)
  // live, and load it up front so meal cards render in the right state.
  useEffect(() => {
    loadShoppingStatus();

    const subscription = supabase
      .channel('shopping_status')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shopping_list_items' },
        () => loadShoppingStatus()
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadShoppingStatus = async () => {
    const { data, error } = await supabase
      .from('shopping_list_items')
      .select('meal_id, ingredients(name)');

    if (error) {
      console.error('Error loading shopping status:', error);
    } else {
      const rows = data || [];
      // Merge duplicate names, matching how the shopping list displays them.
      const unique = new Set(
        rows.map((row) =>
          (row.ingredients?.name ?? 'Unknown item').trim().toLowerCase()
        )
      );
      setShoppingCount(unique.size);
      setShoppingMealIds([
        ...new Set(rows.map((row) => row.meal_id).filter(Boolean)),
      ]);
    }
    setStatusLoaded(true);
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
    <div
      className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      <aside className="sidebar">
        <h1 className="app-title">🛒 Grocery Go</h1>
        <nav className="nav-buttons">
          <button
            className={`nav-btn ${view === 'meals' ? 'active' : ''}`}
            onClick={() => setView('meals')}
            aria-label="Meals"
            title={sidebarCollapsed ? 'Meals' : undefined}
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
            <span className="nav-label">Meals</span>
          </button>
          <button
            className={`nav-btn ${view === 'shopping' ? 'active' : ''}`}
            onClick={() => setView('shopping')}
            aria-label="Shopping List"
            title={sidebarCollapsed ? 'Shopping List' : undefined}
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
            <span className="nav-label">Shopping List</span>
            {shoppingCount > 0 && (
              <span className="nav-count">{shoppingCount}</span>
            )}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="theme-toggle" role="group" aria-label="Colour theme">
            <button
              type="button"
              className={`theme-option${theme === 'light' ? ' active' : ''}`}
              onClick={() => setTheme('light')}
              aria-label="Light mode"
              aria-pressed={theme === 'light'}
            >
              <svg
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
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </button>
            <button
              type="button"
              className={`theme-option${theme === 'dark' ? ' active' : ''}`}
              onClick={() => setTheme('dark')}
              aria-label="Dark mode"
              aria-pressed={theme === 'dark'}
            >
              <svg
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
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <svg
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
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 3v18" />
              {sidebarCollapsed ? (
                <path d="m14 9 3 3-3 3" />
              ) : (
                <path d="m17 15-3-3 3-3" />
              )}
            </svg>
          </button>
        </div>
      </aside>

      <main className="app-main">
        {loading || !statusLoaded ? (
          <div className="loading">Loading your meals...</div>
        ) : (
          <>
            {view === 'meals' && (
              <MealManager
                meals={meals}
                onMealAdded={fetchMeals}
                shoppingMealIds={shoppingMealIds}
                setShoppingMealIds={setShoppingMealIds}
                onShoppingChanged={loadShoppingStatus}
              />
            )}
            {view === 'shopping' && (
              <ShoppingList onShoppingChanged={loadShoppingStatus} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;