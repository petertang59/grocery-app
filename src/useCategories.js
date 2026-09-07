import { useState, useEffect, useCallback } from 'react';
import { CATEGORIES, fetchCategories } from './categories';

// The category list every view sorts and filters by. Falls back to the names
// the app ships with, so the app still works before 003 has been run.
export function useCategories() {
  const [categories, setCategories] = useState(CATEGORIES);

  const reload = useCallback(async () => {
    const rows = await fetchCategories();
    if (rows) setCategories(rows.map((row) => row.name));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Aisle order for the shopping list's sections; A-Z for the dropdowns.
  const options = [...categories].sort((a, b) => a.localeCompare(b));

  return { categories, options, reload };
}
