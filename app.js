const APP_NAME = "ärtan";
const STORAGE_KEY = "artan.session";
const config = window.ARTAN_SUPABASE || {};
const inviteFromUrl = new URLSearchParams(location.search).get("invite")?.trim() || "";
const passFromUrl = new URLSearchParams(location.search).get("pass")?.trim() || "";

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
  childBoxItems: [],
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
  organizationPeople: [],
  onboarding: null,
  schoolCodeResult: null,
  migrationReady: true,
  pickupReady: true,
  pickupContacts: [],
  pickupPasses: [],
  permanentPasses: [],
  permanentPassesReady: true,
  pickupNotices: [],
  incidentReady: true,
  childBoxReady: true,
  attendanceNotesReady: true,
  multiDayAbsenceReady: true,
  familyFeaturesReady: true,
  schoolExperienceReady: true,
  portfolioItems: [],
  portfolioUrls: {},
  lostFoundPosts: [],
  lostFoundUrls: {},
  schoolBanners: [],
  schoolEvents: [],
  schoolProgress: [],
  schoolAssignments: [],
  schoolExperienceSchools: [],
  schoolTimetable: [],
  afterSchoolSchedules: [],
  childDocuments: [],
  childDocumentUrls: {},
  childTeachers: [],
  schoolNotices: [],
  notices: [],
  incidents: [],
  incidentCopies: [],
  incidentScreen: "list",
  incidentId: null,
  incidentDetail: null,
  createdPass: null,
  openedPass: null,
  pickupCalendars: {},
  pickupWeekReady: true,
  departmentPickup: [],
  pickupEditor: null,
  checkout: null,
  scan: null,
  publicPass: null,
  calendarReady: true,
  calendarFeed: null,
  calendarToken: null,
  termManagersReady: true,
  termPermissions: [],
  termManagers: [],
  classListReady: true,
  classListConsents: [],
  classList: [],
  mealsReady: true,
  mealBundles: {},
  mealWeekStart: "",
  mealPreschoolId: "",
  mealDemo: false,
  mealDemoToday: "",
  mealImport: null,
  mealImportCancel: false,
  mealHorizon: null,
  mealTermFixture: false,
  childPhotoUrls: {},
  contactPhotoUrls: {},
  familyPreviewUrl: "",
  selectedChildId: null,
  view: inviteFromUrl ? "join" : "home",
  authView: inviteFromUrl ? "register" : "login",
  inviteCode: inviteFromUrl,
  inviteResult: null,
  termEditor: null,
  notice: null,
  busy: false,
  assistantOpen: false,
  assistantQuestion: "",
  assistantResponse: null,
  postPreviewUrls: [],
  hubSection: "",
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
  if (state.mealDemo && state.mealDemoToday) return state.mealDemoToday;
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

function isWeekend(value = todayIso()) {
  const [year, month, day] = String(value).split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
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
  januari: 1, jan: 1, februari: 2, feb: 2, mars: 3, mar: 3, april: 4, apr: 4, maj: 5,
  juni: 6, jun: 6, juli: 7, jul: 7, augusti: 8, aug: 8, september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const MONTH_PATTERN = Object.keys(SWEDISH_MONTHS).sort((left, right) => right.length - left.length).join("|");
const TERM_DATE_PATTERN = new RegExp([
  "\\b(\\d{4})-(\\d{2})-(\\d{2})\\b",
  `\\b(\\d{1,2})\\s*[-–—]\\s*(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`,
  `\\b(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\s*(?:[-–—]|till)\\s*(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`,
  `\\b(\\d{1,2})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?\\b`,
].join("|"), "gi");
const TERM_START_LOOKBACK_DAYS = 150;
const WEEKDAYS = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag"];
const WEEKDAY_PATTERNS = [
  /måndag(?:ar)?/i, /tisdag(?:ar)?/i, /onsdag(?:ar)?/i, /torsdag(?:ar)?/i, /fredag(?:ar)?/i,
];

function isoDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) throw new Error("Ärtan kunde inte tolka ett av datumen.");
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function shiftIsoDate(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthNumber(name) {
  const month = SWEDISH_MONTHS[String(name || "").toLowerCase()];
  if (!month) throw new Error("Ärtan kunde inte tolka ett av datumen.");
  return month;
}

function datePoint(day, month, year) {
  return { day: Number(day), month: Number(month), year: year ? Number(year) : null };
}

function termDateMentions(text) {
  return Array.from(text.matchAll(TERM_DATE_PATTERN), (match) => {
    const before = text.slice(Math.max(0, match.index - 32), match.index).toLowerCase();
    const cue = /(?:startar|börjar|startdatum)\s*(?:den\s*)?$/.test(before)
      ? "start"
      : /(?:slutar|avslutas|slutdatum)\s*(?:den\s*)?$/.test(before) ? "end" : "";
    if (match[1]) {
      return { index: match.index, end: match.index + match[0].length, cue, start: datePoint(match[3], match[2], match[1]), finish: null };
    }
    if (match[4]) {
      return { index: match.index, end: match.index + match[0].length, cue, start: datePoint(match[4], monthNumber(match[6]), match[7]), finish: datePoint(match[5], monthNumber(match[6]), match[7]) };
    }
    if (match[8]) {
      return {
        index: match.index,
        end: match.index + match[0].length,
        cue,
        start: datePoint(match[8], monthNumber(match[9]), match[10]),
        finish: datePoint(match[11], monthNumber(match[12]), match[13]),
      };
    }
    return { index: match.index, end: match.index + match[0].length, cue, start: datePoint(match[14], monthNumber(match[15]), match[16]), finish: null };
  });
}

function yearForUndatedStart(month, day, today) {
  const currentYear = Number(today.slice(0, 4));
  if (isoDate(currentYear, month, day) >= shiftIsoDate(today, -TERM_START_LOOKBACK_DAYS)) return currentYear;
  return currentYear + 1;
}

function yearOnOrAfter(month, day, startIso, endIso = "") {
  const startYear = Number(startIso.slice(0, 4));
  let year = isoDate(startYear, month, day) >= startIso ? startYear : startYear + 1;
  if (endIso) {
    const candidate = isoDate(year, month, day);
    const otherYear = year === startYear ? startYear + 1 : startYear;
    const other = isoDate(otherYear, month, day);
    if ((candidate < startIso || candidate > endIso) && other >= startIso && other <= endIso) year = otherYear;
  }
  return year;
}

function resolveDatePoint(point, today, startIso = "", endIso = "") {
  const year = point.year || (startIso ? yearOnOrAfter(point.month, point.day, startIso, endIso) : yearForUndatedStart(point.month, point.day, today));
  return isoDate(year, point.month, point.day);
}

function closureContext(text, index) {
  return /stäng/i.test(text.slice(0, index)) && !/(startar|börjar|slutar)/i.test(text.slice(0, index));
}

function selectTermMentions(mentions, text) {
  const used = new Set();
  const startCue = mentions.find((mention) => mention.cue === "start");
  const endCue = mentions.find((mention) => mention.cue === "end" && mention !== startCue);
  let startMention = startCue || null;
  let endMention = endCue || null;
  if (!startMention && !endMention) {
    const span = mentions.find((mention) => mention.finish && !closureContext(text, mention.index));
    if (span) {
      startMention = span;
      endMention = span;
    } else {
      const open = mentions.filter((mention) => !closureContext(text, mention.index));
      if (open[0]) startMention = open[0];
      if (open[1]) endMention = open[1];
    }
  } else if (startMention?.finish && !endMention) {
    endMention = startMention;
  } else if (!startMention && endMention?.finish) {
    startMention = endMention;
  }
  if (startMention) used.add(startMention);
  if (endMention) used.add(endMention);
  return {
    startMention,
    endMention,
    closures: mentions.filter((mention) => !used.has(mention)),
  };
}

function cleanClosureReason(value) {
  const cleaned = String(value || "")
    .replace(/^(?:\s*(?:för|kring|under|på|vid|den|de|och|vi|har|är)\b\s*)+/gi, "")
    .replace(/[\s,:;&-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 2) return "";
  return cleaned.charAt(0).toLocaleUpperCase("sv-SE") + cleaned.slice(1);
}

function closureIntroductions(text) {
  const pattern = new RegExp(`\\bstäng\\w*\\b(?:\\s+(?:för|kring|under|på|vid))?\\s*([^\\d.]{0,80})`, "gi");
  return Array.from(text.matchAll(pattern), (match) => ({ index: match.index, reason: cleanClosureReason(match[1]) }));
}

function introductionKey(introductions, index) {
  let key = -1;
  introductions.forEach((introduction) => {
    if (introduction.index < index) key = introduction.index;
  });
  return key;
}

function reasonBefore(introductions, index) {
  let reason = "";
  introductions.forEach((introduction) => {
    if (introduction.index < index && introduction.reason) reason = introduction.reason;
  });
  return reason;
}

function reasonAfter(text, end, limit) {
  const segment = text.slice(end, limit);
  const match = segment.match(/^\s*(?:,|&|\boch\b|\s)*för\s+(.+?)(?=\s+och\b|\s*[,.]|$)/i);
  return match ? cleanClosureReason(match[1]) : "";
}

function expandMention(mention, today, startIso, endIso) {
  const first = resolveDatePoint(mention.start, today, startIso, endIso);
  if (!mention.finish) return [first];
  const last = resolveDatePoint(mention.finish, today, first);
  if (last < first) throw new Error("Ärtan kunde inte tolka ett av datumen.");
  const days = [];
  let cursor = first;
  while (cursor <= last && days.length < 45) {
    days.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
  }
  return days;
}

function termTitle(prefix, startsOn) {
  const stripped = prefix
    .replace(/[-–—,:.\s]+$/g, "")
    .replace(/\b(?:startar|börjar|slutar|den)\b\s*$/gi, "")
    .replace(/^(?:vi\s+har\s+|vi\s+)?(?:startar|börjar|slutar)\b\s*/i, "")
    .replace(/[-–—,:.\s]+$/g, "")
    .trim();
  if (stripped.length >= 2 && !/^(?:vi|och)$/i.test(stripped)) return stripped;
  if (!startsOn) return "";
  const month = Number(startsOn.slice(5, 7));
  return `${month >= 8 ? "Hösttermin" : "Vårtermin"} ${startsOn.slice(0, 4)}`;
}

function missingTermMessage(missing) {
  const phrases = missing.map((item) => (item === "hours" ? "inga öppettider" : item === "start" ? "inget startdatum" : "inget slutdatum"));
  if (!phrases.length) return "";
  if (phrases.length === 1) return `Ärtan hittade ${phrases[0]}.`;
  return `Ärtan hittade ${phrases.slice(0, -1).join(", ")} och ${phrases.at(-1)}.`;
}

function clockRanges(text) {
  return Array.from(text.matchAll(/\b(?:kl\.?\s*)?([01]?\d|2[0-3])[.:]([0-5]\d)\s*(?:[-–—]|till)\s*(?:kl\.?\s*)?([01]?\d|2[0-3])[.:]([0-5]\d)\b/gi), (match) => ({
    start: `${match[1].padStart(2, "0")}:${match[2]}`,
    end: `${match[3].padStart(2, "0")}:${match[4]}`,
    index: match.index,
  }));
}

function parseTermText(value, today = todayIso()) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const mentions = termDateMentions(text);
  const selected = selectTermMentions(mentions, text);
  const startsOn = selected.startMention ? resolveDatePoint(selected.startMention.start, today) : "";
  const endPoint = selected.endMention ? (selected.endMention.finish && selected.endMention === selected.startMention ? selected.endMention.finish : selected.endMention.finish || selected.endMention.start) : null;
  const endsOn = endPoint ? resolveDatePoint(endPoint, today, startsOn) : "";
  const times = clockRanges(text);
  const introductions = closureIntroductions(text);
  const seen = new Set();
  const closures = [];
  const pending = selected.closures.map((mention, index) => {
    const next = selected.closures[index + 1]?.index ?? text.length;
    return { mention, after: reasonAfter(text, mention.end, next) };
  });
  let carriedReason = "";
  let carriedKey = null;
  for (let index = pending.length - 1; index >= 0; index -= 1) {
    const key = introductionKey(introductions, pending[index].mention.index);
    if (key !== carriedKey) {
      carriedReason = "";
      carriedKey = key;
    }
    if (pending[index].after) carriedReason = pending[index].after;
    else if (carriedReason && !reasonBefore(introductions, pending[index].mention.index)) pending[index].after = carriedReason;
    else carriedReason = "";
  }
  pending.forEach((item) => {
    const reason = item.after || reasonBefore(introductions, item.mention.index) || "Stängt";
    expandMention(item.mention, today, startsOn, endsOn).forEach((date) => {
      if (seen.has(date)) return;
      seen.add(date);
      closures.push({ date, reason });
    });
  });
  closures.sort((left, right) => left.date.localeCompare(right.date));
  const missing = [];
  if (!startsOn) missing.push("start");
  if (!endsOn) missing.push("end");
  if (!times.length) missing.push("hours");
  const nameIndex = selected.startMention?.index ?? selected.endMention?.index ?? text.length;
  const sentences = [missingTermMessage(missing)];
  if (startsOn && endsOn && endsOn < startsOn) sentences.push("Slutdatumet ligger före startdatumet.");
  return {
    name: termTitle(text.slice(0, nameIndex), startsOn),
    startsOn,
    endsOn,
    opensAt: times[0]?.start || "",
    closesAt: times[0]?.end || "",
    closures,
    error: sentences.filter(Boolean).join(" "),
  };
}

function weekdaysIn(value) {
  return WEEKDAY_PATTERNS.flatMap((pattern, index) => pattern.test(value) ? [index + 1] : []);
}
function weekdaySpanIn(value) {
  const match = String(value || "").match(/(måndag(?:ar)?|tisdag(?:ar)?|onsdag(?:ar)?|torsdag(?:ar)?|fredag(?:ar)?)\s*(?:-|till)\s*(måndag(?:ar)?|tisdag(?:ar)?|onsdag(?:ar)?|torsdag(?:ar)?|fredag(?:ar)?)/i);
  if (!match) return [];
  const first = weekdaysIn(match[1])[0];
  const last = weekdaysIn(match[2])[0];
  if (!first || !last || first > last) return [];
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
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
  const span = weekdaySpanIn(text);
  if (span.length && ranges[0]) {
    span.forEach((weekday) => Object.assign(rows[weekday - 1], { attending: true, dropoff_at: ranges[0].start, pickup_at: ranges[0].end }));
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
function schedulePersonAssignments(value, guardians = [], contacts = []) {
  const text = String(value || "").toLocaleLowerCase("sv-SE").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const candidates = [
    ...guardians.map((person) => ({ token: `guardian:${person.id}`, name: person.name || "" })),
    ...contacts.map((person) => ({ token: `contact:${person.id}`, name: person.name || "", relation: person.relation || "" })),
  ].map((person) => {
    const fullName = person.name.toLocaleLowerCase("sv-SE").trim();
    const firstName = fullName.split(/\s+/)[0] || "";
    const relationName = `${person.relation || ""} ${fullName}`.toLocaleLowerCase("sv-SE").trim();
    const aliases = [...new Set([relationName, fullName, firstName].filter((alias) => alias.length >= 2))];
    const positions = aliases.flatMap((alias) => {
      const padded = ` ${text} `;
      const needle = ` ${alias} `;
      const found = [];
      let index = padded.indexOf(needle);
      while (index >= 0) {
        found.push(index);
        index = padded.indexOf(needle, index + needle.length);
      }
      return found;
    });
    return { token: person.token, positions };
  }).filter((person) => person.positions.length);

  function nearest(verb) {
    const verbIndex = text.indexOf(verb);
    if (verbIndex < 0 || !candidates.length) return "";
    if (candidates.length === 1) return candidates[0].token;
    const ranked = candidates.map((person) => ({
      token: person.token,
      distance: Math.min(...person.positions.map((position) => Math.abs(position - verbIndex))),
    })).sort((left, right) => left.distance - right.distance);
    if (ranked[0].distance > 50 || ranked[0].distance === ranked[1].distance) return "";
    return ranked[0].token;
  }

  return {
    dropoffToken: nearest("lämnar"),
    pickupToken: nearest("hämtar"),
  };
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

function plannedAbsenceStatus(childId, iso) {
  const attendance = attendanceFor(childId);
  if (!["absent_sick", "absent_leave"].includes(attendance?.status)) return "";
  const startsOn = attendance.date || todayIso();
  const endsOn = attendance.absence_ends_on || startsOn;
  return iso >= startsOn && iso <= endsOn ? attendance.status : "";
}
const CHILD_BOX_ITEMS = [
  ["diapers", "Blöjor"],
  ["spare_clothes", "Extrakläder"],
  ["rain_clothes", "Regnkläder"],
  ["socks", "Strumpor"],
];
const CHILD_BOX_LEVELS = [["none", "Slut"], ["few", "Få"], ["many", "Finns"]];

function childBoxFor(childId) {
  return state.childBoxItems.filter((item) => item.child_id === childId);
}

function childBoxNeedsRefill(childId) {
  return childBoxFor(childId).filter((item) => item.level === "none" || item.level === "few");
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
  const preschoolAttendance = featureEnabled(child, "attendance") && !isSchoolChild(child);
  if (preschoolAttendance && !isWeekend() && !attendance) {
    reminders.push({ text: "Fyll i dagens plan med lämning och hämtning.", view: "home", target: "daily-plan" });
  } else if (preschoolAttendance && !isWeekend() && attendance.status === "in" && !attendance.pickup_at) {
    reminders.push({ text: "Komplettera dagens plan med hämtningstid.", view: "home", target: "daily-plan" });
  }
  if (featureEnabled(child, "child_box")) {
    const boxNeedsRefill = childBoxNeedsRefill(child.id);
    if (boxNeedsRefill.length) {
      const labels = new Map(CHILD_BOX_ITEMS);
      reminders.unshift({
        text: `${boxNeedsRefill.map((item) => labels.get(item.item_type)).filter(Boolean).join(" och ")} behöver fyllas på i barnets låda.`,
        view: "child",
        target: "child-box",
      });
    }
  }
  childInfoChecklist(child)
    .filter((item) => !item.complete)
    .forEach((item) => reminders.push({ text: item.reminder, view: "child", target: item.id }));
  if ((state.incidentCopies || []).some((copy) => copy.child_name === child.name && !copy.acknowledged_at)) {
    reminders.unshift({ text: "Bekräfta att du har läst informationen från förskolan.", view: "child", target: "incident-copies" });
  }
  const now = Date.now();
  const eventReminders = featureEnabled(child, "events") ? (state.schoolEvents || []).filter((event) => {
    if (event.child_id !== child.id) return false;
    const start = new Date(event.starts_at).getTime();
    const end = new Date(event.ends_at).getTime();
    return now >= start - (7 * 24 * 60 * 60 * 1000) && now <= end;
  }) : [];
  const seenEvents = new Set();
  eventReminders.forEach((event) => {
    if (seenEvents.has(event.event_id)) return;
    seenEvents.add(event.event_id);
    const text = event.rsvp_enabled && !event.response
      ? `Svara Ja eller Nej för ${event.title}.`
      : `${event.title} börjar ${formatTimestamp(event.starts_at)}.`;
    reminders.unshift({ text, view: "events", target: "" });
  });
  if (!isSchoolChild(child) && featureEnabled(child, "schedule") && featureEnabled(child, "pickup") && state.pickupWeekReady && typeof ArtanPickup !== "undefined" && ArtanPickup.buildTermGrid(pickupGridInput(child)).unfilled) {
    reminders.unshift({ text: "Fyll i lämning och hämtning för den närmaste veckan.", view: "pickup", target: "pickup-current-week" });
  }
  return reminders.slice(0, 3);
}

// Card hubs. One registerHubCard call is one section.
// Barnet: Grunduppgifter, Hälsa, Kontaktpersoner, Samtycken, Syskon,
// Profilbild, Klasslista (samtycke), Kalender, and Information att läsa when a
// guardian copy is waiting. Klasslista stays its own nav view.
// Personer/Barn includes Incidentrapporter for staff and administrators.
// The Terminer card wraps renderTermManager, including the term-manager toggle.
// Närvaro keeps the pickup scan. No extra card for that toggle or the scan.
const hubCards = { child: [], schools: [], people: [], messages: [] };
const HUB_SLUG = { child: "barnet", schools: "skolor", people: "personer", messages: "meddelanden" };
const VIEW_BY_HUB_SLUG = { barnet: "child", skolor: "schools", personer: "people", meddelanden: "messages" };
const HUB_SECTION_BY_TARGET = {
  "child-basics": "uppgifter",
  "child-health": "halsa",
  "child-contacts": "kontakter",
  "child-consents": "samtycken",
  "child-box": "ladan",
  "incident-copies": "information",
  "child-portfolio": "portfolio",
  "child-schoolwork": "skola",
  "official-feed": "anslagstavla",
  "private-messaging": "meddelanden",
  "birthday-invitations": "inbjudningar",
  playdates: "lekträffar",
};

function registerHubCard(hub, card) {
  if (!hubCards[hub]) hubCards[hub] = [];
  hubCards[hub].push(card);
  return card;
}

function allowedViewsForRole(role) {
  return ArtanMeals.allowedViews(role);
}

function defaultViewForRole(role) {
  return allowedViewsForRole(role)[0];
}

function cardsForHub(hub) {
  const registered = (hubCards[hub] || []).filter((card) => !card.visible || card.visible());
  if (hub !== "people") return registered;
  return registered.concat(peopleDetailCards());
}

function hubGridCards(hub) {
  return cardsForHub(hub).filter((card) => !card.detail);
}

function readHubHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (!raw) return null;
  const slash = raw.indexOf("/");
  const slug = slash === -1 ? raw : raw.slice(0, slash);
  const section = slash === -1 ? "" : raw.slice(slash + 1);
  const view = VIEW_BY_HUB_SLUG[slug];
  if (!view) return null;
  return { view, section };
}

function hubUrl(view, section = "") {
  const slug = HUB_SLUG[view] || "";
  const hash = slug ? (section ? `#${slug}/${section}` : `#${slug}`) : "";
  return `${location.pathname}${location.search}${hash}`;
}

function openHubCard(hub) {
  if (!state.hubSection) return null;
  const card = cardsForHub(hub).find((item) => item.id === state.hubSection);
  if (card) return card;
  state.hubSection = "";
  if (HUB_SLUG[state.view]) history.replaceState({ hub: true, view: state.view, section: "" }, "", hubUrl(state.view));
  return null;
}

function hubClosedBanner(hub) {
  if (hub === "schools") return `${renderSchoolCodeResult()}${renderInviteResult("staff")}`;
  if (hub === "people") return renderInviteResult("parent");
  if (hub === "child") {
    return state.calendarToken ? renderTermCalendarCard() : "";
  }
  return "";
}

function renderHubGrid(cards, gridClass = "") {
  return `<div class="hub-icon-grid ${esc(gridClass)}" role="group" aria-label="Funktioner">${cards.map((card) => {
    const status = typeof card.status === "function" ? card.status() : (card.status || "");
    return `<button type="button" class="hub-icon-tile" data-action="hub-open" data-section="${esc(card.id)}"><span class="menu-icon-badge">${navIcon(card.icon || "more")}</span><span class="hub-card-title">${esc(card.title)}</span>${status ? `<span class="hub-card-status">${esc(status)}</span>` : ""}</button>`;
  }).join("")}</div>`;
}

function renderHubView({ hub, before = "", heroHtml = "", gridClass = "" }) {
  const open = openHubCard(hub);
  if (open) {
    return `${noticeHtml()}${before}<section class="hub-panel"><button class="hub-back" type="button" data-action="hub-back">‹ Tillbaka</button><h1 class="h1">${esc(open.title)}</h1>${open.render()}</section>`;
  }
  return `${noticeHtml()}${before}${heroHtml}${hubClosedBanner(hub)}${renderHubGrid(hubGridCards(hub), gridClass)}`;
}

function showView(view, { section = "", scrollTarget = "", push = true } = {}) {
  stopPickupScanner();
  state.scan = null;
  state.checkout = null;
  state.view = view;
  state.hubSection = section;
  state.notice = null;
  state.assistantOpen = false;
  state.assistantQuestion = "";
  state.assistantResponse = null;
  const url = hubUrl(view, section);
  const payload = { hub: Boolean(HUB_SLUG[view]), view, section };
  const same = `${location.pathname}${location.search}${location.hash}` === url && history.state?.view === view && (history.state?.section || "") === section;
  if (!same) {
    if (push) history.pushState(payload, "", url);
    else history.replaceState(payload, "", url);
  }
  render();
  if (scrollTarget) {
    const destination = document.getElementById(scrollTarget);
    const behavior = scrollTarget === "pickup-current-week" ? "auto" : "smooth";
    if (destination) {
      if (destination instanceof HTMLDetailsElement) destination.open = true;
      destination.scrollIntoView({ behavior, block: "start" });
    }
    else scrollTo({ top: 0, behavior });
    return;
  }
  scrollTo({ top: 0, behavior: "smooth" });
}

function closeHub() {
  if (history.state?.hub && history.state.section && history.length > 1) {
    history.back();
    return;
  }
  showView(state.view, { section: "" });
}

function restoreHubFromHash() {
  if (!state.profile || state.profile.removed_at) return;
  const parsed = readHubHash();
  if (!parsed) return;
  const allowed = allowedViewsForRole(state.profile.role);
  if (!allowed.includes(parsed.view)) return;
  const known = !parsed.section || cardsForHub(parsed.view).some((card) => card.id === parsed.section);
  state.view = parsed.view;
  state.hubSection = parsed.section && known ? parsed.section : "";
  if (parsed.section && !known) history.replaceState({ hub: true, view: parsed.view, section: "" }, "", hubUrl(parsed.view));
}

function applyInitialHub() {
  if (!state.profile || state.profile.removed_at) return;
  const allowed = allowedViewsForRole(state.profile.role);
  const parsed = readHubHash();
  if (parsed && allowed.includes(parsed.view)) {
    state.view = parsed.view;
    const known = !parsed.section || cardsForHub(parsed.view).some((card) => card.id === parsed.section);
    state.hubSection = parsed.section && known ? parsed.section : "";
  } else if (parsed) {
    state.hubSection = "";
    history.replaceState({ hub: false, view: state.view, section: "" }, "", `${location.pathname}${location.search}`);
    return;
  }
  if (state.hubSection && HUB_SLUG[state.view]) {
    history.replaceState({ hub: true, view: state.view, section: "" }, "", hubUrl(state.view));
    history.pushState({ hub: true, view: state.view, section: state.hubSection }, "", hubUrl(state.view, state.hubSection));
    return;
  }
  if (HUB_SLUG[state.view]) {
    history.replaceState({ hub: true, view: state.view, section: "" }, "", hubUrl(state.view, state.hubSection));
  }
}

function syncHubFromHistory() {
  if (!state.profile || state.profile.removed_at) return;
  const allowed = allowedViewsForRole(state.profile.role);
  const parsed = readHubHash();
  if (parsed && allowed.includes(parsed.view)) {
    state.view = parsed.view;
    state.hubSection = parsed.section || "";
  } else if (history.state?.view && allowed.includes(history.state.view)) {
    state.view = history.state.view;
    state.hubSection = history.state.section || "";
  } else if (!location.hash) {
    state.hubSection = "";
    if (!allowed.includes(state.view) || HUB_SLUG[state.view]) state.view = defaultViewForRole(state.profile.role);
  }
  render();
  if (state.view === "pickup") scrollPickupWeekIntoView();
  else scrollTo({ top: 0 });
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

function storageSignedUrl(signedPath) {
  if (!signedPath) return "";
  if (/^https?:\/\//i.test(signedPath)) return signedPath;
  const base = String(config.url || "").replace(/\/$/, "");
  const rel = signedPath.startsWith("/") ? signedPath : `/${signedPath}`;
  return rel.startsWith("/storage/v1/") ? `${base}${rel}` : `${base}/storage/v1${rel}`;
}

const sharedFiles = new Map();
const sharedFileTasks = new Map();
let sharedFileGeneration = 0;

function clearSharedFiles() {
  sharedFileGeneration += 1;
  sharedFiles.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
  sharedFiles.clear();
  sharedFileTasks.clear();
}

function shareSupport() {
  return {
    hasShare: typeof navigator.share === "function",
    canShare(data) {
      try {
        return typeof navigator.canShare === "function" && navigator.canShare(data);
      } catch {
        return false;
      }
    },
  };
}

/* navigator.share has to run in the tap itself on iOS Safari. Callers prefetch
   files first and this function never waits before invoking share. */
function sharePrepared(payload) {
  const plan = ArtanShare.chooseSharePlan(payload, shareSupport());
  if (plan.mode === "share") {
    const pending = navigator.share(plan.data);
    plan.downloads.forEach(downloadSharedFile);
    Promise.resolve(pending).catch((error) => {
      if (error?.name === "AbortError") return;
      if (plan.downloads.length) return;
      deliverShareFallback({ title: payload.title, text: payload.text, downloads: payload.files || [] });
    });
    return;
  }
  deliverShareFallback(plan);
}

function deliverShareFallback(plan) {
  (plan.downloads || []).forEach(downloadSharedFile);
  const text = plan.text || "";
  const finish = (message) => {
    state.notice = { type: "success", text: message };
    render();
  };
  if (!text && !(plan.downloads || []).length) {
    finish("Det finns inget att dela.");
    return;
  }
  if (text && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      finish(plan.downloads?.length ? "Filen är nedladdad och texten är kopierad." : "Texten är kopierad.");
    }).catch(() => {
      downloadSharedFile(new File([text], ArtanShare.safeFileName(plan.title || "text", "txt"), { type: "text/plain" }));
      finish("Filen är nedladdad.");
    });
    return;
  }
  if (text) downloadSharedFile(new File([text], ArtanShare.safeFileName(plan.title || "text", "txt"), { type: "text/plain" }));
  finish("Filen är nedladdad.");
}

function downloadSharedFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || "fil";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function sharePending(kind) {
  state.notice = {
    type: "success",
    text: kind === "print" ? "Filen förbereds. Tryck på Skriv ut igen." : "Filen förbereds. Tryck på Dela igen.",
  };
  render();
}

function prefetchShareFile(key, url, filename) {
  if (!key || !url || sharedFiles.has(key) || sharedFileTasks.has(key)) return;
  const generation = sharedFileGeneration;
  const task = fetch(url, { credentials: "omit", cache: "force-cache", referrerPolicy: "no-referrer" })
    .then((response) => {
      if (!response.ok) throw new Error("Filen kunde inte hämtas.");
      return response.blob();
    })
    .then((blob) => {
      if (generation !== sharedFileGeneration) return;
      const type = blob.type || "application/octet-stream";
      const named = ArtanShare.fileNameForType(filename, type);
      const file = new File([blob], named, { type });
      sharedFiles.set(key, { file, objectUrl: URL.createObjectURL(file), type });
    })
    .catch(() => { /* A later tap starts a new attempt. */ })
    .finally(() => sharedFileTasks.delete(key));
  sharedFileTasks.set(key, task);
}

function prefetchGuardianAttachments() {
  if (state.profile?.role !== "parent") return;
  const live = new Set(state.postImages.map((image) => image.image_id));
  sharedFiles.forEach((entry, key) => {
    if (live.has(key)) return;
    URL.revokeObjectURL(entry.objectUrl);
    sharedFiles.delete(key);
  });
  state.postImages.forEach((image) => {
    if (!image.image_id || !image.signed_url) return;
    prefetchShareFile(image.image_id, image.signed_url, ArtanShare.safeFileName(image.alt_text || "bild", "jpg"));
  });
}

function cachedShareFile(key) {
  return sharedFiles.get(key) || null;
}

function openPrint(html) {
  const root = document.getElementById("printRoot");
  if (!root) return;
  root.innerHTML = html;
  document.body.dataset.printing = "1";
  window.print();
}

window.addEventListener("afterprint", () => {
  delete document.body.dataset.printing;
  const root = document.getElementById("printRoot");
  if (root) root.innerHTML = "";
});

async function signPostImages(images) {
  if (!images.length) return [];
  const signed = await request("/storage/v1/object/sign/post-images", {
    method: "POST",
    body: JSON.stringify({ expiresIn: 3600, paths: images.map((image) => image.storage_path) }),
  });
  const urls = new Map((signed || []).map((item) => [item.path, item.signedURL || item.signedUrl]));
  return images.map((image) => ({ ...image, signed_url: storageSignedUrl(urls.get(image.storage_path)) }));
}

async function signStoragePaths(bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  const signed = await request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn: 3600, paths: unique }),
  });
  return Object.fromEntries((signed || []).map((item) => [
    item.path,
    storageSignedUrl(item.signedURL || item.signedUrl),
  ]));
}

async function uploadStorageImage(bucket, path, blob) {
  return request(`/storage/v1/object/${encodeURIComponent(bucket)}/${encodedStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "x-upsert": "false" },
    body: blob,
  });
}

async function deleteStorageImage(bucket, path) {
  if (!path) return;
  await request(`/storage/v1/object/${encodeURIComponent(bucket)}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] }),
  });
}

const CHILD_DOCUMENT_TYPES = Object.freeze({
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
});

function validateChildDocument(file) {
  if (!file) return null;
  const extension = CHILD_DOCUMENT_TYPES[file.type];
  if (!extension) throw new Error("Bilagan måste vara PDF, JPEG, PNG eller DOCX.");
  if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error("Bilagan får vara högst 10 MB.");
  return { extension, mime: file.type };
}

async function uploadChildDocument(childId, kind, file, { assignmentId = null, relatedDate = null } = {}) {
  const meta = validateChildDocument(file);
  if (!meta) return null;
  const documentId = crypto.randomUUID();
  const path = `${childId}/${kind}/${documentId}.${meta.extension}`;
  await request(`/storage/v1/object/child-documents/${encodedStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": meta.mime, "x-upsert": "false" },
    body: file,
  });
  try {
    await rpc("save_child_document", {
      target_document_id: documentId,
      target_child_id: childId,
      target_document_kind: kind,
      target_assignment_id: assignmentId,
      target_related_date: relatedDate,
      object_path: path,
      original_name: file.name,
    });
  } catch (error) {
    try { await deleteStorageImage("child-documents", path); } catch { /* Metadata failed; cleanup can be retried. */ }
    throw error;
  }
  return documentId;
}

function renderChildDocuments(childId, kind, emptyText) {
  const documents = documentsForChild(childId, kind);
  if (!documents.length) return `<p class="form-hint">${esc(emptyText)}</p>`;
  return `<ul class="document-list">${documents.map((document) => {
    const url = state.childDocumentUrls[document.storage_path];
    const link = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(document.display_name)}</a>`
      : `<span>${esc(document.display_name)}</span>`;
    return `<li><div>${navIcon("document")}<span>${link}<small>${esc(formatTimestamp(document.created_at))}</small></span></div>${document.can_delete ? `<button class="link danger-link" type="button" data-action="delete-child-document" data-id="${esc(document.document_id)}" data-path="${esc(document.storage_path)}">Ta bort</button>` : ""}</li>`;
  }).join("")}</ul>`;
}

function renderFamilyImagePreview(input) {
  const preview = input.closest("form")?.querySelector("[data-family-image-preview]");
  if (!preview) return;
  if (state.familyPreviewUrl) URL.revokeObjectURL(state.familyPreviewUrl);
  const file = input.files?.[0];
  state.familyPreviewUrl = file ? URL.createObjectURL(file) : "";
  preview.innerHTML = state.familyPreviewUrl
    ? `<img src="${esc(state.familyPreviewUrl)}" alt="Förhandsvisning av vald bild">`
    : "";
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
    clearSharedFiles();
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
      childBoxItems: [],
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
      organizationPeople: [],
      onboarding: null,
      schoolCodeResult: null,
      inviteResult: null,
      inviteCode: "",
      migrationReady: true,
      childBoxReady: true,
      attendanceNotesReady: true,
      multiDayAbsenceReady: true,
      familyFeaturesReady: true,
      schoolExperienceReady: true,
      portfolioItems: [],
      portfolioUrls: {},
      lostFoundPosts: [],
      lostFoundUrls: {},
      schoolBanners: [],
      schoolEvents: [],
      schoolProgress: [],
      schoolAssignments: [],
      schoolExperienceSchools: [],
      schoolTimetable: [],
      afterSchoolSchedules: [],
      childDocuments: [],
      childDocumentUrls: {},
      childTeachers: [],
      schoolNotices: [],
      calendarReady: true,
      calendarFeed: null,
      calendarToken: null,
      termManagersReady: true,
      termPermissions: [],
      termManagers: [],
      classListReady: true,
      classListConsents: [],
      classList: [],
      mealsReady: true,
      mealBundles: {},
      mealWeekStart: "",
      mealPreschoolId: "",
      mealImport: null,
      mealHorizon: null,
      mealTermFixture: false,
      childPhotoUrls: {},
      contactPhotoUrls: {},
      familyPreviewUrl: "",
      termEditor: null,
      pickupReady: true,
      pickupContacts: [],
      pickupPasses: [],
      permanentPasses: [],
      permanentPassesReady: true,
      pickupNotices: [],
      createdPass: null,
      openedPass: null,
      pickupCalendars: {},
      pickupWeekReady: true,
      departmentPickup: [],
      pickupEditor: null,
      checkout: null,
      scan: null,
      publicPass: null,
      selectedChildId: null,
      view: "home",
      notice: null,
      assistantOpen: false,
      assistantQuestion: "",
      assistantResponse: null,
      hubSection: "",
    });
    if (location.hash) history.replaceState({ hub: false, view: "home", section: "" }, "", `${location.pathname}${location.search}`);
  }
}

async function loadData() {
  await refreshSessionIfNeeded();
  if (!state.session?.access_token) return;
  const userId = state.session.user?.id;
  if (!userId) throw new Error("Sessionen saknar användar-id.");
  state.migrationReady = true;
  state.classListReady = true;
  state.childBoxReady = true;
  state.attendanceNotesReady = true;
  state.familyFeaturesReady = true;
  state.multiDayAbsenceReady = true;
  state.schoolExperienceReady = true;
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
  state.termManagersReady = true;
  const [organizations, schools, departments, staffAssignments, children, health, contacts, consents, attendance, childBoxItems, schoolTerms, termClosures, weeklySchedules, posts, postImages, invitations, postComments, communityMembers, guardianMessageTargets, privateMessages, playdateRequests, birthdayCandidates, birthdayInvitations, siblingRequests, joinRequests, staffMembers, termPermissions, termManagers, organizationPeople] = await Promise.all([
    request(`/rest/v1/organizations?select=id,name,type,created_at&id=eq.${organizationId}&limit=1`),
    request(`/rest/v1/preschools?select=id,organization_id,name,phone,address,postal_code,city,opening_hours,created_at&organization_id=eq.${organizationId}&order=name.asc`),
    request("/rest/v1/departments?select=id,preschool_id,name,created_at&order=name.asc"),
    request("/rest/v1/staff_departments?select=staff_id,department_id"),
    loadChildren(),
    request("/rest/v1/child_health?select=child_id,allergies,diet,conditions,medication,emergency,updated_at"),
    request("/rest/v1/child_contacts?select=id,child_id,name,relation,phone,can_pickup,is_primary,created_at&order=name.asc"),
    request("/rest/v1/consents?select=child_id,type,allowed,updated_at"),
    loadAttendance(date),
    optionalChildBoxRpc("list_child_box_items"),
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
    state.profile.role === "admin" || state.profile.role === "staff" ? optionalTermRpc("my_term_permissions") : Promise.resolve([]),
    state.profile.role === "admin" ? optionalTermRpc("list_term_managers") : Promise.resolve([]),
    state.profile.role === "admin" ? loadOrganizationPeople(organizationId) : Promise.resolve([]),
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
  state.childBoxItems = childBoxItems || [];
  state.schoolTerms = schoolTerms || [];
  state.termClosures = termClosures || [];
  state.weeklySchedules = weeklySchedules || [];
  state.termPermissions = termPermissions || [];
  state.termManagers = termManagers || [];
  if (state.profile.role !== "admin") {
    const managedSchoolIds = new Set(state.termPermissions.map((permission) => permission.preschool_id));
    const visibleIds = new Set(state.schoolTerms.filter((term) => term.term_status === "published" || managedSchoolIds.has(term.preschool_id)).map((term) => term.term_id));
    state.schoolTerms = state.schoolTerms.filter((term) => visibleIds.has(term.term_id));
    state.termClosures = state.termClosures.filter((closure) => visibleIds.has(closure.term_id));
    state.weeklySchedules = state.weeklySchedules.filter((schedule) => visibleIds.has(schedule.term_id));
    if (!state.termEditor || !managedSchoolIds.has(state.termEditor.preschoolId)) state.termEditor = null;
  }
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
  state.organizationPeople = organizationPeople || [];
  state.pickupReady = true;
  state.incidentReady = true;
  await incidentRpc("remind_incident_copies");
  const notices = state.incidentReady ? await incidentRpc("list_notices") : null;
  const [pickupContacts, pickupPasses] = await Promise.all([
    pickupRpc("list_pickup_contacts"),
    state.profile.role === "staff" ? Promise.resolve([]) : pickupRpc("list_pickup_passes"),
  ]);
  state.pickupContacts = pickupContacts || [];
  state.pickupPasses = pickupPasses || [];
  state.contactPhotoUrls = await signContactPhotos(state.pickupContacts.map((contact) => contact.photo_path));
  state.notices = state.incidentReady && notices ? notices : ((await pickupRpc("list_pickup_notices")) || []);
  state.pickupNotices = state.notices.filter((notice) => !notice.kind || notice.kind === "pickup");
  if (state.incidentReady && state.profile.role === "parent") {
    state.incidentCopies = (await incidentRpc("list_my_incident_copies")) || [];
    state.incidents = [];
  } else if (state.incidentReady) {
    state.incidents = (await incidentRpc("list_incidents")) || [];
    state.incidentCopies = [];
  } else {
    state.incidents = [];
    state.incidentCopies = [];
  }
  state.permanentPassesReady = true;
  if (state.pickupReady && state.profile.role !== "staff") {
    try {
      state.permanentPasses = (await rpc("list_permanent_pickup_passes") || []).map((pass) => ({
        ...pass,
        children: Array.isArray(pass.children) ? pass.children : [],
      }));
    } catch (error) {
      state.permanentPasses = [];
      if (/schema cache|could not find the function|pgrst202/i.test(error.message)) state.permanentPassesReady = false;
      else throw error;
    }
  } else {
    state.permanentPasses = [];
  }
  state.pickupCalendars = {};
  state.pickupWeekReady = true;
  state.departmentPickup = [];
  if (state.profile.role === "parent" && state.children.length) {
    const calendars = await Promise.all(state.children.map(async (child) => {
      try {
        return [child.id, await rpc("list_pickup_calendar", { target_child_id: child.id })];
      } catch (error) {
        if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
          state.pickupWeekReady = false;
          return [child.id, null];
        }
        throw error;
      }
    }));
    calendars.forEach(([id, calendar]) => {
      if (calendar) state.pickupCalendars[id] = calendar;
    });
  } else if (state.profile.role === "staff" || state.profile.role === "admin") {
    try {
      state.departmentPickup = (await rpc("list_department_pickup_plans")) || [];
    } catch (error) {
      if (!/schema cache|could not find the function|pgrst202/i.test(error.message)) throw error;
      state.departmentPickup = [];
    }
  }
  if (state.pickupReady) {
    try { await rpc("purge_expired_pickup_details"); } catch { /* Cleanup can wait for the next signed-in visit. */ }
  }
  if (state.profile.role === "parent") await loadCalendarFeed();
  else {
    state.calendarReady = true;
    state.calendarFeed = null;
    state.calendarToken = null;
  }
  state.classListConsents = [];
  state.classList = [];
  if (state.profile.role === "parent" && state.classListReady) {
    const [classListConsents, classList] = await Promise.all([
      optionalClassListRpc("my_class_list_consents"),
      optionalClassListRpc("list_class_list"),
    ]);
    state.classListConsents = state.classListReady ? (classListConsents || []) : [];
    state.classList = state.classListReady ? (classList || []) : [];
  }
  const family = await optionalFamilyRpc("list_family_features");
  state.portfolioItems = Array.isArray(family?.portfolio) ? family.portfolio : [];
  state.lostFoundPosts = Array.isArray(family?.lost_found) ? family.lost_found : [];
  state.schoolBanners = Array.isArray(family?.banners) ? family.banners : [];
  state.schoolEvents = Array.isArray(family?.events) ? family.events : [];
  state.schoolProgress = Array.isArray(family?.progress) ? family.progress : [];
  state.schoolAssignments = Array.isArray(family?.assignments) ? family.assignments : [];
  const schoolExperience = await optionalSchoolExperienceRpc("list_school_experience");
  state.schoolExperienceSchools = Array.isArray(schoolExperience?.schools) ? schoolExperience.schools : [];
  state.schoolTimetable = Array.isArray(schoolExperience?.timetable) ? schoolExperience.timetable : [];
  state.afterSchoolSchedules = Array.isArray(schoolExperience?.after_school) ? schoolExperience.after_school : [];
  state.childDocuments = Array.isArray(schoolExperience?.documents) ? schoolExperience.documents : [];
  state.childTeachers = Array.isArray(schoolExperience?.teachers) ? schoolExperience.teachers : [];
  state.schoolNotices = Array.isArray(schoolExperience?.notices) ? schoolExperience.notices : [];
  [state.portfolioUrls, state.lostFoundUrls, state.childDocumentUrls] = await Promise.all([
    signStoragePaths("portfolio-images", state.portfolioItems.map((item) => item.storage_path)),
    signStoragePaths("lost-found-images", state.lostFoundPosts.map((item) => item.storage_path)),
    signStoragePaths("child-documents", state.childDocuments.map((item) => item.storage_path)),
  ]);
  state.childPhotoUrls = await signChildPhotos([
    ...state.children.map((child) => child.photo_path),
    ...state.classList.map((child) => child.photo_path),
  ]);
  state.onboarding = { kind: "active" };
  if (!state.children.some((child) => child.id === state.selectedChildId)) state.selectedChildId = state.children[0]?.id || null;
  await loadMeals();
  const roleViews = allowedViewsForRole(state.profile.role);
  if (!roleViews.includes(state.view)) state.view = defaultViewForRole(state.profile.role);
  restoreHubFromHash();
}

function clearLoadedData() {
  clearSharedFiles();
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
    childBoxItems: [],
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
    organizationPeople: [],
    pickupContacts: [],
    pickupPasses: [],
    permanentPasses: [],
    permanentPassesReady: true,
    childBoxReady: true,
    attendanceNotesReady: true,
    familyFeaturesReady: true,
    schoolExperienceReady: true,
    portfolioItems: [],
    portfolioUrls: {},
    lostFoundPosts: [],
    lostFoundUrls: {},
    schoolBanners: [],
    schoolEvents: [],
    schoolProgress: [],
    schoolAssignments: [],
    schoolExperienceSchools: [],
    schoolTimetable: [],
    afterSchoolSchedules: [],
    childDocuments: [],
    childDocumentUrls: {},
    childTeachers: [],
    schoolNotices: [],
    pickupNotices: [],
    notices: [],
    incidents: [],
    incidentCopies: [],
    incidentScreen: "list",
    incidentId: null,
    incidentDetail: null,
    createdPass: null,
    openedPass: null,
    pickupCalendars: {},
    pickupWeekReady: true,
    departmentPickup: [],
    pickupEditor: null,
    checkout: null,
    scan: null,
    calendarFeed: null,
    calendarToken: null,
    calendarReady: true,
    termPermissions: [],
    termManagers: [],
    termManagersReady: true,
    classListReady: true,
    classListConsents: [],
    classList: [],
    mealsReady: true,
    mealBundles: {},
    mealWeekStart: "",
    mealPreschoolId: "",
    mealImport: null,
    mealHorizon: null,
    mealTermFixture: false,
    childPhotoUrls: {},
    contactPhotoUrls: {},
    familyPreviewUrl: "",
    selectedChildId: null,
    hubSection: "",
  });
}

async function loadCalendarFeed() {
  try {
    const rows = await rpc("calendar_feed_status");
    const row = Array.isArray(rows) ? rows[0] : rows;
    state.calendarReady = true;
    state.calendarFeed = row && typeof row === "object" ? row : { active: false, created_at: null };
    if (!state.calendarFeed.active) state.calendarToken = null;
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.calendarReady = false;
      state.calendarFeed = null;
      state.calendarToken = null;
      return;
    }
    throw error;
  }
}

function termFeedBaseUrl() {
  const base = String(config.url || "").replace(/\/$/, "");
  return base ? `${base}/functions/v1/term-feed` : "";
}

function termFeedHttpsUrl(token) {
  return `${termFeedBaseUrl()}?token=${encodeURIComponent(token)}`;
}

function termFeedWebcalUrl(token) {
  return termFeedHttpsUrl(token).replace(/^https:/i, "webcal:");
}

function missingTermRpc(error) {
  return /schema cache|could not find the function|pgrst202/i.test(error.message);
}

function optionalTermRpc(name) {
  return rpc(name).catch((error) => {
    if (missingTermRpc(error)) {
      state.termManagersReady = false;
      return [];
    }
    throw error;
  });
}

function canManageSchoolTerms(preschoolId) {
  if (state.profile?.role === "admin") return true;
  return state.termPermissions.some((permission) => permission.preschool_id === preschoolId);
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

async function pickupRpc(name, args) {
  try {
    return await rpc(name, args);
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.pickupReady = false;
      return [];
    }
    throw error;
  }
}

async function incidentRpc(name, args) {
  try {
    return await rpc(name, args);
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.incidentReady = false;
      return null;
    }
    throw error;
  }
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

async function loadAttendance(date) {
  const base = "id,child_id,date,status,dropoff_at,pickup_at,pickup_by,checked_in_at,checked_out_at,updated_at";
  try {
    return await request(`/rest/v1/attendance?select=${base},absence_note,absence_ends_on&date=eq.${date}`);
  } catch (error) {
    if (/absence_ends_on|column|schema cache/i.test(error.message)) {
      state.multiDayAbsenceReady = false;
      try {
        return await request(`/rest/v1/attendance?select=${base},absence_note&date=eq.${date}`);
      } catch (noteError) {
        if (!/absence_note|column|schema cache/i.test(noteError.message)) throw noteError;
        state.attendanceNotesReady = false;
        return request(`/rest/v1/attendance?select=${base}&date=eq.${date}`);
      }
    }
    if (!/absence_note|column|schema cache/i.test(error.message)) throw error;
    state.attendanceNotesReady = false;
    return request(`/rest/v1/attendance?select=${base}&date=eq.${date}`);
  }
}

function optionalChildBoxRpc(name, args) {
  return rpc(name, args).catch((error) => {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.childBoxReady = false;
      return [];
    }
    throw error;
  });
}

async function optionalFamilyRpc(name, args) {
  try {
    return await rpc(name, args);
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.familyFeaturesReady = false;
      return null;
    }
    throw error;
  }
}

async function optionalSchoolExperienceRpc(name, args) {
  try {
    return await rpc(name, args);
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.schoolExperienceReady = false;
      return null;
    }
    throw error;
  }
}

function optionalClassListRpc(name, args) {
  return rpc(name, args).catch((error) => {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.classListReady = false;
      return [];
    }
    throw error;
  });
}

async function loadOrganizationPeople(organizationId) {
  const filtered = `/rest/v1/profiles?organization_id=eq.${organizationId}&order=name.asc`;
  try {
    return await request(`${filtered}&select=id,name,email,role,removed_at`);
  } catch (error) {
    if (!/removed_at|schema cache|column/i.test(error.message)) throw error;
    return request(`${filtered}&select=id,name,email,role`);
  }
}

async function loadChildren() {
  const withPhoto = "id,department_id,name,birth_date,notes,avatar_color,photo_path,photo_updated_at,created_at";
  const withoutPhoto = "id,department_id,name,birth_date,notes,avatar_color,created_at";
  try {
    return await request(`/rest/v1/children?select=${withPhoto}&order=name.asc`);
  } catch (error) {
    if (!/photo_path|photo_updated_at|schema cache/i.test(error.message)) throw error;
    state.classListReady = false;
    return request(`/rest/v1/children?select=${withoutPhoto}&order=name.asc`);
  }
}

function pickupFeatureMissing(error) {
  return /schema cache|could not find the function|pgrst202/i.test(error?.message || "");
}

async function signContactPhotos(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  try {
    const signed = await request("/storage/v1/object/sign/contact-photos", {
      method: "POST",
      body: JSON.stringify({ expiresIn: 3600, paths: unique }),
    });
    const urls = {};
    (signed || []).forEach((item) => {
      const signedPath = item.signedURL || item.signedUrl;
      if (!item.path || !signedPath) return;
      urls[item.path] = storageSignedUrl(signedPath);
    });
    return urls;
  } catch {
    return {};
  }
}

async function signChildPhotos(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return {};
  try {
    const signed = await request("/storage/v1/object/sign/child-photos", {
      method: "POST",
      body: JSON.stringify({ expiresIn: 3600, paths: unique }),
    });
    const urls = {};
    (signed || []).forEach((item) => {
      const signedPath = item.signedURL || item.signedUrl;
      if (!item.path || !signedPath) return;
      urls[item.path] = storageSignedUrl(signedPath);
    });
    return urls;
  } catch {
    return {};
  }
}

function botMascot(decorative = false) {
  const accessibility = decorative ? 'aria-hidden="true"' : 'role="img" aria-label="Ärtan, din digitala hjälpreda"';
  return `<span class="bot-mascot" ${accessibility}></span>`;
}

function assistantQuickActions() {
  const parentActions = {
    home: [["schedule", "Ändra lämning/hämtning"], ["day", "Vad är dagens plan?"], ["reminders", "Vad behöver jag göra?"], ["messages", "Nytt från skolan?"]],
    child: [["schedule", "Ändra lämning/hämtning"], ["reminders", "Vad saknas?"], ["consents", "Hur ser samtyckena ut?"], ["contact", "Kontakta förskolan"]],
    classlist: [["reminders", "Vad saknas?"], ["consents", "Hur ser samtyckena ut?"], ["messages", "Nytt från skolan?"], ["schedule", "Ändra lämning/hämtning"]],
    messages: [["birthdays", "Kalasinbjudningar"], ["schedule", "Ändra lämning/hämtning"], ["messages", "Sammanfatta skolans flöde"], ["playdates", "Hur fungerar lekträffar?"]],
    account: [["schedule", "Ändra lämning/hämtning"], ["privacy", "Mina integritetsval"], ["contact", "Vem kan jag kontakta?"], ["reminders", "Vad behöver jag göra?"]],
  };
  const staffActions = {
    attendance: [["attendance", "Sammanfatta närvaron"], ["calendar", "Publicerad termin"], ["publish", "Skriv till föräldrar"], ["people", "Öppna barn och inbjudningar"]],
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
    if (isWeekend()) {
      return assistantResult(
        `Det är helg idag. ${child.name} behöver ingen incheckning eller dagsplan.`,
        "Dagens datum i ärtan",
      );
    }
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
    if (!latest) return assistantResult("Skolan har inte publicerat något ännu.", "Meddelanden", { actionLabel: "Öppna Meddelanden", view: "messages" });
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
  const isAdmin = state.profile.role === "admin";
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
      { actionLabel: "Öppna Meddelanden", view: "messages", target: "official-feed" },
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
    const publishedTerms = state.schoolTerms.filter((term) => term.term_status === "published");
    if (!isAdmin) {
      if (!publishedTerms.length) {
        return assistantResult(
          "Ingen publicerad termin är synlig för dig ännu.",
          "Publicerade terminer",
          { actionLabel: "Öppna Närvaro", view: "attendance", target: "term-overview" },
        );
      }
      const summary = publishedTerms.map((term) => {
        const closures = closuresForTerm(term.term_id);
        const closureText = closures.length
          ? ` Stängt: ${closures.map((closure) => `${formatDate(closure.closure_date)} (${closure.reason})`).join(", ")}.`
          : " Inga stängningsdagar.";
        return `${term.term_name}: ${termDateSummary(term)}.${closureText}`;
      }).join("\n");
      return assistantResult(summary, "Publicerade terminer", { actionLabel: "Visa publicerad termin", view: "attendance", target: "term-overview" });
    }
    const drafts = state.schoolTerms.filter((term) => term.term_status === "draft").length;
    return assistantResult(
      `${publishedTerms.length} publicerade terminer och ${drafts} utkast är synliga för dig.`,
      "Terminer och veckoscheman",
      { actionLabel: "Planera terminer", view: "schools" },
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
  const { type = "text", required = false, placeholder = "", autocomplete = "", min = "", max = "", minlength = "", maxlength = "", inputmode = "", pattern = "" } = options;
  return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${required ? "required" : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""} ${autocomplete ? `autocomplete="${esc(autocomplete)}"` : ""} ${min ? `min="${esc(min)}"` : ""} ${max ? `max="${esc(max)}"` : ""} ${minlength ? `minlength="${esc(minlength)}"` : ""} ${maxlength ? `maxlength="${esc(maxlength)}"` : ""} ${inputmode ? `inputmode="${esc(inputmode)}"` : ""} ${pattern ? `pattern="${esc(pattern)}"` : ""}></label>`;
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
    <section class="auth-intro"><p class="hi">${APP_NAME}</p><h1 class="h1">${registerMode ? "Skapa konto" : "Välkommen"}</h1><p class="sub">${registerMode ? registerIntro : "Logga in. Ärtan påminner om det som saknas, och uppgifterna stannar här."}</p></section>
    ${disabled ? `<article class="card important"><h3>Konfiguration saknas</h3><p>Aktivera Supabase i <code>supabase-config.js</code>.</p></article>` : ""}
    <form class="card form-stack" data-form="${registerMode ? "register" : "login"}">
      ${registerMode ? field("Namn", "name", "", { required: true, autocomplete: "name" }) : ""}
      ${field("E-post", "email", "", { type: "email", required: true, autocomplete: "email" })}
      ${field("Lösenord", "password", "", { type: "password", required: true, autocomplete: registerMode ? "new-password" : "current-password", minlength: "8" })}
      ${state.inviteCode ? `<p class="form-hint">Inbjudningslänken följer med när kontot skapas. Använd e-postadressen som inbjudan gäller.</p>` : ""}
      <button class="primary" type="submit" ${disabled ? "disabled" : ""}>${registerMode ? "Skapa konto" : "Logga in"}</button>
      <button class="link" type="button" data-action="auth-view" data-view="${registerMode ? "login" : "register"}">${registerMode ? "Jag har redan konto" : "Skapa nytt konto"}</button>
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
  if (state.children.length < 2) return "";
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

const SCHOOL_FEATURE_DEFAULTS = Object.freeze({
  attendance: true,
  important: true,
  events: true,
  meals: true,
  assignments: true,
  schedule: true,
  pickup: true,
  documents: true,
  teachers: true,
  portfolio: true,
  classlist: true,
  child_box: true,
});

const SCHOOL_FEATURE_LABELS = Object.freeze({
  attendance: "Sjukanmälan",
  important: "Viktig information",
  events: "Händelser",
  meals: "Matsedel",
  assignments: "Uppgifter och utveckling",
  schedule: "Schema",
  pickup: "Hämtpersoner och hämtpass",
  documents: "Intyg och bilagor",
  teachers: "Lärare",
  portfolio: "Portfolio",
  classlist: "Klasslista",
  child_box: "Barnets låda",
});

function schoolExperienceFor(preschoolId) {
  const saved = state.schoolExperienceSchools.find((school) => school.preschool_id === preschoolId);
  return {
    education_stage: saved?.education_stage || "preschool",
    feature_config: { ...SCHOOL_FEATURE_DEFAULTS, ...(saved?.feature_config || {}) },
  };
}

function childSchoolExperience(child) {
  return schoolExperienceFor(childSchoolId(child));
}

function isSchoolChild(child) {
  return Boolean(child) && childSchoolExperience(child).education_stage === "school";
}

function featureEnabled(child, feature) {
  if (!child || !state.schoolExperienceReady) return SCHOOL_FEATURE_DEFAULTS[feature] !== false;
  return childSchoolExperience(child).feature_config[feature] !== false;
}

function documentsForChild(childId, kind = "") {
  return state.childDocuments.filter((document) => document.child_id === childId && (!kind || document.document_kind === kind));
}

function teachersForChild(childId, kind = "") {
  return state.childTeachers.filter((teacher) => teacher.child_id === childId && (!kind || teacher.teacher_kind === kind));
}

function timetableForDepartment(departmentId, weekday = null) {
  return state.schoolTimetable
    .filter((entry) => entry.department_id === departmentId && (weekday === null || Number(entry.weekday) === Number(weekday)))
    .sort((left, right) => Number(left.weekday) - Number(right.weekday) || left.starts_at.localeCompare(right.starts_at));
}

function afterSchoolForChild(childId) {
  return state.afterSchoolSchedules.filter((row) => row.child_id === childId);
}

function closuresForTerm(termId) {
  return state.termClosures.filter((closure) => closure.term_id === termId);
}

function schedulesForTermChild(termId, childId) {
  return state.weeklySchedules.filter((schedule) => schedule.term_id === termId && schedule.child_id === childId);
}

function termDateSummary(term) {
  return `${formatDate(term.starts_on)}–${formatDate(term.ends_on)} · vardagar ${String(term.opens_at).slice(0, 5)}–${String(term.closes_at).slice(0, 5)}`;
}

function clockMinutes(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function timesFitTerm(term, dropoff, pickup) {
  const dropoffMinutes = clockMinutes(dropoff);
  const pickupMinutes = clockMinutes(pickup);
  const opens = clockMinutes(term?.opens_at);
  const closes = clockMinutes(term?.closes_at);
  return dropoffMinutes !== null && pickupMinutes !== null && opens !== null && closes !== null && dropoffMinutes >= opens && pickupMinutes <= closes && dropoffMinutes < pickupMinutes;
}

function scheduleRowFitsTerm(term, row) {
  if (!row?.attending) return true;
  if (typeof row.within_opening_hours === "boolean") return row.within_opening_hours;
  return timesFitTerm(term, row.dropoff_at, row.pickup_at);
}

function scheduleConflictLabel(term, row) {
  const weekday = WEEKDAYS[Number(row.weekday) - 1] || "Dag";
  const opens = String(term.opens_at || "").slice(0, 5);
  const closes = String(term.closes_at || "").slice(0, 5);
  const dropoff = String(row.dropoff_at || "").slice(0, 5);
  const pickup = String(row.pickup_at || "").slice(0, 5);
  if (clockMinutes(dropoff) !== null && clockMinutes(dropoff) < clockMinutes(opens)) return `${weekday}: lämning ${dropoff} är före öppning ${opens}`;
  if (clockMinutes(pickup) !== null && clockMinutes(pickup) > clockMinutes(closes)) return `${weekday}: hämtning ${pickup} är efter stängning ${closes}`;
  return `${weekday}: tiderna ryms inte inom ${opens}–${closes}`;
}

function termScheduleConflicts(term) {
  return state.weeklySchedules
    .filter((row) => row.term_id === term.term_id && !scheduleRowFitsTerm(term, row))
    .flatMap((row) => {
      const child = state.children.find((item) => item.id === row.child_id);
      return child ? [{ child, row }] : [];
    })
    .sort((left, right) => left.child.name.localeCompare(right.child.name, "sv") || Number(left.row.weekday) - Number(right.row.weekday));
}

function renderTermClosures(termId) {
  const closures = closuresForTerm(termId);
  return closures.length
    ? `<ul class="term-closures">${closures.map((closure) => `<li><strong>${esc(formatDate(closure.closure_date))}</strong><span>${esc(closure.reason)}</span></li>`).join("")}</ul>`
    : `<p class="form-hint">Inga stängningsdagar den här terminen.</p>`;
}

function renderWeeklyScheduleForm(term, child) {
  const saved = schedulesForTermChild(term.term_id, child.id);
  const conflicts = saved.filter((row) => !scheduleRowFitsTerm(term, row));
  const rows = WEEKDAYS.map((label, index) => {
    const weekday = index + 1;
    const row = saved.find((item) => Number(item.weekday) === weekday);
    const attending = Boolean(row?.attending);
    const outside = Boolean(row && !scheduleRowFitsTerm(term, row));
    return `<div class="weekly-schedule-row${outside ? " schedule-outside-hours" : ""}" data-weekday="${weekday}" ${outside ? 'data-schedule-conflict="true"' : ""}>
      <label class="check"><input type="checkbox" name="attending_${weekday}" data-schedule-attending ${attending ? "checked" : ""}> ${esc(label)}</label>
      <label>Lämning<input type="time" name="dropoff_${weekday}" value="${esc(row?.dropoff_at?.slice(0, 5) || "")}" ${attending ? "" : "disabled"}></label>
      <label>Hämtning<input type="time" name="pickup_${weekday}" value="${esc(row?.pickup_at?.slice(0, 5) || "")}" ${attending ? "" : "disabled"}></label>
      ${outside ? `<p class="form-hint error-text">Ryms inte inom ${esc(String(term.opens_at).slice(0, 5))}–${esc(String(term.closes_at).slice(0, 5))}.</p>` : ""}
    </div>`;
  }).join("");
  const warning = conflicts.length
    ? `<p class="notice error" role="status">Ditt sparade schema ryms inte i de uppdaterade öppettiderna. Tiderna finns kvar men är markerade. Justera dem och spara igen.</p>`
    : "";
  return `<form class="card form-stack term-schedule-card" data-form="weekly-schedule" data-term-id="${esc(term.term_id)}" data-child-id="${esc(child.id)}">
    <p class="kicker">Återkommande veckoschema</p><h3>${esc(child.name)}</h3>
    ${warning}
    <div class="assistant-form">
      <label>Berätta för Ärtan<textarea name="schedule_text" placeholder="08.00–16.30 alla dagar utom torsdagar, då 08.00–15.00"></textarea></label>
      <button class="secondary" type="button" data-action="parse-weekly-schedule">Tolka och fyll i</button>
      <p class="form-hint" data-parse-status aria-live="polite">Ärtan fyller bara i formuläret. Granska tiderna och välj Spara.</p>
    </div>
    <fieldset class="weekly-schedule"><legend>Måndag till fredag</legend>${rows}</fieldset>
    <button class="primary" type="submit">Spara veckoschema</button>
  </form>`;
}

function renderShareActions(kind, id, label) {
  if (state.profile?.role !== "parent") return "";
  const name = esc(label || "innehållet");
  return `<div class="share-actions"><button class="secondary" type="button" data-action="share-${kind}" data-id="${esc(id)}" aria-label="Dela ${name}">Dela</button><button class="secondary" type="button" data-action="print-${kind}" data-id="${esc(id)}" aria-label="Skriv ut ${name}">Skriv ut</button></div>`;
}

function termShareModel(termId) {
  const term = state.schoolTerms.find((item) => item.term_id === termId && item.term_status === "published");
  if (!term || state.profile?.role !== "parent") return null;
  const child = selectedChild();
  const department = child && childSchoolId(child) === term.preschool_id
    ? state.departments.find((item) => item.id === child.department_id)
    : null;
  const school = state.schools.find((item) => item.id === term.preschool_id);
  return {
    organizationName: state.organization?.name || "",
    schoolName: school?.name || "",
    departmentName: department?.name || "",
    termId: term.term_id,
    termName: term.term_name,
    startsOn: term.starts_on,
    endsOn: term.ends_on,
    opensAt: String(term.opens_at || "").slice(0, 5),
    closesAt: String(term.closes_at || "").slice(0, 5),
    closures: closuresForTerm(term.term_id).map((closure) => ({ date: closure.closure_date, reason: closure.reason })),
  };
}

function renderParentTermSchedules(child) {
  const preschoolId = childSchoolId(child);
  const terms = state.schoolTerms.filter((term) => term.preschool_id === preschoolId && term.term_status === "published");
  if (!terms.length) return `<section><div class="section-head"><div><p class="kicker">Termin</p><h2>Öppettider och schema</h2></div></div>${emptyState("Ingen publicerad termin", "När förskolan publicerar terminen visas öppettider, stängningsdagar och veckoschema här.")}</section>`;
  const grid = typeof ArtanPickup === "undefined" ? "" : ArtanPickup.renderTermGrid(pickupGridInput(child), { currentWeekOnly: true });
  const cards = terms.map((term) => `<article class="card term-card" data-term-id="${esc(term.term_id)}"><p class="kicker">Publicerad</p><h3>${esc(term.term_name)}</h3><p>${esc(termDateSummary(term))}</p>${renderShareActions("term", term.term_id, term.term_name)}<p class="form-hint">Dela skickar terminen och stängningsdagarna. Barnets schema och kalenderlänken följer inte med.</p></article>`).join("");
  const edit = state.pickupWeekReady
    ? `<button class="primary" type="button" data-action="navigate" data-view="pickup">Visa hela schemat</button>`
    : terms.map((term) => renderWeeklyScheduleForm(term, child)).join("");
  return `<section id="term-overview" class="term-overview"><div class="section-head"><div><p class="kicker">Termin</p><h2>Öppettider och schema</h2></div></div>${cards}${grid ? `<article class="card term-card">${grid}<p class="form-hint">Den aktuella veckan visas här och dagens datum är markerat. Öppna hela schemat för resten av terminen.</p></article>` : ""}${edit}</section>`;
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


const PICKUP_STOPS = {
  unavailable: "Hämtpasset kan inte användas.",
  revoked: "Hämtpasset är återkallat.",
  used: "Hämtpasset är redan använt.",
  blocked: "Personen får ej hämta.",
  wrong_day: "Hämtpasset gäller inte idag.",
  not_yet: "Hämtpasset har inte börjat gälla.",
  expired: "Hämtpasset har gått ut.",
  not_checked_in: "Barnet är inte incheckat.",
  ambiguous: "Koden är inte entydig. Skanna QR-koden i stället.",
  removed: "Personen finns inte längre på hämtlistan.",
};

let scanGeneration = 0;
let scanStream = null;

function addDaysIso(iso, days) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function pickupShortCode(token) {
  const hex = String(token || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) return "";
  return String(BigInt(`0x${hex.slice(0, 12)}`) % 1000000n).padStart(6, "0");
}

function passLink(token) {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("pass", token);
  return url.toString();
}

function showPickupPlace() {
  if (state.view === "pickup") return;
  state.view = "pickup";
  history.pushState({ hub: false, view: "pickup", section: "" }, "", `${location.pathname}${location.search}`);
}

async function keepPassToken(passId, kind, token) {
  if (!passId || !token) return;
  try {
    await rpc("remember_pickup_pass_token", {
      target_pass_id: passId,
      pass_kind: kind,
      presented_token: token,
    });
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) return;
    throw new Error(`${error.message} Passet visas nu, men kan inte öppnas igen senare.`);
  }
}

function presentedPickupSecret(raw) {
  const text = String(raw || "").trim();
  try {
    const url = new URL(text, location.origin);
    const pass = url.searchParams.get("pass");
    if (pass && /^[0-9a-f]{64}$/i.test(pass)) return pass.toLowerCase();
  } catch { /* Plain tokens are handled below. */ }
  const match = text.match(/[?&]pass=([0-9a-f]{64})/i);
  if (match) return match[1].toLowerCase();
  if (/^[0-9a-f]{64}$/i.test(text)) return text.toLowerCase();
  if (/^\d{6}$/.test(text)) return text;
  throw new Error("Koden kunde inte läsas. Skanna QR-koden eller skriv de sex siffrorna.");
}

function passStatusLabel(status) {
  return { active: "Gäller", scheduled: "Inte börjat", used: "Använt", revoked: "Återkallat", expired: "Utgånget" }[status] || status;
}

function permanentPassStatusLabel(status) {
  return { active: "Gäller", revoked: "Återkallat", expired: "Utgånget", blocked: "Får ej hämta", removed: "Borttagen från hämtlistan" }[status] || status;
}

function permanentContactKey(name, relation) {
  const normalize = (value) => String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("sv-SE");
  return `${normalize(name)}|${normalize(relation)}`;
}

function permanentLinkedContacts(contacts, childNameById, contactId) {
  const source = (contacts || []).find((contact) => contact.contact_id === contactId && !contact.blocked);
  if (!source) return [];
  const key = permanentContactKey(source.name, source.relation);
  return (contacts || [])
    .filter((contact) => contact.contact_id !== source.contact_id && !contact.blocked && childNameById.has(contact.child_id) && permanentContactKey(contact.name, contact.relation) === key)
    .map((contact) => ({ contactId: contact.contact_id, childId: contact.child_id, childName: childNameById.get(contact.child_id) }))
    .sort((left, right) => String(left.childName).localeCompare(String(right.childName), "sv"));
}

function permanentValidityLabel(endsOn) {
  if (!endsOn) return "Gäller tills vidare";
  return `Gäller till och med ${formatDate(endsOn)}`;
}

function publishedTermsForChild(child) {
  const schoolId = child ? childSchoolId(child) : null;
  if (!schoolId) return [];
  return state.schoolTerms
    .filter((term) => term.term_status === "published" && term.preschool_id === schoolId && term.starts_on && term.ends_on)
    .map((term) => ({ starts_on: term.starts_on, ends_on: term.ends_on }));
}

function defaultPermanentEnd(child) {
  if (typeof ArtanPickup === "undefined" || !ArtanPickup.defaultPassEnd) return "";
  return ArtanPickup.defaultPassEnd(todayIso(), publishedTermsForChild(child)) || "";
}

function renewalPersonName(pass) {
  const name = String(pass?.contact_name || "").trim();
  if (!name || name === "Borttagen person" || name === "Personuppgiften är borta") return "";
  return name;
}

function passRenewalText(pass) {
  const name = typeof ArtanPickup === "undefined" ? "Personens" : ArtanPickup.swedishGenitive(renewalPersonName(pass));
  return `${name} hämtpass gäller till ${formatDate(pass.ends_on)}. Förläng till nästa termin?`;
}

function renderPassRenewalCards(child) {
  if (!state.permanentPassesReady || state.profile.role !== "parent" || typeof ArtanPickup === "undefined" || !child) return "";
  const today = todayIso();
  return state.permanentPasses.filter((pass) => {
    const mine = (pass.children || []).some((item) => item.child_id === child.id);
    return mine && pass.pass_status === "active" && ArtanPickup.passRenewalDue(today, pass.ends_on, pass.renewal_dismissed);
  }).map((pass) => `<section class="card pass-renewal" data-pass-renewal="${esc(pass.pass_id)}"><p class="kicker">Hämtpass</p><h2>${esc(passRenewalText(pass))}</h2><div class="stack-actions"><button class="primary" type="button" data-action="extend-permanent-pass" data-id="${esc(pass.pass_id)}">Förläng</button><button class="secondary" type="button" data-action="dismiss-pass-renewal" data-id="${esc(pass.pass_id)}">Låt gå ut</button></div></section>`).join("");
}

function permanentPassesForChild(childId) {
  return state.permanentPasses.filter((pass) => (pass.children || []).some((item) => item.child_id === childId));
}

function renderPermanentLinkedField(contactId) {
  const names = new Map(state.children.map((child) => [child.id, child.name]));
  const linked = permanentLinkedContacts(state.pickupContacts, names, contactId);
  if (!linked.length) return "";
  return `<label class="check" data-permanent-linked><input type="checkbox" name="include_linked"> Gäller också ${esc(linked.map((item) => item.childName).join(", "))}</label>`;
}

function stopPickupScanner() {
  scanGeneration += 1;
  if (scanStream) {
    scanStream.getTracks().forEach((track) => track.stop());
    scanStream = null;
  }
}

function paintPassQr() {
  document.querySelectorAll("[data-pass-qr]").forEach((slot) => {
    const payload = slot.getAttribute("data-pass-qr");
    if (!payload || typeof qrcode !== "function") return;
    const qr = qrcode(0, "M");
    qr.addData(passLink(payload));
    qr.make();
    slot.innerHTML = qr.createSvgTag(4, 2);
  });
}

async function loadPublicPass() {
  state.publicPass = { loading: true };
  try {
    state.publicPass = await request("/rest/v1/rpc/get_pass_by_token", {
      method: "POST",
      body: JSON.stringify({ pass_token: passFromUrl }),
    }, Boolean(state.session?.access_token));
  } catch (error) {
    state.publicPass = { ok: false, error: error.message };
  }
}

function renderPublicPass() {
  const pass = state.publicPass;
  if (!pass || pass.loading) {
    return `<section class="pass-sheet"><p class="kicker">Hämtpass</p><h1>Visa för personalen</h1><p>Hämtpasset öppnas.</p></section>`;
  }
  if (!pass.ok) {
    return `<section class="pass-sheet"><article class="card stop-card"><h2>Stopp</h2><p>${esc(pass.error || "Hämtpasset kan inte användas.")}</p></article></section>`;
  }
  if (pass.permanent) {
    const several = / och |,/.test(String(pass.first_name || ""));
    const privacy = several
      ? "Passet visar bara barnens förnamn. Visa det för personalen och dela inte länken."
      : "Passet visar bara barnets förnamn. Visa det för personalen och dela inte länken.";
    return `<section class="pass-sheet"><p class="kicker">Permanent hämtpass</p><h1>Visa för personalen</h1><p class="pass-child">${esc(pass.first_name || "")}</p><p>${esc(permanentValidityLabel(pass.ends_on))}</p><div class="pass-qr" data-pass-qr="${esc(pass.qr_payload)}" role="img" aria-label="QR-kod för hämtpasset"></div><p class="pass-code">${esc(pickupShortCode(pass.qr_payload))}</p><p class="pass-privacy">${privacy}</p></section>`;
  }
  return `<section class="pass-sheet"><p class="kicker">Hämtpass</p><h1>Visa för personalen</h1><p class="pass-child">${esc(pass.first_name || "")}</p><p>${esc(formatDate(pass.pickup_date))}</p><div class="pass-qr" data-pass-qr="${esc(pass.qr_payload)}" role="img" aria-label="QR-kod för hämtpasset"></div><p class="pass-code">${esc(pickupShortCode(pass.qr_payload))}</p><p class="pass-privacy">Passet visar bara barnets förnamn. Visa det för personalen och dela inte länken.</p></section>`;
}

function childFirstName(child) {
  return String(child?.name || "").trim().split(/\s+/)[0] || "";
}

function pickupGridInput(child) {
  const preschoolId = child ? childSchoolId(child) : null;
  const terms = state.schoolTerms
    .filter((term) => term.preschool_id === preschoolId && term.term_status === "published")
    .map((term) => ({
      starts_on: term.starts_on,
      ends_on: term.ends_on,
      closures: closuresForTerm(term.term_id).map((closure) => closure.closure_date),
      closureReasons: Object.fromEntries(closuresForTerm(term.term_id).map((closure) => [closure.closure_date, closure.reason])),
      standard: schedulesForTermChild(term.term_id, child.id),
    }));
  const calendar = state.pickupCalendars[child?.id] || {};
  return {
    today: todayIso(),
    terms,
    dayPlans: calendar.day_plans || [],
    standardPickers: calendar.standard_pickers || [],
    markUnfilled: state.pickupWeekReady !== false,
    viewerId: state.profile?.id || "",
  };
}

function renderPickupWeekNudge(child) {
  if (!child || !state.pickupWeekReady || typeof ArtanPickup === "undefined") return "";
  if (!ArtanPickup.buildTermGrid(pickupGridInput(child)).unfilled) return "";
  return `<p class="nudge-line">Nästa vecka är inte ifylld. Bara sparade dagar räknas. <button class="link" type="button" data-action="navigate" data-view="pickup">Öppna schemat</button></p>`;
}

function pickerToken(picker) {
  if (!picker) return "";
  const kind = picker.kind || picker.picker_kind;
  const id = picker.id || picker.picker_id;
  const passKind = picker.passKind || picker.pass_kind || "";
  if (!kind || !id) return "";
  if (kind === "pass") return `pass:${passKind || "permanent"}:${id}`;
  return `${kind}:${id}`;
}

function parsePickerToken(value) {
  const [kind, first, second] = String(value || "").split(":");
  if ((kind === "guardian" || kind === "contact") && first) return { picker_kind: kind, picker_id: first, pass_kind: null };
  if (kind === "pass" && (first === "day" || first === "permanent") && second) return { picker_kind: "pass", picker_id: second, pass_kind: first };
  return null;
}

function pickerSelect(name, calendar, date, selected, required = true, label = "Vem hämtar?", allowPasses = true) {
  const groups = [
    ["Vårdnadshavare", (calendar.guardians || []).map((person) => [`guardian:${person.id}`, person.name])],
    ["Hämtlista", (calendar.contacts || []).map((person) => [`contact:${person.id}`, `${person.relation} ${person.name}`])],
  ];
  if (allowPasses && date) {
    const passes = (calendar.day_passes || []).filter((pass) => pass.pickup_date === date).map((pass) => [`pass:day:${pass.id}`, pass.label]);
    if (passes.length) groups.push(["Hämtpass", passes]);
  }
  if (allowPasses) {
    const permanent = (calendar.permanent_passes || []).map((pass) => [`pass:permanent:${pass.id}`, `${pass.label} · permanent`]);
    if (permanent.length) groups.push(["Permanent pass", permanent]);
  }
  const options = groups.filter(([, items]) => items.length).map(([groupLabel, items]) => `<optgroup label="${esc(groupLabel)}">${items.map(([value, text]) => `<option value="${esc(value)}" ${value === selected ? "selected" : ""}>${esc(text)}</option>`).join("")}</optgroup>`).join("");
  return `<label>${esc(label)}<select name="${esc(name)}" ${required ? "required" : ""}><option value="">Välj</option>${options}</select></label>`;
}

function renderGuardianPassFace(pass) {
  if (!pass?.token) return "";
  const code = pass.short_code || pickupShortCode(pass.token);
  const first = pass.first_name || pass.child_first_name || pass.child_names || "";
  const when = pass.permanent ? permanentValidityLabel(pass.ends_on) : formatDate(pass.pickup_date);
  const kicker = pass.permanent ? "Permanent hämtpass" : "Hämtpass";
  const label = `${kicker} för ${first}`.trim();
  return `<section class="pass-sheet guardian-pass"><p class="kicker">${esc(kicker)}</p><h1>Visa för personalen</h1><p class="pass-child">${esc(first)}</p><p>${esc(when)}</p><div class="pass-qr" data-pass-qr="${esc(pass.token)}" role="img" aria-label="QR-kod för hämtpasset"></div><p class="pass-code">${esc(code)}</p><p class="pass-privacy">Passet visar bara förnamn. Visa det för personalen och dela inte länken.</p><div class="share-actions pass-share no-print"><button class="primary" type="button" data-action="share-pass" data-token="${esc(pass.token)}" data-code="${esc(code)}" data-label="${esc(label)}">Dela</button><button class="secondary" type="button" data-action="print-pass">Skriv ut/Spara</button></div></section>`;
}

function renderVisiblePasses(childId) {
  const faces = [];
  if (state.createdPass?.token && state.createdPass.child_id === childId) faces.push(renderGuardianPassFace(state.createdPass));
  if (state.openedPass?.token && state.openedPass.pass_id !== state.createdPass?.pass_id && state.openedPass.child_id === childId) {
    faces.push(renderGuardianPassFace(state.openedPass));
  }
  return faces.join("");
}

function pickupPeople(child) {
  const calendar = state.pickupCalendars[child?.id] || {};
  const guardians = Array.isArray(calendar.guardians) && calendar.guardians.length
    ? calendar.guardians
    : (state.profile?.id ? [{ id: state.profile.id, name: state.profile.name || "Jag" }] : []);
  const contacts = Array.isArray(calendar.contacts)
    ? calendar.contacts
    : state.pickupContacts
      .filter((contact) => contact.child_id === child?.id && !contact.blocked)
      .map((contact) => ({ id: contact.contact_id, name: contact.name, relation: contact.relation }));
  return { guardians, contacts, calendar };
}

function pickupPersonName(child, picker) {
  if (!picker) return "";
  const { guardians, contacts, calendar } = pickupPeople(child);
  if (picker.kind === "guardian") return guardians.find((person) => person.id === picker.id)?.name || "";
  if (picker.kind === "contact") return contacts.find((person) => person.id === picker.id)?.name || "";
  if (picker.kind === "pass" && picker.passKind === "day") return (calendar.day_passes || []).find((pass) => pass.id === picker.id)?.label || "";
  if (picker.kind === "pass") return (calendar.permanent_passes || []).find((pass) => pass.id === picker.id)?.label || "";
  return "";
}

function personPresentation(child, person) {
  const name = pickupPersonName(child, person);
  return {
    name,
    initials: name
      ? ArtanPickup.personInitials(name)
      : person?.kind === "pass"
        ? "P"
        : ArtanPickup.personInitials(state.profile?.name),
    kind: person?.kind || "guardian",
  };
}

function weekEditorModel(child, editor) {
  const week = ArtanPickup.buildTermGrid(pickupGridInput(child)).weeks.find((item) => item.monday === editor.monday);
  const byIso = new Map((week?.days || []).map((day) => [day.iso, day]));
  return {
    weekNumber: ArtanPickup.isoWeekNumber(editor.monday),
    error: editor.error || "",
    note: editor.note || "",
    canCopyPrevious: ArtanPickup.hasEarlierSavedWeek(pickupGridInput(child), editor.monday),
    days: editor.days.map((day) => {
      const source = byIso.get(day.iso) || {};
      const dropoff = personPresentation(child, day.dropoffPerson);
      const pickup = personPresentation(child, day.picker);
      return {
        iso: day.iso,
        weekday: source.weekday,
        dropoff: day.dropoff,
        pickup: day.pickup,
        ledig: day.ledig,
        open: Boolean(source.open),
        closed: Boolean(source.closed),
        outside: Boolean(source.outside),
        closureReason: source.closureReason || "",
        dropoffInitials: dropoff.initials,
        dropoffKind: dropoff.kind,
        dropoffName: dropoff.name,
        pickupInitials: pickup.initials,
        pickupKind: pickup.kind,
        pickupName: pickup.name,
        today: Boolean(source.today),
        absenceStatus: plannedAbsenceStatus(child.id, day.iso),
      };
    }),
  };
}

function renderPickupWeekSheet(child) {
  const editor = state.pickupEditor;
  if (!editor || editor.mode !== "week" || typeof ArtanPickup === "undefined") return "";
  const sheet = ArtanPickup.renderWeekEditor(weekEditorModel(child, editor));
  if (!editor.personIso) return sheet;
  const day = editor.days.find((item) => item.iso === editor.personIso);
  const person = editor.personRole === "dropoff" ? day?.dropoffPerson : day?.picker;
  const { guardians, contacts } = pickupPeople(child);
  const selected = editor.draftToken || pickerToken(person);
  const people = [
    ...guardians.map((item) => ({
      token: `guardian:${item.id}`,
      name: item.name,
      initials: ArtanPickup.personInitials(item.name),
      kind: "guardian",
      selected: selected === `guardian:${item.id}`,
    })),
    ...contacts.map((item) => ({
      token: `contact:${item.id}`,
      name: item.relation ? `${item.relation} ${item.name}` : item.name,
      initials: ArtanPickup.personInitials(item.name),
      kind: "contact",
      selected: selected === `contact:${item.id}`,
    })),
  ];
  return `${sheet}${ArtanPickup.renderPickerSheet({
    role: editor.personRole,
    weekdayName: ArtanPickup.weekdayName(editor.personIso, "full"),
    people,
  })}`;
}

function openPickupWeek(monday) {
  const child = selectedChild();
  if (!child || typeof ArtanPickup === "undefined") return;
  const week = ArtanPickup.buildTermGrid(pickupGridInput(child)).weeks.find((item) => item.monday === monday);
  if (!week) return;
  const scrollY = window.scrollY;
  const viewerId = state.profile?.id || "";
  state.pickupEditor = {
    mode: "week",
    monday,
    childId: child.id,
    viewerId,
    scrollY,
    sheetScroll: 0,
    personIso: null,
    personRole: "",
    draftToken: "",
    error: "",
    note: "",
    days: ArtanPickup.weekEditorSeed(pickupGridInput(child), monday, viewerId),
  };
  state.pickupScrollRestore = scrollY;
  render();
}

function paintWeekTimes() {
  const editor = state.pickupEditor;
  if (!editor || editor.mode !== "week") return;
  for (const day of editor.days) {
    for (const field of ["dropoff", "pickup"]) {
      const input = document.querySelector(`[data-week-time="${field}"][data-date="${day.iso}"]`);
      if (!input || document.activeElement === input) continue;
      const value = day[field] || "";
      if (input.value !== value) input.value = value;
    }
    const row = document.querySelector(`[data-week-ledig][data-date="${day.iso}"]`)?.closest(".week-row");
    if (!row) continue;
    row.classList.toggle("is-ledig", Boolean(day.ledig));
    row.querySelectorAll("[data-week-time], [data-action='open-picker']").forEach((node) => {
      node.disabled = Boolean(day.ledig);
    });
  }
}

function applyWeekField(sourceIso, field, value) {
  const editor = state.pickupEditor;
  if (!editor || editor.mode !== "week" || typeof ArtanPickup === "undefined") return;
  editor.days = ArtanPickup.assignDefaultPicker(
    ArtanPickup.smartFillWeek(editor.days, sourceIso, field, value),
    editor.viewerId,
  );
  paintWeekTimes();
}

function syncWeekEditorFromDom() {
  const editor = state.pickupEditor;
  if (!editor || editor.mode !== "week") return;
  editor.sheetScroll = document.querySelector(".week-sheet-body")?.scrollTop || 0;
  document.querySelectorAll("[data-week-time]").forEach((input) => {
    const day = editor.days.find((item) => item.iso === input.dataset.date);
    if (!day) return;
    day[input.dataset.weekTime === "pickup" ? "pickup" : "dropoff"] = input.value;
  });
  document.querySelectorAll("[data-week-ledig]").forEach((input) => {
    const day = editor.days.find((item) => item.iso === input.dataset.date);
    if (day) day.ledig = input.checked;
  });
}

function scrollPickupWeekIntoView() {
  document.getElementById("pickup-current-week")?.scrollIntoView({ behavior: "auto", block: "start" });
}

function restorePickupScroll() {
  const top = state.pickupScrollRestore;
  const sheetTop = state.pickupEditor?.mode === "week" ? state.pickupEditor.sheetScroll || 0 : null;
  if (top == null && sheetTop == null) return;
  state.pickupScrollRestore = null;
  if (top != null) scrollTo({ top, behavior: "auto" });
  const body = document.querySelector(".week-sheet-body");
  if (body && sheetTop) body.scrollTop = sheetTop;
}

function renderPickupStandardEditor(child) {
  const input = pickupGridInput(child);
  const term = input.terms.find((item) => input.today >= item.starts_on && input.today <= item.ends_on) || input.terms[0];
  const calendar = state.pickupCalendars[child.id] || {};
  const rows = [1, 2, 3, 4, 5].map((weekday) => {
    const saved = (term?.standard || []).find((row) => Number(row.weekday) === weekday);
    const attending = Boolean(saved?.attending);
    const people = (calendar.standard_pickers || []).find((row) => Number(row.weekday) === weekday);
    const dropoffPerson = people ? { kind: people.dropoff_person_kind, id: people.dropoff_person_id } : null;
    return `<div class="weekly-schedule-row" data-weekday="${weekday}"><label class="check"><input type="checkbox" name="attending_${weekday}" data-schedule-attending ${attending ? "checked" : ""}> ${esc(WEEKDAYS[weekday - 1])}</label><label>Lämning<input type="time" name="dropoff_${weekday}" value="${esc(String(saved?.dropoff_at || "").slice(0, 5))}" ${attending ? "" : "disabled"}></label>${pickerSelect(`dropoff_person_${weekday}`, calendar, "", pickerToken(dropoffPerson), false, "Vem lämnar?", false)}<label>Hämtning<input type="time" name="pickup_${weekday}" value="${esc(String(saved?.pickup_at || "").slice(0, 5))}" ${attending ? "" : "disabled"}></label>${pickerSelect(`picker_${weekday}`, calendar, "", pickerToken(people), false)}</div>`;
  }).join("");
  return `<form class="week-sheet" role="dialog" aria-modal="true" aria-labelledby="standard-sheet-title" data-form="pickup-standard" data-child-id="${esc(child.id)}"><header class="week-sheet-bar"><button class="week-back" type="button" data-action="close-pickup-editor" aria-label="Tillbaka">‹</button><h1 id="standard-sheet-title">Standardvecka</h1></header><div class="week-sheet-body"><p class="form-hint">Samma tider och personer varje vecka i terminen. Lämnare och hämtare väljs var för sig.</p><div class="assistant-form"><label>Berätta för Ärtan<textarea name="schedule_text" placeholder="08.00–16.30 alla dagar utom torsdagar, då 08.00–15.00"></textarea></label><button class="secondary" type="button" data-action="parse-weekly-schedule">Tolka och fyll i</button><p class="form-hint" data-parse-status aria-live="polite">Ärtan fyller bara i tiderna. Välj vem som lämnar och hämtar, och spara.</p></div><fieldset class="weekly-schedule"><legend>Måndag till fredag</legend>${rows}</fieldset><button class="primary" type="submit">Spara</button></div></form>`;
}

function renderPickupMenu() {
  return `<div class="plan-sheet" role="dialog" aria-label="Planera"><button type="button" class="plan-sheet-backdrop" data-action="close-pickup-editor" aria-label="Stäng"></button><div class="plan-sheet-panel"><h2>Planera</h2><div class="stack-actions"><button class="primary" type="button" data-action="pickup-standard">Standardvecka</button><button class="secondary" type="button" data-action="copy-pickup-week">Kopiera den här veckan till nästa</button></div><p class="form-hint">Standardveckan fyller terminen. Kopiera lägger den här veckans tider, lämnare och hämtare på nästa vecka. Ett engångspass följer inte med.</p></div></div>`;
}

function renderPickupOverlay(child) {
  if (!state.pickupEditor) return "";
  if (state.pickupEditor.mode === "week") return renderPickupWeekSheet(child);
  if (state.pickupEditor.mode === "standard") return renderPickupStandardEditor(child);
  if (state.pickupEditor.mode === "menu") return renderPickupMenu();
  return "";
}

function renderCreatedPass(childId) {
  return renderVisiblePasses(childId);
}

function renderPermanentPassSection(child) {
  if (!state.permanentPassesReady) {
    return `<details class="compact-tool" id="permanent-passes"><summary><span>${navIcon("pass")}<strong>Permanenta hämtpass</strong></span><small>Inte aktiverat</small></summary><div class="compact-tool-body"><p class="form-hint">Permanenta hämtpass är inte aktiverade i databasen ännu.</p></div></details>`;
  }
  const passes = permanentPassesForChild(child.id);
  const allowed = state.pickupContacts.filter((contact) => contact.child_id === child.id && !contact.blocked);
  const today = todayIso();
  const rows = passes.map((pass) => {
    const live = pass.pass_status === "active";
    const due = typeof ArtanPickup !== "undefined" && ArtanPickup.passRenewalDue(today, pass.ends_on, false);
    const renew = pass.pass_status === "expired"
      ? `<button class="link" type="button" data-action="extend-permanent-pass" data-id="${esc(pass.pass_id)}">Förnya</button>`
      : live && due
        ? `<button class="link" type="button" data-action="extend-permanent-pass" data-id="${esc(pass.pass_id)}">Förläng</button>`
        : "";
    const extra = live ? "" : ` · ${permanentPassStatusLabel(pass.pass_status)}`;
    const actions = live
      ? `${renew}<button class="link" type="button" data-action="open-pass" data-id="${esc(pass.pass_id)}" data-kind="permanent">Visa pass</button><button class="link" type="button" data-action="regenerate-permanent-pass" data-id="${esc(pass.pass_id)}" data-child-id="${esc(child.id)}">Ny kod</button><button class="link danger-link" type="button" data-action="revoke-permanent-pass" data-id="${esc(pass.pass_id)}">Återkalla</button>`
      : pass.pass_status === "blocked" || pass.pass_status === "removed"
        ? `<button class="link danger-link" type="button" data-action="revoke-permanent-pass" data-id="${esc(pass.pass_id)}">Återkalla</button>`
        : renew;
    return `<li><div><strong>${esc(pass.contact_relation || "")} ${esc(pass.contact_name || "Personuppgiften är borta")}</strong><span>${esc(pass.child_names || "")} · ${esc(permanentValidityLabel(pass.ends_on))}${esc(extra)}</span></div><div class="invite-actions">${actions}</div></li>`;
  }).join("");
  const firstContact = allowed[0]?.contact_id || "";
  const form = allowed.length
    ? `<form class="form-stack" data-form="permanent-pickup-pass" data-child-id="${esc(child.id)}"><h3>Skapa permanent hämtpass</h3>${selectField("Person som får hämta", "contact_id", allowed.map((contact) => [contact.contact_id, `${contact.relation} ${contact.name}`]), firstContact, true)}${field("Slutdatum", "ends_on", defaultPermanentEnd(child), { type: "date", min: today, max: addDaysIso(today, 1825) })}<div data-permanent-linked-slot>${renderPermanentLinkedField(firstContact)}</div><p class="form-hint">Passet kan användas flera gånger. Slutdatumet är terminens sista dag. Töm fältet om passet ska gälla tills det återkallas. Datumet visas på passet. Du kan öppna QR-koden igen så länge passet gäller.</p><button class="primary" type="submit">Skapa permanent hämtpass</button></form>`
    : `<p class="form-hint">Lägg först till personen på hämtlistan. Ett permanent pass kan bara kopplas till någon som får hämta.</p>`;
  return `<details class="compact-tool" id="permanent-passes"><summary><span>${navIcon("pass")}<strong>Permanenta hämtpass</strong></span><small>${passes.length || "Inga"} aktiva</small></summary><div class="compact-tool-body"><p class="form-hint">För någon som redan får hämta, till exempel en mor- eller farförälder. Båda vårdnadshavarna kan se och återkalla passet.</p>${rows ? `<ul class="invite-list">${rows}</ul>` : `<p class="form-hint">Inget permanent hämtpass är skapat.</p>`}${form}</div></details>`;
}

function renderPickupSection(child) {
  if (!state.pickupReady || state.profile.role !== "parent" || !featureEnabled(child, "pickup")) return "";
  const contacts = state.pickupContacts.filter((contact) => contact.child_id === child.id);
  const passes = state.pickupPasses.filter((pass) => pass.child_id === child.id);
  const maxDate = addDaysIso(todayIso(), 14);
  const passRows = passes.length ? `<ul class="invite-list">${passes.map((pass) => {
    const openable = pass.pass_status === "active" || pass.pass_status === "scheduled";
    return `<li><div><strong>${esc(pass.person_relation || "")} ${esc(pass.person_name || "Personuppgiften är rensad")}</strong><span>${esc(formatDate(pass.pickup_date))} · ${esc(pass.window_start)}–${esc(pass.window_end)} · ${esc(passStatusLabel(pass.pass_status))}</span></div><div class="invite-actions">${openable ? `<button class="link" type="button" data-action="open-pass" data-id="${esc(pass.pass_id)}" data-kind="day">Visa pass</button><button class="link danger-link" type="button" data-action="revoke-pass" data-id="${esc(pass.pass_id)}">Återkalla</button>` : ""}</div></li>`;
  }).join("")}</ul>` : `<p class="form-hint">Inget hämtpass är skapat.</p>`;
  return `<section class="schedule-tools"><div class="section-head"><div><p class="kicker">Vid behov</p><h2>Hämtning och behörigheter</h2></div></div>
    ${renderCreatedPass(child.id)}
    <details class="compact-tool" id="pickup-list"><summary><span>${navIcon("people")}<strong>Hämtpersoner</strong></span><small>${contacts.length || "Inga"} sparade</small></summary><div class="compact-tool-body"><p class="form-hint">Personer som brukar hämta. Personalen ser eventuell bild vid utcheckning.</p>${contacts.length ? `<ul class="contact-list">${contacts.map((contact) => renderPickupContactItem(contact)).join("")}</ul>` : `<p class="form-hint">Ingen person är tillagd ännu.</p>`}<form class="form-stack" data-form="pickup-contact" data-child-id="${esc(child.id)}"><h3>Lägg till person</h3><div class="form-grid">${field("Namn", "name", "", { required: true, maxlength: "80" })}${field("Relation", "relation", "", { required: true, maxlength: "80", placeholder: "Till exempel mormor" })}</div>${field("Telefon, valfritt", "phone", "", { type: "tel", maxlength: "40", autocomplete: "tel" })}<button class="secondary" type="submit">Spara person</button></form></div></details>
    <details class="compact-tool" id="pickup-passes"><summary><span>${navIcon("pass")}<strong>Hämtpass för en dag</strong></span><small>${passes.length || "Inga"} sparade</small></summary><div class="compact-tool-body"><p class="form-hint">Ett engångspass gäller ett barn, en dag och ett tidsfönster.</p>${passRows}<form class="form-stack" data-form="pickup-pass" data-child-id="${esc(child.id)}"><h3>Skapa hämtpass</h3>${field("Datum", "pickup_date", todayIso(), { type: "date", required: true, min: todayIso(), max: maxDate })}<div class="form-grid">${field("Från", "window_start", "14:00", { type: "time", required: true })}${field("Till", "window_end", "17:00", { type: "time", required: true })}</div><div class="form-grid">${field("Hämtas av", "person_name", "", { required: true, maxlength: "80" })}${field("Relation", "person_relation", "", { required: true, maxlength: "80", placeholder: "Till exempel mormor" })}</div>${field("Telefon, valfritt", "person_phone", "", { type: "tel", maxlength: "40" })}<button class="secondary" type="submit">Skapa pass</button></form></div></details>
    ${renderPermanentPassSection(child)}
  </section>`;
}

function renderSchoolTimetable(child) {
  const groups = WEEKDAYS.map((label, index) => {
    const entries = timetableForDepartment(child.department_id, index + 1);
    return `<section class="school-day-column"><h3>${esc(label)}</h3>${entries.length ? `<ul>${entries.map((entry) => `<li><time>${esc(entry.starts_at)}–${esc(entry.ends_at)}</time><div><strong>${esc(entry.subject)}</strong>${entry.teacher_name || entry.room ? `<span>${esc([entry.teacher_name, entry.room].filter(Boolean).join(" · "))}</span>` : ""}</div></li>`).join("")}</ul>` : `<p>Inget publicerat.</p>`}</section>`;
  }).join("");
  return `<section class="card school-timetable"><div class="section-head"><div><p class="kicker">Bestäms av skolan</p><h2>Veckans ämnen</h2></div></div><div class="school-week-columns">${groups}</div></section>`;
}

function renderAfterSchoolSchedule(child) {
  const saved = new Map(afterSchoolForChild(child.id).map((row) => [Number(row.weekday), row]));
  const rows = WEEKDAYS.map((label, index) => {
    const weekday = index + 1;
    const row = saved.get(weekday);
    return `<div class="after-school-row" data-weekday="${weekday}"><label class="check"><input type="checkbox" name="attending_${weekday}" ${row?.attending ? "checked" : ""}> ${esc(label)}</label>${field("Till", `ends_at_${weekday}`, row?.ends_at || "16:00", { type: "time" })}${field("Notering", `note_${weekday}`, row?.note || "", { maxlength: "300", placeholder: "Valfritt" })}</div>`;
  }).join("");
  return `<details class="card compact-tool"><summary><span>${navIcon("clock")}<strong>Fritidsschema</strong></span><small>Fylls i av vårdnadshavare</small></summary><div class="compact-tool-body"><form class="form-stack" data-form="after-school-schedule" data-child-id="${esc(child.id)}"><p class="form-hint">Markera bara dagarna barnet går på fritids och ange sluttid. Skolans lektioner ovan ändras inte.</p><div class="after-school-grid">${rows}</div><button class="primary" type="submit">Spara fritidsschema</button></form></div></details>`;
}

function renderSchoolScheduleHub(child) {
  return `${noticeHtml()}${childTabs()}<h1 class="h1">Schema</h1><p class="page-sub">${esc(childFirstName(child) || child.name)} · ${esc(departmentName(child.department_id))}</p>${renderSchoolTimetable(child)}${renderAfterSchoolSchedule(child)}`;
}

function renderPickupHub() {
  if (state.profile.role !== "parent") return "";
  const child = selectedChild();
  if (!child) return `${noticeHtml()}<section class="hero-card"><p class="kicker">Schema</p><h1 class="h1">Inget barn ännu</h1></section>`;
  if (!featureEnabled(child, "schedule")) return `${noticeHtml()}${childTabs()}<h1 class="h1">Schema</h1>${emptyState("Schema används inte", "Skolan har dolt den här funktionen för verksamheten.")}`;
  if (isSchoolChild(child)) return renderSchoolScheduleHub(child);
  const calendarInput = pickupGridInput(child);
  const currentGrid = typeof ArtanPickup === "undefined" ? "" : ArtanPickup.renderTermGrid(calendarInput, { editable: state.pickupWeekReady, currentWeekOnly: true });
  const otherGrid = typeof ArtanPickup === "undefined" ? "" : ArtanPickup.renderTermGrid(calendarInput, { editable: state.pickupWeekReady, excludeCurrentWeek: true });
  const grid = `${currentGrid}${otherGrid ? `<details class="term-more"><summary>Visa övriga veckor</summary><div class="term-more-body">${otherGrid}</div></details>` : ""}`;
  const schedule = state.pickupWeekReady
    ? `${grid || `<p class="form-hint">Ingen publicerad termin att visa ännu.</p>`}<button class="term-add no-print" type="button" data-action="pickup-add" aria-label="Planera vecka">+</button>${renderPickupOverlay(child)}`
    : `<p class="form-hint">Veckoschemat är inte aktiverat i databasen ännu.</p>${grid}`;
  return `${noticeHtml()}${childTabs()}<h1 class="h1">Schema</h1><p class="page-sub">${esc(childFirstName(child) || child.name)} · ${esc(departmentName(child.department_id))}</p>
    <section class="card term-card" id="pickup-schedule"><div class="section-head"><div><p class="kicker">Lämning och hämtning</p><h2>Veckor</h2></div></div>${schedule}<p class="form-hint">Välj en vecka för att ange tider. Sparade dagar visas tydligt; övriga dagar följer standardveckan.</p></section>
    ${renderPickupSection(child)}`;
}

function renderNoticeList(kicker, title, notices) {
  if (!notices?.length) return "";
  return `<section class="card"><p class="kicker">${esc(kicker)}</p><h2>${esc(title)}</h2><ul class="bot-reminders">${notices.map((notice) => `<li>${notice.title ? `<strong>${esc(notice.title)}. </strong>` : ""}${esc(notice.body)}</li>`).join("")}</ul></section>`;
}

function renderPickupNotices() {
  return renderNoticeList("Hämtning", "Senaste hämtningar", state.pickupNotices);
}

function copiesForChild(child) {
  const copies = state.incidentCopies || [];
  if (!child) return copies;
  return copies.filter((copy) => copy.child_name === child.name);
}

function renderIncidentCopies(copies = state.incidentCopies || []) {
  if (!copies.length) return "";
  return `<section class="card" id="incident-copies"><p class="kicker">Från förskolan</p><h2>Information att läsa</h2><p class="form-hint">Texten gäller ditt barn. Andra barn nämns som ett annat barn. Bekräftelsen är att du har läst, inte en signatur.</p>${copies.map((copy) => `<article class="incident-copy"><h3>${esc(copy.child_name)}</h3><p class="pre-line">${esc(copy.body)}</p>${copy.acknowledged_at ? `<p class="form-hint">Du bekräftade ${esc(formatTimestamp(copy.acknowledged_at))}.</p>` : `<button class="primary" type="button" data-action="acknowledge-incident" data-id="${esc(copy.copy_id)}">Jag har läst</button>`}</article>`).join("")}</section>`;
}

function incidentCopyStatus() {
  if (!state.incidentReady) return "Inte aktiverad";
  const copies = copiesForChild(selectedChild());
  const unread = copies.filter((copy) => !copy.acknowledged_at).length;
  if (!copies.length) return "Inget att läsa";
  if (!unread) return "Läst";
  return unread === 1 ? "1 att läsa" : `${unread} att läsa`;
}

function renderChildIncidentCopies() {
  if (!state.incidentReady) {
    return `<section class="card" id="incident-copies"><h2>Information att läsa</h2><p class="form-hint">Avvikelserapporterna är inte aktiverade i databasen ännu.</p></section>`;
  }
  return renderIncidentCopies(copiesForChild(selectedChild())) || `<section class="card" id="incident-copies"><h2>Information att läsa</h2><p class="form-hint">Ingen information från förskolan väntar på det här barnet.</p></section>`;
}

function renderPickupBlocks() {
  if (state.profile.role !== "admin" || !state.pickupReady) return "";
  const contacts = state.pickupContacts;
  return `<section class="card" id="pickup-blocks"><h2>Får ej hämta</h2><p class="form-hint">Spärren gäller före hämtpass, hämtlista och manuell utcheckning. Vårdnadshavare kan inte ta bort den.</p>${contacts.length ? `<ul class="invite-list">${contacts.map((contact) => {
    const child = state.children.find((item) => item.id === contact.child_id);
    return `<li><div><strong>${esc(contact.name)}</strong><span>${esc(child?.name || "Barn")} · ${esc(contact.relation)}${contact.blocked ? " · får ej hämta" : ""}</span></div><button class="link${contact.blocked ? "" : " danger-link"}" type="button" data-action="toggle-pickup-block" data-id="${esc(contact.contact_id)}" data-blocked="${contact.blocked ? "true" : "false"}">${contact.blocked ? "Ta bort spärr" : "Spärra"}</button></li>`;
  }).join("")}</ul>` : `<p class="form-hint">Ingen person står på en hämtlista ännu. Du kan ändå lägga till en spärr nedan.</p>`}
    <form class="form-stack" data-form="pickup-block-create"><h3>Spärra en person</h3>${selectField("Barn", "child_id", [["", "Välj barn"], ...state.children.map((child) => [child.id, `${child.name} · ${departmentName(child.department_id)}`])], "", true)}<div class="form-grid">${field("Namn", "name", "", { required: true, maxlength: "80" })}${field("Relation", "relation", "", { required: true, maxlength: "80" })}</div>${field("Telefon, valfritt", "phone", "", { type: "tel", maxlength: "40" })}<button class="primary" type="submit" ${state.children.length ? "" : "disabled"}>Spara spärr</button></form></section>`;
}

function renderPermanentScanCard(result) {
  const children = Array.isArray(result.children) ? result.children : [];
  const ready = children.filter((child) => child.checked_in);
  const waiting = children.filter((child) => !child.checked_in);
  const buttons = ready.map((child) => `<button class="primary" type="button" data-action="confirm-permanent-pickup" data-child-id="${esc(child.child_id)}" data-child-name="${esc(child.child_name)}">Checka ut ${esc(child.child_name)}</button>`).join("");
  const waitingText = waiting.length
    ? `<p class="form-hint">${esc(waiting.map((child) => child.child_name).join(", "))} ${waiting.length === 1 ? "är inte incheckad" : "är inte incheckade"}.</p>`
    : "";
  return `<article class="card confirm-card"><div class="scan-person">${childAvatarHtml(result.pickup_name, contactPhotoUrl(result.photo_path))}<div><p class="kicker">Permanent hämtpass</p><h2>${esc(result.pickup_relation)} ${esc(result.pickup_name)}</h2></div></div><p class="id-ask">Be om legitimation</p><p class="form-hint">${esc(permanentValidityLabel(result.ends_on))}. Utfärdat av ${esc(result.issued_by || "")}.</p>${waitingText}<div class="stack-actions">${buttons}<button class="secondary" type="button" data-action="close-scan">Avbryt</button></div></article>`;
}

function renderScanCard(scan) {
  const result = scan.result || {};
  if (!result.ok) {
    const kicker = result.permanent ? `<p class="kicker">Permanent hämtpass</p>` : "";
    return `<article class="card stop-card">${kicker}<h2>Stopp</h2><p>${esc(PICKUP_STOPS[result.stop] || PICKUP_STOPS.unavailable)}</p><button class="secondary" type="button" data-action="close-scan">Stäng</button></article>`;
  }
  if (result.permanent) return renderPermanentScanCard(result);
  return `<article class="card confirm-card"><p class="kicker">Bekräfta</p><h2>${esc(result.child_name)}</h2><div class="scan-person">${childAvatarHtml(result.pickup_name, contactPhotoUrl(result.photo_path))}<div><strong>${esc(result.pickup_relation)} ${esc(result.pickup_name)}</strong></div></div><p class="form-hint">Utfärdat av ${esc(result.issued_by)} · ${esc(formatTimestamp(result.issued_at))}</p>${result.ask_for_id ? `<p class="id-ask">Be om legitimation</p>` : ""}<div class="stack-actions"><button class="primary" type="button" data-action="confirm-pickup">Bekräfta utcheckning</button><button class="secondary" type="button" data-action="close-scan">Avbryt</button></div></article>`;
}

function renderScanPanel() {
  if (!state.pickupReady) return "";
  if (state.scan?.phase === "card") return renderScanCard(state.scan);
  if (state.scan?.phase === "live") {
    return `<section class="card scan-panel"><p class="kicker">Skanna</p><h2>Visa QR-koden för kameran</h2><video id="pickup-scan-video" playsinline autoplay muted></video><p id="scan-status" class="form-hint">${esc(state.scan.error || "Kameran startar. Du kan också skriva koden.")}</p><form class="form-stack" data-form="pickup-code">${field("Sexsiffrig kod", "code", "", { required: true, inputmode: "numeric", minlength: "6", maxlength: "6", autocomplete: "one-time-code", pattern: "[0-9]{6}" })}<button class="primary" type="submit">Visa hämtpass</button></form><button class="secondary" type="button" data-action="close-scan">Avbryt</button></section>`;
  }
  return `<div class="scan-launcher"><button class="secondary" type="button" data-action="open-scan">Skanna</button></div>`;
}

function renderCheckoutPanel() {
  if (!state.checkout) return "";
  const child = state.children.find((item) => item.id === state.checkout.childId);
  const options = state.checkout.options || { guardians: [], contacts: [] };
  const guardians = options.guardians || [];
  const contacts = options.contacts || [];
  return `<form class="card form-stack checkout-panel" data-form="manual-pickup"><p class="kicker">Hämtad av</p><h2>${esc(child?.name || "Barnet")}</h2><label>Vem hämtar?<select name="picked_up_by" data-pickup-choice required><option value="">Välj</option>${guardians.length ? `<optgroup label="Vårdnadshavare">${guardians.map((person) => `<option value="guardian:${esc(person.profile_id)}">${esc(person.name)}</option>`).join("")}</optgroup>` : ""}${contacts.length ? `<optgroup label="Hämtlista">${contacts.map((person) => `<option value="list:${esc(person.contact_id)}" ${person.blocked ? "disabled" : ""}>${esc(person.name)} · ${esc(person.relation)}${person.blocked ? " · får ej hämta" : ""}</option>`).join("")}</optgroup>` : ""}<option value="other">Annan</option></select></label><div class="checkout-person" data-pickup-person hidden></div><div data-pickup-comment hidden>${textareaField("Kommentar", "comment", "", "Vem hämtar barnet?")}</div><p class="id-ask" data-pickup-id hidden>Be om legitimation</p><div class="stack-actions"><button class="primary" type="submit">Bekräfta utcheckning</button><button class="secondary" type="button" data-action="close-checkout">Avbryt</button></div></form>`;
}

function pickupChoice(value) {
  const options = state.checkout?.options || { guardians: [], contacts: [] };
  if (String(value || "").startsWith("guardian:")) {
    const id = value.slice("guardian:".length);
    const person = (options.guardians || []).find((item) => item.profile_id === id);
    return { kind: "guardian", id, askId: person ? !person.known : true };
  }
  if (String(value || "").startsWith("list:")) {
    const id = value.slice("list:".length);
    const person = (options.contacts || []).find((item) => item.contact_id === id);
    return { kind: "list", id, askId: person ? !person.known : true, blocked: Boolean(person?.blocked) };
  }
  if (value === "other") return { kind: "other", askId: true };
  return { kind: "", askId: false };
}

function updatePickupChoice(form) {
  const choice = pickupChoice(form.elements.picked_up_by?.value);
  const comment = form.querySelector("[data-pickup-comment]");
  const warning = form.querySelector("[data-pickup-id]");
  const preview = form.querySelector("[data-pickup-person]");
  if (comment) comment.hidden = choice.kind !== "other";
  if (warning) warning.hidden = !choice.askId;
  if (!preview) return;
  const person = choice.kind === "list"
    ? (state.checkout?.options?.contacts || []).find((item) => item.contact_id === choice.id)
    : null;
  if (!person) {
    preview.hidden = true;
    preview.innerHTML = "";
    return;
  }
  preview.hidden = false;
  preview.innerHTML = `${childAvatarHtml(person.name, contactPhotoUrl(person.photo_path))}<div><strong>${esc(person.name)}</strong><span>${esc(person.relation)}</span></div>`;
}

async function startPickupScanner() {
  const generation = ++scanGeneration;
  const video = document.querySelector("#pickup-scan-video");
  const showError = (message) => {
    if (state.scan?.phase === "live") state.scan.error = message;
    const status = document.querySelector("#scan-status");
    if (status) status.textContent = message;
  };
  if (!video || !navigator.mediaDevices?.getUserMedia || !window.BarcodeDetectionAPI?.BarcodeDetector) {
    showError("Kameran är inte tillgänglig. Skriv den sexsiffriga koden i stället.");
    return;
  }
  try {
    await window.BarcodeDetectionAPI.prepareZXingModule({
      overrides: {
        locateFile(path, prefix) {
          if (String(path).endsWith(".wasm")) return new URL("vendor/zxing/zxing_reader.wasm", document.baseURI).href;
          return prefix + path;
        },
      },
    });
    if (generation !== scanGeneration) return;
    const detector = new window.BarcodeDetectionAPI.BarcodeDetector({ formats: ["qr_code"] });
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    if (generation !== scanGeneration) {
      scanStream.getTracks().forEach((track) => track.stop());
      scanStream = null;
      return;
    }
    video.srcObject = scanStream;
    video.playsInline = true;
    await video.play();
    const tick = async () => {
      if (generation !== scanGeneration) return;
      try {
        const codes = await detector.detect(video);
        const raw = codes?.[0]?.rawValue;
        if (raw) {
          stopPickupScanner();
          await presentPickupToken(raw, "qr");
          return;
        }
      } catch { /* The next frame can still contain a readable code. */ }
      if (generation === scanGeneration) setTimeout(tick, 250);
    };
    setTimeout(tick, 250);
  } catch {
    stopPickupScanner();
    showError("Kameran är inte tillgänglig. Skriv den sexsiffriga koden i stället.");
  }
}

async function presentPickupToken(raw, method) {
  const secret = presentedPickupSecret(raw);
  await runMutation(async () => {
    const result = await rpc("verify_pickup_token", { presented_token: secret });
    if (result?.photo_path) Object.assign(state.contactPhotoUrls, await signContactPhotos([result.photo_path]));
    state.scan = { phase: "card", method, result };
  }, "");
}

function dayGreeting() {
  const hour = new Date().getHours();
  const hello = hour < 10 ? "God morgon" : hour < 17 ? "God eftermiddag" : "God kväll";
  const first = childFirstName({ name: state.profile?.name || "" });
  return first ? `${hello}, ${first}` : hello;
}

function todayGridDay(child) {
  if (!child || typeof ArtanPickup === "undefined") return null;
  const grid = ArtanPickup.buildTermGrid(pickupGridInput(child));
  const today = todayIso();
  for (const week of grid.weeks) {
    const day = week.days.find((item) => item.iso === today);
    if (day) return { day, monday: week.monday };
  }
  return null;
}

function tomorrowClosureNote(child) {
  if (!child || typeof ArtanPickup === "undefined") return "";
  const tomorrow = ArtanPickup.addDays(todayIso(), 1);
  const grid = ArtanPickup.buildTermGrid(pickupGridInput(child));
  for (const week of grid.weeks) {
    const day = week.days.find((item) => item.iso === tomorrow);
    if (day?.closed) return `Imorgon stängt${day.closureReason ? ` (${day.closureReason})` : ""}`;
  }
  return "";
}

function todayStatusCopy(child, attendance) {
  const place = departmentName(child.department_id);
  if (isWeekend()) return { text: "Helg", sub: "ingen incheckning idag. Ingen dagsplan eller incheckning behövs under helgen.", dot: "is-muted" };
  const status = attendanceState(attendance);
  if (status === "in") return { text: `På förskolan sedan ${formatClock(attendance.checked_in_at)}`, sub: place, dot: "" };
  if (status === "absent_sick") return { text: "Sjuk", sub: place, dot: "is-coral" };
  if (status === "absent_leave") return { text: "Ledig", sub: place, dot: "is-sun" };
  if (status === "picked_up") return { text: `Hämtad ${formatClock(attendance.checked_out_at)}`, sub: place, dot: "is-sky" };
  return { text: "Inte incheckad", sub: place, dot: "is-muted" };
}

function pickupCardCopy(child, summary) {
  const day = summary?.day;
  const note = tomorrowClosureNote(child);
  if (!day) return { value: "Ingen plan", sub: note || departmentName(child.department_id) };
  if (day.closed) return { value: "Stängt", sub: day.closureReason || note || "Förskolan är stängd" };
  if (day.saved) {
    const who = pickupPersonName(child, day.picker);
    return { value: `${day.pickup}${who ? ` · ${who}` : ""}`, sub: note };
  }
  return { value: "Ingen tid sparad", sub: note || "Öppna hela schemat för att fylla i veckan." };
}

function mealEditorSchools() {
  if (!state.profile) return [];
  if (state.profile.role === "admin") return state.schools;
  const mine = new Set(state.staffAssignments.filter((row) => row.staff_id === state.profile.id).map((row) => row.department_id));
  const preschoolIds = new Set(state.departments.filter((department) => mine.has(department.id)).map((department) => department.preschool_id));
  return state.schools.filter((school) => preschoolIds.has(school.id));
}

function mealPreschoolForView() {
  if (state.profile?.role === "parent") return childSchoolId(selectedChild());
  const schools = mealEditorSchools();
  if (state.mealPreschoolId && schools.some((school) => school.id === state.mealPreschoolId)) return state.mealPreschoolId;
  return schools[0]?.id || "";
}

function mealReadablePreschoolIds() {
  if (state.profile?.role === "parent") return [...new Set(state.children.map((child) => childSchoolId(child)).filter(Boolean))];
  return mealEditorSchools().map((school) => school.id);
}

function mealBundle(preschoolId) {
  return state.mealBundles[preschoolId] || { menus: [], days: [], example: false };
}

function mealClosedDates(preschoolId) {
  return state.termClosures.filter((closure) => {
    const term = state.schoolTerms.find((item) => item.term_id === closure.term_id);
    return term && term.preschool_id === preschoolId;
  }).map((closure) => closure.closure_date);
}

function renderMealTodayCard(child) {
  if (!child || state.profile?.role !== "parent") return "";
  const preschoolId = childSchoolId(child);
  if (!state.mealsReady && !state.mealDemo) {
    return `<section class="soft-card is-meal"><p class="soft-label">Matsedel</p><p class="soft-sub">Matsedeln är inte aktiverad i databasen ännu.</p></section>`;
  }
  const bundle = mealBundle(preschoolId);
  const card = ArtanMeals.presentation({
    today: todayIso(),
    menus: bundle.menus,
    days: bundle.days,
    closedDates: mealClosedDates(preschoolId),
    example: bundle.example,
  }).todayCard;
  return ArtanMeals.todayCardHtml(card);
}

function renderMeals() {
  const preschoolId = mealPreschoolForView();
  const school = state.schools.find((item) => item.id === preschoolId);
  const monday = state.mealWeekStart || ArtanMeals.mondayOf(todayIso());
  const bundle = mealBundle(preschoolId);
  const inactive = !state.mealsReady && !state.mealDemo
    ? `<p class="notice error" role="status">Matsedeln är inte aktiverad i databasen ännu. Inget kan sparas förrän migreringen är godkänd och körd.</p>`
    : "";
  if (state.mealImport && state.profile.role !== "parent") {
    if (state.mealImport.status === "reading") {
      return `${noticeHtml()}<h1 class="h1">Läser menyn</h1><p class="page-sub">${esc(state.mealImport.progress || "Filen läses i webbläsaren.")}</p><button class="link" type="button" data-action="meal-import-cancel">Avbryt</button>`;
    }
    if (state.mealImport.status === "review") {
      const review = ArtanMenu.reviewRows(state.mealImport.parsed, {
        today: todayIso(),
        existing: Object.fromEntries((mealBundle(preschoolId).days || []).map((day) => [day.served_on, day.body || ""])),
        closures: mealClosedDates(preschoolId),
        limits: mealLimits(),
      });
      return `${noticeHtml()}${ArtanMeals.importReviewHtml({ ...review, anchorYear: state.mealImport.anchorYear, fileName: state.mealImport.fileName, example: state.mealDemo || state.mealImport.example, termFixture: state.mealTermFixture, limits: mealLimits() })}`;
    }
    if (state.mealImport.status === "unsupported" || state.mealImport.status === "error") {
      return `${noticeHtml()}<h1 class="h1">Matsedel</h1><p class="notice error" role="status">${esc(state.mealImport.message)}</p><button class="link" type="button" data-action="meal-import-back">Tillbaka</button>`;
    }
  }
  if (state.profile.role === "parent") {
    return `${noticeHtml()}${inactive}${ArtanMeals.weekHtml({
      today: todayIso(),
      weekStart: monday,
      menus: bundle.menus,
      days: bundle.days,
      closedDates: mealClosedDates(preschoolId),
      schoolName: school?.name || "",
      example: bundle.example,
    })}`;
  }
  if (!preschoolId) {
    return `${noticeHtml()}${inactive}<h1 class="h1">Matsedel</h1><p class="page-sub">Du är inte kopplad till en förskola ännu.</p>`;
  }
  return `${noticeHtml()}${inactive}${ArtanMeals.editorHtml({
    schools: mealEditorSchools(),
    preschoolId,
    schoolName: school?.name || "",
    weekStart: monday,
    weekEnd: ArtanMeals.addDays(monday, 4),
    previousWeek: ArtanMeals.addDays(monday, -7),
    nextWeek: ArtanMeals.addDays(monday, 7),
    days: ArtanMeals.weekDays(monday).map((iso, index) => {
      const row = (bundle.days || []).find((day) => day.served_on === iso);
      return { iso, label: ArtanMeals.DAY_LABELS[index], body: row?.body || "", photoUrl: row?.photo_url || "" };
    }),
    menu: (bundle.menus || []).find((item) => ArtanMeals.rangesOverlap(item.starts_on, item.ends_on, monday, ArtanMeals.addDays(monday, 4))) || null,
    locked: !state.mealsReady && !state.mealDemo,
  })}`;
}

async function signMealPaths(bucket, paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return new Map();
  const signed = await request(`/storage/v1/object/sign/${bucket}`, {
    method: "POST",
    body: JSON.stringify({ expiresIn: 120, paths: unique }),
  });
  return new Map((signed || []).map((item) => [item.path, storageSignedUrl(item.signedURL || item.signedUrl)]));
}

async function signMealBundle(payload) {
  const menus = payload?.menus || [];
  const days = payload?.days || [];
  let menuUrls = new Map();
  let photoUrls = new Map();
  try {
    [menuUrls, photoUrls] = await Promise.all([
      signMealPaths("meal-menus", menus.map((menu) => menu.storage_path)),
      signMealPaths("meal-photos", days.map((day) => day.photo_path)),
    ]);
  } catch {
    menuUrls = new Map();
    photoUrls = new Map();
  }
  return {
    example: false,
    menus: menus.map((menu) => ({ ...menu, signed_url: menuUrls.get(menu.storage_path) || "" })),
    days: days.map((day) => ({ ...day, photo_url: photoUrls.get(day.photo_path) || "" })),
  };
}

async function loadMeals() {
  state.mealsReady = true;
  const ids = mealReadablePreschoolIds();
  const start = ArtanMeals.addDays(ArtanMeals.mondayOf(todayIso()), -14);
  const end = ArtanMeals.addDays(todayIso(), 42);
  const bundles = {};
  try {
    for (const id of ids) {
      const payload = await rpc("list_preschool_meals", {
        target_preschool_id: id,
        range_start: start,
        range_end: end,
      });
      bundles[id] = await signMealBundle(payload || {});
    }
  } catch (error) {
    if (/schema cache|could not find the function|pgrst202/i.test(error.message)) {
      state.mealsReady = false;
      state.mealBundles = {};
      return;
    }
    throw error;
  }
  state.mealBundles = bundles;
  await loadMealHorizon();
}

function mealLimits() {
  if (state.mealTermFixture) return ArtanMenu.TERM_LIMITS;
  return state.mealHorizon || ArtanMenu.LEGACY_LIMITS;
}

async function loadMealHorizon() {
  if (state.mealDemo) return;
  try {
    const horizon = await rpc("meal_edit_horizon");
    state.mealHorizon = horizon && horizon.revision === "term" && Number(horizon.future_days) === ArtanMenu.TERM_LIMITS.future
      ? ArtanMenu.TERM_LIMITS
      : ArtanMenu.LEGACY_LIMITS;
  } catch {
    state.mealHorizon = ArtanMenu.LEGACY_LIMITS;
  }
}

async function ensureMealRange(preschoolId, start, end) {
  if (!preschoolId || state.mealDemo || !state.mealsReady || !start || !end || end < start) return;
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = ArtanMeals.addDays(cursor, 120);
    const rangeEnd = chunkEnd < end ? chunkEnd : end;
    const payload = await rpc("list_preschool_meals", {
      target_preschool_id: preschoolId,
      range_start: cursor,
      range_end: rangeEnd,
    });
    const signed = await signMealBundle(payload || {});
    const bundle = mealBundle(preschoolId);
    const days = new Map((bundle.days || []).map((day) => [day.served_on, day]));
    for (const day of signed.days) days.set(day.served_on, day);
    const menus = [...(bundle.menus || [])];
    for (const menu of signed.menus) {
      if (!menus.some((item) => item.id === menu.id)) menus.push(menu);
    }
    state.mealBundles[preschoolId] = { ...bundle, days: [...days.values()], menus };
    cursor = ArtanMeals.addDays(rangeEnd, 1);
  }
}

function openMenuReview(parsed, file, fileName, example = false, sourceText = "") {
  state.mealImport = { status: "review", parsed, file: file || null, fileName, anchorYear: "", example, sourceText };
  state.view = "meals";
}

async function downscaleImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas;
}

async function readMealImport(file) {
  state.mealImportCancel = false;
  state.mealTermFixture = false;
  state.mealImport = { status: "reading", fileName: file.name, progress: "Filen läses i webbläsaren." };
  state.view = "meals";
  render();
  try {
    if (file.size > ArtanMenu.MAX_PDF_BYTES) {
      state.mealImport = { status: "error", fileName: file.name, message: "Filen är större än 8 MB." };
      render();
      return;
    }
    const header = new TextDecoder().decode(new Uint8Array(await file.slice(0, 5).arrayBuffer()));
    const decision = ArtanMenu.importDecision({ name: file.name, type: file.type, size: file.size, header });
    if (decision.kind !== "pdf" && decision.kind !== "image") {
      state.mealImport = { status: "error", fileName: file.name, message: decision.message };
      render();
      return;
    }
    const signal = { get aborted() { return state.mealImportCancel; } };
    const report = (text) => {
      if (!state.mealImport || state.mealImport.status !== "reading") return;
      state.mealImport.progress = text;
      render();
    };
    let text = "";
    let uncertain = false;
    const warnings = [];
    if (decision.kind === "image") {
      report("Läser bilden i webbläsaren. Filen lämnar inte webbläsaren.");
      const canvas = await downscaleImage(file);
      const reader = await ArtanMenuOcr.openReader({ signal, onProgress(message) {
        if (message?.status === "recognizing text") report(`Läser bilden, ${Math.round((message.progress || 0) * 100)} %.`);
      } });
      try {
        text = await reader.recognize(canvas);
      } finally {
        canvas.width = 1;
        canvas.height = 1;
        await reader.close();
      }
      uncertain = true;
    } else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      text = await ArtanMenuExtract.extractPdfText(bytes, {
        signal,
        onProgress(progress) {
          report(`Läser sida ${progress.page} av ${progress.total}.`);
        },
      });
      if (String(text || "").trim().length < 20) {
        report("Ingen text i PDF:en. Läser sidorna som bild.");
        const pageText = [];
        const reader = await ArtanMenuOcr.openReader({ signal });
        try {
          const rendered = await ArtanMenuExtract.renderPdfPages(bytes, {
            signal,
            maxPages: ArtanMenu.MAX_OCR_PAGES,
            onProgress(progress) { report(`Läser skannad sida ${progress.page} av ${progress.total}.`); },
            onPage: async (canvas) => {
              pageText.push(await reader.recognize(canvas));
            },
          });
          if (rendered.truncated) warnings.push({ code: "ocr-pages", text: `Filen har ${rendered.pages} sidor. Bara de första ${rendered.read} läses. Skriv in resten för hand.` });
        } finally {
          await reader.close();
        }
        text = pageText.filter(Boolean).join("\n");
        uncertain = true;
      }
    }
    if (state.mealImportCancel) {
      state.mealImport = null;
      render();
      return;
    }
    const parsed = ArtanMenu.parseMenuText(text, { uncertain });
    parsed.warnings.push(...warnings);
    if (!parsed.items.length) {
      parsed.warnings.push({ code: "ocr-empty", text: "Ingen säker text hittades. Skriv in rätterna här, eller använd en PDF med text. Ingenting har sparats." });
    }
    const dates = parsed.items.map((item) => item.served_on).filter(Boolean).sort();
    if (!state.mealDemo && dates.length) {
      try {
        await ensureMealRange(mealPreschoolForView(), dates[0], dates.at(-1));
      } catch (error) {
        parsed.warnings.push({ code: "existing", text: `Befintliga rätter kunde inte hämtas: ${error.message}` });
      }
    }
    openMenuReview(parsed, file, file.name, false, text);
    render();
  } catch (error) {
    if (state.mealImportCancel) {
      state.mealImport = null;
    } else {
      state.mealImport = { status: "error", fileName: file.name, message: error.message };
    }
    render();
  }
}

async function saveMealImport(form) {
  const data = new FormData(form);
  const rows = state.mealImport?.parsed?.items || [];
  const existing = Object.fromEntries((mealBundle(mealPreschoolForView()).days || []).map((day) => [day.served_on, day.body || ""]));
  const approved = [];
  for (const row of rows) {
    if (data.get(`approve_${row.id}`) !== "on") continue;
    const served_on = String(data.get(`date_${row.id}`) || row.served_on || "");
    const body = String(data.get(`dish_${row.id}`) || "").trim();
    const assessment = ArtanMenu.assessRow({
      served_on,
      body,
      existing: existing[served_on] || "",
      today: todayIso(),
      closure: mealClosedDates(mealPreschoolForView()).includes(served_on),
      weekday: served_on === row.served_on ? row.weekday : null,
      limits: mealLimits(),
    });
    if (!assessment.savable) throw new Error(`${served_on || "En rad"}: ${assessment.reason}`);
    approved.push({ served_on, body });
  }
  if (!approved.length) throw new Error("Inga dagar är ikryssade.");
  const planned = ArtanMenu.batches(approved);
  for (const batch of planned) {
    if (batch.days.length > 5) throw new Error(`Veckan som börjar ${batch.monday} har fler än fem dagar.`);
    if (new Set(batch.days.map((day) => day.served_on)).size !== batch.days.length) {
      throw new Error(`Samma dag är med flera gånger i veckan som börjar ${batch.monday}.`);
    }
  }
  if (state.mealDemo) {
    state.notice = { type: "success", text: "Exemplet sparar inte de granskade rätterna." };
    return;
  }
  if (!state.mealsReady) throw new Error("Matsedeln är inte aktiverad i databasen ännu.");
  const preschoolId = mealPreschoolForView();
  try {
    await ArtanMenu.saveApprovedWeeks(planned, async (batch) => {
      await rpc("save_meal_days", { target_preschool_id: preschoolId, meal_days: batch.days });
    });
  } catch (error) {
    await loadMeals();
    throw error;
  }
  if (data.get("attach_file") === "on") {
    const start = String(data.get("file_start") || "");
    const end = String(data.get("file_end") || "");
    const problem = ArtanMenu.fileRangeError(start, end, todayIso(), mealLimits());
    if (problem) throw new Error(`Rätterna är sparade. Filen bifogades inte: ${problem}`);
    const file = state.mealImport?.file;
    if (!file) throw new Error("Rätterna är sparade. Exempelfilen kan inte bifogas.");
    const prepared = await ArtanMeals.preparedMenuFile(file);
    const path = ArtanMeals.menuPath(state.profile.organization_id, preschoolId, crypto.randomUUID(), prepared.kind);
    await uploadMealObject("meal-menus", path, prepared.blob, prepared.mime);
    try {
      await rpc("attach_meal_menu", {
        target_menu_id: crypto.randomUUID(),
        target_preschool_id: preschoolId,
        range_start: start,
        range_end: end,
        object_path: path,
        raw_display_name: file.name,
      });
    } catch (error) {
      await removeMealObjects("meal-menus", [path]);
      throw new Error(`Rätterna är sparade. Filen bifogades inte: ${error.message}`);
    }
  }
  state.mealImport = null;
  await loadMeals();
}

async function uploadMealObject(bucket, path, blob, mime) {
  await request(`/storage/v1/object/${bucket}/${encodedStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": mime, "x-upsert": "false" },
    body: blob,
  });
}

async function removeMealObjects(bucket, paths) {
  for (const path of paths) {
    try { await deleteMealObject(bucket, path); } catch { /* A later clear can retry an unreferenced file. */ }
  }
}

async function deleteMealObject(bucket, path) {
  await request(`/storage/v1/object/${bucket}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] }),
  });
}

async function saveMealWeek(form, values) {
  if (!state.mealsReady) throw new Error("Matsedeln är inte aktiverad i databasen ännu.");
  const preschoolId = values.preschool_id;
  const monday = state.mealWeekStart || ArtanMeals.mondayOf(todayIso());
  const days = ArtanMeals.weekDays(monday).map((iso) => ({
    served_on: iso,
    body: String(values[`day_body_${iso}`] || "").trim(),
  }));
  await rpc("save_meal_days", { target_preschool_id: preschoolId, meal_days: days });
  const file = form.querySelector('input[name="menu_file"]')?.files?.[0];
  if (file) {
    const prepared = await ArtanMeals.preparedMenuFile(file);
    const menuId = values.menu_id || crypto.randomUUID();
    const previousPath = (mealBundle(preschoolId).menus || []).find((menu) => menu.id === values.menu_id)?.storage_path || "";
    const path = ArtanMeals.menuPath(state.profile.organization_id, preschoolId, crypto.randomUUID(), prepared.kind);
    await uploadMealObject("meal-menus", path, prepared.blob, prepared.mime);
    try {
      await rpc("attach_meal_menu", {
        target_menu_id: menuId,
        target_preschool_id: preschoolId,
        range_start: values.menu_starts,
        range_end: values.menu_ends,
        object_path: path,
        raw_display_name: file.name,
      });
    } catch (error) {
      await removeMealObjects("meal-menus", ArtanMeals.replaceCleanup(previousPath, path, false).remove);
      throw error;
    }
    await removeMealObjects("meal-menus", ArtanMeals.replaceCleanup(previousPath, path, true).remove);
  } else if (values.menu_id) {
    const existing = (mealBundle(preschoolId).menus || []).find((menu) => menu.id === values.menu_id);
    if (existing?.storage_path && (existing.starts_on !== values.menu_starts || existing.ends_on !== values.menu_ends)) {
      await rpc("attach_meal_menu", {
        target_menu_id: existing.id,
        target_preschool_id: preschoolId,
        range_start: values.menu_starts,
        range_end: values.menu_ends,
        object_path: existing.storage_path,
        raw_display_name: existing.display_name,
      });
    }
  }
  for (const iso of ArtanMeals.weekDays(monday)) {
    const photo = form.querySelector(`input[name="day_photo_${iso}"]`)?.files?.[0];
    if (!photo) continue;
    const blob = await ArtanMeals.transcodeJpeg(photo, 1280, 2 * 1024 * 1024);
    const previousPath = (mealBundle(preschoolId).days || []).find((day) => day.served_on === iso)?.photo_path || "";
    const path = ArtanMeals.photoPath(state.profile.organization_id, preschoolId, iso, crypto.randomUUID());
    await uploadMealObject("meal-photos", path, blob, "image/jpeg");
    try {
      await rpc("attach_meal_photo", { target_preschool_id: preschoolId, served: iso, object_path: path });
    } catch (error) {
      await removeMealObjects("meal-photos", ArtanMeals.replaceCleanup(previousPath, path, false).remove);
      throw error;
    }
    await removeMealObjects("meal-photos", ArtanMeals.replaceCleanup(previousPath, path, true).remove);
  }
  await loadMeals();
}

function saveMealDemo(form, values) {
  const preschoolId = values.preschool_id || mealPreschoolForView();
  const monday = state.mealWeekStart || ArtanMeals.mondayOf(todayIso());
  const entries = ArtanMeals.weekDays(monday).map((iso) => ({ served_on: iso, body: values[`day_body_${iso}`] || "" }));
  const current = state.mealBundles[preschoolId] || ArtanMeals.exampleBundle(todayIso());
  const next = ArtanMeals.applyText(current, entries);
  const file = form.querySelector('input[name="menu_file"]')?.files?.[0];
  if (file) {
    const mime = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg";
    next.menus = [{
      id: values.menu_id || ArtanMeals.EXAMPLE.menuId,
      starts_on: values.menu_starts,
      ends_on: values.menu_ends,
      display_name: ArtanMeals.sanitizeDisplayName(file.name, mime),
      mime_type: mime,
      storage_path: null,
      signed_url: "",
      example: true,
    }];
  } else if (values.menu_starts && values.menu_ends && next.menus[0]) {
    next.menus[0] = { ...next.menus[0], starts_on: values.menu_starts, ends_on: values.menu_ends };
  }
  ArtanMeals.weekDays(monday).forEach((iso) => {
    const photo = form.querySelector(`input[name="day_photo_${iso}"]`)?.files?.[0];
    if (!photo) return;
    const row = next.days.find((day) => day.served_on === iso);
    const photoUrl = URL.createObjectURL(photo);
    if (row) row.photo_url = photoUrl;
    else next.days.push({ served_on: iso, body: "", photo_url: photoUrl, example: true });
  });
  state.mealBundles[preschoolId] = next;
  state.notice = { type: "success", text: "Exemplet uppdaterades bara i den här webbläsaren." };
  render();
}

function renderHomeAssignments(child) {
  if (!state.familyFeaturesReady || !featureEnabled(child, "assignments")) return "";
  const assignments = schoolworkFor(child.id).assignments
    .filter((item) => item.status !== "completed")
    .sort((left, right) => {
      const priority = Number(right.status === "missing") - Number(left.status === "missing");
      return priority || String(left.due_on).localeCompare(String(right.due_on));
    });
  if (!assignments.length) return "";
  const next = assignments[0];
  const remaining = assignments.length - 1;
  const status = `${ASSIGNMENT_STATUS[next.status] || "Uppgift"} · ${formatDate(next.due_on)}${remaining ? ` · +${remaining}` : ""}`;
  return `<p class="menu-label">Uppgifter</p><div class="menu-group"><button type="button" class="menu-row" data-action="navigate" data-view="child" data-section="skola"><span class="menu-row-title">${esc(next.subject)} · ${esc(next.title)}</span><span class="menu-row-status">${esc(status)}</span></button></div>`;
}

function renderHomeQuickActions(child) {
  const bannerCount = activeSchoolBanners().length;
  const eventCount = groupedSchoolEvents().filter((event) => new Date(event.ends_at).getTime() >= Date.now()).length;
  const actions = [];
  if (featureEnabled(child, "attendance") && !isWeekend()) {
    actions.push(`<button type="button" class="home-quick-action" data-action="open-daily-plan" aria-controls="daily-plan"><span class="menu-icon-badge">${navIcon("illness")}</span><strong>Sjukanmälan</strong><small>Sjuk eller ledig</small></button>`);
  }
  if (featureEnabled(child, "important")) {
    actions.push(`<button type="button" class="home-quick-action" data-action="navigate" data-view="banners"><span class="menu-icon-badge">${navIcon("banner")}</span><strong>Viktig information</strong><small>${bannerCount ? `${bannerCount} aktiva` : "Ingen ny"}</small></button>`);
  }
  if (featureEnabled(child, "events")) {
    actions.push(`<button type="button" class="home-quick-action" data-action="navigate" data-view="events"><span class="menu-icon-badge">${navIcon("event")}</span><strong>Händelser</strong><small>${eventCount ? `${eventCount} kommande` : "Inga kommande"}</small></button>`);
  }
  return actions.length ? `<section class="home-quick-grid" aria-label="Genvägar">${actions.join("")}</section>` : "";
}

function renderTodaySubjects(child) {
  if (!isSchoolChild(child) || !featureEnabled(child, "schedule")) return "";
  const weekday = new Date(`${todayIso()}T12:00:00`).getDay();
  if (weekday < 1 || weekday > 5) return "";
  const entries = timetableForDepartment(child.department_id, weekday);
  const rows = entries.length
    ? entries.map((entry) => `<li><time>${esc(entry.starts_at)}–${esc(entry.ends_at)}</time><span><strong>${esc(entry.subject)}</strong>${entry.teacher_name || entry.room ? `<small>${esc([entry.teacher_name, entry.room].filter(Boolean).join(" · "))}</small>` : ""}</span></li>`).join("")
    : `<li class="empty-subjects">Skolan har inte publicerat dagens ämnen ännu.</li>`;
  return `<section class="card today-subjects"><div class="section-head"><div><p class="kicker">Idag</p><h2>Dagens ämnen</h2></div><button class="link" type="button" data-action="navigate" data-view="pickup">Hela schemat</button></div><ul>${rows}</ul></section>`;
}

function renderSchoolNotices(child) {
  const notices = state.schoolNotices.filter((notice) => notice.child_id === child.id && !notice.read_at);
  if (!notices.length) return "";
  return `<section class="card school-notices"><p class="kicker">Nytt från skolan</p><h2>Att göra den här veckan</h2><div class="menu-group">${notices.map((notice) => `<button type="button" class="menu-row" data-action="school-notice" data-id="${esc(notice.notice_id)}"><span class="menu-row-title">${esc(notice.title)}</span><span class="menu-row-status">${esc(notice.body)}</span></button>`).join("")}</div></section>`;
}

function renderParentHome() {
  const child = selectedChild();
  if (!child) return `${noticeHtml()}<p class="hi">Välkommen</p><h1 class="h1">Inget barn ännu</h1><p class="sub">När personalen har kopplat ett barn syns dagen här. Du kan också be om en koppling.</p>${renderSiblingRequestForm()}`;
  const attendance = attendanceFor(child.id);
  const schoolMode = isSchoolChild(child);
  const showAttendance = featureEnabled(child, "attendance");
  const showPickup = featureEnabled(child, "pickup") && !schoolMode;
  const weekend = isWeekend();
  const pickupContacts = contactsFor(child.id).filter((contact) => contact.can_pickup);
  const latest = state.posts.find((post) => !post.child_id || post.child_id === child.id);
  const reminders = parentReminders(child);
  const nextReminder = reminders[0];
  const status = schoolMode && !weekend && !["absent_sick", "absent_leave"].includes(attendance?.status)
    ? { text: "Ingen frånvaro anmäld", sub: departmentName(child.department_id), dot: "" }
    : todayStatusCopy(child, attendance);
  const summary = todayGridDay(child);
  const pickup = pickupCardCopy(child, summary);
  const renewal = renderPassRenewalCards(child);
  const editToday = `<button class="link" type="button" data-action="navigate" data-view="pickup">Visa hela schemat</button>`;
  const planStatus = ["in", "absent_sick", "absent_leave"].includes(attendance?.status) ? attendance.status : "in";
  const absentToday = ["absent_sick", "absent_leave"].includes(planStatus);
  const absenceTitle = planStatus === "absent_leave" ? "Anledning till ledighet, valfritt" : "Anledning till sjukdom, valfritt";
  const today = todayIso();
  const absenceEndsOn = absentToday && attendance?.absence_ends_on >= today ? attendance.absence_ends_on : today;
  const absencePeriodSummary = absenceEndsOn > today ? ` till och med ${formatDate(absenceEndsOn)}` : "";
  const statusChoices = [["in", schoolMode ? "Ingen frånvaro" : "Kommer"], ["absent_sick", "Sjuk"], ["absent_leave", "Ledig"]]
    .map(([value, label]) => `<label><input type="radio" name="status" value="${value}" ${planStatus === value ? "checked" : ""}><span>${label}</span></label>`)
    .join("");
  const dailyPlan = !showAttendance || weekend
    ? ""
    : `<details id="daily-plan" class="card quick-panel">
      <summary><span class="menu-icon-badge">${navIcon("illness")}</span><span><strong>${schoolMode ? "Anmäl eller ändra frånvaro" : "Ändra dagens status"}</strong><small>${absentToday ? `${attendanceLabel(attendance.status)}${absencePeriodSummary}` : schoolMode ? "Ingen frånvaro anmäld" : "Kommer idag"}</small></span><span class="menu-chevron" aria-hidden="true">${navIcon("chevron")}</span></summary>
      <form class="form-stack quick-panel-form" data-form="parent-attendance" data-child-id="${esc(child.id)}">
        <fieldset class="attendance-status-options"><legend>Vad gäller idag?</legend><div>${statusChoices}</div></fieldset>
        ${schoolMode ? "" : `<div data-attendance-present-fields ${absentToday ? "hidden" : ""}>
          <div class="form-grid">${field("Lämning", "dropoff_at", attendance?.dropoff_at?.slice(0, 5) || "", { type: "time" })}${field("Hämtning", "pickup_at", attendance?.pickup_at?.slice(0, 5) || "", { type: "time" })}</div>
          <label>Vem hämtar?<input name="pickup_by" type="text" value="${esc(attendance?.pickup_by || "")}" list="pickup-contact-options" placeholder="Exempelvis mormor eller farfar"></label>
          ${pickupContacts.length ? `<datalist id="pickup-contact-options">${pickupContacts.map((contact) => `<option value="${esc(contact.name)}"></option>`).join("")}</datalist>` : ""}
        </div>`}
        ${state.multiDayAbsenceReady ? `<label class="absence-period-field" data-absence-period-field ${absentToday ? "" : "hidden"}><span>Till och med</span><input name="absence_ends_on" type="date" min="${today}" max="${addDaysIso(today, 30)}" value="${esc(absenceEndsOn)}" required ${absentToday ? "" : "disabled"}></label>` : ""}
        ${state.attendanceNotesReady ? `<label data-absence-note-field ${absentToday ? "" : "hidden"}><span data-absence-note-title>${absenceTitle}</span><input name="absence_note" maxlength="500" value="${esc(attendance?.absence_note || "")}" placeholder="${planStatus === "absent_leave" ? "Till exempel familjeledig" : "Till exempel feber eller hosta"}"><span class="form-hint">Syns bara för vårdnadshavare och personal.</span></label>` : `<p class="form-hint" data-absence-note-field ${absentToday ? "" : "hidden"}>Frånvaroanteckningar är inte aktiverade i databasen ännu.</p>`}
        ${state.schoolExperienceReady && featureEnabled(child, "documents") ? `<label data-absence-note-field ${absentToday ? "" : "hidden"}>Bilaga, valfritt<input name="absence_document" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><span class="form-hint">Till exempel reseuppgifter eller underlag för frånvaron. Högst 10 MB.</span></label>` : ""}
        <button class="primary" type="submit" data-attendance-submit>${absentToday ? "Spara frånvaro" : "Spara dagens status"}</button>
      </form>
    </details>`;
  const reminderBlock = reminders.length
    ? `<section class="card"><h2>Att komma ihåg</h2><ul class="bot-reminders">${reminders.map((reminder) => `<li>${esc(reminder.text)}</li>`).join("")}</ul>${nextReminder ? `<button class="link" type="button" data-action="bot-reminder" data-view="${esc(nextReminder.view)}" data-target="${esc(nextReminder.target)}">Ta hand om nästa sak</button>` : ""}</section>`
    : "";
  const assignmentRow = renderHomeAssignments(child);
  const latestRow = latest
    ? `<p class="menu-label">Senaste meddelande</p><div class="menu-group"><button type="button" class="menu-row" data-action="navigate" data-view="messages" data-section="anslagstavla"><span class="menu-row-title">${esc(latest.title)}</span><span class="menu-row-status">${esc(formatTimestamp(latest.created_at))}</span></button></div>`
    : "";
  const todayCard = !showAttendance
    ? ""
    : weekend
      ? `<section class="soft-card is-today"><p class="soft-label">Idag</p><p class="soft-value"><span class="status-dot ${status.dot}"></span>${esc(status.text)}</p><p class="soft-sub">${esc(status.sub)}</p></section>`
      : `<button type="button" class="soft-card is-today today-status-card" data-action="open-daily-plan" aria-controls="daily-plan"><span class="soft-label">Idag</span><span class="soft-value"><span class="status-dot ${status.dot}"></span>${esc(status.text)}</span><span class="soft-sub">${esc(status.sub)}</span><span class="today-status-action">Ändra ${navIcon("chevron")}</span></button>`;
  return `${noticeHtml()}${childTabs()}<p class="hi">${esc(dayGreeting())}</p><h1 class="h1">${esc(childFirstName(child) || child.name)}</h1>
    ${renderHomeQuickActions(child)}
    ${todayCard}
    ${dailyPlan}
    ${renderTodaySubjects(child)}
    ${featureEnabled(child, "meals") ? renderMealTodayCard(child) : ""}
    ${assignmentRow}
    ${latestRow}
    ${renderSchoolNotices(child)}
    ${showPickup ? `<div class="present-day-content" data-present-day-content ${absentToday ? "hidden" : ""}>
      <section class="soft-card is-pick"><p class="soft-label">Schema</p><p class="soft-value">${esc(pickup.value)}</p>${pickup.sub ? `<p class="soft-sub">${esc(pickup.sub)}</p>` : ""}${editToday}</section>
      ${renewal}
      ${renderPickupNotices()}
      ${renderPickupWeekNudge(child)}
      ${renderParentTermSchedules(child)}
    </div>` : ""}
    ${renderIncidentCopies()}
    ${renderNoticeList(isSchoolChild(child) ? "Skolan" : "Förskolan", "Meddelanden till dig", (state.notices || []).filter((notice) => notice.kind === "incident_copy" || notice.kind === "incident_reminder"))}
    <div class="home-reminder-content" data-home-reminder-content>${reminderBlock}</div>`;
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
  const gallery = images.length ? `<div class="post-image-gallery count-${Math.min(images.length, 4)}">${images.map((image) => {
    const picture = image.signed_url
      ? `<img src="${esc(image.signed_url)}" alt="${esc(image.alt_text)}" width="${image.width}" height="${image.height}" loading="lazy">`
      : `<div class="post-image-missing" role="img" aria-label="${esc(image.alt_text)}">Bilden kunde inte laddas</div>`;
    return `<figure class="post-share-figure">${picture}${renderShareActions("attachment", image.image_id, image.alt_text || post.title)}</figure>`;
  }).join("")}</div>` : "";
  return `<article class="card school-post"><p class="kicker">Från skolan · ${esc(scope || "Skolan")} · ${esc(formatTimestamp(post.created_at))}</p><h3>${esc(post.title)}</h3><p class="pre-line">${esc(post.body)}</p>
    ${renderShareActions("post", post.id, post.title)}
    ${gallery}
    ${canDelete ? `<button class="link danger-link post-delete" type="button" data-action="delete-post" data-id="${esc(post.id)}">Ta bort inlägget</button>` : ""}
    <section class="post-comments"><h4>Kommentarer</h4>${comments.length ? `<ul>${comments.map(renderPostComment).join("")}</ul>` : `<p class="form-hint">Inga kommentarer ännu.</p>`}
      <form class="comment-form" data-form="post-comment" data-post-id="${esc(post.id)}">${field("Skriv en kommentar", "body", "", { required: true, maxlength: "2000" })}<button class="secondary" type="submit">Kommentera</button></form>
    </section>
  </article>`;
}

function factValue(value, empty = "Ingen uppgift") {
  const text = Array.isArray(value) ? value.filter(Boolean).join(", ") : String(value || "").trim();
  return text ? esc(text) : `<span class="muted-value">${esc(empty)}</span>`;
}

function contactFlags(contact) {
  return [contact.relation, contact.can_pickup ? "får hämta" : "får inte hämta", contact.is_primary ? "primär kontakt" : ""].filter(Boolean).join(" · ");
}

function renderContactEditor(child, contact = null) {
  const editing = Boolean(contact);
  return `<form class="form-stack contact-editor" data-form="contact-save" data-child-id="${esc(child.id)}" ${editing ? `data-contact-id="${esc(contact.id)}"` : ""}>
    <h3>${editing ? "Redigera kontaktperson" : "Lägg till kontaktperson"}</h3>
    <div class="form-grid">${field("Namn", "name", contact?.name || "", { required: true })}${field("Relation", "relation", contact?.relation || "", { required: true, placeholder: "Exempelvis mormor" })}</div>
    ${field("Telefon", "phone", contact?.phone || "", { type: "tel", autocomplete: "tel" })}
    <label class="check"><input type="checkbox" name="can_pickup" ${contact?.can_pickup ? "checked" : ""}> Personen får hämta barnet</label>
    <label class="check"><input type="checkbox" name="is_primary" ${contact?.is_primary ? "checked" : ""}> Primär kontakt</label>
    <div class="contact-actions">
      <button class="primary" type="submit">${editing ? "Spara kontakt" : "Lägg till kontakt"}</button>
      ${editing ? `<button class="danger" type="button" data-action="delete-contact" data-child-id="${esc(child.id)}" data-contact-id="${esc(contact.id)}" data-contact-name="${esc(contact.name)}">Ta bort</button>` : ""}
    </div>
  </form>`;
}

function renderConsentChoices(child) {
  return `<div class="consent-grid">${CONSENT_OPTIONS.map(([type, label]) => {
    const recorded = consentRecorded(child.id, type);
    const allowed = consentFor(child.id, type);
    return `<div class="consent-question"><div><strong>${esc(label)}</strong><span>${recorded ? allowed ? "Ja" : "Nej" : "Ej besvarat"}</span></div><div class="consent-choices" role="group" aria-label="${esc(label)}"><button type="button" data-action="set-consent" data-child-id="${esc(child.id)}" data-type="${esc(type)}" data-allowed="true" aria-pressed="${recorded && allowed}">Ja</button><button type="button" data-action="set-consent" data-child-id="${esc(child.id)}" data-type="${esc(type)}" data-allowed="false" aria-pressed="${recorded && !allowed}">Nej</button></div></div>`;
  }).join("")}</div>`;
}

function childInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const letters = `${parts[0]?.[0] || ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`;
  return (letters || "?").toLocaleUpperCase("sv-SE");
}

function childPhotoUrl(path) {
  return path ? state.childPhotoUrls[path] || "" : "";
}

function contactPhotoUrl(path) {
  return path ? state.contactPhotoUrls[path] || "" : "";
}

function contactPhotoPath(contactId) {
  return `${String(contactId || "").toLowerCase()}/photo.jpg`;
}

function renderPickupContactItem(contact, allowDelete = true) {
  const url = contactPhotoUrl(contact.photo_path);
  const photo = state.profile?.role === "parent" && !contact.blocked
    ? `<div class="photo-actions contact-photo-actions"><label class="file-button">${contact.photo_path ? "Byt bild" : "Foto"}<input type="file" accept="image/*" data-action="contact-photo" data-contact-id="${esc(contact.contact_id)}"></label>${contact.photo_path ? `<button class="link danger-link" type="button" data-action="delete-contact-photo" data-id="${esc(contact.contact_id)}">Ta bort bild</button>` : ""}</div>`
    : "";
  const phone = contact.phone ? `<a href="tel:${esc(String(contact.phone).replace(/\s/g, ""))}">${esc(contact.phone)}</a>` : "";
  const remove = allowDelete && !contact.blocked ? `<button class="link danger-link" type="button" data-action="delete-pickup-contact" data-id="${esc(contact.contact_id)}">Ta bort</button>` : "";
  return `<li class="contact-photo-row"><div class="attendance-identity">${childAvatarHtml(contact.name, url)}<div><strong>${esc(contact.name)}</strong><span>${esc(contact.relation)}${contact.blocked ? " · får ej hämta" : ""}</span>${photo}</div></div><div class="invite-actions">${phone}${remove}</div></li>`;
}

function renderPickupContactPhotos(child) {
  if (state.profile?.role !== "parent") return "";
  if (!state.pickupReady) {
    return `<div id="pickup-contact-photos"><h3>Bilder på hämtlistan</h3><p class="form-hint">Hämtlistan är inte aktiverad i databasen ännu. Kontaktpersonerna nedan kan fortfarande redigeras.</p></div>`;
  }
  const contacts = state.pickupContacts.filter((contact) => contact.child_id === child.id && !contact.blocked);
  if (!contacts.length) {
    return `<div id="pickup-contact-photos"><h3>Bilder på hämtlistan</h3><p class="form-hint">Lägg till personen under Hämtning. Där kan du också lägga en bild som personalen ser vid utcheckning.</p></div>`;
  }
  return `<div id="pickup-contact-photos"><h3>Bilder på hämtlistan</h3><p class="form-hint">Valfri bild per person på hämtlistan. Personalen ser den vid utcheckning och när ett hämtpass skannas. Bilden förminskas till 512 pixlar.</p><ul class="contact-list">${contacts.map((contact) => renderPickupContactItem(contact, false)).join("")}</ul></div>`;
}

function childAvatarHtml(name, url, color = "") {
  const initials = esc(childInitials(name));
  const style = color ? ` style="background:${esc(color)}"` : "";
  if (url) return `<span class="child-avatar has-photo"${style}><img src="${esc(url)}" alt="" onerror="this.parentElement.classList.remove('has-photo'); this.remove();"><span class="avatar-initials">${initials}</span></span>`;
  return `<span class="child-avatar"${style} aria-hidden="true">${initials}</span>`;
}

function childPhotoPath(childId) {
  return `${childId}/profile.jpg`;
}

async function transcodeChildPhoto(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Välj en bild.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Bilden är större än 20 MB.");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Bilden kunde inte läsas. Välj en JPEG, PNG eller WEBP.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const originX = Math.floor((bitmap.width - side) / 2);
  const originY = Math.floor((bitmap.height - side) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 512, 512);
  context.drawImage(bitmap, originX, originY, side, side, 0, 0, 512, 512);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
  if (!blob) throw new Error("Bilden kunde inte bearbetas.");
  if (blob.size > 2 * 1024 * 1024) throw new Error("Bilden är större än 2 MB efter bearbetning.");
  return blob;
}

async function uploadChildPhotoObject(path, blob) {
  return request(`/storage/v1/object/child-photos/${encodedStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: blob,
  });
}

async function uploadContactPhotoObject(path, blob) {
  return request(`/storage/v1/object/contact-photos/${encodedStoragePath(path)}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "x-upsert": "true" },
    body: blob,
  });
}

async function deleteContactPhotoObject(path) {
  try {
    await request("/storage/v1/object/contact-photos", {
      method: "DELETE",
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch (error) {
    if (!/not found|404|object not found/i.test(error.message)) throw error;
  }
}

async function saveContactPhoto(contactId, file) {
  if (state.profile.role !== "parent") throw new Error("Bara vårdnadshavare kan ladda upp en bild.");
  const path = contactPhotoPath(contactId);
  const hadPhoto = Boolean(state.pickupContacts.find((contact) => contact.contact_id === contactId)?.photo_path);
  const blob = await transcodeChildPhoto(file);
  try {
    await uploadContactPhotoObject(path, blob);
  } catch (error) {
    if (pickupFeatureMissing(error) || /bucket|not found|404|403/i.test(error.message)) {
      throw new Error("Bilder på hämtlistan är inte aktiverade i databasen ännu.");
    }
    throw error;
  }
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await rpc("set_pickup_contact_photo", { target_contact_id: contactId, object_path: path });
      delete state.contactPhotoUrls[path];
      const fresh = await signContactPhotos([path]);
      if (fresh[path]) state.contactPhotoUrls[path] = fresh[path];
      return;
    } catch (error) {
      lastError = error;
      if (pickupFeatureMissing(error)) break;
    }
  }
  if (pickupFeatureMissing(lastError)) {
    if (!hadPhoto) {
      try { await deleteContactPhotoObject(path); } catch { /* The row was never updated. */ }
    }
    throw new Error("Bilder på hämtlistan är inte aktiverade i databasen ännu.");
  }
  if (!hadPhoto) {
    try {
      await deleteContactPhotoObject(path);
    } catch {
      throw new Error(`Bilden sparades inte och den nya filen kunde inte tas bort. Försök igen. ${lastError.message}`);
    }
  }
  throw lastError;
}

async function removeContactPhoto(contactId) {
  if (state.profile.role !== "parent") throw new Error("Bara vårdnadshavare kan ta bort bilden.");
  await deleteContactPhotoObject(contactPhotoPath(contactId));
  try {
    await rpc("clear_pickup_contact_photo", { target_contact_id: contactId });
  } catch (error) {
    if (pickupFeatureMissing(error)) throw new Error("Bilder på hämtlistan är inte aktiverade i databasen ännu.");
    if (/finns kvar/i.test(error.message)) throw new Error("Bilden finns kvar. Borttagningen avbröts och personen är oförändrad.");
    throw error;
  }
}

async function deleteChildPhotoObject(path) {
  try {
    await request("/storage/v1/object/child-photos", {
      method: "DELETE",
      body: JSON.stringify({ prefixes: [path] }),
    });
  } catch (error) {
    if (!/not found|404|object not found/i.test(error.message)) throw error;
  }
}

async function saveChildPhoto(childId, file) {
  if (state.profile.role !== "parent") throw new Error("Bara vårdnadshavare kan ladda upp en profilbild.");
  const path = childPhotoPath(childId);
  const hadPhoto = Boolean(state.children.find((child) => child.id === childId)?.photo_path);
  const blob = await transcodeChildPhoto(file);
  await uploadChildPhotoObject(path, blob);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await rpc("set_child_photo", { target_child_id: childId, object_path: path });
      delete state.childPhotoUrls[path];
      const fresh = await signChildPhotos([path]);
      if (fresh[path]) state.childPhotoUrls[path] = fresh[path];
      return;
    } catch (error) {
      lastError = error;
    }
  }
  if (!hadPhoto) {
    try {
      await deleteChildPhotoObject(path);
    } catch {
      throw new Error(`Profilen uppdaterades inte och den nya bilden kunde inte tas bort. Försök igen. ${lastError.message}`);
    }
  }
  throw lastError;
}

async function removeChildPhoto(childId) {
  if (state.profile.role !== "parent") throw new Error("Bara vårdnadshavare kan ta bort profilbilden.");
  await deleteChildPhotoObject(childPhotoPath(childId));
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await rpc("clear_child_photo", { target_child_id: childId });
      return;
    } catch (error) {
      lastError = error;
      if (/finns kvar/i.test(error.message)) {
        throw new Error("Bilden finns kvar. Borttagningen avbröts och profilen är oförändrad.");
      }
    }
  }
  throw new Error(`Bildfilen är borttagen, men profilen pekar fortfarande på den. Försök igen. ${lastError.message}`);
}

function classListRowsFor(childId) {
  return state.classListConsents.filter((row) => row.child_id === childId);
}

function photoAnswerLabel(value) {
  if (value === true) return "har sagt ja";
  if (value === false) return "har sagt nej";
  return "har inte svarat";
}

function renderChildPhoto(child) {
  if (!state.classListReady) {
    return `<section class="card" id="child-photo"><h2>Profilbild</h2><p class="form-hint">Klasslistan och profilbilder är inte aktiverade i databasen ännu.</p></section>`;
  }
  const url = childPhotoUrl(child.photo_path);
  return `<section class="card" id="child-photo"><h2>Profilbild</h2><div class="child-photo-layout">${childAvatarHtml(child.name, url, child.avatar_color)}<div><p class="form-hint">Bilden hjälper personalen att känna igen barnet vid hämtning. Den beskärs till en kvadrat, förminskas till cirka 512 pixlar och sparas utan kamerans dolda uppgifter. Andra vårdnadshavare ser den bara om alla vårdnadshavare har sagt ja under Klasslista.</p><div class="photo-actions"><label class="file-button">${child.photo_path ? "Byt bild" : "Ladda upp"}<input type="file" accept="image/*" data-action="child-photo" data-child-id="${esc(child.id)}"></label>${child.photo_path ? `<button class="danger" type="button" data-action="delete-child-photo" data-child-id="${esc(child.id)}">Ta bort</button>` : ""}</div></div></div></section>`;
}

function renderClassListChoice(child, field, label, hint) {
  const mine = classListRowsFor(child.id).find((row) => row.is_self);
  const value = mine?.[field];
  return `<div class="consent-question"><div><strong>${esc(label)}</strong><span>${value === true ? "Ja" : value === false ? "Nej" : "Ej besvarat"}</span></div><p class="form-hint">${esc(hint)}</p><div class="consent-choices" role="group" aria-label="${esc(label)}"><button type="button" data-action="set-class-list-consent" data-child-id="${esc(child.id)}" data-field="${esc(field)}" data-value="true" aria-pressed="${value === true}">Ja</button><button type="button" data-action="set-class-list-consent" data-child-id="${esc(child.id)}" data-field="${esc(field)}" data-value="false" aria-pressed="${value === false}">Nej</button></div></div>`;
}

function renderClassListConsent(child) {
  if (!state.classListReady) {
    return `<section class="card" id="class-list-consent"><h2>Klasslista</h2><p class="form-hint">Klasslistan och profilbilder är inte aktiverade i databasen ännu.</p></section>`;
  }
  const rows = classListRowsFor(child.id);
  const others = rows.filter((row) => !row.is_self);
  const nameVisible = rows.some((row) => row.show_name === true) && !rows.some((row) => row.show_name === false);
  const photoVisible = rows.length > 0 && rows.every((row) => row.show_photo === true);
  const otherStatus = others.length
    ? `<ul class="consent-readout">${others.map((row) => `<li><span>${esc(row.guardian_name)}</span><strong>${esc(photoAnswerLabel(row.show_photo))}</strong></li>`).join("")}</ul>`
    : `<p class="form-hint">Ingen annan vårdnadshavare är kopplad. Bilden kan visas när du själv har sagt ja.</p>`;
  return `<section class="card" id="class-list-consent"><h2>Klasslista</h2><p class="form-hint">Andra vårdnadshavare i samma avdelning kan se en klasslista. Den är frivillig och skild från samtyckena för bilder i ärtan, gruppbilder och sociala medier. Personal och administratörer på barnets avdelning ser namn och bild ändå, för hämtning.</p>
    ${renderClassListChoice(child, "show_name", "Visa förnamnet i klasslistan", "Förnamnet visas om minst en vårdnadshavare sagt ja och ingen sagt nej. Ett nej tar bort barnet från listan direkt.")}
    ${renderClassListChoice(child, "show_photo", "Visa bilden för andra vårdnadshavare", "Bilden visas bara när varje kopplad vårdnadshavare har sagt ja. Ett nej, eller en vårdnadshavare som inte har svarat, döljer bilden direkt.")}
    <h3>Andra vårdnadshavare och bilden</h3>${otherStatus}
    <p class="form-hint">${nameVisible ? "Barnet syns i klasslistan." : "Barnet syns inte i klasslistan."} ${photoVisible ? "Bilden kan visas där." : "Bilden visas inte där just nu."}</p></section>`;
}

function renderClassList() {
  if (state.profile.role !== "parent") return "";
  if (!state.classListReady) {
    return `${noticeHtml()}<section class="hero-card"><p class="kicker">Avdelningen</p><h1 class="h1">Klasslista</h1><p class="sub">Klasslistan och profilbilder är inte aktiverade i databasen ännu.</p></section>`;
  }
  const groups = new Map();
  state.classList.forEach((child) => {
    if (!groups.has(child.department_id)) groups.set(child.department_id, { name: child.department_name, children: [] });
    groups.get(child.department_id).children.push(child);
  });
  const sections = Array.from(groups.values()).map((group) => `<section class="class-list-group"><p class="menu-label">${esc(group.name)}</p><div class="menu-group">${group.children.map((child) => `<div class="menu-row class-list-card">${childAvatarHtml(child.display_name, childPhotoUrl(child.photo_path))}<div><strong>${esc(child.display_name)}</strong>${child.photo_path ? "" : `<span>Ingen bild</span>`}</div></div>`).join("")}</div></section>`).join("");
  return `${noticeHtml()}<h1 class="h1">Klasslista</h1><p class="page-sub">Barn i samma avdelning, när vårdnadshavarna har valt att visa förnamnet. Bilden syns bara om alla vårdnadshavare till det barnet har sagt ja.</p>${sections || emptyState("Inga barn visas ännu", "Ett barn syns när en vårdnadshavare sagt ja till namnet och ingen sagt nej.")}`;
}

function renderChildFacts(child) {
  const health = healthFor(child.id);
  const contacts = contactsFor(child.id);
  const move = state.profile.role === "admin" && departmentOptions().length
    ? `<form class="form-stack child-move" data-form="move-child" data-child-id="${esc(child.id)}"><h4>Avdelning</h4>${selectField("Flytta till avdelning", "department_id", departmentOptions(), child.department_id, true)}<button class="secondary" type="submit">Flytta barnet</button><p class="form-hint">Flytten ändrar bara avdelning. Namn, hälsa, kontakter och samtycken rörs inte.</p></form>`
    : "";
  return `<article class="child-facts"><header class="child-facts-head">${childAvatarHtml(child.name, childPhotoUrl(child.photo_path), child.avatar_color)}<div><h3>${esc(child.name)}</h3><p class="meta">${esc(departmentName(child.department_id))}${child.birth_date ? ` · ${esc(formatDate(child.birth_date))}` : ""}</p></div></header>
    <dl class="fact-list">
      <div><dt>Anteckning</dt><dd>${factValue(child.notes)}</dd></div>
      <div><dt>Allergier</dt><dd>${factValue(health.allergies)}</dd></div>
      <div><dt>Sjukdomar eller tillstånd</dt><dd>${factValue(health.conditions)}</dd></div>
      <div><dt>Specialkost</dt><dd>${factValue(health.diet)}</dd></div>
      <div><dt>Medicin</dt><dd>${factValue(health.medication)}</dd></div>
      <div><dt>Akut information</dt><dd>${factValue(health.emergency)}</dd></div>
    </dl>
    <h4>Kontaktpersoner</h4>
    ${contacts.length ? `<ul class="contact-list">${contacts.map((contact) => `<li><div><strong>${esc(contact.name)}</strong><span>${esc(contactFlags(contact))}</span></div>${contact.phone ? `<a href="tel:${esc(String(contact.phone).replace(/\s/g, ""))}">${esc(contact.phone)}</a>` : ""}</li>`).join("")}</ul>` : `<p class="form-hint">Ingen kontaktperson är sparad.</p>`}
    <h4>Samtycken</h4>
    <ul class="consent-readout">${CONSENT_OPTIONS.map(([type, label]) => {
      const recorded = consentRecorded(child.id, type);
      const answer = recorded ? consentFor(child.id, type) ? "Ja" : "Nej" : "Ej besvarat";
      return `<li><span>${esc(label)}</span><strong>${esc(answer)}</strong></li>`;
    }).join("")}</ul>
    ${move}
  </article>`;
}

function renderChildBasics(child) {
  return `<form id="child-basics" class="card form-stack child-step" data-form="child-profile" data-child-id="${esc(child.id)}"><p class="kicker">Steg 1 av 4</p><h2>Grunduppgifter</h2>
      ${field("Barnets namn", "name", child.name, { required: true, autocomplete: "name" })}
      ${field("Födelsedatum", "birth_date", child.birth_date || "", { type: "date", required: true })}
      ${textareaField("Det här behöver personalen veta", "notes", child.notes || "", "Trygghet, språk, rutiner eller annat viktigt")}
      <p class="form-hint">Lämna anteckningen tom och spara om den ska tas bort. Namn och födelsedatum behöver finnas kvar.</p>
      <button class="primary" type="submit">Spara grunduppgifter</button>
    </form>`;
}

function renderChildHealth(child) {
  const health = healthFor(child.id);
  const form = `<form id="child-health" class="card form-stack child-step" data-form="child-health" data-child-id="${esc(child.id)}"><p class="kicker">Steg 2 av 4</p><h2>Hälsa och omsorg</h2><p class="form-hint">Gå igenom steget och spara även om barnet inte har allergier, medicin eller andra särskilda behov. Ett tomt fält tar bort just den uppgiften. De andra fälten behålls.</p>
      ${field("Allergier, separera med kommatecken", "allergies", health.allergies?.join(", ") || "")}
      ${field("Sjukdomar eller tillstånd", "conditions", health.conditions?.join(", ") || "")}
      ${textareaField("Specialkost", "diet", health.diet || "")}
      ${textareaField("Medicin och instruktion", "medication", health.medication || "")}
      ${textareaField("Akut information", "emergency", health.emergency || "")}
      <button class="primary" type="submit">Spara och markera som genomgånget</button>
      ${health.updated_at ? `<p class="form-hint">Senast uppdaterad ${esc(formatTimestamp(health.updated_at))}</p>` : ""}
    </form>`;
  if (!state.schoolExperienceReady || !featureEnabled(child, "documents")) return form;
  return `${form}<details class="card compact-tool"><summary><span>${navIcon("document")}<strong>Intyg och underlag</strong></span><small>${documentsForChild(child.id, "medical").length || "Inga"} filer</small></summary><div class="compact-tool-body">${renderChildDocuments(child.id, "medical", "Inget intyg är inskickat.")}<form class="form-stack" data-form="child-document" data-child-id="${esc(child.id)}" data-kind="medical"><label>Lägg till intyg eller underlag<input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required></label><p class="form-hint">Filen är privat för barnets vårdnadshavare och behörig personal. Högst 10 MB.</p><button class="secondary" type="submit">Skicka in fil</button></form></div></details>`;
}

function renderChildContacts(child) {
  const contacts = contactsFor(child.id);
  return `<section id="child-contacts" class="card child-step"><p class="kicker">Steg 3 av 4</p><h2>Kontaktpersoner</h2><p class="form-hint">Ändra namn, relation, telefon, om personen får hämta och om kontakten är primär. Ta bort frågar en gång till innan kontakten försvinner. Hämtpersoner, hämtpass och veckoschema finns under Schema.</p><button class="secondary" type="button" data-action="navigate" data-view="pickup">Öppna Schema</button>
      ${renderPickupContactPhotos(child)}
      <div class="contact-editors">${contacts.map((contact) => renderContactEditor(child, contact)).join("")}${renderContactEditor(child)}</div>
    </section>`;
}

function renderChildConsents(child) {
  return `<section id="child-consents" class="card child-step"><p class="kicker">Steg 4 av 4</p><h2>Samtycken</h2><p class="form-hint">Välj ja eller nej för varje punkt. Nej tar tillbaka ett tidigare ja. Du kan ändra svaren när som helst.</p>${renderConsentChoices(child)}</section>`;
}

function renderChildBox(child) {
  if (!state.childBoxReady) {
    return `<section class="card" id="child-box"><h2>Barnets låda</h2><p class="form-hint">Barnets låda är inte aktiverad i databasen ännu.</p></section>`;
  }
  const saved = new Map(childBoxFor(child.id).map((item) => [item.item_type, item]));
  const rows = CHILD_BOX_ITEMS.map(([type, label]) => {
    const item = saved.get(type);
    const choices = CHILD_BOX_LEVELS.map(([level, text]) => `<label><input type="radio" name="box_${esc(type)}" value="${esc(level)}" ${item?.level === level ? "checked" : ""} required><span>${esc(text)}</span></label>`).join("");
    const updated = item?.updated_at ? `Senast uppdaterad ${formatTimestamp(item.updated_at)}` : "Inte uppdaterad";
    return `<fieldset class="child-box-item"><legend>${esc(label)}</legend><div class="child-box-levels">${choices}</div><p class="form-hint">${esc(updated)}</p></fieldset>`;
  }).join("");
  return `<form id="child-box" class="card form-stack" data-form="child-box" data-child-id="${esc(child.id)}"><p class="kicker">Förskolan och hemmet</p><h2>Barnets låda</h2><p class="form-hint">Markera vad som är slut, vad det finns få av och vad som finns i lådan. Vårdnadshavare och personal på avdelningen ser samma status.</p><div class="child-box-grid">${rows}</div><button class="primary" type="submit">Spara lådan</button></form>`;
}

function childBoxStatus() {
  if (!state.childBoxReady) return "Inte aktiverad";
  const child = selectedChild();
  if (!child) return "Inte uppdaterad";
  const rows = childBoxFor(child.id);
  const refill = childBoxNeedsRefill(child.id);
  if (refill.length) return refill.length === 1 ? "1 sak behöver fyllas på" : `${refill.length} saker behöver fyllas på`;
  if (rows.length === CHILD_BOX_ITEMS.length) return "Allt finns";
  return rows.length ? `${rows.length} av ${CHILD_BOX_ITEMS.length} uppdaterade` : "Inte uppdaterad";
}

function childBasicsStatus() {
  const child = selectedChild();
  return child?.birth_date ? "Födelsedatum ifyllt" : "Saknar födelsedatum";
}

function childHealthStatus() {
  const child = selectedChild();
  return child && state.health.some((health) => health.child_id === child.id && health.updated_at) ? "Genomgången" : "Inte genomgången";
}

function childContactsStatus() {
  const child = selectedChild();
  const count = child ? contactsFor(child.id).length : 0;
  if (!count) return "Ingen sparad";
  return count === 1 ? "1 sparad" : `${count} sparade`;
}

function childConsentsStatus() {
  const child = selectedChild();
  const count = child ? CONSENT_OPTIONS.filter(([type]) => consentRecorded(child.id, type) && consentFor(child.id, type)).length : 0;
  if (!count) return "Inga godkända";
  return count === 1 ? "1 godkänd" : `${count} godkända`;
}

function childSiblingStatus() {
  const count = state.siblingRequests.filter((request) => request.status === "pending").length;
  if (!count) return "Be om koppling";
  return count === 1 ? "1 väntande" : `${count} väntande`;
}

function childPickupStatus() {
  const child = selectedChild();
  if (!state.pickupReady) return "Inte aktiverad";
  if (!child) return "Ingen på listan";
  const contacts = state.pickupContacts.filter((contact) => contact.child_id === child.id).length;
  const passes = state.pickupPasses.filter((pass) => pass.child_id === child.id && (pass.pass_status === "active" || pass.pass_status === "scheduled")).length;
  const permanent = permanentPassesForChild(child.id).filter((pass) => pass.pass_status === "active").length;
  if (!contacts && !passes && !permanent) return "Ingen på listan";
  const parts = [];
  if (contacts) parts.push(contacts === 1 ? "1 person" : `${contacts} personer`);
  if (passes) parts.push(passes === 1 ? "1 pass" : `${passes} pass`);
  if (permanent) parts.push(permanent === 1 ? "1 permanent" : `${permanent} permanenta`);
  return parts.join(" · ");
}

function childPhotoStatus() {
  if (!state.classListReady) return "Inte aktiverad";
  return selectedChild()?.photo_path ? "Bild sparad" : "Ingen bild";
}

function childClassListStatus() {
  const child = selectedChild();
  if (!state.classListReady) return "Inte aktiverad";
  if (!child) return "Inte besvarat";
  const mine = classListRowsFor(child.id).find((row) => row.is_self);
  if (!mine || (mine.show_name == null && mine.show_photo == null)) return "Inte besvarat";
  const name = mine.show_name === true ? "Namn ja" : mine.show_name === false ? "Namn nej" : "Namn obesvarat";
  const photo = mine.show_photo === true ? "Bild ja" : mine.show_photo === false ? "Bild nej" : "Bild obesvarad";
  return `${name} · ${photo}`;
}

function calendarHubStatus() {
  if (state.calendarReady === false) return "Inte aktiverad";
  if (state.calendarToken) return "Ny länk visas";
  if (state.calendarFeed?.active) return "Länk aktiv";
  return "Ingen länk";
}

function renderChildPickupCard() {
  const child = selectedChild();
  if (!child) return "";
  return renderPickupSection(child) || `<section class="card" id="pickup-list"><h2>Hämtlista</h2><p class="form-hint">Hämtlistan är inte aktiverad i databasen ännu.</p></section>`;
}

const FAMILY_STANDING = {
  ahead: "Ligger före planeringen",
  on_track: "I fas",
  needs_support: "Behöver stöd",
};
const ASSIGNMENT_STATUS = {
  homework: "Uppgift",
  missing: "Missad uppgift",
  submitted: "Inlämnad",
  completed: "Klar",
};
const LOST_STATUS = {
  open: "Öppen",
  matched: "Hittad",
  returned: "Återlämnad",
  closed: "Avslutad",
};
const BANNER_SEVERITY = {
  info: "Information",
  important: "Viktigt",
  urgent: "Brådskande",
};

function familyFeatureNotice() {
  return state.familyFeaturesReady ? "" : `<p class="notice error">Funktionen är förberedd i appen men databasmigrering 022 är inte aktiverad ännu.</p>`;
}

function familyScopeOptions() {
  const departments = editableDepartments();
  const schoolIds = new Set(departments.map((department) => department.preschool_id));
  return [
    ...state.schools.filter((school) => schoolIds.has(school.id)).map((school) => [`school:${school.id}`, `${school.name} · hela skolan`]),
    ...departments.map((department) => [`department:${department.id}`, `${schoolName(department.preschool_id)} · ${department.name}`]),
  ];
}

function familyScope(value) {
  const [kind, id] = String(value || "").split(":");
  if (kind === "school") return { preschoolId: id, departmentId: null };
  const department = state.departments.find((item) => item.id === id);
  return { preschoolId: department?.preschool_id || null, departmentId: department?.id || null };
}

function activeSchoolBanners() {
  const now = Date.now();
  return state.schoolBanners.filter((banner) => {
    const starts = new Date(banner.starts_at).getTime();
    const ends = new Date(banner.ends_at).getTime();
    return starts <= now && ends > now;
  });
}

function renderActiveSchoolBanners() {
  const banners = activeSchoolBanners();
  if (!banners.length) return "";
  return `<section class="school-banner-stack" aria-label="Viktig information">${banners.map((banner) => `<article class="card school-banner severity-${esc(banner.severity)}" role="${banner.severity === "urgent" ? "alert" : "status"}"><p class="kicker">${esc(BANNER_SEVERITY[banner.severity] || "Information")} · ${esc(banner.department_name || banner.preschool_name || "Skolan")}</p><h2>${esc(banner.title)}</h2><p class="pre-line">${esc(banner.body)}</p><p class="meta">Visas till ${esc(formatTimestamp(banner.ends_at))}</p></article>`).join("")}</section>`;
}

function portfolioFor(childId) {
  return state.portfolioItems.filter((item) => item.child_id === childId);
}

function portfolioStatus() {
  if (!state.familyFeaturesReady) return "Inte aktiverad";
  const count = portfolioFor(selectedChild()?.id).length;
  return count ? `${count} ${count === 1 ? "minne" : "minnen"}` : "Inga minnen ännu";
}

function renderPortfolio(child) {
  if (!child) return "";
  const items = portfolioFor(child.id);
  const canManage = state.profile.role === "staff" || state.profile.role === "admin";
  const consent = consentFor(child.id, "app_images");
  const form = canManage
    ? consent
      ? `<form class="card form-stack" data-form="portfolio-upload" data-child-id="${esc(child.id)}"><p class="kicker">Nytt minne</p><h2>Lägg till i portfolio</h2><p class="form-hint">Bilden är privat för barnets vårdnadshavare och behörig personal. Samtycket ”Bilder i ärtan” är aktivt.</p><label>Bild<input type="file" name="image" accept="image/*" capture="environment" data-action="family-image" required></label><div class="family-image-preview" data-family-image-preview></div>${field("Datum", "taken_on", todayIso(), { type: "date" })}${textareaField("Bildtext", "caption", "", "Vad gjorde barnet?", true)}<button class="primary" type="submit">Lägg till</button></form>`
      : `<article class="card"><p class="notice error">Portfolio kan inte få nya bilder förrän vårdnadshavaren har godkänt ”Bilder i ärtan”.</p></article>`
    : "";
  const gallery = items.length
    ? `<div class="family-gallery">${items.map((item) => {
      const url = state.portfolioUrls[item.storage_path];
      return `<figure class="card family-photo">${url ? `<img src="${esc(url)}" alt="${esc(item.caption || `Portfolio för ${child.name}`)}" loading="lazy">` : `<div class="post-image-missing">Bilden kunde inte laddas</div>`}<figcaption><strong>${esc(item.caption || "Ett minne")}</strong><span>${esc(formatDate(item.taken_on || String(item.created_at).slice(0, 10)))}</span>${item.can_manage ? `<button class="link danger-link" type="button" data-action="delete-portfolio" data-id="${esc(item.item_id)}">Ta bort</button>` : ""}</figcaption></figure>`;
    }).join("")}</div>`
    : emptyState("Portfolio är tom", canManage ? "Lägg till det första minnet när bildsamtycke finns." : "När personalen delar ett minne visas det privat här.");
  return `${familyFeatureNotice()}${form}${gallery}`;
}

function schoolworkFor(childId) {
  return {
    progress: state.schoolProgress.filter((item) => item.child_id === childId),
    assignments: state.schoolAssignments.filter((item) => item.child_id === childId),
  };
}

function schoolworkStatus() {
  if (!state.familyFeaturesReady) return "Inte aktiverad";
  const child = selectedChild();
  const rows = schoolworkFor(child?.id);
  const attention = rows.assignments.filter((item) => item.status === "missing").length;
  if (attention) return `${attention} ${attention === 1 ? "missad uppgift" : "missade uppgifter"}`;
  const count = rows.progress.length + rows.assignments.length;
  return count ? `${count} registrerade` : "Inga uppgifter";
}

function staffOptionsForChild(child) {
  const assigned = new Set(state.staffAssignments.filter((row) => row.department_id === child.department_id).map((row) => row.staff_id));
  return state.organizationPeople
    .filter((person) => person.role === "staff" && !person.removed_at && assigned.has(person.id))
    .map((person) => [person.id, person.name]);
}

function renderTeacherCards(child, kind) {
  const rows = teachersForChild(child.id, kind);
  const label = kind === "main" ? "Huvudlärare" : "Ämneslärare";
  if (!rows.length) return emptyState(`Ingen ${label.toLocaleLowerCase("sv-SE")} registrerad`, "När skolan kopplar en lärare visas personen här.");
  return `<div class="teacher-card-grid">${rows.map((teacher) => `<article class="card teacher-card"><span class="menu-icon-badge">${navIcon(kind === "main" ? "main-teacher" : "subject-teacher")}</span><div><p class="kicker">${esc(kind === "main" ? label : teacher.subject)}</p><h3>${esc(teacher.teacher_name)}</h3></div>${teacher.can_manage ? `<button class="link danger-link" type="button" data-action="delete-child-teacher" data-child-id="${esc(child.id)}" data-staff-id="${esc(teacher.staff_profile_id)}" data-kind="${esc(kind)}" data-subject="${esc(teacher.subject || "")}">Ta bort</button>` : ""}</article>`).join("")}</div>`;
}

function renderTeacherSection(child, canManage) {
  if (!isSchoolChild(child) || !featureEnabled(child, "teachers") || !state.schoolExperienceReady) return "";
  const staffOptions = staffOptionsForChild(child);
  const forms = canManage && staffOptions.length
    ? `<details class="card compact-tool"><summary><span>${navIcon("main-teacher")}<strong>Koppla lärare</strong></span></summary><div class="compact-tool-body"><form class="form-stack" data-form="child-teacher" data-child-id="${esc(child.id)}">${selectField("Lärare", "staff_profile_id", staffOptions, staffOptions[0][0], true)}${selectField("Roll", "teacher_kind", [["main", "Huvudlärare"], ["subject", "Ämneslärare"]], "main", true)}${field("Ämne för ämneslärare", "subject", "", { maxlength: "80" })}<button class="secondary" type="submit">Koppla lärare</button></form></div></details>`
    : "";
  return `<section class="teacher-section"><div class="section-head"><div><p class="kicker">Kontaktvägar</p><h2>Lärare</h2></div></div>${forms}<h3>Huvudlärare</h3>${renderTeacherCards(child, "main")}<h3>Ämneslärare</h3>${renderTeacherCards(child, "subject")}</section>`;
}

function renderAssignmentDocuments(assignmentId) {
  const documents = state.childDocuments.filter((document) => document.assignment_id === assignmentId);
  if (!documents.length) return "";
  return `<div class="assignment-documents"><strong>Bilagor</strong>${documents.map((document) => {
    const url = state.childDocumentUrls[document.storage_path];
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${navIcon("document")}${esc(document.display_name)}</a>` : `<span>${navIcon("document")}${esc(document.display_name)}</span>`;
  }).join("")}</div>`;
}

function renderSchoolwork(child) {
  if (!child) return "";
  const { progress, assignments } = schoolworkFor(child.id);
  const canManage = state.profile.role === "staff" || state.profile.role === "admin";
  const assignmentList = assignments.length
    ? `<div class="family-list">${assignments.map((item) => `<article class="card school-assignment status-${esc(item.status)}"><p class="kicker">${esc(ASSIGNMENT_STATUS[item.status] || item.status)} · senast ${esc(formatDate(item.due_on))}</p><h3>${esc(item.subject)} · ${esc(item.title)}</h3>${item.description ? `<p class="pre-line">${esc(item.description)}</p>` : ""}${renderAssignmentDocuments(item.assignment_id)}${canManage ? `<div class="actions">${item.status !== "completed" ? `<button class="link" type="button" data-action="assignment-status" data-id="${esc(item.assignment_id)}" data-status="completed">Markera klar</button>` : ""}<button class="link danger-link" type="button" data-action="delete-assignment" data-id="${esc(item.assignment_id)}">Ta bort</button></div>` : ""}</article>`).join("")}</div>`
    : emptyState("Inga uppgifter", "När skolan registrerar uppgifter visas de här.");
  const progressList = progress.length
    ? `<div class="family-list">${progress.map((item) => `<article class="card school-progress standing-${esc(item.standing)}"><p class="kicker">${esc(item.subject)} · ${esc(item.period)}</p><h3>${esc(FAMILY_STANDING[item.standing] || item.standing)}</h3>${item.current_grade ? `<p><strong>Registrerad utvecklingsnivå:</strong> ${esc(item.current_grade)}</p>` : ""}${item.summary ? `<p class="pre-line">${esc(item.summary)}</p>` : ""}${item.next_steps ? `<p><strong>Nästa steg:</strong> ${esc(item.next_steps)}</p>` : ""}${canManage ? `<button class="link danger-link" type="button" data-action="delete-progress" data-id="${esc(item.progress_id)}">Ta bort</button>` : ""}</article>`).join("")}</div>`
    : emptyState("Ingen utveckling registrerad", "När skolan registrerar barnets utveckling visas den här.");
  const forms = canManage ? `<details class="card family-editor"><summary>Lägg till uppgift</summary><form class="form-stack" data-form="school-assignment" data-child-id="${esc(child.id)}">${field("Ämne", "subject", "", { required: true, maxlength: "80" })}${field("Rubrik", "title", "", { required: true, maxlength: "160" })}${textareaField("Beskrivning", "description")}${field("Senast", "due_on", shiftIsoDate(todayIso(), 7), { type: "date", required: true })}${selectField("Status", "status", Object.entries(ASSIGNMENT_STATUS), "homework", true)}${state.schoolExperienceReady && featureEnabled(child, "documents") ? `<label>Bilaga, valfritt<input name="document" type="file" accept=".pdf,.jpg,.jpeg,.png,.docx,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><span class="form-hint">Reseuppgift, veckoinformation eller annat underlag. Högst 10 MB.</span></label>` : ""}<button class="primary" type="submit">Spara uppgift</button></form></details>
    <details class="card family-editor"><summary>Registrera utveckling</summary><form class="form-stack" data-form="subject-progress" data-child-id="${esc(child.id)}">${field("Ämne", "subject", "", { required: true, maxlength: "80" })}${field("Period", "period", "", { required: true, maxlength: "80", placeholder: "Exempelvis VT 2027" })}${selectField("Läge", "standing", Object.entries(FAMILY_STANDING), "on_track", true)}${field("Utvecklingsnivå, valfritt", "grade", "", { maxlength: "20" })}${textareaField("Sammanfattning", "summary")}${textareaField("Nästa steg", "next_steps")}<button class="primary" type="submit">Spara utveckling</button></form></details>` : "";
  return `${familyFeatureNotice()}<article class="card"><p class="form-hint">Det här är skolans registrerade uppgifter och utvecklingsanteckningar. Ärtan skapar inga automatiska omdömen.</p></article>${renderTeacherSection(child, canManage)}${canManage && isSchoolChild(child) ? renderTimetableManager(child.department_id) : ""}${forms}<section><div class="section-head"><div><p class="kicker">Den här veckan och framåt</p><h2>Uppgifter</h2></div></div>${assignmentList}</section><section><div class="section-head"><div><p class="kicker">Ämnen</p><h2>Utveckling</h2></div></div>${progressList}</section>`;
}

function renderLostFound() {
  const departments = state.profile.role === "parent"
    ? [...new Map(state.children.map((child) => [child.department_id, [child.department_id, departmentName(child.department_id)]])).values()]
    : departmentOptions();
  const posts = state.lostFoundPosts;
  const cards = posts.map((post) => {
    const url = state.lostFoundUrls[post.storage_path];
    const next = post.kind === "lost" ? "matched" : "returned";
    const nextLabel = post.kind === "lost" ? "Saken är hittad" : "Saken är återlämnad";
    return `<article class="card lost-found-card status-${esc(post.status)}" data-lost-card data-search="${esc(`${post.title} ${post.description} ${post.department_name}`.toLocaleLowerCase("sv-SE"))}">${url ? `<img class="lost-found-image" src="${esc(url)}" alt="${esc(post.title)}" loading="lazy">` : ""}<p class="kicker">${post.kind === "lost" ? "Saknad" : "Upphittad"} · ${esc(post.department_name)} · ${esc(LOST_STATUS[post.status] || post.status)}</p><h2>${esc(post.title)}</h2><p class="pre-line">${esc(post.description)}</p><p class="meta">${esc(post.author_name)} · ${esc(formatTimestamp(post.created_at))}</p>${post.can_manage ? `<div class="actions">${post.status === "open" ? `<button class="secondary" type="button" data-action="lost-status" data-id="${esc(post.post_id)}" data-status="${next}">${nextLabel}</button>` : `<button class="link" type="button" data-action="lost-status" data-id="${esc(post.post_id)}" data-status="open">Öppna igen</button>`}<button class="link danger-link" type="button" data-action="delete-lost" data-id="${esc(post.post_id)}">Ta bort</button></div>` : ""}</article>`;
  }).join("");
  const form = departments.length ? `<form class="card form-stack" data-form="lost-found"><p class="kicker">Nytt inlägg</p><h2>Efterlys eller registrera upphittat</h2>${selectField("Typ", "kind", [["lost", "Saknad"], ["found", "Upphittad"]], "lost", true)}${selectField("Avdelning", "department_id", departments, departments[0][0], true)}${field("Rubrik", "title", "", { required: true, minlength: "2", maxlength: "120" })}${textareaField("Beskrivning", "description", "", "Färg, storlek och var saken sågs senast. Skriv inga privata kontaktuppgifter.", true)}<label>Bild, valfri<input type="file" name="image" accept="image/*" capture="environment" data-action="family-image"></label><div class="family-image-preview" data-family-image-preview></div><button class="primary" type="submit">Publicera i Borttappat</button></form>` : "";
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">För avdelningen</p><h1 class="h1">Borttappat</h1><p class="sub">Efterlys eller visa något som hittats. Inga telefonnummer eller andra kontaktuppgifter behövs.</p></section>${familyFeatureNotice()}${form}<label class="family-search">Sök i Borttappat<input type="search" data-lost-query placeholder="Till exempel blå vante"></label><p class="form-hint" data-lost-empty hidden>Ingen träff.</p><div class="family-list">${cards || emptyState("Inga inlägg", "När någon efterlyser eller hittar något visas det här.")}</div>`;
}

function groupedSchoolEvents() {
  const groups = new Map();
  state.schoolEvents.forEach((row) => {
    if (!groups.has(row.event_id)) groups.set(row.event_id, { ...row, children: [] });
    if (row.child_id) groups.get(row.event_id).children.push({ id: row.child_id, name: row.child_name, response: row.response });
  });
  return [...groups.values()].sort((left, right) => new Date(left.starts_at) - new Date(right.starts_at));
}

function renderSchoolEvents() {
  if (state.profile.role === "parent" && !featureEnabled(selectedChild(), "events")) return emptyState("Händelser används inte", "Skolan har dolt den här funktionen.");
  const groups = groupedSchoolEvents();
  const parent = state.profile.role === "parent";
  const scopeOptions = familyScopeOptions();
  const eventStart = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
  const eventEnd = new Date(eventStart.getTime() + (60 * 60 * 1000));
  const eventStartValue = dateTimeLocalValue(eventStart.toISOString());
  const eventEndValue = dateTimeLocalValue(eventEnd.toISOString());
  const form = !parent && scopeOptions.length ? `<form class="card form-stack" data-form="school-event"><p class="kicker">Ny händelse</p><h2>Verksamhetsevent</h2>${selectField("Målgrupp", "scope", scopeOptions, scopeOptions[0][0], true)}${field("Rubrik", "title", "", { required: true, maxlength: "160" })}${textareaField("Beskrivning", "body")}${field("Plats", "location", "", { maxlength: "300" })}<div class="form-grid">${field("Start", "starts_at", eventStartValue, { type: "datetime-local", required: true })}${field("Slut", "ends_at", eventEndValue, { type: "datetime-local", required: true })}</div><label class="check"><input type="checkbox" name="rsvp_enabled"> Vårdnadshavare ska svara Ja eller Nej</label>${field("Svara senast", "rsvp_due", eventStart.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }), { type: "date" })}<button class="primary" type="submit">Publicera händelse</button></form>` : "";
  const cards = groups.map((event) => {
    const open = event.rsvp_enabled && event.rsvp_due >= todayIso();
    const children = event.children.map((child) => {
      if (!parent) return `<li><strong>${esc(child.name)}</strong><span>${child.response === "yes" ? "Ja" : child.response === "no" ? "Nej" : "Ej svarat"}</span></li>`;
      return `<li><strong>${esc(child.name)}</strong><span>${child.response === "yes" ? "Svar: Ja" : child.response === "no" ? "Svar: Nej" : "Ej svarat"}</span>${open ? `<div class="actions"><button class="${child.response === "yes" ? "primary" : "secondary"}" type="button" data-action="event-rsvp" data-id="${esc(event.event_id)}" data-child-id="${esc(child.id)}" data-response="yes">Ja</button><button class="${child.response === "no" ? "primary" : "secondary"}" type="button" data-action="event-rsvp" data-id="${esc(event.event_id)}" data-child-id="${esc(child.id)}" data-response="no">Nej</button></div>` : ""}</li>`;
    }).join("");
    return `<article class="card school-event"><p class="kicker">${esc(formatTimestamp(event.starts_at))}–${esc(formatTimestamp(event.ends_at))}</p><h2>${esc(event.title)}</h2><p class="meta">${esc(event.department_name || event.preschool_name)}${event.location ? ` · ${esc(event.location)}` : ""}</p>${event.body ? `<p class="pre-line">${esc(event.body)}</p>` : ""}${event.rsvp_enabled ? `<p><strong>OSA senast ${esc(formatDate(event.rsvp_due))}</strong></p><ul class="event-rsvp-list">${children || "<li>Inga barn i målgruppen.</li>"}</ul>` : ""}${event.can_manage ? `<button class="link danger-link" type="button" data-action="delete-event" data-id="${esc(event.event_id)}">Ta bort händelse</button>` : ""}</article>`;
  }).join("");
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Kalender och OSA</p><h1 class="h1">Händelser</h1><p class="sub">Utvecklingssamtal, firanden och andra verksamhetshändelser. Påminnelser visas från en vecka före start.</p></section>${familyFeatureNotice()}${form}<div class="family-list">${cards || emptyState("Inga händelser", "När skolan publicerar en händelse visas den här.")}</div>`;
}

function renderSchoolBanners() {
  if (state.profile.role === "parent") {
    if (!featureEnabled(selectedChild(), "important")) return emptyState("Viktig information används inte", "Skolan har dolt den här funktionen.");
    return renderActiveSchoolBanners() || emptyState("Ingen viktig information", "Aktiva meddelanden visas på Min dag.");
  }
  const scopeOptions = familyScopeOptions();
  const bannerStart = new Date();
  const bannerEnd = new Date(bannerStart.getTime() + (24 * 60 * 60 * 1000));
  const form = scopeOptions.length ? `<form class="card form-stack" data-form="school-banner"><p class="kicker">Ny banner</p><h2>Viktig information</h2>${selectField("Målgrupp", "scope", scopeOptions, scopeOptions[0][0], true)}${selectField("Allvarlighetsgrad", "severity", Object.entries(BANNER_SEVERITY), "important", true)}${field("Rubrik", "title", "", { required: true, maxlength: "120" })}${textareaField("Text", "body", "", "", true)}<div class="form-grid">${field("Visas från", "starts_at", dateTimeLocalValue(bannerStart.toISOString()), { type: "datetime-local", required: true })}${field("Visas till", "ends_at", dateTimeLocalValue(bannerEnd.toISOString()), { type: "datetime-local", required: true })}</div><button class="primary" type="submit">Publicera banner</button></form>` : "";
  const list = state.schoolBanners.map((banner) => `<article class="card school-banner severity-${esc(banner.severity)}"><p class="kicker">${esc(BANNER_SEVERITY[banner.severity])} · ${esc(banner.department_name || banner.preschool_name)}</p><h2>${esc(banner.title)}</h2><p class="pre-line">${esc(banner.body)}</p><p class="meta">${esc(formatTimestamp(banner.starts_at))}–${esc(formatTimestamp(banner.ends_at))}</p>${banner.can_manage ? `<button class="link danger-link" type="button" data-action="delete-banner" data-id="${esc(banner.banner_id)}">Ta bort</button>` : ""}</article>`).join("");
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Prioriterad information</p><h1 class="h1">Banners</h1><p class="sub">Tidsstyrd information om till exempel sjukdomsläge, stängning eller viktiga händelser.</p></section>${familyFeatureNotice()}${form}<div class="family-list">${list || emptyState("Inga banners", "Publicera en tidsbegränsad banner när informationen behöver synas direkt.")}</div>`;
}
function renderChildInfo() {
  if (state.profile.role !== "parent") {
    const child = selectedChild();
    if (!child) return `${noticeHtml()}<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">Inget barn att visa</h1></section>`;
    return `${noticeHtml()}<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">${esc(child.name)}</h1><p class="sub">Vårdnadshavarna äger uppgifterna. Du kan läsa dem här.</p></section><article class="card" id="child-info-read">${renderChildFacts(child)}</article>${renderChildBox(child)}<section><div class="section-head"><div><p class="kicker">Privat</p><h2>Portfolio</h2></div></div>${renderPortfolio(child)}</section><section><div class="section-head"><div><p class="kicker">Skola</p><h2>Progression och uppgifter</h2></div></div>${renderSchoolwork(child)}</section>`;
  }
  const child = selectedChild();
  if (!child) return `${noticeHtml()}<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">Inget barn kopplat</h1><p class="sub">Personalen bjuder in dig till ett barn, eller godkänner en förfrågan innan barnet syns här.</p></section>${renderTermCalendarCard()}${renderSiblingRequestForm()}`;
  const checklist = childInfoChecklist(child);
  const completed = checklist.filter((item) => item.complete).length;
  return renderHubView({
    hub: "child",
    before: childTabs(),
    heroHtml: `<section class="hero-card"><p class="kicker">Barnuppgifter</p><h1 class="h1">${esc(child.name)}</h1><p class="sub">${completed} av ${checklist.length} steg klara</p><progress class="hub-progress" max="${checklist.length}" value="${completed}" aria-label="${completed} av ${checklist.length} steg klara"></progress></section>`,
  });
}

function renderTermCalendarCard() {
  if (state.profile?.role !== "parent") return "";
  const intro = `<p class="form-hint">Publicerade terminer och stängda dagar för de förskolor där du har ett barn. Inga uppgifter om barnet följer med.</p>`;
  const timing = `<p class="form-hint">Apple uppdaterar inom ungefär 1 timme. Google kan ta 12–24 timmar.</p>`;
  if (state.calendarReady === false) {
    return `<section class="card" id="term-calendar"><p class="kicker">Kalender</p><h2>Synka terminsschemat</h2>${intro}<p class="form-hint">Synken är inte aktiverad i databasen ännu.</p></section>`;
  }
  const token = state.calendarToken || "";
  const active = Boolean(state.calendarFeed?.active);
  if (!active) {
    return `<section class="card" id="term-calendar"><p class="kicker">Kalender</p><h2>Synka terminsschemat</h2>${intro}<p class="form-hint">Skapa en länk och lägg till den i kalendern. Länken visas bara direkt efter att den skapas.</p><div class="actions"><button class="primary" type="button" data-action="create-calendar-feed">Skapa länk</button></div>${timing}</section>`;
  }
  if (!token) {
    const since = formatTimestamp(state.calendarFeed?.created_at);
    return `<section class="card" id="term-calendar"><p class="kicker">Kalender</p><h2>Synka terminsschemat</h2>${intro}<p class="form-hint">Länk aktiv sedan ${esc(since)}. Länken kan inte visas igen. Skapa en ny länk om den ska läggas till i en kalender.</p><div class="actions"><button class="primary" type="button" data-action="rotate-calendar-feed">Skapa ny länk</button><button class="danger" type="button" data-action="revoke-calendar-feed">Stäng av</button></div>${timing}</section>`;
  }
  const httpsUrl = termFeedHttpsUrl(token);
  const webcalUrl = termFeedWebcalUrl(token);
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
  return `<section class="card" id="term-calendar"><p class="kicker">Kalender</p><h2>Synka terminsschemat</h2>${intro}<p class="form-hint">Länken visas bara den här gången. Lägg till den i kalendern nu. Vi lagrar bara en kontrollsumma, så länken kan inte visas igen.</p><code class="secret-value">${esc(httpsUrl)}</code><div class="actions"><a class="secondary button-link" href="${esc(webcalUrl)}">Lägg till i Apple/Outlook</a><a class="secondary button-link" href="${esc(googleUrl)}" target="_blank" rel="noopener">Lägg till i Google</a><button class="secondary" type="button" data-action="copy-calendar-feed">Kopiera länk</button><button class="secondary" type="button" data-action="rotate-calendar-feed">Skapa ny länk</button><button class="danger" type="button" data-action="revoke-calendar-feed">Stäng av</button></div>${timing}</section>`;
}

function teacherHubStatus(kind) {
  const rows = teachersForChild(selectedChild()?.id, kind);
  if (!rows.length) return "Inte tilldelad";
  return rows.map((teacher) => kind === "subject" ? `${teacher.subject}: ${teacher.teacher_name}` : teacher.teacher_name).join(" · ");
}

function renderTeacherUniverse(kind) {
  const child = selectedChild();
  if (!child) return "";
  const title = kind === "main" ? "Huvudlärare" : "Ämneslärare";
  return `<section><div class="section-head"><div><p class="kicker">Skolan</p><h2>${title}</h2></div></div>${renderTeacherCards(child, kind)}</section>`;
}

registerHubCard("child", { id: "uppgifter", icon: "child", title: "Grunduppgifter", status: childBasicsStatus, render: () => renderChildBasics(selectedChild()) });
registerHubCard("child", { id: "halsa", icon: "health", title: "Hälsa", status: childHealthStatus, render: () => renderChildHealth(selectedChild()) });
registerHubCard("child", { id: "ladan", icon: "box", title: "Barnets låda", status: childBoxStatus, visible: () => featureEnabled(selectedChild(), "child_box"), render: () => renderChildBox(selectedChild()) });
registerHubCard("child", { id: "kontakter", icon: "contacts", title: "Kontaktpersoner", status: childContactsStatus, render: () => renderChildContacts(selectedChild()) });
registerHubCard("child", { id: "samtycken", icon: "consent", title: "Samtycken", status: childConsentsStatus, render: () => renderChildConsents(selectedChild()) });
registerHubCard("child", { id: "portfolio", icon: "camera", title: "Portfolio", status: portfolioStatus, visible: () => featureEnabled(selectedChild(), "portfolio"), render: () => renderPortfolio(selectedChild()) });
registerHubCard("child", { id: "skola", icon: "school", title: "Skola", status: schoolworkStatus, visible: () => featureEnabled(selectedChild(), "assignments"), render: () => renderSchoolwork(selectedChild()) });
registerHubCard("child", { id: "huvudlarare", icon: "main-teacher", title: "Huvudlärare", status: () => teacherHubStatus("main"), visible: () => isSchoolChild(selectedChild()) && featureEnabled(selectedChild(), "teachers"), render: () => renderTeacherUniverse("main") });
registerHubCard("child", { id: "amneslarare", icon: "subject-teacher", title: "Ämneslärare", status: () => teacherHubStatus("subject"), visible: () => isSchoolChild(selectedChild()) && featureEnabled(selectedChild(), "teachers"), render: () => renderTeacherUniverse("subject") });
registerHubCard("child", { id: "syskon", icon: "siblings", title: "Syskon", status: childSiblingStatus, render: () => renderSiblingRequestForm(true) });
registerHubCard("child", { id: "profilbild", icon: "profile", title: "Profilbild", status: childPhotoStatus, render: () => renderChildPhoto(selectedChild()) });
registerHubCard("child", { id: "klasslista", icon: "people", title: "Klasslista", status: childClassListStatus, visible: () => featureEnabled(selectedChild(), "classlist"), render: () => renderClassListConsent(selectedChild()) });
registerHubCard("child", { id: "kalender", icon: "calendar", title: "Kalender", status: calendarHubStatus, render: () => renderTermCalendarCard() });
registerHubCard("child", { id: "information", icon: "info", title: "Information att läsa", status: incidentCopyStatus, visible: () => Boolean(state.incidentReady) && copiesForChild(selectedChild()).length > 0, render: renderChildIncidentCopies });

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
  return `<section id="private-messaging" class="community-section">
    <form class="card form-stack" data-form="private-message">
      <p class="form-hint">Privata meddelanden visas bara för avsändaren och varje enskild mottagare. Personal kan välja alla vårdnadshavare för ett barn; mottagarna ser inte varandra.</p>
      ${recipients.length ? selectField("Mottagare", "recipient_target", recipients, "", true) : `<p class="form-hint">Ingen mottagare är tillgänglig ännu.</p>`}
      ${textareaField("Meddelande", "body", "", "Skriv ett privat meddelande", true)}
      <button class="primary" type="submit" ${recipients.length ? "" : "disabled"}>Skicka privat</button>
    </form>
    ${messages.length ? `<div class="private-message-list">${messages.map((message) => {
      const recipientLabel = message.recipientNames?.join(", ") || message.recipient_name;
      return `<article class="card private-message ${message.sent ? "sent" : "received"}"><p class="kicker">${message.sent ? `Till ${esc(recipientLabel)}` : `Från ${esc(message.sender_name)}`} · ${esc(formatTimestamp(message.created_at))}</p><p>${esc(message.body)}</p>${message.sent ? "" : renderShareActions("message", message.message_id, message.sender_name)}</article>`;
    }).join("")}</div>` : emptyState("Inga privata meddelanden", "När någon skriver privat visas meddelandet här.")}</section>`;
}

function renderPlaydates() {
  if (state.profile.role !== "parent") return "";
  const enabled = state.profile.allow_playdate_requests;
  const recipients = state.communityMembers.filter((member) => member.can_playdate);
  const requests = state.playdateRequests;
  return `<section id="playdates" class="community-section">
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
  return `<section id="birthday-invitations" class="community-section">
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

function renderOfficialMessages() {
  const availableDepartments = editableDepartments();
  const canPublish = (state.profile.role === "staff" || state.profile.role === "admin") && availableDepartments.length > 0;
  return `${canPublish ? `<form id="official-post-form" class="card form-stack" data-form="post-create"><h2>Publicera officiellt inlägg</h2>
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
    <section id="official-feed" class="community-section"><div class="section-head"><div><p class="kicker">Officiellt</p><h2>Senaste från förskolan</h2></div></div>${state.posts.map(renderPost).join("") || emptyState("Inga inlägg", canPublish ? "Publicera det första inlägget ovan." : "Förskolan har inte publicerat något ännu.")}</section>`;
}

registerHubCard("messages", { id: "anslagstavla", icon: "banner", title: "Anslagstavla", status: () => state.posts.length ? `${state.posts.length} ${state.posts.length === 1 ? "inlägg" : "inlägg"}` : "Inga inlägg", render: renderOfficialMessages });
registerHubCard("messages", { id: "meddelanden", icon: "messages", title: "Meddelanden", status: () => groupedPrivateMessages().length ? `${groupedPrivateMessages().length} privata` : "Inga privata", render: renderPrivateMessaging });
registerHubCard("messages", { id: "inbjudningar", icon: "event", title: "Inbjudningar", status: () => birthdayInvitationGroups().length ? `${birthdayInvitationGroups().length} inbjudningar` : "Inga inbjudningar", visible: () => state.profile.role === "parent", render: renderBirthdayInvitations });
registerHubCard("messages", { id: "lekträffar", icon: "people", title: "Lekträffar", status: () => state.playdateRequests.length ? `${state.playdateRequests.length} förfrågningar` : "Inga förfrågningar", visible: () => state.profile.role === "parent", render: renderPlaydates });

function renderMessages() {
  return renderHubView({
    hub: "messages",
    heroHtml: `<h1 class="h1">Meddelanden</h1><p class="page-sub">Välj vad du vill öppna.</p>`,
    gridClass: "message-category-grid",
  });
}

function renderAttendance() {
  const counts = state.children.reduce((result, child) => {
    const status = attendanceState(attendanceFor(child.id));
    result[status] = (result[status] || 0) + 1;
    return result;
  }, {});
  const absentCount = (counts.absent_sick || 0) + (counts.absent_leave || 0);
  return `${noticeHtml()}<h1 class="h1">Närvaro</h1><p class="page-sub">${counts.in || 0} incheckade · ${counts.unregistered || 0} inte incheckade · ${counts.picked_up || 0} utcheckade · ${absentCount} frånvarande</p>
    ${renderScanPanel()}
    ${renderCheckoutPanel()}
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
      const pickupCaption = typeof ArtanPickup === "undefined" ? { todayText: "", weekText: "" } : ArtanPickup.staffPickupCaption((state.departmentPickup || []).filter((row) => row.child_id === child.id), todayIso());
      return `<article class="card attendance-row"><div class="attendance-child"><div class="attendance-identity">${childAvatarHtml(child.name, childPhotoUrl(child.photo_path), child.avatar_color)}<div><strong>${esc(child.name)}</strong><span>${esc(departmentName(child.department_id))}${plan ? ` · ${esc(plan)}` : ""}${pickupCaption.todayText ? ` · ${esc(pickupCaption.todayText)}` : ""}</span>${pickupCaption.weekText ? `<span class="pickup-plan-week">${esc(pickupCaption.weekText)}</span>` : ""}${attendance?.absence_note ? `<p class="absence-note">Frånvaro: ${esc(attendance.absence_note)}</p>` : ""}</div></div><span class="attendance-state ${esc(status)}">${esc(actualTime)}</span></div><div class="attendance-actions"><button class="primary attendance-primary" type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-transition="${primaryTransition}">${primaryLabel}</button>${active ? "" : `<div class="attendance-secondary" role="group" aria-label="Markera frånvaro för ${esc(child.name)}"><button type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-transition="absent_sick" aria-pressed="${status === "absent_sick"}">Sjuk</button><button type="button" data-action="staff-attendance" data-child-id="${esc(child.id)}" data-transition="absent_leave" aria-pressed="${status === "absent_leave"}">Ledig</button></div>`}</div></article>`;
    }).join("")}</div>` : emptyState("Inga barn", "Du behöver kopplas till en avdelning innan närvarolistan visas.")}
    ${state.profile.role === "staff" ? renderStaffTermSection() : ""}`;
}

function renderStaffTermSection() {
  const managedSchools = state.schools.filter((school) => canManageSchoolTerms(school.id));
  if (!managedSchools.length) return renderPublishedTermReadOnly();
  const managedIds = new Set(managedSchools.map((school) => school.id));
  const otherCards = state.schoolTerms
    .filter((term) => term.term_status === "published" && !managedIds.has(term.preschool_id))
    .map((term) => {
      const school = state.schools.find((item) => item.id === term.preschool_id);
      return `<article class="card term-card" data-term-id="${esc(term.term_id)}" data-term-status="published"><p class="kicker">${esc(school?.name || "Förskola")}</p><h3>${esc(term.term_name)}</h3><p>${esc(termDateSummary(term))}</p>${termClosureGrid(term)}</article>`;
    }).join("");
  return `<section id="term-overview" class="term-overview term-staff-manage"><div class="section-head"><div><p class="kicker">Termin</p><h2>Terminsschema</h2><p class="form-hint">Du kan skapa, ändra och publicera terminer för din skola.</p></div></div>${managedSchools.map((school) => `<div class="term-managed-school"><p class="kicker">${esc(school.name)}</p>${renderTermManager(school)}</div>`).join("")}${otherCards}</section>`;
}

function termClosureGrid(term) {
  if (typeof ArtanPickup === "undefined") return renderTermClosures(term.term_id);
  const closures = closuresForTerm(term.term_id);
  return ArtanPickup.renderTermGrid({
    today: todayIso(),
    markUnfilled: false,
    terms: [{
      starts_on: term.starts_on,
      ends_on: term.ends_on,
      closures: closures.map((closure) => closure.closure_date),
      closureReasons: Object.fromEntries(closures.map((closure) => [closure.closure_date, closure.reason])),
      standard: [],
    }],
  });
}

function renderPublishedTermReadOnly() {
  const terms = state.schoolTerms
    .filter((term) => term.term_status === "published")
    .sort((left, right) => String(right.starts_on).localeCompare(String(left.starts_on)) || left.term_name.localeCompare(right.term_name, "sv"));
  const cards = terms.map((term) => {
    const school = state.schools.find((item) => item.id === term.preschool_id);
    return `<article class="card term-card" data-term-id="${esc(term.term_id)}" data-term-status="published">
      <p class="kicker">${esc(school?.name || "Förskola")}</p>
      <h3>${esc(term.term_name)}</h3>
      <p>${esc(termDateSummary(term))}</p>
      ${termClosureGrid(term)}
    </article>`;
  }).join("");
  return `<section id="term-overview" class="term-overview"><div class="section-head"><div><p class="kicker">Termin</p><h2>Publicerad termin</h2></div></div>${cards || emptyState("Ingen publicerad termin", "När terminen publiceras visas datum, öppettider och stängningsdagar här.")}</section>`;
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
    if (!groups.has(row.staff_id)) groups.set(row.staff_id, { id: row.staff_id, name: row.staff_name, email: row.staff_email, departments: [], schools: [] });
    const group = groups.get(row.staff_id);
    if (row.department_name) group.departments.push(`${row.preschool_name} · ${row.department_name}`);
    if (row.preschool_name && !group.schools.includes(row.preschool_name)) group.schools.push(row.preschool_name);
  });
  return [...groups.values()];
}

function staffManagesTerms(staffId) {
  return state.termManagers.some((grant) => grant.staff_profile_id === staffId);
}

function termsForSchool(preschoolId) {
  return state.schoolTerms
    .filter((term) => term.preschool_id === preschoolId)
    .sort((left, right) => {
      if (left.term_status !== right.term_status) return left.term_status === "draft" ? -1 : 1;
      return String(right.starts_on).localeCompare(String(left.starts_on));
    });
}

function closureLines(termId) {
  return closuresForTerm(termId).map((closure) => `${closure.closure_date} | ${closure.reason}`).join("\n");
}

function renderManagedTerm(term) {
  const draft = term.term_status === "draft";
  const conflicts = termScheduleConflicts(term);
  const conflictList = conflicts.length
    ? `<div class="term-warning" role="status"><p>Veckoscheman som inte ryms inom öppettiderna är markerade hos vårdnadshavaren. Inget schema har tagits bort.</p><ul>${conflicts.map((item) => `<li>${esc(item.child.name)} · ${esc(scheduleConflictLabel(term, item.row))}</li>`).join("")}</ul></div>`
    : "";
  return `<article class="card term-card" data-term-id="${esc(term.term_id)}" data-term-status="${esc(term.term_status)}">
    <p class="kicker">${draft ? "Utkast" : "Publicerad"}</p>
    <h3>${esc(term.term_name)}</h3>
    <p>${esc(termDateSummary(term))}</p>
    <p class="form-hint">${draft ? "Utkast syns bara för den som får hantera terminsschemat. Övrig personal och vårdnadshavare ser terminen när den publiceras." : "Personal och vårdnadshavare ser den här terminen, inklusive senare ändringar."}</p>
    <h4>Stängningsdagar</h4>${renderTermClosures(term.term_id)}
    ${conflictList}
    <div class="actions">
      ${draft ? `<button class="primary" type="button" data-action="publish-term" data-id="${esc(term.term_id)}">Publicera termin</button>` : ""}
      <button class="secondary" type="button" data-action="edit-term" data-id="${esc(term.term_id)}" data-preschool-id="${esc(term.preschool_id)}">Redigera</button>
    </div>
  </article>`;
}

function renderTermEditor(school) {
  const editing = state.termEditor?.preschoolId === school.id
    ? state.schoolTerms.find((term) => term.term_id === state.termEditor.termId && term.preschool_id === school.id) || null
    : null;
  const published = editing?.term_status === "published";
  return `<form class="card form-stack" ${editing ? 'id="term-editor"' : ""} data-form="term-save" data-preschool-id="${esc(school.id)}" data-term-id="${editing ? esc(editing.term_id) : ""}">
    <p class="kicker">${editing ? (published ? "Publicerad termin" : "Utkast") : "Ny termin"}</p>
    <h3>${editing ? (published ? "Redigera publicerad termin" : "Redigera utkast") : "Planera och publicera"}</h3>
    <div class="assistant-form">
      <label>Berätta för Ärtan<textarea name="term_text" placeholder="Höstterminen 3 augusti–18 december, öppet 06.30–17.30. Stängt 13 september för planeringsdag och 11 november för studiedag."></textarea></label>
      <button class="secondary" type="button" data-action="parse-term">Tolka och fyll i</button>
      <p class="form-hint" data-parse-status aria-live="polite">Ärtan fyller bara i formuläret. Granska allt innan du sparar.</p>
    </div>
    ${field("Terminens namn", "term_name", editing?.term_name || "", { required: true })}
    <div class="form-grid">${field("Startdatum", "starts_on", editing?.starts_on || "", { type: "date", required: true })}${field("Slutdatum", "ends_on", editing?.ends_on || "", { type: "date", required: true })}</div>
    <div class="form-grid">${field("Öppnar vardagar", "opens_at", editing ? String(editing.opens_at).slice(0, 5) : "", { type: "time", required: true })}${field("Stänger vardagar", "closes_at", editing ? String(editing.closes_at).slice(0, 5) : "", { type: "time", required: true })}</div>
    ${textareaField("Stängningsdagar", "closures", editing ? closureLines(editing.term_id) : "", "En rad per dag: 2026-09-13 | Planeringsdag")}
    <p class="form-hint">${published ? "Ändringarna syns direkt för vårdnadshavare. Scheman som inte längre ryms markeras, de tas inte bort." : "Skapa först ett utkast. Det visas i listan ovan. Vårdnadshavare ser terminen först när du publicerar den."}</p>
    ${editing ? `<button class="secondary" type="button" data-action="cancel-term-edit">Avbryt redigering</button>` : ""}
    <button class="primary" type="submit">${editing ? "Spara ändringar" : "Skapa utkast"}</button>
  </form>`;
}

function renderTermManagerGrants() {
  if (state.profile.role !== "admin") return "";
  if (!state.termManagersReady) {
    return `<section class="card" id="term-manager-grants"><h3>Får hantera terminsschema</h3><p class="form-hint">Behörigheten att låta personal hantera terminer är inte aktiverad i databasen ännu.</p></section>`;
  }
  const groups = staffGroups();
  if (!groups.length) {
    return `<section class="card" id="term-manager-grants"><h3>Får hantera terminsschema</h3><p class="form-hint">Ingen personal är kopplad ännu. Bjud in personal under Personal, och ge sedan behörigheten här.</p></section>`;
  }
  return `<section class="card" id="term-manager-grants"><h3>Får hantera terminsschema</h3><p class="form-hint">Behörigheten gäller de skolor där personen är kopplad. Övrig personal ser bara publicerade terminer.</p><ul class="invite-list">${groups.map((person) => {
    const schoolHint = person.schools.length ? `Gäller ${person.schools.join(", ")}.` : "Personen behöver vara kopplad till en skola.";
    return `<li><div><strong>${esc(person.name)}</strong><span>${esc(person.email)}</span><label class="check term-manager-toggle"><input type="checkbox" data-action="set-term-manager" data-id="${esc(person.id)}" data-name="${esc(person.name)}" ${staffManagesTerms(person.id) ? "checked" : ""} ${person.schools.length ? "" : "disabled"}> Får hantera terminsschema</label><span class="form-hint">${esc(schoolHint)}</span></div></li>`;
  }).join("")}</ul></section>`;
}

function renderTermManager(school) {
  const terms = termsForSchool(school.id);
  const grants = state.schools[0]?.id === school.id ? renderTermManagerGrants() : "";
  return `${grants}<div class="term-admin-list">${terms.map(renderManagedTerm).join("") || emptyState("Ingen termin", "Skapa ett terminsutkast. Det visas här tills du publicerar det.")}${renderTermEditor(school)}</div>`;
}

function renderSchoolDepartmentCard(school) {
  const departments = state.departments.filter((department) => department.preschool_id === school.id);
  return `<article class="card school-department-card"><p class="kicker">Skola</p><h2>${esc(school.name)}</h2><p>${esc(compact([school.address, compact([school.postal_code, school.city]).join(" ")]).join(", ") || "Ingen adress registrerad")}</p><p class="meta">${esc(compact([school.phone, school.opening_hours]).join(" · ") || "Inga kontaktuppgifter registrerade")}</p>
    <ul class="rows">${departments.map((department) => `<li><span>${esc(department.name)}</span><span class="status">${state.children.filter((child) => child.department_id === department.id).length} barn</span></li>`).join("") || "<li><span>Inga avdelningar</span></li>"}</ul>
    <form class="form-stack school-department-form" data-form="department-create" data-preschool-id="${esc(school.id)}">${field("Ny avdelning", "department_name", "", { required: true, placeholder: "Till exempel Solen" })}<button class="secondary" type="submit">Lägg till avdelning</button></form>
    <button class="secondary" type="button" data-action="rotate-school-code" data-id="${esc(school.id)}">Skapa ny skolkod</button>
    <p class="form-hint">Skolkoden är ett reservspår för personal. Ansökan väntar tills du godkänner den och väljer avdelning.</p>
  </article>`;
}

function renderSchoolAdmin(school) {
  return `<section class="school-admin">${renderSchoolDepartmentCard(school)}${renderTermManager(school)}</section>`;
}

function renderSchoolDepartments() {
  if (!state.schools.length) return emptyState("Ingen skola skapad", "Skapa organisationens första skola under Ny skola.");
  return `${renderSchoolCodeResult()}${state.schools.map(renderSchoolDepartmentCard).join("")}`;
}

function renderSchoolTerms() {
  if (!state.schools.length) return emptyState("Ingen skola skapad", "Skapa en skola innan du lägger till terminer.");
  return state.schools.map((school) => `<section class="school-terms"><h2>${esc(school.name)}</h2>${renderTermManager(school)}</section>`).join("");
}

function renderSchoolCreateForm() {
  return `<form class="card form-stack" data-form="school-create"><h2>Skapa ny skola</h2>
      ${field("Skolans namn", "name", "", { required: true })}
      <div class="form-grid">${field("Telefon", "phone", "", { type: "tel" })}${field("Öppettider", "opening_hours", "", { placeholder: "06:30–17:30" })}</div>
      ${field("Adress", "address")}
      <div class="form-grid">${field("Postnummer", "postal_code")}${field("Ort", "city")}</div>
      ${field("Första avdelningen", "department_name", "", { required: true })}
      <button class="primary" type="submit">Skapa skola</button>
    </form>`;
}

function departmentHubStatus() {
  const count = state.departments.length;
  if (!count) return "Inga avdelningar";
  return count === 1 ? "1 avdelning" : `${count} avdelningar`;
}

function termHubStatus() {
  const published = state.schoolTerms.filter((term) => term.term_status === "published").length;
  const drafts = state.schoolTerms.filter((term) => term.term_status === "draft").length;
  if (!published && !drafts) return "Ingen termin";
  if (published && drafts) return `${published === 1 ? "1 publicerad" : `${published} publicerade`} · ${drafts === 1 ? "1 utkast" : `${drafts} utkast`}`;
  if (published) return published === 1 ? "1 publicerad" : `${published} publicerade`;
  return drafts === 1 ? "1 utkast" : `${drafts} utkast`;
}

function staffHubStatus() {
  const active = staffGroups().length;
  const pending = state.invitations.filter((invite) => invite.role === "staff" && invite.status === "pending").length;
  const joins = state.joinRequests.length;
  if (!active && !pending && !joins) return "Ingen personal";
  const parts = [active === 1 ? "1 aktiv" : `${active} aktiva`];
  if (pending) parts.push(pending === 1 ? "1 inbjudan" : `${pending} inbjudningar`);
  if (joins) parts.push(joins === 1 ? "1 ansökan" : `${joins} ansökningar`);
  return parts.join(" · ");
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
    <p class="form-hint">Behörigheten Får hantera terminsschema ställs in under Terminer.</p>
  </section>`;
}

function renderSchoolExperienceConfiguration() {
  if (!state.schoolExperienceReady) return `<article class="card"><p class="notice error">Skolans funktionsval är inte aktiverade i databasen ännu.</p></article>`;
  return `<div class="family-list">${state.schools.map((school) => {
    const experience = schoolExperienceFor(school.id);
    const choices = Object.entries(SCHOOL_FEATURE_LABELS).map(([key, label]) => `<label class="check"><input type="checkbox" name="feature_${esc(key)}" ${experience.feature_config[key] !== false ? "checked" : ""}> ${esc(label)}</label>`).join("");
    return `<form class="card form-stack school-experience-form" data-form="school-experience" data-preschool-id="${esc(school.id)}"><p class="kicker">${esc(school.name)}</p><h2>Vad ska visas?</h2>${selectField("Verksamhet", "education_stage", [["preschool", "Förskola"], ["school", "Skola"]], experience.education_stage, true)}<fieldset class="feature-choice-grid"><legend>Ikoner och rubriker</legend>${choices}</fieldset><p class="form-hint">Dolda funktioner försvinner från vårdnadshavarens första sida och menyer. Uppgifterna raderas inte.</p><button class="primary" type="submit">Spara upplägg</button></form>`;
  }).join("")}</div>`;
}

function timetableManagerDepartments(onlyDepartmentId = "") {
  const editable = editableDepartments().filter((department) => schoolExperienceFor(department.preschool_id).education_stage === "school");
  return onlyDepartmentId ? editable.filter((department) => department.id === onlyDepartmentId) : editable;
}

function renderTimetableManager(onlyDepartmentId = "") {
  if (!state.schoolExperienceReady) return "";
  const departments = timetableManagerDepartments(onlyDepartmentId);
  if (!departments.length) return "";
  const allowedIds = new Set(departments.map((department) => department.id));
  const rows = state.schoolTimetable.filter((entry) => allowedIds.has(entry.department_id));
  const staffOptions = [["", "Ingen vald"], ...state.organizationPeople.filter((person) => person.role === "staff").map((person) => [person.id, person.name])];
  const list = rows.length ? `<ul class="timetable-admin-list">${rows.map((entry) => `<li><div><strong>${esc(WEEKDAYS[Number(entry.weekday) - 1])} ${esc(entry.starts_at)}–${esc(entry.ends_at)} · ${esc(entry.subject)}</strong><span>${esc([entry.teacher_name, entry.room, departmentName(entry.department_id)].filter(Boolean).join(" · "))}</span></div>${entry.can_manage ? `<button class="link danger-link" type="button" data-action="delete-timetable-entry" data-id="${esc(entry.entry_id)}">Ta bort</button>` : ""}</li>`).join("")}</ul>` : `<p class="form-hint">Inga lektioner är publicerade ännu.</p>`;
  return `<section class="card timetable-manager"><p class="kicker">Skolans ansvar</p><h2>Lektionsschema</h2>${list}<details class="compact-tool"><summary><span>${navIcon("calendar")}<strong>Lägg till lektion</strong></span></summary><div class="compact-tool-body"><form class="form-stack" data-form="timetable-entry">${selectField("Klass", "department_id", departments.map((department) => [department.id, `${schoolName(department.preschool_id)} · ${department.name}`]), departments[0].id, true)}${selectField("Veckodag", "weekday", WEEKDAYS.map((label, index) => [String(index + 1), label]), "1", true)}<div class="form-grid">${field("Start", "starts_at", "08:00", { type: "time", required: true })}${field("Slut", "ends_at", "08:45", { type: "time", required: true })}</div>${field("Ämne", "subject", "", { required: true, maxlength: "80" })}${field("Sal, valfritt", "room", "", { maxlength: "80" })}${selectField("Lärare, valfritt", "teacher_profile_id", staffOptions, "")}<button class="primary" type="submit">Publicera lektion</button></form></div></details></section>`;
}

function schoolExperienceHubStatus() {
  if (!state.schoolExperienceReady) return "Inte aktiverat";
  const schools = state.schoolExperienceSchools.filter((school) => school.education_stage === "school").length;
  return schools ? `${schools} ${schools === 1 ? "skola" : "skolor"}` : "Förskoleläge";
}

function renderSchools() {
  if (state.profile.role !== "admin") return renderAttendance();
  return renderHubView({
    hub: "schools",
    heroHtml: `<section class="hero-card"><p class="kicker">Organisation</p><h1 class="h1">Skolor och terminer</h1><p class="sub">${esc(state.organization?.name || "")}</p></section>`,
  });
}

registerHubCard("schools", { id: "avdelningar", icon: "school", title: "Avdelningar", status: departmentHubStatus, render: renderSchoolDepartments });
registerHubCard("schools", { id: "upplagg", icon: "overview", title: "Upplägg", status: schoolExperienceHubStatus, render: renderSchoolExperienceConfiguration });
registerHubCard("schools", { id: "lektionsschema", icon: "calendar", title: "Lektionsschema", status: () => `${state.schoolTimetable.length} poster`, render: () => renderTimetableManager() || emptyState("Ingen skolverksamhet", "Välj Skola under Upplägg först.") });
registerHubCard("schools", { id: "terminer", icon: "calendar", title: "Terminer", status: termHubStatus, render: renderSchoolTerms });
registerHubCard("schools", { id: "personal", icon: "people", title: "Personal", status: staffHubStatus, render: () => `${renderInviteResult("staff")}${renderStaffAccess()}` });
registerHubCard("schools", { id: "ny-skola", icon: "school", title: "Ny skola", status: () => "Skapa en till", render: renderSchoolCreateForm });

function invitationLink(code) {
  return `${location.origin}${location.pathname}?invite=${encodeURIComponent(code)}`;
}

function renderSiblingReview(request) {
  const options = state.children
    .filter((child) => child.department_id === request.department_id)
    .map((child) => [child.id, `${child.name} · ${formatDate(child.birth_date)}`]);
  return `<form class="form-stack sibling-review" data-form="review-only" data-request-id="${esc(request.request_id)}"><p><strong>${esc(request.child_name)}</strong><span class="meta">${esc(formatDate(request.birth_date))} · ${esc(request.department_name)} · ${esc(request.guardian_name)} (${esc(request.guardian_email)})</span></p>${request.note ? `<p class="form-hint">${esc(request.note)}</p>` : ""}${options.length ? selectField("Befintligt barn på avdelningen", "existing_child_id", [["", "Skapa ett nytt barn från förfrågan"], ...options], "") : `<p class="form-hint">Inget barn med det här namnet finns i listan. Godkännande skapar ett nytt barn och kopplar vårdnadshavaren.</p>`}<div class="stack-actions"><button class="primary" type="button" data-action="review-sibling" data-decision="approve" data-id="${esc(request.request_id)}">Godkänn och koppla</button><button class="secondary" type="button" data-action="review-sibling" data-decision="reject" data-id="${esc(request.request_id)}">Avslå</button></div></form>`;
}

function renderChildCreateForm() {
  return `<form class="card form-stack" data-form="child-create"><h2>Lägg till barn</h2>
      ${departmentOptions().length ? selectField("Avdelning", "department_id", departmentOptions(), "", true) : `<p class="notice error">Skapa en skola och avdelning först.</p>`}
      <div class="form-grid">${field("Barnets namn", "name", "", { required: true })}${field("Födelsedatum", "birth_date", "", { type: "date" })}</div>
      <button class="primary" type="submit" ${departmentOptions().length ? "" : "disabled"}>Lägg till barn</button>
    </form>`;
}

function renderGuardianInviteForm() {
  return `<form class="card form-stack" data-form="invite-create"><h2>Bjud in vårdnadshavare</h2>
      <input type="hidden" name="role" value="parent">
      <p class="form-hint">Länken gäller ett barn, kan användas en gång och slutar gälla efter 14 dagar. En andra vårdnadshavare får en egen länk till samma barn. Den som redan har konto öppnar länken och får barnet på samma konto.</p>
      ${field("E-post", "email", "", { type: "email", required: true, autocomplete: "email" })}
      ${selectField("Barn", "child_id", [["", "Välj barn"], ...state.children.map((child) => [child.id, `${child.name} · ${departmentName(child.department_id)}`])], "", true)}
      ${field("Relation", "relation", "Vårdnadshavare", { placeholder: "Vårdnadshavare" })}
      <button class="primary" type="submit" ${state.children.length ? "" : "disabled"}>Skapa inbjudan</button>
    </form>`;
}

function renderPendingGuardianInvites() {
  const guardianInvites = state.invitations.filter((invite) => invite.role === "parent" && invite.status === "pending");
  return `<article class="card"><h2>Väntande vårdnadshavarinbjudningar</h2>${guardianInvites.length ? `<ul class="invite-list">${guardianInvites.map((invite) => `<li><div><strong>${esc(invite.email)}</strong><span>${esc(invite.relation || "Vårdnadshavare")} · ${esc(invitePlace(invite))} · ${esc(inviteExpiryLabel(invite))}</span></div>${renderInviteActions(invite)}</li>`).join("")}</ul>` : `<p class="form-hint">Inga väntande inbjudningar.</p>`}</article>`;
}

function renderSiblingReviews() {
  const reviews = state.siblingRequests.filter((request) => request.status === "pending");
  return `<article class="card"><h2>Syskonförfrågningar</h2><p class="form-hint">Godkänn bara när du vet att vårdnadshavaren ska kopplas till barnet. Välj ett barn som redan finns, eller låt förfrågan skapa ett nytt.</p>${reviews.length ? reviews.map(renderSiblingReview).join("") : `<p class="form-hint">Inga förfrågningar väntar.</p>`}</article>`;
}

function pickupBlockStatus() {
  const blocked = state.pickupContacts.filter((contact) => contact.blocked).length;
  if (!blocked) return "Inga spärrar";
  return blocked === 1 ? "1 spärr" : `${blocked} spärrar`;
}

function peopleCountStatus(count, empty, one, many) {
  if (!count) return empty;
  return count === 1 ? one : `${count} ${many}`;
}

function peopleDirectoryVisible(name, departmentIds, query, departmentId) {
  const haystack = String(name || "").toLocaleLowerCase("sv-SE");
  const needle = String(query || "").trim().toLocaleLowerCase("sv-SE");
  const nameMatches = !needle || haystack.includes(needle);
  const departmentMatches = !departmentId || departmentIds.includes(departmentId);
  return nameMatches && departmentMatches;
}

function childGroupStatus(childCount, missingBirthCount) {
  if (!childCount) return "Inga barn";
  const count = childCount === 1 ? "1 barn" : `${childCount} barn`;
  if (!missingBirthCount) return count;
  const missing = missingBirthCount === 1 ? "1 saknar födelsedatum" : `${missingBirthCount} saknar födelsedatum`;
  return `${count} · ${missing}`;
}

function guardianGroupStatus(guardianCount, pendingCount) {
  const linked = !guardianCount ? "Inga kopplade" : guardianCount === 1 ? "1 vårdnadshavare" : `${guardianCount} vårdnadshavare`;
  if (!pendingCount) return guardianCount ? linked : "Inga vårdnadshavare";
  const pending = pendingCount === 1 ? "1 väntande inbjudan" : `${pendingCount} väntande inbjudningar`;
  return `${linked} · ${pending}`;
}

function staffGroupStatus(adminCount, staffCount, termCount) {
  if (!adminCount && !staffCount) return "Ingen personal";
  const parts = [];
  if (adminCount) parts.push(adminCount === 1 ? "1 administratör" : `${adminCount} administratörer`);
  if (staffCount) parts.push(staffCount === 1 ? "1 personal" : `${staffCount} personal`);
  if (termCount) parts.push(termCount === 1 ? "1 terminsschema" : `${termCount} terminsschema`);
  return parts.join(" · ");
}

function childRowStatus(guardianCount, missingBirth) {
  const guardians = guardianCount === 1 ? "1 vårdnadshavare" : guardianCount ? `${guardianCount} vårdnadshavare` : "Ingen vårdnadshavare";
  return missingBirth ? `Saknar födelsedatum · ${guardians}` : guardians;
}

function compareSwedishName(left, right) {
  return String(left || "").localeCompare(String(right || ""), "sv");
}

function pendingGuardianInviteCount() {
  return state.invitations.filter((invite) => invite.role === "parent" && invite.status === "pending").length;
}

function guardiansForChild(childId) {
  return new Set(state.guardianMessageTargets.filter((target) => target.child_id === childId).map((target) => target.guardian_id)).size;
}

function childDirectoryRows() {
  return state.children.map((child) => ({
    section: `barn-${child.id}`,
    name: child.name || "Namn saknas",
    departmentIds: child.department_id ? [child.department_id] : [],
    departmentNames: child.department_id ? [departmentName(child.department_id)] : [],
    departmentLabel: departmentName(child.department_id),
    status: childRowStatus(guardiansForChild(child.id), !child.birth_date),
    avatar: childAvatarHtml(child.name, childPhotoUrl(child.photo_path), child.avatar_color),
  })).sort((left, right) => compareSwedishName(left.name, right.name));
}

function guardianDirectoryRows() {
  const byId = new Map();
  state.guardianMessageTargets.forEach((target) => {
    if (!byId.has(target.guardian_id)) {
      byId.set(target.guardian_id, {
        id: target.guardian_id,
        name: target.guardian_name || "Namn saknas",
        relation: target.guardian_relation || "Vårdnadshavare",
        children: [],
        departmentIds: [],
        departments: [],
      });
    }
    const person = byId.get(target.guardian_id);
    if (!person.children.some((child) => child.id === target.child_id)) {
      const child = state.children.find((item) => item.id === target.child_id);
      person.children.push({ id: target.child_id, name: target.child_name || child?.name || "Barn" });
      if (child?.department_id && !person.departmentIds.includes(child.department_id)) {
        person.departmentIds.push(child.department_id);
        person.departments.push(departmentName(child.department_id));
      }
    }
  });
  return [...byId.values()].sort((left, right) => compareSwedishName(left.name, right.name)).map((person) => {
    const names = [...person.children].sort((left, right) => compareSwedishName(left.name, right.name)).map((child) => child.name);
    return {
      section: `vardnad-${person.id}`,
      name: person.name,
      departmentIds: person.departmentIds,
      departmentNames: person.departments,
      departmentLabel: person.departments.join(", ") || "Ingen avdelning",
      status: names.length ? names.join(", ") : "Inget barn kopplat",
      avatar: childAvatarHtml(person.name, ""),
      person,
    };
  });
}

function staffDirectoryRows() {
  if (state.profile.role !== "admin") return [];
  const byId = new Map();
  (state.organizationPeople || []).forEach((person) => {
    if (person.removed_at) return;
    if (person.role !== "admin" && person.role !== "staff") return;
    byId.set(person.id, {
      id: person.id,
      name: person.name || "Namn saknas",
      email: person.email || "",
      role: person.role,
      departmentIds: [],
      departments: [],
      termManager: person.role === "staff" && staffManagesTerms(person.id),
    });
  });
  if (!byId.size) {
    staffGroups().forEach((person) => {
      byId.set(person.id, {
        id: person.id,
        name: person.name || "Namn saknas",
        email: person.email || "",
        role: "staff",
        departmentIds: [],
        departments: [],
        termManager: staffManagesTerms(person.id),
      });
    });
  }
  state.staffMembers.forEach((row) => {
    const person = byId.get(row.staff_id);
    if (!person || !row.department_id || person.departmentIds.includes(row.department_id)) return;
    person.departmentIds.push(row.department_id);
    person.departments.push(row.department_name || departmentName(row.department_id));
  });
  return [...byId.values()].sort((left, right) => compareSwedishName(left.name, right.name)).map((person) => {
    const roleText = person.role === "admin" ? "Administratör" : "Personal";
    return {
      section: `personal-${person.id}`,
      name: person.name,
      departmentIds: person.departmentIds,
      departmentNames: person.departments,
      departmentLabel: person.departments.join(", ") || (person.role === "admin" ? "Hela organisationen" : "Ingen avdelning"),
      status: person.termManager ? `${roleText} · Terminsschema` : roleText,
      avatar: childAvatarHtml(person.name, ""),
      person,
    };
  });
}

function peopleDetailCards() {
  const cards = state.children.map((child) => ({
    id: `barn-${child.id}`,
    detail: true,
    title: child.name || "Barn",
    render: () => `<article class="card" id="child-info-read">${renderChildFacts(child)}</article>${renderChildBox(child)}<section><div class="section-head"><div><p class="kicker">Privat</p><h2>Portfolio</h2></div></div>${renderPortfolio(child)}</section><section><div class="section-head"><div><p class="kicker">Skola</p><h2>Progression och uppgifter</h2></div></div>${renderSchoolwork(child)}</section>`,
  }));
  guardianDirectoryRows().forEach((row) => {
    cards.push({
      id: row.section,
      detail: true,
      title: row.name,
      render: () => renderGuardianDetail(row.person),
    });
  });
  staffDirectoryRows().forEach((row) => {
    cards.push({
      id: row.section,
      detail: true,
      title: row.name,
      render: () => renderStaffPersonDetail(row.person),
    });
  });
  return cards;
}

function directoryDepartments(rows) {
  const names = new Map();
  rows.forEach((row) => {
    row.departmentIds.forEach((id, index) => {
      if (!names.has(id)) names.set(id, row.departmentNames?.[index] || departmentName(id));
    });
  });
  return [...names.entries()].sort((left, right) => compareSwedishName(left[1], right[1]));
}

function renderPeopleDirectory(rows, emptyText) {
  const departments = directoryDepartments(rows);
  const options = departments.map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
  const departmentFilter = departments.length
    ? `<label>Avdelning<select data-people-department><option value="">Alla avdelningar</option>${options}</select></label>`
    : "";
  const list = rows.map((row) => `<li class="people-row" data-people-row data-people-name="${esc(row.name.toLocaleLowerCase("sv-SE"))}" data-people-departments="${esc(row.departmentIds.join("|"))}"><button type="button" class="people-row-button" data-action="hub-open" data-section="${esc(row.section)}">${row.avatar}<span class="people-row-copy"><strong>${esc(row.name)}</strong><span>${esc(row.departmentLabel)}</span></span><span class="people-row-status">${esc(row.status)}</span></button></li>`).join("");
  return `<div class="people-directory"><div class="people-filters"><label>Namn<input type="search" data-people-query placeholder="Sök namn" autocomplete="off" enterkeyhint="search"></label>${departmentFilter}</div><p class="form-hint" data-people-count>${rows.length} i listan</p><p class="form-hint" data-people-empty hidden>Ingen träff.</p>${rows.length ? `<ul class="people-rows">${list}</ul>` : `<p class="form-hint">${esc(emptyText)}</p>`}</div>`;
}

function applyPeopleDirectoryFilter(root) {
  const query = root.querySelector("[data-people-query]")?.value || "";
  const departmentId = root.querySelector("[data-people-department]")?.value || "";
  const rows = [...root.querySelectorAll("[data-people-row]")];
  let shown = 0;
  rows.forEach((row) => {
    const visible = peopleDirectoryVisible(row.dataset.peopleName || "", (row.dataset.peopleDepartments || "").split("|").filter(Boolean), query, departmentId);
    row.hidden = !visible;
    if (visible) shown += 1;
  });
  const empty = root.querySelector("[data-people-empty]");
  if (empty) empty.hidden = !rows.length || shown > 0;
  const count = root.querySelector("[data-people-count]");
  if (count) count.textContent = shown === rows.length ? `${rows.length} i listan` : `${shown} av ${rows.length}`;
}

function renderGuardianDetail(person) {
  const children = [...person.children].sort((left, right) => compareSwedishName(left.name, right.name));
  const list = children.map((child) => {
    const record = state.children.find((item) => item.id === child.id);
    return `<li><button type="button" class="people-row-button" data-action="hub-open" data-section="barn-${esc(child.id)}">${childAvatarHtml(child.name, childPhotoUrl(record?.photo_path), record?.avatar_color)}<span class="people-row-copy"><strong>${esc(child.name)}</strong><span>${esc(record ? departmentName(record.department_id) : "Okänd avdelning")}</span></span></button></li>`;
  }).join("");
  return `<article class="card"><p class="kicker">${esc(person.relation || "Vårdnadshavare")}</p><h2>Kopplade barn</h2>${list ? `<ul class="people-rows">${list}</ul>` : `<p class="form-hint">Inget barn är kopplat.</p>`}</article>`;
}

function renderStaffPersonDetail(person) {
  const departments = person.departments.length ? person.departments.join(", ") : (person.role === "admin" ? "Hela organisationen" : "Ingen avdelning");
  const term = person.role === "admin"
    ? "Administratörer hanterar terminsscheman."
    : person.termManager ? "Får hantera terminsschema." : "Får inte hantera terminsschema.";
  const remove = person.role === "staff" && person.id !== state.profile.id
    ? `<button class="link danger-link" type="button" data-action="remove-staff" data-id="${esc(person.id)}" data-name="${esc(person.name)}">Ta bort åtkomst</button>`
    : "";
  return `<article class="card"><p class="kicker">${esc(person.role === "admin" ? "Administratör" : "Personal")}</p>${person.email ? `<p>${esc(person.email)}</p>` : ""}<p class="meta">${esc(departments)}</p><p class="form-hint">${esc(term)} Behörigheten ändras under Skolor och terminer.</p>${remove}</article>`;
}

function renderPeopleGroup(kind) {
  if (kind === "children") return renderPeopleDirectory(childDirectoryRows(), "Inga barn är tillagda ännu.");
  if (kind === "guardians") {
    const pending = pendingGuardianInviteCount();
    const note = pending ? `<p class="form-hint">${pending === 1 ? "1 väntande inbjudan" : `${pending} väntande inbjudningar`} finns under Väntande inbjudningar.</p>` : "";
    return `${note}${renderPeopleDirectory(guardianDirectoryRows(), "Ingen vårdnadshavare är kopplad ännu.")}`;
  }
  return renderPeopleDirectory(staffDirectoryRows(), "Ingen personal är kopplad ännu.");
}

function childPeopleStatus() {
  return childGroupStatus(state.children.length, state.children.filter((child) => !child.birth_date).length);
}

function guardianPeopleStatus() {
  return guardianGroupStatus(guardianDirectoryRows().length, pendingGuardianInviteCount());
}

function staffPeopleStatus() {
  const rows = staffDirectoryRows();
  return staffGroupStatus(
    rows.filter((row) => row.person.role === "admin").length,
    rows.filter((row) => row.person.role === "staff").length,
    rows.filter((row) => row.person.termManager).length,
  );
}

function renderPeople() {
  const staff = state.profile.role === "staff";
  const heading = staff ? "Barn" : "Personer";
  const sub = staff
    ? "Öppna Barn eller Vårdnadshavare för att söka. Lägg sedan till barn eller bjud in vårdnadshavare."
    : "Grupperna samlar barn, vårdnadshavare och personal. Öppna en grupp för att söka, och lägg sedan till barn eller bjud in vårdnadshavare.";
  return renderHubView({
    hub: "people",
    heroHtml: `<section class="hero-card"><p class="kicker">Barn och vårdnadshavare</p><h1 class="h1">${heading}</h1><p class="sub">${sub}</p></section>`,
  });
}

registerHubCard("people", { id: "barn", icon: "🌱", title: "Barn", status: childPeopleStatus, render: () => renderPeopleGroup("children") });
registerHubCard("people", { id: "vardnadshavare", icon: "☺", title: "Vårdnadshavare", status: guardianPeopleStatus, render: () => renderPeopleGroup("guardians") });
registerHubCard("people", { id: "personal", icon: "👥", title: "Personal", status: staffPeopleStatus, visible: () => state.profile.role === "admin", render: () => renderPeopleGroup("staff") });
registerHubCard("people", { id: "lagg-till", icon: "🌱", title: "Lägg till barn", status: () => peopleCountStatus(state.children.length, "Inget barn ännu", "1 barn", "barn"), render: renderChildCreateForm });
registerHubCard("people", { id: "bjud-in", icon: "✉", title: "Bjud in vårdnadshavare", status: () => "Egen länk per person", render: () => `${renderInviteResult("parent")}${renderGuardianInviteForm()}` });
registerHubCard("people", { id: "vantande", icon: "…", title: "Väntande inbjudningar", status: () => peopleCountStatus(state.invitations.filter((invite) => invite.role === "parent" && invite.status === "pending").length, "Inga väntande", "1 väntande", "väntande"), render: () => `${renderInviteResult("parent")}${renderPendingGuardianInvites()}` });
registerHubCard("people", { id: "syskon", icon: "☺", title: "Syskonförfrågningar", status: () => peopleCountStatus(state.siblingRequests.filter((request) => request.status === "pending").length, "Inga förfrågningar", "1 väntande", "väntande"), render: renderSiblingReviews });
registerHubCard("people", { id: "sparrar", icon: "⛔", title: "Får ej hämta", status: pickupBlockStatus, visible: () => state.profile.role === "admin" && state.pickupReady, render: renderPickupBlocks });
registerHubCard("people", { id: "incidentrapporter", icon: "⚑", title: "Incidentrapporter", status: incidentHubStatus, visible: () => state.profile.role === "admin" || state.profile.role === "staff", render: renderIncidentBody });

function renderOverview() {
  const pendingInvites = state.invitations.filter((invite) => invite.status === "pending").length;
  return `${noticeHtml()}<h1 class="h1">${esc(state.organization?.name || "Översikt")}</h1><p class="page-sub">${esc(roleLabel(state.profile.role))}</p><div class="menu-group" aria-label="Organisationen"><div class="menu-row"><span class="menu-row-title">Skolor</span><span class="menu-row-status">${state.schools.length}</span></div><div class="menu-row"><span class="menu-row-title">Avdelningar</span><span class="menu-row-status">${state.departments.length}</span></div><div class="menu-row"><span class="menu-row-title">Barn</span><span class="menu-row-status">${state.children.length}</span></div><div class="menu-row"><span class="menu-row-title">Väntande inbjudningar</span><span class="menu-row-status">${pendingInvites}</span></div></div>
    <article class="card"><h2>Kom igång</h2><ol class="steps"><li class="done">Organisation skapad</li><li class="${state.schools.length ? "done" : ""}">Skapa skola och avdelning</li><li class="${state.children.length ? "done" : ""}">Lägg till barn</li><li class="${state.invitations.length ? "done" : ""}">Bjud in personal och vårdnadshavare</li></ol></article>`;
}

function renderAccount() {
  const privacySettings = state.profile.role === "parent" ? `<fieldset class="preference-group"><legend>Meddelanden och integritet</legend>
      <label class="check"><input type="checkbox" name="allow_parent_messages" ${state.profile.allow_parent_messages ? "checked" : ""}> Låt andra vårdnadshavare i min avdelning hitta och skriva till mig</label>
      <p class="form-hint">Båda vårdnadshavarna måste ha aktiverat detta. Lärare och administratörer kan alltid skriva privat till dig.</p>
      <label class="check"><input type="checkbox" name="allow_playdate_requests" ${state.profile.allow_playdate_requests ? "checked" : ""}> Visa mig för frivilliga lekförfrågningar</label>
      <p class="form-hint">Båda vårdnadshavarna måste ha aktiverat detta och tillhöra samma avdelning.</p>
      <label class="check"><input type="checkbox" name="allow_birthday_invitations" ${state.profile.allow_birthday_invitations ? "checked" : ""}> Låt andra vårdnadshavare bjuda in mig till privata födelsedagskalas</label>
      <p class="form-hint">Kalasinbjudningar har ett separat frivilligt val. Båda måste ha aktiverat funktionen och tillhöra samma avdelning.</p>
    </fieldset>` : "";
  return `${noticeHtml()}<h1 class="h1">${esc(state.profile.name)}</h1><p class="page-sub">${esc(state.profile.email)} · ${esc(roleLabel(state.profile.role))}</p>
    <form class="card form-stack" data-form="profile-update"><h2>Dina uppgifter</h2>${field("Namn", "name", state.profile.name, { required: true, autocomplete: "name" })}${field("Telefon", "phone", state.profile.phone || "", { type: "tel", autocomplete: "tel" })}${privacySettings}<button class="primary" type="submit">Spara uppgifter</button></form>
    <button class="secondary" data-action="logout">Logga ut</button>`;
}

const INCIDENT_TYPES = [
  ["accident", "Olycksfall/skada"],
  ["near_miss", "Tillbud"],
  ["mistreatment", "Kränkande behandling"],
  ["other", "Övrig avvikelse"],
];
const INCIDENT_ROLES = [["affected", "Drabbad"], ["involved", "Inblandad"], ["causing", "Orsakande"]];
const INJURY_TYPES = ["Sår eller skrubbsår", "Blåmärke", "Stukning eller vrickning", "Fraktur", "Tandskada", "Huvudskada", "Bett", "Brännskada", "Annat"];
const BODY_LOCATIONS = ["Huvud", "Ansikte", "Tänder", "Hals", "Arm", "Hand", "Bröst eller mage", "Rygg", "Ben", "Fot", "Annat"];
const CARE_OPTIONS = [["none", "Ingen ytterligare vård"], ["primary_care", "Vårdcentral"], ["dentist", "Tandläkare"], ["emergency", "Akuten"]];
const ALLEGED_BY = [["child", "Barn"], ["staff", "Personal"], ["unknown", "Okänt"]];
const INCIDENT_STATUS = { draft: "Utkast", submitted: "Inskickad", investigating: "Under utredning", closed: "Avslutad" };
const INCIDENT_EVENTS = {
  created: "Skapad",
  submitted: "Inskickad",
  investigating: "Utredning",
  closed: "Avslutad",
  addendum: "Tillägg",
  investigation: "Utredningsanteckning",
  principal: "Huvudman",
  action: "Åtgärd",
  action_done: "Åtgärd klar",
  copy_sent: "Kopia skickad",
  acknowledged: "Läst",
};

function incidentTypeLabel(type) {
  return INCIDENT_TYPES.find(([value]) => value === type)?.[1] || type || "";
}

function incidentRoleLabel(role) {
  return INCIDENT_ROLES.find(([value]) => value === role)?.[1] || role || "";
}

function dateTimeLocalValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function incidentChildrenPayload(form) {
  return [...form.querySelectorAll('input[name="involved"]:checked')].map((input) => ({
    child_id: input.value,
    role: form.querySelector(`[name="role_${input.value}"]`)?.value || "affected",
  }));
}

function incidentDraftArgs(form, values) {
  return {
    target_report_id: form.dataset.reportId || null,
    incident_kind: values.incident_kind,
    target_department_id: values.department_id,
    occurred_at: new Date(values.occurred_at).toISOString(),
    place_text: values.place_text.trim(),
    happened_text: values.happened_text.trim(),
    actions_text: values.actions_text.trim(),
    present_text: values.present_text.trim(),
    contacted_text: values.contacted_text.trim(),
    injury_type: values.injury_type || null,
    body_location: values.body_location || null,
    first_aid_text: values.first_aid_text?.trim() || null,
    care_kind: values.care_kind || null,
    subjected_text: values.subjected_text?.trim() || null,
    alleged_by: values.alleged_by || null,
    experience_text: values.experience_text?.trim() || null,
    involved_children: incidentChildrenPayload(form),
  };
}

async function refreshOpenIncident() {
  await loadData();
  if (!state.incidentId) return;
  state.incidentDetail = await rpc("get_incident", { target_report_id: state.incidentId });
  if (state.incidentScreen === "form" && state.incidentDetail?.status !== "draft") state.incidentScreen = "detail";
}

async function openIncident(id) {
  const detail = await rpc("get_incident", { target_report_id: id });
  state.incidentId = id;
  state.incidentDetail = detail;
  state.incidentScreen = detail?.status === "draft" && detail?.mine ? "form" : "detail";
}

function renderIncidentChildPicker(selected) {
  if (!state.children.length) return `<p class="notice error">Inga barn är synliga att koppla till rapporten.</p>`;
  return `<fieldset class="incident-children"><legend>Barn och roll</legend>${state.children.map((child) => {
    const role = selected.get(child.id) || "affected";
    const checked = selected.has(child.id);
    return `<div class="incident-child"><label class="check"><input type="checkbox" name="involved" value="${esc(child.id)}" ${checked ? "checked" : ""}> ${esc(child.name)}</label><span>${esc(departmentName(child.department_id))}</span>${selectField("Roll", `role_${child.id}`, INCIDENT_ROLES, role, true)}</div>`;
  }).join("")}</fieldset>`;
}

function renderIncidentForm() {
  const report = state.incidentDetail || {};
  const selected = new Map((report.children || []).map((child) => [child.child_id, child.role]));
  const type = report.incident_type || "accident";
  const departments = departmentOptions();
  const departmentId = report.department_id || (departments.length === 1 ? departments[0][0] : "");
  return `<form class="card form-stack" data-form="incident-draft" data-incident-type="${esc(type)}" data-report-id="${esc(report.report_id || "")}"><p class="kicker">${report.report_id ? "Utkast" : "Ny rapport"}</p><h2>${report.report_id ? "Fortsätt utkastet" : "Ny avvikelserapport"}</h2><p class="form-hint">Utkastet syns bara för dig. När du skickar in låses texten. Senare tillägg skrivs under rapporten.</p>
    ${selectField("Typ", "incident_kind", INCIDENT_TYPES, type, true)}
    ${departments.length ? selectField("Avdelning", "department_id", departments, departmentId, true) : `<p class="notice error">Ingen avdelning är tillgänglig.</p>`}
    ${field("Datum och tid", "occurred_at", dateTimeLocalValue(report.occurred_at || new Date().toISOString()), { type: "datetime-local", required: true })}
    ${field("Plats", "place_text", report.place || "", { required: true, maxlength: "160" })}
    ${textareaField("Vad hände, sakligt", "happened_text", report.what_happened || "", "Bara det som gick att iaktta", true)}
    ${textareaField("Omedelbara åtgärder", "actions_text", report.immediate_actions || "", "", true)}
    ${textareaField("Personal närvarande och vittnen", "present_text", report.staff_present || "", "", true)}
    ${textareaField("När och hur vårdnadshavare kontaktades", "contacted_text", report.guardians_contacted || "", "Skriv också om de ännu inte är kontaktade", true)}
    <div class="incident-extra" data-incident-extra="accident"><h3>Olycksfall</h3>
      ${selectField("Typ av skada", "injury_type", [["", "Välj"], ...INJURY_TYPES.map((item) => [item, item])], report.injury_type || "")}
      ${selectField("Var på kroppen", "body_location", [["", "Välj"], ...BODY_LOCATIONS.map((item) => [item, item])], report.body_location || "")}
      ${textareaField("Första hjälpen", "first_aid_text", report.first_aid || "")}
      ${selectField("Vård efteråt", "care_kind", [["", "Välj"], ...CARE_OPTIONS], report.care || "")}
    </div>
    <div class="incident-extra" data-incident-extra="mistreatment"><h3>Kränkande behandling</h3>
      ${field("Vem utsattes", "subjected_text", report.subjected_name || "", { maxlength: "160" })}
      ${selectField("Uppges av", "alleged_by", [["", "Välj"], ...ALLEGED_BY], report.alleged_by || "")}
      ${textareaField("Barnets egen upplevelse", "experience_text", report.child_experience || "", "Lämna tomt om barnet inte berättade")}
      <p class="form-hint">När rapporten skickas in räknas tidpunkten som anmälan till rektor.</p>
    </div>
    ${renderIncidentChildPicker(selected)}
    <div class="stack-actions"><button class="secondary" type="submit" data-intent="draft">Spara utkast</button><button class="primary" type="submit" data-intent="submit">Skicka in</button></div>
  </form>`;
}

function renderIncidentFacts(detail) {
  const care = CARE_OPTIONS.find(([value]) => value === detail.care)?.[1] || "";
  const alleged = ALLEGED_BY.find(([value]) => value === detail.alleged_by)?.[1] || "";
  return `<dl class="fact-list">
    <div><dt>Typ</dt><dd>${esc(incidentTypeLabel(detail.incident_type))}</dd></div>
    <div><dt>Status</dt><dd>${esc(INCIDENT_STATUS[detail.status] || detail.status)}</dd></div>
    <div><dt>När</dt><dd>${esc(formatTimestamp(detail.occurred_at))}</dd></div>
    <div><dt>Plats</dt><dd>${esc(detail.place)}</dd></div>
    <div><dt>Avdelning</dt><dd>${esc(detail.department_name || "")}</dd></div>
    <div><dt>Författare</dt><dd>${esc(detail.author_name || "")}</dd></div>
    <div><dt>Vad hände</dt><dd class="pre-line">${esc(detail.what_happened)}</dd></div>
    <div><dt>Omedelbara åtgärder</dt><dd class="pre-line">${esc(detail.immediate_actions)}</dd></div>
    <div><dt>Personal och vittnen</dt><dd class="pre-line">${esc(detail.staff_present)}</dd></div>
    <div><dt>Vårdnadshavare kontaktades</dt><dd class="pre-line">${esc(detail.guardians_contacted)}</dd></div>
    ${detail.incident_type === "accident" ? `<div><dt>Skada</dt><dd>${esc(detail.injury_type || "")}, ${esc(detail.body_location || "")}</dd></div><div><dt>Första hjälpen</dt><dd class="pre-line">${esc(detail.first_aid || "")}</dd></div><div><dt>Vård</dt><dd>${esc(care)}</dd></div>` : ""}
    ${detail.incident_type === "mistreatment" ? `<div><dt>Vem utsattes</dt><dd>${esc(detail.subjected_name || "")}</dd></div><div><dt>Uppges av</dt><dd>${esc(alleged)}</dd></div><div><dt>Barnets upplevelse</dt><dd class="pre-line">${esc(detail.child_experience || "Inte angiven")}</dd></div>` : ""}
  </dl>
  <h3>Barn</h3><ul class="contact-list">${(detail.children || []).map((child) => `<li><div><strong>${esc(child.name)}</strong><span>${esc(incidentRoleLabel(child.role))}</span></div></li>`).join("")}</ul>`;
}

function renderIncidentDetail() {
  const detail = state.incidentDetail;
  if (!detail) return "";
  const locked = detail.status !== "draft";
  const copies = (detail.copies || []).map((copy) => {
    if (copy.sent_at) {
      return `<article class="incident-copy"><h3>${esc(copy.name)}</h3><p class="form-hint">Skickad ${esc(formatTimestamp(copy.sent_at))}. ${copy.acknowledged_count || 0} av ${copy.recipient_count || 0} har läst.</p>${copy.body ? `<p class="pre-line">${esc(copy.body)}</p>` : `<p class="form-hint">Texten till vårdnadshavarna visas för författaren och administratören.</p>`}</article>`;
    }
    if (!copy.can_send) {
      return `<article class="incident-copy"><h3>${esc(copy.name)}</h3><p class="form-hint">${detail.incident_type === "mistreatment" ? "Bara en administratör skickar vårdnadshavarkopian vid kränkning." : "Författaren eller en administratör skickar vårdnadshavarkopian."}</p></article>`;
    }
    return `<form class="form-stack incident-copy" data-form="incident-copy" data-report-id="${esc(detail.report_id)}" data-child-id="${esc(copy.child_id)}"><h3>Kopia om ${esc(copy.name)}</h3><p class="form-hint">Bara det här barnets namn ska stå med. Andra barn skrivs som ett annat barn. Texten låses när den skickas.</p><label>Text till vårdnadshavarna<textarea name="copy_body" required>${esc(copy.body || "")}</textarea></label><div class="stack-actions"><button class="secondary" type="submit" data-intent="save">Spara utkast</button><button class="primary" type="submit" data-intent="send">Skicka</button></div></form>`;
  }).join("");
  const admin = detail.admin ? `<section class="card incident-admin"><h2>För huvudmannen</h2>
    ${detail.status === "submitted" ? `<button class="primary no-print" type="button" data-action="start-incident-investigation" data-id="${esc(detail.report_id)}">Ta upp till utredning</button>` : ""}
    ${detail.reported_to_principal_at ? `<p>Anmält till huvudman ${esc(formatTimestamp(detail.reported_to_principal_at))}.</p>` : `<button class="secondary no-print" type="button" data-action="incident-principal" data-id="${esc(detail.report_id)}">Markera anmäld till huvudman</button>`}
    ${detail.investigation_notes ? `<h3>Senaste utredningsanteckning</h3><p class="pre-line">${esc(detail.investigation_notes)}</p>` : ""}
    ${detail.status === "investigating" ? `<form class="form-stack" data-form="incident-note" data-report-id="${esc(detail.report_id)}">${textareaField("Ny utredningsanteckning", "note_text", "", "", true)}<button class="secondary" type="submit">Lägg till anteckning</button></form>
      <form class="form-stack" data-form="incident-action" data-report-id="${esc(detail.report_id)}"><h3>Åtgärd</h3>${textareaField("Vad ska göras", "action_text", "", "", true)}${selectField("Ansvarig", "responsible_profile_id", [["", "Välj"], ...(detail.staff || []).map((person) => [person.profile_id, person.name])], "", true)}${field("Senast", "due_on", "", { type: "date", required: true })}<button class="secondary" type="submit">Lägg till åtgärd</button></form>
      <form class="form-stack" data-form="incident-close" data-report-id="${esc(detail.report_id)}"><h3>Avsluta</h3>${textareaField("Avslutande sammanfattning", "summary_text", "", "", true)}<button class="primary" type="submit">Avsluta rapporten</button></form>` : ""}
    ${detail.closing_summary ? `<h3>Avslutande sammanfattning</h3><p class="pre-line">${esc(detail.closing_summary)}</p>` : ""}
    ${(detail.actions || []).length ? `<h3>Åtgärder</h3><ul class="incident-log">${detail.actions.map((action) => `<li><strong>${esc(action.description)}</strong><span>${esc(action.responsible_name)} · senast ${esc(formatDate(action.due_on))}${action.done_at ? ` · klar ${esc(formatTimestamp(action.done_at))}` : ""}</span>${action.done_at || detail.status !== "investigating" ? "" : `<button class="link no-print" type="button" data-action="complete-incident-action" data-id="${esc(action.action_id)}">Markera klar</button>`}</li>`).join("")}</ul>` : ""}
  </section>` : "";
  return `<article class="card incident-sheet"><p class="kicker">${esc(incidentTypeLabel(detail.incident_type))}</p><h2>${esc(detail.place)}</h2><p class="incident-status">${esc(INCIDENT_STATUS[detail.status] || "")}</p>
    ${locked ? `<p class="form-hint">Rapporten är låst. Nya uppgifter läggs till som tillägg.</p>` : ""}
    ${renderIncidentFacts(detail)}
    ${(detail.addenda || []).length ? `<h3>Tillägg</h3><ul class="incident-log">${detail.addenda.map((item) => `<li><strong>${esc(item.author_name)}</strong><span>${esc(formatTimestamp(item.created_at))}</span><p class="pre-line">${esc(item.body)}</p></li>`).join("")}</ul>` : ""}
    ${locked ? `<form class="form-stack no-print" data-form="incident-addendum" data-report-id="${esc(detail.report_id)}">${textareaField("Tillägg", "addendum_text", "", "Något som tillkommit efter inskickningen", true)}<button class="secondary" type="submit">Lägg till</button></form>` : ""}
  </article>
  ${copies ? `<section class="card"><h2>Vårdnadshavarkopior</h2>${copies}</section>` : ""}
  ${admin}
  <section class="card"><h2>Händelselogg</h2><ul class="incident-log">${(detail.events || []).map((event) => `<li><strong>${esc(INCIDENT_EVENTS[event.event_kind] || event.event_kind)}</strong><span>${esc(formatTimestamp(event.created_at))}</span><p class="pre-line">${esc(event.detail)}</p></li>`).join("") || `<li>Ingen händelse ännu.</li>`}</ul></section>`;
}

function keepIncidentPlace() {
  if (state.view === "people" && state.hubSection === "incidentrapporter") return;
  state.view = "incidents";
  state.hubSection = "";
}

function incidentHubStatus() {
  if (!state.incidentReady) return "Inte aktiverad";
  const open = (state.incidents || []).filter((report) => report.status !== "closed").length;
  if (!open) return "Inga öppna";
  return open === 1 ? "1 öppen" : `${open} öppna`;
}

function renderIncidentBody() {
  const ready = state.incidentReady ? "" : `<p class="notice error">Avvikelserapporterna är inte aktiverade i databasen ännu.</p>`;
  if (state.incidentScreen === "form") {
    return `${ready}<button class="secondary no-print" type="button" data-action="incident-list">Tillbaka till listan</button>${state.incidentReady ? renderIncidentForm() : ""}`;
  }
  if (state.incidentScreen === "detail") {
    return `${ready}<div class="incident-head"><button class="secondary no-print" type="button" data-action="print-incident">Skriv ut</button></div><button class="secondary no-print" type="button" data-action="incident-list">Tillbaka till listan</button>${renderIncidentDetail()}`;
  }
  const notices = (state.notices || []).filter((notice) => notice.kind === "incident_submitted");
  return `${ready}
    ${renderNoticeList("Till dig", "Nya inskick", notices)}
    ${state.incidentReady ? `<button class="primary no-print" type="button" data-action="incident-new">Ny rapport</button>` : ""}
    <div class="incident-list">${(state.incidents || []).map((report) => `<button class="card incident-row" type="button" data-action="open-incident" data-id="${esc(report.report_id)}"><span class="incident-status">${esc(INCIDENT_STATUS[report.status] || "")}</span><strong>${esc(incidentTypeLabel(report.incident_type))}</strong><span>${esc(report.place)} · ${esc(report.department_name || "")}</span><small>${esc(formatTimestamp(report.occurred_at))} · ${report.child_count || 0} barn${report.mine ? " · min" : ""}</small></button>`).join("") || `<p class="form-hint">Inga rapporter är synliga för dig.</p>`}</div>`;
}

function renderIncidents() {
  const heading = state.incidentScreen === "form"
    ? (state.incidentId ? "Utkast" : "Ny rapport")
    : state.incidentScreen === "detail" ? "Rapport" : "Rapporter";
  const sub = state.incidentScreen === "list" ? `<p class="sub">Olycksfall, tillbud, kränkande behandling och övriga avvikelser. Vårdnadshavare ser inte själva rapporten.</p>` : "";
  return `${noticeHtml()}<section class="hero-card"><p class="kicker">Avvikelser</p><h1 class="h1">${heading}</h1>${sub}</section>${renderIncidentBody()}`;
}

function navIcon(name) {
  const paths = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7V20h-5.5v-5.5h-6V20H3.5z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    messages: '<path d="M20.5 12a8.5 8.5 0 0 1-12.3 7.6L3.5 21l1.4-4.4A8.5 8.5 0 1 1 20.5 12z"/>',
    more: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.2 12.2 2.4 2.4 5.2-5.4"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3.6 18.5c.8-2.8 2.7-4.2 5.4-4.2s4.6 1.4 5.4 4.2"/><circle cx="17" cy="9" r="2.1"/><path d="M16.2 14.6c1.7.3 3 1.3 3.7 3.2"/>',
    overview: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    meal: '<path d="M5 10h14M7 10c0 4 1.4 7 5 7s5-3 5-7"/><path d="M12 17v3"/>',
    child: '<circle cx="12" cy="8" r="3"/><path d="M6.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6"/>',
    health: '<path d="M12 20s-7-4.3-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.7-7 10-7 10z"/>',
    illness: '<path d="M9 4h6v5l3.5 6.2A3.2 3.2 0 0 1 15.7 20H8.3a3.2 3.2 0 0 1-2.8-4.8L9 9z"/><path d="M8 14h8"/>',
    box: '<path d="m4 8 8-4 8 4-8 4z"/><path d="M4 8v9l8 4 8-4V8M12 12v9"/>',
    contacts: '<path d="M7 3h10v18H7z"/><path d="M10 6h4M10 18h4"/>',
    consent: '<path d="M5 4h14v16H5z"/><path d="m8 12 2.5 2.5L16 9"/>',
    camera: '<path d="M4 8h4l1.5-2h5L16 8h4v11H4z"/><circle cx="12" cy="13" r="3"/>',
    school: '<path d="m3 9 9-5 9 5-9 5z"/><path d="M6 11v6h12v-6M9 14v3M15 14v3"/>',
    siblings: '<circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><path d="M3.5 19c.5-3.5 2-5 4.5-5s4 1.5 4.5 5M11.5 19c.5-3.5 2-5 4.5-5s4 1.5 4.5 5"/>',
    profile: '<circle cx="12" cy="9" r="4"/><path d="M5 21c.7-4.3 3-6.5 7-6.5s6.3 2.2 7 6.5"/>',
    calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3v5M16 3v5M4 10h16"/>',
    event: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M8 3v5M16 3v5M8 14h3M8 17h6"/>',
    banner: '<path d="M5 4v17M6 5h12l-2 4 2 4H6"/>',
    lost: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    account: '<circle cx="12" cy="8" r="3"/><path d="M5 21c.7-4.5 3-6.8 7-6.8s6.3 2.3 7 6.8"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    document: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    pass: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h6M7 14h4M17 10v4"/>',
    "main-teacher": '<circle cx="10" cy="8" r="3"/><path d="M4 20c.6-4 2.6-6 6-6s5.4 2 6 6"/><path d="m18 5 .7 1.5 1.7.2-1.2 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.2 1.7-.2z"/>',
    "subject-teacher": '<circle cx="8" cy="8" r="3"/><path d="M2.8 20c.6-4 2.3-6 5.2-6s4.6 2 5.2 6"/><path d="M15 7h6v10h-6zM18 7v10"/>',
  };
  const size = name === "chevron" ? 16 : 22;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.more}</svg>`;
}

function moreDestinations(role) {
  return ArtanMeals.buriedViews(role);
}

function renderMenuGroup(label, items) {
  return `<section class="menu-section"><h2 class="menu-label">${esc(label)}</h2><div class="menu-icon-grid">${items.map(([view, title, status, icon = "more", section = "", scrollTarget = ""]) => `<button type="button" class="menu-icon-tile" data-action="navigate" data-view="${esc(view)}" ${section ? `data-section="${esc(section)}"` : ""} ${scrollTarget ? `data-target="${esc(scrollTarget)}"` : ""}><span class="menu-icon-badge">${navIcon(icon)}</span><span class="menu-row-title">${esc(title)}</span>${status ? `<span class="menu-row-status">${esc(status)}</span>` : ""}</button>`).join("")}</div></section>`;
}

function renderMore() {
  const role = state.profile.role;
  const child = selectedChild();
  const openLost = state.lostFoundPosts.filter((post) => post.status === "open").length;
  const eventCount = groupedSchoolEvents().filter((event) => new Date(event.ends_at).getTime() >= Date.now()).length;
  const bannerCount = activeSchoolBanners().length;
  const parentChildItems = [
    ...(featureEnabled(child, "attendance") ? [["home", "Sjukanmälan", "Sjuk eller ledig", "illness", "", "daily-plan"]] : []),
    ["child", "Barnets uppgifter", child?.name || "Inget barn", "child"],
    ...(featureEnabled(child, "portfolio") ? [["child", "Portfolio", portfolioStatus(), "camera", "portfolio"]] : []),
    ...(featureEnabled(child, "assignments") ? [["child", "Uppgifter", schoolworkStatus(), "school", "skola"]] : []),
    ...(featureEnabled(child, "classlist") ? [["classlist", isSchoolChild(child) ? "Klasslista" : "Avdelningen", "", "people"]] : []),
  ];
  const parentSchoolItems = [
    ...(featureEnabled(child, "important") ? [["banners", "Viktig information", bannerCount ? String(bannerCount) : "", "banner"]] : []),
    ...(featureEnabled(child, "events") ? [["events", "Händelser och OSA", eventCount ? String(eventCount) : "", "event"]] : []),
    ["lost", "Borttappat", openLost ? String(openLost) : "", "lost"],
  ];
  const groups = role === "admin"
    ? [["Verksamheten", [["overview", "Översikt", "", "overview"], ["schools", "Skolor och förskolor", "", "school"], ["people", "Personer", "", "people"]]], ["Kommunikation", [["events", "Händelser och OSA", eventCount ? String(eventCount) : "", "event"], ["banners", "Viktig information", bannerCount ? String(bannerCount) : "", "banner"], ["lost", "Borttappat", openLost ? String(openLost) : "", "lost"], ["incidents", "Avvikelser", incidentHubStatus(), "info"]]], ["Konto", [["account", "Konto", state.profile.email, "account"]]]]
    : role === "staff"
      ? [["Arbete", [["people", "Barn", "", "child"], ["events", "Händelser och OSA", eventCount ? String(eventCount) : "", "event"], ["banners", "Viktig information", bannerCount ? String(bannerCount) : "", "banner"], ["lost", "Borttappat", openLost ? String(openLost) : "", "lost"], ["incidents", "Avvikelser", incidentHubStatus(), "info"]]], ["Konto", [["account", "Konto", state.profile.email, "account"]]]]
      : [["Barnet", parentChildItems], [isSchoolChild(child) ? "Skolan" : "Förskolan", parentSchoolItems], ["Konto", [["account", "Konto", state.profile.email, "account"]]]];
  return `${noticeHtml()}<h1 class="h1">Mer</h1><p class="sub">Välj vad du vill göra.</p>${groups.map(([label, items]) => renderMenuGroup(label, items)).join("")}<button class="link menu-logout" type="button" data-action="logout">Logga ut</button>`;
}

function renderNav() {
  const role = state.profile?.role;
  let items = ArtanMeals.tabsForRole(role);
  if (role === "parent") {
    const child = selectedChild();
    items = items
      .filter(([view]) => view !== "pickup" || featureEnabled(child, "schedule"))
      .filter(([view]) => view !== "meals" || featureEnabled(child, "meals"))
      .map(([view, icon, label]) => [view, icon, view === "pickup" ? "Schema" : label]);
  }
  const buried = new Set(moreDestinations(role));
  nav.innerHTML = items.map(([view, icon, label]) => {
    const current = state.view === view || (view === "more" && buried.has(state.view)) || (view === "home" && state.view === "meals" && role === "parent");
    return `<button data-action="navigate" data-view="${view}" aria-current="${current ? "page" : "false"}"><span class="ico">${navIcon(icon)}</span>${esc(label)}</button>`;
  }).join("");
}

function paintHeaderContext() {
  const role = state.profile?.role;
  const child = role === "parent" ? selectedChild() : null;
  accountButton.hidden = false;
  accountButton.dataset.action = "navigate";
  if (child) {
    accountButton.dataset.view = "child";
    accountButton.innerHTML = `<strong>${esc(childFirstName(child) || child.name)}</strong><small>${esc(departmentName(child.department_id))}</small>`;
    return;
  }
  accountButton.dataset.view = "more";
  const name = childFirstName({ name: state.profile?.name || "Mer" }) || "Mer";
  accountButton.innerHTML = `<strong>${esc(name)}</strong><small>${esc(roleLabel(role))}</small>`;
}

function render() {
  document.documentElement.toggleAttribute("data-busy", state.busy);
  if (passFromUrl) {
    screen.classList.add("pass-screen");
    screen.innerHTML = renderPublicPass();
    nav.innerHTML = "";
    accountButton.hidden = true;
    if (assistantRoot) assistantRoot.innerHTML = "";
    paintPassQr();
    return;
  }
  screen.classList.remove("pass-screen");
  if (!state.session) {
    screen.innerHTML = renderAuth();
    nav.innerHTML = "";
    accountButton.hidden = true;
    renderAssistant();
    return;
  }
  if (!state.profile || state.profile.removed_at) {
    accountButton.hidden = true;
    screen.innerHTML = state.profile?.removed_at ? renderRemovedAccess() : state.onboarding?.kind === "pending" ? renderPendingAccess() : renderOnboarding();
    nav.innerHTML = "";
    renderAssistant();
    return;
  }
  paintHeaderContext();
  const views = {
    home: renderParentHome,
    meals: renderMeals,
    pickup: renderPickupHub,
    more: renderMore,
    child: renderChildInfo,
    classlist: renderClassList,
    messages: renderMessages,
    attendance: renderAttendance,
    lost: renderLostFound,
    events: renderSchoolEvents,
    banners: renderSchoolBanners,
    overview: renderOverview,
    schools: renderSchools,
    people: renderPeople,
    incidents: renderIncidents,
    account: renderAccount,
  };
  const fallback = views[defaultViewForRole(state.profile.role)] || renderParentHome;
  const mealBanner = state.mealDemo ? ArtanMeals.demoBanner(formatDate(state.mealDemoToday)) : "";
  const priorityBanners = ["home", "attendance", "overview"].includes(state.view) && (state.profile.role !== "parent" || featureEnabled(selectedChild(), "important")) ? renderActiveSchoolBanners() : "";
  screen.innerHTML = mealBanner + priorityBanners + (views[state.view] || fallback)();
  renderNav();
  renderAssistant();
  prefetchGuardianAttachments();
  paintPassQr();
  restorePickupScroll();
}

async function runMutation(work, successText = "Sparat.") {
  if (state.mealDemo) {
    state.notice = { type: "success", text: "Exemplet sparar inget." };
    render();
    return;
  }
  stopPickupScanner();
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
  const absent = ["absent_sick", "absent_leave"].includes(values.status);
  if (absent && state.multiDayAbsenceReady) {
    await rpc("save_attendance_period", {
      target_child_id: childId,
      plan_status: values.status,
      plan_ends_on: values.absence_ends_on,
      plan_absence_note: state.attendanceNotesReady ? values.absence_note?.trim() || null : null,
    });
    return;
  }
  const args = {
    target_child_id: childId,
    plan_status: values.status,
    plan_dropoff_at: values.dropoff_at || null,
    plan_pickup_at: values.pickup_at || null,
    plan_pickup_by: values.pickup_by?.trim() || null,
  };
  if (state.attendanceNotesReady) args.plan_absence_note = values.absence_note?.trim() || null;
  await rpc("save_attendance_plan", args);
}

document.body.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-form]");
  if (!form) return;
  event.preventDefault();
  const values = Object.fromEntries(new FormData(form));
  const type = form.dataset.form;
  if (type === "review-only") return;
  if (type === "meal-import-review") {
    if (state.mealDemo || state.mealImport?.example) {
      state.notice = { type: "success", text: "Exemplet sparar inte de granskade rätterna." };
      render();
      return;
    }
    runMutation(() => saveMealImport(form), "De ikryssade rätterna är sparade.");
    return;
  }
  if (type === "meal-week") {
    if (state.mealDemo) saveMealDemo(form, values);
    else runMutation(() => saveMealWeek(form, values), "Veckan är sparad.");
    return;
  }
  if (type === "assistant-question") {
    const question = String(values.question || "").trim();
    if (!question) return;
    state.assistantQuestion = question;
    state.assistantResponse = assistantAnswer(assistantIntentForQuestion(question));
    renderAssistant();
    requestAnimationFrame(() => document.getElementById("assistantAnswer")?.focus());
    return;
  }
  if (type === "portfolio-upload") {
    const file = form.querySelector('input[name="image"]')?.files?.[0];
    if (!file) return;
    runMutation(async () => {
      const itemId = crypto.randomUUID();
      const path = `${form.dataset.childId}/${itemId}.jpg`;
      const { blob } = await transcodePostImage(file);
      await uploadStorageImage("portfolio-images", path, blob);
      try {
        await rpc("save_portfolio_item", {
          target_item_id: itemId,
          target_child_id: form.dataset.childId,
          object_path: path,
          item_caption: values.caption.trim(),
          item_taken_on: values.taken_on || null,
        });
      } catch (error) {
        await deleteStorageImage("portfolio-images", path);
        throw error;
      }
      if (state.familyPreviewUrl) URL.revokeObjectURL(state.familyPreviewUrl);
      state.familyPreviewUrl = "";
      await loadData();
    }, "Minnet är sparat i barnets privata portfolio.");
    return;
  }
  if (type === "lost-found") {
    const file = form.querySelector('input[name="image"]')?.files?.[0];
    runMutation(async () => {
      const postId = crypto.randomUUID();
      const path = file ? `${values.department_id}/${state.profile.id}/${postId}.jpg` : null;
      if (file) {
        const { blob } = await transcodePostImage(file);
        await uploadStorageImage("lost-found-images", path, blob);
      }
      try {
        await rpc("save_lost_found_post", {
          target_post_id: postId,
          target_department_id: values.department_id,
          post_kind: values.kind,
          post_title: values.title.trim(),
          post_description: values.description.trim(),
          object_path: path,
        });
      } catch (error) {
        if (path) await deleteStorageImage("lost-found-images", path);
        throw error;
      }
      if (state.familyPreviewUrl) URL.revokeObjectURL(state.familyPreviewUrl);
      state.familyPreviewUrl = "";
      await loadData();
    }, "Inlägget är publicerat i Borttappat.");
    return;
  }
  if (type === "school-banner") {
    const scope = familyScope(values.scope);
    runMutation(async () => {
      await rpc("save_school_banner", {
        target_banner_id: null,
        target_preschool_id: scope.preschoolId,
        target_department_id: scope.departmentId,
        banner_severity: values.severity,
        banner_title: values.title.trim(),
        banner_body: values.body.trim(),
        banner_starts_at: new Date(values.starts_at).toISOString(),
        banner_ends_at: new Date(values.ends_at).toISOString(),
      });
      await loadData();
    }, "Bannern är publicerad.");
    return;
  }
  if (type === "school-event") {
    const scope = familyScope(values.scope);
    runMutation(async () => {
      await rpc("save_school_event", {
        target_event_id: null,
        target_preschool_id: scope.preschoolId,
        target_department_id: scope.departmentId,
        event_title: values.title.trim(),
        event_body: values.body.trim() || null,
        event_location: values.location.trim() || null,
        event_starts_at: new Date(values.starts_at).toISOString(),
        event_ends_at: new Date(values.ends_at).toISOString(),
        event_rsvp_enabled: values.rsvp_enabled === "on",
        event_rsvp_due: values.rsvp_enabled === "on" ? values.rsvp_due || null : null,
      });
      await loadData();
    }, "Händelsen är publicerad.");
    return;
  }
  if (type === "school-experience") {
    runMutation(async () => {
      const features = Object.fromEntries(Object.keys(SCHOOL_FEATURE_LABELS).map((key) => [key, values[`feature_${key}`] === "on"]));
      await rpc("save_school_experience_config", {
        target_preschool_id: form.dataset.preschoolId,
        target_stage: values.education_stage,
        target_features: features,
      });
      await loadData();
    }, "Skolans upplägg är sparat.");
    return;
  }
  if (type === "timetable-entry") {
    runMutation(async () => {
      await rpc("save_school_timetable_entry", {
        target_entry_id: null,
        target_department_id: values.department_id,
        target_weekday: Number(values.weekday),
        target_starts_at: values.starts_at,
        target_ends_at: values.ends_at,
        target_subject: values.subject.trim(),
        target_room: values.room.trim() || null,
        target_teacher_profile_id: values.teacher_profile_id || null,
      });
      await loadData();
    }, "Lektionen är publicerad.");
    return;
  }
  if (type === "after-school-schedule") {
    const scheduleRows = WEEKDAYS.map((_, index) => {
      const weekday = index + 1;
      const attending = values[`attending_${weekday}`] === "on";
      return {
        weekday,
        attending,
        ends_at: attending ? values[`ends_at_${weekday}`] : null,
        note: values[`note_${weekday}`]?.trim() || null,
      };
    });
    runMutation(async () => {
      await rpc("save_after_school_schedule", { target_child_id: form.dataset.childId, schedule_rows: scheduleRows });
      await loadData();
    }, "Fritidsschemat är sparat.");
    return;
  }
  if (type === "child-teacher") {
    runMutation(async () => {
      await rpc("save_child_teacher", {
        target_child_id: form.dataset.childId,
        target_staff_profile_id: values.staff_profile_id,
        target_teacher_kind: values.teacher_kind,
        target_subject: values.teacher_kind === "subject" ? values.subject.trim() : null,
      });
      await loadData();
    }, "Läraren är kopplad till barnet.");
    return;
  }
  if (type === "child-document") {
    const file = form.querySelector('input[name="document"]')?.files?.[0];
    if (!file) return;
    runMutation(async () => {
      await uploadChildDocument(form.dataset.childId, form.dataset.kind, file);
      await loadData();
    }, "Bilagan är inskickad.");
    return;
  }

  if (type === "subject-progress") {
    runMutation(async () => {
      await rpc("save_subject_progress", {
        target_progress_id: null,
        target_child_id: form.dataset.childId,
        progress_subject: values.subject.trim(),
        progress_period: values.period.trim(),
        progress_standing: values.standing,
        progress_grade: values.grade.trim() || null,
        progress_summary: values.summary.trim() || null,
        progress_next_steps: values.next_steps.trim() || null,
      });
      await loadData();
    }, "Ämnesprogressionen är sparad.");
    return;
  }
  if (type === "school-assignment") {
    const file = form.querySelector('input[name="document"]')?.files?.[0];
    runMutation(async () => {
      const args = {
        target_assignment_id: null,
        target_child_id: form.dataset.childId,
        assignment_subject: values.subject.trim(),
        assignment_title: values.title.trim(),
        assignment_description: values.description.trim() || null,
        assignment_due_on: values.due_on,
        assignment_status: values.status,
      };
      if (!file) {
        await rpc("save_school_assignment", args);
      } else {
        const meta = validateChildDocument(file);
        const assignmentId = crypto.randomUUID();
        const documentId = crypto.randomUUID();
        const path = `${form.dataset.childId}/assignment/${documentId}.${meta.extension}`;
        await request(`/storage/v1/object/child-documents/${encodedStoragePath(path)}`, {
          method: "POST",
          headers: { "Content-Type": meta.mime, "x-upsert": "false" },
          body: file,
        });
        try {
          await rpc("save_school_assignment_with_document", {
            ...args,
            target_assignment_id: assignmentId,
            target_document_id: documentId,
            object_path: path,
            original_name: file.name,
          });
        } catch (error) {
          try { await deleteStorageImage("child-documents", path); } catch { /* RPC failed; orphan cleanup can be retried. */ }
          throw error;
        }
      }
      await loadData();
    }, file ? "Uppgiften och bilagan är sparade." : "Uppgiften är sparad.");
    return;
  }
  if (type === "incident-draft") {
    const intent = event.submitter?.dataset.intent || "draft";
    if (intent === "submit") {
      const message = values.incident_kind === "mistreatment"
        ? "Skicka in rapporten? Den låses, och tidpunkten räknas som anmälan till rektor."
        : "Skicka in rapporten? Därefter kan texten inte ändras. Tillägg skrivs under rapporten.";
      if (!window.confirm(message)) return;
    }
    runMutation(async () => {
      const saved = await rpc("save_incident_draft", incidentDraftArgs(form, values));
      const id = typeof saved === "string" ? saved : form.dataset.reportId;
      keepIncidentPlace();
      state.incidentId = id;
      if (intent === "submit") await rpc("submit_incident", { target_report_id: id });
      state.incidentScreen = intent === "submit" ? "detail" : "form";
      await refreshOpenIncident();
    }, intent === "submit" ? "Rapporten är inskickad." : "Utkastet är sparat.");
    return;
  }
  if (type === "incident-copy") {
    const intent = event.submitter?.dataset.intent || "save";
    const args = {
      target_report_id: form.dataset.reportId,
      target_child_id: form.dataset.childId,
      copy_body: values.copy_body.trim(),
    };
    runMutation(async () => {
      if (intent === "send") await rpc("send_incident_copy", args);
      else await rpc("save_incident_copy", args);
      state.incidentId = form.dataset.reportId;
      state.incidentScreen = "detail";
      await refreshOpenIncident();
    }, intent === "send" ? "Kopian är skickad till vårdnadshavarna." : "Utkastet till kopian är sparat.");
    return;
  }
  if (type === "incident-addendum") {
    runMutation(async () => {
      await rpc("add_incident_addendum", { target_report_id: form.dataset.reportId, addendum_text: values.addendum_text.trim() });
      state.incidentId = form.dataset.reportId;
      await refreshOpenIncident();
    }, "Tillägget är sparat.");
    return;
  }
  if (type === "incident-note") {
    runMutation(async () => {
      await rpc("add_incident_investigation_note", { target_report_id: form.dataset.reportId, note_text: values.note_text.trim() });
      state.incidentId = form.dataset.reportId;
      await refreshOpenIncident();
    }, "Utredningsanteckningen är sparad.");
    return;
  }
  if (type === "incident-action") {
    runMutation(async () => {
      await rpc("add_incident_action", {
        target_report_id: form.dataset.reportId,
        action_text: values.action_text.trim(),
        responsible_profile_id: values.responsible_profile_id,
        due_on: values.due_on,
      });
      state.incidentId = form.dataset.reportId;
      await refreshOpenIncident();
    }, "Åtgärden är tillagd.");
    return;
  }
  if (type === "incident-close") {
    runMutation(async () => {
      await rpc("close_incident", { target_report_id: form.dataset.reportId, summary_text: values.summary_text.trim() });
      state.incidentId = form.dataset.reportId;
      await refreshOpenIncident();
    }, "Rapporten är avslutad.");
    return;
  }
  if (type === "pickup-code") {
    stopPickupScanner();
    runMutation(async () => {
      const result = await rpc("verify_pickup_token", { presented_token: String(values.code || "").trim() });
      state.scan = { phase: "card", method: "code", result };
    }, "");
    return;
  }
  if (type === "pickup-contact") {
    runMutation(async () => {
      await rpc("save_pickup_contact", {
        target_child_id: form.dataset.childId,
        contact_name: values.name.trim(),
        contact_relation: values.relation.trim(),
        contact_phone: values.phone.trim() || null,
        target_contact_id: null,
        create_blocked: false,
      });
      await loadData();
    }, "Personen är sparad på hämtlistan.");
    return;
  }
  if (type === "pickup-standard") {
    const weekly = [];
    for (const weekday of [1, 2, 3, 4, 5]) {
      const row = form.querySelector(`[data-weekday="${weekday}"]`);
      const attending = row.querySelector("[data-schedule-attending]").checked;
      const dropoffPerson = attending ? parsePickerToken(row.querySelector(`[name="dropoff_person_${weekday}"]`).value) : null;
      const pickupPerson = attending ? parsePickerToken(row.querySelector(`[name="picker_${weekday}"]`).value) : null;
      if (attending && (!dropoffPerson || !pickupPerson)) {
        state.notice = { type: "error", text: `Välj vem som lämnar och vem som hämtar på ${WEEKDAYS[weekday - 1].toLowerCase()}.` };
        render();
        return;
      }
      weekly.push({
        weekday,
        attending,
        dropoff_at: attending ? row.querySelector(`[name="dropoff_${weekday}"]`).value : null,
        pickup_at: attending ? row.querySelector(`[name="pickup_${weekday}"]`).value : null,
        dropoff_person_kind: dropoffPerson?.picker_kind || null,
        dropoff_person_id: dropoffPerson?.picker_id || null,
        picker_kind: pickupPerson?.picker_kind || null,
        picker_id: pickupPerson?.picker_id || null,
        pass_kind: pickupPerson?.pass_kind || null,
      });
    }
    const scrollY = state.pickupEditor?.scrollY ?? window.scrollY;
    runMutation(async () => {
      await rpc("save_pickup_standard_week", { target_child_id: form.dataset.childId, weekly_schedule: weekly });
      state.pickupEditor = null;
      await loadData();
      state.pickupScrollRestore = scrollY;
    }, "Standardveckan är sparad.");
    return;
  }
  if (type === "pickup-pass") {
    runMutation(async () => {
      const created = await rpc("create_pickup_pass", {
        target_child_id: form.dataset.childId,
        pickup_date: values.pickup_date,
        window_start: values.window_start,
        window_end: values.window_end,
        person_name: values.person_name.trim(),
        person_relation: values.person_relation.trim(),
        person_phone: values.person_phone.trim() || null,
      });
      const row = { ...(Array.isArray(created) ? created[0] : created), child_id: form.dataset.childId, permanent: false, first_name: childFirstName(state.children.find((child) => child.id === form.dataset.childId)) };
      state.createdPass = row;
      state.openedPass = null;
      showPickupPlace();
      await keepPassToken(row.pass_id, "day", row.token);
      await loadData();
      const saved = state.pickupPasses.find((pass) => pass.pass_id === row.pass_id);
      if (saved && state.createdPass?.pass_id === row.pass_id) {
        state.createdPass = { ...state.createdPass, first_name: saved.child_first_name, pickup_date: saved.pickup_date };
      }
    }, "Hämtpasset är skapat.");
    return;
  }
  if (type === "permanent-pickup-pass") {
    if (!values.contact_id) {
      state.notice = { type: "error", text: "Välj en person som får hämta." };
      render();
      return;
    }
    runMutation(async () => {
      const created = await rpc("create_permanent_pickup_pass", {
        target_contact_id: values.contact_id,
        ends_on: values.ends_on || null,
        include_linked: values.include_linked === "on",
      });
      const row = { ...(Array.isArray(created) ? created[0] : created), child_id: form.dataset.childId, permanent: true, first_name: childFirstName(state.children.find((child) => child.id === form.dataset.childId)) };
      state.createdPass = row;
      state.openedPass = null;
      showPickupPlace();
      await keepPassToken(row.pass_id, "permanent", row.token);
      await loadData();
      const saved = state.permanentPasses.find((pass) => pass.pass_id === row.pass_id);
      if (saved && state.createdPass?.pass_id === row.pass_id) {
        state.createdPass = { ...state.createdPass, first_name: saved.child_names, ends_on: saved.ends_on, permanent: true };
      }
    }, "Det permanenta hämtpasset är skapat.");
    return;
  }
  if (type === "pickup-block-create") {
    if (!values.child_id) {
      state.notice = { type: "error", text: "Välj vilket barn spärren gäller." };
      render();
      return;
    }
    runMutation(async () => {
      await rpc("save_pickup_contact", {
        target_child_id: values.child_id,
        contact_name: values.name.trim(),
        contact_relation: values.relation.trim(),
        contact_phone: values.phone.trim() || null,
        target_contact_id: null,
        create_blocked: true,
      });
      await loadData();
    }, "Spärren är sparad.");
    return;
  }
  if (type === "manual-pickup") {
    const choice = pickupChoice(values.picked_up_by);
    const child = state.children.find((item) => item.id === state.checkout?.childId);
    if (!choice.kind) {
      state.notice = { type: "error", text: "Välj vem som hämtar." };
      render();
      return;
    }
    if (choice.blocked) {
      state.notice = { type: "error", text: "Personen får ej hämta." };
      render();
      return;
    }
    runMutation(async () => {
      await rpc("manual_pickup_checkout", {
        target_child_id: state.checkout.childId,
        pickup_kind: choice.kind,
        target_contact_id: choice.kind === "list" ? choice.id : null,
        target_guardian_id: choice.kind === "guardian" ? choice.id : null,
        pickup_comment: choice.kind === "other" ? String(values.comment || "").trim() : null,
      });
      state.checkout = null;
      await loadData();
    }, `${child?.name || "Barnet"} är utcheckad.`);
    return;
  }
  const editingTerm = state.schoolTerms.find((term) => term.term_id === form.dataset.termId);
  const successText = type === "login" || type === "register"
    ? ""
    : type === "birthday-create"
      ? "Kalasinbjudan är skickad privat."
      : type === "term-save"
        ? (form.dataset.termId
          ? (editingTerm?.term_status === "published"
            ? "Terminen är uppdaterad. Vårdnadshavare ser ändringen direkt. Scheman som inte ryms markeras och tas inte bort."
            : "Utkastet är uppdaterat.")
          : "Utkastet är skapat. Du hittar det i listan och kan publicera det när det är granskat.")
        : {
          "invite-create": "Inbjudan är skapad. Kopiera länken nu. Den visas inte igen.",
          "staff-invite": "Personalinbjudan är skapad. Kopiera länken nu. Den visas inte igen.",
          "sibling-request": "Förfrågan är skickad. Barnet kopplas först när personalen godkänner den.",
          "school-code-join": "Ansökan är skickad. Uppgifter visas först efter godkännande.",
          "department-create": "Avdelningen är skapad.",
          "contact-save": form.dataset.contactId ? "Kontaktpersonen är uppdaterad." : "Kontaktpersonen är tillagd.",
          "move-child": "Barnet är flyttat till den valda avdelningen.",
          "parent-attendance": ["absent_sick", "absent_leave"].includes(values.status) && values.absence_ends_on > todayIso() ? `Frånvaron är registrerad till och med ${formatDate(values.absence_ends_on)}.` : "Dagens status är sparad.",
        }[type] || "Sparat.";
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
      state.view = defaultViewForRole(state.profile.role);
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
    if (type === "term-save") {
      if (!canManageSchoolTerms(form.dataset.preschoolId)) throw new Error("Du saknar behörighet att hantera terminer.");
      await rpc("save_school_term", {
        target_term_id: form.dataset.termId || null,
        target_preschool_id: form.dataset.preschoolId,
        term_name: values.term_name.trim(),
        term_starts_on: values.starts_on,
        term_ends_on: values.ends_on,
        term_opens_at: values.opens_at,
        term_closes_at: values.closes_at,
        closures: parseClosureLines(values.closures),
      });
      state.termEditor = null;
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
    if (type === "child-profile" || type === "child-health" || type === "contact-save") {
      if (state.profile.role !== "parent") throw new Error("Bara vårdnadshavare kan ändra barnets uppgifter.");
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
      await rpc("save_child_health", {
        target_child_id: form.dataset.childId,
        allergy_list: csv(values.allergies),
        condition_list: csv(values.conditions),
        diet_text: values.diet.trim() || null,
        medication_text: values.medication.trim() || null,
        emergency_text: values.emergency.trim() || null,
      });
      await loadData();
      return;
    }
    if (type === "contact-save") {
      await rpc("save_child_contact", {
        target_child_id: form.dataset.childId,
        target_contact_id: form.dataset.contactId || null,
        contact_name: values.name.trim(),
        contact_relation: values.relation.trim(),
        contact_phone: values.phone.trim() || null,
        contact_can_pickup: values.can_pickup === "on",
        contact_is_primary: values.is_primary === "on",
      });
      await loadData();
      return;
    }
    if (type === "move-child") {
      if (state.profile.role !== "admin") throw new Error("Bara administratörer kan flytta ett barn mellan avdelningar.");
      await rpc("move_child_department", {
        target_child_id: form.dataset.childId,
        target_department_id: values.department_id,
      });
      await loadData();
      return;
    }
    if (type === "child-box") {
      const items = CHILD_BOX_ITEMS.map(([itemType]) => ({
        item_type: itemType,
        level: values[`box_${itemType}`],
      }));
      await rpc("save_child_box", {
        target_child_id: form.dataset.childId,
        items,
      });
      await loadData();
      return;
    }
    if (type === "parent-attendance") {
      const file = form.querySelector('input[name="absence_document"]')?.files?.[0];
      if (file) validateChildDocument(file);
      await saveAttendancePlan(form.dataset.childId, values);
      if (file && ["absent_sick", "absent_leave"].includes(values.status)) {
        await uploadChildDocument(form.dataset.childId, "absence", file, { relatedDate: todayIso() });
      }
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
      const term = state.schoolTerms.find((item) => item.term_id === form.dataset.termId);
      if (term && weeklySchedule.some((row) => row.attending && !timesFitTerm(term, row.dropoff_at, row.pickup_at))) {
        throw new Error("Schemat måste följa terminens öppettider och ha giltiga tider. Justera de markerade dagarna.");
      }
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
  }, successText);
});

function onPeopleDirectoryFilter(event) {
  const root = event.target.closest?.(".people-directory");
  if (!root || !event.target.matches("[data-people-query], [data-people-department]")) return;
  applyPeopleDirectoryFilter(root);
}

function onLostFoundFilter(event) {
  if (!event.target.matches?.("[data-lost-query]")) return;
  const query = event.target.value.trim().toLocaleLowerCase("sv-SE");
  const cards = [...screen.querySelectorAll("[data-lost-card]")];
  let shown = 0;
  cards.forEach((card) => {
    const visible = !query || (card.dataset.search || "").includes(query);
    card.hidden = !visible;
    if (visible) shown += 1;
  });
  const empty = screen.querySelector("[data-lost-empty]");
  if (empty) empty.hidden = shown > 0 || cards.length === 0;
}

function primeEmptyWeekTime(input) {
  if (!input?.matches?.("[data-week-time]") || input.disabled || input.value || state.pickupEditor?.mode !== "week") return;
  const field = input.dataset.weekTime === "pickup" ? "pickup" : "dropoff";
  input.value = ArtanPickup.usualWeekValue(state.pickupEditor.days, field);
  applyWeekField(input.dataset.date, field, input.value);
}

document.body.addEventListener("pointerdown", (event) => {
  primeEmptyWeekTime(event.target);
}, true);
document.body.addEventListener("focusin", (event) => {
  primeEmptyWeekTime(event.target);
});

document.body.addEventListener("input", onPeopleDirectoryFilter);
document.body.addEventListener("input", onLostFoundFilter);
document.body.addEventListener("change", onPeopleDirectoryFilter);

document.body.addEventListener("change", (event) => {
  const input = event.target;
  if (input.matches('[data-action="post-images"]')) renderSelectedPostImages(input);
  if (input.matches('[data-action="family-image"]')) renderFamilyImagePreview(input);
  if (input.matches('[data-action="child-photo"]')) {
    const file = input.files?.[0];
    const childId = input.dataset.childId;
    input.value = "";
    if (!file || state.profile.role !== "parent") return;
    runMutation(async () => {
      await saveChildPhoto(childId, file);
      await loadData();
    }, "Profilbilden är sparad.");
  }
  if (input.matches('[data-action="contact-photo"]')) {
    const file = input.files?.[0];
    const contactId = input.dataset.contactId;
    input.value = "";
    if (!file || state.profile.role !== "parent") return;
    runMutation(async () => {
      await saveContactPhoto(contactId, file);
      await loadData();
    }, "Bilden är sparad.");
  }
  if (input.name === "no_children_visible" && input.checked) {
    input.closest("fieldset")?.querySelectorAll('input[name="visible_child_ids"]').forEach((checkbox) => { checkbox.checked = false; });
  }
  if (input.name === "visible_child_ids" && input.checked) {
    const none = input.closest("fieldset")?.querySelector('input[name="no_children_visible"]');
    if (none) none.checked = false;
  }
  if (input.name === "incident_kind" && input.form?.dataset.form === "incident-draft") {
    input.form.dataset.incidentType = input.value;
  }
  if (state.pickupEditor?.mode === "week" && input.matches("[data-week-ledig]")) {
    const editor = state.pickupEditor;
    if (input.checked) {
      const day = editor.days.find((item) => item.iso === input.dataset.date);
      if (day) day.ledig = true;
    } else {
      editor.days = ArtanPickup.reopenWeekDay(editor.days, input.dataset.date, editor.viewerId);
    }
    paintWeekTimes();
  }
  if (state.pickupEditor?.mode === "week" && input.matches("[data-week-time]")) {
    const field = input.dataset.weekTime === "pickup" ? "pickup" : "dropoff";
    applyWeekField(input.dataset.date, field, input.value);
  }
  if (input.name === "status" && input.form?.dataset.form === "parent-attendance") {
    const absent = ["absent_sick", "absent_leave"].includes(input.value);
    const note = input.form.querySelector("[data-absence-note-field]");
    const presentFields = input.form.querySelector("[data-attendance-present-fields]");
    if (note) note.hidden = !absent;
    const period = input.form.querySelector("[data-absence-period-field]");
    if (period) {
      period.hidden = !absent;
      period.querySelector("input").disabled = !absent;
    }
    if (presentFields) {
      presentFields.hidden = absent;
      presentFields.querySelectorAll("input").forEach((field) => { field.disabled = absent; });
    }
    const noteTitle = input.form.querySelector("[data-absence-note-title]");
    if (noteTitle) noteTitle.textContent = input.value === "absent_leave" ? "Anledning till ledighet, valfritt" : "Anledning till sjukdom, valfritt";
    const noteInput = input.form.elements.absence_note;
    if (noteInput) noteInput.placeholder = input.value === "absent_leave" ? "Till exempel familjeledig" : "Till exempel feber eller hosta";
    const submit = input.form.querySelector("[data-attendance-submit]");
    if (submit) submit.textContent = absent ? "Spara frånvaro" : "Spara dagens status";
  }
  if (input.matches("[data-schedule-attending]")) {
    const row = input.closest("[data-weekday]");
    row.querySelectorAll('input[type="time"]').forEach((timeInput) => {
      timeInput.disabled = !input.checked;
      if (!input.checked) timeInput.value = "";
    });
  }
});

function postShareText(post) {
  const scope = post.child_id ? state.children.find((child) => child.id === post.child_id)?.name : departmentName(post.department_id);
  return ArtanShare.buildTextShare({
    title: post.title,
    kicker: `Från skolan · ${scope || "Skolan"} · ${formatTimestamp(post.created_at)}`,
    body: post.body,
  });
}

function readyAttachmentFiles(images, kind) {
  const files = [];
  for (const image of images) {
    const cached = image.signed_url ? cachedShareFile(image.image_id) : null;
    if (!cached) {
      prefetchGuardianAttachments();
      sharePending(kind);
      return null;
    }
    files.push(cached);
  }
  return files;
}

function runShareAction(kind, what, id) {
  if (state.profile?.role !== "parent") return;
  if (what === "term") {
    try {
      const built = ArtanShare.buildTermShare(termShareModel(id));
      if (kind === "print") {
        openPrint(built.print);
        return;
      }
      sharePrepared({
        title: built.title,
        text: built.text,
        files: [new File([built.ics], built.filename, { type: "text/calendar" })],
      });
    } catch (error) {
      state.notice = { type: "error", text: error.message };
      render();
    }
    return;
  }
  if (what === "post") {
    const post = state.posts.find((item) => item.id === id);
    if (!post) return;
    const textShare = postShareText(post);
    const images = postImagesFor(post.id).filter((image) => image.signed_url);
    if (kind === "print") {
      const cached = images.length ? readyAttachmentFiles(images, "print") : [];
      if (cached === null) return;
      openPrint(ArtanShare.printDocument({
        kind: "post",
        kicker: `Från skolan · ${post.child_id ? state.children.find((child) => child.id === post.child_id)?.name || "Skolan" : departmentName(post.department_id)} · ${formatTimestamp(post.created_at)}`,
        title: post.title,
        body: post.body,
        images: images.map((image, index) => ({ url: cached[index].objectUrl, alt: image.alt_text || post.title })),
      }));
      return;
    }
    if (!images.length) {
      sharePrepared({ title: textShare.title, text: textShare.text, files: [textShare.file] });
      return;
    }
    const cached = readyAttachmentFiles(images, "share");
    if (!cached) return;
    sharePrepared({ title: textShare.title, text: textShare.text, files: cached.map((entry) => entry.file) });
    return;
  }
  if (what === "attachment") {
    const image = state.postImages.find((item) => item.image_id === id);
    if (!image?.signed_url) {
      state.notice = { type: "error", text: "Filen kunde inte laddas." };
      render();
      return;
    }
    const cached = readyAttachmentFiles([image], kind);
    if (!cached) return;
    const entry = cached[0];
    if (kind === "print") {
      openPrint(ArtanShare.printDocument({
        kind: entry.type === "application/pdf" ? "pdf" : "image",
        title: entry.file.name,
        alt: image.alt_text || entry.file.name,
        url: entry.objectUrl,
      }));
      return;
    }
    sharePrepared({ title: entry.file.name, text: "", files: [entry.file] });
    return;
  }
  if (what === "message") {
    const message = state.privateMessages.find((item) => item.message_id === id && item.sender_id !== state.profile.id);
    if (!message) return;
    const textShare = ArtanShare.buildTextShare({
      title: `Meddelande från ${message.sender_name}`,
      kicker: `${formatTimestamp(message.created_at)}`,
      body: message.body,
    });
    if (kind === "print") {
      openPrint(textShare.print);
      return;
    }
    sharePrepared({ title: textShare.title, text: textShare.text, files: [textShare.file] });
  }
}

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "delete-portfolio") {
    if (!window.confirm("Ta bort minnet ur barnets portfolio? Bilden raderas permanent.")) return;
    runMutation(async () => {
      const path = await rpc("delete_portfolio_item", { target_item_id: target.dataset.id });
      await deleteStorageImage("portfolio-images", path);
      await loadData();
    }, "Minnet är borttaget.");
    return;
  }
  if (action === "lost-status") {
    runMutation(async () => {
      await rpc("set_lost_found_status", { target_post_id: target.dataset.id, next_status: target.dataset.status });
      await loadData();
    }, "Statusen är uppdaterad.");
    return;
  }
  if (action === "delete-lost") {
    if (!window.confirm("Ta bort inlägget och dess bild?")) return;
    runMutation(async () => {
      const path = await rpc("delete_lost_found_post", { target_post_id: target.dataset.id });
      await deleteStorageImage("lost-found-images", path);
      await loadData();
    }, "Inlägget är borttaget.");
    return;
  }
  if (action === "delete-banner") {
    if (!window.confirm("Ta bort bannern? Den slutar visas direkt.")) return;
    runMutation(async () => {
      await rpc("delete_school_banner", { target_banner_id: target.dataset.id });
      await loadData();
    }, "Bannern är borttagen.");
    return;
  }
  if (action === "event-rsvp") {
    runMutation(async () => {
      await rpc("respond_school_event", {
        target_event_id: target.dataset.id,
        target_child_id: target.dataset.childId,
        event_response: target.dataset.response,
      });
      await loadData();
    }, "Svaret är sparat.");
    return;
  }
  if (action === "delete-event") {
    if (!window.confirm("Ta bort händelsen och alla OSA-svar?")) return;
    runMutation(async () => {
      await rpc("delete_school_event", { target_event_id: target.dataset.id });
      await loadData();
    }, "Händelsen är borttagen.");
    return;
  }
  if (action === "delete-child-document") {
    if (!window.confirm("Ta bort bilagan permanent?")) return;
    runMutation(async () => {
      const path = await rpc("delete_child_document", { target_document_id: target.dataset.id });
      await deleteStorageImage("child-documents", path);
      await loadData();
    }, "Bilagan är borttagen.");
    return;
  }
  if (action === "delete-child-teacher") {
    if (!window.confirm("Ta bort lärarkopplingen?")) return;
    runMutation(async () => {
      await rpc("delete_child_teacher", {
        target_child_id: target.dataset.childId,
        target_staff_profile_id: target.dataset.staffId,
        target_teacher_kind: target.dataset.kind,
        target_subject: target.dataset.subject || null,
      });
      await loadData();
    }, "Lärarkopplingen är borttagen.");
    return;
  }
  if (action === "delete-timetable-entry") {
    if (!window.confirm("Ta bort lektionen från schemat?")) return;
    runMutation(async () => {
      await rpc("delete_school_timetable_entry", { target_entry_id: target.dataset.id });
      await loadData();
    }, "Lektionen är borttagen.");
    return;
  }
  if (action === "school-notice") {
    const notice = state.schoolNotices.find((item) => item.notice_id === target.dataset.id);
    if (!notice) return;
    state.selectedChildId = notice.child_id;
    runMutation(async () => {
      await rpc("mark_school_notice_read", { target_notice_id: notice.notice_id });
      await loadData();
      showView("children", { section: "skola" });
    }, "");
    return;
  }
  if (action === "delete-progress") {
    if (!window.confirm("Ta bort den registrerade ämnesprogressionen?")) return;
    runMutation(async () => {
      await rpc("delete_subject_progress", { target_progress_id: target.dataset.id });
      await loadData();
    }, "Progressionsposten är borttagen.");
    return;
  }
  if (action === "assignment-status") {
    const item = state.schoolAssignments.find((row) => row.assignment_id === target.dataset.id);
    if (!item) return;
    runMutation(async () => {
      await rpc("save_school_assignment", {
        target_assignment_id: item.assignment_id,
        target_child_id: item.child_id,
        assignment_subject: item.subject,
        assignment_title: item.title,
        assignment_description: item.description,
        assignment_due_on: item.due_on,
        assignment_status: target.dataset.status,
      });
      await loadData();
    }, "Uppgiften är uppdaterad.");
    return;
  }
  if (action === "delete-assignment") {
    if (!window.confirm("Ta bort uppgiften?")) return;
    runMutation(async () => {
      await rpc("delete_school_assignment", { target_assignment_id: target.dataset.id });
      await loadData();
    }, "Uppgiften är borttagen.");
    return;
  }
  if (/^(share|print)-(term|post|attachment|message)$/.test(action)) {
    const [kind, what] = action.split("-");
    runShareAction(kind, what, target.dataset.id);
    return;
  }
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
    const view = target.dataset.view;
    const scrollTarget = target.dataset.target || "";
    const section = view === "child" ? (HUB_SECTION_BY_TARGET[scrollTarget] || "") : "";
    showView(view, { section, scrollTarget: section ? "" : scrollTarget });
    return;
  }
  if (action === "auth-view") {
    state.authView = target.dataset.view;
    state.notice = null;
    render();
    return;
  }
  if (action === "demo-role") {
    if (!state.mealDemo) return;
    startMealDemo(new URLSearchParams({ role: target.dataset.role || "parent", day: state.mealDemoToday }));
    render();
    return;
  }
  if (action === "open-meals") {
    state.mealWeekStart = target.dataset.week || ArtanMeals.mondayOf(todayIso());
    showView("meals");
    return;
  }
  if (action === "meal-shift") {
    state.mealWeekStart = target.dataset.start || "";
    const preschoolId = mealPreschoolForView();
    if (preschoolId && state.mealsReady && !state.mealDemo) {
      runMutation(async () => {
        await ensureMealRange(preschoolId, state.mealWeekStart, ArtanMeals.addDays(state.mealWeekStart, 4));
      }, "");
      return;
    }
    render();
    return;
  }
  if (action === "meal-import-cancel" || action === "meal-import-back") {
    state.mealImportCancel = true;
    state.mealImport = null;
    state.mealTermFixture = false;
    render();
    return;
  }
  if (action === "meal-import-example" || action === "meal-import-term") {
    const term = action === "meal-import-term";
    state.mealTermFixture = term;
    const source = term ? ArtanMenu.termExampleText() : ArtanMenu.EXAMPLE_IMPORT_TEXT;
    const parsed = ArtanMenu.parseMenuText(source, {});
    openMenuReview(parsed, null, term ? "Exempeltermin" : "Exempelmeny", true, source);
    render();
    return;
  }
  if (action === "meal-import-year") {
    const year = document.querySelector("[name=anchor_year]")?.value;
    const parsed = ArtanMenu.parseMenuText(state.mealImport?.sourceText || "", {
      anchorYear: year,
      uncertain: Boolean(state.mealImport?.parsed?.items?.some((item) => item.uncertain)),
    });
    state.mealImport = { ...state.mealImport, parsed, anchorYear: year, status: "review" };
    render();
    return;
  }
  if (action === "meal-file-example") {
    state.notice = { type: "success", text: "Filen kan inte öppnas i den här vyn." };
    render();
    return;
  }
  if (action === "meal-clear-menu") {
    if (state.mealDemo) {
      const preschoolId = mealPreschoolForView();
      const bundle = mealBundle(preschoolId);
      state.mealBundles[preschoolId] = { ...bundle, menus: [] };
      state.notice = { type: "success", text: "Exempelfilen togs bort bara i den här webbläsaren." };
      render();
      return;
    }
    const preschoolId = mealPreschoolForView();
    const monday = state.mealWeekStart || ArtanMeals.mondayOf(todayIso());
    const menu = (mealBundle(preschoolId).menus || []).find((item) => ArtanMeals.rangesOverlap(item.starts_on, item.ends_on, monday, ArtanMeals.addDays(monday, 4)));
    if (!menu?.storage_path) return;
    runMutation(async () => {
      await deleteMealObject("meal-menus", menu.storage_path);
      await rpc("clear_meal_menu", { target_menu_id: menu.id });
      await loadMeals();
    }, "Filen är borttagen.");
    return;
  }
  if (action === "meal-clear-photo") {
    const iso = target.dataset.date;
    if (state.mealDemo) {
      const preschoolId = mealPreschoolForView();
      const bundle = mealBundle(preschoolId);
      state.mealBundles[preschoolId] = {
        ...bundle,
        days: (bundle.days || []).flatMap((day) => {
          if (day.served_on !== iso) return [day];
          if (!String(day.body || "").trim()) return [];
          return [{ ...day, photo_url: "", photo_path: null }];
        }),
      };
      state.notice = { type: "success", text: "Exempelbilden togs bort bara i den här webbläsaren." };
      render();
      return;
    }
    const preschoolId = mealPreschoolForView();
    const row = (mealBundle(preschoolId).days || []).find((day) => day.served_on === iso);
    if (!row?.photo_path) return;
    runMutation(async () => {
      await deleteMealObject("meal-photos", row.photo_path);
      await rpc("clear_meal_photo", { target_preschool_id: preschoolId, served: iso });
      await loadMeals();
    }, "Bilden är borttagen.");
    return;
  }
  if (action === "open-daily-plan") {
    const details = document.getElementById("daily-plan");
    if (!details) return;
    details.open = true;
    requestAnimationFrame(() => {
      details.scrollIntoView({ behavior: "smooth", block: "start" });
      details.querySelector('input[name="status"]:checked')?.focus({ preventScroll: true });
    });
    return;
  }
  if (action === "navigate" || action === "account") {
    const view = action === "account" ? "account" : target.dataset.view;
    if (view === "incidents") {
      state.incidentScreen = "list";
      state.incidentId = null;
      state.incidentDetail = null;
    }
    const section = target.dataset.section || "";
    const scrollTarget = target.dataset.target || (view === "pickup" ? "pickup-current-week" : "");
    showView(view, { section, scrollTarget });
    return;
  }
  if (action === "hub-open") {
    if (target.dataset.section === "incidentrapporter") {
      state.incidentScreen = "list";
      state.incidentId = null;
      state.incidentDetail = null;
    }
    showView(state.view, { section: target.dataset.section || "" });
    requestAnimationFrame(() => document.querySelector(".hub-back")?.focus());
    return;
  }
  if (action === "hub-back") {
    closeHub();
    return;
  }
  if (action === "select-child") {
    state.selectedChildId = target.dataset.id;
    render();
    return;
  }
  if (action === "bot-reminder") {
    const view = target.dataset.view;
    const scrollTarget = target.dataset.target || "";
    const section = HUB_SECTION_BY_TARGET[scrollTarget] || "";
    showView(view, { section, scrollTarget: section ? "" : scrollTarget });
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
      if (parsed.error) {
        setParseStatus(form, parsed.error, true);
      } else {
        const closureNote = parsed.closures.length ? ` ${parsed.closures.length} stängningsdagar står i listan.` : "";
        setParseStatus(form, `Ärtan har fyllt i ett utkast.${closureNote} Granska alla datum och tider innan du sparar.`);
      }
    } catch (error) {
      setParseStatus(form, error.message, true);
    }
    return;
  }
  if (action === "parse-weekly-schedule") {
    const form = target.closest("form");
    try {
      const scheduleText = form.elements.schedule_text.value;
      const parsedRows = parseWeeklyScheduleText(scheduleText);
      const child = state.children.find((item) => item.id === form.dataset.childId);
      const people = child ? pickupPeople(child) : { guardians: [], contacts: [] };
      const assignments = schedulePersonAssignments(scheduleText, people.guardians, people.contacts);
      let appliedPeople = false;
      parsedRows.forEach((parsed) => {
        const row = form.querySelector(`[data-weekday="${parsed.weekday}"]`);
        const attending = row.querySelector("[data-schedule-attending]");
        attending.checked = parsed.attending;
        row.querySelector(`[name="dropoff_${parsed.weekday}"]`).value = parsed.dropoff_at || "";
        row.querySelector(`[name="pickup_${parsed.weekday}"]`).value = parsed.pickup_at || "";
        row.querySelectorAll('input[type="time"]').forEach((timeInput) => { timeInput.disabled = !parsed.attending; });
        if (!parsed.attending) return;
        const dropoff = row.querySelector(`[name="dropoff_person_${parsed.weekday}"]`);
        const pickup = row.querySelector(`[name="picker_${parsed.weekday}"]`);
        if (dropoff && assignments.dropoffToken) {
          dropoff.value = assignments.dropoffToken;
          appliedPeople = true;
        }
        if (pickup && assignments.pickupToken) {
          pickup.value = assignments.pickupToken;
          appliedPeople = true;
        }
      });
      setParseStatus(form, appliedPeople
        ? "Ärtan har fyllt i tider och personer. Granska varje dag innan du sparar."
        : "Ärtan har fyllt i veckan. Granska tiderna och välj lämnare och hämtare innan du sparar.");
    } catch (error) {
      setParseStatus(form, error.message, true);
    }
    return;
  }
  if (action === "edit-term") {
    if (!canManageSchoolTerms(target.dataset.preschoolId)) return;
    state.termEditor = { preschoolId: target.dataset.preschoolId, termId: target.dataset.id };
    state.notice = null;
    render();
    requestAnimationFrame(() => document.getElementById("term-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return;
  }
  if (action === "cancel-term-edit") {
    state.termEditor = null;
    state.notice = null;
    render();
    return;
  }
  if (action === "publish-term") {
    const publishedTerm = state.schoolTerms.find((term) => term.term_id === target.dataset.id);
    if (!publishedTerm || !canManageSchoolTerms(publishedTerm.preschool_id)) return;
    runMutation(async () => {
      await rpc("publish_school_term", { target_term_id: target.dataset.id });
      await loadData();
    }, "Terminen är publicerad.");
    return;
  }
  if (action === "incident-new") {
    keepIncidentPlace();
    state.incidentScreen = "form";
    state.incidentId = null;
    state.incidentDetail = null;
    state.notice = null;
    render();
    scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (action === "incident-list") {
    keepIncidentPlace();
    state.incidentScreen = "list";
    state.incidentId = null;
    state.incidentDetail = null;
    state.notice = null;
    render();
    return;
  }
  if (action === "open-incident") {
    runMutation(async () => {
      keepIncidentPlace();
      await openIncident(target.dataset.id);
    }, "");
    return;
  }
  if (action === "print-incident") {
    window.print();
    return;
  }
  if (action === "acknowledge-incident") {
    runMutation(async () => {
      await rpc("acknowledge_incident_copy", { target_copy_id: target.dataset.id });
      await loadData();
    }, "Det är noterat att du har läst.");
    return;
  }
  if (action === "start-incident-investigation") {
    runMutation(async () => {
      await rpc("start_incident_investigation", { target_report_id: target.dataset.id });
      state.incidentId = target.dataset.id;
      state.incidentScreen = "detail";
      await refreshOpenIncident();
    }, "Rapporten är under utredning.");
    return;
  }
  if (action === "incident-principal") {
    runMutation(async () => {
      await rpc("mark_incident_reported_to_principal", { target_report_id: target.dataset.id });
      state.incidentId = target.dataset.id;
      await refreshOpenIncident();
    }, "Anmälan till huvudman är registrerad.");
    return;
  }
  if (action === "complete-incident-action") {
    runMutation(async () => {
      await rpc("complete_incident_action", { target_action_id: target.dataset.id });
      await refreshOpenIncident();
    }, "Åtgärden är markerad klar.");
    return;
  }
  if (action === "open-scan") {
    stopPickupScanner();
    state.checkout = null;
    state.scan = { phase: "live", error: "" };
    state.notice = null;
    render();
    startPickupScanner();
    return;
  }
  if (action === "close-scan") {
    stopPickupScanner();
    state.scan = null;
    render();
    return;
  }
  if (action === "close-checkout") {
    state.checkout = null;
    render();
    return;
  }
  if (action === "confirm-pickup") {
    const scan = state.scan;
    if (!scan?.result?.pass_id || scan.result.permanent) return;
    runMutation(async () => {
      await rpc("confirm_pickup", {
        target_pass_id: scan.result.pass_id,
        pickup_method: scan.method === "code" ? "code" : "qr",
      });
      state.scan = null;
      await loadData();
    }, `${scan.result.child_name} är utcheckad.`);
    return;
  }
  if (action === "confirm-permanent-pickup") {
    const scan = state.scan;
    if (!scan?.result?.permanent || !scan.result.pass_id || !target.dataset.childId) return;
    const childName = target.dataset.childName || "Barnet";
    runMutation(async () => {
      await rpc("confirm_permanent_pickup", {
        target_pass_id: scan.result.pass_id,
        target_child_id: target.dataset.childId,
        pickup_method: scan.method === "code" ? "code" : "qr",
      });
      state.scan = null;
      await loadData();
    }, `${childName} är utcheckad.`);
    return;
  }
  if (action === "share-pass") {
    const text = [target.dataset.label, target.dataset.code ? `Kod ${target.dataset.code}` : "", passLink(target.dataset.token)].filter(Boolean).join("\n");
    sharePrepared({ title: "Hämtpass", text });
    return;
  }
  if (action === "print-pass") {
    const sheet = target.closest(".guardian-pass");
    if (!sheet) return;
    const clone = sheet.cloneNode(true);
    clone.querySelectorAll(".pass-share, button").forEach((node) => node.remove());
    openPrint(clone.outerHTML);
    return;
  }
  if (action === "edit-pickup-week") {
    openPickupWeek(target.dataset.monday);
    requestAnimationFrame(() => document.querySelector(".week-back")?.focus({ preventScroll: true }));
    return;
  }
  if (action === "pickup-add") {
    const scrollY = state.pickupEditor?.scrollY ?? window.scrollY;
    if (state.pickupEditor?.mode === "menu") {
      state.pickupEditor = null;
    } else {
      state.pickupEditor = { mode: "menu", scrollY };
    }
    state.notice = null;
    state.pickupScrollRestore = scrollY;
    render();
    return;
  }
  if (action === "pickup-standard") {
    const scrollY = state.pickupEditor?.scrollY ?? window.scrollY;
    state.pickupEditor = { mode: "standard", scrollY };
    state.notice = null;
    state.pickupScrollRestore = scrollY;
    render();
    requestAnimationFrame(() => document.querySelector(".week-back")?.focus({ preventScroll: true }));
    return;
  }
  if (action === "close-picker" && state.pickupEditor?.mode === "week") {
    syncWeekEditorFromDom();
    state.pickupEditor.personIso = null;
    state.pickupEditor.personRole = "";
    state.pickupEditor.draftToken = "";
    state.pickupScrollRestore = state.pickupEditor.scrollY;
    render();
    return;
  }
  if (action === "close-pickup-editor") {
    const scrollY = state.pickupEditor?.scrollY ?? window.scrollY;
    state.pickupEditor = null;
    state.pickupScrollRestore = scrollY;
    render();
    return;
  }
  if (action === "open-picker") {
    const editor = state.pickupEditor;
    if (editor?.mode !== "week" || target.disabled) return;
    syncWeekEditorFromDom();
    const day = editor.days.find((item) => item.iso === target.dataset.date);
    editor.personIso = target.dataset.date;
    editor.personRole = target.dataset.personRole === "dropoff" ? "dropoff" : "pickup";
    editor.draftToken = pickerToken(editor.personRole === "dropoff" ? day?.dropoffPerson : day?.picker);
    editor.error = "";
    state.pickupScrollRestore = editor.scrollY;
    render();
    return;
  }
  if (action === "choose-picker") {
    const editor = state.pickupEditor;
    if (editor?.mode !== "week") return;
    editor.draftToken = target.dataset.token;
    document.querySelectorAll("[data-action='choose-picker']").forEach((button) => {
      const selected = button === target;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    return;
  }
  if (action === "confirm-picker") {
    const editor = state.pickupEditor;
    if (editor?.mode !== "week") return;
    syncWeekEditorFromDom();
    const parsed = parsePickerToken(editor.draftToken);
    const day = editor.days.find((item) => item.iso === editor.personIso);
    if (!parsed || !day) {
      editor.error = `Välj vem som ${editor.personRole === "dropoff" ? "lämnar" : "hämtar"}.`;
      state.pickupScrollRestore = editor.scrollY;
      render();
      return;
    }
    if (editor.personRole === "dropoff" && parsed.picker_kind === "pass") {
      editor.error = "Ett hämtpass kan inte användas som lämnare.";
      state.pickupScrollRestore = editor.scrollY;
      render();
      return;
    }
    editor.days = ArtanPickup.assignDefaultPicker(
      ArtanPickup.smartFillWeek(editor.days, editor.personIso, editor.personRole === "dropoff" ? "dropoffPerson" : "picker", {
        kind: parsed.picker_kind,
        id: parsed.picker_id,
        passKind: parsed.pass_kind || "",
      }),
      editor.viewerId,
    );
    editor.personIso = null;
    editor.personRole = "";
    editor.draftToken = "";
    editor.error = "";
    state.pickupScrollRestore = editor.scrollY;
    render();
    return;
  }
  if (action === "same-as-previous-week") {
    const editor = state.pickupEditor;
    const child = selectedChild();
    if (!editor || editor.mode !== "week" || !child || typeof ArtanPickup === "undefined") return;
    syncWeekEditorFromDom();
    const filled = ArtanPickup.fillFromPreviousWeek(editor.days, pickupGridInput(child), editor.monday);
    if (filled.copied) {
      editor.days = ArtanPickup.assignDefaultPicker(filled.days, editor.viewerId);
      editor.note = filled.fallback ? `Kopierade vecka ${filled.weekNumber}` : "";
      editor.error = "";
    }
    state.pickupScrollRestore = editor.scrollY;
    render();
    return;
  }
  if (action === "save-pickup-week") {
    const editor = state.pickupEditor;
    const child = selectedChild();
    if (!editor || editor.mode !== "week" || !child || typeof ArtanPickup === "undefined") return;
    syncWeekEditorFromDom();
    const week = ArtanPickup.buildTermGrid(pickupGridInput(child)).weeks.find((item) => item.monday === editor.monday);
    const byIso = new Map((week?.days || []).map((day) => [day.iso, day]));
    const saving = [];
    for (const day of editor.days) {
      const source = byIso.get(day.iso);
      if (!source?.open || day.ledig || plannedAbsenceStatus(child.id, day.iso)) continue;
      if (!day.dropoff && !day.pickup) continue;
      if (!day.dropoff || !day.pickup || day.dropoff >= day.pickup) {
        editor.error = "Fyll i lämning och hämtning, eller markera dagen som ledig.";
        state.pickupScrollRestore = editor.scrollY;
        render();
        return;
      }
      if (!day.dropoffPerson?.kind || !day.dropoffPerson.id) {
        editor.error = `Välj vem som lämnar ${ArtanPickup.weekdayName(day.iso, "full")}.`;
        state.pickupScrollRestore = editor.scrollY;
        render();
        return;
      }
      if (!day.picker?.kind || !day.picker.id) {
        editor.error = `Välj vem som hämtar ${ArtanPickup.weekdayName(day.iso, "full")}.`;
        state.pickupScrollRestore = editor.scrollY;
        render();
        return;
      }
      saving.push(day);
    }
    const scrollY = editor.scrollY;
    if (!saving.length) {
      state.pickupEditor = null;
      state.notice = { type: "success", text: "Inga dagar sparades. Ledig lämnar en redan ifylld vecka som den är." };
      state.pickupScrollRestore = scrollY;
      render();
      return;
    }
    runMutation(async () => {
      for (const day of saving) {
        await rpc("save_pickup_day_handoffs", {
          target_child_id: child.id,
          plan_date: day.iso,
          dropoff_at: day.dropoff,
          pickup_at: day.pickup,
          dropoff_person_kind: day.dropoffPerson.kind,
          dropoff_person_id: day.dropoffPerson.id,
          picker_kind: day.picker.kind,
          picker_id: day.picker.id,
          pass_kind: day.picker.passKind || null,
        });
      }
      state.pickupEditor = null;
      await loadData();
      state.pickupScrollRestore = scrollY;
    }, "Veckan är sparad.");
    return;
  }
  if (action === "copy-pickup-week") {
    const child = selectedChild();
    if (!child || typeof ArtanPickup === "undefined") return;
    const scrollY = state.pickupEditor?.scrollY ?? window.scrollY;
    runMutation(async () => {
      await rpc("copy_pickup_week", { target_child_id: child.id, source_monday: ArtanPickup.weekMonday(todayIso()) });
      state.pickupEditor = null;
      await loadData();
      state.pickupScrollRestore = scrollY;
    }, "Veckan är kopierad till nästa.");
    return;
  }
  if (action === "open-pass") {
    const kind = target.dataset.kind === "permanent" ? "permanent" : "day";
    runMutation(async () => {
      const revealed = await rpc("reveal_pickup_pass", { target_pass_id: target.dataset.id, pass_kind: kind });
      const token = revealed?.token;
      if (!token) throw new Error(kind === "permanent" ? "Länken kan inte visas igen. Välj Ny kod." : "Länken kan inte visas igen. Skapa passet på nytt.");
      if (kind === "day") {
        const pass = state.pickupPasses.find((item) => item.pass_id === target.dataset.id);
        state.openedPass = { ...pass, token, permanent: false };
      } else {
        const pass = state.permanentPasses.find((item) => item.pass_id === target.dataset.id);
        state.openedPass = { ...pass, token, permanent: true, first_name: pass?.child_names, child_id: selectedChild()?.id };
      }
      state.createdPass = null;
      showPickupPlace();
    }, "");
    return;
  }
  if (action === "copy-pass") {
    runMutation(async () => navigator.clipboard.writeText(passLink(target.dataset.token)), "Hämtlänken är kopierad.");
    return;
  }
  if (action === "revoke-pass") {
    runMutation(async () => {
      await rpc("revoke_pickup_pass", { target_pass_id: target.dataset.id });
      if (state.createdPass?.pass_id === target.dataset.id) state.createdPass = null;
      if (state.openedPass?.pass_id === target.dataset.id) state.openedPass = null;
      await loadData();
    }, "Hämtpasset är återkallat.");
    return;
  }
  if (action === "revoke-permanent-pass") {
    runMutation(async () => {
      await rpc("revoke_permanent_pickup_pass", { target_pass_id: target.dataset.id });
      if (state.createdPass?.pass_id === target.dataset.id) state.createdPass = null;
      if (state.openedPass?.pass_id === target.dataset.id) state.openedPass = null;
      await loadData();
    }, "Det permanenta hämtpasset är återkallat.");
    return;
  }
  if (action === "regenerate-permanent-pass") {
    runMutation(async () => {
      const created = await rpc("regenerate_permanent_pickup_pass", { target_pass_id: target.dataset.id });
      const row = { ...(Array.isArray(created) ? created[0] : created), child_id: target.dataset.childId, permanent: true, first_name: childFirstName(state.children.find((child) => child.id === target.dataset.childId)) };
      state.createdPass = row;
      state.openedPass = null;
      showPickupPlace();
      await keepPassToken(row.pass_id, "permanent", row.token);
      await loadData();
      const saved = state.permanentPasses.find((pass) => pass.pass_id === row.pass_id);
      if (saved && state.createdPass?.pass_id === row.pass_id) {
        state.createdPass = { ...state.createdPass, first_name: saved.child_names, ends_on: saved.ends_on, permanent: true };
      }
    }, "Ny kod skapad. Den gamla länken fungerar inte längre.");
    return;
  }
  if (action === "delete-pickup-contact") {
    const contactId = target.dataset.id;
    runMutation(async () => {
      const contact = state.pickupContacts.find((item) => item.contact_id === contactId);
      if (contact?.photo_path) await deleteContactPhotoObject(contactPhotoPath(contactId));
      try {
        await rpc("delete_pickup_contact", { target_contact_id: contactId });
      } catch (error) {
        if (!/finns kvar/i.test(error.message)) throw error;
        await deleteContactPhotoObject(contactPhotoPath(contactId));
        await rpc("delete_pickup_contact", { target_contact_id: contactId });
      }
      await loadData();
    }, "Personen är borttagen från hämtlistan.");
    return;
  }
  if (action === "delete-contact-photo") {
    if (state.profile.role !== "parent") return;
    runMutation(async () => {
      await removeContactPhoto(target.dataset.id);
      await loadData();
    }, "Bilden är borttagen.");
    return;
  }
  if (action === "extend-permanent-pass") {
    runMutation(async () => {
      try {
        await rpc("extend_permanent_pickup_pass", { target_pass_id: target.dataset.id });
      } catch (error) {
        if (pickupFeatureMissing(error)) throw new Error("Förlängning är inte aktiverad i databasen ännu.");
        throw error;
      }
      await loadData();
    }, "Hämtpasset är förlängt till nästa termin.");
    return;
  }
  if (action === "dismiss-pass-renewal") {
    runMutation(async () => {
      try {
        await rpc("dismiss_permanent_pass_reminder", { target_pass_id: target.dataset.id });
      } catch (error) {
        if (pickupFeatureMissing(error)) throw new Error("Påminnelsen är inte aktiverad i databasen ännu.");
        throw error;
      }
      await loadData();
    }, "Passet får gå ut.");
    return;
  }
  if (action === "toggle-pickup-block") {
    const blocked = target.dataset.blocked !== "true";
    runMutation(async () => {
      await rpc("set_pickup_contact_block", { target_contact_id: target.dataset.id, is_blocked: blocked });
      await loadData();
    }, blocked ? "Personen får ej hämta." : "Spärren är borttagen.");
    return;
  }
  if (action === "set-term-manager") {
    if (state.profile?.role !== "admin" || target.disabled) return;
    const enabled = target.checked;
    const name = target.dataset.name || "personen";
    if (!enabled && !window.confirm(`Ta bort behörigheten att hantera terminsschemat för ${name}?`)) {
      target.checked = true;
      return;
    }
    runMutation(async () => {
      await rpc("set_term_manager", { staff_profile_id: target.dataset.id, enabled });
      await loadData();
    }, enabled ? `${name} kan nu hantera terminsschemat.` : "Behörigheten är borttagen.");
    return;
  }
  if (action === "staff-attendance") {
    const child = state.children.find((item) => item.id === target.dataset.childId);
    const transition = target.dataset.transition;
    if (transition === "check_out" && state.pickupReady) {
      runMutation(async () => {
        const options = await rpc("list_pickup_options", { target_child_id: target.dataset.childId });
        const paths = (options?.contacts || []).map((person) => person.photo_path);
        Object.assign(state.contactPhotoUrls, await signContactPhotos(paths));
        state.scan = null;
        state.checkout = { childId: target.dataset.childId, options };
      }, "");
      return;
    }
    const success = transition === "check_out" ? `${child?.name || "Barnet"} är utcheckad.` : transition === "check_in" ? `${child?.name || "Barnet"} är incheckad.` : `${child?.name || "Barnet"} är markerad som ${transition === "absent_sick" ? "sjuk" : "ledig"}.`;
    runMutation(async () => {
      await rpc("set_child_attendance", { target_child_id: target.dataset.childId, transition });
      await loadData();
    }, success);
    return;
  }
  if (action === "delete-child-photo") {
    if (state.profile.role !== "parent") return;
    if (!window.confirm("Ta bort profilbilden? Den försvinner för personal och i klasslistan.")) return;
    runMutation(async () => {
      await removeChildPhoto(target.dataset.childId);
      await loadData();
    }, "Profilbilden är borttagen.");
    return;
  }
  if (action === "set-class-list-consent") {
    if (state.profile.role !== "parent" || !state.classListReady) return;
    const field = target.dataset.field;
    const allowed = target.dataset.value === "true";
    const mine = classListRowsFor(target.dataset.childId).find((row) => row.is_self);
    if (mine?.[field] === allowed) return;
    const showName = field === "show_name" ? allowed : mine?.show_name ?? null;
    const showPhoto = field === "show_photo" ? allowed : mine?.show_photo ?? null;
    const success = field === "show_name"
      ? (allowed ? "Förnamnet får visas i klasslistan." : "Barnet är dolt i klasslistan.")
      : (allowed ? "Du har sagt ja till att bilden får visas." : "Bilden visas inte för andra vårdnadshavare.");
    runMutation(async () => {
      await rpc("set_class_list_consent", {
        target_child_id: target.dataset.childId,
        show_name: showName,
        show_photo: showPhoto,
      });
      await loadData();
    }, success);
    return;
  }
  if (action === "set-consent") {
    if (state.profile.role !== "parent") return;
    const allowed = target.dataset.allowed === "true";
    runMutation(async () => {
      await rpc("set_child_consent", {
        target_child_id: target.dataset.childId,
        consent_kind: target.dataset.type,
        consent_allowed: allowed,
      });
      await loadData();
    }, allowed ? "Samtycket är sparat." : "Samtycket är tillbakadraget.");
    return;
  }
  if (action === "delete-contact") {
    if (state.profile.role !== "parent") return;
    const name = target.dataset.contactName || "kontaktpersonen";
    if (!window.confirm(`Ta bort ${name} som kontaktperson?`)) return;
    runMutation(async () => {
      await rpc("delete_child_contact", { target_contact_id: target.dataset.contactId });
      await loadData();
    }, "Kontaktpersonen är borttagen.");
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
  if (action === "create-calendar-feed" || action === "rotate-calendar-feed") {
    if (state.profile?.role !== "parent") return;
    if (action === "rotate-calendar-feed" && !window.confirm("Skapa en ny länk? Den gamla slutar fungera.")) return;
    runMutation(async () => {
      const token = await rpc("create_or_rotate_calendar_feed");
      if (typeof token !== "string" || !token) throw new Error("Kalenderlänken kunde inte skapas.");
      state.calendarToken = token;
      state.calendarReady = true;
      state.calendarFeed = { active: true, created_at: new Date().toISOString() };
    }, action === "rotate-calendar-feed" ? "En ny länk är skapad. Den tidigare länken fungerar inte längre." : "Kalenderlänken är skapad. Lägg till den nu.");
    return;
  }
  if (action === "revoke-calendar-feed") {
    if (state.profile?.role !== "parent") return;
    if (!window.confirm("Stäng av kalenderlänken? Den slutar fungera direkt.")) return;
    runMutation(async () => {
      await rpc("revoke_calendar_feed");
      state.calendarToken = null;
      state.calendarFeed = { active: false, created_at: null };
    }, "Kalenderlänken är avstängd.");
    return;
  }
  if (action === "copy-calendar-feed") {
    if (state.profile?.role !== "parent" || !state.calendarToken) return;
    const link = termFeedHttpsUrl(state.calendarToken);
    runMutation(async () => navigator.clipboard.writeText(link), "Kalenderlänken är kopierad.");
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

document.body.addEventListener("change", (event) => {
  if (event.target.dataset?.action === "meal-import-file") {
    const file = event.target.files?.[0];
    if (file) readMealImport(file);
    return;
  }
  if (event.target.name === "preschool_id" && event.target.closest("[data-form='meal-week']")) {
    state.mealPreschoolId = event.target.value;
    render();
    return;
  }
  const select = event.target.closest("[data-pickup-choice]");
  if (select?.form) updatePickupChoice(select.form);
  const contact = event.target;
  const form = contact.closest?.("[data-form='permanent-pickup-pass']");
  if (!form || contact.name !== "contact_id") return;
  const slot = form.querySelector("[data-permanent-linked-slot]");
  if (slot) slot.innerHTML = renderPermanentLinkedField(contact.value);
});

window.addEventListener("popstate", syncHubFromHistory);

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || !state.assistantOpen) return;
  state.assistantOpen = false;
  state.assistantQuestion = "";
  state.assistantResponse = null;
  renderAssistant();
  requestAnimationFrame(() => document.querySelector(".assistant-launcher")?.focus());
});


function startMealDemo(params) {
  const role = ["parent", "staff", "admin"].includes(params.get("role")) ? params.get("role") : "parent";
  const day = /^\d{4}-\d{2}-\d{2}$/.test(params.get("day") || "") ? params.get("day") : "2026-11-10";
  const example = ArtanMeals.EXAMPLE;
  state.mealDemo = true;
  state.mealDemoToday = day;
  state.mealsReady = false;
  state.session = { access_token: "demo", user: { id: example.profileId } };
  state.profile = {
    id: example.profileId,
    role,
    name: role === "parent" ? "Exempel Förälder" : role === "staff" ? "Exempel Personal" : "Exempel Administratör",
    email: "exempel@example.test",
    organization_id: example.organizationId,
  };
  state.organization = { id: example.organizationId, name: "Exempelorganisation" };
  state.schools = [{ id: example.preschoolId, name: "Exempelförskolan" }];
  state.departments = [{ id: example.departmentId, preschool_id: example.preschoolId, name: "Exempelavdelningen" }];
  state.staffAssignments = [{ staff_id: example.profileId, department_id: example.departmentId }];
  state.children = [{ id: example.childId, name: "Nova Exempel", department_id: example.departmentId }];
  state.selectedChildId = example.childId;
  state.attendance = [];
  state.schoolTerms = [];
  state.termClosures = [];
  state.posts = [];
  state.notices = [];
  state.mealPreschoolId = example.preschoolId;
  state.mealWeekStart = ArtanMeals.mondayOf(day);
  state.mealTermFixture = params.get("las") === "termin" && role !== "parent";
  state.mealBundles = { [example.preschoolId]: ArtanMeals.exampleBundle(day) };
  if (params.get("las") === "1" && role !== "parent") {
    openMenuReview(ArtanMenu.parseMenuText(ArtanMenu.EXAMPLE_IMPORT_TEXT, {}), null, "Exempelmeny", true, ArtanMenu.EXAMPLE_IMPORT_TEXT);
  }
  if (state.mealTermFixture) {
    const source = ArtanMenu.termExampleText();
    openMenuReview(ArtanMenu.parseMenuText(source, {}), null, "Exempeltermin", true, source);
  }
  const requested = params.get("view") || "";
  state.view = ArtanMeals.allowedViews(role).includes(requested) ? requested : ArtanMeals.allowedViews(role)[0];
  if ((params.get("las") === "1" || params.get("las") === "termin") && role !== "parent" && !requested) state.view = "meals";
  state.notice = null;
  state.busy = false;
}

(async function start() {
  if (!passFromUrl && new URLSearchParams(location.search).get("demo") === "matsedel") {
    startMealDemo(new URLSearchParams(location.search));
    render();
    return;
  }
  if (passFromUrl) {
    state.busy = true;
    render();
    try {
      await loadPublicPass();
    } finally {
      state.busy = false;
      render();
    }
    return;
  }
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
  applyInitialHub();
  render();
  if (state.view === "pickup") scrollPickupWeekIntoView();
})();
