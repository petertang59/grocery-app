import { supabase } from './supabaseClient';

// Matches the `name_key` generated column on grocery_items.
export const groceryKey = (name) => (name ?? '').trim().toLowerCase();

// Find-or-create catalogue rows for a batch of {name, category} entries.
// Returns a Map of name_key -> grocery_items.id.
//
// Two steps rather than an upsert: an upsert would rewrite the category of
// items that already exist, and a meal shouldn't silently recategorise an
// item that other meals share.
export async function resolveGroceryItems(entries) {
  const wanted = new Map();
  for (const { name, category } of entries) {
    const key = groceryKey(name);
    if (key && !wanted.has(key)) {
      wanted.set(key, { name: name.trim(), category: category || 'Other' });
    }
  }
  if (wanted.size === 0) return new Map();

  const keys = [...wanted.keys()];
  const { data: existing, error } = await supabase
    .from('grocery_items')
    .select('id, name_key')
    .in('name_key', keys);

  if (error) throw error;

  const byKey = new Map((existing || []).map((row) => [row.name_key, row.id]));
  const missing = keys.filter((key) => !byKey.has(key));

  if (missing.length > 0) {
    const { data: created, error: insertError } = await supabase
      .from('grocery_items')
      .insert(missing.map((key) => wanted.get(key)))
      .select('id, name_key');

    if (insertError) throw insertError;
    for (const row of created || []) byKey.set(row.name_key, row.id);
  }

  return byKey;
}
