begin;

create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.rejects_servings(value integer)
returns boolean
language plpgsql
as $$
begin
  insert into public.recipes (owner_user_id, title, servings)
  values ('11111111-1111-4111-8111-111111111111', 'Invalid servings', value);
  return false;
exception
  when check_violation then return true;
end;
$$;

select is(
  (
    select is_nullable::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'servings'
  ),
  'YES',
  'recipe servings are nullable'
);

select is(
  (
    select column_default::text
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'recipes'
      and column_name = 'servings'
  ),
  null::text,
  'recipe servings have no database default'
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-1111-4111-8111-111111111111',
  'servings@example.test',
  '{"full_name":"Servings Test"}'
);

insert into public.recipes (owner_user_id, title)
values ('11111111-1111-4111-8111-111111111111', 'Unknown servings');

insert into public.recipes (owner_user_id, title, servings)
values ('11111111-1111-4111-8111-111111111111', 'Exact servings', 4);

select is(
  (select servings from public.recipes where title = 'Unknown servings'),
  null::integer,
  'omitted servings remain null'
);

select is(
  (select servings from public.recipes where title = 'Exact servings'),
  4,
  'positive servings are preserved'
);

select ok(pg_temp.rejects_servings(0), 'zero servings are rejected');
select ok(pg_temp.rejects_servings(-1), 'negative servings are rejected');

select * from finish();
rollback;
