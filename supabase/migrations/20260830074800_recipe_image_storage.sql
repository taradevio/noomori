begin;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'noomori-recipe-images',
  'noomori-recipe-images',
  false,
  5242880,
  array['image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "recipe image owners can upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'noomori-recipe-images'
  and (storage.foldername(name))[1] = 'recipes'
  and (storage.foldername(name))[2] = auth.uid()::text
  and storage.extension(name) = 'webp'
  and storage.filename(name) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.webp$'
  and exists (
    select 1
    from public.recipes
    where recipes.id::text = (storage.foldername(name))[3]
      and recipes.owner_user_id = auth.uid()
  )
);

create policy "recipe owners can read images"
on storage.objects for select to authenticated
using (
  bucket_id = 'noomori-recipe-images'
  and exists (
    select 1
    from public.recipes
    where recipes.id::text = (storage.foldername(name))[3]
      and recipes.owner_user_id = auth.uid()
  )
);

create policy "household members can read recipe images"
on storage.objects for select to authenticated
using (
  bucket_id = 'noomori-recipe-images'
  and exists (
    select 1
    from public.household_recipe_shares shares
    join public.household_members members
      on members.household_id = shares.household_id
    where shares.recipe_id::text = (storage.foldername(name))[3]
      and members.user_id = auth.uid()
  )
);

create policy "recipe image object owners can delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'noomori-recipe-images'
  and owner_id = auth.uid()::text
);

commit;
