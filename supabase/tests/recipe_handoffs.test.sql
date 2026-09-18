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
  (
    select count(*)
    from public.recipe_handoffs
    where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and departed_user_id = '22222222-2222-4222-8222-222222222222'
  ),
  1::bigint,
  'leave retries do not duplicate the handoff'
);
select is(
  (
    select count(*)
    from public.recipe_handoff_items items
    join public.recipe_handoffs handoffs on handoffs.id = items.handoff_id
    where handoffs.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and handoffs.departed_user_id = '22222222-2222-4222-8222-222222222222'
  ),
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
  (
    select count(*)
    from public.household_recipe_shares
    where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  2::bigint,
  'shares remain active until finalization'
);

insert into storage.objects (bucket_id, name, owner_id)
select
  'noomori-recipe-images',
  'recipe-handoffs/' || items.handoff_id::text || '/' || items.id::text || '.webp',
  null
from public.recipe_handoff_items items
join public.recipe_handoffs handoffs on handoffs.id = items.handoff_id
where handoffs.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and handoffs.departed_user_id = '22222222-2222-4222-8222-222222222222'
  and handoffs.status = 'preparing'
  and items.source_image_path is not null;

set local role service_role;
select is(
  public.finalize_recipe_handoff(
    '22222222-2222-4222-8222-222222222222',
    (
      select id
      from public.recipe_handoffs
      where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        and departed_user_id = '22222222-2222-4222-8222-222222222222'
        and status = 'preparing'
    )
  ) ->> 'status',
  'LEFT',
  'the service finalizes leave after copied assets exist'
);
select is(
  public.finalize_recipe_handoff(
    '22222222-2222-4222-8222-222222222222',
    (
      select id
      from public.recipe_handoffs
      where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        and departed_user_id = '22222222-2222-4222-8222-222222222222'
    )
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
  (
    select count(*)
    from public.household_recipe_shares
    where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
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

select id as handoff_id
from public.recipe_handoffs
where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  and departed_user_id = '22222222-2222-4222-8222-222222222222' \gset
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
    from public.recipe_handoff_items items
    join public.recipe_handoffs handoffs on handoffs.id = items.handoff_id
    where handoffs.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and handoffs.departed_user_id = '22222222-2222-4222-8222-222222222222'
      and items.snapshot_payload is not null
  ),
  0::bigint,
  'resolved items retain decisions without retaining recipe payloads'
);

select kept_recipe_id as first_kept_recipe_id
from public.recipe_handoff_items
where source_recipe_id = '44444444-4444-4444-8444-444444444444' \gset

insert into public.household_members (household_id, user_id, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'member'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(
    '33333333-3333-4333-8333-333333333333',
    true
  ) ->> 'status',
  'OK',
  'an original without a kept household copy can be shared again'
);
select is(
  public.set_recipe_household_shared(
    '44444444-4444-4444-8444-444444444444',
    true
  ) ->> 'status',
  'DUPLICATE_RECIPE',
  'a shared kept copy blocks the returning member original'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(:'first_kept_recipe_id'::uuid, false) ->> 'status',
  'OK',
  'the owner can unshare the kept copy'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(
    '44444444-4444-4444-8444-444444444444',
    true
  ) ->> 'status',
  'OK',
  'unsharing the kept copy releases the original lineage'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(:'first_kept_recipe_id'::uuid, true) ->> 'status',
  'DUPLICATE_RECIPE',
  'the shared original also blocks the owner kept copy'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.leave_household() ->> 'status',
  'HANDOFF_PREPARED',
  'a second leave prepares a distinct handoff for the re-shared originals'
);
reset role;

select id as second_handoff_id
from public.recipe_handoffs
where departed_user_id = '22222222-2222-4222-8222-222222222222'
  and status = 'preparing' \gset

insert into storage.objects (bucket_id, name, owner_id)
select
  'noomori-recipe-images',
  'recipe-handoffs/' || handoff_id::text || '/' || id::text || '.webp',
  null
from public.recipe_handoff_items
where handoff_id = :'second_handoff_id'::uuid
  and source_image_path is not null;

set local role service_role;
select is(
  public.finalize_recipe_handoff(
    '22222222-2222-4222-8222-222222222222',
    :'second_handoff_id'::uuid
  ) ->> 'status',
  'LEFT',
  'the second leave finalizes normally'
);
reset role;

select id as second_image_item_id
from public.recipe_handoff_items
where handoff_id = :'second_handoff_id'::uuid
  and source_recipe_id = '33333333-3333-4333-8333-333333333333' \gset
select id as second_plain_item_id
from public.recipe_handoff_items
where handoff_id = :'second_handoff_id'::uuid
  and source_recipe_id = '44444444-4444-4444-8444-444444444444' \gset

insert into public.household_members (household_id, user_id, role)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'member'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(
    '33333333-3333-4333-8333-333333333333',
    true
  ) ->> 'status',
  'OK',
  'sharing the original wins over its pending review snapshot'
);
reset role;

select is(
  (
    select decision
    from public.recipe_handoff_items
    where id = :'second_image_item_id'::uuid
  ),
  'remove',
  'sharing the original withdraws its pending review item'
);
select is(
  (
    select asset_cleanup_path
    from public.recipe_handoff_items
    where id = :'second_image_item_id'::uuid
  ),
  'recipe-handoffs/' || :'second_handoff_id' || '/' || :'second_image_item_id' || '.webp',
  'withdrawing a pending image records its isolated asset for cleanup'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(
    '44444444-4444-4444-8444-444444444444',
    true
  ) ->> 'status',
  'OK',
  'sharing the final original withdraws the remaining pending snapshot'
);
reset role;

select is(
  (
    select status
    from public.recipe_handoffs
    where id = :'second_handoff_id'::uuid
  ),
  'resolved',
  'withdrawing the last pending item resolves the handoff'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.resolve_recipe_handoff(
    :'second_handoff_id'::uuid,
    'keep',
    array[:'second_plain_item_id'::uuid]
  ) ->> 'status',
  'DUPLICATE_RECIPE',
  'a stale owner Keep cannot duplicate the newly shared original'
);
select is(
  public.set_recipe_household_shared(:'first_kept_recipe_id'::uuid, true) ->> 'status',
  'DUPLICATE_RECIPE',
  'the owner still cannot share another copy while the original is active'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(
    '44444444-4444-4444-8444-444444444444',
    false
  ) ->> 'status',
  'OK',
  'the returning member can unshare the winning original'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(:'first_kept_recipe_id'::uuid, true) ->> 'status',
  'OK',
  'unsharing the original releases the kept copy lineage'
);
reset role;

select is(
  (
    select count(*)
    from public.household_recipe_shares shares
    where shares.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and (
        shares.recipe_id = '44444444-4444-4444-8444-444444444444'
        or shares.recipe_id in (
          select kept_recipe_id
          from public.recipe_handoff_items
          where source_recipe_id = '44444444-4444-4444-8444-444444444444'
        )
      )
  ),
  1::bigint,
  'exactly one representation of a recipe lineage is shared'
);

insert into public.recipes (id, owner_user_id, title, instructions)
values (
  '77777777-7777-4777-8777-777777777777',
  '22222222-2222-4222-8222-222222222222',
  'Keep me',
  '[{"title":null,"steps":[{"text":"New method."}]}]'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared(
    '77777777-7777-4777-8777-777777777777',
    true
  ) ->> 'status',
  'OK',
  'an unrelated recipe with the same title is not treated as a duplicate'
);
reset role;

select throws_ok(
  $$
    insert into public.recipes (id, owner_user_id, title, instructions)
    values (
      '88888888-8888-4888-8888-888888888888',
      '22222222-2222-4222-8222-222222222222',
      '  keep   ME  ',
      '[{"title":null,"steps":[{"text":"  new   METHOD. "}]}]'
    )
  $$,
  'NM001',
  'duplicate personal recipe',
  'normalized personal recipe cores cannot be inserted twice'
);

insert into public.recipes (id, owner_user_id, title, instructions)
values (
  '88888888-8888-4888-8888-888888888888',
  '11111111-1111-4111-8111-111111111111',
  '  keep   ME  ',
  '[{"title":null,"steps":[{"text":"  new   METHOD. "}]}]'
);

select ok(
  exists (
    select 1
    from public.recipes
    where id = '88888888-8888-4888-8888-888888888888'
  ),
  'different owners may keep the same recipe core'
);

insert into public.recipes (id, owner_user_id, title, instructions)
values (
  '99999999-9999-4999-8999-999999999999',
  '22222222-2222-4222-8222-222222222222',
  'Another recipe',
  '[{"title":null,"steps":[{"text":"New method."}]}]'
);

select throws_ok(
  $$
    update public.recipes
    set title = 'KEEP ME'
    where id = '99999999-9999-4999-8999-999999999999'
  $$,
  'NM001',
  'duplicate personal recipe',
  'an edit cannot make two personal recipe cores identical'
);

update public.recipes
set description = 'Non-core edits remain allowed'
where id = '77777777-7777-4777-8777-777777777777';

select is(
  (
    select description
    from public.recipes
    where id = '77777777-7777-4777-8777-777777777777'
  ),
  'Non-core edits remain allowed',
  'non-core edits do not run duplicate detection'
);

insert into public.recipe_handoffs (
  id,
  household_id,
  departed_user_id,
  departed_user_display_name,
  departure_membership_id,
  departure_joined_at,
  status
) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'Departed member',
  'dddddddd-dddd-4ddd-8ddd-eeeeeeeeeeee',
  now(),
  'pending'
);

insert into public.recipe_handoff_items (
  id,
  handoff_id,
  source_recipe_id,
  snapshot_payload
) values (
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'ffffffff-ffff-4fff-8fff-ffffffffffff',
  jsonb_build_object(
    'title', 'KEEP ME',
    'description', null,
    'ingredients', '[]'::jsonb,
    'instructions', '[{"title":null,"steps":[{"text":"new method."}]}]'::jsonb,
    'source_type', 'my_recipe',
    'source_url', null,
    'servings', 1,
    'nutrition_per_serving', null,
    'prep_time_minutes', null,
    'cook_time_minutes', null,
    'source_person_name', null,
    'total_time_minutes', null,
    'additional_time_label', null,
    'additional_time_minutes', null
  )
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.resolve_recipe_handoff(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      'keep',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid]
    )
  $$,
  'NM001',
  'duplicate personal recipe',
  'a handoff copy cannot duplicate the owner personal library'
);
reset role;

select is(
  (
    select decision
    from public.recipe_handoff_items
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  'pending',
  'a rejected duplicate handoff remains pending without partial resolution'
);

select ok(
  not has_table_privilege('authenticated', 'public.recipe_handoffs', 'SELECT')
  and not has_table_privilege('authenticated', 'public.recipe_handoff_items', 'SELECT'),
  'handoff rows are accessible only through owner-authorized RPCs'
);

select * from finish();
rollback;
