import { readFileSync } from "node:fs";
import vm from "node:vm";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sql = readFileSync(new URL("../supabase/016_permanent_pickup_passes.sql", import.meta.url), "utf8");
const start = app.indexOf("function permanentPassStatusLabel");
const end = app.indexOf("function renderScanCard");
if (start < 0 || end < start) throw new Error("permanent pass helpers were not found in app.js");

function formatDate(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("sv-SE", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

const context = {
  formatDate,
  state: { permanentPasses: [], pickupContacts: [], children: [] },
  childAvatarHtml(name) {
    return `<span class="child-avatar">${name}</span>`;
  },
  contactPhotoUrl() {
    return "";
  },
  esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  },
};
vm.createContext(context);
vm.runInContext(app.slice(start, end), context);

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}\n  expected: ${expected}\n  actual:   ${actual}`);
}

const names = new Map([["c1", "Arthur"], ["c2", "Signe"], ["c3", "Tor"]]);
const contacts = [
  { contact_id: "k1", child_id: "c1", name: "Karin", relation: "Mormor", blocked: false },
  { contact_id: "k2", child_id: "c2", name: " Karin ", relation: "mormor", blocked: false },
  { contact_id: "k3", child_id: "c3", name: "Karin", relation: "Mormor", blocked: true },
  { contact_id: "k4", child_id: "c9", name: "Karin", relation: "Mormor", blocked: false },
];
const linked = context.permanentLinkedContacts(contacts, names, "k1");
eq(linked.map((item) => item.childName).join("|"), "Signe", "same guardian's allowed sibling is linked");
eq(context.permanentLinkedContacts(contacts, names, "k3").length, 0, "a blocked contact cannot start a pass");
eq(context.permanentValidityLabel(null), "Gäller tills vidare", "default has no end date");
eq(context.permanentValidityLabel("2026-12-31"), `Gäller till och med ${formatDate("2026-12-31")}`, "optional end date");
eq(context.permanentPassStatusLabel("blocked"), "Får ej hämta", "blocked status");

const card = context.renderPermanentScanCard({
  pickup_relation: "Mormor",
  pickup_name: "Karin",
  ends_on: null,
  issued_by: "Anna",
  children: [
    { child_id: "c1", child_name: "Arthur", checked_in: true },
    { child_id: "c2", child_name: "Signe", checked_in: false },
  ],
});
if (!card.includes("Permanent hämtpass")) throw new Error("staff card must say the pass is permanent");
if (!card.includes("Mormor Karin")) throw new Error("staff card must show relation and name");
if (!card.includes("Be om legitimation")) throw new Error("staff card must ask for ID");
if (!card.includes("Checka ut Arthur")) throw new Error("checked-in child can be confirmed");
if (card.includes("Checka ut Signe")) throw new Error("a child who is not checked in cannot be confirmed");
if (!card.includes("data-action=\"confirm-permanent-pickup\"")) throw new Error("confirmation stays off the one-day action");

if (sql.includes("create or replace function public.create_pickup_pass")) throw new Error("one-day create must stay untouched");
if (sql.includes("encode(gen_random_bytes(")) throw new Error("token bytes must be schema-qualified");
if ((sql.match(/encode\(extensions\.gen_random_bytes\(32\), 'hex'\)/g) || []).length !== 2) {
  throw new Error("both permanent pass tokens must use extensions.gen_random_bytes");
}
if (sql.includes("create or replace function public.confirm_pickup(")) throw new Error("one-day confirm must stay untouched");
if (!sql.includes("hämtades av")) throw new Error("notice text is missing");
if (!sql.includes("HH24.MI")) throw new Error("notice clock should match 15.42");
if (!sql.includes("perform public.pickup_rate_limit('token:'")) throw new Error("public lookup must keep the token rate limit");
if (!sql.includes("perform public.pickup_rate_limit('ip:'")) throw new Error("public lookup must keep the address rate limit");
if (!sql.includes("grant execute on function public.get_pass_by_token(text) to anon, authenticated")) throw new Error("public link must stay anonymous");
if (!sql.includes("revoke all on function public.create_permanent_pickup_pass(uuid, date, boolean) from public, anon, authenticated")) {
  throw new Error("new functions must be revoked before grants");
}
if (!/enable row level security/.test(sql)) throw new Error("RLS must be enabled");

console.log("permanent pass tests passed");
