-- Arthur Pilot invite examples
-- Run after 002_invites.sql.

insert into public.invitations (
  id,
  organization_id,
  preschool_id,
  department_id,
  child_id,
  email,
  role,
  relation,
  code,
  max_uses,
  expires_at
)
values
  (
    '00000000-0000-4000-8000-000000009001',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000010',
    null,
    null,
    null,
    'admin',
    null,
    'ORG-SOLGLANTAN',
    3,
    now() + interval '30 days'
  ),
  (
    '00000000-0000-4000-8000-000000009002',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000101',
    null,
    null,
    'staff',
    null,
    'TEACHER-EKEN',
    5,
    now() + interval '30 days'
  ),
  (
    '00000000-0000-4000-8000-000000009003',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000010',
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000002001',
    null,
    'parent',
    'Vårdnadshavare',
    'PARENT-ELSA',
    2,
    now() + interval '30 days'
  ),
  (
    '00000000-0000-4000-8000-000000009004',
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000002002',
    null,
    'parent',
    'Vårdnadshavare',
    'PARENT-LOVE',
    2,
    now() + interval '30 days'
  )
on conflict (id) do update set
  code = excluded.code,
  role = excluded.role,
  max_uses = excluded.max_uses,
  expires_at = excluded.expires_at,
  status = 'pending',
  revoked_at = null;
