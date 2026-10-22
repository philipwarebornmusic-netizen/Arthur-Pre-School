-- Guardians own their child's information.
--
-- Apply this file once, manually, in the Supabase SQL editor of a NON-production
-- project first. The Netlify deploy preview uses the production database, so
-- running this file there changes production access rules.
--
-- The migration does not delete rows and does not drop columns.
-- It does not read or write pickup_contacts, pickup_passes, or pickup_events,
-- so it is safe to run before or after supabase/010_pickup_passes.sql.
-- 010 does not grant staff or admin any write on child profile, health,
-- emergency contacts, or consents. Those pickup tables are a separate hämtlista.
--
-- Kept as they already are:
--   children INSERT for an admin or a staff member of the department
--     (name and department are set at creation);
--   children DELETE for an admin of the child;
--   SELECT on child_health, child_contacts, and consents for admin, staff, and guardians.
--   children UPDATE stays revoked from authenticated. Department moves go through
--   move_child_department, which changes only department_id and only for an admin.
--
-- Replaced:
--   update_child_profile: guardians of that child only (name, birth date, notes).
--   child_health INSERT/UPDATE policies: guardians only.
--   child_contacts INSERT/UPDATE/DELETE policies: guardians only (admin write removed).
--   consents INSERT/UPDATE policies: guardians only (admin write removed).
-- New security-definer RPCs, revoked from public and anon, granted to authenticated:
--   save_child_health, save_child_contact, delete_child_contact, set_child_consent,
--   move_child_department.
--   update_child_profile is revoked from public and anon again and granted only
--   to authenticated.

begin;

create or replace function public.update_child_profile(
  target_child_id uuid,
  child_name text,
  child_birth_date date default null,
  child_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_id() is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ändra uppgifterna';
  end if;
  if child_name is null or btrim(child_name) = '' then
    raise exception 'Barnets namn måste anges';
  end if;
  update public.children
  set name = btrim(child_name),
      birth_date = child_birth_date,
      notes = nullif(btrim(coalesce(child_notes, '')), '')
  where id = target_child_id;
  if not found then raise exception 'Barnet hittades inte'; end if;
end;
$$;

create or replace function public.move_child_department(
  target_child_id uuid,
  target_department_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_child_id is null or target_department_id is null then
    raise exception 'Välj barn och avdelning';
  end if;
  if not public.is_admin_for_child(target_child_id) then
    raise exception 'Bara en administratör kan flytta barnet';
  end if;
  if not public.is_admin_for_department(target_department_id) then
    raise exception 'Avdelningen tillhör inte din organisation';
  end if;
  update public.children
  set department_id = target_department_id
  where id = target_child_id;
  if not found then raise exception 'Barnet hittades inte'; end if;
end;
$$;

create or replace function public.save_child_health(
  target_child_id uuid,
  allergy_list text[] default '{}',
  condition_list text[] default '{}',
  diet_text text default null,
  medication_text text default null,
  emergency_text text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_profile_id();
  clean_allergies text[];
  clean_conditions text[];
begin
  if caller is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ändra hälsa och omsorg';
  end if;
  select coalesce(array_agg(item), '{}'::text[])
  into clean_allergies
  from (
    select btrim(value) as item
    from unnest(coalesce(allergy_list, '{}'::text[])) as value
    where btrim(coalesce(value, '')) <> ''
  ) cleaned;
  select coalesce(array_agg(item), '{}'::text[])
  into clean_conditions
  from (
    select btrim(value) as item
    from unnest(coalesce(condition_list, '{}'::text[])) as value
    where btrim(coalesce(value, '')) <> ''
  ) cleaned;
  insert into public.child_health (
    child_id, allergies, conditions, diet, medication, emergency, updated_by, updated_at
  )
  values (
    target_child_id,
    clean_allergies,
    clean_conditions,
    nullif(btrim(coalesce(diet_text, '')), ''),
    nullif(btrim(coalesce(medication_text, '')), ''),
    nullif(btrim(coalesce(emergency_text, '')), ''),
    caller,
    now()
  )
  on conflict (child_id) do update
  set allergies = excluded.allergies,
      conditions = excluded.conditions,
      diet = excluded.diet,
      medication = excluded.medication,
      emergency = excluded.emergency,
      updated_by = caller,
      updated_at = now();
end;
$$;

create or replace function public.save_child_contact(
  target_child_id uuid,
  target_contact_id uuid,
  contact_name text,
  contact_relation text,
  contact_phone text default null,
  contact_can_pickup boolean default false,
  contact_is_primary boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_child uuid;
  saved_id uuid;
begin
  if target_child_id is null then raise exception 'Barnet saknas'; end if;
  if contact_name is null or btrim(contact_name) = '' then
    raise exception 'Kontaktpersonens namn måste anges';
  end if;
  if contact_relation is null or btrim(contact_relation) = '' then
    raise exception 'Relationen måste anges';
  end if;
  if target_contact_id is not null then
    select child_id into owner_child
    from public.child_contacts
    where id = target_contact_id;
    if not found then raise exception 'Kontaktpersonen hittades inte'; end if;
    if owner_child <> target_child_id then
      raise exception 'Kontaktpersonen hör till ett annat barn';
    end if;
    if public.current_profile_id() is null or not public.is_guardian(owner_child) then
      raise exception 'Bara barnets vårdnadshavare kan ändra kontaktpersoner';
    end if;
    update public.child_contacts
    set name = btrim(contact_name),
        relation = btrim(contact_relation),
        phone = nullif(btrim(coalesce(contact_phone, '')), ''),
        can_pickup = coalesce(contact_can_pickup, false),
        is_primary = coalesce(contact_is_primary, false)
    where id = target_contact_id;
    return target_contact_id;
  end if;
  if public.current_profile_id() is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan lägga till kontaktpersoner';
  end if;
  insert into public.child_contacts (child_id, name, relation, phone, can_pickup, is_primary)
  values (
    target_child_id,
    btrim(contact_name),
    btrim(contact_relation),
    nullif(btrim(coalesce(contact_phone, '')), ''),
    coalesce(contact_can_pickup, false),
    coalesce(contact_is_primary, false)
  )
  returning id into saved_id;
  return saved_id;
end;
$$;

create or replace function public.delete_child_contact(target_contact_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_child uuid;
begin
  if target_contact_id is null then raise exception 'Kontaktpersonen saknas'; end if;
  select child_id into owner_child
  from public.child_contacts
  where id = target_contact_id;
  if not found then raise exception 'Kontaktpersonen hittades inte'; end if;
  if public.current_profile_id() is null or not public.is_guardian(owner_child) then
    raise exception 'Bara barnets vårdnadshavare kan ta bort kontaktpersoner';
  end if;
  delete from public.child_contacts where id = target_contact_id;
end;
$$;

create or replace function public.set_child_consent(
  target_child_id uuid,
  consent_kind public.consent_type,
  consent_allowed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := public.current_profile_id();
begin
  if target_child_id is null or consent_kind is null or consent_allowed is null then
    raise exception 'Samtycket måste besvaras';
  end if;
  if caller is null or not public.is_guardian(target_child_id) then
    raise exception 'Bara barnets vårdnadshavare kan ändra samtycken';
  end if;
  insert into public.consents (child_id, type, allowed, updated_by, updated_at)
  values (target_child_id, consent_kind, consent_allowed, caller, now())
  on conflict (child_id, type) do update
  set allowed = excluded.allowed,
      updated_by = caller,
      updated_at = now();
end;
$$;

drop policy if exists "health authorized insert" on public.child_health;
drop policy if exists "health authorized update" on public.child_health;
drop policy if exists "health guardian insert" on public.child_health;
drop policy if exists "health guardian update" on public.child_health;
create policy "health guardian insert" on public.child_health
for insert with check (public.is_guardian(child_id));
create policy "health guardian update" on public.child_health
for update using (public.is_guardian(child_id))
with check (public.is_guardian(child_id));

drop policy if exists "contact guardian insert" on public.child_contacts;
drop policy if exists "contact guardian update" on public.child_contacts;
drop policy if exists "contact guardian delete" on public.child_contacts;
create policy "contact guardian insert" on public.child_contacts
for insert with check (public.is_guardian(child_id));
create policy "contact guardian update" on public.child_contacts
for update using (public.is_guardian(child_id))
with check (public.is_guardian(child_id));
create policy "contact guardian delete" on public.child_contacts
for delete using (public.is_guardian(child_id));

drop policy if exists "consent guardian insert" on public.consents;
drop policy if exists "consent guardian update" on public.consents;
create policy "consent guardian insert" on public.consents
for insert with check (public.is_guardian(child_id));
create policy "consent guardian update" on public.consents
for update using (public.is_guardian(child_id))
with check (public.is_guardian(child_id));

revoke all on table public.child_health from public, anon;
revoke all on table public.child_contacts from public, anon;
revoke all on table public.consents from public, anon;

revoke all on function public.update_child_profile(uuid, text, date, text) from public, anon, authenticated;
revoke all on function public.move_child_department(uuid, uuid) from public, anon, authenticated;
revoke all on function public.save_child_health(uuid, text[], text[], text, text, text) from public, anon, authenticated;
revoke all on function public.save_child_contact(uuid, uuid, text, text, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.delete_child_contact(uuid) from public, anon, authenticated;
revoke all on function public.set_child_consent(uuid, public.consent_type, boolean) from public, anon, authenticated;

grant execute on function public.update_child_profile(uuid, text, date, text) to authenticated;
grant execute on function public.move_child_department(uuid, uuid) to authenticated;
grant execute on function public.save_child_health(uuid, text[], text[], text, text, text) to authenticated;
grant execute on function public.save_child_contact(uuid, uuid, text, text, text, boolean, boolean) to authenticated;
grant execute on function public.delete_child_contact(uuid) to authenticated;
grant execute on function public.set_child_consent(uuid, public.consent_type, boolean) to authenticated;

commit;
