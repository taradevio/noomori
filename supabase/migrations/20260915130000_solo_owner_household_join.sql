alter table public.household_members
  add column parked_household_id uuid;

alter table public.household_members
  add constraint household_members_parked_household_id_fkey
    foreign key (parked_household_id) references public.households(id),
  add constraint household_members_parked_household_member_check
    check (parked_household_id is null or role = 'member'),
  add constraint household_members_parked_household_differs_check
    check (
      parked_household_id is null
      or parked_household_id <> household_id
    );

create or replace function public.preview_household_join_code (
  p_code_digest text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_household_id uuid;
  v_existing_role text;
  v_existing_member_count integer;
  v_locked_until timestamptz;
  v_household_id uuid;
  v_household_name text;
  v_owner_display_name text;
  v_member_count integer;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select household_id, role
  into v_existing_household_id, v_existing_role
  from public.household_members
  where user_id = v_user_id;

  if found then
    if v_existing_role <> 'owner' then
      return jsonb_build_object(
        'status', 'ALREADY_MEMBER',
        'household_id', v_existing_household_id,
        'role', v_existing_role
      );
    end if;

    select count(*)::integer
    into v_existing_member_count
    from public.household_members
    where household_id = v_existing_household_id;

    if v_existing_member_count > 1 then
      return jsonb_build_object('status', 'HOUSEHOLD_HAS_MEMBERS');
    end if;
  end if;

  v_locked_until := private.household_join_rate_limit(v_user_id, null);
  if v_locked_until is not null then
    return jsonb_build_object(
      'status', 'RATE_LIMITED',
      'retry_after_seconds', greatest(
        1,
        ceil(extract(epoch from (v_locked_until - now())))::integer
      )
    );
  end if;

  if p_code_digest ~ '^[0-9a-f]{64}$' then
    select
      h.id,
      h.name,
      coalesce(
        nullif(to_jsonb(p) ->> 'display_name', ''),
        nullif(to_jsonb(p) ->> 'full_name', ''),
        nullif(to_jsonb(p) ->> 'name', ''),
        'Household owner'
      ),
      (
        select count(*)::integer
        from public.household_members members
        where members.household_id = h.id
      )
    into
      v_household_id,
      v_household_name,
      v_owner_display_name,
      v_member_count
    from public.household_join_codes c
    join public.households h on h.id = c.household_id
    left join public.profiles p on p.id = h.created_by
    where c.code_digest = p_code_digest
      and c.expires_at > now();
  end if;

  if v_household_id is null then
    perform private.household_join_rate_limit(v_user_id, false);
    return jsonb_build_object('status', 'INVALID_OR_EXPIRED');
  end if;

  perform private.household_join_rate_limit(v_user_id, true);

  if v_household_id = v_existing_household_id then
    return jsonb_build_object(
      'status', 'ALREADY_MEMBER',
      'household_id', v_existing_household_id,
      'role', v_existing_role
    );
  end if;

  return jsonb_build_object(
    'status', 'OK',
    'household_name', v_household_name,
    'owner_display_name', v_owner_display_name,
    'member_count', v_member_count
  );
end;
$function$;

create or replace function public.join_household_with_code (
  p_code_digest text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_user_id uuid := auth.uid();
  v_existing_household_id uuid;
  v_existing_household_name text;
  v_existing_role text;
  v_existing_member_count integer;
  v_locked_until timestamptz;
  v_household_id uuid;
  v_household_name text;
  v_membership jsonb;
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

  select hm.household_id, h.name, hm.role
  into v_existing_household_id, v_existing_household_name, v_existing_role
  from public.household_members hm
  join public.households h on h.id = hm.household_id
  where hm.user_id = v_user_id
  for update of hm;

  if found and v_existing_role <> 'owner' then
    return jsonb_build_object(
      'status', 'ALREADY_MEMBER',
      'household', jsonb_build_object(
        'id', v_existing_household_id,
        'name', v_existing_household_name
      ),
      'membership', jsonb_build_object(
        'household_id', v_existing_household_id,
        'user_id', v_user_id,
        'role', v_existing_role
      )
    );
  end if;

  if v_existing_role = 'owner' then
    select count(*)::integer
    into v_existing_member_count
    from public.household_members
    where household_id = v_existing_household_id;

    if v_existing_member_count > 1 then
      return jsonb_build_object('status', 'HOUSEHOLD_HAS_MEMBERS');
    end if;
  end if;

  v_locked_until := private.household_join_rate_limit(v_user_id, null);
  if v_locked_until is not null then
    return jsonb_build_object(
      'status', 'RATE_LIMITED',
      'retry_after_seconds', greatest(
        1,
        ceil(extract(epoch from (v_locked_until - now())))::integer
      )
    );
  end if;

  if p_code_digest ~ '^[0-9a-f]{64}$' then
    select c.household_id
    into v_household_id
    from public.household_join_codes c
    where c.code_digest = p_code_digest
      and c.expires_at > now();
  end if;

  if v_household_id is null then
    perform private.household_join_rate_limit(v_user_id, false);
    return jsonb_build_object('status', 'INVALID_OR_EXPIRED');
  end if;

  if v_household_id = v_existing_household_id then
    perform private.household_join_rate_limit(v_user_id, true);
    return jsonb_build_object(
      'status', 'ALREADY_MEMBER',
      'household', jsonb_build_object(
        'id', v_existing_household_id,
        'name', v_existing_household_name
      ),
      'membership', jsonb_build_object(
        'household_id', v_existing_household_id,
        'user_id', v_user_id,
        'role', v_existing_role
      )
    );
  end if;

  -- Lock both invite rows in a stable order so an owner cannot park a
  -- household while another transaction is consuming its active invite.
  perform c.household_id
  from public.household_join_codes c
  where c.household_id in (v_household_id, v_existing_household_id)
  order by c.household_id
  for update;

  select c.household_id, h.name
  into v_household_id, v_household_name
  from public.household_join_codes c
  join public.households h on h.id = c.household_id
  where c.code_digest = p_code_digest
    and c.expires_at > now();

  if v_household_id is null then
    perform private.household_join_rate_limit(v_user_id, false);
    return jsonb_build_object('status', 'INVALID_OR_EXPIRED');
  end if;

  if v_existing_role = 'owner' then
    select count(*)::integer
    into v_existing_member_count
    from public.household_members
    where household_id = v_existing_household_id;

    if v_existing_member_count > 1 then
      return jsonb_build_object('status', 'HOUSEHOLD_HAS_MEMBERS');
    end if;

    update public.household_members
    set household_id = v_household_id,
        parked_household_id = v_existing_household_id,
        role = 'member',
        joined_at = now(),
        last_seen_activity_id = null
    where user_id = v_user_id
      and household_id = v_existing_household_id
      and role = 'owner'
    returning jsonb_build_object(
      'id', id,
      'household_id', household_id,
      'user_id', user_id,
      'role', role,
      'joined_at', joined_at
    ) into v_membership;

    if not found then
      raise exception 'household membership changed while joining';
    end if;

    delete from public.household_join_codes
    where household_id = v_existing_household_id;
  else
    insert into public.household_members (household_id, user_id, role)
    values (v_household_id, v_user_id, 'member')
    returning jsonb_build_object(
      'id', id,
      'household_id', household_id,
      'user_id', user_id,
      'role', role,
      'joined_at', joined_at
    ) into v_membership;
  end if;

  update public.profiles
  set onboarding_completed_at = coalesce(onboarding_completed_at, now()),
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'profile not found' using errcode = '23503';
  end if;

  delete from public.household_join_codes
  where household_id = v_household_id
    and code_digest = p_code_digest;

  if not found then
    raise exception 'join code disappeared during redemption';
  end if;

  perform private.household_join_rate_limit(v_user_id, true);

  return jsonb_build_object(
    'status', 'JOINED',
    'household', jsonb_build_object(
      'id', v_household_id,
      'name', v_household_name
    ),
    'membership', v_membership
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
  v_household_id uuid;
  v_parked_household_id uuid;
  v_parked_household_name text;
  v_role text;
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

  select household_id, parked_household_id, role
  into v_household_id, v_parked_household_id, v_role
  from public.household_members
  where user_id = v_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'NO_HOUSEHOLD');
  end if;

  if v_role = 'owner' then
    return jsonb_build_object('status', 'OWNER_CANNOT_LEAVE');
  end if;

  delete from public.household_recipe_shares shares
  using public.recipes recipes
  where shares.household_id = v_household_id
    and shares.recipe_id = recipes.id
    and recipes.owner_user_id = v_user_id;

  if v_parked_household_id is not null then
    select name
    into v_parked_household_name
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
    where user_id = v_user_id
      and household_id = v_household_id;

    if not found then
      raise exception 'household membership disappeared while leaving';
    end if;

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

  delete from public.household_members
  where household_id = v_household_id
    and user_id = v_user_id;

  if not found then
    raise exception 'household membership disappeared while leaving';
  end if;

  update public.profiles
  set onboarding_completed_at = null,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'profile not found' using errcode = '23503';
  end if;

  return jsonb_build_object('status', 'LEFT', 'household', null);
end;
$function$;

create or replace function public.replace_household_join_code (
  p_code_digest text
)
  returns jsonb
  language plpgsql
  security definer
  set search_path to ''
  as $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_expires_at timestamptz := now() + interval '10 minutes';
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if p_code_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid code digest' using errcode = '22023';
  end if;

  select household_id
  into v_household_id
  from public.household_members
  where user_id = v_user_id
    and role = 'owner'
  for update;

  if not found then
    return jsonb_build_object('status', 'FORBIDDEN');
  end if;

  insert into public.household_join_codes (
    household_id,
    code_digest,
    created_by,
    created_at,
    expires_at
  ) values (
    v_household_id,
    p_code_digest,
    v_user_id,
    now(),
    v_expires_at
  )
  on conflict (household_id) do update
    set code_digest = excluded.code_digest,
        created_by = excluded.created_by,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at;

  return jsonb_build_object(
    'status', 'OK',
    'expires_at', v_expires_at
  );
end;
$function$;
