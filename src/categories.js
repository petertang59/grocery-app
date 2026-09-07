import { supabase } from './supabaseClient';

// The categories the app ships with, in aisle order. Since 003 these live in
// `grocery_categories`; this list stays as the seed order and as the fallback
// for anyone whose database hasn't been migrated yet.
export const CATEGORIES = [
  'Produce',
  'Protein',
  'Dairy & Eggs',
  'Bakery',
  'Pantry',
  'Frozen',
  'Beverages',
  'Other',
];

// Keyword → category. Checked in order against the lowercased ingredient name;
// the first list with a matching substring wins. Order matters: more specific
// food types are checked before broad ones (e.g. Protein before Frozen so
// "frozen raw shrimp" reads as a protein, and produce before the pantry
// "pepper" so "bell pepper" isn't mistaken for black pepper).
const KEYWORD_MAP = [
  ['Produce', [
    'lettuce', 'spinach', 'kale', 'arugula', 'green onion', 'scallion', 'onion',
    'garlic', 'shallot', 'ginger', 'tomato', 'potato', 'carrot', 'celery',
    'bell pepper', 'cucumber', 'broccoli', 'cauliflower', 'mushroom', 'avocado',
    'lemon', 'lime', 'apple', 'banana', 'berry', 'strawberr', 'blueberr',
    'raspberr', 'grape', 'orange', 'melon', 'cilantro', 'parsley', 'basil',
    'herb', 'zucchini', 'squash', 'cabbage', 'corn', 'pea', 'sprout',
    'asparagus', 'eggplant', 'radish', 'beet', 'leek', 'chili',
  ]],
  ['Protein', [
    'chicken', 'beef', 'steak', 'flank', 'sirloin', 'ribeye', 'brisket',
    'pork', 'bacon', 'sausage', 'turkey', 'lamb', 'ham', 'ground ',
    'shrimp', 'prawn', 'salmon', 'tuna', 'cod', 'fish', 'crab', 'scallop',
    'tofu', 'tempeh', 'egg',
  ]],
  ['Dairy & Eggs', [
    'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'sour cream',
    'heavy cream', 'half and half', 'mozzarella', 'parmesan', 'cheddar',
    'feta', 'ricotta', 'cottage',
  ]],
  ['Bakery', [
    'bread', 'bun', 'bagel', 'tortilla', 'roll', 'baguette', 'croissant',
    'pita', 'naan', 'muffin', 'crumpet',
  ]],
  ['Beverages', [
    'water', 'juice', 'soda', 'coffee', 'tea', 'beer', 'wine', 'cola',
    'sparkling', 'kombucha', 'lemonade',
  ]],
  ['Frozen', [
    'frozen', 'ice cream', 'ice-cream', 'popsicle',
  ]],
  ['Pantry', [
    'rice', 'pasta', 'noodle', 'linguine', 'spaghetti', 'flour', 'sugar',
    'salt', 'pepper', 'oil', 'vinegar', 'sauce', 'soy sauce', 'ketchup',
    'mustard', 'mayo', 'spice', 'seasoning', 'stock', 'broth', 'bean',
    'lentil', 'chickpea', 'cereal', 'oat', 'honey', 'syrup', 'peanut butter',
    'jam', 'jelly', 'starch', 'baking', 'canned', 'can of', 'nuts', 'almond',
  ]],
];

// Best-guess category for an ingredient name; 'Other' when nothing matches.
export function guessCategory(name) {
  const n = (name || '').toLowerCase();
  if (!n.trim()) return 'Other';
  for (const [category, keywords] of KEYWORD_MAP) {
    if (keywords.some((kw) => n.includes(kw))) return category;
  }
  return 'Other';
}

// Ordered category names from the database, or null when they can't be read
// (the table isn't there yet, or the request failed) so callers can fall back.
export async function fetchCategories() {
  const { data, error } = await supabase
    .from('grocery_categories')
    .select('id, name, sort_order')
    .order('sort_order')
    .order('name');

  if (error) {
    console.error('Error loading categories:', error);
    return null;
  }
  return data?.length ? data : null;
}
