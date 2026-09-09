begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.rejects_recipe_time(
  total_minutes integer,
  additional_label text,
  additional_minutes integer
)
returns boolean
language plpgsql
as $$
begin
  insert into public.recipes (
    owner_user_id,
    title,
    total_time_minutes,
    additional_time_label,
    additional_time_minutes
  ) values (
    '11111111-1111-4111-8111-111111111111',
    'Invalid timing',
    total_minutes,
    additional_label,
    additional_minutes
  );
  return false;
exception
  when check_violation then return true;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-1111-4111-8111-111111111111',
  'timing@example.test',
  '{"full_name":"Timing Test"}'
);

insert into public.recipes (owner_user_id, title)
values ('11111111-1111-4111-8111-111111111111', 'Legacy timing');

insert into public.recipes (
  owner_user_id,
  title,
  total_time_minutes,
  additional_time_label,
  additional_time_minutes
) values (
  '11111111-1111-4111-8111-111111111111',
  'Complete timing',
  75,
  'Rest',
  15
);

select is(
  (select total_time_minutes from public.recipes where title = 'Legacy timing'),
  null::integer,
  'legacy recipes keep nullable timing metadata'
);
select is(
  (select additional_time_label from public.recipes where title = 'Complete timing'),
  'Rest',
  'valid additional timing is preserved'
);
select ok(
  pg_temp.rejects_recipe_time(-1, null, null),
  'negative total time is rejected'
);
select ok(
  pg_temp.rejects_recipe_time(null, 'Rest', null),
  'an additional label without minutes is rejected'
);
select ok(
  pg_temp.rejects_recipe_time(null, null, 15),
  'additional minutes without a label are rejected'
);
select ok(
  pg_temp.rejects_recipe_time(null, repeat('x', 41), 15),
  'additional labels longer than 40 characters are rejected'
);
select ok(
  pg_temp.rejects_recipe_time(null, ' Rest ', 15),
  'additional labels must be trimmed'
);

select * from finish();
rollback;
