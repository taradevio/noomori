begin;

create or replace function public.set_recipe_household_shared (
  p_recipe_id uuid,
  p_shared boolean
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_changed_household_id uuid;
  v_member_count integer;
  v_recipe_title text;
  v_source_recipe_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_shared is null then
    raise exception 'shared state is required' using errcode = '22023';
  end if;

  select members.household_id
  into v_household_id
  from public.household_members members
  where members.user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'NO_HOUSEHOLD');
  end if;

  select recipes.title
  into v_recipe_title
  from public.recipes recipes
  where recipes.id = p_recipe_id
    and recipes.owner_user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'RECIPE_NOT_FOUND');
  end if;

  if p_shared then
    select count(*)::integer
    into v_member_count
    from public.household_members members
    where members.household_id = v_household_id;

    if v_member_count < 2 then
      return jsonb_build_object('status', 'HOUSEHOLD_NOT_READY');
    end if;

    select items.source_recipe_id
    into v_source_recipe_id
    from public.recipe_handoff_items items
    join public.recipe_handoffs handoffs on handoffs.id = items.handoff_id
    where handoffs.household_id = v_household_id
      and (
        items.source_recipe_id = p_recipe_id
        or items.kept_recipe_id = p_recipe_id
      )
    order by (items.source_recipe_id = p_recipe_id) desc, items.created_at desc
    limit 1;

    v_source_recipe_id := coalesce(v_source_recipe_id, p_recipe_id);
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(v_household_id::text),
      pg_catalog.hashtext(v_source_recipe_id::text)
    );

    if exists (
      select 1
      from public.household_recipe_shares shares
      where shares.household_id = v_household_id
        and shares.recipe_id = p_recipe_id
    ) then
      return jsonb_build_object(
        'status', 'OK',
        'is_shared', true,
        'changed', false
      );
    end if;

    if exists (
      select 1
      from public.household_recipe_shares shares
      where shares.household_id = v_household_id
        and shares.recipe_id <> p_recipe_id
        and (
          shares.recipe_id = v_source_recipe_id
          or exists (
            select 1
            from public.recipe_handoff_items sibling_items
            join public.recipe_handoffs sibling_handoffs
              on sibling_handoffs.id = sibling_items.handoff_id
            where sibling_handoffs.household_id = v_household_id
              and sibling_items.source_recipe_id = v_source_recipe_id
              and sibling_items.kept_recipe_id = shares.recipe_id
          )
        )
    ) then
      return jsonb_build_object('status', 'DUPLICATE_RECIPE');
    end if;

    update public.recipe_handoff_items items
    set decision = 'remove',
        asset_cleanup_path = items.copied_image_path,
        decided_by = v_user_id,
        decided_at = now(),
        snapshot_payload = null,
        source_image_path = null,
        copied_image_path = null
    from public.recipe_handoffs handoffs
    where handoffs.id = items.handoff_id
      and handoffs.household_id = v_household_id
      and handoffs.status = 'pending'
      and items.source_recipe_id = v_source_recipe_id
      and items.decision = 'pending';

    update public.recipe_handoffs handoffs
    set status = 'resolved',
        resolved_at = coalesce(handoffs.resolved_at, now())
    where handoffs.household_id = v_household_id
      and handoffs.status = 'pending'
      and exists (
        select 1
        from public.recipe_handoff_items lineage_items
        where lineage_items.handoff_id = handoffs.id
          and lineage_items.source_recipe_id = v_source_recipe_id
      )
      and not exists (
        select 1
        from public.recipe_handoff_items remaining
        where remaining.handoff_id = handoffs.id
          and remaining.decision = 'pending'
      );

    insert into public.household_recipe_shares (household_id, recipe_id)
    values (v_household_id, p_recipe_id)
    on conflict (household_id, recipe_id) do nothing
    returning household_id into v_changed_household_id;

    if v_changed_household_id is not null then
      perform private.record_household_recipe_activity(
        v_household_id,
        p_recipe_id,
        v_recipe_title,
        'added'
      );
    end if;
  else
    delete from public.household_recipe_shares shares
    where shares.household_id = v_household_id
      and shares.recipe_id = p_recipe_id
    returning household_id into v_changed_household_id;

    if v_changed_household_id is not null then
      perform private.record_household_recipe_activity(
        v_household_id,
        p_recipe_id,
        v_recipe_title,
        'unshared'
      );
    end if;
  end if;

  return jsonb_build_object(
    'status', 'OK',
    'is_shared', p_shared,
    'changed', v_changed_household_id is not null
  );
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
  v_source_recipe_id uuid;
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
    and status in ('pending', 'resolved');

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

  for v_source_recipe_id in
    select distinct items.source_recipe_id
    from public.recipe_handoff_items items
    where items.handoff_id = p_handoff_id
      and (p_item_ids is null or items.id = any(p_item_ids))
    order by items.source_recipe_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext(v_household_id::text),
      pg_catalog.hashtext(v_source_recipe_id::text)
    );
  end loop;

  select * into v_handoff
  from public.recipe_handoffs
  where id = p_handoff_id
    and household_id = v_household_id
    and status in ('pending', 'resolved')
  for update;

  if not found then
    return jsonb_build_object('status', 'HANDOFF_NOT_FOUND');
  end if;

  if p_decision = 'keep' and exists (
    select 1
    from public.recipe_handoff_items target_items
    where target_items.handoff_id = p_handoff_id
      and (p_item_ids is null or target_items.id = any(p_item_ids))
      and target_items.decision in ('pending', 'remove')
      and exists (
        select 1
        from public.household_recipe_shares shares
        where shares.household_id = v_household_id
          and (
            shares.recipe_id = target_items.source_recipe_id
            or exists (
              select 1
              from public.recipe_handoff_items sibling_items
              join public.recipe_handoffs sibling_handoffs
                on sibling_handoffs.id = sibling_items.handoff_id
              where sibling_handoffs.household_id = v_household_id
                and sibling_items.source_recipe_id = target_items.source_recipe_id
                and sibling_items.kept_recipe_id = shares.recipe_id
            )
          )
      )
  ) then
    return jsonb_build_object('status', 'DUPLICATE_RECIPE');
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

      update public.recipe_handoff_items sibling_items
      set decision = 'remove',
          asset_cleanup_path = sibling_items.copied_image_path,
          decided_by = v_user_id,
          decided_at = now(),
          snapshot_payload = null,
          source_image_path = null,
          copied_image_path = null
      from public.recipe_handoffs sibling_handoffs
      where sibling_handoffs.id = sibling_items.handoff_id
        and sibling_handoffs.household_id = v_household_id
        and sibling_handoffs.status = 'pending'
        and sibling_items.source_recipe_id = v_item.source_recipe_id
        and sibling_items.id <> v_item.id
        and sibling_items.decision = 'pending';

      update public.recipe_handoffs sibling_handoffs
      set status = 'resolved',
          resolved_at = coalesce(sibling_handoffs.resolved_at, now())
      where sibling_handoffs.household_id = v_household_id
        and sibling_handoffs.status = 'pending'
        and exists (
          select 1
          from public.recipe_handoff_items lineage_items
          where lineage_items.handoff_id = sibling_handoffs.id
            and lineage_items.source_recipe_id = v_item.source_recipe_id
        )
        and not exists (
          select 1
          from public.recipe_handoff_items remaining
          where remaining.handoff_id = sibling_handoffs.id
            and remaining.decision = 'pending'
        );

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

commit;
