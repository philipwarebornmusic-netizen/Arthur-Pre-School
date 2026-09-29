-- Arthur Pilot v1 seed data
-- Safe fake data for first test school.

with org as (
  insert into public.organizations (id, name, type)
  values ('00000000-0000-4000-8000-000000000001', 'Solgläntan Förskolor', 'privat')
  on conflict (id) do update set name = excluded.name
  returning id
), preschool as (
  insert into public.preschools (id, organization_id, name)
  select '00000000-0000-4000-8000-000000000010', id, 'Solgläntan förskola' from org
  on conflict (id) do update set name = excluded.name
  returning id
), depts as (
  insert into public.departments (id, preschool_id, name)
  values
    ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000010', 'Eken'),
    ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000010', 'Linden')
  on conflict (id) do update set name = excluded.name
  returning id
)
select 1;

-- Profiles are linked to auth.users later by seed-auth script/service role.
insert into public.profiles (id, organization_id, name, email, role)
values
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000001', 'Sam Andersson', 'sam@arthur.test', 'parent'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', 'Johanna Talus', 'johanna@arthur.test', 'parent'),
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000001', 'Jon Pedagog', 'jon@arthur.test', 'staff'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000001', 'Maja Pedagog', 'maja@arthur.test', 'staff'),
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000001', 'Admin Arthur', 'admin@arthur.test', 'admin')
on conflict (id) do update set name = excluded.name, email = excluded.email, role = excluded.role;

insert into public.children (id, department_id, name, birth_year, avatar_color)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000101', 'Elsa', 2022, '#F7B733'),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000000102', 'Love', 2024, '#8EC5E8'),
  ('00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000000101', 'Noa', 2022, '#9BB89A'),
  ('00000000-0000-4000-8000-000000002004', '00000000-0000-4000-8000-000000000101', 'Signe', 2021, '#F4B6B6'),
  ('00000000-0000-4000-8000-000000002005', '00000000-0000-4000-8000-000000000101', 'Otto', 2022, '#8EC5E8'),
  ('00000000-0000-4000-8000-000000002006', '00000000-0000-4000-8000-000000000102', 'Maj', 2023, '#F7B733')
on conflict (id) do update set name = excluded.name, department_id = excluded.department_id;

insert into public.child_health (child_id, allergies, diet, conditions, medication, emergency)
values
  ('00000000-0000-4000-8000-000000002001', array['Jordnötter', 'Hasselnötter'], 'Nötfri kost. Ingen mandelmjölk.', array['Astma vid förkylning'], 'Airomir vid behov. Förvaras i medicinskåp märkt Elsa.', 'Ring 112 vid nötreaktion. Kontakta Sam 070-000 00 01.'),
  ('00000000-0000-4000-8000-000000002002', array[]::text[], 'Vegetarisk kost.', array[]::text[], 'Ingen medicin registrerad.', 'Kontakta vårdnadshavare vid feber.')
on conflict (child_id) do update set allergies = excluded.allergies, diet = excluded.diet, conditions = excluded.conditions, medication = excluded.medication, emergency = excluded.emergency, updated_at = now();


insert into public.child_guardians (child_id, profile_id, relation, can_pickup)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001001', 'Vårdnadshavare', true),
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001002', 'Vårdnadshavare', true),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001001', 'Vårdnadshavare', true),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001002', 'Vårdnadshavare', true)
on conflict do nothing;

insert into public.child_contacts (id, child_id, name, relation, phone, can_pickup, is_primary)
values
  ('00000000-0000-4000-8000-000000004001', '00000000-0000-4000-8000-000000002001', 'Sam Andersson', 'Vårdnadshavare', '070-000 00 01', true, true),
  ('00000000-0000-4000-8000-000000004002', '00000000-0000-4000-8000-000000002001', 'Johanna Talus', 'Vårdnadshavare', '070-000 00 02', true, false),
  ('00000000-0000-4000-8000-000000004003', '00000000-0000-4000-8000-000000002001', 'Morfar Lars', 'Morfar', '070-000 00 03', true, false),
  ('00000000-0000-4000-8000-000000004004', '00000000-0000-4000-8000-000000002001', 'Farmor Eva', 'Farmor', '070-000 00 04', false, false),
  ('00000000-0000-4000-8000-000000004005', '00000000-0000-4000-8000-000000002002', 'Sam Andersson', 'Vårdnadshavare', '070-000 00 01', true, true),
  ('00000000-0000-4000-8000-000000004006', '00000000-0000-4000-8000-000000002002', 'Johanna Talus', 'Vårdnadshavare', '070-000 00 02', true, false),
  ('00000000-0000-4000-8000-000000004007', '00000000-0000-4000-8000-000000002002', 'Mormor Karin', 'Mormor', '070-000 00 05', true, false)
on conflict (id) do update set name = excluded.name, relation = excluded.relation, phone = excluded.phone, can_pickup = excluded.can_pickup, is_primary = excluded.is_primary;


insert into public.staff_departments (staff_id, department_id)
values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000101'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000102')
on conflict do nothing;

insert into public.attendance (child_id, date, status, dropoff_at, pickup_at, pickup_by)
values
  ('00000000-0000-4000-8000-000000002001', current_date, 'in', '08:00', '16:00', 'Sam'),
  ('00000000-0000-4000-8000-000000002002', current_date, 'in', '08:30', '15:30', 'Sam'),
  ('00000000-0000-4000-8000-000000002003', current_date, 'in', '08:15', '16:15', null),
  ('00000000-0000-4000-8000-000000002004', current_date, 'in', '08:00', '15:45', null),
  ('00000000-0000-4000-8000-000000002005', current_date, 'in', '09:00', '16:30', null),
  ('00000000-0000-4000-8000-000000002006', current_date, 'in', '08:00', '15:00', null)
on conflict (child_id, date) do update set status = excluded.status, dropoff_at = excluded.dropoff_at, pickup_at = excluded.pickup_at;

insert into public.shelf_items (id, child_id, title, status, note)
values
  ('00000000-0000-4000-8000-000000005001', '00000000-0000-4000-8000-000000002001', 'Saknar extra strumpor', 'missing', 'Lägg gärna ett par på hyllan.'),
  ('00000000-0000-4000-8000-000000005002', '00000000-0000-4000-8000-000000002001', 'Regnkläder', 'ok', 'Hänger på kroken.'),
  ('00000000-0000-4000-8000-000000005003', '00000000-0000-4000-8000-000000002001', 'Extrakläder', 'ok', 'Tröja och byxor finns.'),
  ('00000000-0000-4000-8000-000000005004', '00000000-0000-4000-8000-000000002002', 'Blöjor börjar ta slut', 'low', '3 kvar på hyllan.'),
  ('00000000-0000-4000-8000-000000005005', '00000000-0000-4000-8000-000000002002', 'Vantar', 'ok', 'Ligger i korgen.')
on conflict (id) do update set title = excluded.title, status = excluded.status, note = excluded.note, updated_at = now();

insert into public.consents (child_id, type, allowed)
values
  ('00000000-0000-4000-8000-000000002001', 'app_images', true),
  ('00000000-0000-4000-8000-000000002001', 'group_images', true),
  ('00000000-0000-4000-8000-000000002001', 'social_media', false),
  ('00000000-0000-4000-8000-000000002002', 'app_images', false),
  ('00000000-0000-4000-8000-000000002002', 'group_images', false),
  ('00000000-0000-4000-8000-000000002002', 'social_media', false)
on conflict (child_id, type) do update set allowed = excluded.allowed;

insert into public.posts (id, department_id, child_id, author_id, type, title, body)
values
  ('00000000-0000-4000-8000-000000006001', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001101', 'diary', 'Kottar', 'Elsa och Noa lade en bana av kottar.'),
  ('00000000-0000-4000-8000-000000006002', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001102', 'diary', 'Vatten', 'Love hällde vatten i samma skål, om och om igen.')
on conflict (id) do update set title = excluded.title, body = excluded.body;

insert into public.documents (id, preschool_id, title, body, requires_signature)
values
  ('00000000-0000-4000-8000-000000003001', '00000000-0000-4000-8000-000000000010', 'Samtycke bildpublicering', 'Godkänn vad Arthur får visa i appen.', true),
  ('00000000-0000-4000-8000-000000003002', '00000000-0000-4000-8000-000000000010', 'Rutiner vid sjukdom', 'Så gör vi vid feber och magsjuka.', false)
on conflict (id) do update set title = excluded.title, body = excluded.body;

insert into public.lost_items (id, preschool_id, department_id, title, where_found)
values
  ('00000000-0000-4000-8000-000000007001', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000101', 'Blå mössa', 'Eken hall'),
  ('00000000-0000-4000-8000-000000007002', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000101', 'Randig vante', 'Torkskåpet')
on conflict (id) do update set title = excluded.title, where_found = excluded.where_found;

insert into public.calendar_feeds (child_id, guardian_id, token)
values
  ('00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000001001', 'elsa-sam-demo-calendar-token'),
  ('00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000001001', 'love-sam-demo-calendar-token')
on conflict (token) do nothing;

insert into public.calendar_events (id, child_id, preschool_id, department_id, type, title, description, starts_at, ends_at, all_day)
values
  ('00000000-0000-4000-8000-000000008001', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000101', 'schedule', 'Elsa på förskolan', 'Lämning 08:00. Hämtning 16:00 av Sam.', date_trunc('day', now()) + interval '8 hours', date_trunc('day', now()) + interval '16 hours', false),
  ('00000000-0000-4000-8000-000000008002', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000101', 'shelf_reminder', 'Ta med extra strumpor', 'Elsas hylla behöver fyllas på.', date_trunc('day', now()) + interval '1 day', null, true),
  ('00000000-0000-4000-8000-000000008003', '00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000102', 'shelf_reminder', 'Ta med blöjor', 'Loves hylla behöver fyllas på.', date_trunc('day', now()) + interval '1 day', null, true)
on conflict (id) do update set title = excluded.title, description = excluded.description, starts_at = excluded.starts_at, ends_at = excluded.ends_at;
