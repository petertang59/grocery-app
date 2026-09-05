-- Seeds the stores and their item assignments.
--
-- Expresses the rule rather than a snapshot of row ids: the speciality items
-- go to T&T, and everything else defaults to Superstore. Safe to re-run — it
-- only fills in gaps and never reassigns an item that already has a store.

insert into stores (name)
values ('Superstore'), ('T&T')
on conflict (name_key) do nothing;

-- Items stocked at T&T rather than the general grocery store.
insert into grocery_item_stores (grocery_item_id, store_id)
select g.id, s.id
from grocery_items g
cross join stores s
where s.name_key = 't&t'
  and g.name_key in (
    'bulgogi sauce',
    'dashi stock',
    'frozen pork butt/belly',
    'shimeji mushrooms'
  )
on conflict do nothing;

-- Everything not already mapped is available at Superstore.
insert into grocery_item_stores (grocery_item_id, store_id)
select g.id, s.id
from grocery_items g
cross join stores s
where s.name_key = 'superstore'
  and not exists (
    select 1
    from grocery_item_stores link
    where link.grocery_item_id = g.id
  )
on conflict do nothing;

-- Expected result: every catalogue item has at least one store.
-- select g.name
-- from grocery_items g
-- left join grocery_item_stores l on l.grocery_item_id = g.id
-- where l.grocery_item_id is null;
