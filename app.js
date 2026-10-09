const APP_NAME = "ärtan";
const STORAGE_KEY = "artan.session";
const config = window.ARTAN_SUPABASE || {};
const inviteFromUrl = new URLSearchParams(location.search).get("invite")?.trim().toUpperCase() || "";

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
  posts: [],
  invitations: [],
  selectedChildId: null,
  view: inviteFromUrl ? "join" : "home",
  authView: inviteFromUrl ? "register" : "login",
  inviteCode: inviteFromUrl,
  inviteResult: null,
  notice: null,
  busy: false,
};

const screen = document.querySelector("#screen");
const nav = document.querySelector("#bottomNav");
const accountButton = document.querySelector('[data-action="account"]');

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

function roleLabel(role) {
  return { admin: "Organisation", staff: "Personal", parent: "Förälder" }[role] || role;
}

function attendanceLabel(status) {
  return { in: "Inne", absent_sick: "Sjuk", absent_leave: "Ledig", picked_up: "Hämtad" }[status] || "Ej registrerad";
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
  const result = await request("/auth/v1/signup", {
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
      posts: [],
      invitations: [],
      selectedChildId: null,
      view: "home",
      notice: null,
    });
  }
}

async function loadData() {
  await refreshSessionIfNeeded();
  if (!state.session?.access_token) return;
  const userId = state.session.user?.id;
  if (!userId) throw new Error("Sessionen saknar användar-id.");
  const profiles = await request(`/rest/v1/profiles?select=id,auth_user_id,organization_id,name,email,phone,role&auth_user_id=eq.${encodeURIComponent(userId)}&limit=1`);
  state.profile = profiles[0] || null;
  if (!state.profile) {
    state.organization = null;
    state.view = state.inviteCode ? "join" : "onboarding";
    return;
  }

  const organizationId = encodeURIComponent(state.profile.organization_id);
  const date = todayIso();
  const [organizations, schools, departments, staffAssignments, children, health, contacts, consents, attendance, posts, invitations] = await Promise.all([
    request(`/rest/v1/organizations?select=id,name,type,created_at&id=eq.${organizationId}&limit=1`),
    request(`/rest/v1/preschools?select=id,organization_id,name,phone,address,postal_code,city,opening_hours,created_at&organization_id=eq.${organizationId}&order=name.asc`),
    request("/rest/v1/departments?select=id,preschool_id,name,created_at&order=name.asc"),
    request("/rest/v1/staff_departments?select=staff_id,department_id"),
    request("/rest/v1/children?select=id,department_id,name,birth_date,notes,avatar_color,created_at&order=name.asc"),
    request("/rest/v1/child_health?select=child_id,allergies,diet,conditions,medication,emergency,updated_at"),
    request("/rest/v1/child_contacts?select=id,child_id,name,relation,phone,can_pickup,is_primary,created_at&order=name.asc"),
    request("/rest/v1/consents?select=child_id,type,allowed,updated_at"),
    request(`/rest/v1/attendance?select=id,child_id,date,status,dropoff_at,pickup_at,pickup_by,updated_at&date=eq.${date}`),
    request("/rest/v1/posts?select=id,department_id,child_id,type,title,body,created_at&order=created_at.desc&limit=100"),
    request("/rest/v1/invitations?select=id,email,role,relation,code,status,department_id,child_id,expires_at,created_at&order=created_at.desc&limit=100"),
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
  state.posts = posts;
  state.invitations = invitations;
  if (!state.children.some((child) => child.id === state.selectedChildId)) state.selectedChildId = state.children[0]?.id || null;
  const allowedViews = {
    admin: ["overview", "schools", "people", "account"],
    staff: ["attendance", "messages", "people", "account"],
    parent: ["home", "child", "messages", "account"],
  };
  const roleViews = allowedViews[state.profile.role] || allowedViews.parent;
  if (!roleViews.includes(state.view)) state.view = roleViews[0];
}

async function acceptInvitation(code) {
  await rpc("accept_invitation", { invite_code: code.trim().toUpperCase() });
  state.inviteCode = "";
  history.replaceState({}, "", `${location.pathname}${location.hash}`);
  await loadData();
  state.notice = { type: "success", text: "Inbjudan är accepterad. Välkommen till ärtan!" };
}

function noticeHtml() {
  if (!state.notice) return "";
  return `<div class="notice ${esc(state.notice.type)}" role="status">${esc(state.notice.text)}</div>`;
}

function peaMascot() {
  return `<svg class="pea-mascot" viewBox="0 0 140 130" role="img" aria-label="ärtans maskot">
    <ellipse class="mascot-shadow" cx="72" cy="119" rx="38" ry="7"/>
    <circle class="mascot-body" cx="71" cy="58" r="37"/>
    <path class="mascot-leg" d="M54 91c-6 7-11 13-18 19"/><path class="mascot-leg" d="M82 93c7 3 14 7 23 14"/>
    <path class="mascot-arm" d="M38 66c-10 4-16 10-20 18"/><path class="mascot-arm" d="M101 61c12-6 19-14 23-25"/>
    <circle class="mascot-eye-white" cx="59" cy="49" r="11"/><circle class="mascot-eye-white" cx="83" cy="47" r="11"/>
    <circle class="mascot-eye" cx="62" cy="50" r="6"/><circle class="mascot-eye" cx="86" cy="48" r="6"/>
    <path class="mascot-smile" d="M65 70c5 4 11 4 16 0"/>
  </svg>`;
}

function emptyState(title, text) {
  return `<article class="empty-card"><h3>${esc(title)}</h3><p>${esc(text)}</p></article>`;
}

function field(label, name, value = "", options = {}) {
  const { type = "text", required = false, placeholder = "", autocomplete = "", min = "", max = "", minlength = "" } = options;
  return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${autocomplete ? `autocomplete="${esc(autocomplete)}"` : ""} ${min ? `min="${esc(min)}"` : ""} ${max ? `max="${esc(max)}"` : ""} ${minlength ? `minlength="${esc(minlength)}"` : ""}></label>`;
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
  return `${noticeHtml()}
    <section class="hero-card auth-card">${peaMascot()}<div><p class="kicker">${APP_NAME}</p><h1 class="h1">${registerMode ? "Skapa konto" : "Välkommen"}</h1><p class="sub">${registerMode ? "Använd din riktiga e-postadress. Därefter skapar du en organisation eller ansluter med en inbjudan." : "Logga in för att nå din organisation, skola eller ditt barn."}</p></div></section>
    ${disabled ? `<article class="card important"><h3>Konfiguration saknas</h3><p>Aktivera Supabase i <code>supabase-config.js</code>.</p></article>` : ""}
    <form class="card form-stack" data-form="${registerMode ? "register" : "login"}">
      ${registerMode ? field("Namn", "name", "", { required: true, autocomplete: "name" }) : ""}
      ${field("E-post", "email", "", { type: "email", required: true, autocomplete: "email" })}
      ${field("Lösenord", "password", "", { type: "password", required: true, autocomplete: registerMode ? "new-password" : "current-password", minlength: "8" })}
      ${state.inviteCode ? `<p class="form-hint">Inbjudningskod: <strong>${esc(state.inviteCode)}</strong></p>` : ""}
      <button class="primary" type="submit" ${disabled ? "disabled" : ""}>${registerMode ? "Skapa konto" : "Logga in"}</button>
      <button class="secondary" type="button" data-action="auth-view" data-view="${registerMode ? "login" : "register"}">${registerMode ? "Jag har redan konto" : "Skapa nytt konto"}</button>
    </form>`;
}

function renderOnboarding() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Kom igång</p><h1 class="h1">Anslut till ärtan</h1><p class="sub">Skapa en ny organisation eller använd koden du fått från skolan.</p></section>
    <form class="card form-stack" data-form="accept-invite">
      <h2>Jag har en inbjudan</h2>
      ${field("Inbjudningskod", "code", state.inviteCode, { required: true, placeholder: "Skriv koden här" })}
      <button class="primary" type="submit">Acceptera inbjudan</button>
    </form>
    <form class="card form-stack" data-form="create-organization">
      <h2>Starta en organisation</h2>
      ${field("Organisationens namn", "organization_name", "", { required: true, placeholder: "Exempelvis Förskolor AB" })}
      ${selectField("Organisationstyp", "organization_type", [["kommun", "Kommun"], ["privat", "Privat"], ["kooperativ", "Kooperativ"]], "privat", true)}
      ${field("Första skolans namn", "preschool_name", "", { required: true })}
      ${field("Första avdelningen", "department_name", "", { required: true })}
      <button class="primary" type="submit">Skapa organisation</button>
    </form>`;
}

function childTabs() {
  if (!state.children.length) return "";
  return `<div class="child-tabs">${state.children.map((child) => `<button type="button" data-action="select-child" data-id="${esc(child.id)}" aria-pressed="${child.id === state.selectedChildId}">${esc(child.name)}<small>${esc(departmentName(child.department_id))}</small></button>`).join("")}</div>`;
}

function renderParentHome() {
  const child = selectedChild();
  if (!child) return `${noticeHtml()}<section class="hero-card"><p class="kicker">Min dag</p><h1 class="h1">Välkommen</h1><p class="sub">När skolan har lagt till och kopplat ditt barn visas informationen här.</p></section>${emptyState("Inget barn kopplat", "Kontakta skolan om du redan har accepterat en inbjudan.")}`;
  const attendance = attendanceFor(child.id);
  const messages = state.posts.filter((post) => !post.child_id || post.child_id === child.id).slice(0, 3);
  return `${noticeHtml()}${childTabs()}<section class="hero-card home-hero"><div><p class="kicker">${esc(new Intl.DateTimeFormat("sv-SE", { dateStyle: "full" }).format(new Date()))}</p><h1 class="h1">${esc(child.name)}</h1><p class="big-status">${esc(attendanceLabel(attendance?.status))}</p><p class="sub">${esc(departmentName(child.department_id))}${attendance?.pickup_at ? ` · hämtning ${esc(attendance.pickup_at.slice(0, 5))}` : ""}</p></div>${peaMascot()}</section>
    <form class="card form-stack" data-form="parent-attendance" data-child-id="${esc(child.id)}"><h2>Dagens plan</h2>
      ${selectField("Status", "status", [["in", "På plats"], ["absent_sick", "Sjuk"], ["absent_leave", "Ledig"]], attendance?.status || "in", true)}
      <div class="form-grid">${field("Lämning", "dropoff_at", attendance?.dropoff_at?.slice(0, 5) || "", { type: "time" })}${field("Hämtning", "pickup_at", attendance?.pickup_at?.slice(0, 5) || "", { type: "time" })}</div>
      ${field("Vem hämtar?", "pickup_by", attendance?.pickup_by || "")}
      <button class="primary" type="submit">Spara dagens plan</button>
    </form>
    <section><div class="section-head"><div><p class="kicker">Från skolan</p><h2>Meddelanden</h2></div><button class="link" data-action="navigate" data-view="messages">Visa alla</button></div>${messages.map(renderPost).join("") || emptyState("Inga meddelanden", "Nya meddelanden från personalen visas här.")}</section>`;
}

function renderPost(post) {
  const scope = post.child_id ? state.children.find((child) => child.id === post.child_id)?.name : departmentName(post.department_id);
  return `<article class="card"><p class="kicker">${esc(scope || "Skolan")} · ${esc(formatTimestamp(post.created_at))}</p><h3>${esc(post.title)}</h3><p class="pre-line">${esc(post.body)}</p></article>`;
}

function renderChildInfo() {
  const child = selectedChild();
  if (!child) return `${noticeHtml()}${emptyState("Inget barn kopplat", "Barnets uppgifter visas när en inbjudan har accepterats.")}`;
  const health = healthFor(child.id);
  const contacts = contactsFor(child.id);
  const consentOptions = [
    ["app_images", "Bilder i ärtan"],
    ["group_images", "Gruppbilder"],
    ["social_media", "Skolans sociala medier"],
  ];
  return `${noticeHtml()}${childTabs()}<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">${esc(child.name)}</h1><p class="sub">Uppgifterna delas bara med behörig personal och vårdnadshavare.</p></section>
    <form class="card form-stack" data-form="child-profile" data-child-id="${esc(child.id)}"><h2>Grunduppgifter</h2>
      ${field("Barnets namn", "name", child.name, { required: true, autocomplete: "name" })}
      ${field("Födelsedatum", "birth_date", child.birth_date || "", { type: "date" })}
      ${textareaField("Det här behöver personalen veta", "notes", child.notes || "", "Trygghet, språk, rutiner eller annat viktigt")}
      <button class="primary" type="submit">Spara grunduppgifter</button>
    </form>
    <form class="card form-stack" data-form="child-health" data-child-id="${esc(child.id)}"><h2>Hälsa och omsorg</h2>
      ${field("Allergier, separera med kommatecken", "allergies", health.allergies?.join(", ") || "")}
      ${field("Sjukdomar eller tillstånd", "conditions", health.conditions?.join(", ") || "")}
      ${textareaField("Specialkost", "diet", health.diet || "")}
      ${textareaField("Medicin och instruktion", "medication", health.medication || "")}
      ${textareaField("Akut information", "emergency", health.emergency || "")}
      <button class="primary" type="submit">Spara hälsoinformation</button>
      ${health.updated_at ? `<p class="form-hint">Senast uppdaterad ${esc(formatTimestamp(health.updated_at))}</p>` : ""}
    </form>
    <article class="card"><h2>Samtycken</h2><div class="consent-grid">${consentOptions.map(([type, label]) => `<button type="button" class="consent ${consentFor(child.id, type) ? "good" : "bad"}" data-action="toggle-consent" data-child-id="${esc(child.id)}" data-type="${esc(type)}"><strong>${esc(label)}</strong><span>${consentFor(child.id, type) ? "Tillåtet" : "Inte tillåtet"}</span></button>`).join("")}</div></article>
    <article class="card"><h2>Kontaktpersoner</h2>${contacts.length ? `<ul class="contact-list">${contacts.map((contact) => `<li><div><strong>${esc(contact.name)}</strong><span>${esc(contact.relation)}${contact.can_pickup ? " · får hämta" : ""}${contact.is_primary ? " · primär" : ""}</span></div>${contact.phone ? `<a href="tel:${esc(contact.phone.replace(/\s/g, ""))}">${esc(contact.phone)}</a>` : ""}</li>`).join("")}</ul>` : `<p class="form-hint">Inga kontaktpersoner registrerade.</p>`}</article>
    <form class="card form-stack" data-form="contact-create" data-child-id="${esc(child.id)}"><h2>Lägg till kontaktperson</h2>
      <div class="form-grid">${field("Namn", "name", "", { required: true })}${field("Relation", "relation", "", { required: true, placeholder: "Exempelvis mormor" })}</div>
      ${field("Telefon", "phone", "", { type: "tel", autocomplete: "tel" })}
      <label class="check"><input type="checkbox" name="can_pickup"> Personen får hämta barnet</label>
      <label class="check"><input type="checkbox" name="is_primary"> Primär kontakt</label>
      <button class="primary" type="submit">Lägg till kontakt</button>
    </form>`;
}

function renderMessages() {
  const availableDepartments = editableDepartments();
  const canPublish = (state.profile.role === "staff" || state.profile.role === "admin") && availableDepartments.length > 0;
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Meddelanden</p><h1 class="h1">Från skolan</h1><p class="sub">Meddelanden lagras i organisationen och visas bara för rätt avdelning eller barn.</p></section>
    ${canPublish ? `<form class="card form-stack" data-form="post-create"><h2>Publicera meddelande</h2>
      ${selectField("Avdelning", "department_id", availableDepartments.map((department) => [department.id, `${schoolName(department.preschool_id)} · ${department.name}`]), "", true)}
      ${selectField("Barn, valfritt", "child_id", [["", "Hela avdelningen"], ...state.children.map((child) => [child.id, child.name])], "")}
      ${field("Rubrik", "title", "", { required: true })}${textareaField("Meddelande", "body", "", "Skriv ett tydligt meddelande", true)}
      <button class="primary" type="submit">Publicera</button></form>` : ""}
    ${state.posts.map(renderPost).join("") || emptyState("Inga meddelanden", canPublish ? "Publicera det första meddelandet ovan." : "Skolan har inte publicerat något ännu.")}`;
}

function renderAttendance() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Närvaro</p><h1 class="h1">Idag</h1><p class="sub">${esc(todayIso())} · ${state.children.length} barn i dina avdelningar</p></section>
    ${state.children.length ? `<div class="attendance-list">${state.children.map((child) => {
      const attendance = attendanceFor(child.id);
      return `<article class="card attendance-row"><div><strong>${esc(child.name)}</strong><span>${esc(departmentName(child.department_id))}${attendance?.pickup_at ? ` · hämtas ${esc(attendance.pickup_at.slice(0, 5))}` : ""}</span></div><div class="status-buttons">${[["in", "Inne"], ["picked_up", "Hämtad"], ["absent_sick", "Sjuk"], ["absent_leave", "Ledig"]].map(([status, label]) => `<button type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-status="${status}" aria-pressed="${attendance?.status === status}">${label}</button>`).join("")}</div></article>`;
    }).join("")}</div>` : emptyState("Inga barn", "Du behöver kopplas till en avdelning innan närvarolistan visas.")}`;
}

function editableDepartments() {
  if (state.profile.role !== "staff") return state.departments;
  const assignedIds = new Set(state.staffAssignments.map((assignment) => assignment.department_id));
  return state.departments.filter((department) => assignedIds.has(department.id));
}

function departmentOptions() {
  return editableDepartments().map((department) => [department.id, `${schoolName(department.preschool_id)} · ${department.name}`]);
}

function renderSchools() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Organisation</p><h1 class="h1">Skolor</h1><p class="sub">${esc(state.organization?.name || "")}</p></section>
    ${state.schools.map((school) => `<article class="card"><p class="kicker">Skola</p><h2>${esc(school.name)}</h2><p>${esc(compact([school.address, compact([school.postal_code, school.city]).join(" ")]).join(", ") || "Ingen adress registrerad")}</p><p class="meta">${esc(compact([school.phone, school.opening_hours]).join(" · ") || "Inga kontaktuppgifter registrerade")}</p><ul class="rows">${state.departments.filter((department) => department.preschool_id === school.id).map((department) => `<li><span>${esc(department.name)}</span><span class="status">${state.children.filter((child) => child.department_id === department.id).length} barn</span></li>`).join("") || "<li><span>Inga avdelningar</span></li>"}</ul></article>`).join("") || emptyState("Ingen skola skapad", "Skapa organisationens första skola nedan.")}
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

function renderPeople() {
  const admin = state.profile.role === "admin";
  const pendingInvites = state.invitations.filter((invite) => invite.status === "pending");
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Barn och inbjudningar</p><h1 class="h1">Personer</h1><p class="sub">Lägg till barnet först. Bjud sedan in vårdnadshavare eller personal med rätt behörighet.</p></section>
    <form class="card form-stack" data-form="child-create"><h2>Lägg till barn</h2>
      ${departmentOptions().length ? selectField("Avdelning", "department_id", departmentOptions(), "", true) : `<p class="notice error">Skapa en skola och avdelning först.</p>`}
      <div class="form-grid">${field("Barnets namn", "name", "", { required: true })}${field("Födelsedatum", "birth_date", "", { type: "date" })}</div>
      <button class="primary" type="submit" ${departmentOptions().length ? "" : "disabled"}>Lägg till barn</button>
    </form>
    <form class="card form-stack" data-form="invite-create"><h2>Skapa inbjudan</h2>
      ${admin ? selectField("Roll", "role", [["parent", "Vårdnadshavare"], ["staff", "Personal"]], "parent", true) : `<input type="hidden" name="role" value="parent"><p class="form-hint">Du kan bjuda in vårdnadshavare till barn i din avdelning.</p>`}
      ${field("E-post", "email", "", { type: "email", required: true, autocomplete: "email" })}
      ${selectField("Barn (för vårdnadshavare)", "child_id", [["", "Välj barn"], ...state.children.map((child) => [child.id, `${child.name} · ${departmentName(child.department_id)}`])], "")}
      ${admin ? selectField("Avdelning (för personal)", "department_id", [["", "Välj avdelning"], ...departmentOptions()], "") : ""}
      ${field("Relation", "relation", "Vårdnadshavare", { placeholder: "Vårdnadshavare" })}
      <button class="primary" type="submit">Skapa inbjudan</button>
    </form>
    ${state.inviteResult ? `<article class="card success-card"><p class="kicker">Inbjudan skapad</p><h3>${esc(state.inviteResult.email)}</h3><code class="invite-code">${esc(state.inviteResult.code)}</code><div class="actions"><button class="primary" data-action="copy-invite" data-code="${esc(state.inviteResult.code)}">Kopiera inbjudningslänk</button><a class="secondary button-link" href="mailto:${encodeURIComponent(state.inviteResult.email)}?subject=${encodeURIComponent(`Inbjudan till ${APP_NAME}`)}&body=${encodeURIComponent(`Du är inbjuden till ${APP_NAME}. Öppna ${invitationLink(state.inviteResult.code)}`)}">Öppna e-post</a></div></article>` : ""}
    <article class="card"><h2>Aktiva inbjudningar</h2>${pendingInvites.length ? `<ul class="invite-list">${pendingInvites.map((invite) => `<li><div><strong>${esc(invite.email)}</strong><span>${esc(roleLabel(invite.role))} · går ut ${esc(formatDate(invite.expires_at?.slice(0, 10)))}</span><code>${esc(invite.code)}</code></div><div><button class="link" data-action="copy-invite" data-code="${esc(invite.code)}">Kopiera</button><button class="link danger-link" data-action="revoke-invite" data-id="${esc(invite.id)}">Återkalla</button></div></li>`).join("")}</ul>` : `<p class="form-hint">Inga väntande inbjudningar.</p>`}</article>
    <article class="card"><h2>Barn</h2>${state.children.length ? `<ul class="rows">${state.children.map((child) => `<li><span><strong>${esc(child.name)}</strong><br><small>${esc(departmentName(child.department_id))}</small></span><span class="status">${child.birth_date ? esc(formatDate(child.birth_date)) : "Födelsedatum saknas"}</span></li>`).join("")}</ul>` : `<p class="form-hint">Inga barn registrerade.</p>`}</article>`;
}

function renderOverview() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Organisation</p><h1 class="h1">${esc(state.organization?.name || "")}</h1><p class="sub">${esc(roleLabel(state.profile.role))}</p></section><div class="metric-grid"><article class="metric"><strong>${state.schools.length}</strong><span>Skolor</span></article><article class="metric"><strong>${state.departments.length}</strong><span>Avdelningar</span></article><article class="metric"><strong>${state.children.length}</strong><span>Barn</span></article><article class="metric"><strong>${state.invitations.filter((invite) => invite.status === "pending").length}</strong><span>Väntande inbjudningar</span></article></div>
    <article class="card"><h2>Kom igång</h2><ol class="steps"><li class="done">Organisation skapad</li><li class="${state.schools.length ? "done" : ""}">Skapa skola och avdelning</li><li class="${state.children.length ? "done" : ""}">Lägg till barn</li><li class="${state.invitations.length ? "done" : ""}">Bjud in personal och vårdnadshavare</li></ol></article>`;
}

function renderAccount() {
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Konto</p><h1 class="h1">${esc(state.profile.name)}</h1><p class="sub">${esc(state.profile.email)} · ${esc(roleLabel(state.profile.role))}</p></section>
    <form class="card form-stack" data-form="profile-update"><h2>Dina uppgifter</h2>${field("Namn", "name", state.profile.name, { required: true, autocomplete: "name" })}${field("Telefon", "phone", state.profile.phone || "", { type: "tel", autocomplete: "tel" })}<button class="primary" type="submit">Spara uppgifter</button></form>
    <button class="secondary" data-action="logout">Logga ut</button>`;
}

function renderNav() {
  const role = state.profile?.role;
  const items = role === "admin"
    ? [["overview", "▦", "Översikt"], ["schools", "🏫", "Skolor"], ["people", "👥", "Personer"], ["account", "⚙", "Konto"]]
    : role === "staff"
      ? [["attendance", "✓", "Närvaro"], ["messages", "✎", "Meddelanden"], ["people", "👥", "Barn"], ["account", "⚙", "Konto"]]
      : [["home", "●", "Min dag"], ["child", "🌱", "Barnet"], ["messages", "✉", "Meddelanden"], ["account", "⚙", "Konto"]];
  nav.innerHTML = items.map(([view, icon, label]) => `<button data-action="navigate" data-view="${view}" aria-current="${state.view === view ? "page" : "false"}"><span class="ico">${icon}</span>${label}</button>`).join("");
}

function render() {
  document.documentElement.toggleAttribute("data-busy", state.busy);
  if (!state.session) {
    screen.innerHTML = renderAuth();
    nav.innerHTML = "";
    accountButton.hidden = true;
    return;
  }
  accountButton.hidden = false;
  accountButton.innerHTML = `<strong>${esc(state.profile?.name || "Konto")}</strong><small>${esc(state.profile ? roleLabel(state.profile.role) : "Kom igång")}</small>`;
  if (!state.profile) {
    screen.innerHTML = renderOnboarding();
    nav.innerHTML = "";
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

async function upsertAttendance(childId, values) {
  await request("/rest/v1/attendance?on_conflict=child_id,date", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ child_id: childId, date: todayIso(), ...values, updated_by: state.profile.id, updated_at: new Date().toISOString() }),
  });
}

document.body.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const type = form.dataset.form;
  runMutation(async () => {
    if (type === "login") {
      await login(values.email.trim(), values.password);
      return;
    }
    if (type === "register") {
      await register(values.email.trim(), values.password, values.name.trim());
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
      const role = values.role;
      if (role === "parent" && !values.child_id) throw new Error("Välj vilket barn vårdnadshavaren ska kopplas till.");
      if (role === "staff" && !values.department_id) throw new Error("Välj vilken avdelning personalen ska kopplas till.");
      const invitation = await rpc("create_invitation", {
        invite_email: values.email.trim().toLowerCase(),
        invite_role: role,
        invite_department_id: role === "staff" ? values.department_id : null,
        invite_child_id: role === "parent" ? values.child_id : null,
        invite_relation: role === "parent" ? values.relation.trim() || "Vårdnadshavare" : null,
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
      await upsertAttendance(form.dataset.childId, { status: values.status, dropoff_at: values.dropoff_at || null, pickup_at: values.pickup_at || null, pickup_by: values.pickup_by.trim() || null });
      await loadData();
      return;
    }
    if (type === "post-create") {
      const childId = values.child_id || null;
      if (childId && state.children.find((child) => child.id === childId)?.department_id !== values.department_id) throw new Error("Barnet tillhör inte vald avdelning.");
      await request("/rest/v1/posts", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ department_id: values.department_id, child_id: childId, author_id: state.profile.id, type: "message", title: values.title.trim(), body: values.body.trim() }),
      });
      await loadData();
      return;
    }
    if (type === "profile-update") {
      await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(state.profile.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ name: values.name.trim(), phone: values.phone.trim() || null }),
      });
      await loadData();
    }
  }, type === "login" || type === "register" ? "" : "Sparat.");
});

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "auth-view") {
    state.authView = target.dataset.view;
    state.notice = null;
    render();
    return;
  }
  if (action === "navigate" || action === "account") {
    state.view = action === "account" ? "account" : target.dataset.view;
    state.notice = null;
    render();
    scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (action === "select-child") {
    state.selectedChildId = target.dataset.id;
    render();
    return;
  }
  if (action === "logout") {
    runMutation(logout, "");
    return;
  }
  if (action === "staff-attendance") {
    runMutation(async () => {
      await upsertAttendance(target.dataset.childId, { status: target.dataset.status });
      await loadData();
    });
    return;
  }
  if (action === "toggle-consent") {
    runMutation(async () => {
      const allowed = !consentFor(target.dataset.childId, target.dataset.type);
      await request("/rest/v1/consents?on_conflict=child_id,type", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ child_id: target.dataset.childId, type: target.dataset.type, allowed, updated_by: state.profile.id, updated_at: new Date().toISOString() }),
      });
      await loadData();
    });
    return;
  }
  if (action === "copy-invite") {
    const link = invitationLink(target.dataset.code);
    runMutation(async () => navigator.clipboard.writeText(link), "Inbjudningslänken är kopierad.");
    return;
  }
  if (action === "revoke-invite") {
    runMutation(async () => {
      await request(`/rest/v1/invitations?id=eq.${encodeURIComponent(target.dataset.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ status: "revoked", revoked_at: new Date().toISOString() }),
      });
      await loadData();
    }, "Inbjudan är återkallad.");
  }
});

(async function start() {
  if (state.session) {
    state.busy = true;
    render();
    try {
      await loadData();
    } catch (error) {
      state.notice = { type: "error", text: error.message };
      if (/jwt|token|session/i.test(error.message)) saveSession(null);
    } finally {
      state.busy = false;
    }
  }
  render();
})();
