-- Row level security.
--
-- The anon key ships inside the app's JavaScript bundle, so it is public by
-- design — anyone who loads the deployed site can read it. Without RLS that
-- key is a full read/write credential to every table. These policies make it
-- useless on its own: a request has to carry a signed-in session.
--
-- Everyone who logs in shares the same data, which is the point — this is one
-- household's meals and shopping list, not per-user storage. So the policies
-- check only that the caller is authenticated, not who they are.
--
-- IMPORTANT: run this only once the app's login screen is deployed. Enabling
-- RLS against a build with no auth leaves every query returning nothing.
--
-- Also turn off public signups in the dashboard (Authentication → Sign In /
-- Providers → "Allow new users to sign up"), otherwise anyone could create an
-- account and reach this same shared data. Add accounts by hand under
-- Authentication → Users.

alter table meals enable row level security;
alter table ingredients enable row level security;
alter table shopping_list_items enable row level security;
alter table grocery_items enable row level security;
alter table stores enable row level security;
alter table grocery_item_stores enable row level security;
alter table grocery_categories enable row level security;

-- `for all` covers select, insert, update and delete. `using` gates the rows
-- that can be read or changed; `with check` gates the rows that can be
-- written. Anonymous callers match no policy at all, so they get nothing.
create policy "Signed-in users have full access"
  on meals for all to authenticated using (true) with check (true);

create policy "Signed-in users have full access"
  on ingredients for all to authenticated using (true) with check (true);

create policy "Signed-in users have full access"
  on shopping_list_items for all to authenticated using (true) with check (true);

create policy "Signed-in users have full access"
  on grocery_items for all to authenticated using (true) with check (true);

create policy "Signed-in users have full access"
  on stores for all to authenticated using (true) with check (true);

create policy "Signed-in users have full access"
  on grocery_item_stores for all to authenticated using (true) with check (true);

create policy "Signed-in users have full access"
  on grocery_categories for all to authenticated using (true) with check (true);

-- Sanity check — every table should report rowsecurity = true.
-- select tablename, rowsecurity from pg_tables
-- where schemaname = 'public' order by tablename;

-- To undo: drop the policies and
-- alter table <name> disable row level security;
