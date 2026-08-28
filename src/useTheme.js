import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'grocery-go-theme';

// Reads the saved override, or null when the user is following the OS.
const readStored = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
};

const systemPrefersDark = () =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

export function useTheme() {
  // null = follow the OS; 'light'/'dark' = explicit user override.
  const [override, setOverride] = useState(readStored);
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Track OS changes so "system" mode updates live.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const theme = override ?? (systemDark ? 'dark' : 'light');

  // Drive the CSS via a data attribute on <html>.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setOverride(theme === 'dark' ? 'light' : 'dark');
  }, [theme]);

  // Pick a theme directly (used by the segmented toggle).
  const setTheme = useCallback((next) => setOverride(next), []);

  // Persist (or clear) the override.
  useEffect(() => {
    try {
      if (override) localStorage.setItem(STORAGE_KEY, override);
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable — theme still works for this session */
    }
  }, [override]);

  return { theme, toggleTheme, setTheme };
}
