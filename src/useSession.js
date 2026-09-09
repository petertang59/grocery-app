import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

// The signed-in session, or null. `loading` is true until we know which —
// without it the app would flash the login screen on every refresh while the
// stored session is being read back.
export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Fires on sign in, sign out, and token refresh. supabase-js hands the
    // new token to Realtime itself, so the live subscriptions keep working.
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, next) => setSession(next)
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
