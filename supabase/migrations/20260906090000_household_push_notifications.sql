-- NOTE: Push registrations and receipts are server-owned; app roles get no
-- direct table access, even to their own rows.
CREATE TABLE public.push_notification_devices (
  expo_push_token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_notification_devices_platform_check
    CHECK (platform IN ('android', 'ios')),
  CONSTRAINT push_notification_devices_token_check
    CHECK (
      char_length(expo_push_token) BETWEEN 20 AND 512
      AND expo_push_token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$'
    )
);

ALTER TABLE public.push_notification_devices ENABLE ROW LEVEL SECURITY;

CREATE INDEX push_notification_devices_user_id_idx
  ON public.push_notification_devices(user_id);

CREATE TABLE public.push_notification_tickets (
  receipt_id text PRIMARY KEY,
  expo_push_token text NOT NULL
    REFERENCES public.push_notification_devices(expo_push_token) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.push_notification_tickets ENABLE ROW LEVEL SECURITY;

CREATE INDEX push_notification_tickets_created_at_idx
  ON public.push_notification_tickets(created_at);

REVOKE ALL ON TABLE public.push_notification_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.push_notification_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.push_notification_devices TO postgres, service_role;
GRANT ALL ON TABLE public.push_notification_tickets TO postgres, service_role;

-- Keep the existing public contract while telling the API whether a share state
-- actually changed, so idempotent retries do not create duplicate pushes.
CREATE OR REPLACE FUNCTION public.set_recipe_household_shared (
  p_recipe_id uuid,
  p_shared boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_household_id uuid;
  v_changed_household_id uuid;
  v_member_count integer;
  v_recipe_title text;
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
