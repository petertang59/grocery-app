import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import MealManager from './components/MealManager';
import ShoppingList from './components/ShoppingList';
import Groceries from './components/Groceries';
import Settings from './components/Settings';
import Login from './components/Login';
import { useTheme } from './useTheme';
import { useSession } from './useSession';
import './App.css';

function App() {
  const { theme, toggleTheme } = useTheme();
  const { session, loading: sessionLoading } = useSession();
  // 'meals' | 'shopping' | 'groceries' | 'settings'
  const [view, setView] = useState('meals');
  const [meals, setMeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [shoppingMealIds, setShoppingMealIds] = useState([]);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Every fetch and subscription below waits for a session: under RLS an
  // anonymous query returns nothing, and these would never retry once the
  // user signed in.

  // Fetch meals once signed in
  useEffect(() => {
    if (!session) return;
    fetchMeals();
  }, [session]);

  // Set up real-time subscription for meals
  useEffect(() => {
    if (!session) return;

    const subscription = supabase
      .channel('meals')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meals' }, () => {
        fetchMeals();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [session]);

  // Keep the shopping-list status (nav count + which meals are on the list)
  // live, and load it up front so meal cards render in the right state.
  useEffect(() => {
    if (!session) return;

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
  }, [session]);

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

  // Nothing renders — and no query runs — until we know who's asking.
  if (sessionLoading) return <div className="session-loading" />;
  if (!session) return <Login />;

  return (
    <div
      className={`app-container${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}
    >
      <aside className="sidebar">
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
            <span className="nav-icon-wrap">
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
              {shoppingCount > 0 && (
                <span className="nav-dot" aria-hidden="true" />
              )}
            </span>
            <span className="nav-label">Shopping List</span>
            {shoppingCount > 0 && (
              <span className="nav-count">{shoppingCount}</span>
            )}
          </button>
          <button
            className={`nav-btn ${view === 'groceries' ? 'active' : ''}`}
            onClick={() => setView('groceries')}
            aria-label="Groceries"
            title={sidebarCollapsed ? 'Groceries' : undefined}
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
              <path d="M15.45 15.4c-2.13.65-4.3.32-5.7-1.1-2.29-2.27-1.76-6.5 1.17-9.42 2.93-2.93 7.15-3.46 9.43-1.18 1.41 1.41 1.74 3.57 1.1 5.71-1.4-.51-3.26-.02-4.64 1.36-1.38 1.38-1.87 3.23-1.36 4.63z" />
              <path d="m11.25 15.6-2.16 2.16a2.5 2.5 0 1 1-4.56 1.73 2.49 2.49 0 0 1-1.41-4.24 2.5 2.5 0 0 1 3.14-.32l2.16-2.16" />
            </svg>
            <span className="nav-label">Groceries</span>
          </button>
          <button
            className={`nav-btn ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
            aria-label="Settings"
            title={sidebarCollapsed ? 'Settings' : undefined}
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
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            <span className="nav-label">Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
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
            {view === 'groceries' && (
              <Groceries onMealsChanged={fetchMeals} />
            )}
            {view === 'shopping' && (
              <ShoppingList onShoppingChanged={loadShoppingStatus} />
            )}
            {view === 'settings' && (
              <Settings
                theme={theme}
                onToggleTheme={toggleTheme}
                email={session.user.email}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;