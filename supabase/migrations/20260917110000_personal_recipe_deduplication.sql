begin;

create or replace function private.normalize_recipe_core_json(p_value jsonb)
returns jsonb
language plpgsql
immutable
security definer
set search_path to ''
as $function$
begin
  case pg_catalog.jsonb_typeof(p_value)
    when 'string' then
      return pg_catalog.to_jsonb(
        pg_catalog.lower(
          pg_catalog.regexp_replace(
            pg_catalog.btrim(p_value #>> '{}'),
            '[[:space:]]+',
            ' ',
            'g'
          )
        )
      );
    when 'array' then
      return coalesce(
        (
          select pg_catalog.jsonb_agg(
            private.normalize_recipe_core_json(item.value)
            order by item.ordinality
          )
          from pg_catalog.jsonb_array_elements(p_value)
            with ordinality as item(value, ordinality)
        ),
        '[]'::jsonb
      );
    when 'object' then
      return coalesce(
        (
          select pg_catalog.jsonb_object_agg(
            entry.key,
            private.normalize_recipe_core_json(entry.value)
          )
          from pg_catalog.jsonb_each(p_value) as entry(key, value)
        ),
        '{}'::jsonb
      );
    else
      return p_value;
  end case;
end;
$function$;

create or replace function private.prevent_personal_recipe_duplicate()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if tg_op = 'UPDATE'
    and old.owner_user_id is not distinct from new.owner_user_id
    and old.title is not distinct from new.title
    and old.ingredients is not distinct from new.ingredients
    and old.instructions is not distinct from new.instructions
  then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('personal_recipe'),
    pg_catalog.hashtext(new.owner_user_id::text)
  );

  -- ponytail: scan one owner's library; add a stored fingerprint index only
  -- if recipe-save latency becomes measurable.
  if exists (
    select 1
    from public.recipes recipes
    where recipes.owner_user_id = new.owner_user_id
      and recipes.id <> new.id
      and private.normalize_recipe_core_json(
        pg_catalog.to_jsonb(recipes.title)
      ) = private.normalize_recipe_core_json(pg_catalog.to_jsonb(new.title))
      and private.normalize_recipe_core_json(recipes.ingredients)
        = private.normalize_recipe_core_json(new.ingredients)
      and private.normalize_recipe_core_json(recipes.instructions)
        = private.normalize_recipe_core_json(new.instructions)
  ) then
    raise exception 'duplicate personal recipe' using errcode = 'NM001';
  end if;

  return new;
end;
$function$;

drop trigger if exists prevent_personal_recipe_duplicate on public.recipes;
create trigger prevent_personal_recipe_duplicate
before insert or update of owner_user_id, title, ingredients, instructions
on public.recipes
for each row
execute function private.prevent_personal_recipe_duplicate();

revoke all on function private.normalize_recipe_core_json(jsonb)
from public, anon, authenticated;
grant execute on function private.normalize_recipe_core_json(jsonb)
to postgres;

revoke all on function private.prevent_personal_recipe_duplicate()
from public, anon, authenticated;
grant execute on function private.prevent_personal_recipe_duplicate()
to postgres;

commit;
