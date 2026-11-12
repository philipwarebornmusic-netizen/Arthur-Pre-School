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

function fixedDate(iso, hour = 10) {
  const NativeDate = Date;
  return class FixedDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : [`${iso}T${String(hour).padStart(2, "0")}:00:00+01:00`]));
    }
    static now() {
      return new NativeDate(`${iso}T${String(hour).padStart(2, "0")}:00:00+01:00`).valueOf();
    }
  };
}

function dashboard(iso, {
  hour = 10,
  attendance = null,
  assignments = [],
  posts = [],
  postImages = [],
  events = [],
  banners = [],
  schoolMode = false,
  timetable = [],
  terms = [],
  dayPlans = [],
  closures = [],
  children = [{ id: "child-1", name: "Arthur", department_id: "department-1" }],
  selectedChildId = children[0]?.id,
} = {}) {
  const context = {
    Date: fixedDate(iso, hour),
    Intl,
    state: {
      profile: { id: "parent-1", role: "parent", name: "Alex Förälder" },
      selectedChildId,
      attendance: attendance ? [attendance] : [],
      children,
      contacts: [],
      posts,
      postImages,
      schoolBanners: banners,
      schoolEvents: events,
      notices: [],
      incidentCopies: [],
      pickupWeekReady: false,
      pickupCalendars: {},
      attendanceNotesReady: true,
      multiDayAbsenceReady: true,
      familyFeaturesReady: true,
      schoolAssignments: assignments,
      schoolProgress: [],
      schoolExperienceReady: true,
      schoolNotices: [],
      schoolTimetable: timetable,
    },
    selectedChild: () => children.find((child) => child.id === selectedChildId),
    attendanceFor: (childId) => attendance?.child_id === childId || !attendance?.child_id ? attendance : null,
    contactsFor: () => [],
    childInfoChecklist: () => [],
    childBoxNeedsRefill: () => [],
    attendanceState: (row) => row?.status || "not_in",
    attendanceLabel: (status) => status === "not_in" ? "Inte incheckad" : status,
    departmentName: (departmentId) => departmentId === "department-2" ? "Humlan" : "Testavdelningen",
    noticeHtml: () => "",
    botMascot: () => "",
    renderPickupNotices: () => "",
    renderIncidentCopies: () => "",
    renderNoticeList: () => "",
    renderPassRenewalCards: () => "",
    renderMealTodayCard: () => '<section data-test-meal>Dagens mat</section>',
    renderSiblingRequestForm: () => "",
    emptyState: () => "",
    selectField: () => "<select></select>",
    field: (label, name, value = "") => `<label>${label}<input name="${name}" value="${value}"></label>`,
    esc: (value) => String(value ?? ""),
    navIcon: () => "",
    formatTimestamp: (value) => String(value || "26 okt."),
    ASSIGNMENT_STATUS: { homework: "Uppgift", missing: "Missad uppgift", submitted: "Inlämnad", completed: "Klar" },
    BANNER_SEVERITY: { information: "Information", important: "Viktig information", urgent: "Akut" },
    featureEnabled: () => true,
    isSchoolChild: () => schoolMode,
    activeSchoolBanners: () => banners,
    groupedSchoolEvents: () => events,
    postImagesFor: (postId) => postImages.filter((image) => image.post_id === postId),
    pickupPersonName: () => "Alex",
    pickupGridInput: () => ({
      today: iso,
      terms: terms.map((term) => ({
        ...term,
        closures: closures.filter((item) => item.term_id === term.term_id).map((item) => item.closure_date),
        closureReasons: Object.fromEntries(closures.filter((item) => item.term_id === term.term_id).map((item) => [item.closure_date, item.reason])),
      })),
      dayPlans,
      markUnfilled: false,
      viewerId: "parent-1",
    }),
    timetableForDepartment: (departmentId, weekday) => timetable.filter((entry) => entry.department_id === departmentId && Number(entry.weekday) === Number(weekday)),
  };
  vm.createContext(context);
  vm.runInContext([
    readFileSync(new URL("../pickup-hub.js", import.meta.url), "utf8"),
    functionSource("todayIso"),
    functionSource("formatDate"),
    functionSource("addDaysIso"),
    functionSource("isWeekend"),
    functionSource("childFirstName"),
    functionSource("formatClock"),
    functionSource("dayGreeting"),
    functionSource("scheduleDayFor"),
    functionSource("nextOpenScheduleDay"),
    functionSource("homeDateLabel"),
    functionSource("homeDayContext"),
    functionSource("todayStatusCopy"),
    functionSource("parentReminders"),
    functionSource("childTabs"),
    functionSource("schoolworkFor"),
    functionSource("renderHomeAssignments"),
    functionSource("renderHomeQuickActions"),
    functionSource("homeScheduleValues"),
    functionSource("renderHomeDayCard"),
    functionSource("renderHomeReminders"),
    functionSource("renderHomePriority"),
    functionSource("renderHomeUpdates"),
    functionSource("renderTodaySubjects"),
    functionSource("renderSchoolNotices"),
    functionSource("renderParentHome"),
  ].join("\n"), context);
  return {
    html: vm.runInContext("renderParentHome()", context),
    reminders: vm.runInContext("parentReminders(selectedChild())", context),
    dayContext: vm.runInContext("homeDayContext(selectedChild())", context),
  };
}

const term = { term_id: "term-1", starts_on: "2026-10-01", ends_on: "2026-12-18", standard: [] };
const mondayPlan = { plan_date: "2026-10-26", dropoff_at: "08:10:00", pickup_at: "16:20:00", picker_kind: "guardian", picker_id: "parent-1" };
const tuesdayPlan = { plan_date: "2026-10-27", dropoff_at: "08:20:00", pickup_at: "16:10:00", picker_kind: "guardian", picker_id: "parent-1" };

const morning = dashboard("2026-10-26", { hour: 8, terms: [term], dayPlans: [mondayPlan] });
assert(morning.html.includes('data-home-phase="morning"'), "morgonen ska ha ett eget dynamiskt läge");
assert(morning.html.includes("Dagens tider") && morning.html.includes("08:10") && morning.html.includes("16:20"), "morgonen ska prioritera dagens lämning och hämtning");
assert(morning.html.indexOf("Lämning") < morning.html.indexOf("Närvaro"), "morgonen ska visa tider före närvarostatus");
assert(morning.html.includes("Hämtas av Alex"), "dagskortet ska visa vem som hämtar");
assert(morning.html.includes("Ändra tider"), "dagens tider ska kunna ändras direkt");

const daytime = dashboard("2026-10-26", {
  hour: 13,
  terms: [term],
  dayPlans: [mondayPlan],
  attendance: { child_id: "child-1", status: "in", checked_in_at: "2026-10-26T08:12:00+01:00", dropoff_at: "08:10:00", pickup_at: "16:20:00", pickup_by: "Mormor" },
});
assert(daytime.html.includes('data-home-phase="day"'), "dagen ska ha ett eget dynamiskt läge");
assert(daytime.html.includes("På förskolan sedan 08:12") && daytime.html.includes("Hämtas av Mormor"), "dagläget ska visa aktuell närvaro och hämtning");
assert(daytime.html.indexOf("Närvaro") < daytime.html.indexOf("Hämtning"), "dagläget ska prioritera närvarostatus");

const evening = dashboard("2026-10-26", { hour: 19, terms: [term], dayPlans: [mondayPlan, tuesdayPlan] });
assert(evening.html.includes('data-home-phase="evening"') && evening.html.includes("Imorgon"), "kvällen ska växla till nästa förskoledag");
assert(evening.html.includes("08:20") && evening.html.includes("16:10"), "kvällen ska visa morgondagens tider");
assert(!evening.html.includes("Inte incheckad"), "kvällsläget ska inte upprepa dagens incheckningsstatus");

const sunday = dashboard("2026-10-25", { hour: 10, terms: [term], dayPlans: [mondayPlan] });
assert(sunday.html.includes('data-home-phase="weekend"'), "helgen ska ha ett eget dynamiskt läge");
assert(sunday.html.includes("Måndag 26 okt.") && sunday.html.includes("08:10"), "helgen ska visa nästa öppna förskoledag");
assert(!sunday.html.includes('id="daily-plan"') && !sunday.html.includes(">Frånvaro<"), "helgen ska dölja dagens frånvaroåtgärder");

const missing = dashboard("2026-10-26", { hour: 8, terms: [term] });
assert(missing.html.includes("Lägg in dagens lämning och hämtning."), "saknat schema ska skapa en åtgärdspåminnelse");
assert(missing.html.includes("Dagens tider saknas"), "saknade tider ska ha ett kompakt, handlingsbart tomläge");
assert(!missing.html.includes("Ingen ny") && !missing.html.includes("Inga kommande"), "Min dag ska inte visa tomma informationsgenvägar");
assert(!missing.html.includes("Nytt från avdelningen"), "uppdateringssektionen ska döljas helt när inget finns");

const closed = dashboard("2026-10-26", {
  hour: 8,
  terms: [term],
  closures: [{ term_id: "term-1", closure_date: "2026-10-26", reason: "Planeringsdag" }],
});
assert(closed.html.includes("Förskolan är stängd idag: Planeringsdag"), "stängd förskola ska skapa en automatisk påminnelse");
assert(closed.html.includes("Stängt"), "dagskortet ska visa stängningen");
const reopened = dashboard("2026-10-26", { hour: 8, terms: [term], dayPlans: [mondayPlan] });
assert(!reopened.html.includes("Förskolan är stängd idag"), "stängningspåminnelsen ska försvinna när stängningen inte gäller");

const sick = dashboard("2026-10-26", {
  hour: 8,
  terms: [term],
  dayPlans: [mondayPlan],
  attendance: { child_id: "child-1", status: "absent_sick", absence_note: "Feber", absence_ends_on: "2026-10-30" },
});
assert(sick.html.includes("Anledning till sjukdom, valfritt") && sick.html.includes("till och med 30 okt."), "sparad flerdagarsfrånvaro ska kunna ändras");
assert(sick.html.includes("data-attendance-present-fields hidden"), "frånvaro ska dölja lämning och hämtning i formuläret");
assert(sick.html.includes("data-test-meal"), "dagens mat ska finnas kvar vid frånvaro");

const updates = dashboard("2026-10-26", {
  hour: 8,
  terms: [term],
  dayPlans: [mondayPlan],
  posts: [{ id: "post-1", child_id: null, department_id: "department-1", title: "Skogsutflykt", body: "Idag hittade vi höstlöv.", created_at: "2026-10-26T09:00:00Z" }],
  postImages: [{ post_id: "post-1", signed_url: "https://example.test/skog.jpg", alt_text: "Barnens löv", width: 640, height: 480 }],
  events: [{ event_id: "event-1", title: "Ljusfest", starts_at: "2026-10-30T16:00:00Z", ends_at: "2026-10-30T18:00:00Z", location: "Gården", children: [{ id: "child-1" }] }],
});
assert(updates.html.includes("Nytt från avdelningen") && updates.html.includes("Skogsutflykt") && updates.html.includes("Ljusfest"), "relevanta inlägg och aktiviteter ska samlas på Min dag");
assert(updates.html.includes("https://example.test/skog.jpg") && updates.html.includes('alt="Barnens löv"'), "publicerade bilder ska visas med alternativtext");
assert((updates.html.match(/data-view="messages" data-section="anslagstavla"/g) || []).length === 2, "både senaste inlägget och Visa allt ska öppna hela anslagstavlan");

const siblings = [
  { id: "child-1", name: "Arthur", department_id: "department-1" },
  { id: "child-2", name: "Nova", department_id: "department-2" },
];
const multiChild = dashboard("2026-10-26", {
  hour: 8,
  terms: [term],
  children: siblings,
  selectedChildId: "child-2",
  posts: [
    { id: "post-1", child_id: "child-1", title: "Arthurs nyhet", created_at: "2026-10-26T08:00:00Z" },
    { id: "post-2", child_id: "child-2", title: "Novas nyhet", created_at: "2026-10-26T09:00:00Z" },
  ],
});
assert(multiChild.html.includes('data-id="child-2" aria-pressed="true"'), "valt barn ska vara tydligt i flerbarnsväljaren");
assert(multiChild.html.includes("<h1>Nova</h1>") && multiChild.html.includes("Novas nyhet"), "Min dag ska följa valt barn");
assert(!multiChild.html.includes("Arthurs nyhet"), "ett barns privata uppdatering får inte visas för valt syskon");

const schoolMonday = dashboard("2026-10-26", {
  hour: 8,
  schoolMode: true,
  timetable: [{ department_id: "department-1", weekday: 1, starts_at: "08:15", ends_at: "09:00", subject: "Matematik", room: "A12", teacher_name: "Anna" }],
});
assert(schoolMonday.html.includes("Dagens ämnen") && schoolMonday.html.includes("Matematik"), "skolläget ska behålla dagens ämnen");
assert(!schoolMonday.html.includes('name="dropoff_at"') && !schoolMonday.html.includes('name="pickup_at"'), "skolläget ska inte visa förskoletider");
assert(schoolMonday.html.includes("Dagens skoldag") && schoolMonday.html.includes("Ingen frånvaro anmäld"), "skolläget ska visa relevant frånvarostatus utan ett falskt schematomläge");
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
