begin;

-- RLS is the row filter; grants limit each API role to the operations the app uses.
revoke all on table
  public.profiles,
  public.households,
  public.household_members,
  public.recipes,
  public.household_recipe_shares,
  public.household_join_codes,
  public.household_join_rate_limits,
  public.cookbooks,
  public.cookbook_recipes,
  public.household_recipe_activities
from public, anon, authenticated;

grant select, update on table public.profiles to authenticated;
grant select, insert on table public.households to authenticated;
grant select, insert on table public.household_members to authenticated;
grant select, insert, update, delete on table public.recipes to authenticated;
grant select on table public.household_recipe_shares to authenticated;
grant select, insert, update, delete on table public.cookbooks to authenticated;
grant select on table public.cookbook_recipes to authenticated;

revoke all on sequence public.household_recipe_activities_id_seq
from public, anon, authenticated;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.household_join_rate_limit(uuid, boolean)
from public, anon, authenticated;
revoke all on function private.record_household_recipe_activity(uuid, uuid, text, text)
from public, anon, authenticated;
revoke all on function private.record_shared_recipe_edit()
from public, anon, authenticated;

revoke all on function public.handle_new_user()
from public, anon, authenticated;

revoke all on function public.create_personal_cookbook(text, uuid[])
from public, anon, authenticated;
revoke all on function public.get_household_activity()
from public, anon, authenticated;
revoke all on function public.get_household_settings()
from public, anon, authenticated;
revoke all on function public.join_household_with_code(text)
from public, anon, authenticated;
revoke all on function public.leave_household()
from public, anon, authenticated;
revoke all on function public.mark_household_activity_read(bigint)
from public, anon, authenticated;
revoke all on function public.preview_household_join_code(text)
from public, anon, authenticated;
revoke all on function public.replace_household_join_code(text)
from public, anon, authenticated;
revoke all on function public.replace_personal_cookbook_recipes(uuid, uuid[])
from public, anon, authenticated;
revoke all on function public.revoke_household_join_code()
from public, anon, authenticated;
revoke all on function public.set_recipe_household_shared(uuid, boolean)
from public, anon, authenticated;

grant execute on function public.create_personal_cookbook(text, uuid[])
to authenticated;
grant execute on function public.get_household_activity()
to authenticated;
grant execute on function public.get_household_settings()
to authenticated;
grant execute on function public.join_household_with_code(text)
to authenticated;
grant execute on function public.leave_household()
to authenticated;
grant execute on function public.mark_household_activity_read(bigint)
to authenticated;
grant execute on function public.preview_household_join_code(text)
to authenticated;
grant execute on function public.replace_household_join_code(text)
to authenticated;
grant execute on function public.replace_personal_cookbook_recipes(uuid, uuid[])
to authenticated;
grant execute on function public.revoke_household_join_code()
to authenticated;
grant execute on function public.set_recipe_household_shared(uuid, boolean)
to authenticated;

commit;
