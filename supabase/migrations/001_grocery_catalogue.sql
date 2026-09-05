-- Grocery catalogue: one canonical row per real-world item, with the stores
-- that stock it. Meal usage stays in `ingredients`, which now points at the
-- catalogue instead of repeating the name once per meal.
--
-- Additive and reversible: nothing existing is dropped or renamed, so the
-- current app keeps working until each piece is switched over.

-- 1. Merge the one true duplicate before it becomes two catalogue rows.
update ingredients
set name = 'Green onion'
where lower(btrim(name)) = 'green onions';

-- 2. The catalogue itself.
--    name_key is a stored generated column rather than an expression index, so
--    the app can look items up (and upsert) by a real column.
create table if not exists grocery_items (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text generated always as (lower(btrim(name))) stored unique,
  category text not null default 'Other',
  created_at timestamptz not null default now()
);

-- 3. Stores, and which items you can buy at each.
create table if not exists stores (
  id bigint generated always as identity primary key,
  name text not null,
  name_key text generated always as (lower(btrim(name))) stored unique,
  created_at timestamptz not null default now()
);

create table if not exists grocery_item_stores (
  grocery_item_id bigint not null references grocery_items (id) on delete cascade,
  store_id bigint not null references stores (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grocery_item_id, store_id)
);

-- 4. Link meal ingredients to the catalogue.
alter table ingredients
  add column if not exists grocery_item_id bigint references grocery_items (id);

-- 5. Backfill the catalogue from the ingredients that already exist.
--    Categories are consistent across duplicates today, so the lowest-id row
--    is a safe representative.
insert into grocery_items (name, category)
select distinct on (lower(btrim(name))) btrim(name), category
from ingredients
order by lower(btrim(name)), id
on conflict (name_key) do nothing;

update ingredients i
set grocery_item_id = g.id
from grocery_items g
where g.name_key = lower(btrim(i.name))
  and i.grocery_item_id is null;

-- 6. Every ingredient must now resolve to a catalogue item.
alter table ingredients alter column grocery_item_id set not null;

-- Sanity checks — both should return zero rows.
-- select * from ingredients where grocery_item_id is null;
-- select name_key, count(*) from grocery_items group by name_key having count(*) > 1;
