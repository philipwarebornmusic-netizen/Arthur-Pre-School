import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const pickupSource = readFileSync(new URL("../pickup-hub.js", import.meta.url), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function functionSource(name) {
  let start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} saknas`);
  if (source.slice(start - 6, start) === "async ") start -= 6;
  const brace = source.indexOf("{", start);
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) { escaped = false; continue; }
    if (quote) {
      if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
    if (char === "{") depth += 1;
    if (char === "}" && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} kunde inte läsas`);
}

const child = { id: "child-1", name: "Arthur", department_id: "department-1" };
const input = {
  today: "2026-11-10",
  terms: [{ starts_on: "2026-08-17", ends_on: "2026-12-18", closures: [], standard: [] }],
  dayPlans: [
    { plan_date: "2026-11-09", dropoff_at: "08:00", pickup_at: "15:00", dropoff_person_kind: "guardian", dropoff_person_id: "parent-1", picker_kind: "guardian", picker_id: "parent-1" },
    { plan_date: "2026-11-10", dropoff_at: "08:10", pickup_at: "15:10", dropoff_person_kind: "guardian", dropoff_person_id: "parent-1", picker_kind: "guardian", picker_id: "parent-1" },
    { plan_date: "2026-11-11", dropoff_at: "08:20", pickup_at: "15:20", dropoff_person_kind: "guardian", dropoff_person_id: "parent-1", picker_kind: "contact", picker_id: "contact-1" },
    { plan_date: "2026-11-12", dropoff_at: "08:30", pickup_at: "15:30", dropoff_person_kind: "guardian", dropoff_person_id: "parent-1", picker_kind: "guardian", picker_id: "parent-1" },
    { plan_date: "2026-11-13", dropoff_at: "08:40", pickup_at: "15:40", dropoff_person_kind: "guardian", dropoff_person_id: "parent-1", picker_kind: "guardian", picker_id: "parent-1" },
  ],
  standardPickers: [],
  viewerId: "parent-1",
};

const context = {
  Date: class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-11-10T10:00:00+01:00"])); }
    static now() { return new Date("2026-11-10T10:00:00+01:00").valueOf(); }
  },
  Intl,
  state: { profile: { id: "parent-1", role: "parent" }, pickupWeekReady: true },
  selectedChild: () => child,
  isSchoolChild: () => false,
  featureEnabled: () => true,
  pickupGridInput: () => input,
  plannedAbsenceStatus: () => "",
  assistantResult: (text, sourceName, action = {}) => ({ text, source: sourceName, ...action }),
};
vm.createContext(context);
vm.runInContext(pickupSource, context);
vm.runInContext([
  functionSource("todayIso"),
  functionSource("shiftIsoDate"),
  functionSource("assistantRequestedClock"),
  functionSource("assistantPickupChangeRequest"),
  functionSource("assistantMutationsMatch"),
  functionSource("executeAssistantMutation"),
  functionSource("assistantIntentForQuestion"),
].join("\n"), context);

const proposal = vm.runInContext(`assistantPickupChangeRequest("Ändra alla upphämtningstider för veckan till 16:30")`, context);
assert(proposal?.mutation?.kind === "pickup-week", "en tydlig veckobegäran ska skapa en bekräftningsbar åtgärd");
assert(proposal.confirmationLabel === "Ändra hämtningstiderna", "åtgärden ska kräva en tydlig bekräftelse");
assert(proposal.mutation.rows.length === 4, "bara idag och återstående vardagar ska ändras");
assert(proposal.mutation.rows.every((row) => row.pickup_at === "16:30"), "samtliga återstående hämtningstider ska få den begärda tiden");
assert(proposal.mutation.rows[0].dropoff_at === "08:10", "lämningstider ska bevaras");
assert(proposal.mutation.rows[1].picker_kind === "contact" && proposal.mutation.rows[1].picker_id === "contact-1", "hämtare ska bevaras");
assert(!proposal.mutation.rows.some((row) => row.plan_date === "2026-11-09"), "förflutna dagar får inte skrivas om");

const nextWeek = vm.runInContext(`assistantPickupChangeRequest("Sätt alla hämtningstider nästa vecka till 16:45")`, context);
assert(nextWeek.mutation?.rows.length === 5 && nextWeek.mutation.rows[0].plan_date === "2026-11-16", "nästa vecka ska flytta måndagen sju dagar och omfatta fem öppna vardagar");
assert(nextWeek.mutation.rows.every((row) => row.pickup_at === "16:45"), "nästa vecka ska använda den uttryckligt begärda tiden");


const numberedWeek = vm.runInContext(`assistantPickupChangeRequest("Ändra alla hämtningstider vecka 47 till 16:30")`, context);
assert(!numberedWeek.mutation && numberedWeek.text.includes("den här veckan eller nästa vecka"), "en numrerad vecka får inte feltolkas som den aktuella veckan");
const invalid = vm.runInContext(`assistantPickupChangeRequest("Ändra alla hämtningstider för veckan till 07:30")`, context);
assert(!invalid.mutation && invalid.text.includes("före lämningstiden"), "en hämtningstid före lämning ska stoppas före mutation");

const lookupIntent = vm.runInContext(`assistantIntentForQuestion("Vilka hämtningstider har vi den här veckan?")`, context);
assert(lookupIntent === "week-schedule", "en informationsfråga om veckan ska läsa veckoschemat, inte dagens plan");

const rpcCalls = [];
context.loadData = async () => {};
context.rpc = async (name, row) => { rpcCalls.push({ name, row }); };
input.dayPlans.find((row) => row.plan_date === "2026-11-10").dropoff_at = "08:15";
const staleResult = await vm.runInContext(`executeAssistantMutation(${JSON.stringify(proposal.mutation)})`, context);
assert(rpcCalls.length === 0, "ett schema som ändrats efter förslaget får inte skrivas utan en ny bekräftelse");
assert(staleResult.confirmationLabel === "Ändra hämtningstiderna" && staleResult.text.includes("bekräfta igen"), "ett ändrat schema ska visas som ett nytt bekräftningsbart förslag");

input.dayPlans.find((row) => row.plan_date === "2026-11-10").dropoff_at = "08:10";
rpcCalls.length = 0;
const savedResult = await vm.runInContext(`executeAssistantMutation(${JSON.stringify(proposal.mutation)})`, context);
assert(rpcCalls.length === 4 && rpcCalls.every((call) => call.name === "save_pickup_day_handoffs"), "bekräftelsen ska spara varje återstående dag via den behörighetskontrollerade RPC:n");
assert(savedResult.text.includes("ändrad till 16:30 för 4 dagar"), "en fullständig sparning ska ge en konkret kvittens");

console.log("assistant action checks passed");
