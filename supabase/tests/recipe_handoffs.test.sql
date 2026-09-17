begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'owner@example.test', '{"full_name":"Household owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'member@example.test', '{"full_name":"Departing member"}');

update public.profiles set onboarding_completed_at = now();

insert into public.households (id, name, created_by)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'Shared kitchen',
  '11111111-1111-4111-8111-111111111111'
);

insert into public.household_members (household_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member');

insert into public.recipes (
  id,
  owner_user_id,
  title,
  description,
  image_path,
  ingredients,
  instructions,
  servings,
  prep_time_minutes,
  cook_time_minutes,
  total_time_minutes,
  additional_time_label,
  additional_time_minutes
)
values
  (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'Remove me',
    'Leave-time description',
    'recipes/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.webp',
    '[{"title":null,"items":[{"name":"rice","quantity":1,"unit":"cup","note":null}]}]',
    '[{"title":null,"steps":[{"text":"Cook."}]}]',
    2,
    5,
    20,
    25,
    'Rest',
    10
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'Keep me',
    null,
    null,
    '[]',
    '[]',
    null,
    null,
    null,
    null,
    null,
    null
  );

insert into public.household_recipe_shares (household_id, recipe_id)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444');

insert into storage.objects (bucket_id, name, owner_id)
values (
  'noomori-recipe-images',
  'recipes/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.webp',
  '22222222-2222-4222-8222-222222222222'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.get_household_settings() ->> 'shared_recipe_count',
  '2',
  'settings count the current member recipes shared to the household'
);
select is(
  public.leave_household() ->> 'status',
  'HANDOFF_PREPARED',
  'leave prepares a handoff when shared recipes exist'
);
select is(
  public.leave_household() ->> 'status',
  'HANDOFF_PREPARED',
  'retrying leave reuses the prepared handoff'
);
select ok(
  not public.recipe_handoff_image_delete_allowed(
    'recipes/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.webp'
  ),
  'preparing handoffs protect source images from deletion'
);
reset role;

select is(
  (select count(*) from public.recipe_handoffs),
  1::bigint,
  'leave retries do not duplicate the handoff'
);
select is(
  (select count(*) from public.recipe_handoff_items),
  2::bigint,
  'every shared recipe receives one snapshot item'
);
select is(
  (
    select snapshot_payload ->> 'description'
    from public.recipe_handoff_items
    where source_recipe_id = '33333333-3333-4333-8333-333333333333'
  ),
  'Leave-time description',
  'the snapshot preserves recipe content'
);
select is(
  (
    select count(*)
    from public.household_members
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'membership remains active until assets are ready'
);
select is(
  (select count(*) from public.household_recipe_shares),
  2::bigint,
  'shares remain active until finalization'
);

insert into storage.objects (bucket_id, name, owner_id)
select
  'noomori-recipe-images',
  'recipe-handoffs/' || handoff_id::text || '/' || id::text || '.webp',
  null
from public.recipe_handoff_items
where source_image_path is not null;

set local role service_role;
select is(
  public.finalize_recipe_handoff(
    '22222222-2222-4222-8222-222222222222',
    (select id from public.recipe_handoffs)
  ) ->> 'status',
  'LEFT',
  'the service finalizes leave after copied assets exist'
);
select is(
  public.finalize_recipe_handoff(
    '22222222-2222-4222-8222-222222222222',
    (select id from public.recipe_handoffs)
  ) ->> 'status',
  'LEFT',
  'finalization retries return the stored leave result'
);
reset role;

select is(
  (
    select count(*)
    from public.household_members
    where user_id = '22222222-2222-4222-8222-222222222222'
  ),
  0::bigint,
  'finalization removes the departing membership'
);
select is(
  (select count(*) from public.household_recipe_shares),
  0::bigint,
  'finalization removes only the outgoing recipe shares'
);
select is(
  (
    select count(*)
    from public.recipes
    where owner_user_id = '22222222-2222-4222-8222-222222222222'
  ),
  2::bigint,
  'the departing member retains every original recipe'
);
select ok(
  public.recipe_handoff_image_delete_allowed(
    'recipes/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.webp'
  ),
  'source image deletion is allowed after finalization'
);

select id as handoff_id from public.recipe_handoffs \gset
select id as keep_item_id
from public.recipe_handoff_items
where source_recipe_id = '44444444-4444-4444-8444-444444444444' \gset
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  jsonb_array_length(public.get_recipe_handoffs() -> 'handoffs'),
  1,
  'the current owner can list the pending handoff'
);
select is(
  public.get_household_settings() ->> 'pending_handoff_recipe_count',
  '2',
  'settings expose the owner pending recipe count'
);
select is(
  public.resolve_recipe_handoff(
    :'handoff_id'::uuid,
    'keep',
    array[:'keep_item_id'::uuid]
  ) ->> 'status',
  'OK',
  'the owner can keep one snapshot'
);
select is(
  public.resolve_recipe_handoff(
    :'handoff_id'::uuid,
    'keep',
    array[:'keep_item_id'::uuid]
  ) ->> 'status',
  'OK',
  'repeating Keep is idempotent'
);
select is(
  public.resolve_recipe_handoff(
    :'handoff_id'::uuid,
    'remove',
    array[:'keep_item_id'::uuid]
  ) ->> 'status',
  'DECISION_CONFLICT',
  'final decisions cannot be reversed'
);
select is(
  public.resolve_recipe_handoff(
    :'handoff_id'::uuid,
    'remove',
    null
  ) ->> 'handoff_status',
  'resolved',
  'resolving the final item closes the handoff'
);
reset role;

select is(
  (
    select count(*)
    from public.recipes
    where owner_user_id = '11111111-1111-4111-8111-111111111111'
      and title = 'Keep me'
  ),
  1::bigint,
  'Keep creates exactly one ordinary owner recipe'
);
select is(
  (
    select count(*)
    from public.household_recipe_shares shares
    join public.recipes recipes on recipes.id = shares.recipe_id
    where recipes.owner_user_id = '11111111-1111-4111-8111-111111111111'
      and recipes.title = 'Keep me'
  ),
  1::bigint,
  'the kept recipe is shared with the old household'
);
select is(
  (
    select asset_cleanup_path
    from public.recipe_handoff_items
    where source_recipe_id = '33333333-3333-4333-8333-333333333333'
  ),
  (
    select 'recipe-handoffs/' || handoff_id::text || '/' || id::text || '.webp'
    from public.recipe_handoff_items
    where source_recipe_id = '33333333-3333-4333-8333-333333333333'
  ),
  'Remove records the copied object for durable cleanup'
);
select is(
  (
    select count(*)
    from public.recipe_handoff_items
    where snapshot_payload is not null
  ),
  0::bigint,
  'resolved items retain decisions without retaining recipe payloads'
);
select ok(
  not has_table_privilege('authenticated', 'public.recipe_handoffs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.recipe_handoff_items', 'SELECT'),
  'handoff rows are accessible only through owner-authorized RPCs'
);

select * from finish();
rollback;
