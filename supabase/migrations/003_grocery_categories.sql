-- Grocery categories: the aisle groupings the shopping list is sorted into.
-- They lived in the app as a hardcoded array; this makes them data so they can
-- be renamed and removed from Settings.
--
-- Additive: nothing is dropped, and `grocery_items.category` stays a text
-- column, so the app keeps working whether or not this has run yet.

-- 1. The table. name_key is a stored generated column, matching `stores` and
--    `grocery_items`, so lookups and conflict handling use a real column.
create table if not exists grocery_categories (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text generated always as (lower(btrim(name))) stored unique,
  -- Aisle order, not alphabetical: it drives the shopping list's sections.
  sort_order integer not null default 99,
  created_at timestamptz not null default now()
);

-- 2. Seed the eight the app already ships with, in their existing order.
insert into grocery_categories (name, sort_order)
values
  ('Produce', 1),
  ('Protein', 2),
  ('Dairy & Eggs', 3),
  ('Bakery', 4),
  ('Pantry', 5),
  ('Frozen', 6),
  ('Beverages', 7),
  ('Other', 8)
on conflict (name_key) do nothing;

-- 3. Pick up anything already in use that isn't one of those, so no existing
--    grocery ends up pointing at a category that doesn't exist.
insert into grocery_categories (name, sort_order)
select distinct on (lower(btrim(category))) btrim(category), 99
from grocery_items
where btrim(coalesce(category, '')) <> ''
order by lower(btrim(category))
on conflict (name_key) do nothing;

-- Sanity check — should return zero rows.
-- select g.category from grocery_items g
-- left join grocery_categories c on c.name_key = lower(btrim(g.category))
-- where c.id is null;
