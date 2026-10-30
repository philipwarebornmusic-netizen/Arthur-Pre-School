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

function dashboard(iso) {
  const child = { id: "child-1", name: "Arthur", department_id: "department-1" };
  const context = {
    Date: fixedDate(iso),
    Intl,
    state: {
      attendance: [],
      children: [child],
      contacts: [],
      posts: [],
      notices: [],
      incidentCopies: [],
      pickupWeekReady: false,
    },
    selectedChild: () => child,
    attendanceFor: () => null,
    contactsFor: () => [],
    childInfoChecklist: () => [],
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
    renderSiblingRequestForm: () => "",
    renderPost: () => "",
    emptyState: () => "",
    selectField: () => "<select></select>",
    field: () => "<input>",
    esc: (value) => String(value ?? ""),
  };
  vm.createContext(context);
  vm.runInContext([
    functionSource("todayIso"),
    functionSource("isWeekend"),
    functionSource("parentReminders"),
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

const monday = dashboard("2026-10-26");
assert(monday.html.includes("Inte incheckad"), "vardagen ska behålla incheckningsstatusen");
assert(monday.html.includes('id="daily-plan"'), "vardagen ska behålla dagens plan");
assert(monday.reminders.some((item) => item.target === "daily-plan"), "vardagen ska påminna om dagsplanen");

const roleContext = {};
vm.createContext(roleContext);
vm.runInContext([
  functionSource("allowedViewsForRole"),
  functionSource("defaultViewForRole"),
].join("\n"), roleContext);
assert(roleContext.defaultViewForRole("admin") === "attendance", "administratörer ska börja på Närvaro");
assert(roleContext.defaultViewForRole("staff") === "attendance", "personal ska börja på Närvaro");
assert(roleContext.defaultViewForRole("parent") === "home", "vårdnadshavare ska behålla Min dag");
assert(roleContext.allowedViewsForRole("admin").includes("overview"), "administratörer ska fortfarande kunna öppna Översikt");

console.log("weekend dashboard checks passed");
