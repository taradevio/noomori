begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.check_violation(statement text)
returns boolean
language plpgsql
as $$
begin
  execute statement;
  return false;
exception
  when check_violation then return true;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values
  ('11111111-1111-4111-8111-111111111111', 'solo@example.test', '{"full_name":"Solo owner"}'),
  ('22222222-2222-4222-8222-222222222222', 'target@example.test', '{"full_name":"Target owner"}'),
  ('33333333-3333-4333-8333-333333333333', 'crowded@example.test', '{"full_name":"Crowded owner"}'),
  ('44444444-4444-4444-8444-444444444444', 'member@example.test', '{"full_name":"Existing member"}'),
  ('55555555-5555-4555-8555-555555555555', 'new@example.test', '{"full_name":"New member"}');

update public.profiles
set onboarding_completed_at = now();

insert into public.households (id, name, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Saved kitchen', '11111111-1111-4111-8111-111111111111'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Target kitchen', '22222222-2222-4222-8222-222222222222'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Crowded kitchen', '33333333-3333-4333-8333-333333333333');

insert into public.household_members (household_id, user_id, role)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'owner'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'owner'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '33333333-3333-4333-8333-333333333333', 'owner'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444', 'member');

insert into public.recipes (id, owner_user_id, title)
values (
  '66666666-6666-4666-8666-666666666666',
  '11111111-1111-4111-8111-111111111111',
  'Saved recipe'
);

insert into public.household_recipe_shares (household_id, recipe_id)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '66666666-6666-4666-8666-666666666666'
);

insert into public.household_recipe_activities (
  household_id,
  actor_user_id,
  actor_display_name,
  action,
  recipe_id,
  recipe_title
)
values (
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111',
  'Solo owner',
  'added',
  '66666666-6666-4666-8666-666666666666',
  'Saved recipe'
);

update public.household_members
set last_seen_activity_id = (
  select max(id)
  from public.household_recipe_activities
  where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
)
where user_id = '11111111-1111-4111-8111-111111111111';

insert into public.household_join_codes (
  household_id,
  code_digest,
  created_by,
  expires_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('a', 64),
    '11111111-1111-4111-8111-111111111111',
    now() + interval '10 minutes'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    repeat('b', 64),
    '22222222-2222-4222-8222-222222222222',
    now() + interval '10 minutes'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.preview_household_join_code(repeat('b', 64)) ->> 'status',
  'OK',
  'a solo owner can preview another household'
);
select is(
  public.join_household_with_code(repeat('b', 64)) ->> 'status',
  'JOINED',
  'a solo owner can join another household'
);
reset role;

select is(
  (
    select count(*)
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  1::bigint,
  'switching keeps exactly one membership row'
);
select is(
  (
    select household_id::text
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  'the joined household becomes active'
);
select is(
  (
    select role
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'member',
  'the switched owner becomes a member'
);
select is(
  (
    select parked_household_id::text
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'the owned household is parked on the membership'
);
select is(
  (
    select last_seen_activity_id
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  null::bigint,
  'switching resets household activity state'
);
select is(
  (
    select count(*)
    from public.households
    where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  1::bigint,
  'the parked household remains stored'
);
select is(
  (
    select count(*)
    from public.recipes
    where id = '66666666-6666-4666-8666-666666666666'
  ),
  1::bigint,
  'the owner recipe remains stored'
);
select is(
  (
    select count(*)
    from public.household_recipe_shares
    where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and recipe_id = '66666666-6666-4666-8666-666666666666'
  ),
  1::bigint,
  'the parked household recipe share remains stored'
);
select is(
  (
    select count(*)
    from public.household_join_codes
    where household_id in (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
  ),
  0::bigint,
  'the parked invite is revoked and the target invite is consumed'
);

insert into public.household_recipe_shares (household_id, recipe_id)
values (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '66666666-6666-4666-8666-666666666666'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.join_household_with_code(repeat('b', 64)) ->> 'status',
  'ALREADY_MEMBER',
  'a retry recovers the current membership before checking the consumed code'
);
select is(
  public.replace_household_join_code(repeat('d', 64)) ->> 'status',
  'FORBIDDEN',
  'a parked household creator cannot generate an invite while away'
);
select is(
  public.get_household_settings() ->> 'household_name',
  'Target kitchen',
  'active household queries use the joined household'
);
select is(
  public.leave_household() ->> 'status',
  'HANDOFF_PREPARED',
  'leaving prepares shared recipes before restoring the parked household'
);
reset role;

set local role service_role;
select is(
  public.finalize_recipe_handoff(
    '11111111-1111-4111-8111-111111111111',
    (
      select id
      from public.recipe_handoffs
      where departed_user_id = '11111111-1111-4111-8111-111111111111'
    )
  ) ->> 'status',
  'RESTORED',
  'finalizing the prepared handoff restores the parked household'
);
reset role;

set local role authenticated;
select is(
  public.get_household_settings() ->> 'household_name',
  'Saved kitchen',
  'active household queries use the restored household'
);
select is(
  public.leave_household() ->> 'status',
  'OWNER_CANNOT_LEAVE',
  'retrying leave cannot leave the restored owner household'
);
reset role;

select is(
  (
    select role
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
      and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  ),
  'owner',
  'restoration returns the owner role'
);
select is(
  (
    select parked_household_id
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
  ),
  null::uuid,
  'restoration clears the parked pointer'
);
select ok(
  (
    select onboarding_completed_at is not null
    from public.profiles
    where id = '11111111-1111-4111-8111-111111111111'
  ),
  'restoration keeps onboarding complete'
);
select is(
  (
    select count(*)
    from public.household_recipe_shares
    where household_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      and recipe_id = '66666666-6666-4666-8666-666666666666'
  ),
  0::bigint,
  'leave removes the departing user recipe share from the outgoing household'
);
select is(
  (
    select count(*)
    from public.household_recipe_shares
    where household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and recipe_id = '66666666-6666-4666-8666-666666666666'
  ),
  1::bigint,
  'leave preserves the parked household recipe share'
);

insert into public.household_join_codes (
  household_id,
  code_digest,
  created_by,
  expires_at
)
values
  (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    repeat('a', 64),
    '11111111-1111-4111-8111-111111111111',
    now() + interval '10 minutes'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    repeat('b', 64),
    '22222222-2222-4222-8222-222222222222',
    now() + interval '10 minutes'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.preview_household_join_code(repeat('b', 64)) ->> 'status',
  'HOUSEHOLD_HAS_MEMBERS',
  'an owner with another member cannot preview a switch'
);
select is(
  public.join_household_with_code(repeat('b', 64)) ->> 'status',
  'HOUSEHOLD_HAS_MEMBERS',
  'an owner with another member cannot switch'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.preview_household_join_code(repeat('b', 64)) ->> 'status',
  'ALREADY_MEMBER',
  'an existing member retains preview recovery behavior'
);
select is(
  public.join_household_with_code(repeat('b', 64)) ->> 'status',
  'ALREADY_MEMBER',
  'an existing member retains join recovery behavior'
);
reset role;

select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.preview_household_join_code(repeat('a', 64)) ->> 'status',
  'ALREADY_MEMBER',
  'a solo owner cannot preview their own invite as another household'
);
select is(
  public.join_household_with_code(repeat('a', 64)) ->> 'status',
  'ALREADY_MEMBER',
  'a solo owner cannot join their own invite'
);
select is(
  public.join_household_with_code(repeat('f', 64)) ->> 'status',
  'INVALID_OR_EXPIRED',
  'a failed switch reports an invalid credential'
);
select is(
  public.join_household_with_code(repeat('f', 64)) ->> 'status',
  'INVALID_OR_EXPIRED',
  'a failed switch can be retried without changing membership'
);
reset role;

select is(
  (
    select count(*)
    from public.household_members
    where user_id = '11111111-1111-4111-8111-111111111111'
      and household_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
      and role = 'owner'
      and parked_household_id is null
  ),
  1::bigint,
  'failed joins leave the solo owner membership unchanged'
);
select is(
  (
    select count(*)
    from public.household_join_codes
    where household_id in (
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    )
  ),
  2::bigint,
  'rejected and failed joins leave invites unchanged'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  public.join_household_with_code(repeat('b', 64)) ->> 'status',
  'JOINED',
  'a user without a household continues to join normally'
);
select is(
  public.leave_household() ->> 'status',
  'LEFT',
  'a member without a parked household continues to leave normally'
);
select is(
  public.leave_household() ->> 'status',
  'NO_HOUSEHOLD',
  'retrying ordinary leave cannot affect another household'
);
reset role;

select is(
  (
    select count(*)
    from public.household_members
    where user_id = '55555555-5555-4555-8555-555555555555'
  ),
  0::bigint,
  'ordinary leave deletes the membership'
);
select ok(
  (
    select onboarding_completed_at is null
    from public.profiles
    where id = '55555555-5555-4555-8555-555555555555'
  ),
  'ordinary leave clears onboarding completion'
);

select ok(
  pg_temp.check_violation($sql$
    update public.household_members
    set parked_household_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    where user_id = '11111111-1111-4111-8111-111111111111'
  $sql$),
  'only member memberships may park a household'
);
select ok(
  pg_temp.check_violation($sql$
    update public.household_members
    set role = 'member',
        parked_household_id = household_id
    where user_id = '11111111-1111-4111-8111-111111111111'
  $sql$),
  'the parked household must differ from the active household'
);
select ok(
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'household_members'
      and indexname = 'household_members_one_household_per_user'
      and indexdef like '%UNIQUE INDEX%'
  ),
  'the one-membership-per-user unique index remains in place'
);

select * from finish();
rollback;
