begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'first-owner@example.test', '{"full_name":"First owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'first-member@example.test', '{"full_name":"First member"}'),
  ('33333333-3333-4333-8333-333333333333', 'second-owner@example.test', '{"full_name":"Second owner"}'),
  ('44444444-4444-4444-8444-444444444444', 'second-member@example.test', '{"full_name":"Second member"}');

update public.profiles set onboarding_completed_at = now();

insert into public.households (id, name, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'First kitchen', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Second kitchen', '33333333-3333-4333-8333-333333333333');

insert into public.household_members (household_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'member'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '33333333-3333-4333-8333-333333333333', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'member');

insert into public.recipes (id, owner_user_id, title, ingredients, instructions)
values
  (
    '55555555-5555-4555-8555-555555555555',
    '11111111-1111-4111-8111-111111111111',
    'Tomato Soup',
    '[{"title":null,"items":[{"name":"tomato","quantity":2,"unit":null,"note":null}]}]',
    '[{"title":null,"steps":[{"text":"Simmer gently."}]}]'
  ),
  (
    '66666666-6666-4666-8666-666666666666',
    '22222222-2222-4222-8222-222222222222',
    '  TOMATO   soup ',
    '[{"title":null,"items":[{"name":" TOMATO ","quantity":2,"unit":null,"note":null}]}]',
    '[{"title":null,"steps":[{"text":" simmer   GENTLY. "}]}]'
  ),
  (
    '77777777-7777-4777-8777-777777777777',
    '22222222-2222-4222-8222-222222222222',
    'Tomato Soup',
    '[{"title":null,"items":[{"name":"tomato","quantity":2,"unit":null,"note":null}]}]',
    '[{"title":null,"steps":[{"text":"Roast first."}]}]'
  ),
  (
    '88888888-8888-4888-8888-888888888888',
    '33333333-3333-4333-8333-333333333333',
    'tomato soup',
    '[{"title":null,"items":[{"name":"tomato","quantity":2,"unit":null,"note":null}]}]',
    '[{"title":null,"steps":[{"text":"Simmer gently."}]}]'
  ),
  (
    '99999999-9999-4999-8999-999999999999',
    '22222222-2222-4222-8222-222222222222',
    'Shared stew',
    '[]',
    '[{"title":null,"steps":[{"text":"Cook the stew."}]}]'
  ),
  (
    'aaaaaaaa-0000-4000-8000-000000000001',
    '22222222-2222-4222-8222-222222222222',
    'Unrelated handoff source',
    '[]',
    '[]'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared('55555555-5555-4555-8555-555555555555', true) ->> 'status',
  'OK',
  'the first semantic copy can be shared'
);
select is(
  public.set_recipe_household_shared('55555555-5555-4555-8555-555555555555', true) ->> 'status',
  'OK',
  'sharing the same recipe remains idempotent'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select throws_ok(
  $$
    select public.set_recipe_household_shared(
      '66666666-6666-4666-8666-666666666666',
      true
    )
  $$,
  'NM002',
  'duplicate household recipe',
  'another owner cannot share the same normalized recipe core'
);
select is(
  public.set_recipe_household_shared('77777777-7777-4777-8777-777777777777', true) ->> 'status',
  'OK',
  'a recipe with different core content remains shareable'
);
select is(
  public.set_recipe_household_shared('99999999-9999-4999-8999-999999999999', true) ->> 'status',
  'OK',
  'a distinct recipe can be shared for handoff collision coverage'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared('88888888-8888-4888-8888-888888888888', true) ->> 'status',
  'OK',
  'the same recipe core can be shared to a different household'
);
reset role;

insert into public.recipe_handoffs (
  id,
  household_id,
  departed_user_id,
  departed_user_display_name,
  departure_membership_id,
  departure_joined_at,
  status
) values (
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '22222222-2222-4222-8222-222222222222',
  'First member',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
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
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  'aaaaaaaa-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', ' SHARED  STEW ',
    'description', null,
    'ingredients', '[]'::jsonb,
    'instructions', '[{"title":null,"steps":[{"text":" cook  THE stew. "}]}]'::jsonb,
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
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      'keep',
      array['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'::uuid]
    )
  $$,
  'NM002',
  'duplicate household recipe',
  'keeping a handoff cannot introduce a duplicate household recipe'
);
reset role;

select is(
  (
    select decision
    from public.recipe_handoff_items
    where id = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  ),
  'pending',
  'a rejected duplicate handoff remains pending without a partial copy'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared('55555555-5555-4555-8555-555555555555', false) ->> 'status',
  'OK',
  'the first semantic copy can be unshared'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.set_recipe_household_shared('66666666-6666-4666-8666-666666666666', true) ->> 'status',
  'OK',
  'unsharing the winner releases the normalized recipe core'
);
reset role;

select is(
  (
    select count(*)
    from public.household_recipe_shares shares
    where shares.household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and shares.recipe_id in (
        '55555555-5555-4555-8555-555555555555',
        '66666666-6666-4666-8666-666666666666'
      )
  ),
  1::bigint,
  'only one equivalent recipe is shared with the household'
);

select * from finish();
rollback;
