-- NOTE: This is the database authorization contract, not a business-logic suite.
-- Fixtures are seeded as the database owner, but every authorization assertion
-- runs as anon or authenticated with explicit JWT claims. The transaction is
-- rolled back so repeated local and CI runs leave no fixture data.
begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.denied(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when insufficient_privilege then return true;
end;
$$;

-- Fixed identities keep policy failures readable.
insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', '{"full_name":"Owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'member@example.test', '{"full_name":"Member"}'),
  ('33333333-3333-4333-8333-333333333333', 'outsider@example.test', '{"full_name":"Outsider"}');

insert into public.households (id, name, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Home', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Elsewhere', '33333333-3333-4333-8333-333333333333');

insert into public.household_members (household_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'owner');

insert into public.recipes (id, owner_user_id, title)
values
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Owner recipe'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', 'Outsider recipe');

insert into public.cookbooks (id, owner_user_id, title)
values
  ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Owner cookbook'),
  ('77777777-7777-4777-8777-777777777777', '33333333-3333-4333-8333-333333333333', 'Outsider cookbook');

insert into public.cookbook_recipes (cookbook_id, recipe_id)
values
  ('66666666-6666-4666-8666-666666666666', '44444444-4444-4444-8444-444444444444'),
  ('77777777-7777-4777-8777-777777777777', '55555555-5555-4555-8555-555555555555');

insert into public.household_recipe_activities (
  household_id,
  actor_user_id,
  actor_display_name,
  action,
  recipe_id,
  recipe_title,
  created_at
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Owner',
  'added',
  '44444444-4444-4444-8444-444444444444',
  'Before member joined',
  now() - interval '1 day'
);

select is(
  (
    select count(*)
    from pg_class tables
    join pg_namespace schemas on schemas.oid = tables.relnamespace
    where schemas.nspname = 'public'
      and tables.relname = any(array[
        'profiles', 'households', 'household_members', 'recipes',
        'household_recipe_shares', 'household_join_codes',
        'household_join_rate_limits', 'cookbooks', 'cookbook_recipes',
        'household_recipe_activities'
      ])
      and not tables.relrowsecurity
  ),
  0::bigint,
  'RLS is enabled on every exposed application table'
);

select ok(
  exists (
    select 1 from storage.buckets
    where id = 'noomori-recipe-images'
      and not public
      and file_size_limit = 5242880
      and allowed_mime_types = array['image/webp']
  ),
  'the private recipe-image bucket is reproducible'
);

select ok(not has_table_privilege('anon', 'public.household_join_codes', 'SELECT'), 'anonymous users cannot read join credentials');
select ok(not has_table_privilege('authenticated', 'public.household_join_codes', 'SELECT'), 'authenticated users cannot read join credentials');
select ok(not has_table_privilege('authenticated', 'public.household_join_rate_limits', 'SELECT'), 'authenticated users cannot read rate limits');
select ok(not has_table_privilege('authenticated', 'public.household_recipe_activities', 'SELECT'), 'authenticated users cannot read activity rows directly');
select ok(not has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated users cannot use the private schema');
select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'anon'
  ),
  0::bigint,
  'anonymous users have no direct application-table grants'
);
select is(
  (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee = 'authenticated'
  ),
  16::bigint,
  'authenticated table grants are limited to the operations used by the API'
);
select ok(
  not has_sequence_privilege('anon', 'public.household_recipe_activities_id_seq', 'USAGE')
  and not has_sequence_privilege('authenticated', 'public.household_recipe_activities_id_seq', 'USAGE'),
  'API roles cannot allocate activity IDs directly'
);

select is(
  (
    select count(*)
    from pg_proc functions
    join pg_namespace schemas on schemas.oid = functions.pronamespace
    where functions.prosecdef
      and schemas.nspname in ('public', 'private')
      and not coalesce(functions.proconfig, '{}'::text[]) @> array['search_path=""']
  ),
  0::bigint,
  'every security-definer function has an empty search path'
);

select ok(
  not has_function_privilege('anon', 'private.household_join_rate_limit(uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.record_household_recipe_activity(uuid,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.record_shared_recipe_edit()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.household_join_rate_limit(uuid,boolean)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.record_household_recipe_activity(uuid,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.record_shared_recipe_edit()', 'EXECUTE'),
  'private security-definer functions are not callable by API roles'
);

select is(
  (
    select count(*)
    from pg_proc functions
    join pg_namespace schemas on schemas.oid = functions.pronamespace
    where schemas.nspname = 'public'
      and functions.proname = any(array[
        'create_personal_cookbook', 'get_household_activity',
        'get_household_settings', 'join_household_with_code',
        'leave_household', 'mark_household_activity_read',
        'preview_household_join_code', 'replace_household_join_code',
        'replace_personal_cookbook_recipes', 'revoke_household_join_code',
        'set_recipe_household_shared'
      ])
      and has_function_privilege('anon', functions.oid, 'EXECUTE')
  ),
  0::bigint,
  'anonymous users cannot execute application RPCs'
);

-- Anonymous requests cannot reach personal tables.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select ok(pg_temp.denied('select * from public.profiles'), 'anonymous users cannot read profiles');
select ok(pg_temp.denied('select * from public.recipes'), 'anonymous users cannot read recipes');
select ok(pg_temp.denied('select * from public.cookbooks'), 'anonymous users cannot read cookbooks');
reset role;

-- The owner sees and mutates only personal resources.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.profiles), 1::bigint, 'owners read only their own profile');
select is((select count(*) from public.recipes), 1::bigint, 'owners read only their own recipes');
select is((select count(*) from public.cookbooks), 1::bigint, 'owners read only their own cookbooks');
select is((select count(*) from public.cookbook_recipes), 1::bigint, 'owners read only their own cookbook membership');
select ok(
  pg_temp.denied($sql$
    insert into public.recipes (owner_user_id, title)
    values ('33333333-3333-4333-8333-333333333333', 'Spoofed owner')
  $sql$),
  'owners cannot create recipes for another user'
);
update public.recipes set title = 'Blocked update' where id = '55555555-5555-4555-8555-555555555555';
select is((select title from public.recipes where id = '55555555-5555-4555-8555-555555555555'), null::text, 'foreign recipe updates affect no visible row');
select is(
  public.create_personal_cookbook('Invalid', array['55555555-5555-4555-8555-555555555555']::uuid[]) ->> 'status',
  'INVALID_RECIPE',
  'cookbook RPCs reject foreign recipes'
);
select ok(
  pg_temp.denied($sql$
    insert into public.cookbook_recipes (cookbook_id, recipe_id)
    values ('66666666-6666-4666-8666-666666666666', '55555555-5555-4555-8555-555555555555')
  $sql$),
  'cookbook membership can only change through the authorized RPC'
);
reset role;

-- Sharing grants read-only access to household members, never outsiders.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.recipes where id = '44444444-4444-4444-8444-444444444444'), 0::bigint, 'members cannot read unshared recipes');
select is(public.get_household_settings() ->> 'status', 'OK', 'members use the authorized settings RPC');
select is(
  jsonb_array_length(public.get_household_activity() -> 'activities'),
  0,
  'members cannot read activity from before they joined'
);
select ok(
  pg_temp.denied($sql$
    insert into public.household_members (household_id, user_id, role)
    values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'owner')
  $sql$),
  'members cannot grant themselves a foreign household role'
);
select ok(
  pg_temp.denied($sql$
    insert into public.household_recipe_shares (household_id, recipe_id)
    values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444')
  $sql$),
  'members cannot write share rows directly'
);
reset role;

insert into public.household_recipe_shares (household_id, recipe_id)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.recipes where id = '44444444-4444-4444-8444-444444444444'), 1::bigint, 'members read shared household recipes');
update public.recipes set title = 'Member edit' where id = '44444444-4444-4444-8444-444444444444';
select is((select title from public.recipes where id = '44444444-4444-4444-8444-444444444444'), 'Owner recipe', 'members cannot edit shared recipes');
delete from public.recipes where id = '44444444-4444-4444-8444-444444444444';
select is((select count(*) from public.recipes where id = '44444444-4444-4444-8444-444444444444'), 1::bigint, 'members cannot delete shared recipes');
select is(
  public.set_recipe_household_shared('44444444-4444-4444-8444-444444444444', false) ->> 'status',
  'RECIPE_NOT_FOUND',
  'members cannot change another owner''s share state'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.recipes where id = '44444444-4444-4444-8444-444444444444'), 0::bigint, 'outsiders cannot read shared recipes');
select is((select count(*) from public.household_recipe_shares), 0::bigint, 'outsiders cannot read another household''s shares');
reset role;

-- Restricted credentials and activity remain behind RPCs.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is(
  public.replace_household_join_code(repeat('a', 64)) ->> 'status',
  'FORBIDDEN',
  'household members cannot create join credentials'
);
select ok(pg_temp.denied('select * from public.household_join_codes'), 'join credential rows are inaccessible even when authenticated');
select ok(pg_temp.denied('select * from public.household_recipe_activities'), 'activity rows are inaccessible even when authenticated');
reset role;

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is(public.replace_household_join_code(repeat('a', 64)) ->> 'status', 'OK', 'household owners can create join credentials through the RPC');
select is(public.get_household_activity() ->> 'status', 'OK', 'household members can read activity through the RPC');
reset role;

-- Storage authorization follows recipe ownership and active sharing.
insert into storage.objects (bucket_id, name, owner_id)
values (
  'noomori-recipe-images',
  'recipes/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/88888888-8888-4888-8888-888888888888.webp',
  '11111111-1111-4111-8111-111111111111'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'noomori-recipe-images'), 1::bigint, 'recipe owners read their image objects');
select ok(
  not pg_temp.denied($sql$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'noomori-recipe-images',
      'recipes/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444/99999999-9999-4999-8999-999999999999.webp',
      '11111111-1111-4111-8111-111111111111'
    )
  $sql$),
  'recipe owners upload canonical image paths'
);
select ok(
  pg_temp.denied($sql$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'noomori-recipe-images',
      'recipes/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555/aaaaaaaa-1111-4111-8111-111111111111.webp',
      '11111111-1111-4111-8111-111111111111'
    )
  $sql$),
  'users cannot upload image objects for another owner'
);
select ok(
  pg_temp.denied($sql$
    insert into storage.objects (bucket_id, name, owner_id)
    values ('noomori-recipe-images', 'bad/path.webp', '11111111-1111-4111-8111-111111111111')
  $sql$),
  'malformed image paths are rejected'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'noomori-recipe-images'), 2::bigint, 'members read images for shared recipes');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'recipe image object owners can delete'
      and cmd = 'DELETE'
      and qual like '%owner_id = (auth.uid())::text%'
  ),
  'image deletion requires matching object ownership'
);
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects
where bucket_id = 'noomori-recipe-images';
select is(
  (select count(*) from storage.objects where bucket_id = 'noomori-recipe-images'),
  2::bigint,
  'household members cannot delete another owner''s image objects'
);
reset role;

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from storage.objects where bucket_id = 'noomori-recipe-images'), 0::bigint, 'outsiders cannot read shared recipe images');
reset role;

delete from public.household_recipe_shares
where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and recipe_id = '44444444-4444-4444-8444-444444444444';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.recipes where id = '44444444-4444-4444-8444-444444444444'), 0::bigint, 'unsharing removes member recipe access');
select is((select count(*) from storage.objects where bucket_id = 'noomori-recipe-images'), 0::bigint, 'unsharing removes member image access');
reset role;

-- Authenticated role without a user identity is rejected by security-definer RPCs.
select set_config('request.jwt.claims', '{"role":"authenticated"}', true);
set local role authenticated;
select ok(pg_temp.denied('select public.get_household_settings()'), 'RPCs reject missing auth.uid()');
reset role;

select * from finish();
rollback;
