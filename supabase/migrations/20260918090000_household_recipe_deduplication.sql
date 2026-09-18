begin;

create or replace function private.prevent_household_recipe_duplicate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_recipe_core jsonb;
begin
  select private.normalize_recipe_core_json(
    pg_catalog.jsonb_build_array(
      recipes.title,
      recipes.ingredients,
      recipes.instructions
    )
  )
  into v_recipe_core
  from public.recipes recipes
  where recipes.id = new.recipe_id;

  if not found then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(new.household_id::text),
    pg_catalog.hashtext(v_recipe_core::text)
  );

  -- ponytail: scan one household's shares; add a stored fingerprint index only
  -- if share latency becomes measurable.
  if exists (
    select 1
    from public.household_recipe_shares shares
    join public.recipes recipes on recipes.id = shares.recipe_id
    where shares.household_id = new.household_id
      and shares.recipe_id <> new.recipe_id
      and private.normalize_recipe_core_json(
        pg_catalog.jsonb_build_array(
          recipes.title,
          recipes.ingredients,
          recipes.instructions
        )
      ) = v_recipe_core
  ) then
    raise exception 'duplicate household recipe' using errcode = 'NM002';
  end if;

  return new;
end;
$function$;

drop trigger if exists prevent_household_recipe_duplicate
on public.household_recipe_shares;
create trigger prevent_household_recipe_duplicate
before insert on public.household_recipe_shares
for each row
execute function private.prevent_household_recipe_duplicate();

revoke all on function private.prevent_household_recipe_duplicate()
from public, anon, authenticated;
grant execute on function private.prevent_household_recipe_duplicate()
to postgres;

commit;
