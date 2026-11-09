import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} saknas`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} kunde inte läsas`);
}

function fixedDate(iso) {
  const NativeDate = Date;
  return class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [`${iso}T10:00:00+01:00`]));
    }
    static now() {
      return new NativeDate(`${iso}T10:00:00+01:00`).valueOf();
    }
  };
}

function dashboard(iso, attendance = null, { assignments = [], posts = [], schoolMode = false, timetable = [] } = {}) {
  const child = { id: "child-1", name: "Arthur", department_id: "department-1" };
  const context = {
    Date: fixedDate(iso),
    Intl,
    state: {
      attendance: attendance ? [attendance] : [],
      children: [child],
      contacts: [],
      posts,
      notices: [],
      incidentCopies: [],
      pickupWeekReady: false,
      attendanceNotesReady: true,
      multiDayAbsenceReady: true,
      familyFeaturesReady: true,
      schoolAssignments: assignments,
      schoolProgress: [],
      schoolExperienceReady: true,
      schoolNotices: [],
      schoolTimetable: timetable,
    },
    selectedChild: () => child,
    attendanceFor: () => attendance,
    contactsFor: () => [],
    childInfoChecklist: () => [],
    childBoxNeedsRefill: () => [],
    attendanceState: (attendance) => attendance?.status || "not_in",
    attendanceLabel: (status) => status === "not_in" ? "Inte incheckad" : status,
    departmentName: () => "Testavdelningen",
    noticeHtml: () => "",
    childTabs: () => "",
    botMascot: () => "",
    renderPickupNotices: () => "",
    renderIncidentCopies: () => "",
    renderNoticeList: () => "",
    renderPickupWeekNudge: () => "",
    renderPassRenewalCards: () => "",
    renderParentTermSchedules: () => "",
    renderMealTodayCard: () => '<section data-test-meal>Dagens mat</section>',
    renderSiblingRequestForm: () => "",
    renderPost: () => "",
    emptyState: () => "",
    selectField: () => "<select></select>",
    field: () => "<input>",
    esc: (value) => String(value ?? ""),
    navIcon: () => "",
    formatTimestamp: () => "26 okt.",
    ASSIGNMENT_STATUS: { homework: "Uppgift", missing: "Missad uppgift", submitted: "Inlämnad", completed: "Klar" },
    featureEnabled: () => true,
    isSchoolChild: () => schoolMode,
    activeSchoolBanners: () => [],
    groupedSchoolEvents: () => [],
    timetableForDepartment: (departmentId, weekday) => timetable.filter((entry) => entry.department_id === departmentId && Number(entry.weekday) === Number(weekday)),
  };
  vm.createContext(context);
  vm.runInContext([
    functionSource("todayIso"),
    functionSource("formatDate"),
    functionSource("addDaysIso"),
    functionSource("isWeekend"),
    functionSource("childFirstName"),
    functionSource("formatClock"),
    functionSource("dayGreeting"),
    functionSource("todayGridDay"),
    functionSource("tomorrowClosureNote"),
    functionSource("todayStatusCopy"),
    functionSource("pickupCardCopy"),
    functionSource("parentReminders"),
    functionSource("schoolworkFor"),
    functionSource("renderHomeAssignments"),
    functionSource("renderHomeQuickActions"),
    functionSource("renderTodaySubjects"),
    functionSource("renderSchoolNotices"),
    functionSource("renderParentHome"),
  ].join("\n"), context);
  return {
    html: vm.runInContext("renderParentHome()", context),
    reminders: vm.runInContext("parentReminders(selectedChild())", context),
  };
}

const sunday = dashboard("2026-10-25");
assert(sunday.html.includes("Helg"), "söndagens status ska vara Helg");
assert(sunday.html.includes("ingen incheckning idag"), "helgen ska förklara att incheckning inte behövs");
assert(sunday.html.includes("Ingen dagsplan eller incheckning behövs under helgen."), "Ärtan ska ge en helganpassad bekräftelse");
assert(!sunday.html.includes("Inte incheckad"), "helgen får inte visa vardagens frånvarostatus");
assert(!sunday.html.includes('id="daily-plan"'), "helgen får inte visa dagens plan");
assert(!sunday.reminders.some((item) => item.target === "daily-plan"), "helgen får inte påminna om dagsplanen");
assert(sunday.html.includes("soft-card is-today"), "helgen ska fortfarande visa dagens status");

const monday = dashboard("2026-10-26");
assert(monday.html.includes("Inte incheckad"), "vardagen ska behålla incheckningsstatusen");
assert(monday.html.includes('id="daily-plan"'), "vardagen ska behålla dagens plan");
assert(monday.reminders.some((item) => item.target === "daily-plan"), "vardagen ska påminna om dagsplanen");
assert(monday.html.includes("Ändra dagens status"), "statusdelen ska ha en tydlig rubrik");
assert(monday.html.includes('data-action="open-daily-plan"'), "dagens statuskort ska öppna statusdelen");
assert(monday.html.includes("Sjukanmälan") && monday.html.includes("Viktig information") && monday.html.includes("Händelser"), "Min dag ska visa de tre viktiga genvägarna");
assert(monday.html.indexOf('id="daily-plan"') < monday.html.indexOf('class="soft-card is-pick"'), "statusdelen ska ligga före hämtning och övrigt dagsinnehåll");
const schoolMonday = dashboard("2026-10-26", null, {
  schoolMode: true,
  timetable: [{ department_id: "department-1", weekday: 1, starts_at: "08:15", ends_at: "09:00", subject: "Matematik", room: "A12", teacher_name: "Anna" }],
});
assert(schoolMonday.html.includes("Dagens ämnen") && schoolMonday.html.includes("Matematik"), "skolläget ska visa dagens ämnen på Min dag");
assert(!schoolMonday.html.includes('name="dropoff_at"') && !schoolMonday.html.includes('name="pickup_at"'), "skolläget ska inte visa lämning eller hämtning");
assert(schoolMonday.html.includes("Ingen frånvaro anmäld") && !schoolMonday.html.includes("Inte incheckad"), "skolläget ska beskriva frånvaro i stället för incheckning");
assert(!schoolMonday.reminders.some((item) => item.target === "daily-plan"), "skolläget ska inte kräva en daglig lämning- och hämtningsplan");

const sick = dashboard("2026-10-26", { status: "absent_sick", absence_note: "Feber", absence_ends_on: "2026-10-30" });
assert(sick.html.includes("Anledning till sjukdom, valfritt"), "sjuk ska visa anledning till sjukdom");
assert(sick.html.includes("data-attendance-present-fields hidden"), "sjuk ska dölja lämning, hämtning och hämtare");
assert(sick.html.includes("data-present-day-content hidden"), "sjuk ska dölja irrelevanta dagskort");
assert(!sick.html.includes('class="card quick-panel" open'), "sparad sjukstatus ska visas med stängd panel");
assert(!sick.html.includes("data-home-reminder-content hidden"), "relevanta påminnelser ska återkomma efter sparning");
assert(sick.html.includes('name="absence_ends_on"'), "sjuk ska kunna registreras över flera dagar");
assert(sick.html.includes('value="2026-10-30"'), "sparat slutdatum ska visas i formuläret");
assert(sick.html.includes("till och med 30 okt."), "sammanfattningen ska visa frånvarons slutdatum");
assert(sick.html.includes("data-test-meal"), "dagens mat ska vara kvar när barnet är sjukt");

const leave = dashboard("2026-10-26", { status: "absent_leave", absence_note: "Familjeledig" });
assert(leave.html.includes("Anledning till ledighet, valfritt"), "ledig ska visa anledning till ledighet");
assert(leave.html.includes("data-attendance-present-fields hidden"), "ledig ska dölja lämning, hämtning och hämtare");
assert(!leave.html.includes('class="card quick-panel" open'), "sparad ledighet ska visas med stängd panel");

const withOverviewItems = dashboard("2026-10-26", null, {
  assignments: [{ child_id: "child-1", subject: "Matematik", title: "Tal 1–10", status: "homework", due_on: "2026-10-30" }],
  posts: [{ title: "Veckobrev", created_at: "2026-10-26T08:00:00Z" }],
});
assert(withOverviewItems.html.includes("Matematik · Tal 1–10") && withOverviewItems.html.includes('data-section="skola"'), "aktuella uppgifter ska länka till sitt eget universum");
assert(withOverviewItems.html.includes("Veckobrev") && withOverviewItems.html.includes('data-section="anslagstavla"'), "senaste meddelandet ska länka direkt till anslagstavlan");

const roleContext = {};
vm.createContext(roleContext);
vm.runInContext([
  readFileSync(new URL("../meals.js", import.meta.url), "utf8"),
  functionSource("allowedViewsForRole"),
  functionSource("defaultViewForRole"),
].join("\n"), roleContext);
assert(roleContext.defaultViewForRole("admin") === "attendance", "administratörer ska börja på Närvaro");
assert(roleContext.defaultViewForRole("staff") === "attendance", "personal ska börja på Närvaro");
assert(roleContext.defaultViewForRole("parent") === "home", "vårdnadshavare ska behålla Min dag");
assert(roleContext.allowedViewsForRole("admin").includes("overview"), "administratörer ska fortfarande kunna öppna Översikt");

console.log("weekend dashboard checks passed");
