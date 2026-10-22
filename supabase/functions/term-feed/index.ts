// Public term calendar. verify_jwt is disabled at deploy time.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
// The raw token is hashed and never written to logs.
import { buildTermCalendar, type TermSchool } from "./ics.ts";

const encoder = new TextEncoder();

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function textResponse(body: string, status: number, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "GET") {
    return textResponse("Method not allowed", 405, { allow: "GET" });
  }

  const token = new URL(request.url).searchParams.get("token") || "";
  if (!token) return textResponse("Not found", 404);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return textResponse("Calendar feed is unavailable", 500);

  let payload: { found?: boolean; schools?: TermSchool[] } | null = null;
  try {
    const tokenHash = await sha256Hex(token);
    const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/lookup_calendar_feed`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ token_hash: tokenHash }),
    });
    if (!response.ok) return textResponse("Calendar feed is unavailable", 500);
    payload = await response.json();
  } catch {
    return textResponse("Calendar feed is unavailable", 500);
  }

  if (!payload?.found) return textResponse("Not found", 404);

  let body = "";
  try {
    body = buildTermCalendar(payload.schools || [], new Date());
  } catch {
    return textResponse("Calendar feed is unavailable", 500);
  }

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="termin.ics"',
      "cache-control": "private, max-age=3600",
    },
  });
});
