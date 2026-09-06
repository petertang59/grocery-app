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

// name_key -> array of store names, for showing an item's current stores
// before anything has been edited.
export async function fetchCatalogueStores() {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('name_key, grocery_item_stores(stores(name))');

  if (error) throw error;

  return new Map(
    (data || []).map((item) => [
      item.name_key,
      (item.grocery_item_stores || [])
        .map((link) => link.stores?.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    ])
  );
}

// Brings one item's store links in line with `storeIds`, touching only what
// actually changed so unrelated links are left alone.
export async function syncGroceryItemStores(itemId, storeIds) {
  const { data: existing, error } = await supabase
    .from('grocery_item_stores')
    .select('store_id')
    .eq('grocery_item_id', itemId);

  if (error) throw error;

  const have = new Set((existing || []).map((row) => row.store_id));
  const want = new Set(storeIds);
  const toRemove = [...have].filter((id) => !want.has(id));
  const toAdd = [...want].filter((id) => !have.has(id));

  if (toRemove.length > 0) {
    const { error: deleteError } = await supabase
      .from('grocery_item_stores')
      .delete()
      .eq('grocery_item_id', itemId)
      .in('store_id', toRemove);
    if (deleteError) throw deleteError;
  }

  if (toAdd.length > 0) {
    const { error: insertError } = await supabase
      .from('grocery_item_stores')
      .insert(
        toAdd.map((storeId) => ({
          grocery_item_id: itemId,
          store_id: storeId,
        }))
      );
    if (insertError) throw insertError;
  }
}
