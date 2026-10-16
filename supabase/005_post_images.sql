begin;

create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  storage_path text not null unique,
  sort_order smallint not null check (sort_order between 0 and 19),
  alt_text text not null check (char_length(trim(alt_text)) between 1 and 300),
  width integer not null check (width between 1 and 2000),
  height integer not null check (height between 1 and 2000),
  byte_size integer not null check (byte_size between 1 and 5242880),
  created_at timestamptz not null default now(),
  unique (post_id, sort_order)
);

create table if not exists public.post_image_children (
  post_image_id uuid not null references public.post_images(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  primary key (post_image_id, child_id)
);

create index if not exists idx_post_images_post_position on public.post_images(post_id, sort_order);
create index if not exists idx_post_image_children_child on public.post_image_children(child_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-images', 'post-images', false, 5242880, array['image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_upload_post_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select auth.uid() is not null
    and split_part(object_name, '/', 1) = public.current_organization_id()::text
    and split_part(object_name, '/', 2) = auth.uid()::text
    and (public.is_admin() or exists (
      select 1 from public.profiles profile
      where profile.id = public.current_profile_id() and profile.role = 'staff'
    ))
$$;

create or replace function public.can_read_post_image(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, storage
as $$
  select exists (
    select 1
    from public.post_images image
    where image.storage_path = object_name
      and public.can_read_post(image.post_id)
  )
$$;

create or replace function public.create_post_with_images(
  target_post_id uuid,
  target_department_id uuid,
  target_child_id uuid,
  post_title text,
  post_body text,
  media jsonb default '[]'::jsonb,
  visible_child_ids uuid[] default '{}'::uuid[],
  no_children_visible boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  media_count integer;
  visible_count integer;
  expected_prefix text;
  media_item jsonb;
  new_image_id uuid;
begin
  if auth.uid() is null then raise exception 'Du måste vara inloggad'; end if;
  if not (public.is_admin_for_department(target_department_id) or public.is_staff_for_department(target_department_id)) then
    raise exception 'Du saknar behörighet att publicera till avdelningen';
  end if;
  if target_child_id is not null and not exists (
    select 1 from public.children where id = target_child_id and department_id = target_department_id
  ) then raise exception 'Barnet tillhör inte vald avdelning'; end if;
  if char_length(trim(coalesce(post_title, ''))) not between 1 and 160 then raise exception 'Rubriken måste innehålla mellan 1 och 160 tecken'; end if;
  if char_length(trim(coalesce(post_body, ''))) not between 1 and 5000 then raise exception 'Inlägget måste innehålla mellan 1 och 5000 tecken'; end if;

  if jsonb_typeof(coalesce(media, '[]'::jsonb)) <> 'array' then raise exception 'Ogiltig bildlista'; end if;
  media_count := jsonb_array_length(coalesce(media, '[]'::jsonb));
  if media_count > 20 then raise exception 'Ett inlägg kan innehålla högst 20 bilder'; end if;
  visible_count := coalesce(array_length(visible_child_ids, 1), 0);
  if visible_count <> (select count(distinct item) from unnest(visible_child_ids) item) then raise exception 'Samma barn har valts flera gånger'; end if;

  if media_count > 0 then
    if no_children_visible = (visible_count > 0) then raise exception 'Bekräfta antingen vilka barn som syns eller att inga barn syns'; end if;
    if exists (
      select 1 from unnest(visible_child_ids) as selected(child_id)
      where not exists (
        select 1 from public.children child
        where child.id = selected.child_id and child.department_id = target_department_id
      )
    ) then raise exception 'Ett markerat barn tillhör inte vald avdelning'; end if;
    if exists (
      select 1 from unnest(visible_child_ids) as selected(child_id)
      where not exists (
        select 1 from public.consents consent
        where consent.child_id = selected.child_id and consent.type = 'app_images' and consent.allowed
      )
    ) then raise exception 'Alla synliga barn måste ha godkänt Bilder i ärtan'; end if;
    if visible_count > 1 and exists (
      select 1 from unnest(visible_child_ids) as selected(child_id)
      where not exists (
        select 1 from public.consents consent
        where consent.child_id = selected.child_id and consent.type = 'group_images' and consent.allowed
      )
    ) then raise exception 'Alla synliga barn i ett gruppinlägg måste ha godkänt Gruppbilder'; end if;
  elsif visible_count > 0 or no_children_visible then
    raise exception 'Bildmarkeringar får bara anges när inlägget har bilder';
  end if;

  expected_prefix := public.current_organization_id()::text || '/' || auth.uid()::text || '/' || target_post_id::text || '/';
  if media_count > 0 and exists (
    select 1
    from jsonb_array_elements(media) item
    where coalesce(item ->> 'storage_path', '') not like expected_prefix || '%'
      or coalesce(item ->> 'storage_path', '') !~ '/[0-9]+[.]jpg$'
      or coalesce((item ->> 'position')::integer, -1) not between 0 and 19
      or coalesce((item ->> 'width')::integer, 0) not between 1 and 2000
      or coalesce((item ->> 'height')::integer, 0) not between 1 and 2000
      or coalesce((item ->> 'byte_size')::integer, 0) not between 1 and 5242880
      or char_length(trim(coalesce(item ->> 'alt_text', ''))) not between 1 and 300
  ) then raise exception 'Ogiltig bildmetadata'; end if;
  if media_count <> (select count(distinct (item ->> 'position')::integer) from jsonb_array_elements(media) item) then raise exception 'Bildpositioner måste vara unika'; end if;
  if media_count <> (
    select count(*) from storage.objects object
    where object.bucket_id = 'post-images'
      and object.owner_id = auth.uid()::text
      and object.name in (select item ->> 'storage_path' from jsonb_array_elements(media) item)
  ) then raise exception 'En eller flera uppladdade bilder saknas'; end if;

  insert into public.posts (id, department_id, child_id, author_id, type, title, body)
  values (target_post_id, target_department_id, target_child_id, public.current_profile_id(), (case when media_count > 0 then 'image' else 'message' end)::public.post_type, trim(post_title), trim(post_body));

  for media_item in select value from jsonb_array_elements(media) loop
    insert into public.post_images (post_id, storage_path, sort_order, alt_text, width, height, byte_size)
    values (
      target_post_id,
      media_item ->> 'storage_path',
      (media_item ->> 'position')::smallint,
      trim(media_item ->> 'alt_text'),
      (media_item ->> 'width')::integer,
      (media_item ->> 'height')::integer,
      (media_item ->> 'byte_size')::integer
    ) returning id into new_image_id;
    insert into public.post_image_children (post_image_id, child_id)
    select new_image_id, selected.child_id from unnest(visible_child_ids) as selected(child_id);
  end loop;

  return target_post_id;
end;
$$;

create or replace function public.list_post_images()
returns table (
  image_id uuid,
  post_id uuid,
  storage_path text,
  sort_order smallint,
  alt_text text,
  width integer,
  height integer
)
language sql
stable
security definer
set search_path = public
as $$
  select image.id, image.post_id, image.storage_path, image.sort_order, image.alt_text, image.width, image.height
  from public.post_images image
  where public.can_read_post(image.post_id)
  order by image.post_id, image.sort_order
$$;

create or replace function public.list_post_image_paths_for_delete(target_post_id uuid)
returns table (storage_path text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.posts post
    where post.id = target_post_id
      and (post.author_id = public.current_profile_id() or public.is_admin_for_department(post.department_id))
  ) then raise exception 'Inlägget hittades inte eller kan inte tas bort'; end if;
  return query select image.storage_path from public.post_images image where image.post_id = target_post_id order by image.sort_order;
end;
$$;

create or replace function public.delete_post_with_images(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.posts post
  where post.id = target_post_id
    and (post.author_id = public.current_profile_id() or public.is_admin_for_department(post.department_id));
  if not found then raise exception 'Inlägget hittades inte eller kan inte tas bort'; end if;
end;
$$;

alter table public.post_images enable row level security;
alter table public.post_image_children enable row level security;

create policy "post image authorized read" on public.post_images
for select using (public.can_read_post(post_id));
create policy "post image child authorized read" on public.post_image_children
for select using (exists (
  select 1 from public.post_images image
  where image.id = post_image_id and public.can_read_post(image.post_id)
));

create policy "post image authenticated upload" on storage.objects
for insert to authenticated with check (
  bucket_id = 'post-images' and public.can_upload_post_image(name)
);
create policy "post image authorized download" on storage.objects
for select to authenticated using (
  bucket_id = 'post-images' and public.can_read_post_image(name)
);
create policy "post image authorized delete" on storage.objects
for delete to authenticated using (
  bucket_id = 'post-images'
  and (
    owner_id = auth.uid()::text
    or (public.is_admin() and split_part(name, '/', 1) = public.current_organization_id()::text)
  )
);

revoke all on public.post_images, public.post_image_children from anon, authenticated;
grant select on public.post_images, public.post_image_children to authenticated;
revoke all on function public.can_upload_post_image(text) from public;
revoke all on function public.can_read_post_image(text) from public;
revoke all on function public.create_post_with_images(uuid, uuid, uuid, text, text, jsonb, uuid[], boolean) from public;
revoke all on function public.list_post_images() from public;
revoke all on function public.list_post_image_paths_for_delete(uuid) from public;
revoke all on function public.delete_post_with_images(uuid) from public;
grant execute on function public.create_post_with_images(uuid, uuid, uuid, text, text, jsonb, uuid[], boolean) to authenticated;
grant execute on function public.list_post_images() to authenticated;
grant execute on function public.list_post_image_paths_for_delete(uuid) to authenticated;
grant execute on function public.delete_post_with_images(uuid) to authenticated;

commit;
