const APP_NAME = "ärtan";
const STORAGE_KEY = "artan.session";
const config = window.ARTAN_SUPABASE || {};
const inviteFromUrl = new URLSearchParams(location.search).get("invite")?.trim() || "";

const state = {
  session: JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
  profile: null,
  organization: null,
  schools: [],
  departments: [],
  staffAssignments: [],
  children: [],
  health: [],
  contacts: [],
  consents: [],
  attendance: [],
  schoolTerms: [],
  termClosures: [],
  weeklySchedules: [],
  posts: [],
  postImages: [],
  postComments: [],
  communityMembers: [],
  guardianMessageTargets: [],
  privateMessages: [],
  playdateRequests: [],
  birthdayCandidates: [],
  birthdayInvitations: [],
  invitations: [],
  siblingRequests: [],
  joinRequests: [],
  staffMembers: [],
  onboarding: null,
  schoolCodeResult: null,
  migrationReady: true,
  selectedChildId: null,
  view: inviteFromUrl ? "join" : "home",
  authView: inviteFromUrl ? "register" : "login",
  inviteCode: inviteFromUrl,
  inviteResult: null,
  notice: null,
  busy: false,
  assistantOpen: false,
  assistantQuestion: "",
  assistantResponse: null,
  postPreviewUrls: [],
};

const screen = document.querySelector("#screen");
const nav = document.querySelector("#bottomNav");
const accountButton = document.querySelector('[data-action="account"]');
const assistantRoot = document.querySelector("#assistantRoot");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function compact(values) {
  return values.filter(Boolean);
}

function csv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function todayIso() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

function formatDate(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function formatTimestamp(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
const SWEDISH_MONTHS = {
  januari: 1, februari: 2, mars: 3, april: 4, maj: 5, juni: 6,
  juli: 7, augusti: 8, september: 9, oktober: 10, november: 11, december: 12,
};
const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag"];
const WEEKDAY_PATTERNS = [
  /måndag(?:ar)?/i, /tisdag(?:ar)?/i, /onsdag(?:ar)?/i, /torsdag(?:ar)?/i, /fredag(?:ar)?/i,
];

function isoDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) throw new Error("Ärtan kunde inte tolka ett av datumen.");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseSwedishDates(text) {
  const pattern = /\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)(?:\s+(\d{4}))?\b/gi;
  const matches = Array.from(text.matchAll(pattern));
  const currentYear = Number(todayIso().slice(0, 4));
  let firstDate = "";
  return matches.map((match, index) => {
    let year = match[1] ? Number(match[1]) : Number(match[6] || currentYear);
    const month = match[1] ? Number(match[2]) : SWEDISH_MONTHS[match[5].toLowerCase()];
    const day = match[1] ? Number(match[3]) : Number(match[4]);
    let parsed = isoDate(year, month, day);
    if (index === 1 && !match[1] && !match[6] && parsed < firstDate) {
      year += 1;
      parsed = isoDate(year, month, day);
    }
    if (index === 0) firstDate = parsed;
    return { value: parsed, index: match.index, end: match.index + match[0].length };
  });
}

function clockRanges(text) {
  return Array.from(text.matchAll(/\b([01]?\d|2[0-3])[.:]([0-5]\d)\s*[-–]\s*([01]?\d|2[0-3])[.:]([0-5]\d)\b/g), (match) => ({
    start: `${match[1].padStart(2, "0")}:${match[2]}`,
    end: `${match[3].padStart(2, "0")}:${match[4]}`,
    index: match.index,
  }));
}

function parseTermText(value) {
  const text = String(value || "").trim();
  const dates = parseSwedishDates(text);
  const times = clockRanges(text);
  if (dates.length < 2 || !times.length) throw new Error("Skriv terminens start, slut och öppettider, till exempel 3 augusti–18 december, 06.30–17.30.");
  const name = text.slice(0, dates[0].index).replace(/[-–,:]+$/g, "").trim() || "Termin";
  const closures = dates.slice(2).map((date, index) => {
    const next = dates[index + 3]?.index ?? text.length;
    const segment = text.slice(date.end, next).replace(/^[\s,.:;-]*(?:för\s+)?/i, "").replace(/\s+och\s*$/i, "").replace(/[.,;]+$/g, "").trim();
    let closureDate = date.value;
    if (closureDate < dates[0].value || closureDate > dates[1].value) {
      const endYearCandidate = `${dates[1].value.slice(0, 4)}${closureDate.slice(4)}`;
      if (endYearCandidate >= dates[0].value && endYearCandidate <= dates[1].value) closureDate = endYearCandidate;
    }
    return { date: closureDate, reason: segment || "Stängt" };
  });
  return { name, startsOn: dates[0].value, endsOn: dates[1].value, opensAt: times[0].start, closesAt: times[0].end, closures };
}

function weekdaysIn(value) {
  return WEEKDAY_PATTERNS.flatMap((pattern, index) => pattern.test(value) ? [index + 1] : []);
}

function parseWeeklyScheduleText(value) {
  const text = String(value || "").toLowerCase().replace(/[–—]/g, "-");
  const ranges = clockRanges(text);
  const rows = WEEKDAYS.map((_, index) => ({ weekday: index + 1, attending: false, dropoff_at: null, pickup_at: null }));
  let recognized = false;
  if (/(alla\s+dagar|vardagar)/.test(text) && ranges[0]) {
    rows.forEach((row) => Object.assign(row, { attending: true, dropoff_at: ranges[0].start, pickup_at: ranges[0].end }));
    recognized = true;
  }
  const exception = text.match(/utom\s+(.+?)(?:,?\s+då\s+)([01]?\d|2[0-3])[.:]([0-5]\d)\s*-\s*([01]?\d|2[0-3])[.:]([0-5]\d)/i);
  if (exception) {
    weekdaysIn(exception[1]).forEach((weekday) => Object.assign(rows[weekday - 1], {
      attending: true,
      dropoff_at: `${exception[2].padStart(2, "0")}:${exception[3]}`,
      pickup_at: `${exception[4].padStart(2, "0")}:${exception[5]}`,
    }));
    recognized = true;
  }
  for (const match of text.matchAll(/(måndag(?:ar)?|tisdag(?:ar)?|onsdag(?:ar)?|torsdag(?:ar)?|fredag(?:ar)?)[^.;\d]{0,30}([01]?\d|2[0-3])[.:]([0-5]\d)\s*-\s*([01]?\d|2[0-3])[.:]([0-5]\d)/gi)) {
    const weekday = weekdaysIn(match[1])[0];
    Object.assign(rows[weekday - 1], {
      attending: true,
      dropoff_at: `${match[2].padStart(2, "0")}:${match[3]}`,
      pickup_at: `${match[4].padStart(2, "0")}:${match[5]}`,
    });
    recognized = true;
  }
  for (const match of text.matchAll(/ledig(?:a)?\s+([^.;]+)/gi)) {
    weekdaysIn(match[1]).forEach((weekday) => Object.assign(rows[weekday - 1], { attending: false, dropoff_at: null, pickup_at: null }));
    recognized = true;
  }
  if (!recognized) throw new Error("Ärtan kunde inte tolka veckoschemat. Ange dagar och tider tydligare.");
  rows.forEach((row) => {
    if (row.attending && (!row.dropoff_at || !row.pickup_at || row.dropoff_at >= row.pickup_at)) throw new Error(`${WEEKDAYS[row.weekday - 1]} saknar giltig lämning och hämtning.`);
  });
  return rows;
}

function roleLabel(role) {
  return { admin: "Organisation", staff: "Personal", parent: "Förälder" }[role] || role;
}

function attendanceLabel(status) {
  return { in: "Incheckad", absent_sick: "Sjuk", absent_leave: "Ledig", picked_up: "Utcheckad", unregistered: "Inte incheckad" }[status] || "Inte incheckad";
}

function attendanceState(attendance) {
  if (!attendance) return "unregistered";
  if (attendance.checked_in_at && !attendance.checked_out_at) return "in";
  if (attendance.checked_out_at) return "picked_up";
  if (attendance.status === "absent_sick" || attendance.status === "absent_leave") return attendance.status;
  return "unregistered";
}

function formatClock(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function selectedChild() {
  return state.children.find((child) => child.id === state.selectedChildId) || state.children[0] || null;
}

function departmentName(id) {
  return state.departments.find((department) => department.id === id)?.name || "Okänd avdelning";
}

function schoolName(id) {
  return state.schools.find((school) => school.id === id)?.name || "Okänd skola";
}

function healthFor(childId) {
  return state.health.find((health) => health.child_id === childId) || {
    child_id: childId,
    allergies: [],
    diet: "",
    conditions: [],
    medication: "",
    emergency: "",
  };
}

function attendanceFor(childId) {
  return state.attendance.find((row) => row.child_id === childId) || null;
}

function contactsFor(childId) {
  return state.contacts.filter((contact) => contact.child_id === childId);
}

function consentFor(childId, type) {
  return state.consents.find((consent) => consent.child_id === childId && consent.type === type)?.allowed || false;
}

const CONSENT_OPTIONS = [
  ["app_images", "Bilder i ärtan"],
  ["group_images", "Gruppbilder"],
  ["social_media", "Skolans sociala medier"],
];

function consentRecorded(childId, type) {
  return state.consents.some((consent) => consent.child_id === childId && consent.type === type);
}

function childInfoChecklist(child) {
  const hasReviewedHealth = state.health.some((health) => health.child_id === child.id && health.updated_at);
  const hasContact = contactsFor(child.id).length > 0;
  const hasConsents = CONSENT_OPTIONS.every(([type]) => consentRecorded(child.id, type));
  return [
    { id: "child-basics", label: "Grunduppgifter", complete: Boolean(child.birth_date), reminder: "Fyll i barnets födelsedatum." },
    { id: "child-health", label: "Hälsa och omsorg", complete: hasReviewedHealth, reminder: "Gå igenom hälsa och omsorg, även om inget särskilt gäller." },
    { id: "child-contacts", label: "Kontaktpersoner", complete: hasContact, reminder: "Lägg till minst en kontaktperson." },
    { id: "child-consents", label: "Samtycken", complete: hasConsents, reminder: "Svara ja eller nej på alla samtycken." },
  ];
}

function parentReminders(child) {
  const reminders = [];
  const attendance = attendanceFor(child.id);
  if (!attendance) {
    reminders.push({ text: "Fyll i dagens plan med lämning och hämtning.", view: "home", target: "daily-plan" });
  } else if (attendance.status === "in" && !attendance.pickup_at) {
    reminders.push({ text: "Komplettera dagens plan med hämtningstid.", view: "home", target: "daily-plan" });
  }
  childInfoChecklist(child)
    .filter((item) => !item.complete)
    .forEach((item) => reminders.push({ text: item.reminder, view: "child", target: item.id }));
  return reminders.slice(0, 3);
}

function saveSession(session) {
  if (session?.access_token) {
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    state.session = { ...session, expires_at: expiresAt };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
  } else {
    state.session = null;
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function request(path, options = {}, authenticated = true) {
  if (!config.enabled || !config.url || !config.publishableKey) throw new Error("Supabase är inte konfigurerat.");
  const token = authenticated ? state.session?.access_token : config.publishableKey;
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token || config.publishableKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) {
    const message = body?.message || body?.error_description || body?.msg || body?.hint || text || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function rpc(name, args = {}) {
  return request(`/rest/v1/rpc/${name}`, { method: "POST", body: JSON.stringify(args) });
}

function encodedStoragePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

async function signPostImages(images) {
  if (!images.length) return [];
  const signed = await request("/storage/v1/object/sign/post-images", {
    method: "POST",
    body: JSON.stringify({ expiresIn: 3600, paths: images.map((image) => image.storage_path) }),
  });
  const urls = new Map((signed || []).map((item) => [item.path, item.signedURL || item.signedUrl]));
  return images.map((image) => {
    const signedPath = urls.get(image.storage_path);
    return { ...image, signed_url: signedPath ? (signedPath.startsWith("http") ? signedPath : `${config.url}${signedPath}`) : "" };
  });
}

async function uploadPostImage(path, blob) {
  return request(`/storage/v1/object/post-images/${encodedStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
    body: blob,
  });
}

async function deletePostImages(paths) {
  if (!paths.length) return;
  await request("/storage/v1/object/post-images", {
    method: "DELETE",
    body: JSON.stringify({ prefixes: paths }),
  });
}

async function transcodePostImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} är inte en bild.`);
  if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} är större än 20 MB.`);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
  if (!blob) throw new Error(`${file.name} kunde inte bearbetas.`);
  if (blob.size > 5 * 1024 * 1024) throw new Error(`${file.name} är fortfarande större än 5 MB efter optimering.`);
  return { blob, width, height };
}

function clearPostPreviews() {
  state.postPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
  state.postPreviewUrls = [];
}

function renderSelectedPostImages(input) {
  const form = input.closest("form");
  const preview = form?.querySelector("#post-image-preview");
  if (!preview) return;
  clearPostPreviews();
  const files = Array.from(input.files || []);
  if (files.length > 20) {
    input.value = "";
    preview.innerHTML = '<p class="notice error" role="status">Välj högst 20 bilder per inlägg.</p>';
    return;
  }
  preview.innerHTML = files.map((file, index) => {
    const url = URL.createObjectURL(file);
    state.postPreviewUrls.push(url);
    return `<article class="post-image-preview"><img src="${esc(url)}" alt=""><label>Bildbeskrivning ${index + 1}<input name="image_alt_text" maxlength="300" value="${esc(file.name.replace(/\.[^.]+$/, ""))}" required></label></article>`;
  }).join("");
}

async function publishPost(form, values) {
  const childId = values.child_id || null;
  if (childId && state.children.find((child) => child.id === childId)?.department_id !== values.department_id) throw new Error("Barnet tillhör inte vald avdelning.");
  const files = Array.from(form.querySelector('input[name="images"]')?.files || []);
  if (files.length > 20) throw new Error("Välj högst 20 bilder per inlägg.");
  const formData = new FormData(form);
  const visibleChildIds = formData.getAll("visible_child_ids");
  const noChildrenVisible = formData.get("no_children_visible") === "on";
  if (files.length && noChildrenVisible === (visibleChildIds.length > 0)) throw new Error("Markera vilka barn som syns eller bekräfta att inga barn syns.");
  if (!files.length && (noChildrenVisible || visibleChildIds.length)) throw new Error("Bildmarkeringar får bara anges när du har valt bilder.");
  const postId = crypto.randomUUID();
  const uploadedPaths = [];
  try {
    const altTexts = formData.getAll("image_alt_text");
    const media = [];
    for (const [index, file] of files.entries()) {
      const prepared = await transcodePostImage(file);
      const storagePath = `${state.profile.organization_id}/${state.session.user.id}/${postId}/${index}.jpg`;
      await uploadPostImage(storagePath, prepared.blob);
      uploadedPaths.push(storagePath);
      media.push({
        storage_path: storagePath,
        position: index,
        alt_text: String(altTexts[index] || `Bild ${index + 1} till ${values.title.trim()}`).trim(),
        width: prepared.width,
        height: prepared.height,
        byte_size: prepared.blob.size,
      });
    }
    await rpc("create_post_with_images", {
      target_post_id: postId,
      target_department_id: values.department_id,
      target_child_id: childId,
      post_title: values.title.trim(),
      post_body: values.body.trim(),
      media,
      visible_child_ids: visibleChildIds,
      no_children_visible: noChildrenVisible,
    });
    clearPostPreviews();
  } catch (error) {
    if (uploadedPaths.length) {
      try {
        await deletePostImages(uploadedPaths);
      } catch (cleanupError) {
        throw new Error(`${error.message} Uppladdade utkast kunde inte rensas: ${cleanupError.message}`);
      }
    }
    throw error;
  }
}

async function refreshSessionIfNeeded() {
  if (!state.session?.refresh_token) return;
  if (Number(state.session.expires_at || 0) > Math.floor(Date.now() / 1000) + 60) return;
  try {
    const session = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: state.session.refresh_token }),
    }, false);
    saveSession(session);
  } catch {
    saveSession(null);
  }
}

async function login(email, password) {
  const session = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  }, false);
  saveSession(session);
  await loadData();
}

async function register(email, password, name) {
  const redirectTo = new URL(location.href);
  const result = await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectTo.toString())}`, {
    method: "POST",
    body: JSON.stringify({ email, password, data: { name } }),
  }, false);
  if (!result.access_token) {
    state.notice = { type: "success", text: "Kontot är skapat. Bekräfta e-postadressen och logga sedan in." };
    state.authView = "login";
    return;
  }
  saveSession(result);
  if (state.inviteCode) await acceptInvitation(state.inviteCode);
  else await loadData();
}

async function logout() {
  try {
    if (state.session) await request("/auth/v1/logout", { method: "POST" });
  } finally {
    saveSession(null);
    Object.assign(state, {
      profile: null,
      organization: null,
      schools: [],
      departments: [],
      staffAssignments: [],
      children: [],
      health: [],
      contacts: [],
      consents: [],
      attendance: [],
      schoolTerms: [],
      termClosures: [],
      weeklySchedules: [],
      posts: [],
      postImages: [],
      postComments: [],
      communityMembers: [],
      guardianMessageTargets: [],
      privateMessages: [],
      playdateRequests: [],
      birthdayCandidates: [],
      birthdayInvitations: [],
      invitations: [],
      siblingRequests: [],
      joinRequests: [],
      staffMembers: [],
      onboarding: null,
      schoolCodeResult: null,
      inviteResult: null,
      inviteCode: "",
      migrationReady: true,
      selectedChildId: null,
      view: "home",
      notice: null,
      assistantOpen: false,
      assistantQuestion: "",
      assistantResponse: null,
    });
  }
}

async function loadData() {
  await refreshSessionIfNeeded();
  if (!state.session?.access_token) return;
  const userId = state.session.user?.id;
  if (!userId) throw new Error("Sessionen saknar användar-id.");
  state.migrationReady = true;
  const profileWithAccess = "id,auth_user_id,organization_id,name,email,phone,role,removed_at,allow_parent_messages,allow_playdate_requests,allow_birthday_invitations";
  const profileWithoutAccess = "id,auth_user_id,organization_id,name,email,phone,role,allow_parent_messages,allow_playdate_requests,allow_birthday_invitations";
  let profiles;
  try {
    profiles = await request(`/rest/v1/profiles?select=${profileWithAccess}&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  } catch (error) {
    if (!/removed_at|column|schema cache/i.test(error.message)) throw error;
    state.migrationReady = false;
    profiles = await request(`/rest/v1/profiles?select=${profileWithoutAccess}&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  }
  state.profile = profiles[0] || null;
  if (!state.profile || state.profile.removed_at) {
    clearLoadedData();
    if (!state.profile) {
      try {
        state.onboarding = await rpc("my_onboarding_status");
      } catch (error) {
        if (!/schema cache|could not find the function|pgrst202/i.test(error.message)) throw error;
        state.migrationReady = false;
        state.onboarding = { kind: "none" };
      }
      state.view = state.onboarding?.kind === "pending" ? "pending" : "onboarding";
    } else {
      state.onboarding = { kind: "removed" };
      state.view = "removed";
    }
    return;
  }

  const organizationId = encodeURIComponent(state.profile.organization_id);
  const date = todayIso();
  const [organizations, schools, departments, staffAssignments, children, health, contacts, consents, attendance, schoolTerms, termClosures, weeklySchedules, posts, postImages, invitations, postComments, communityMembers, guardianMessageTargets, privateMessages, playdateRequests, birthdayCandidates, birthdayInvitations, siblingRequests, joinRequests, staffMembers] = await Promise.all([
    request(`/rest/v1/organizations?select=id,name,type,created_at&id=eq.${organizationId}&limit=1`),
    request(`/rest/v1/preschools?select=id,organization_id,name,phone,address,postal_code,city,opening_hours,created_at&organization_id=eq.${organizationId}&order=name.asc`),
    request("/rest/v1/departments?select=id,preschool_id,name,created_at&order=name.asc"),
    request("/rest/v1/staff_departments?select=staff_id,department_id"),
    request("/rest/v1/children?select=id,department_id,name,birth_date,notes,avatar_color,created_at&order=name.asc"),
    request("/rest/v1/child_health?select=child_id,allergies,diet,conditions,medication,emergency,updated_at"),
    request("/rest/v1/child_contacts?select=id,child_id,name,relation,phone,can_pickup,is_primary,created_at&order=name.asc"),
    request("/rest/v1/consents?select=child_id,type,allowed,updated_at"),
    request(`/rest/v1/attendance?select=id,child_id,date,status,dropoff_at,pickup_at,pickup_by,checked_in_at,checked_out_at,updated_at&date=eq.${date}`),
    rpc("list_school_terms"),
    rpc("list_school_term_closures"),
    rpc("list_child_weekly_schedules"),
    request("/rest/v1/posts?select=id,department_id,child_id,author_id,type,title,body,created_at&order=created_at.desc&limit=100"),
    rpc("list_post_images"),
    request("/rest/v1/invitations?select=id,email,role,relation,status,preschool_id,department_id,child_id,expires_at,created_at&order=created_at.desc&limit=100"),
    rpc("list_post_comments"),
    rpc("list_community_members"),
    rpc("list_guardian_message_targets"),
    rpc("list_private_messages"),
    rpc("list_playdate_requests"),
    rpc("list_birthday_candidates"),
    rpc("list_birthday_invitations"),
    optionalRpc("list_sibling_requests"),
    state.profile.role === "admin" ? optionalRpc("list_join_requests") : Promise.resolve([]),
    state.profile.role === "admin" ? optionalRpc("list_staff_members") : Promise.resolve([]),
  ]);

  state.organization = organizations[0] || null;
  state.schools = schools;
  state.departments = departments;
  state.staffAssignments = staffAssignments;
  state.children = children;
  state.health = health;
  state.contacts = contacts;
  state.consents = consents;
  state.attendance = attendance;
  state.schoolTerms = schoolTerms;
  state.termClosures = termClosures;
  state.weeklySchedules = weeklySchedules;
  state.posts = posts;
  state.postImages = await signPostImages(postImages);
  state.invitations = invitations;
  state.postComments = postComments;
  state.communityMembers = communityMembers;
  state.guardianMessageTargets = guardianMessageTargets;
  state.privateMessages = privateMessages;
  state.playdateRequests = playdateRequests;
  state.birthdayCandidates = birthdayCandidates;
  state.birthdayInvitations = birthdayInvitations;
  state.siblingRequests = siblingRequests || [];
  state.joinRequests = joinRequests || [];
  state.staffMembers = staffMembers || [];
  state.onboarding = { kind: "active" };
  if (!state.children.some((child) => child.id === state.selectedChildId)) state.selectedChildId = state.children[0]?.id || null;
  const allowedViews = {
    admin: ["overview", "attendance", "schools", "messages", "people", "account"],
    staff: ["attendance", "messages", "people", "account"],
    parent: ["home", "child", "messages", "account"],
  };
  const roleViews = allowedViews[state.profile.role] || allowedViews.parent;
  if (!roleViews.includes(state.view)) state.view = roleViews[0];
}

function clearLoadedData() {
  Object.assign(state, {
    organization: null,
    schools: [],
    departments: [],
    staffAssignments: [],
    children: [],
    health: [],
    contacts: [],
    consents: [],
    attendance: [],
    schoolTerms: [],
    termClosures: [],
    weeklySchedules: [],
    posts: [],
    postImages: [],
    postComments: [],
    communityMembers: [],
    guardianMessageTargets: [],
    privateMessages: [],
    playdateRequests: [],
    birthdayCandidates: [],
    birthdayInvitations: [],
    invitations: [],
    siblingRequests: [],
    joinRequests: [],
    staffMembers: [],
    selectedChildId: null,
  });
}

async function acceptInvitation(code) {
  await rpc("accept_invitation", { invite_code: code.trim() });
  state.inviteCode = "";
  const url = new URL(location.href);
  url.searchParams.delete("invite");
  history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  await loadData();
  state.notice = { type: "success", text: "Inbjudan är accepterad. Välkommen till ärtan!" };
}

function noticeHtml() {
  const migration = state.migrationReady === false
    ? `<div class="notice error" role="status">Inbjudningsreglerna är inte aktiverade i databasen ännu. Befintliga uppgifter kan visas, men nya inbjudningar och godkännanden börjar fungera först när migreringen har körts.</div>`
    : "";
  if (!state.notice) return migration;
  return `${migration}<div class="notice ${esc(state.notice.type)}" role="status">${esc(state.notice.text)}</div>`;
}

function optionalRpc(name, args) {
  return rpc(name, args).catch((error) => {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.migrationReady = false;
      return [];
    }
    throw error;
  });
}

function botMascot(decorative = false) {
  const accessibility = decorative ? 'aria-hidden="true"' : 'role="img" aria-label="Ärtan, din digitala hjälpreda"';
  return `<span class="bot-mascot" ${accessibility}></span>`;
}

function assistantQuickActions() {
  const parentActions = {
    home: [["schedule", "Ändra lämning/hämtning"], ["day", "Vad är dagens plan?"], ["reminders", "Vad behöver jag göra?"], ["messages", "Nytt från skolan?"]],
    child: [["schedule", "Ändra lämning/hämtning"], ["reminders", "Vad saknas?"], ["consents", "Hur ser samtyckena ut?"], ["contact", "Kontakta förskolan"]],
    messages: [["birthdays", "Kalasinbjudningar"], ["schedule", "Ändra lämning/hämtning"], ["messages", "Sammanfatta skolans flöde"], ["playdates", "Hur fungerar lekträffar?"]],
    account: [["schedule", "Ändra lämning/hämtning"], ["privacy", "Mina integritetsval"], ["contact", "Vem kan jag kontakta?"], ["reminders", "Vad behöver jag göra?"]],
  };
  const staffActions = {
    attendance: [["attendance", "Sammanfatta närvaron"], ["publish", "Skriv till föräldrar"], ["private", "Skicka privat"], ["people", "Öppna barn och inbjudningar"]],
    messages: [["publish", "Publicera ett inlägg"], ["private", "Skicka privat"], ["posts", "Sammanfatta flödet"], ["attendance", "Hur ser närvaron ut?"]],
    people: [["people", "Sammanfatta personer"], ["attendance", "Hur ser närvaron ut?"], ["publish", "Skriv till föräldrar"], ["private", "Skicka privat"]],
    account: [["private", "Kontakta en förälder"], ["attendance", "Hur ser närvaron ut?"], ["publish", "Skriv till föräldrar"], ["people", "Öppna barn och inbjudningar"]],
  };
  const adminActions = {
    overview: [["overview", "Sammanfatta organisationen"], ["attendance", "Öppna dagens närvaro"], ["publish", "Skriv till föräldrar"], ["private", "Skicka privat"]],
    attendance: [["attendance", "Sammanfatta närvaron"], ["publish", "Skriv till föräldrar"], ["private", "Skicka privat"], ["people", "Barn och inbjudningar"]],
    schools: [["schools", "Sammanfatta skolorna"], ["attendance", "Öppna dagens närvaro"], ["publish", "Skriv till föräldrar"], ["people", "Barn och inbjudningar"]],
    messages: [["publish", "Publicera ett inlägg"], ["private", "Skicka privat"], ["posts", "Sammanfatta flödet"], ["attendance", "Hur ser närvaron ut?"]],
    people: [["people", "Sammanfatta personer"], ["attendance", "Öppna dagens närvaro"], ["publish", "Skriv till föräldrar"], ["private", "Skicka privat"]],
    account: [["attendance", "Öppna dagens närvaro"], ["overview", "Organisationens översikt"], ["private", "Kontakta en förälder"], ["publish", "Skriv till föräldrar"]],
  };
  const roleActions = state.profile.role === "parent" ? parentActions : state.profile.role === "staff" ? staffActions : adminActions;
  return roleActions[state.view] || Object.values(roleActions)[0] || [];
}

function assistantResult(text, source, action = {}) {
  return { text, source, ...action };
}

function schoolForChild(child) {
  const department = state.departments.find((item) => item.id === child?.department_id);
  return state.schools.find((school) => school.id === department?.preschool_id) || null;
}

function parentAssistantAnswer(intent) {
  const child = selectedChild();
  if (!child && ["day", "schedule", "reminders", "opening-hours", "consents", "health"].includes(intent)) {
    return assistantResult(
      "Du är inte kopplad till något barn ännu. Personalen bjuder in dig till barnet, eller så skickar du en syskonförfrågan som personalen godkänner innan barnet kopplas.",
      "Ditt konto i ärtan",
      { actionLabel: "Skicka förfrågan", view: "child" },
    );
  }
  if (intent === "schedule") {
    const attendance = attendanceFor(child.id);
    const pickupContacts = contactsFor(child.id).filter((contact) => contact.can_pickup);
    const currentPlan = attendance
      ? compact([
        attendance.dropoff_at ? `lämning ${attendance.dropoff_at.slice(0, 5)}` : "ingen lämningstid",
        attendance.pickup_at ? `hämtning ${attendance.pickup_at.slice(0, 5)}` : "ingen hämtningstid",
        attendance.pickup_by ? `hämtas av ${attendance.pickup_by}` : "ingen hämtare angiven",
      ]).join(", ")
      : "ingen plan är ifylld";
    const pickupHelp = pickupContacts.length
      ? `Registrerade personer som får hämta: ${new Intl.ListFormat("sv-SE").format(pickupContacts.map((contact) => contact.name))}.`
      : "Du kan skriva exempelvis en vårdnadshavare, mormor, morfar, farmor, farfar eller en annan godkänd person.";
    return assistantResult(
      `Dagens plan för ${child.name}: ${currentPlan}.\n${pickupHelp} Öppna planen, ändra uppgifterna och spara när allt stämmer.`,
      "Dagens plan och barnets kontaktpersoner i ärtan",
      { actionLabel: "Ändra tider och hämtare", view: "home", target: "daily-plan" },
    );
  }
  if (intent === "day") {
    const attendance = attendanceFor(child.id);
    if (!attendance) {
      return assistantResult(
        `Dagens plan för ${child.name} är inte ifylld ännu.`,
        "Dagens plan i ärtan",
        { actionLabel: "Fyll i dagens plan", view: "home", target: "daily-plan" },
      );
    }
    const times = compact([
      attendance.dropoff_at ? `lämning ${attendance.dropoff_at.slice(0, 5)}` : "",
      attendance.pickup_at ? `hämtning ${attendance.pickup_at.slice(0, 5)}` : "",
      attendance.pickup_by ? `hämtas av ${attendance.pickup_by}` : "",
    ]);
    return assistantResult(
      `${child.name}: ${attendanceLabel(attendanceState(attendance))}${times.length ? `. ${times.join(", ")}.` : "."}`,
      "Dagens plan i ärtan",
      { actionLabel: "Öppna dagens plan", view: "home", target: "daily-plan" },
    );
  }
  if (intent === "reminders") {
    const reminders = parentReminders(child);
    if (!reminders.length) return assistantResult("Allt i dagens plan och barnets checklista är uppdaterat.", "Barnuppgifter och dagens plan");
    return assistantResult(
      `Jag hittade ${reminders.length} ${reminders.length === 1 ? "sak" : "saker"}:\n• ${reminders.map((reminder) => reminder.text).join("\n• ")}`,
      "Barnuppgifter och dagens plan",
      { actionLabel: "Ta hand om nästa sak", view: reminders[0].view, target: reminders[0].target },
    );
  }
  if (intent === "messages") {
    const latest = state.posts[0];
    if (!latest) return assistantResult("Skolan har inte publicerat något ännu.", "Skolans flöde", { actionLabel: "Öppna Gemenskap", view: "messages" });
    return assistantResult(
      `Du har ${state.posts.length} ${state.posts.length === 1 ? "officiellt inlägg" : "officiella inlägg"}. Senast publicerades ”${latest.title}” ${formatTimestamp(latest.created_at)}.`,
      "Skolans flöde",
      { actionLabel: "Läs skolans flöde", view: "messages", target: "official-feed" },
    );
  }
  if (intent === "contact") {
    const contacts = state.communityMembers.filter((member) => member.can_message && member.profile_role !== "parent");
    if (!contacts.length) return assistantResult("Ingen kontaktperson är tillgänglig i appen ännu.", "Gemenskapens kontaktlista");
    const names = contacts.slice(0, 3).map((member) => `${member.display_name} (${roleLabel(member.profile_role)})`);
    return assistantResult(
      `Du kan skriva privat till ${new Intl.ListFormat("sv-SE").format(names)}${contacts.length > names.length ? ` och ${contacts.length - names.length} till` : ""}.`,
      "Gemenskapens kontaktlista",
      { actionLabel: "Öppna privata meddelanden", view: "messages", target: "private-messaging" },
    );
  }
  if (intent === "opening-hours") {
    const school = schoolForChild(child);
    if (!school?.opening_hours) return assistantResult("Förskolans öppettider är inte registrerade ännu. Kontakta personalen för ett säkert svar.", "Förskolans registrerade uppgifter", { actionLabel: "Kontakta personalen", view: "messages", target: "private-messaging" });
    return assistantResult(`${school.name} har registrerade öppettider: ${school.opening_hours}.`, "Förskolans registrerade öppettider");
  }
  if (intent === "calendar") {
    const preschoolId = childSchoolId(child);
    const term = state.schoolTerms.find((item) => item.preschool_id === preschoolId && item.term_status === "published");
    if (!term) return assistantResult("Förskolan har inte publicerat någon termin ännu.", "Publicerade terminer");
    const closures = closuresForTerm(term.term_id);
    const closureText = closures.length ? ` Stängt: ${closures.map((closure) => `${formatDate(closure.closure_date)} (${closure.reason})`).join(", ")}.` : " Inga stängningsdagar är publicerade.";
    return assistantResult(
      `${term.term_name}: ${termDateSummary(term)}.${closureText}`,
      "Förskolans publicerade termin",
      { actionLabel: "Öppna termin och veckoschema", view: "home", target: "term-overview" },
    );
  }
  if (intent === "consents") {
    const answers = CONSENT_OPTIONS.map(([type, label]) => {
      if (!consentRecorded(child.id, type)) return `${label}: obesvarat`;
      return `${label}: ${consentFor(child.id, type) ? "ja" : "nej"}`;
    });
    return assistantResult(
      answers.join("\n"),
      `${child.name}s samtycken`,
      { actionLabel: "Öppna samtycken", view: "child", target: "child-consents" },
    );
  }
  if (intent === "playdates") {
    const available = state.communityMembers.filter((member) => member.can_playdate).length;
    const pending = state.playdateRequests.filter((request) => request.status === "pending").length;
    const status = state.profile.allow_playdate_requests ? `Funktionen är på. ${available} ${available === 1 ? "vårdnadshavare är tillgänglig" : "vårdnadshavare är tillgängliga"} och ${pending} förfrågningar väntar.` : "Lekträffar är avstängda. Du kan aktivera dem under Konto.";
    return assistantResult(status, "Dina inställningar och lekförfrågningar", { actionLabel: state.profile.allow_playdate_requests ? "Öppna lekträffar" : "Öppna Konto", view: state.profile.allow_playdate_requests ? "messages" : "account", target: state.profile.allow_playdate_requests ? "playdates" : "" });
  }
  if (intent === "birthdays") {
    const invitations = birthdayInvitationGroups();
    const received = invitations.filter((invitation) => invitation.host_parent_id !== state.profile.id);
    const pending = received.filter((invitation) => invitation.invitation_status === "active" && invitation.recipients.some((recipient) => recipient.id === state.profile.id && recipient.status === "pending")).length;
    const sent = invitations.filter((invitation) => invitation.host_parent_id === state.profile.id && invitation.invitation_status === "active").length;
    const status = state.profile.allow_birthday_invitations
      ? `${pending} ${pending === 1 ? "kalasinbjudan väntar" : "kalasinbjudningar väntar"} på ditt svar. Du har ${sent} ${sent === 1 ? "aktivt kalas" : "aktiva kalas"} som värd.`
      : "Kalasinbjudningar är avstängda. Du kan aktivera dem separat under Konto.";
    return assistantResult(status, "Dina privata kalasinbjudningar", { actionLabel: state.profile.allow_birthday_invitations ? "Öppna kalasinbjudningar" : "Öppna Konto", view: state.profile.allow_birthday_invitations ? "messages" : "account", target: state.profile.allow_birthday_invitations ? "birthday-invitations" : "" });
  }
  if (intent === "privacy") {
    return assistantResult(
      `Föräldrameddelanden är ${state.profile.allow_parent_messages ? "på" : "av"}. Lekförfrågningar är ${state.profile.allow_playdate_requests ? "på" : "av"}. Kalasinbjudningar är ${state.profile.allow_birthday_invitations ? "på" : "av"}. Varje funktion kräver ett ömsesidigt frivilligt val och gemensam avdelning.`,
      "Dina integritetsinställningar",
      { actionLabel: "Öppna Konto", view: "account" },
    );
  }
  if (intent === "health") {
    return assistantResult(
      "Hälsa och omsorg hanteras i barnets skyddade uppgifter. Jag visar inte känsliga detaljer i chatten.",
      "Barnuppgifter i ärtan",
      { actionLabel: "Öppna hälsa och omsorg", view: "child", target: "child-health" },
    );
  }
  return assistantResult(
    "Jag kan hjälpa med dagens plan, lämning och hämtning, veckoschema, publicerade terminer, kalasinbjudningar, skolans inlägg, öppettider, samtycken och rätt kontakt.",
    "Tillgängliga funktioner i ärtan",
  );
}

function staffAssistantAnswer(intent) {
  if (intent === "attendance") {
    const counts = state.children.reduce((result, child) => {
      const status = attendanceState(attendanceFor(child.id));
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {});
    return assistantResult(
      `${state.children.length} barn är synliga för dig idag: ${counts.in || 0} incheckade, ${counts.picked_up || 0} utcheckade, ${(counts.absent_sick || 0) + (counts.absent_leave || 0)} frånvarande och ${counts.unregistered || 0} inte incheckade.`,
      "Dagens närvarolista",
      { actionLabel: "Öppna Närvaro", view: "attendance" },
    );
  }
  if (intent === "publish") {
    return assistantResult(
      "Jag kan öppna formuläret för ett officiellt inlägg. Välj avdelning, eventuell barnmottagare och granska texten innan du publicerar.",
      "Skolans befintliga publiceringsflöde",
      { actionLabel: "Skriv officiellt inlägg", view: "messages", target: "official-post-form" },
    );
  }
  if (intent === "private" || intent === "contact") {
    const recipients = state.communityMembers.filter((member) => member.can_message);
    return assistantResult(
      recipients.length ? `${recipients.length} behöriga mottagare är tillgängliga för privata meddelanden.` : "Ingen privat mottagare är tillgänglig ännu.",
      "Gemenskapens kontaktlista",
      recipients.length ? { actionLabel: "Skriv privat", view: "messages", target: "private-messaging" } : {},
    );
  }
  if (intent === "people") {
    const pending = state.invitations.filter((invite) => invite.status === "pending").length;
    return assistantResult(
      `${state.children.length} barn och ${pending} ${pending === 1 ? "väntande inbjudan" : "väntande inbjudningar"} är synliga för dig.`,
      "Personer och inbjudningar",
      { actionLabel: "Öppna Personer", view: "people" },
    );
  }
  if (intent === "posts" || intent === "messages") {
    const latest = state.posts[0];
    return assistantResult(
      latest ? `${state.posts.length} officiella inlägg finns i flödet. Senast: ”${latest.title}” ${formatTimestamp(latest.created_at)}.` : "Det finns inga officiella inlägg ännu.",
      "Skolans flöde",
      { actionLabel: "Öppna Gemenskap", view: "messages", target: "official-feed" },
    );
  }
  if (intent === "overview") {
    return assistantResult(
      `${state.organization?.name || "Organisationen"} har ${state.schools.length} ${state.schools.length === 1 ? "skola" : "skolor"}, ${state.departments.length} ${state.departments.length === 1 ? "avdelning" : "avdelningar"} och ${state.children.length} registrerade barn.`,
      "Organisationsöversikten",
      { actionLabel: "Öppna Översikt", view: isAdmin ? "overview" : "people" },
    );
  }
  if (intent === "schools" || intent === "opening-hours") {
    const schools = state.schools.map((school) => `${school.name}${school.opening_hours ? ` (${school.opening_hours})` : ""}`);
    return assistantResult(
      schools.length ? schools.join("\n") : "Ingen skola är registrerad ännu.",
      "Skolornas registrerade uppgifter",
      isAdmin ? { actionLabel: "Öppna Skolor", view: "schools" } : {},
    );
  }
  if (intent === "privacy" || intent === "consents") {
    return assistantResult(
      "Markera alla barn som syns i ett bildinlägg eller bekräfta att inga barn syns. Servern kontrollerar aktuellt bild- och gruppbildssamtycke före publicering.",
      "Bildpublicering med samtyckeskontroll",
      { actionLabel: "Öppna skolans flöde", view: "messages", target: "official-post-form" },
    );
  }
  if (intent === "calendar") {
    const published = state.schoolTerms.filter((term) => term.term_status === "published").length;
    const drafts = state.schoolTerms.filter((term) => term.term_status === "draft").length;
    return assistantResult(
      `${published} publicerade terminer och ${drafts} utkast är synliga för dig.`,
      "Terminer och veckoscheman",
      isAdmin ? { actionLabel: "Planera terminer", view: "schools" } : {},
    );
  }
  return assistantResult(
    "Jag kan öppna rätt arbetsflöde och sammanfatta närvaro, personer, skolor, terminer, inlägg och privata mottagare.",
    "Tillgängliga funktioner i ärtan",
  );
}

function assistantIntentForQuestion(question) {
  const text = question.trim().toLocaleLowerCase("sv-SE");
  const staff = state.profile.role !== "parent";
  if (/öppettid|öppet/.test(text)) return "opening-hours";
  if (/stäng|kalender|utvecklingssamtal|aktivitet|utflykt/.test(text)) return "calendar";
  if (/samtyck|bild|foto/.test(text)) return staff ? "privacy" : "consents";
  if (!staff && /lekträff|lekdejt/.test(text)) return "playdates";
  if (!staff && /kalas|födelsedag|födelsedags|osa/.test(text)) return "birthdays";
  if (!staff && /hälsa|allerg|medicin|specialkost/.test(text)) return "health";
  if (!staff && /(?:ändra|justera|uppdatera).*(?:lämn|hämt|tid)|(?:lämn|hämt|tid).*(?:ändra|justera|uppdatera)|vem (?:ska )?(?:lämna|hämta)|hämtas av|mormor|morfar|farmor|farfar/.test(text)) return "schedule";
  if (staff && /publicera|officiell|veckobrev|skriv.*inlägg/.test(text)) return "publish";
  if (staff && /närvaro|inne|hämtad|frånvaro/.test(text)) return "attendance";
  if (staff && /person|inbjud|barn/.test(text)) return "people";
  if (staff && /organisation|översikt/.test(text)) return "overview";
  if (staff && /skola|avdelning/.test(text)) return "schools";
  if (/kontakt|vem|privat|skriv.*till/.test(text)) return staff ? "private" : "contact";
  if (/meddelande|inlägg|nytt från skolan|skolans flöde/.test(text)) return staff ? "posts" : "messages";
  if (!staff && /integritet|inställning|hitta mig/.test(text)) return "privacy";
  if (!staff && /påminn|behöver|saknas|göra/.test(text)) return "reminders";
  if (!staff && /idag|dagens|lämn|hämt/.test(text)) return "day";
  return "help";
}

function assistantAnswer(intent) {
  return state.profile.role === "parent" ? parentAssistantAnswer(intent) : staffAssistantAnswer(intent);
}

function renderAssistant() {
  if (!assistantRoot) return;
  if (!state.session || !state.profile) {
    assistantRoot.innerHTML = "";
    return;
  }
  const quickActions = assistantQuickActions();
  const response = state.assistantResponse;
  assistantRoot.innerHTML = `<button class="assistant-launcher" type="button" data-action="assistant-toggle" aria-expanded="${state.assistantOpen}" aria-controls="assistantPanel" ${state.assistantOpen ? "hidden" : ""}>
      ${botMascot(true)}<span><strong>Ärtan</strong><small>Fråga mig</small></span>
    </button>
    ${state.assistantOpen ? `<section id="assistantPanel" class="assistant-panel" role="dialog" aria-modal="false" aria-labelledby="assistantTitle">
      <header class="assistant-header"><div class="assistant-heading">${botMascot(true)}<div><p class="kicker">Din digitala hjälpreda</p><h2 id="assistantTitle">Fråga Ärtan</h2></div></div><button class="assistant-close" type="button" data-action="assistant-close" aria-label="Stäng Ärtan">×</button></header>
      <p class="assistant-intro">Jag använder bara det som redan finns i appen. Ingen chatthistorik sparas.</p>
      <div class="assistant-quick-actions" aria-label="Snabbval">${quickActions.map(([intent, label]) => `<button type="button" data-action="assistant-quick" data-intent="${esc(intent)}">${esc(label)}</button>`).join("")}</div>
      ${response ? `<section class="assistant-conversation" aria-live="polite">${state.assistantQuestion ? `<p class="assistant-question">${esc(state.assistantQuestion)}</p>` : ""}<div id="assistantAnswer" class="assistant-answer" tabindex="-1"><strong>Ärtan</strong><p>${esc(response.text)}</p>${response.source ? `<small>Källa: ${esc(response.source)}</small>` : ""}${response.actionLabel ? `<button class="primary assistant-answer-action" type="button" data-action="assistant-go" data-view="${esc(response.view)}" data-target="${esc(response.target || "")}">${esc(response.actionLabel)}</button>` : ""}</div></section>` : ""}
      <form class="assistant-question-form" data-form="assistant-question"><label for="assistantQuestion">Skriv en fråga</label><div><input id="assistantQuestion" name="question" maxlength="240" required placeholder="Exempel: Vad behöver jag göra?"><button class="primary" type="submit">Fråga</button></div></form>
    </section>` : ""}`;
}

function emptyState(title, text) {
  return `<article class="empty-card"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`;
}

function field(label, name, value = "", options = {}) {
  const { type = "text", required = false, placeholder = "", autocomplete = "", min = "", max = "", minlength = "", maxlength = "" } = options;
  return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${autocomplete ? `autocomplete="${esc(autocomplete)}"` : ""} ${min ? `min="${esc(min)}"` : ""} ${max ? `max="${esc(max)}"` : ""} ${minlength ? `minlength="${esc(minlength)}"` : ""} ${maxlength ? `maxlength="${esc(maxlength)}"` : ""}></label>`;
}

function textareaField(label, name, value = "", placeholder = "", required = false) {
  return `<label>${esc(label)}<textarea name="${esc(name)}" ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${required ? "required" : ""}>${esc(value)}</textarea></label>`;
}

function selectField(label, name, options, selected = "", required = false) {
  return `<label>${esc(label)}<select name="${esc(name)}" ${required ? "required" : ""}>${options.map(([value, text]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
}

function renderAuth() {
  const registerMode = state.authView === "register";
  const disabled = !config.enabled;
  const registerIntro = state.inviteCode
    ? "Använd samma e-postadress som inbjudan gäller. Efteråt hamnar du hos rätt barn eller på rätt avdelning."
    : "Ett konto öppnar inte en förskola av sig själv. Du behöver en inbjudningslänk, eller en skolkod som en administratör godkänner.";
  return `${noticeHtml()}
    <section class="hero-card auth-card">${botMascot()}<div><p class="kicker">${APP_NAME}</p><h1 class="h1">${registerMode ? "Skapa konto" : "Välkommen"}</h1><p class="sub">${registerMode ? registerIntro : "Logga in till en enklare förskolevardag med Ärtan-botten som påminnelsehjälp."}</p></div></section>
    <article class="card bot-promise"><p class="kicker">En hjälpande bot</p><h2>Rätt sak i rätt tid</h2><p>Ärtan-botten ser vad som saknas i appen och påminner om tider, kontaktuppgifter, hälsa och samtycken. Uppgifterna stannar i ärtan och skickas inte till någon extern AI-tjänst.</p></article>
    ${disabled ? `<article class="card important"><h3>Konfiguration saknas</h3><p>Aktivera Supabase i <code>supabase-config.js</code>.</p></article>` : ""}
    <form class="card form-stack" data-form="${registerMode ? "register" : "login"}">
      ${registerMode ? field("Namn", "name", "", { required: true, autocomplete: "name" }) : ""}
      ${field("E-post", "email", "", { type: "email", required: true, autocomplete: "email" })}
      ${field("Lösenord", "password", "", { type: "password", required: true, autocomplete: registerMode ? "new-password" : "current-password", minlength: "8" })}
      ${state.inviteCode ? `<p class="form-hint">Inbjudningslänken följer med när kontot skapas. Använd e-postadressen som inbjudan gäller.</p>` : ""}
      <button class="primary" type="submit" ${disabled ? "disabled" : ""}>${registerMode ? "Skapa konto" : "Logga in"}</button>
      <button class="secondary" type="button" data-action="auth-view" data-view="${registerMode ? "login" : "register"}">${registerMode ? "Jag har redan konto" : "Skapa nytt konto"}</button>
    </form>`;
}

function renderOnboarding() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Kom igång</p><h1 class="h1">Välj hur du kommer in</h1><p class="sub">En förskola går att gå med i via en inbjudan, eller via en skolkod som administratören godkänner.</p></section>
    <form class="card form-stack" data-form="accept-invite">
      <h2>Jag har en inbjudan</h2>
      <p class="form-hint">Klistra in koden från länken. Den gäller bara din e-postadress och kan användas en gång.</p>
      ${field("Inbjudningskod", "code", state.inviteCode, { required: true, placeholder: "Klistra in koden från länken" })}
      <button class="primary" type="submit">Acceptera inbjudan</button>
    </form>
    <form class="card form-stack" data-form="school-code-join">
      <h2>Jag har en skolkod</h2>
      <p class="form-hint">Skolkoden skickar en ansökan till administratören. Uppgifter visas först efter godkännande, och administratören väljer då din avdelning.</p>
      ${field("Skolkod", "school_code", "", { required: true, placeholder: "Till exempel K7M2-QP4L-RX9C", autocomplete: "off" })}
      <button class="primary" type="submit">Skicka ansökan</button>
    </form>
    <form class="card form-stack" data-form="create-organization">
      <h2>Jag startar en ny organisation</h2>
      <p class="form-hint">Det här är för den som ska administrera en ny förskola. Det kopplar dig inte till en skola som redan finns.</p>
      ${field("Organisationens namn", "organization_name", "", { required: true, placeholder: "Exempelvis Förskolor AB" })}
      ${selectField("Organisationstyp", "organization_type", [["kommun", "Kommun"], ["privat", "Privat"], ["kooperativ", "Kooperativ"]], "privat", true)}
      ${field("Första skolans namn", "preschool_name", "", { required: true })}
      ${field("Första avdelningen", "department_name", "", { required: true })}
      <button class="primary" type="submit">Skapa organisation</button>
    </form>
    <button class="secondary" data-action="logout">Logga ut</button>`;
}

function renderPendingAccess() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Ansökan</p><h1 class="h1">Väntar på godkännande</h1><p class="sub">Administratören väljer avdelning när ansökan godkänns. Uppgifter visas först då.</p></section>
    <article class="card"><h2>Inga uppgifter visas ännu</h2><p>Du kan stänga appen och komma tillbaka senare. När ansökan är godkänd loggar du in med samma konto och hamnar på din avdelning.</p></article>
    <button class="secondary" data-action="logout">Logga ut</button>`;
}

function renderRemovedAccess() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Personal</p><h1 class="h1">Åtkomsten är borttagen</h1><p class="sub">En administratör har tagit bort din personalåtkomst. En ny inbjudan till samma e-postadress kan öppna kontot igen.</p></section>
    <article class="card"><h2>Inga uppgifter visas</h2><p>${esc(state.profile?.email || "Ditt konto")} är inte kopplat till någon avdelning.</p></article>
    <button class="secondary" data-action="logout">Logga ut</button>`;
}

function childTabs() {
  if (!state.children.length) return "";
  return `<div class="child-tabs">${state.children.map((child) => `<button type="button" data-action="select-child" data-id="${esc(child.id)}" aria-pressed="${child.id === state.selectedChildId}">${esc(child.name)}<small>${esc(departmentName(child.department_id))}</small></button>`).join("")}</div>`;
}

function siblingStatusLabel(status) {
  return { pending: "Väntar på personalen", approved: "Godkänd", rejected: "Avslagen" }[status] || status;
}

function renderSiblingRequestForm(additional = false) {
  const options = departmentOptions();
  const history = state.profile.role === "parent" ? state.siblingRequests : [];
  return `<form class="card form-stack" data-form="sibling-request">
    <p class="kicker">${additional ? "Fler barn" : "Koppling till barn"}</p>
    <h2>${additional ? "Be om att koppla ett syskon" : "Be personalen koppla ett barn"}</h2>
    <p class="form-hint">Förskolan godkänner förfrågan innan barnet syns på ditt konto. Har du fått en inbjudningslänk använder du den i stället.</p>
    ${options.length ? selectField("Förskola och avdelning", "department_id", options, "", true) : `<p class="notice error">Ingen avdelning är tillgänglig. Be personalen bjuda in dig.</p>`}
    <div class="form-grid">${field("Barnets namn", "name", "", { required: true, autocomplete: "name" })}${field("Födelsedatum", "birth_date", "", { type: "date", required: true, max: todayIso() })}</div>
    ${textareaField("Meddelande till personalen", "note", "", "Till exempel att barnet redan går på avdelningen")}
    <button class="primary" type="submit" ${options.length ? "" : "disabled"}>${additional ? "Skicka syskonförfrågan" : "Skicka förfrågan"}</button>
  </form>
  ${history.length ? `<article class="card"><h2>Dina förfrågningar</h2><ul class="invite-list">${history.map((request) => `<li><div><strong>${esc(request.child_name)}</strong><span>${esc(request.department_name)} · ${esc(siblingStatusLabel(request.status))}</span></div><span class="status">${esc(formatDate(request.birth_date))}</span></li>`).join("")}</ul></article>` : ""}`;
}


function childSchoolId(child) {
  return state.departments.find((department) => department.id === child.department_id)?.preschool_id || null;
}

function closuresForTerm(termId) {
  return state.termClosures.filter((closure) => closure.term_id === termId);
}

function schedulesForTermChild(termId, childId) {
  return state.weeklySchedules.filter((schedule) => schedule.term_id === termId && schedule.child_id === childId);
}

function termDateSummary(term) {
  return `${formatDate(term.starts_on)}–${formatDate(term.ends_on)} · vardagar ${term.opens_at.slice(0, 5)}–${term.closes_at.slice(0, 5)}`;
}

function renderTermClosures(termId) {
  const closures = closuresForTerm(termId);
  return closures.length
    ? `<ul class="term-closures">${closures.map((closure) => `<li><strong>${esc(formatDate(closure.closure_date))}</strong><span>${esc(closure.reason)}</span></li>`).join("")}</ul>`
    : `<p class="form-hint">Inga stängningsdagar är publicerade.</p>`;
}

function renderWeeklyScheduleForm(term, child) {
  const saved = schedulesForTermChild(term.term_id, child.id);
  const rows = WEEKDAYS.map((label, index) => {
    const weekday = index + 1;
    const row = saved.find((item) => Number(item.weekday) === weekday);
    const attending = Boolean(row?.attending);
    return `<div class="weekly-schedule-row" data-weekday="${weekday}">
      <label class="check"><input type="checkbox" name="attending_${weekday}" data-schedule-attending ${attending ? "checked" : ""}> ${esc(label)}</label>
      <label>Lämning<input type="time" name="dropoff_${weekday}" value="${esc(row?.dropoff_at?.slice(0, 5) || "")}" ${attending ? "" : "disabled"}></label>
      <label>Hämtning<input type="time" name="pickup_${weekday}" value="${esc(row?.pickup_at?.slice(0, 5) || "")}" ${attending ? "" : "disabled"}></label>
    </div>`;
  }).join("");
  return `<form class="card form-stack term-schedule-card" data-form="weekly-schedule" data-term-id="${esc(term.term_id)}" data-child-id="${esc(child.id)}">
    <p class="kicker">Återkommande veckoschema</p><h3>${esc(child.name)}</h3>
    <div class="assistant-form">
      <label>Berätta för Ärtan<textarea name="schedule_text" placeholder="08.00–16.30 alla dagar utom torsdagar, då 08.00–15.00"></textarea></label>
      <button class="secondary" type="button" data-action="parse-weekly-schedule">Tolka och fyll i</button>
      <p class="form-hint" data-parse-status aria-live="polite">Ärtan fyller bara i formuläret. Granska tiderna och välj Spara.</p>
    </div>
    <fieldset class="weekly-schedule"><legend>Måndag till fredag</legend>${rows}</fieldset>
    <button class="primary" type="submit">Spara veckoschema</button>
  </form>`;
}

function renderParentTermSchedules(child) {
  const preschoolId = childSchoolId(child);
  const terms = state.schoolTerms.filter((term) => term.preschool_id === preschoolId && term.term_status === "published");
  if (!terms.length) return `<section><div class="section-head"><div><p class="kicker">Termin</p><h2>Öppettider och schema</h2></div></div>${emptyState("Ingen publicerad termin", "När förskolan publicerar terminen visas öppettider, stängningsdagar och veckoschema här.")}</section>`;
  return `<section id="term-overview" class="term-overview"><div class="section-head"><div><p class="kicker">Termin</p><h2>Öppettider och schema</h2></div></div>${terms.map((term) => `<article class="card term-card"><p class="kicker">Publicerad</p><h3>${esc(term.term_name)}</h3><p>${esc(termDateSummary(term))}</p><h4>Stängningsdagar</h4>${renderTermClosures(term.term_id)}</article>${renderWeeklyScheduleForm(term, child)}`).join("")}</section>`;
}

function parseClosureLines(value) {
  return String(value || "").split(/\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [date, ...reasonParts] = line.split("|");
    const reason = reasonParts.join("|").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()) || reason.length < 2) throw new Error("Skriv varje stängningsdag som ÅÅÅÅ-MM-DD | anledning.");
    return { date: date.trim(), reason };
  });
}
function setParseStatus(form, message, error = false) {
  const status = form.querySelector("[data-parse-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("error-text", error);
}


function renderParentHome() {
  const child = selectedChild();
  if (!child) return `${noticeHtml()}<section class="hero-card"><p class="kicker">Min dag</p><h1 class="h1">Välkommen</h1><p class="sub">När personalen har kopplat ett barn hjälper Ärtan-botten dig med vardagsplanen. Du kan också be om en koppling här.</p></section>${renderSiblingRequestForm()}`;
  const attendance = attendanceFor(child.id);
  const pickupContacts = contactsFor(child.id).filter((contact) => contact.can_pickup);
  const messages = state.posts.filter((post) => !post.child_id || post.child_id === child.id).slice(0, 3);
  const reminders = parentReminders(child);
  const nextReminder = reminders[0];
  return `${noticeHtml()}${childTabs()}<section class="hero-card home-hero"><div><p class="kicker">${esc(new Intl.DateTimeFormat("sv-SE", { dateStyle: "full" }).format(new Date()))}</p><h1 class="h1">${esc(child.name)}</h1><p class="big-status">${esc(attendanceLabel(attendanceState(attendance)))}</p><p class="sub">${esc(departmentName(child.department_id))}${attendance?.pickup_at ? ` · planerad hämtning ${esc(attendance.pickup_at.slice(0, 5))}` : ""}</p></div>${botMascot()}</section>
    <section class="card bot-card"><div class="bot-card-mascot">${botMascot()}</div><div><p class="kicker">Ärtan-botten</p><h2>${reminders.length ? "Jag hjälper dig komma ihåg" : "Allt är uppdaterat"}</h2>${reminders.length ? `<ul class="bot-reminders">${reminders.map((reminder) => `<li>${esc(reminder.text)}</li>`).join("")}</ul>` : `<p class="bot-done">Dagens plan och barnets uppgifter ser kompletta ut.</p>`}${nextReminder ? `<button class="primary bot-next" type="button" data-action="bot-reminder" data-view="${esc(nextReminder.view)}" data-target="${esc(nextReminder.target)}">Ta hand om nästa sak</button>` : ""}</div></section>
    ${renderParentTermSchedules(child)}
    <form id="daily-plan" class="card form-stack" data-form="parent-attendance" data-child-id="${esc(child.id)}"><p class="kicker">Idag</p><h2>Dagens plan</h2>
      ${selectField("Planerad status", "status", [["in", "Kommer"], ["absent_sick", "Sjuk"], ["absent_leave", "Ledig"]], ["absent_sick", "absent_leave"].includes(attendance?.status) ? attendance.status : "in", true)}
      <div class="form-grid">${field("Lämning", "dropoff_at", attendance?.dropoff_at?.slice(0, 5) || "", { type: "time" })}${field("Hämtning", "pickup_at", attendance?.pickup_at?.slice(0, 5) || "", { type: "time" })}</div>
      <label>Vem hämtar?<input name="pickup_by" type="text" value="${esc(attendance?.pickup_by || "")}" list="pickup-contact-options" placeholder="Exempelvis mormor eller farfar"></label>
      ${pickupContacts.length ? `<datalist id="pickup-contact-options">${pickupContacts.map((contact) => `<option value="${esc(contact.name)}"></option>`).join("")}</datalist>` : ""}
      <p class="form-hint">Skriv vem som hämtar. Kontaktpersoner markerade med ”får hämta” visas som förslag.</p>
      <button class="primary" type="submit">Spara dagens plan</button>
    </form>
    <section><div class="section-head"><div><p class="kicker">Från skolan</p><h2>Meddelanden</h2></div><button class="link" data-action="navigate" data-view="messages">Visa alla</button></div>${messages.map(renderPost).join("") || emptyState("Inga meddelanden", "Nya meddelanden från personalen visas här.")}</section>`;
}

function commentsFor(postId) {
  return state.postComments.filter((comment) => comment.post_id === postId);
}

function renderPostComment(comment) {
  const canDelete = comment.author_id === state.profile.id || state.profile.role === "staff" || state.profile.role === "admin";
  return `<li><div><strong>${esc(comment.author_name)}</strong><span>${esc(formatTimestamp(comment.created_at))}</span><p>${esc(comment.body)}</p></div>${canDelete ? `<button class="link danger-link" type="button" data-action="delete-comment" data-id="${esc(comment.comment_id)}">Ta bort</button>` : ""}</li>`;
}

function postImagesFor(postId) {
  return state.postImages.filter((image) => image.post_id === postId);
}

function renderPost(post) {
  const scope = post.child_id ? state.children.find((child) => child.id === post.child_id)?.name : departmentName(post.department_id);
  const comments = commentsFor(post.id);
  const images = postImagesFor(post.id);
  const canDelete = post.author_id === state.profile.id || state.profile.role === "admin";
  return `<article class="card school-post"><p class="kicker">Från skolan · ${esc(scope || "Skolan")} · ${esc(formatTimestamp(post.created_at))}</p><h3>${esc(post.title)}</h3><p class="pre-line">${esc(post.body)}</p>
    ${images.length ? `<div class="post-image-gallery count-${Math.min(images.length, 4)}">${images.map((image) => image.signed_url ? `<img src="${esc(image.signed_url)}" alt="${esc(image.alt_text)}" width="${image.width}" height="${image.height}" loading="lazy">` : `<div class="post-image-missing" role="img" aria-label="${esc(image.alt_text)}">Bilden kunde inte laddas</div>`).join("")}</div>` : ""}
    ${canDelete ? `<button class="link danger-link post-delete" type="button" data-action="delete-post" data-id="${esc(post.id)}">Ta bort inlägget</button>` : ""}
    <section class="post-comments"><h4>Kommentarer</h4>${comments.length ? `<ul>${comments.map(renderPostComment).join("")}</ul>` : `<p class="form-hint">Inga kommentarer ännu.</p>`}
      <form class="comment-form" data-form="post-comment" data-post-id="${esc(post.id)}">${field("Skriv en kommentar", "body", "", { required: true, maxlength: "2000" })}<button class="secondary" type="submit">Kommentera</button></form>
    </section>
  </article>`;
}

function renderChildInfo() {
  const child = selectedChild();
  if (!child) return `${noticeHtml()}<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">Inget barn kopplat</h1><p class="sub">Personalen bjuder in dig till ett barn, eller godkänner en förfrågan innan barnet syns här.</p></section>${renderSiblingRequestForm()}`;
  const health = healthFor(child.id);
  const contacts = contactsFor(child.id);
  const checklist = childInfoChecklist(child);
  const completed = checklist.filter((item) => item.complete).length;
  return `${noticeHtml()}${childTabs()}<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">${esc(child.name)}</h1><p class="sub">Fyra tydliga steg. Du kan spara ett steg i taget och fortsätta senare.</p></section>
    <section class="card info-progress"><div><p class="kicker">Din översikt</p><h2>${completed} av ${checklist.length} steg klara</h2><progress max="${checklist.length}" value="${completed}" aria-label="${completed} av ${checklist.length} steg klara"></progress></div><ol class="info-steps">${checklist.map((item, index) => `<li class="${item.complete ? "done" : ""}"><button type="button" data-action="scroll-section" data-target="${esc(item.id)}"><span>${item.complete ? "✓" : index + 1}</span>${esc(item.label)}</button></li>`).join("")}</ol></section>
    <form id="child-basics" class="card form-stack child-step" data-form="child-profile" data-child-id="${esc(child.id)}"><p class="kicker">Steg 1 av 4</p><h2>Grunduppgifter</h2>
      ${field("Barnets namn", "name", child.name, { required: true, autocomplete: "name" })}
      ${field("Födelsedatum", "birth_date", child.birth_date || "", { type: "date", required: true })}
      ${textareaField("Det här behöver personalen veta", "notes", child.notes || "", "Trygghet, språk, rutiner eller annat viktigt")}
      <button class="primary" type="submit">Spara grunduppgifter</button>
    </form>
    <form id="child-health" class="card form-stack child-step" data-form="child-health" data-child-id="${esc(child.id)}"><p class="kicker">Steg 2 av 4</p><h2>Hälsa och omsorg</h2><p class="form-hint">Gå igenom steget och spara även om barnet inte har allergier, medicin eller andra särskilda behov.</p>
      ${field("Allergier, separera med kommatecken", "allergies", health.allergies?.join(", ") || "")}
      ${field("Sjukdomar eller tillstånd", "conditions", health.conditions?.join(", ") || "")}
      ${textareaField("Specialkost", "diet", health.diet || "")}
      ${textareaField("Medicin och instruktion", "medication", health.medication || "")}
      ${textareaField("Akut information", "emergency", health.emergency || "")}
      <button class="primary" type="submit">Spara och markera som genomgånget</button>
      ${health.updated_at ? `<p class="form-hint">Senast uppdaterad ${esc(formatTimestamp(health.updated_at))}</p>` : ""}
    </form>
    <section id="child-contacts" class="card child-step"><p class="kicker">Steg 3 av 4</p><h2>Kontaktpersoner</h2>${contacts.length ? `<ul class="contact-list">${contacts.map((contact) => `<li><div><strong>${esc(contact.name)}</strong><span>${esc(contact.relation)}${contact.can_pickup ? " · får hämta" : ""}${contact.is_primary ? " · primär" : ""}</span></div>${contact.phone ? `<a href="tel:${esc(contact.phone.replace(/\s/g, ""))}">${esc(contact.phone)}</a>` : ""}</li>`).join("")}</ul>` : `<p class="form-hint">Lägg till minst en person som skolan kan kontakta.</p>`}</section>
    <form class="card form-stack" data-form="contact-create" data-child-id="${esc(child.id)}"><h3>Lägg till kontaktperson</h3>
      <div class="form-grid">${field("Namn", "name", "", { required: true })}${field("Relation", "relation", "", { required: true, placeholder: "Exempelvis mormor" })}</div>
      ${field("Telefon", "phone", "", { type: "tel", autocomplete: "tel" })}
      <label class="check"><input type="checkbox" name="can_pickup"> Personen får hämta barnet</label>
      <label class="check"><input type="checkbox" name="is_primary"> Primär kontakt</label>
      <button class="primary" type="submit">Lägg till kontakt</button>
    </form>
    <section id="child-consents" class="card child-step"><p class="kicker">Steg 4 av 4</p><h2>Samtycken</h2><p class="form-hint">Välj ja eller nej för varje punkt. Du kan ändra svaren när som helst.</p><div class="consent-grid">${CONSENT_OPTIONS.map(([type, label]) => {
      const recorded = consentRecorded(child.id, type);
      const allowed = consentFor(child.id, type);
      return `<div class="consent-question"><div><strong>${esc(label)}</strong><span>${recorded ? allowed ? "Ja" : "Nej" : "Ej besvarat"}</span></div><div class="consent-choices" role="group" aria-label="${esc(label)}"><button type="button" data-action="set-consent" data-child-id="${esc(child.id)}" data-type="${esc(type)}" data-allowed="true" aria-pressed="${recorded && allowed}">Ja</button><button type="button" data-action="set-consent" data-child-id="${esc(child.id)}" data-type="${esc(type)}" data-allowed="false" aria-pressed="${recorded && !allowed}">Nej</button></div></div>`;
    }).join("")}</div></section>${renderSiblingRequestForm(true)}`;
}

function groupedPrivateMessages() {
  const cards = [];
  const sentGroups = new Map();
  state.privateMessages.forEach((message) => {
    if (message.sender_id !== state.profile.id) {
      cards.push({ ...message, sent: false });
      return;
    }
    let card = sentGroups.get(message.delivery_group_id);
    if (!card) {
      card = { ...message, sent: true, recipientNames: [] };
      sentGroups.set(message.delivery_group_id, card);
      cards.push(card);
    }
    card.recipientNames.push(message.recipient_name);
  });
  return cards.slice(-50);
}

function privateMessageRecipientOptions() {
  const options = [];
  const guardiansByChild = new Map();
  state.guardianMessageTargets.forEach((target) => {
    if (!guardiansByChild.has(target.child_id)) guardiansByChild.set(target.child_id, []);
    guardiansByChild.get(target.child_id).push(target);
  });
  guardiansByChild.forEach((guardians, childId) => {
    options.push([`child:${childId}`, `${guardians[0].child_name} · alla vårdnadshavare (${guardians.length})`]);
  });
  state.communityMembers.filter((member) => member.can_message).forEach((member) => {
    options.push([`profile:${member.profile_id}`, `${member.display_name} · ${roleLabel(member.profile_role)}`]);
  });
  return options;
}

function renderPrivateMessaging() {
  const recipients = privateMessageRecipientOptions();
  const messages = groupedPrivateMessages();
  return `<section id="private-messaging" class="community-section"><div class="section-head"><div><p class="kicker">Privat</p><h2>Meddelanden</h2></div></div>
    <form class="card form-stack" data-form="private-message">
      <p class="form-hint">Privata meddelanden visas bara för avsändaren och varje enskild mottagare. Personal kan välja alla vårdnadshavare för ett barn; mottagarna ser inte varandra.</p>
      ${recipients.length ? selectField("Mottagare", "recipient_target", recipients, "", true) : `<p class="form-hint">Ingen mottagare är tillgänglig ännu.</p>`}
      ${textareaField("Meddelande", "body", "", "Skriv ett privat meddelande", true)}
      <button class="primary" type="submit" ${recipients.length ? "" : "disabled"}>Skicka privat</button>
    </form>
    ${messages.length ? `<div class="private-message-list">${messages.map((message) => {
      const recipientLabel = message.recipientNames?.join(", ") || message.recipient_name;
      return `<article class="card private-message ${message.sent ? "sent" : "received"}"><p class="kicker">${message.sent ? `Till ${esc(recipientLabel)}` : `Från ${esc(message.sender_name)}`} · ${esc(formatTimestamp(message.created_at))}</p><p>${esc(message.body)}</p></article>`;
    }).join("")}</div>` : emptyState("Inga privata meddelanden", "När någon skriver privat visas meddelandet här.")}</section>`;
}

function renderPlaydates() {
  if (state.profile.role !== "parent") return "";
  const enabled = state.profile.allow_playdate_requests;
  const recipients = state.communityMembers.filter((member) => member.can_playdate);
  const requests = state.playdateRequests;
  return `<section id="playdates" class="community-section"><div class="section-head"><div><p class="kicker">Frivilligt</p><h2>Lekträffar</h2></div></div>
    ${enabled ? `<form class="card form-stack" data-form="playdate-create"><p class="form-hint">Endast vårdnadshavare i samma avdelning som också har aktiverat funktionen visas här.</p>
      ${recipients.length ? selectField("Vårdnadshavare", "recipient_id", recipients.map((member) => [member.profile_id, member.display_name]), "", true) : `<p class="form-hint">Ingen annan vårdnadshavare har aktiverat lekförfrågningar ännu.</p>`}
      ${textareaField("Förfrågan", "message", "", "Exempelvis: Vill ni ses i lekparken på lördag?", true)}
      <button class="primary" type="submit" ${recipients.length ? "" : "disabled"}>Skicka lekförfrågan</button>
    </form>` : `<article class="card"><p>Funktionen är avstängd. Du kan aktivera den under Konto.</p><button class="secondary" type="button" data-action="account">Öppna Konto</button></article>`}
    ${requests.length ? `<ul class="card playdate-list">${requests.map((request) => {
      const received = request.recipient_id === state.profile.id;
      const counterpart = received ? request.sender_name : request.recipient_name;
      const status = { pending: "Väntar på svar", accepted: "Accepterad", declined: "Tackat nej" }[request.status] || request.status;
      return `<li><div><strong>${received ? "Från" : "Till"} ${esc(counterpart)}</strong><span>${esc(status)} · ${esc(formatTimestamp(request.created_at))}</span><p>${esc(request.message)}</p></div>${received && request.status === "pending" ? `<div class="playdate-actions"><button class="primary" type="button" data-action="playdate-response" data-id="${esc(request.request_id)}" data-status="accepted">Acceptera</button><button class="secondary" type="button" data-action="playdate-response" data-id="${esc(request.request_id)}" data-status="declined">Tacka nej</button></div>` : ""}</li>`;
    }).join("")}</ul>` : ""}</section>`;
}

function birthdayStatusLabel(status) {
  return { pending: "Väntar på svar", accepted: "Kommer", declined: "Tackat nej" }[status] || status;
}

function birthdayInvitationGroups() {
  const groups = new Map();
  state.birthdayInvitations.forEach((row) => {
    if (!groups.has(row.invitation_id)) groups.set(row.invitation_id, { ...row, recipients: [] });
    groups.get(row.invitation_id).recipients.push({
      id: row.recipient_id,
      name: row.recipient_name,
      status: row.response_status,
      respondedAt: row.responded_at,
    });
  });
  return Array.from(groups.values());
}

function renderBirthdayInvitationCard(invitation) {
  const isHost = invitation.host_parent_id === state.profile.id;
  const cancelled = invitation.invitation_status === "cancelled";
  const ended = new Date(invitation.ends_at).getTime() < Date.now();
  const recipient = invitation.recipients.find((item) => item.id === state.profile.id);
  const canRespond = !isHost && !cancelled && !ended && invitation.rsvp_by >= todayIso() && recipient?.status === "pending";
  const eventStatus = cancelled ? "Avbrutet" : ended ? "Avslutat" : "Aktivt";
  return `<article class="card birthday-card">
    <p class="kicker">${isHost ? `Ditt kalas för ${esc(invitation.host_child_name)}` : `Från ${esc(invitation.host_parent_name)} · för ${esc(invitation.host_child_name)}`} · ${esc(eventStatus)}</p>
    <h3>${esc(invitation.title)}</h3>
    <dl class="birthday-details">
      <div><dt>Start</dt><dd>${esc(formatTimestamp(invitation.starts_at))}</dd></div>
      <div><dt>Slut</dt><dd>${esc(formatTimestamp(invitation.ends_at))}</dd></div>
      <div><dt>Plats</dt><dd>${esc(invitation.location)}</dd></div>
      <div><dt>OSA senast</dt><dd>${esc(formatDate(invitation.rsvp_by))}</dd></div>
    </dl>
    ${invitation.message ? `<p class="pre-line">${esc(invitation.message)}</p>` : ""}
    ${isHost ? `<section class="birthday-rsvps"><h4>OSA</h4><ul>${invitation.recipients.map((item) => `<li><span>${esc(item.name)}</span><strong>${esc(birthdayStatusLabel(item.status))}</strong></li>`).join("")}</ul></section>` : `<p class="birthday-response">Ditt svar: <strong>${esc(birthdayStatusLabel(recipient?.status || "pending"))}</strong></p>`}
    ${canRespond ? `<div class="actions"><button class="primary" type="button" data-action="birthday-response" data-id="${esc(invitation.invitation_id)}" data-status="accepted">Jag kommer</button><button class="secondary" type="button" data-action="birthday-response" data-id="${esc(invitation.invitation_id)}" data-status="declined">Tacka nej</button></div>` : ""}
    ${isHost && !cancelled && !ended ? `<button class="secondary birthday-cancel" type="button" data-action="birthday-cancel" data-id="${esc(invitation.invitation_id)}">Avbryt kalaset</button>` : ""}
    ${isHost && (cancelled || ended) ? `<button class="link danger-link" type="button" data-action="birthday-delete" data-id="${esc(invitation.invitation_id)}">Ta bort kalaset permanent</button>` : ""}
  </article>`;
}

function renderBirthdayInvitations() {
  if (state.profile.role !== "parent") return "";
  const enabled = state.profile.allow_birthday_invitations;
  const candidates = state.birthdayCandidates;
  const groups = birthdayInvitationGroups();
  const canCreate = enabled && state.children.length > 0 && candidates.length > 0;
  return `<section id="birthday-invitations" class="community-section"><div class="section-head"><div><p class="kicker">Privata kalas</p><h2>Födelsedagsinbjudningar</h2></div></div>
    ${enabled ? `<form class="card form-stack" data-form="birthday-create">
      <p class="form-hint">Endast vårdnadshavare i samma avdelning som också har aktiverat kalasinbjudningar visas. Varje mottagare ser bara sin egen inbjudan och sitt eget svar.</p>
      ${state.children.length ? selectField("Barn som fyller år", "host_child_id", state.children.map((child) => [child.id, child.name]), "", true) : `<p class="form-hint">Lägg till ditt barn innan du skapar ett kalas.</p>`}
      ${field("Rubrik", "title", "", { required: true, maxlength: "120", placeholder: "Exempelvis: Kims födelsedagskalas" })}
      <div class="form-grid">${field("Start", "starts_at", "", { type: "datetime-local", required: true })}${field("Slut", "ends_at", "", { type: "datetime-local", required: true })}</div>
      <div class="form-grid">${field("Plats", "location", "", { required: true, maxlength: "300", placeholder: "Exempelvis: Hemma hos oss" })}${field("OSA senast", "rsvp_by", "", { type: "date", required: true, min: todayIso() })}</div>
      ${textareaField("Meddelande, valfritt", "message", "", "Praktisk information om kalaset")}
      <fieldset class="preference-group"><legend>Bjud in vårdnadshavare</legend>
        ${candidates.length ? candidates.map((candidate) => `<label class="check"><input type="checkbox" name="recipient_ids" value="${esc(candidate.profile_id)}"> ${esc(candidate.display_name)}</label>`).join("") : `<p class="form-hint">Ingen annan vårdnadshavare i avdelningen har aktiverat kalasinbjudningar ännu.</p>`}
      </fieldset>
      <button class="primary" type="submit" ${canCreate ? "" : "disabled"}>Skicka privat kalasinbjudan</button>
    </form>` : `<article class="card"><p>Kalasinbjudningar är avstängda. Aktivera dem under Konto för att skicka och ta emot privata inbjudningar.</p><button class="secondary" type="button" data-action="account">Öppna Konto</button></article>`}
    ${groups.length ? `<div class="birthday-list">${groups.map(renderBirthdayInvitationCard).join("")}</div>` : emptyState("Inga kalasinbjudningar", "Skickade och mottagna kalas visas privat här.")}</section>`;
}

function renderMessages() {
  const availableDepartments = editableDepartments();
  const canPublish = (state.profile.role === "staff" || state.profile.role === "admin") && availableDepartments.length > 0;
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Gemenskap</p><h1 class="h1">Skolans flöde</h1><p class="sub">Officiella inlägg från skolan, kommentarer och privata samtal samlade på ett ställe.</p></section>
    ${canPublish ? `<form id="official-post-form" class="card form-stack" data-form="post-create"><h2>Publicera officiellt inlägg</h2>
      ${selectField("Avdelning", "department_id", availableDepartments.map((department) => [department.id, `${schoolName(department.preschool_id)} · ${department.name}`]), "", true)}
      ${selectField("Barn, valfritt", "child_id", [["", "Hela avdelningen"], ...state.children.map((child) => [child.id, child.name])], "")}
      ${field("Rubrik", "title", "", { required: true, maxlength: "160" })}${textareaField("Inlägg", "body", "", "Skriv information från skolan", true)}
      <label>Bilder, valfritt<input name="images" type="file" accept="image/*" multiple data-action="post-images"></label>
      <p class="form-hint">Välj upp till 20 bilder. De optimeras, metadata tas bort och originalfilerna lämnar inte webbläsaren.</p>
      <div id="post-image-preview" class="post-image-preview-grid" aria-live="polite"></div>
      <fieldset class="preference-group post-visible-children"><legend>Barn som syns i någon av bilderna</legend>
        <p class="form-hint">Markera alla barn som går att identifiera i någon bild. Publicering stoppas om rätt bildsamtycke saknas.</p>
        ${state.children.map((child) => `<label class="check"><input type="checkbox" name="visible_child_ids" value="${esc(child.id)}"> ${esc(child.name)} · ${esc(departmentName(child.department_id))}</label>`).join("") || `<p class="form-hint">Inga barn finns i avdelningen ännu.</p>`}
        <label class="check"><input type="checkbox" name="no_children_visible"> Inga barn går att identifiera i bilderna</label>
      </fieldset>
      <button class="primary" type="submit">Publicera i skolans flöde</button></form>` : ""}
    <section id="official-feed" class="community-section"><div class="section-head"><div><p class="kicker">Officiellt</p><h2>Senaste från skolan</h2></div></div>${state.posts.map(renderPost).join("") || emptyState("Inga inlägg", canPublish ? "Publicera det första inlägget ovan." : "Skolan har inte publicerat något ännu.")}</section>
    ${renderPrivateMessaging()}
    ${renderBirthdayInvitations()}
    ${renderPlaydates()}`;
}

function renderAttendance() {
  const counts = state.children.reduce((result, child) => {
    const status = attendanceState(attendanceFor(child.id));
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const absentCount = (counts.absent_sick || 0) + (counts.absent_leave || 0);
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Närvaro</p><h1 class="h1">Checka in och ut</h1><p class="sub">${esc(todayIso())} · ${state.children.length} barn i dina avdelningar</p></section>
    <section class="metric-grid attendance-metrics" aria-label="Dagens närvaro">
      <article class="metric"><strong>${counts.in || 0}</strong><span>Incheckade</span></article>
      <article class="metric"><strong>${counts.unregistered || 0}</strong><span>Inte incheckade</span></article>
      <article class="metric"><strong>${counts.picked_up || 0}</strong><span>Utcheckade</span></article>
      <article class="metric"><strong>${absentCount}</strong><span>Frånvarande</span></article>
    </section>
    ${state.children.length ? `<div class="attendance-list">${state.children.map((child) => {
      const attendance = attendanceFor(child.id);
      const status = attendanceState(attendance);
      const active = status === "in";
      const primaryTransition = active ? "check_out" : "check_in";
      const primaryLabel = active ? "Checka ut" : status === "picked_up" ? "Checka in igen" : "Checka in";
      const actualTime = active ? `Incheckad ${formatClock(attendance.checked_in_at)}` : status === "picked_up" ? `Utcheckad ${formatClock(attendance.checked_out_at)}` : attendanceLabel(status);
      const plan = compact([
        attendance?.dropoff_at ? `plan ${attendance.dropoff_at.slice(0, 5)}` : "",
        attendance?.pickup_at ? `hämtning ${attendance.pickup_at.slice(0, 5)}` : "",
        attendance?.pickup_by ? `av ${attendance.pickup_by}` : "",
      ]).join(" · ");
      return `<article class="card attendance-row"><div class="attendance-child"><div><strong>${esc(child.name)}</strong><span>${esc(departmentName(child.department_id))}${plan ? ` · ${esc(plan)}` : ""}</span></div><span class="attendance-state ${esc(status)}">${esc(actualTime)}</span></div><div class="attendance-actions"><button class="primary attendance-primary" type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-transition="${primaryTransition}">${primaryLabel}</button>${active ? "" : `<div class="attendance-secondary" role="group" aria-label="Markera frånvaro för ${esc(child.name)}"><button type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-transition="absent_sick" aria-pressed="${status === "absent_sick"}">Sjuk</button><button type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-transition="absent_leave" aria-pressed="${status === "absent_leave"}">Ledig</button></div>`}</div></article>`;
    }).join("")}</div>` : emptyState("Inga barn", "Du behöver kopplas till en avdelning innan närvarolistan visas.")}`;
}

function editableDepartments() {
  if (state.profile.role !== "staff") return state.departments;
  const assignedIds = new Set(state.staffAssignments.map((assignment) => assignment.department_id));
  return state.departments.filter((department) => assignedIds.has(department.id));
}

function departmentOptions(preschoolId = "") {
  return editableDepartments()
    .filter((department) => !preschoolId || department.preschool_id === preschoolId)
    .map((department) => [department.id, preschoolId ? department.name : `${schoolName(department.preschool_id)} · ${department.name}`]);
}

function invitePlace(invite) {
  if (invite.role === "parent") {
    const child = state.children.find((item) => item.id === invite.child_id);
    return child ? `${child.name} · ${departmentName(child.department_id)}` : "Barn";
  }
  const department = state.departments.find((item) => item.id === invite.department_id);
  if (!department) return "Avdelning";
  return `${schoolName(department.preschool_id)} · ${department.name}`;
}

function inviteExpiryLabel(invite) {
  const when = formatTimestamp(invite.expires_at);
  if (invite.status === "pending" && new Date(invite.expires_at).getTime() <= Date.now()) return `Utgången ${when}`;
  return `Går ut ${when}`;
}

function renderInviteActions(invite) {
  return `<div class="invite-actions"><button class="link" type="button" data-action="resend-invite" data-id="${esc(invite.id)}">Skicka igen</button><button class="link danger-link" type="button" data-action="revoke-invite" data-id="${esc(invite.id)}">Återkalla</button></div>`;
}

function renderInviteResult(role = "") {
  if (!state.inviteResult?.token) return "";
  if (role && state.inviteResult.role !== role) return "";
  const link = invitationLink(state.inviteResult.token);
  const days = state.inviteResult.role === "staff" ? "7 dagar" : "14 dagar";
  return `<article class="card success-card"><p class="kicker">Kopiera länken nu</p><h3>${esc(state.inviteResult.email)}</h3><p class="form-hint">Länken visas bara den här gången, fungerar en gång och gäller i ${days}. Den gamla länken slutar fungera när du skickar en ny.</p><code class="secret-value">${esc(link)}</code><div class="actions"><button class="primary" type="button" data-action="copy-invite" data-token="${esc(state.inviteResult.token)}">Kopiera inbjudningslänk</button><a class="secondary button-link" href="mailto:${encodeURIComponent(state.inviteResult.email)}?subject=${encodeURIComponent(`Inbjudan till ${APP_NAME}`)}&body=${encodeURIComponent(`Du är inbjuden till ${APP_NAME}. Öppna ${link}`)}">Öppna e-post på den här enheten</a></div></article>`;
}

function renderSchoolCodeResult() {
  if (!state.schoolCodeResult?.code) return "";
  return `<article class="card success-card"><p class="kicker">Kopiera skolkoden nu</p><h3>${esc(state.schoolCodeResult.preschool_name)}</h3><p class="form-hint">Koden visas bara den här gången. Den som använder den får en ansökan som väntar tills du godkänner den. En ny kod ersätter den här.</p><code class="secret-value">${esc(state.schoolCodeResult.code)}</code><div class="actions"><button class="primary" type="button" data-action="copy-text" data-text="${esc(state.schoolCodeResult.code)}">Kopiera skolkod</button></div></article>`;
}

function staffGroups() {
  const groups = new Map();
  state.staffMembers.forEach((row) => {
    if (!groups.has(row.staff_id)) groups.set(row.staff_id, { id: row.staff_id, name: row.staff_name, email: row.staff_email, departments: [] });
    if (row.department_name) groups.get(row.staff_id).departments.push(`${row.preschool_name} · ${row.department_name}`);
  });
  return [...groups.values()];
}

function renderAdminTerm(term) {
  return `<article class="card term-card"><p class="kicker">${term.term_status === "published" ? "Publicerad" : "Utkast"}</p><h3>${esc(term.term_name)}</h3><p>${esc(termDateSummary(term))}</p><h4>Stängningsdagar</h4>${renderTermClosures(term.term_id)}${term.term_status === "draft" ? `<button class="primary" type="button" data-action="publish-term" data-id="${esc(term.term_id)}">Publicera termin</button>` : ""}</article>`;
}

function renderTermCreateForm(school) {
  return `<form class="card form-stack" data-form="term-create" data-preschool-id="${esc(school.id)}"><p class="kicker">Ny termin</p><h3>Planera och publicera</h3>
    <div class="assistant-form">
      <label>Berätta för Ärtan<textarea name="term_text" placeholder="Höstterminen 3 augusti–18 december, öppet 06.30–17.30. Stängt 13 september för planeringsdag och 11 november för studiedag."></textarea></label>
      <button class="secondary" type="button" data-action="parse-term">Tolka och fyll i</button>
      <p class="form-hint" data-parse-status aria-live="polite">Ärtan fyller bara i utkastet. Granska allt innan du sparar.</p>
    </div>
    ${field("Terminens namn", "term_name", "", { required: true })}
    <div class="form-grid">${field("Startdatum", "starts_on", "", { type: "date", required: true })}${field("Slutdatum", "ends_on", "", { type: "date", required: true })}</div>
    <div class="form-grid">${field("Öppnar vardagar", "opens_at", "", { type: "time", required: true })}${field("Stänger vardagar", "closes_at", "", { type: "time", required: true })}</div>
    ${textareaField("Stängningsdagar", "closures", "", "En rad per dag: 2026-09-13 | Planeringsdag")}
    <p class="form-hint">Spara först som utkast. Vårdnadshavare ser terminen först när du publicerar den.</p>
    <button class="primary" type="submit">Spara utkast</button>
  </form>`;
}

function renderSchoolAdmin(school) {
  const departments = state.departments.filter((department) => department.preschool_id === school.id);
  const terms = state.schoolTerms.filter((term) => term.preschool_id === school.id);
  return `<section class="school-admin"><article class="card"><p class="kicker">Skola</p><h2>${esc(school.name)}</h2><p>${esc(compact([school.address, compact([school.postal_code, school.city]).join(" ")]).join(", ") || "Ingen adress registrerad")}</p><p class="meta">${esc(compact([school.phone, school.opening_hours]).join(" · ") || "Inga kontaktuppgifter registrerade")}</p>
    <ul class="rows">${departments.map((department) => `<li><span>${esc(department.name)}</span><span class="status">${state.children.filter((child) => child.department_id === department.id).length} barn</span></li>`).join("") || "<li><span>Inga avdelningar</span></li>"}</ul>
    <form class="form-stack school-department-form" data-form="department-create" data-preschool-id="${esc(school.id)}">${field("Ny avdelning", "department_name", "", { required: true, placeholder: "Till exempel Solen" })}<button class="secondary" type="submit">Lägg till avdelning</button></form>
    <button class="secondary" type="button" data-action="rotate-school-code" data-id="${esc(school.id)}">Skapa ny skolkod</button>
    <p class="form-hint">Skolkoden är ett reservspår för personal. Ansökan väntar tills du godkänner den och väljer avdelning.</p>
  </article><div class="term-admin-list">${terms.map(renderAdminTerm).join("") || emptyState("Ingen termin", "Skapa ett terminsutkast och publicera det när uppgifterna är granskade.")}${renderTermCreateForm(school)}</div></section>`;
}

function renderStaffAccess() {
  const staffInvites = state.invitations.filter((invite) => invite.role === "staff" && invite.status === "pending");
  const groups = staffGroups();
  return `<section class="card form-stack" id="staff-access"><h2>Personal</h2>
    <form class="form-stack" data-form="staff-invite">${field("E-post till personal", "email", "", { type: "email", required: true, autocomplete: "email" })}${departmentOptions().length ? selectField("Skola och avdelning", "department_id", departmentOptions(), "", true) : `<p class="notice error">Lägg till en avdelning först.</p>`}<p class="form-hint">Länken gäller en skola och en avdelning, kan användas en gång och slutar gälla efter 7 dagar.</p><button class="primary" type="submit" ${departmentOptions().length ? "" : "disabled"}>Bjud in personal</button></form>
    <h3>Väntande personalinbjudningar</h3>
    ${staffInvites.length ? `<ul class="invite-list">${staffInvites.map((invite) => `<li><div><strong>${esc(invite.email)}</strong><span>${esc(invitePlace(invite))} · ${esc(inviteExpiryLabel(invite))}</span></div>${renderInviteActions(invite)}</li>`).join("")}</ul>` : `<p class="form-hint">Inga väntande personalinbjudningar.</p>`}
    <h3>Ansökningar med skolkod</h3>
    ${state.joinRequests.length ? state.joinRequests.map((request) => {
      const options = departmentOptions(request.preschool_id);
      return `<form class="form-stack join-request" data-form="review-only" data-request-id="${esc(request.request_id)}"><p><strong>${esc(request.applicant_name)}</strong><span class="meta">${esc(request.applicant_email)} · ${esc(request.preschool_name)} · ${esc(formatTimestamp(request.created_at))}</span></p>${options.length ? selectField("Avdelning", "department_id", options, "", true) : `<p class="notice error">Skapa en avdelning på skolan först.</p>`}<div class="stack-actions"><button class="primary" type="button" data-action="approve-join" data-id="${esc(request.request_id)}" ${options.length ? "" : "disabled"}>Godkänn</button><button class="secondary" type="button" data-action="reject-join" data-id="${esc(request.request_id)}">Avslå</button></div></form>`;
    }).join("") : `<p class="form-hint">Inga väntande ansökningar. Den som väntar ser inga barn eller meddelanden.</p>`}
    <h3>Aktiv personal</h3>
    ${groups.length ? `<ul class="invite-list">${groups.map((person) => `<li><div><strong>${esc(person.name)}</strong><span>${esc(person.email)}${person.departments.length ? ` · ${esc(person.departments.join(", "))}` : ""}</span></div><div class="invite-actions"><button class="link danger-link" type="button" data-action="remove-staff" data-id="${esc(person.id)}" data-name="${esc(person.name)}">Ta bort åtkomst</button></div></li>`).join("")}</ul>` : `<p class="form-hint">Ingen personal är kopplad ännu.</p>`}
  </section>`;
}

function renderSchools() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Organisation</p><h1 class="h1">Skolor och personal</h1><p class="sub">${esc(state.organization?.name || "")}</p></section>
    ${renderSchoolCodeResult()}
    ${renderInviteResult("staff")}
    ${state.schools.map(renderSchoolAdmin).join("") || emptyState("Ingen skola skapad", "Skapa organisationens första skola nedan.")}
    ${renderStaffAccess()}
    <form class="card form-stack" data-form="school-create"><h2>Skapa ny skola</h2>
      ${field("Skolans namn", "name", "", { required: true })}
      <div class="form-grid">${field("Telefon", "phone", "", { type: "tel" })}${field("Öppettider", "opening_hours", "", { placeholder: "06:30–17:30" })}</div>
      ${field("Adress", "address")}
      <div class="form-grid">${field("Postnummer", "postal_code")}${field("Ort", "city")}</div>
      ${field("Första avdelningen", "department_name", "", { required: true })}
      <button class="primary" type="submit">Skapa skola</button>
    </form>`;
}

function invitationLink(code) {
  return `${location.origin}${location.pathname}?invite=${encodeURIComponent(code)}`;
}

function renderSiblingReview(request) {
  const options = state.children
    .filter((child) => child.department_id === request.department_id)
    .map((child) => [child.id, `${child.name} · ${formatDate(child.birth_date)}`]);
  return `<form class="form-stack sibling-review" data-form="review-only" data-request-id="${esc(request.request_id)}"><p><strong>${esc(request.child_name)}</strong><span class="meta">${esc(formatDate(request.birth_date))} · ${esc(request.department_name)} · ${esc(request.guardian_name)} (${esc(request.guardian_email)})</span></p>${request.note ? `<p class="form-hint">${esc(request.note)}</p>` : ""}${options.length ? selectField("Befintligt barn på avdelningen", "existing_child_id", [["", "Skapa ett nytt barn från förfrågan"], ...options], "") : `<p class="form-hint">Inget barn med det här namnet finns i listan. Godkännande skapar ett nytt barn och kopplar vårdnadshavaren.</p>`}<div class="stack-actions"><button class="primary" type="button" data-action="review-sibling" data-decision="approve" data-id="${esc(request.request_id)}">Godkänn och koppla</button><button class="secondary" type="button" data-action="review-sibling" data-decision="reject" data-id="${esc(request.request_id)}">Avslå</button></div></form>`;
}

function renderPeople() {
  const guardianInvites = state.invitations.filter((invite) => invite.role === "parent" && invite.status === "pending");
  const reviews = state.siblingRequests.filter((request) => request.status === "pending");
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Barn och vårdnadshavare</p><h1 class="h1">Personer</h1><p class="sub">Lägg till barnet på avdelningen. Bjud sedan in varje vårdnadshavare med en egen länk.</p></section>
    ${renderInviteResult("parent")}
    <form class="card form-stack" data-form="child-create"><h2>Lägg till barn</h2>
      ${departmentOptions().length ? selectField("Avdelning", "department_id", departmentOptions(), "", true) : `<p class="notice error">Skapa en skola och avdelning först.</p>`}
      <div class="form-grid">${field("Barnets namn", "name", "", { required: true })}${field("Födelsedatum", "birth_date", "", { type: "date" })}</div>
      <button class="primary" type="submit" ${departmentOptions().length ? "" : "disabled"}>Lägg till barn</button>
    </form>
    <form class="card form-stack" data-form="invite-create"><h2>Bjud in vårdnadshavare</h2>
      <input type="hidden" name="role" value="parent">
      <p class="form-hint">Länken gäller ett barn, kan användas en gång och slutar gälla efter 14 dagar. En andra vårdnadshavare får en egen länk till samma barn. Den som redan har konto öppnar länken och får barnet på samma konto.</p>
      ${field("E-post", "email", "", { type: "email", required: true, autocomplete: "email" })}
      ${selectField("Barn", "child_id", [["", "Välj barn"], ...state.children.map((child) => [child.id, `${child.name} · ${departmentName(child.department_id)}`])], "", true)}
      ${field("Relation", "relation", "Vårdnadshavare", { placeholder: "Vårdnadshavare" })}
      <button class="primary" type="submit" ${state.children.length ? "" : "disabled"}>Skapa inbjudan</button>
    </form>
    <article class="card"><h2>Väntande vårdnadshavarinbjudningar</h2>${guardianInvites.length ? `<ul class="invite-list">${guardianInvites.map((invite) => `<li><div><strong>${esc(invite.email)}</strong><span>${esc(invite.relation || "Vårdnadshavare")} · ${esc(invitePlace(invite))} · ${esc(inviteExpiryLabel(invite))}</span></div>${renderInviteActions(invite)}</li>`).join("")}</ul>` : `<p class="form-hint">Inga väntande inbjudningar.</p>`}</article>
    <article class="card"><h2>Syskonförfrågningar</h2><p class="form-hint">Godkänn bara när du vet att vårdnadshavaren ska kopplas till barnet. Välj ett barn som redan finns, eller låt förfrågan skapa ett nytt.</p>${reviews.length ? reviews.map(renderSiblingReview).join("") : `<p class="form-hint">Inga förfrågningar väntar.</p>`}</article>
    <article class="card"><h2>Barn</h2>${state.children.length ? `<ul class="rows">${state.children.map((child) => `<li><span><strong>${esc(child.name)}</strong><br><small>${esc(departmentName(child.department_id))}</small></span><span class="status">${child.birth_date ? esc(formatDate(child.birth_date)) : "Födelsedatum saknas"}</span></li>`).join("")}</ul>` : `<p class="form-hint">Inga barn registrerade.</p>`}</article>`;
}

function renderOverview() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Organisation</p><h1 class="h1">${esc(state.organization?.name || "")}</h1><p class="sub">${esc(roleLabel(state.profile.role))}</p></section><div class="metric-grid"><article class="metric"><strong>${state.schools.length}</strong><span>Skolor</span></article><article class="metric"><strong>${state.departments.length}</strong><span>Avdelningar</span></article><article class="metric"><strong>${state.children.length}</strong><span>Barn</span></article><article class="metric"><strong>${state.invitations.filter((invite) => invite.status === "pending").length}</strong><span>Väntande inbjudningar</span></article></div>
    <article class="card"><h2>Kom igång</h2><ol class="steps"><li class="done">Organisation skapad</li><li class="${state.schools.length ? "done" : ""}">Skapa skola och avdelning</li><li class="${state.children.length ? "done" : ""}">Lägg till barn</li><li class="${state.invitations.length ? "done" : ""}">Bjud in personal och vårdnadshavare</li></ol></article>`;
}

function renderAccount() {
  const privacySettings = state.profile.role === "parent" ? `<fieldset class="preference-group"><legend>Gemenskap och integritet</legend>
      <label class="check"><input type="checkbox" name="allow_parent_messages" ${state.profile.allow_parent_messages ? "checked" : ""}> Låt andra vårdnadshavare i min avdelning hitta och skriva till mig</label>
      <p class="form-hint">Båda vårdnadshavarna måste ha aktiverat detta. Lärare och administratörer kan alltid skriva privat till dig.</p>
      <label class="check"><input type="checkbox" name="allow_playdate_requests" ${state.profile.allow_playdate_requests ? "checked" : ""}> Visa mig för frivilliga lekförfrågningar</label>
      <p class="form-hint">Båda vårdnadshavarna måste ha aktiverat detta och tillhöra samma avdelning.</p>
      <label class="check"><input type="checkbox" name="allow_birthday_invitations" ${state.profile.allow_birthday_invitations ? "checked" : ""}> Låt andra vårdnadshavare bjuda in mig till privata födelsedagskalas</label>
      <p class="form-hint">Kalasinbjudningar har ett separat frivilligt val. Båda måste ha aktiverat funktionen och tillhöra samma avdelning.</p>
    </fieldset>` : "";
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Konto</p><h1 class="h1">${esc(state.profile.name)}</h1><p class="sub">${esc(state.profile.email)} · ${esc(roleLabel(state.profile.role))}</p></section>
    <form class="card form-stack" data-form="profile-update"><h2>Dina uppgifter</h2>${field("Namn", "name", state.profile.name, { required: true, autocomplete: "name" })}${field("Telefon", "phone", state.profile.phone || "", { type: "tel", autocomplete: "tel" })}${privacySettings}<button class="primary" type="submit">Spara uppgifter</button></form>
    <button class="secondary" data-action="logout">Logga ut</button>`;
}

function renderNav() {
  const role = state.profile?.role;
  const items = role === "admin"
    ? [["overview", "▦", "Översikt"], ["attendance", "✓", "Närvaro"], ["schools", "🏫", "Skolor"], ["messages", "✉", "Gemenskap"], ["people", "👥", "Personer"], ["account", "⚙", "Konto"]]
    : role === "staff"
      ? [["attendance", "✓", "Närvaro"], ["messages", "✉", "Gemenskap"], ["people", "👥", "Barn"], ["account", "⚙", "Konto"]]
      : [["home", "●", "Min dag"], ["child", "🌱", "Barnet"], ["messages", "✉", "Gemenskap"], ["account", "⚙", "Konto"]];
  nav.innerHTML = items.map(([view, icon, label]) => `<button data-action="navigate" data-view="${view}" aria-current="${state.view === view ? "page" : "false"}"><span class="ico">${icon}</span>${label}</button>`).join("");
}

function render() {
  document.documentElement.toggleAttribute("data-busy", state.busy);
  if (!state.session) {
    screen.innerHTML = renderAuth();
    nav.innerHTML = "";
    accountButton.hidden = true;
    renderAssistant();
    return;
  }
  accountButton.hidden = false;
  accountButton.innerHTML = `<strong>${esc(state.profile?.name || "Konto")}</strong><small>${esc(state.profile ? roleLabel(state.profile.role) : "Kom igång")}</small>`;
  if (!state.profile || state.profile.removed_at) {
    screen.innerHTML = state.profile?.removed_at ? renderRemovedAccess() : state.onboarding?.kind === "pending" ? renderPendingAccess() : renderOnboarding();
    nav.innerHTML = "";
    renderAssistant();
    return;
  }
  const views = {
    home: renderParentHome,
    child: renderChildInfo,
    messages: renderMessages,
    attendance: renderAttendance,
    overview: renderOverview,
    schools: renderSchools,
    people: renderPeople,
    account: renderAccount,
  };
  const fallback = state.profile.role === "admin" ? renderOverview : state.profile.role === "staff" ? renderAttendance : renderParentHome;
  screen.innerHTML = (views[state.view] || fallback)();
  renderNav();
  renderAssistant();
}

async function runMutation(work, successText = "Sparat.") {
  state.busy = true;
  state.notice = null;
  render();
  try {
    await work();
    if (successText) state.notice = { type: "success", text: successText };
  } catch (error) {
    state.notice = { type: "error", text: error.message };
  } finally {
    state.busy = false;
    render();
  }
}

async function saveAttendancePlan(childId, values) {
  await rpc("save_attendance_plan", {
    target_child_id: childId,
    plan_status: values.status,
    plan_dropoff_at: values.dropoff_at || null,
    plan_pickup_at: values.pickup_at || null,
    plan_pickup_by: values.pickup_by.trim() || null,
  });
}

document.body.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const type = form.dataset.form;
  if (type === "review-only") return;
  if (type === "assistant-question") {
    const question = String(values.question || "").trim();
    if (!question) return;
    state.assistantQuestion = question;
    state.assistantResponse = assistantAnswer(assistantIntentForQuestion(question));
    renderAssistant();
    requestAnimationFrame(() => document.getElementById("assistantAnswer")?.focus());
    return;
  }
  runMutation(async () => {
    if (type === "login") {
      await login(values.email.trim(), values.password);
      setTimeout(() => scrollTo({ top: 0 }), 0);
      return;
    }
    if (type === "register") {
      await register(values.email.trim(), values.password, values.name.trim());
      setTimeout(() => scrollTo({ top: 0 }), 0);
      return;
    }
    if (type === "accept-invite") {
      await acceptInvitation(values.code);
      return;
    }
    if (type === "create-organization") {
      await rpc("create_organization", {
        organization_name: values.organization_name.trim(),
        organization_type: values.organization_type,
        preschool_name: values.preschool_name.trim(),
        department_name: values.department_name.trim(),
      });
      await loadData();
      state.view = "overview";
      return;
    }
    if (type === "school-code-join") {
      await rpc("request_staff_join", { school_code: values.school_code.trim() });
      await loadData();
      return;
    }
    if (type === "department-create") {
      await rpc("create_department", {
        target_preschool_id: form.dataset.preschoolId,
        department_name: values.department_name.trim(),
      });
      await loadData();
      return;
    }
    if (type === "staff-invite") {
      if (!values.department_id) throw new Error("Välj vilken avdelning personalen ska kopplas till.");
      const invitation = await rpc("create_invitation", {
        invite_email: values.email.trim().toLowerCase(),
        invite_role: "staff",
        invite_department_id: values.department_id,
        invite_child_id: null,
        invite_relation: null,
      });
      state.inviteResult = Array.isArray(invitation) ? invitation[0] : invitation;
      await loadData();
      return;
    }
    if (type === "sibling-request") {
      await rpc("submit_sibling_request", {
        child_name: values.name.trim(),
        child_birth_date: values.birth_date,
        child_department_id: values.department_id,
        request_note: values.note.trim(),
      });
      await loadData();
      return;
    }
    if (type === "school-create") {
      await rpc("create_preschool", {
        school_name: values.name.trim(),
        school_phone: values.phone.trim() || null,
        school_address: values.address.trim() || null,
        school_postal_code: values.postal_code.trim() || null,
        school_city: values.city.trim() || null,
        school_opening_hours: values.opening_hours.trim() || null,
        department_name: values.department_name.trim(),
      });
      await loadData();
      return;
    }
    if (type === "term-create") {
      await rpc("save_school_term", {
        target_term_id: null,
        target_preschool_id: form.dataset.preschoolId,
        term_name: values.term_name.trim(),
        term_starts_on: values.starts_on,
        term_ends_on: values.ends_on,
        term_opens_at: values.opens_at,
        term_closes_at: values.closes_at,
        closures: parseClosureLines(values.closures),
      });
      await loadData();
      return;
    }
    if (type === "child-create") {
      await request("/rest/v1/children", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ department_id: values.department_id, name: values.name.trim(), birth_date: values.birth_date || null }),
      });
      await loadData();
      return;
    }
    if (type === "invite-create") {
      if (!values.child_id) throw new Error("Välj vilket barn vårdnadshavaren ska kopplas till.");
      const invitation = await rpc("create_invitation", {
        invite_email: values.email.trim().toLowerCase(),
        invite_role: "parent",
        invite_department_id: null,
        invite_child_id: values.child_id,
        invite_relation: values.relation.trim() || "Vårdnadshavare",
      });
      state.inviteResult = Array.isArray(invitation) ? invitation[0] : invitation;
      await loadData();
      return;
    }
    if (type === "child-profile") {
      await rpc("update_child_profile", {
        target_child_id: form.dataset.childId,
        child_name: values.name.trim(),
        child_birth_date: values.birth_date || null,
        child_notes: values.notes.trim() || null,
      });
      await loadData();
      return;
    }
    if (type === "child-health") {
      await request("/rest/v1/child_health?on_conflict=child_id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ child_id: form.dataset.childId, allergies: csv(values.allergies), conditions: csv(values.conditions), diet: values.diet.trim() || null, medication: values.medication.trim() || null, emergency: values.emergency.trim() || null, updated_by: state.profile.id, updated_at: new Date().toISOString() }),
      });
      await loadData();
      return;
    }
    if (type === "contact-create") {
      await request("/rest/v1/child_contacts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ child_id: form.dataset.childId, name: values.name.trim(), relation: values.relation.trim(), phone: values.phone.trim() || null, can_pickup: values.can_pickup === "on", is_primary: values.is_primary === "on" }),
      });
      await loadData();
      return;
    }
    if (type === "parent-attendance") {
      await saveAttendancePlan(form.dataset.childId, values);
      await loadData();
      return;
    }
    if (type === "weekly-schedule") {
      const weeklySchedule = WEEKDAYS.map((_, index) => {
        const weekday = index + 1;
        const row = form.querySelector(`[data-weekday="${weekday}"]`);
        const attending = row.querySelector("[data-schedule-attending]").checked;
        return {
          weekday,
          attending,
          dropoff_at: attending ? row.querySelector(`[name="dropoff_${weekday}"]`).value : null,
          pickup_at: attending ? row.querySelector(`[name="pickup_${weekday}"]`).value : null,
        };
      });
      await rpc("save_child_weekly_schedule", {
        target_term_id: form.dataset.termId,
        target_child_id: form.dataset.childId,
        weekly_schedule: weeklySchedule,
      });
      await loadData();
      return;
    }
    if (type === "post-create") {
      await publishPost(form, values);
      await loadData();
      return;
    }
    if (type === "post-comment") {
      await request("/rest/v1/post_comments", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ post_id: form.dataset.postId, author_id: state.profile.id, body: values.body.trim() }),
      });
      await loadData();
      return;
    }
    if (type === "private-message") {
      const [targetType, targetId] = values.recipient_target.split(":");
      await rpc("send_private_message_group", {
        message_body: values.body.trim(),
        target_profile_id: targetType === "profile" ? targetId : null,
        target_child_id: targetType === "child" ? targetId : null,
        send_to_all_guardians: targetType === "child",
      });
      await loadData();
      return;
    }
    if (type === "birthday-create") {
      const recipientIds = Array.from(form.querySelectorAll('input[name="recipient_ids"]:checked'), (input) => input.value);
      if (!recipientIds.length) throw new Error("Välj minst en vårdnadshavare att bjuda in.");
      const startsAt = new Date(values.starts_at);
      const endsAt = new Date(values.ends_at);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) throw new Error("Ange giltig start- och sluttid.");
      await rpc("create_birthday_invitation", {
        host_child_id: values.host_child_id,
        invitation_title: values.title.trim(),
        invitation_starts_at: startsAt.toISOString(),
        invitation_ends_at: endsAt.toISOString(),
        invitation_location: values.location.trim(),
        invitation_message: values.message.trim(),
        invitation_rsvp_by: values.rsvp_by,
        recipient_profile_ids: recipientIds,
      });
      await loadData();
      return;
    }
    if (type === "playdate-create") {
      await rpc("create_playdate_request", {
        target_profile_id: values.recipient_id,
        request_message: values.message.trim(),
      });
      await loadData();
      return;
    }
    if (type === "profile-update") {
      await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(state.profile.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          name: values.name.trim(),
          phone: values.phone.trim() || null,
          allow_parent_messages: state.profile.role === "parent" ? values.allow_parent_messages === "on" : state.profile.allow_parent_messages,
          allow_playdate_requests: state.profile.role === "parent" ? values.allow_playdate_requests === "on" : state.profile.allow_playdate_requests,
          allow_birthday_invitations: state.profile.role === "parent" ? values.allow_birthday_invitations === "on" : state.profile.allow_birthday_invitations,
        }),
      });
      await loadData();
    }
  }, {
    login: "",
    register: "",
    "birthday-create": "Kalasinbjudan är skickad privat.",
    "invite-create": "Inbjudan är skapad. Kopiera länken nu. Den visas inte igen.",
    "staff-invite": "Personalinbjudan är skapad. Kopiera länken nu. Den visas inte igen.",
    "sibling-request": "Förfrågan är skickad. Barnet kopplas först när personalen godkänner den.",
    "school-code-join": "Ansökan är skickad. Uppgifter visas först efter godkännande.",
    "department-create": "Avdelningen är skapad.",
  }[type] ?? "Sparat.");
});

document.body.addEventListener("change", (event) => {
  const input = event.target;
  if (input.matches('[data-action="post-images"]')) renderSelectedPostImages(input);
  if (input.name === "no_children_visible" && input.checked) {
    input.closest("fieldset")?.querySelectorAll('input[name="visible_child_ids"]').forEach((checkbox) => { checkbox.checked = false; });
  }
  if (input.name === "visible_child_ids" && input.checked) {
    const none = input.closest("fieldset")?.querySelector('input[name="no_children_visible"]');
    if (none) none.checked = false;
  }
  if (input.matches("[data-schedule-attending]")) {
    const row = input.closest("[data-weekday]");
    row.querySelectorAll('input[type="time"]').forEach((timeInput) => {
      timeInput.disabled = !input.checked;
      if (!input.checked) timeInput.value = "";
    });
  }
});

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "assistant-toggle" || action === "assistant-close") {
    state.assistantOpen = action === "assistant-toggle" ? !state.assistantOpen : false;
    if (!state.assistantOpen) {
      state.assistantQuestion = "";
      state.assistantResponse = null;
    }
    renderAssistant();
    requestAnimationFrame(() => {
      const focusTarget = state.assistantOpen ? document.getElementById("assistantQuestion") : document.querySelector(".assistant-launcher");
      focusTarget?.focus();
    });
    return;
  }
  if (action === "assistant-quick") {
    state.assistantQuestion = target.textContent.trim();
    state.assistantResponse = assistantAnswer(target.dataset.intent);
    renderAssistant();
    requestAnimationFrame(() => document.getElementById("assistantAnswer")?.focus());
    return;
  }
  if (action === "assistant-go") {
    state.view = target.dataset.view;
    state.assistantOpen = false;
    state.assistantQuestion = "";
    state.assistantResponse = null;
    state.notice = null;
    render();
    requestAnimationFrame(() => {
      const destination = target.dataset.target ? document.getElementById(target.dataset.target) : null;
      if (destination) destination.scrollIntoView({ behavior: "smooth", block: "start" });
      else scrollTo({ top: 0, behavior: "smooth" });
    });
    return;
  }
  if (action === "auth-view") {
    state.authView = target.dataset.view;
    state.notice = null;
    render();
    return;
  }
  if (action === "navigate" || action === "account") {
    state.view = action === "account" ? "account" : target.dataset.view;
    state.notice = null;
    state.assistantOpen = false;
    state.assistantQuestion = "";
    state.assistantResponse = null;
    render();
    scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (action === "select-child") {
    state.selectedChildId = target.dataset.id;
    render();
    return;
  }
  if (action === "bot-reminder") {
    state.view = target.dataset.view;
    state.notice = null;
    render();
    requestAnimationFrame(() => document.getElementById(target.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return;
  }
  if (action === "scroll-section") {
    document.getElementById(target.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "logout") {
    runMutation(logout, "");
    return;
  }
  if (action === "parse-term") {
    const form = target.closest("form");
    try {
      const parsed = parseTermText(form.elements.term_text.value);
      form.elements.term_name.value = parsed.name;
      form.elements.starts_on.value = parsed.startsOn;
      form.elements.ends_on.value = parsed.endsOn;
      form.elements.opens_at.value = parsed.opensAt;
      form.elements.closes_at.value = parsed.closesAt;
      form.elements.closures.value = parsed.closures.map((closure) => `${closure.date} | ${closure.reason}`).join("\n");
      setParseStatus(form, "Ärtan har fyllt i ett utkast. Granska alla datum och tider innan du sparar.");
    } catch (error) {
      setParseStatus(form, error.message, true);
    }
    return;
  }
  if (action === "parse-weekly-schedule") {
    const form = target.closest("form");
    try {
      parseWeeklyScheduleText(form.elements.schedule_text.value).forEach((parsed) => {
        const row = form.querySelector(`[data-weekday="${parsed.weekday}"]`);
        const attending = row.querySelector("[data-schedule-attending]");
        attending.checked = parsed.attending;
        row.querySelector(`[name="dropoff_${parsed.weekday}"]`).value = parsed.dropoff_at || "";
        row.querySelector(`[name="pickup_${parsed.weekday}"]`).value = parsed.pickup_at || "";
        row.querySelectorAll('input[type="time"]').forEach((timeInput) => { timeInput.disabled = !parsed.attending; });
      });
      setParseStatus(form, "Ärtan har fyllt i veckan. Granska varje dag innan du sparar.");
    } catch (error) {
      setParseStatus(form, error.message, true);
    }
    return;
  }
  if (action === "publish-term") {
    runMutation(async () => {
      await rpc("publish_school_term", { target_term_id: target.dataset.id });
      await loadData();
    }, "Terminen är publicerad.");
    return;
  }
  if (action === "staff-attendance") {
    const child = state.children.find((item) => item.id === target.dataset.childId);
    const transition = target.dataset.transition;
    const success = transition === "check_out" ? `${child?.name || "Barnet"} är utcheckad.` : transition === "check_in" ? `${child?.name || "Barnet"} är incheckad.` : `${child?.name || "Barnet"} är markerad som ${transition === "absent_sick" ? "sjuk" : "ledig"}.`;
    runMutation(async () => {
      await rpc("set_child_attendance", { target_child_id: target.dataset.childId, transition });
      await loadData();
    }, success);
    return;
  }
  if (action === "set-consent") {
    runMutation(async () => {
      const allowed = target.dataset.allowed === "true";
      await request("/rest/v1/consents?on_conflict=child_id,type", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ child_id: target.dataset.childId, type: target.dataset.type, allowed, updated_by: state.profile.id, updated_at: new Date().toISOString() }),
      });
      await loadData();
    });
    return;
  }
  if (action === "delete-comment") {
    runMutation(async () => {
      await request(`/rest/v1/post_comments?id=eq.${encodeURIComponent(target.dataset.id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      await loadData();
    }, "Kommentaren är borttagen.");
    return;
  }
  if (action === "delete-post") {
    runMutation(async () => {
      const rows = await rpc("list_post_image_paths_for_delete", { target_post_id: target.dataset.id });
      await deletePostImages((rows || []).map((row) => row.storage_path));
      await rpc("delete_post_with_images", { target_post_id: target.dataset.id });
      await loadData();
    }, "Inlägget och dess bilder är borttagna.");
    return;
  }
  if (action === "birthday-response") {
    runMutation(async () => {
      await rpc("respond_birthday_invitation", {
        target_invitation_id: target.dataset.id,
        response_status: target.dataset.status,
      });
      await loadData();
    }, target.dataset.status === "accepted" ? "Du har svarat att du kommer." : "Du har tackat nej.");
    return;
  }
  if (action === "birthday-cancel") {
    runMutation(async () => {
      await rpc("cancel_birthday_invitation", { target_invitation_id: target.dataset.id });
      await loadData();
    }, "Kalaset är avbrutet och mottagarna ser ändringen.");
    return;
  }
  if (action === "birthday-delete") {
    runMutation(async () => {
      await rpc("delete_birthday_invitation", { target_invitation_id: target.dataset.id });
      await loadData();
    }, "Kalaset är permanent borttaget.");
    return;
  }
  if (action === "playdate-response") {
    runMutation(async () => {
      await rpc("respond_playdate_request", {
        target_request_id: target.dataset.id,
        response_status: target.dataset.status,
      });
      await loadData();
    }, target.dataset.status === "accepted" ? "Lekförfrågan är accepterad." : "Lekförfrågan är avböjd.");
    return;
  }
  if (action === "copy-invite") {
    const link = invitationLink(target.dataset.token);
    runMutation(async () => navigator.clipboard.writeText(link), "Inbjudningslänken är kopierad.");
    return;
  }
  if (action === "copy-text") {
    runMutation(async () => navigator.clipboard.writeText(target.dataset.text), "Koden är kopierad.");
    return;
  }
  if (action === "resend-invite") {
    runMutation(async () => {
      const invitation = await rpc("resend_invitation", { invite_id: target.dataset.id });
      state.inviteResult = Array.isArray(invitation) ? invitation[0] : invitation;
      await loadData();
    }, "En ny länk är skapad. Kopiera den nu. Den tidigare länken fungerar inte längre.");
    return;
  }
  if (action === "revoke-invite") {
    runMutation(async () => {
      await rpc("revoke_invitation", { invite_id: target.dataset.id });
      if (state.inviteResult?.id === target.dataset.id) state.inviteResult = null;
      await loadData();
    }, "Inbjudan är återkallad.");
    return;
  }
  if (action === "rotate-school-code") {
    runMutation(async () => {
      const result = await rpc("rotate_school_join_code", { target_preschool_id: target.dataset.id });
      state.schoolCodeResult = Array.isArray(result) ? result[0] : result;
      await loadData();
    }, "Ny skolkod är skapad. Kopiera den nu. Den tidigare koden fungerar inte längre.");
    return;
  }
  if (action === "approve-join") {
    const form = target.closest("form");
    const departmentId = form?.elements.department_id?.value;
    if (!departmentId) {
      state.notice = { type: "error", text: "Välj avdelning innan du godkänner." };
      render();
      return;
    }
    runMutation(async () => {
      await rpc("approve_staff_join", { request_id: target.dataset.id, target_department_id: departmentId });
      await loadData();
    }, "Ansökan är godkänd och personen är kopplad till avdelningen.");
    return;
  }
  if (action === "reject-join") {
    runMutation(async () => {
      await rpc("reject_staff_join", { request_id: target.dataset.id });
      await loadData();
    }, "Ansökan är avslagen.");
    return;
  }
  if (action === "remove-staff") {
    const name = target.dataset.name || "personen";
    if (!window.confirm(`Ta bort åtkomsten för ${name}? Barn och vårdnadshavare finns kvar. Personen ser inga uppgifter efteråt.`)) return;
    runMutation(async () => {
      await rpc("remove_staff_member", { target_profile_id: target.dataset.id });
      await loadData();
    }, "Personalens åtkomst är borttagen.");
    return;
  }
  if (action === "review-sibling") {
    const form = target.closest("form");
    const existingChildId = target.dataset.decision === "approve" ? form?.elements.existing_child_id?.value || null : null;
    runMutation(async () => {
      await rpc("review_sibling_request", {
        request_id: target.dataset.id,
        decision: target.dataset.decision,
        existing_child_id: existingChildId,
      });
      await loadData();
    }, target.dataset.decision === "approve" ? "Förfrågan är godkänd och vårdnadshavaren är kopplad." : "Förfrågan är avslagen.");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.assistantOpen) return;
  state.assistantOpen = false;
  state.assistantQuestion = "";
  state.assistantResponse = null;
  renderAssistant();
  requestAnimationFrame(() => document.querySelector(".assistant-launcher")?.focus());
});

(async function start() {
  if (state.session) {
    state.busy = true;
    render();
    try {
      if (state.inviteCode) {
        try {
          await acceptInvitation(state.inviteCode);
        } catch (error) {
          state.notice = { type: "error", text: error.message };
          await loadData();
        }
      } else {
        await loadData();
      }
    } catch (error) {
      state.notice = { type: "error", text: error.message };
      if (/jwt|token|session/i.test(error.message)) saveSession(null);
    } finally {
      state.busy = false;
    }
  }
  render();
})();
