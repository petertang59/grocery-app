import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabaseClient';

// The shops the store pickers offer. Everything joins on store_id, so a store
// renamed in Settings shows up here as soon as this refetches.
export function useStores() {
  const [stores, setStores] = useState([]);

  const reload = useCallback(async () => {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name')
      .order('name');

    if (error) {
      console.error('Error loading stores:', error);
      return;
    }
    setStores(data || []);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { stores, reload };
}
