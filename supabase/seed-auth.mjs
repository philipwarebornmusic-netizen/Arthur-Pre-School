#!/usr/bin/env node

const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ARTHUR_TEST_PASSWORD || "Arthur123!";

if (!url || !secret) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env.");
  process.exit(1);
}

const users = [
  { email: "sam@arthur.test", name: "Sam Andersson", role: "parent" },
  { email: "johanna@arthur.test", name: "Johanna Talus", role: "parent" },
  { email: "jon@arthur.test", name: "Jon Pedagog", role: "staff" },
  { email: "maja@arthur.test", name: "Maja Pedagog", role: "staff" },
  { email: "admin@arthur.test", name: "Admin Arthur", role: "admin" },
];

async function request(path, options = {}) {
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed ${res.status}: ${text}`);
  }
  return body;
}

async function findAuthUser(email) {
  const body = await request(`/auth/v1/admin/users?page=1&per_page=100`);
  return body.users?.find((user) => user.email?.toLowerCase() === email.toLowerCase());
}

async function createOrGetAuthUser(user) {
  const existing = await findAuthUser(user.email);
  if (existing) return existing;
  return request(`/auth/v1/admin/users`, {
    method: "POST",
    body: JSON.stringify({
      email: user.email,
      password,
      email_confirm: true,
      user_metadata: { name: user.name, role: user.role },
    }),
  });
}

async function linkProfile(email, authUserId) {
  await request(`/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ auth_user_id: authUserId }),
  });
}

for (const user of users) {
  const authUser = await createOrGetAuthUser(user);
  await linkProfile(user.email, authUser.id);
  console.log(`${user.email}\t${authUser.id}\t${user.role}`);
}

console.log(`Done. Test password: ${password}`);
