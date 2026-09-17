begin;

create table public.recipe_handoffs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  departed_user_id uuid references auth.users(id) on delete set null,
  departed_user_display_name text not null,
  departure_membership_id uuid not null,
  departure_joined_at timestamptz not null,
  restored_household_id uuid references public.households(id),
  status text not null default 'preparing'
    check (status in ('preparing', 'pending', 'resolved')),
  leave_result jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (departure_membership_id, departure_joined_at)
);

create table public.recipe_handoff_items (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null references public.recipe_handoffs(id) on delete cascade,
  source_recipe_id uuid not null,
  snapshot_schema_version integer not null default 1
    check (snapshot_schema_version = 1),
  snapshot_payload jsonb,
  source_image_path text,
  copied_image_path text,
  asset_cleanup_path text,
  decision text not null default 'pending'
    check (decision in ('pending', 'keep', 'remove')),
  kept_recipe_id uuid references public.recipes(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (handoff_id, source_recipe_id),
  check (
    (decision = 'pending' and snapshot_payload is not null and decided_at is null)
    or (decision <> 'pending' and snapshot_payload is null and decided_at is not null)
  ),
  check (decision = 'keep' or kept_recipe_id is null),
  check (decision = 'remove' or asset_cleanup_path is null)
);

alter table public.recipe_handoffs enable row level security;
alter table public.recipe_handoff_items enable row level security;

revoke all on table public.recipe_handoffs, public.recipe_handoff_items
from public, anon, authenticated;

grant select, update on table public.recipe_handoff_items to service_role;

create or replace function public.recipe_handoff_image_delete_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select not exists (
    select 1
    from public.recipe_handoff_items items
    join public.recipe_handoffs handoffs on handoffs.id = items.handoff_id
    where handoffs.status = 'preparing'
      and items.source_image_path = p_path
  );
$function$;

revoke all on function public.recipe_handoff_image_delete_allowed(text)
from public, anon;
grant execute on function public.recipe_handoff_image_delete_allowed(text)
to authenticated, service_role;

drop policy if exists "recipe owners can read images" on storage.objects;
drop policy if exists "household members can read recipe images" on storage.objects;
drop policy if exists "recipe image object owners can delete" on storage.objects;

create policy "recipe readers can read images"
on storage.objects for select to authenticated
using (
  bucket_id = 'noomori-recipe-images'
  and (
    exists (
      select 1
      from public.recipes recipes
      where recipes.owner_user_id = auth.uid()
        and (
          recipes.image_path = storage.objects.name
          or recipes.id::text = (storage.foldername(storage.objects.name))[3]
        )
    )
    or exists (
      select 1
      from public.recipes recipes
      join public.household_recipe_shares shares on shares.recipe_id = recipes.id
      join public.household_members members
        on members.household_id = shares.household_id
      where recipes.image_path = storage.objects.name
        and members.user_id = auth.uid()
    )
  )
);

create policy "recipe image object owners can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'noomori-recipe-images'
  and owner_id = auth.uid()::text
  and public.recipe_handoff_image_delete_allowed(name)
);

create or replace function public.get_household_settings()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_household_name text;
  v_role text;
  v_members jsonb;
  v_code_expires_at timestamptz;
  v_shared_recipe_count integer;
  v_pending_handoff_recipe_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select hm.household_id, h.name, hm.role
  into v_household_id, v_household_name, v_role
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'NO_HOUSEHOLD');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', members.user_id,
        'display_name', coalesce(
          nullif(btrim(to_jsonb(profiles) ->> 'display_name'), ''),
          nullif(btrim(to_jsonb(profiles) ->> 'full_name'), ''),
          nullif(btrim(to_jsonb(profiles) ->> 'name'), ''),
          nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
          nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
          case
            when members.role = 'owner' then 'Household owner'
            else 'Household member'
          end
        ),
        'role', members.role
      )
      order by (members.role = 'owner') desc, members.joined_at, members.user_id
    ),
    '[]'::jsonb
  )
  into v_members
  from public.household_members members
  left join public.profiles profiles on profiles.id = members.user_id
  left join auth.users users on users.id = members.user_id
  where members.household_id = v_household_id;

  select count(*)::integer
  into v_shared_recipe_count
  from public.household_recipe_shares shares
  join public.recipes recipes on recipes.id = shares.recipe_id
  where shares.household_id = v_household_id
    and recipes.owner_user_id = v_user_id;

  if v_role = 'owner' then
    select expires_at
    into v_code_expires_at
    from public.household_join_codes
    where household_id = v_household_id
      and expires_at > now();

    select count(*)::integer
    into v_pending_handoff_recipe_count
    from public.recipe_handoffs handoffs
    join public.recipe_handoff_items items on items.handoff_id = handoffs.id
    where handoffs.household_id = v_household_id
      and handoffs.status = 'pending'
      and items.decision = 'pending';
  end if;

  return jsonb_build_object(
    'status', 'OK',
    'household_id', v_household_id,
    'household_name', v_household_name,
    'role', v_role,
    'member_count', jsonb_array_length(v_members),
    'members', v_members,
    'active_code_expires_at', v_code_expires_at,
    'shared_recipe_count', v_shared_recipe_count,
    'pending_handoff_recipe_count', v_pending_handoff_recipe_count
  );
end;
$function$;

create or replace function public.leave_household()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
  v_joined_at timestamptz;
  v_household_id uuid;
  v_parked_household_id uuid;
  v_parked_household_name text;
  v_role text;
  v_recipe_count integer;
  v_handoff_id uuid;
  v_handoff_status text;
  v_copy_tasks jsonb;
  v_display_name text;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'profile not found' using errcode = '23503';
  end if;

  select id, joined_at, household_id, parked_household_id, role
  into v_membership_id, v_joined_at, v_household_id, v_parked_household_id, v_role
  from public.household_members
  where user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'NO_HOUSEHOLD');
  end if;

  if v_role = 'owner' then
    return jsonb_build_object('status', 'OWNER_CANNOT_LEAVE');
  end if;

  perform recipes.id
  from public.recipes recipes
  join public.household_recipe_shares shares on shares.recipe_id = recipes.id
  where shares.household_id = v_household_id
    and recipes.owner_user_id = v_user_id
  for update of recipes;

  select count(*)::integer
  into v_recipe_count
  from public.recipes recipes
  join public.household_recipe_shares shares on shares.recipe_id = recipes.id
  where shares.household_id = v_household_id
    and recipes.owner_user_id = v_user_id;

  if v_recipe_count > 0 then
    select coalesce(
      nullif(btrim(to_jsonb(profiles) ->> 'display_name'), ''),
      nullif(btrim(users.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(users.raw_user_meta_data ->> 'name'), ''),
      'Former household member'
    )
    into v_display_name
    from public.profiles profiles
    left join auth.users users on users.id = profiles.id
    where profiles.id = v_user_id;

    insert into public.recipe_handoffs (
      household_id,
      departed_user_id,
      departed_user_display_name,
      departure_membership_id,
      departure_joined_at,
      restored_household_id
    )
    values (
      v_household_id,
      v_user_id,
      v_display_name,
      v_membership_id,
      v_joined_at,
      v_parked_household_id
    )
    on conflict (departure_membership_id, departure_joined_at)
    do update set departure_membership_id = excluded.departure_membership_id
    returning id, status into v_handoff_id, v_handoff_status;

    if v_handoff_status <> 'preparing' then
      return jsonb_build_object('status', 'HANDOFF_ALREADY_FINALIZED');
    end if;

    insert into public.recipe_handoff_items (
      handoff_id,
      source_recipe_id,
      snapshot_payload,
      source_image_path
    )
    select
      v_handoff_id,
      recipes.id,
      jsonb_build_object(
        'title', recipes.title,
        'description', recipes.description,
        'ingredients', recipes.ingredients,
        'instructions', recipes.instructions,
        'servings', recipes.servings,
        'nutrition_per_serving', recipes.nutrition_per_serving,
        'prep_time_minutes', recipes.prep_time_minutes,
        'cook_time_minutes', recipes.cook_time_minutes,
        'total_time_minutes', recipes.total_time_minutes,
        'additional_time_label', recipes.additional_time_label,
        'additional_time_minutes', recipes.additional_time_minutes,
        'source_type', recipes.source_type,
        'source_person_name', recipes.source_person_name,
        'source_url', recipes.source_url
      ),
      recipes.image_path
    from public.recipes recipes
    join public.household_recipe_shares shares on shares.recipe_id = recipes.id
    where shares.household_id = v_household_id
      and recipes.owner_user_id = v_user_id
    on conflict (handoff_id, source_recipe_id) do nothing;

    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', items.id,
          'source_path', items.source_image_path,
          'destination_path', case
            when items.source_image_path is null then null
            else 'recipe-handoffs/' || v_handoff_id::text || '/' || items.id::text || '.webp'
          end
        )
        order by items.created_at, items.id
      ),
      '[]'::jsonb
    )
    into v_copy_tasks
    from public.recipe_handoff_items items
    where items.handoff_id = v_handoff_id;

    return jsonb_build_object(
      'status', 'HANDOFF_PREPARED',
      'handoff_id', v_handoff_id,
      'recipe_count', v_recipe_count,
      'copy_tasks', v_copy_tasks
    );
  end if;

  delete from public.household_recipe_shares shares
  using public.recipes recipes
  where shares.household_id = v_household_id
    and shares.recipe_id = recipes.id
    and recipes.owner_user_id = v_user_id;

  if v_parked_household_id is not null then
    select name into v_parked_household_name
    from public.households
    where id = v_parked_household_id;

    if not found then
      raise exception 'parked household not found' using errcode = '23503';
    end if;

    update public.household_members
    set household_id = v_parked_household_id,
        parked_household_id = null,
        role = 'owner',
        joined_at = now(),
        last_seen_activity_id = null
    where id = v_membership_id;

    update public.profiles
    set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
        updated_at = now()
    where id = v_user_id;

    return jsonb_build_object(
      'status', 'RESTORED',
      'household', jsonb_build_object(
        'id', v_parked_household_id,
        'name', v_parked_household_name
      )
    );
  end if;

  delete from public.household_members where id = v_membership_id;

  update public.profiles
  set onboarding_completed_at = null,
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object('status', 'LEFT', 'household', null);
end;
$function$;

create or replace function public.finalize_recipe_handoff(
  p_user_id uuid,
  p_handoff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_handoff public.recipe_handoffs%rowtype;
  v_membership public.household_members%rowtype;
  v_household_name text;
  v_result jsonb;
begin
  select * into v_handoff
  from public.recipe_handoffs
  where id = p_handoff_id
  for update;

  if not found or v_handoff.departed_user_id is distinct from p_user_id then
    return jsonb_build_object('status', 'HANDOFF_NOT_FOUND');
  end if;

  if v_handoff.status <> 'preparing' then
    return coalesce(v_handoff.leave_result, jsonb_build_object('status', 'HANDOFF_ALREADY_FINALIZED'));
  end if;

  if exists (
    select 1
    from public.recipe_handoff_items items
    where items.handoff_id = p_handoff_id
      and items.source_image_path is not null
      and not exists (
        select 1
        from storage.objects objects
        where objects.bucket_id = 'noomori-recipe-images'
          and objects.name = 'recipe-handoffs/' || p_handoff_id::text || '/' || items.id::text || '.webp'
      )
  ) then
    return jsonb_build_object('status', 'ASSETS_NOT_READY');
  end if;

  update public.recipe_handoff_items items
  set copied_image_path = case
    when source_image_path is null then null
    else 'recipe-handoffs/' || p_handoff_id::text || '/' || id::text || '.webp'
  end
  where items.handoff_id = p_handoff_id;

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'profile not found' using errcode = '23503';
  end if;

  select * into v_membership
  from public.household_members
  where id = v_handoff.departure_membership_id
    and user_id = p_user_id
    and household_id = v_handoff.household_id
    and joined_at = v_handoff.departure_joined_at
  for update;

  if not found then
    return jsonb_build_object('status', 'MEMBERSHIP_CHANGED');
  end if;

  if v_membership.parked_household_id is distinct from v_handoff.restored_household_id then
    return jsonb_build_object('status', 'MEMBERSHIP_CHANGED');
  end if;

  delete from public.household_recipe_shares shares
  using public.recipes recipes
  where shares.household_id = v_handoff.household_id
    and shares.recipe_id = recipes.id
    and recipes.owner_user_id = p_user_id;

  if v_handoff.restored_household_id is not null then
    select name into v_household_name
    from public.households
    where id = v_handoff.restored_household_id;

    if not found then
      raise exception 'parked household not found' using errcode = '23503';
    end if;

    update public.household_members
    set household_id = v_handoff.restored_household_id,
        parked_household_id = null,
        role = 'owner',
        joined_at = now(),
        last_seen_activity_id = null
    where id = v_membership.id;

    update public.profiles
    set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
        updated_at = now()
    where id = p_user_id;

    v_result := jsonb_build_object(
      'status', 'RESTORED',
      'household', jsonb_build_object(
        'id', v_handoff.restored_household_id,
        'name', v_household_name
      )
    );
  else
    delete from public.household_members where id = v_membership.id;

    update public.profiles
    set onboarding_completed_at = null,
        updated_at = now()
    where id = p_user_id;

    v_result := jsonb_build_object('status', 'LEFT', 'household', null);
  end if;

  update public.recipe_handoffs
  set status = 'pending', leave_result = v_result
  where id = p_handoff_id;

  return v_result;
end;
$function$;

create or replace function public.get_recipe_handoffs()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_role text;
  v_handoffs jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select household_id, role into v_household_id, v_role
  from public.household_members
  where user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'NO_HOUSEHOLD');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select coalesce(jsonb_agg(handoff_data order by created_at), '[]'::jsonb)
  into v_handoffs
  from (
    select
      handoffs.created_at,
      jsonb_build_object(
        'id', handoffs.id,
        'departed_user_display_name', handoffs.departed_user_display_name,
        'created_at', handoffs.created_at,
        'items', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', items.id,
              'snapshot_schema_version', items.snapshot_schema_version,
              'snapshot', items.snapshot_payload,
              'image_path', items.copied_image_path
            ) order by items.created_at, items.id
          )
          from public.recipe_handoff_items items
          where items.handoff_id = handoffs.id
            and items.decision = 'pending'
        ), '[]'::jsonb)
      ) as handoff_data
    from public.recipe_handoffs handoffs
    where handoffs.household_id = v_household_id
      and handoffs.status = 'pending'
  ) visible;

  return jsonb_build_object('status', 'OK', 'handoffs', v_handoffs);
end;
$function$;

create or replace function public.resolve_recipe_handoff(
  p_handoff_id uuid,
  p_decision text,
  p_item_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_role text;
  v_handoff public.recipe_handoffs%rowtype;
  v_item public.recipe_handoff_items%rowtype;
  v_kept_recipe_id uuid;
  v_handoff_status text;
  v_resolved_item_ids jsonb := '[]'::jsonb;
  v_kept_recipe_ids jsonb := '[]'::jsonb;
  v_cleanup_paths jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_decision not in ('keep', 'remove') then
    return jsonb_build_object('status', 'INVALID_DECISION');
  end if;
  if p_item_ids is not null and cardinality(p_item_ids) = 0 then
    return jsonb_build_object('status', 'INVALID_ITEMS');
  end if;

  select household_id, role into v_household_id, v_role
  from public.household_members
  where user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'NO_HOUSEHOLD');
  end if;
  if v_role <> 'owner' then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  select * into v_handoff
  from public.recipe_handoffs
  where id = p_handoff_id
    and household_id = v_household_id
    and status in ('pending', 'resolved')
  for update;

  if not found then
    return jsonb_build_object('status', 'HANDOFF_NOT_FOUND');
  end if;

  if p_item_ids is not null and exists (
    select 1
    from unnest(p_item_ids) requested(id)
    where not exists (
      select 1 from public.recipe_handoff_items items
      where items.handoff_id = p_handoff_id and items.id = requested.id
    )
  ) then
    return jsonb_build_object('status', 'ITEM_NOT_FOUND');
  end if;

  if p_item_ids is not null and exists (
    select 1
    from public.recipe_handoff_items items
    where items.handoff_id = p_handoff_id
      and items.id = any(p_item_ids)
      and items.decision <> 'pending'
      and items.decision <> p_decision
  ) then
    return jsonb_build_object('status', 'DECISION_CONFLICT');
  end if;

  for v_item in
    select items.*
    from public.recipe_handoff_items items
    where items.handoff_id = p_handoff_id
      and items.decision = 'pending'
      and (p_item_ids is null or items.id = any(p_item_ids))
    order by items.created_at, items.id
    for update
  loop
    if p_decision = 'keep' then
      insert into public.recipes (
        owner_user_id, title, description, ingredients, instructions,
        source_type, source_url, servings, nutrition_per_serving,
        prep_time_minutes, cook_time_minutes, source_person_name, image_path,
        total_time_minutes, additional_time_label, additional_time_minutes
      ) values (
        v_user_id,
        v_item.snapshot_payload ->> 'title',
        v_item.snapshot_payload ->> 'description',
        v_item.snapshot_payload -> 'ingredients',
        v_item.snapshot_payload -> 'instructions',
        v_item.snapshot_payload ->> 'source_type',
        v_item.snapshot_payload ->> 'source_url',
        (v_item.snapshot_payload ->> 'servings')::integer,
        nullif(
          v_item.snapshot_payload -> 'nutrition_per_serving',
          'null'::jsonb
        ),
        (v_item.snapshot_payload ->> 'prep_time_minutes')::integer,
        (v_item.snapshot_payload ->> 'cook_time_minutes')::integer,
        v_item.snapshot_payload ->> 'source_person_name',
        v_item.copied_image_path,
        (v_item.snapshot_payload ->> 'total_time_minutes')::integer,
        v_item.snapshot_payload ->> 'additional_time_label',
        (v_item.snapshot_payload ->> 'additional_time_minutes')::integer
      ) returning id into v_kept_recipe_id;

      insert into public.household_recipe_shares (household_id, recipe_id)
      values (v_household_id, v_kept_recipe_id);

      update public.recipe_handoff_items
      set decision = 'keep',
          kept_recipe_id = v_kept_recipe_id,
          decided_by = v_user_id,
          decided_at = now(),
          snapshot_payload = null,
          source_image_path = null,
          copied_image_path = null
      where id = v_item.id;

      v_kept_recipe_ids := v_kept_recipe_ids || jsonb_build_array(v_kept_recipe_id);
    else
      update public.recipe_handoff_items
      set decision = 'remove',
          asset_cleanup_path = copied_image_path,
          decided_by = v_user_id,
          decided_at = now(),
          snapshot_payload = null,
          source_image_path = null,
          copied_image_path = null
      where id = v_item.id;

      if v_item.copied_image_path is not null then
        v_cleanup_paths := v_cleanup_paths || jsonb_build_array(v_item.copied_image_path);
      end if;
    end if;

    v_resolved_item_ids := v_resolved_item_ids || jsonb_build_array(v_item.id);
  end loop;

  if exists (
    select 1 from public.recipe_handoff_items
    where handoff_id = p_handoff_id and decision = 'pending'
  ) then
    v_handoff_status := 'pending';
  else
    v_handoff_status := 'resolved';
    update public.recipe_handoffs
    set status = 'resolved', resolved_at = coalesce(resolved_at, now())
    where id = p_handoff_id;
  end if;

  return jsonb_build_object(
    'status', 'OK',
    'handoff_id', p_handoff_id,
    'handoff_status', v_handoff_status,
    'resolved_item_ids', v_resolved_item_ids,
    'kept_recipe_ids', v_kept_recipe_ids,
    'cleanup_paths', v_cleanup_paths
  );
end;
$function$;

revoke all on function public.finalize_recipe_handoff(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.finalize_recipe_handoff(uuid, uuid)
to service_role;

revoke all on function public.get_recipe_handoffs()
from public, anon;
grant execute on function public.get_recipe_handoffs()
to authenticated, service_role;

revoke all on function public.resolve_recipe_handoff(uuid, text, uuid[])
from public, anon;
grant execute on function public.resolve_recipe_handoff(uuid, text, uuid[])
to authenticated, service_role;

commit;
