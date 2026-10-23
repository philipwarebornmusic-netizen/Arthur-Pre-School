import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const app = readFileSync(new URL("app.js", root), "utf8");
const sql = readFileSync(new URL("supabase/018_pickup_hub.sql", root), "utf8");
const html = readFileSync(new URL("index.html", root), "utf8");

const context = { globalThis: {} };
vm.createContext(context);
vm.runInContext(readFileSync(new URL("pickup-hub.js", root), "utf8"), context);
const { ArtanPickup } = context.globalThis;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}\n  expected: ${expected}\n  actual:   ${actual}`);
}

function day(grid, iso) {
  return grid.weeks.flatMap((week) => week.days).find((item) => item.iso === iso);
}

function sliceFunction(source, name) {
  const marker = `create or replace function public.${name}`;
  const start = source.indexOf(marker);
  assert(start >= 0, `${name} saknas`);
  const next = source.indexOf("\ncreate or replace function ", start + marker.length);
  const revoke = source.indexOf("\nrevoke all on function", start + marker.length);
  const end = next >= 0 ? next : revoke;
  return source.slice(start, end);
}

eq(ArtanPickup.weekMonday("2026-10-22"), "2026-10-19", "torsdag hör till måndagen");
eq(ArtanPickup.weekMonday("2026-10-25"), "2026-10-19", "söndag hör till samma vecka");
eq(ArtanPickup.weekLabel("2026-10-19"), "19 okt–23 okt v.43", "veckoetikett");
eq(ArtanPickup.weekdayNumber("2026-10-24"), 0, "lördag är ingen schemadag");
eq(ArtanPickup.weekdayNumber("2026-10-19"), 1, "måndag är veckodag 1");

const standard = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  attending: true,
  dropoff_at: "08:00:00",
  pickup_at: "16:30:00",
}));
const base = {
  today: "2026-10-22",
  terms: [{
    starts_on: "2026-10-20",
    ends_on: "2026-11-06",
    closures: ["2026-10-23"],
    closureReasons: { "2026-10-23": "Planering <dag>" },
    standard,
  }],
  dayPlans: [],
  standardPickers: [],
};

const empty = ArtanPickup.buildTermGrid(base);
eq(empty.weeks[0].label, "19 okt–23 okt v.43", "första raden är vecka 43");
assert(!empty.weeks.some((week) => week.days.some((item) => item.weekday === 0)), "helger visas inte");
assert(empty.weeks[0].needsPlan && empty.unfilled, "ofylld vecka inom sju dagar markeras");
assert(!empty.weeks.at(-1).needsPlan, "veckor efter horisonten markeras inte");
eq(day(empty, "2026-10-19").outside, true, "dagen före terminen är utanför");
eq(day(empty, "2026-10-22").today, true, "torsdagen är idag");
eq(day(empty, "2026-10-23").closed, true, "stängningsdagen kommer från terminen");
eq(day(empty, "2026-10-23").filled, false, "en stängd dag räknas inte som ofylld plan");
eq(day(empty, "2026-10-20").times, "08:00–16:30", "standardveckan ger tiderna");
eq(day(empty, "2026-10-20").filled, false, "tid utan hämtare är inte ifylld");

const guardians = ArtanPickup.buildTermGrid({
  ...base,
  standardPickers: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, picker_kind: "guardian", picker_id: "g1" })),
});
eq(day(guardians, "2026-10-22").filled, true, "standardtid och vårdnadshavare fyller dagen");
eq(day(guardians, "2026-10-22").otherPerson, false, "vårdnadshavare får ingen personikon");
assert(!guardians.unfilled, "ifylld horisont ger ingen påminnelse");

const contacts = ArtanPickup.buildTermGrid({
  ...base,
  standardPickers: [{ weekday: 4, picker_kind: "contact", picker_id: "c1" }],
});
eq(day(contacts, "2026-10-22").otherPerson, true, "hämtlistan ger en personikon");
eq(day(contacts, "2026-10-21").otherPerson, false, "en annan veckodag ärver inte ikonen");

const carried = ArtanPickup.buildTermGrid({
  ...base,
  dayPlans: [{
    plan_date: "2026-10-15",
    dropoff_at: "07:30",
    pickup_at: "15:00",
    picker_kind: "pass",
    picker_id: "day-pass",
    pass_kind: "day",
  }],
  standardPickers: [{ weekday: 4, picker_kind: "guardian", picker_id: "g1" }],
});
const thursday = day(carried, "2026-10-22");
eq(thursday.times, "07:30–15:00", "förra veckans tider används");
eq(thursday.picker.kind, "guardian", "ett engångspass följer inte med");
eq(thursday.otherPerson, false, "vårdnadshavaren från standardveckan syns inte som ikon");

const permanent = ArtanPickup.buildTermGrid({
  ...base,
  dayPlans: [{
    plan_date: "2026-10-15",
    dropoff_at: "09:00",
    pickup_at: "14:00",
    picker_kind: "pass",
    picker_id: "perm",
    pass_kind: "permanent",
  }],
});
eq(day(permanent, "2026-10-22").picker.passKind, "permanent", "ett permanent pass följer med från förra veckan");
eq(day(permanent, "2026-10-22").otherPerson, true, "permanent pass ger en personikon");

const explicit = ArtanPickup.buildTermGrid({
  ...base,
  dayPlans: [
    { plan_date: "2026-10-15", dropoff_at: "07:30", pickup_at: "15:00", picker_kind: "guardian", picker_id: "g1" },
    { plan_date: "2026-10-22", dropoff_at: "08:15", pickup_at: "16:00", picker_kind: "pass", picker_id: "once", pass_kind: "day" },
  ],
});
eq(day(explicit, "2026-10-22").times, "08:15–16:00", "dagens egen tid vinner");
eq(day(explicit, "2026-10-22").picker.passKind, "day", "dagens engångspass visas den dagen");

const quiet = ArtanPickup.buildTermGrid({ ...base, markUnfilled: false });
assert(!quiet.unfilled && quiet.weeks.every((week) => !week.needsPlan), "saknad migration döljer påminnelsen");

const editable = ArtanPickup.renderTermGrid(base, { editable: true });
assert(editable.includes("19 okt–23 okt") && editable.includes("v.43"), "kalendern visar datum och vecka");
assert(editable.includes(">Mån<") && editable.includes(">Fre<") && !editable.includes(">Lör<") && !editable.includes(">Sön<"), "kolumnerna är måndag till fredag");
assert(editable.includes('id="pickup-today"') && editable.includes("is-today"), "idag är markerad");
assert(editable.includes('id="pickup-current-week"'), "aktuell vecka kan scrollas fram");
assert(editable.includes("is-closed") && editable.includes("term-closed-icon") && editable.includes("Stängt") && editable.includes("Planering &lt;dag&gt;"), "stängd dag är rosa i texten och ikonen");
assert(!editable.includes("Planering <dag>"), "anledningen escapas");
assert(editable.includes("is-outside"), "dagar utanför terminen är grå");
assert(editable.includes('data-action="edit-pickup-week"') && editable.includes('data-monday="2026-10-19"'), "en vecka går att öppna");
assert(!editable.includes("edit-pickup-day") && !editable.includes("term-cell-day"), "dagen redigeras inte inline och datumet är inte rubrik");
assert(editable.includes(">08:00<") && editable.includes(">16:30<"), "rutan visar lämning och hämtning");
assert(editable.includes("is-unfilled") && editable.includes("Inte ifylld"), "ofylld vecka syns i kalendern");
assert(editable.includes("term-person") === false || editable.includes('aria-label="Någon annan hämtar"'), "personikonen har ett namn");

const withPerson = ArtanPickup.renderTermGrid(contacts, { editable: true });
assert(withPerson.includes("term-person") && withPerson.includes("Någon annan hämtar"), "hämtlista ritar personikonen");
const guardianHtml = ArtanPickup.renderTermGrid(guardians, { editable: true });
assert(!guardianHtml.includes("term-person"), "vårdnadshavare ritar ingen personikon");
assert(!guardianHtml.includes("Inte ifylld"), "ifylld vecka är inte markerad");
const otherGuardian = ArtanPickup.buildTermGrid({
  ...base,
  viewerId: "me",
  standardPickers: [{ weekday: 4, picker_kind: "guardian", picker_id: "g1" }],
});
eq(day(otherGuardian, "2026-10-22").otherPerson, true, "en annan vårdnadshavare ger personikon");
const selfGuardian = ArtanPickup.buildTermGrid({
  ...base,
  viewerId: "g1",
  standardPickers: [{ weekday: 4, picker_kind: "guardian", picker_id: "g1" }],
});
eq(day(selfGuardian, "2026-10-22").otherPerson, false, "inloggad vårdnadshavare ger ingen personikon");

const readonly = ArtanPickup.renderTermGrid(base);
assert(!readonly.includes("<button") && !readonly.includes("edit-pickup-week"), "terminsöversikten är skrivskyddad");
assert(readonly.includes("08:00–16:30") && readonly.includes("is-closed"), "samma kalender visar tider och stängt");

const sheet = ArtanPickup.renderWeekEditor({
  weekNumber: 43,
  days: [
    { iso: "2026-10-19", weekday: 1, dropoff: "08:00", pickup: "16:30", ledig: false, open: true, initials: "AB", avatarKind: "guardian" },
    { iso: "2026-10-23", weekday: 5, closed: true, open: false },
  ],
});
assert(sheet.includes("Vecka 43") && sheet.includes("Mån 19 okt") && sheet.includes(">Ledig<") && sheet.includes('type="time"') && sheet.includes(">Spara<") && sheet.includes("is-closed"), "veckovyn visar datum, tider och stängt");
assert(sheet.includes('data-action="save-pickup-week"') && sheet.includes('data-action="open-picker"'), "veckovyn sparar och väljer hämtare");
assert(sheet.includes('data-action="same-as-previous-week"') && sheet.includes("Samma som förra veckan"), "veckovyn kan fyllas från förra veckan");
assert(sheet.includes("Fyll i en dag, så följer de andra tomma dagarna med. Ledig hoppar över dagen."), "hinten förklarar ifyllnaden");
assert(!sheet.includes('data-week-ledig" checked') && !sheet.includes("checked"), "Ledig är avmarkerad när dagen inte är ledig");

function editorDay(days, iso) {
  return days.find((item) => item.iso === iso);
}

const weekTerm = {
  today: "2026-10-22",
  terms: [{
    starts_on: "2026-10-19",
    ends_on: "2026-10-30",
    closures: ["2026-10-23"],
    standard: [],
  }],
  dayPlans: [],
  standardPickers: [],
};
const mondayOnly = ArtanPickup.weekEditorSeed({
  ...weekTerm,
  dayPlans: [{ plan_date: "2026-10-19", dropoff_at: "08:00", pickup_at: "16:30", picker_kind: "guardian", picker_id: "g1" }],
}, "2026-10-19", "me");
eq(editorDay(mondayOnly, "2026-10-19").origin, "own", "måndagens sparade tid behålls");
eq(editorDay(mondayOnly, "2026-10-20").dropoff, "08:00", "tom tisdag får måndagens lämning");
eq(editorDay(mondayOnly, "2026-10-20").pickup, "16:30", "tom tisdag får måndagens hämtning");
eq(editorDay(mondayOnly, "2026-10-20").origin, "copied", "den kopierade dagen är ett förslag");
eq(editorDay(mondayOnly, "2026-10-20").picker.id, "g1", "hämtaren följer med");
eq(editorDay(mondayOnly, "2026-10-20").ledig, false, "Ledig är inte ikryssad");
assert(editorDay(mondayOnly, "2026-10-23").closed && !editorDay(mondayOnly, "2026-10-23").dropoff, "stängd fredag fylls inte");
assert(mondayOnly.filter((day) => day.open).every((day) => !day.ledig), "öppna dagar börjar utan Ledig");

const fromStandard = ArtanPickup.weekEditorSeed({
  ...weekTerm,
  terms: [{
    ...weekTerm.terms[0],
    standard: [1, 2, 4, 5].map((weekday) => ({ weekday, attending: true, dropoff_at: "08:15", pickup_at: "15:45" })),
  }],
  dayPlans: [{ plan_date: "2026-10-14", dropoff_at: "07:00", pickup_at: "14:00", picker_kind: "contact", picker_id: "old" }],
  standardPickers: [{ weekday: 4, picker_kind: "guardian", picker_id: "g1" }],
}, "2026-10-19", "me");
eq(editorDay(fromStandard, "2026-10-20").dropoff, "08:15", "standardveckan fyller tisdag");
eq(editorDay(fromStandard, "2026-10-20").origin, "standard", "standardveckan används före äldre veckor");
eq(editorDay(fromStandard, "2026-10-22").picker.id, "g1", "standardhämtaren följer med");
eq(editorDay(fromStandard, "2026-10-21").dropoff, "", "en dag utan standardrad lämnas tom");
eq(editorDay(fromStandard, "2026-10-19").picker.id, "me", "saknad hämtare blir den inloggade");
eq(editorDay(fromStandard, "2026-10-19").pickerDefault, true, "standardvalet är ett förslag");

const fromRecent = ArtanPickup.weekEditorSeed({
  ...weekTerm,
  dayPlans: [
    { plan_date: "2026-10-05", dropoff_at: "07:00", pickup_at: "14:00", picker_kind: "guardian", picker_id: "old" },
    { plan_date: "2026-10-12", dropoff_at: "09:00", pickup_at: "15:00", picker_kind: "contact", picker_id: "c1" },
    { plan_date: "2026-10-14", dropoff_at: "09:30", pickup_at: "15:30", picker_kind: "guardian", picker_id: "g2" },
  ],
}, "2026-10-19", "me");
eq(editorDay(fromRecent, "2026-10-19").dropoff, "09:00", "senaste sparade veckans måndag används");
eq(editorDay(fromRecent, "2026-10-19").origin, "recent", "senaste veckan är källan");
eq(editorDay(fromRecent, "2026-10-19").picker.id, "c1", "senaste veckans hämtare används");
eq(editorDay(fromRecent, "2026-10-21").dropoff, "09:30", "senaste veckans onsdag används");
eq(editorDay(fromRecent, "2026-10-21").picker.id, "g2", "onsdagens hämtare skrivs inte över");
eq(editorDay(fromRecent, "2026-10-20").dropoff, "09:00", "en veckodag som saknades fylls från första dagen");
eq(editorDay(fromRecent, "2026-10-20").origin, "copied", "den ifyllda dagen är ett förslag");

const blank = ArtanPickup.weekEditorSeed(weekTerm, "2026-10-19", "me");
assert(blank.filter((day) => day.open).every((day) => !day.dropoff && !day.pickup && !day.ledig), "helt tom vecka lämnas tom");
eq(ArtanPickup.usualWeekValue(blank, "dropoff"), "08:00", "tom lämning öppnas på 08:00");
eq(ArtanPickup.usualWeekValue(blank, "pickup"), "16:30", "tom hämtning öppnas på 16:30");
eq(ArtanPickup.usualWeekValue(mondayOnly, "dropoff"), "08:00", "vanlig lämning tas från veckan");

const locked = mondayOnly.map((day) => (day.iso === "2026-10-21" ? { ...day, dropoff: "10:00", pickup: "14:00", manual: true, origin: "user" } : day));
const smart = ArtanPickup.smartFillWeek(locked, "2026-10-19", "dropoff", "09:10");
eq(editorDay(smart, "2026-10-19").dropoff, "09:10", "källdagen uppdateras");
eq(editorDay(smart, "2026-10-19").manual, true, "ändrad dag är manuell");
eq(editorDay(smart, "2026-10-20").dropoff, "09:10", "förslag följer den nya tiden");
eq(editorDay(smart, "2026-10-21").dropoff, "10:00", "manuell dag skrivs inte över");
eq(editorDay(smart, "2026-10-23").dropoff, "", "stängd dag skrivs inte över");
const ledigLocked = ArtanPickup.smartFillWeek(mondayOnly.map((day) => (day.iso === "2026-10-20" ? { ...day, ledig: true } : day)), "2026-10-19", "pickup", "17:00");
eq(editorDay(ledigLocked, "2026-10-20").pickup, "16:30", "Ledig hoppas över");
const cleared = ArtanPickup.smartFillWeek(mondayOnly, "2026-10-19", "dropoff", "");
eq(editorDay(cleared, "2026-10-19").dropoff, "", "tom tid töms bara på den dagen");
eq(editorDay(cleared, "2026-10-20").dropoff, "08:00", "övriga dagar behåller tiden");

const picked = ArtanPickup.smartFillWeek(blank, "2026-10-19", "dropoff", "08:00");
eq(editorDay(picked, "2026-10-20").dropoff, "08:00", "första tiden fyller tomma dagar");
const both = ArtanPickup.assignDefaultPicker(ArtanPickup.smartFillWeek(picked, "2026-10-19", "pickup", "16:30"), "me");
eq(editorDay(both, "2026-10-22").picker.id, "me", "ifylld dag utan hämtare får den inloggade");
eq(editorDay(both, "2026-10-22").pickerDefault, true, "standardhämtaren kan bytas");
const chosen = ArtanPickup.smartFillWeek(both, "2026-10-22", "picker", { kind: "contact", id: "c1", passKind: "" });
eq(editorDay(chosen, "2026-10-20").picker.id, "c1", "vald hämtare följer med till förslag");
eq(editorDay(chosen, "2026-10-22").manual, true, "dagen man valde hämtare på är manuell");

const closedLedig = mondayOnly.map((day) => (day.iso === "2026-10-20" ? { ...day, ledig: true, dropoff: "", pickup: "", picker: null, pickerDefault: false } : day));
const reopened = ArtanPickup.reopenWeekDay(closedLedig, "2026-10-20", "me");
eq(editorDay(reopened, "2026-10-20").ledig, false, "avmarkerad Ledig öppnar dagen");
eq(editorDay(reopened, "2026-10-20").dropoff, "08:00", "avmarkerad Ledig fyller vanlig lämning");
eq(editorDay(reopened, "2026-10-20").pickup, "16:30", "avmarkerad Ledig fyller vanlig hämtning");
eq(editorDay(reopened, "2026-10-20").picker.id, "g1", "avmarkerad Ledig får veckans hämtare");
eq(editorDay(reopened, "2026-10-20").manual, true, "återöppnad dag är manuell");

const previous = ArtanPickup.fillFromPreviousWeek(blank, {
  dayPlans: [
    { plan_date: "2026-10-12", dropoff_at: "07:20", pickup_at: "15:10", picker_kind: "contact", picker_id: "c9" },
    { plan_date: "2026-10-13", dropoff_at: "07:30", pickup_at: "15:20", picker_kind: "guardian", picker_id: "g1" },
    { plan_date: "2026-10-16", dropoff_at: "07:40", pickup_at: "15:40", picker_kind: "guardian", picker_id: "g1" },
  ],
}, "2026-10-19");
eq(previous.copied, 2, "bara sparade vardagar räknas");
eq(editorDay(previous.days, "2026-10-19").dropoff, "07:20", "förra måndagen kopieras");
eq(editorDay(previous.days, "2026-10-20").pickup, "15:20", "förra tisdagen kopieras");
eq(editorDay(previous.days, "2026-10-19").picker.id, "c9", "förra veckans hämtare kopieras");
eq(editorDay(previous.days, "2026-10-21").dropoff, "", "en osparad dag lämnas");
assert(editorDay(previous.days, "2026-10-23").closed && !editorDay(previous.days, "2026-10-23").dropoff, "stängd dag kopieras inte");
eq(ArtanPickup.fillFromPreviousWeek(blank, { dayPlans: [] }, "2026-10-19").copied, 0, "tom förra vecka kopierar inget");
const pickerSheet = ArtanPickup.renderPickerSheet({
  weekdayName: "torsdag",
  people: [
    { token: "guardian:g1", name: "Anna Berg", initials: "AB", kind: "guardian", selected: true },
    { token: "contact:c1", name: "Mormor Karin", initials: "MK", kind: "contact", selected: false },
  ],
});
assert(pickerSheet.includes("Hämtar torsdag") && pickerSheet.includes("is-contact") && pickerSheet.includes("Anna Berg") && pickerSheet.includes("Bekräfta"), "hämtarlistan skiljer kontaktpersoner");
eq(ArtanPickup.personInitials("Anna Berg"), "AB", "initialer");
eq(ArtanPickup.weekdayName("2026-10-22", "full"), "torsdag", "veckodag i klartext");

const staff = ArtanPickup.staffPickupCaption([
  { plan_date: "2026-10-22", in_term: true, closed: false, dropoff_at: "08:00", pickup_at: "16:30", picker_label: "Mormor Karin" },
  { plan_date: "2026-10-19", in_term: true, closed: false, dropoff_at: "08:00", pickup_at: "16:30" },
  { plan_date: "2026-10-20", in_term: true, closed: true, dropoff_at: "08:00", pickup_at: "16:30" },
  { plan_date: "2026-10-21", in_term: false, dropoff_at: "08:00", pickup_at: "16:30" },
  { plan_date: "2026-10-23", in_term: true, closed: false },
], "2026-10-22");
eq(staff.todayText, "Idag 08:00–16:30 · Mormor Karin", "personal ser dagens tid och hämtare");
eq(staff.weekText, "mån 08:00–16:30, tor 08:00–16:30", "veckoraden hoppar över stängt, utanför och tomt");
eq(ArtanPickup.staffPickupCaption([{ plan_date: "2026-10-22", in_term: true, closed: true }], "2026-10-22").todayText, "Idag stängt", "stängd dag för personal");
eq(ArtanPickup.staffPickupCaption([{ plan_date: "2026-10-22", in_term: true, closed: false }], "2026-10-22").todayText, "Idag ingen planerad tid", "öppen dag utan tid");

const calendarSql = sliceFunction(sql, "list_pickup_calendar");
const departmentSql = sliceFunction(sql, "list_department_pickup_plans");
const revealSql = sliceFunction(sql, "reveal_pickup_pass");
const rememberSql = sliceFunction(sql, "remember_pickup_pass_token");
const copySql = sliceFunction(sql, "copy_pickup_week");
assert(!calendarSql.includes("pickup_pass_secrets"), "kalendern läser inte den råa koden");
assert(!departmentSql.includes("pickup_pass_secrets") && !/\btoken\b/.test(departmentSql), "personalens lista saknar koder");
assert(revealSql.includes("pickup_pass_secrets.pass_kind") && revealSql.includes("pickup_pass_secrets.pass_id"), "öppna pass kvalificerar kolumnerna");
assert(revealSql.includes("is_guardian") && revealSql.includes("expires_at > now()") && revealSql.includes("permanent_contact_allowed"), "öppna pass kräver vårdnadshavare och ett pass som gäller");
assert(revealSql.includes("Välj Ny kod") && revealSql.includes("Skapa passet på nytt"), "gamla pass säger hur de skapas om");
assert(rememberSql.includes("set search_path = public, extensions") && revealSql.includes("set search_path = public, extensions"), "tokenfunktionerna låser search_path");
assert(copySql.includes("is distinct from 'permanent'"), "kopiering släpper engångspass");
assert(sql.includes("save_child_weekly_schedule"), "standardveckan återanvänder det befintliga veckoschemat");
assert(sql.includes("pickup_day_plan_log") && sql.includes("'day'") && sql.includes("'standard'") && sql.includes("'copy'"), "ändringar loggas");
for (const name of ["save_pickup_day", "save_pickup_standard_week", "copy_pickup_week"]) {
  assert(sliceFunction(sql, name).includes("is_guardian"), `${name} kräver vårdnadshavare`);
}
assert((sql.match(/enable row level security/g) || []).length >= 4, "RLS är på");
assert(sql.includes("revoke all on table public.pickup_pass_secrets from public, anon, authenticated"), "kodtabellen är stängd");
assert(!sql.includes("create or replace function public.create_pickup_pass"), "engångspasset skrivs inte om");
assert(!sql.includes("create or replace function public.create_permanent_pickup_pass"), "det permanenta passet skrivs inte om");
assert(!/grant execute on function[\s\S]*?\bto anon\b/.test(sql), "anonyma får inte de nya funktionerna");
assert(!/grant execute on function public\.(pickup_picker_problem|pickup_picker_label|pickup_effective_plan|forget_pickup_pass_secret)/.test(sql), "hjälpfunktionerna är inte anropbara");
assert(sql.includes("grant execute on function public.reveal_pickup_pass(uuid, text) to authenticated"), "inloggade vårdnadshavare kan öppna passet");
assert(sql.includes("on conflict on constraint pickup_pass_secrets_pkey"), "sparad länk använder primärnyckeln");
assert((sql.match(/on conflict on constraint pickup_day_plans_child_id_plan_date_key/g) || []).length === 2, "dagsplanerna använder unik-nyckeln");
assert(!/on conflict \(/i.test(sql), "on conflict ska inte namnge kolumner som krockar med parametrar");
assert(sliceFunction(sql, "save_pickup_standard_week").includes("jsonb_array_elements(weekly_schedule) day_item"), "standardveckan använder aliaset day_item");
const purgeSql = sliceFunction(sql, "purge_expired_pickup_details");
assert(purgeSql.includes("interval '7 days'") && purgeSql.includes("delete from public.pickup_pass_secrets"), "utgångna länkar rensas tillsammans med namnen");
assert(sql.includes("pass_kind = 'permanent'"), "standardhämtare kan bara vara ett permanent pass");

assert(html.includes('<script src="pickup-hub.js"></script>'), "kalendern laddas");
const nav = app.slice(app.indexOf("function renderNav"), app.indexOf("function render()"));
assert(nav.includes('["pickup", "◎", "Hämtning"]'), "Hämtning ligger i vårdnadshavarens meny");
const staffNav = nav.slice(nav.indexOf('role === "staff"'), nav.indexOf('["home", "●", "Min dag"]'));
assert(staffNav.startsWith('role === "staff"') && !staffNav.includes("Hämtning"), "personal får ingen Hämtning-knapp");
assert(app.includes('staff: ["attendance", "messages", "people", "incidents", "account"]'), "personalens vyer är oförändrade");
assert(!app.includes('registerHubCard("child", { id: "hamtlista"'), "Hämtlista-kortet är borta");
assert(app.includes("Öppna Hämtning") && app.includes("Hämtlistan, hämtpassen och veckoschemat finns under Hämtning"), "Kontaktpersoner länkar till Hämtning");
for (const needle of ["share-pass", "print-pass", "open-pass", "remember_pickup_pass_token", "reveal_pickup_pass", "renderTermGrid", "edit-pickup-week", "save-pickup-week", "open-picker", "same-as-previous-week", "weekEditorSeed", "smartFillWeek", "reopenWeekDay", "pickup-current-week", "pickup-add", "copy-pickup-week", "Ändra i Hämtning", "list_department_pickup_plans"]) {
  assert(app.includes(needle), `appen saknar ${needle}`);
}
assert(!app.includes("edit-pickup-day") && !app.includes('data-form="pickup-day"'), "dagformuläret är borta");
assert(app.includes("pass.pass_status === \"active\" || pass.pass_status === \"scheduled\""), "ett pass som inte har börjat kan öppnas");

console.log("pickup hub checks passed");
