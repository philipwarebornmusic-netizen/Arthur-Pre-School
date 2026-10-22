import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("function peopleDirectoryVisible");
const end = source.indexOf("\nfunction renderPeople(");
if (start < 0 || end < start) throw new Error("people directory helpers were not found in app.js");

const state = {
  profile: { id: "admin-1", role: "admin" },
  children: [],
  guardianMessageTargets: [],
  invitations: [],
  organizationPeople: [],
  staffMembers: [],
  termManagers: [],
  childPhotoUrls: { "photo/a.jpg": "https://signed.example/a.jpg" },
};

const context = vm.createContext({
  state,
  departmentName(id) {
    return { d1: "Solen", d2: "Månen, öst" }[id] || "Okänd avdelning";
  },
  childAvatarHtml(name, url) {
    return url ? `<img data-photo="${url}">` : `<span>${name}</span>`;
  },
  childPhotoUrl(path) {
    return path ? state.childPhotoUrls[path] || "" : "";
  },
  staffGroups() {
    return [{ id: "fallback-staff", name: "Fallback Frida", email: "frida@example.test" }];
  },
  staffManagesTerms(id) {
    return id === "staff-term" || id === "admin-1";
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
});
vm.runInContext(source.slice(start, end), context);

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}\n  expected: ${expected}\n  actual:   ${actual}`);
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

eq(context.childGroupStatus(3, 2), "3 barn · 2 saknar födelsedatum", "child group status");
eq(context.childGroupStatus(1, 0), "1 barn", "one child");
eq(context.childGroupStatus(0, 0), "Inga barn", "no children");
eq(context.childGroupStatus(4, 1), "4 barn · 1 saknar födelsedatum", "one missing birth date");

eq(context.guardianGroupStatus(0, 0), "Inga vårdnadshavare", "no guardians");
eq(context.guardianGroupStatus(0, 1), "Inga kopplade · 1 väntande inbjudan", "only a pending invite");
eq(context.guardianGroupStatus(2, 3), "2 vårdnadshavare · 3 väntande inbjudningar", "guardians and invites");
eq(context.guardianGroupStatus(1, 0), "1 vårdnadshavare", "one guardian");

eq(context.staffGroupStatus(0, 0, 0), "Ingen personal", "no staff");
eq(context.staffGroupStatus(1, 2, 1), "1 administratör · 2 personal · 1 terminsschema", "staff group status");
eq(context.staffGroupStatus(2, 1, 0), "2 administratörer · 1 personal", "admins without term permission");

eq(context.childRowStatus(0, false), "Ingen vårdnadshavare", "child without guardians");
eq(context.childRowStatus(1, false), "1 vårdnadshavare", "child with one guardian");
eq(context.childRowStatus(2, true), "Saknar födelsedatum · 2 vårdnadshavare", "child row status");

assert(context.peopleDirectoryVisible("Åsa Berg", ["d1"], "åsa", ""), "Swedish name search");
assert(context.peopleDirectoryVisible("Åsa Berg", ["d1", "d2"], "  ÅSA  ", "d2"), "case and department");
assert(!context.peopleDirectoryVisible("Åsa Berg", ["d1"], "tor", ""), "unrelated name is hidden");
assert(!context.peopleDirectoryVisible("Åsa Berg", ["d1"], "", "d2"), "other department is hidden");
assert(context.peopleDirectoryVisible("Admin", [], "", ""), "blank department filter keeps everyone");
assert(!context.peopleDirectoryVisible("Admin", [], "admin", "d1"), "organisation-wide person is outside a department");

eq(
  ["Örjan", "anna", "Åsa", "Bo", "Äsa", "Zara"].sort(context.compareSwedishName).join("|"),
  "anna|Bo|Zara|Åsa|Äsa|Örjan",
  "Swedish alphabetical order",
);

state.children = Array.from({ length: 32 }, (_, index) => ({
  id: `c${index}`,
  name: index === 0 ? "Åsa" : index === 1 ? "Anna" : `Barn ${String(index).padStart(2, "0")}`,
  department_id: index % 2 === 0 ? "d1" : "d2",
  birth_date: index % 5 === 0 ? "" : "2020-01-01",
  photo_path: index === 1 ? "photo/a.jpg" : "",
  avatar_color: "#abc",
}));
state.guardianMessageTargets = [
  { child_id: "c1", child_name: "Anna", guardian_id: "g1", guardian_name: "Maja", guardian_relation: "Mamma" },
  { child_id: "c2", child_name: "Barn 02", guardian_id: "g1", guardian_name: "Maja", guardian_relation: "Mamma" },
  { child_id: "c1", child_name: "Anna", guardian_id: "g2", guardian_name: "Örjan", guardian_relation: "Pappa" },
  { child_id: "c1", child_name: "Anna", guardian_id: "g1", guardian_name: "Maja", guardian_relation: "Mamma" },
];
state.invitations = [
  { role: "parent", status: "pending" },
  { role: "parent", status: "pending" },
  { role: "staff", status: "pending" },
  { role: "parent", status: "accepted" },
];

const childRows = context.childDirectoryRows();
eq(childRows.length, 32, "thirty-two children stay in one list");
eq(childRows.map((row) => row.name).join("|"), ["Anna", ...Array.from({ length: 30 }, (_, index) => `Barn ${String(index + 2).padStart(2, "0")}`), "Åsa"].join("|"), "children are alphabetical");
eq(childRows[0].status, "2 vårdnadshavare", "Anna's guardian count");
eq(childRows.at(-1).status, "Saknar födelsedatum · Ingen vårdnadshavare", "Åsa's status");
assert(childRows[0].avatar.includes("https://signed.example/a.jpg"), "child photo is used when a signed address exists");
assert(!childRows.at(-1).avatar.includes("data-photo"), "a child without a photo gets initials");
eq(childRows[0].section, "barn-c1", "child detail route");
eq(context.childPeopleStatus(), "32 barn · 7 saknar födelsedatum", "child group card");

const guardianRows = context.guardianDirectoryRows();
eq(guardianRows.map((row) => row.name).join("|"), "Maja|Örjan", "guardians are alphabetical");
eq(guardianRows[0].status, "Anna, Barn 02", "a guardian lists linked children");
eq(guardianRows[0].departmentIds.join("|"), "d2|d1", "guardian departments come from the children");
eq(guardianRows[1].status, "Anna", "second guardian");
eq(context.guardianPeopleStatus(), "2 vårdnadshavare · 2 väntande inbjudningar", "guardian group card");
eq(
  context.directoryDepartments(guardianRows).map((entry) => entry[1]).join("|"),
  "Månen, öst|Solen",
  "department names that contain a comma stay one filter choice",
);

const html = context.renderPeopleDirectory(guardianRows, "Ingen vårdnadshavare är kopplad ännu.");
assert(html.includes(">Månen, öst</option>"), "department filter keeps the comma inside the name");
assert((html.match(/data-people-row/g) || []).length === 2, "one row per guardian");

state.organizationPeople = [
  { id: "admin-1", name: "Admin Anna", email: "anna@example.test", role: "admin", removed_at: null },
  { id: "admin-gone", name: "Borttagen", email: "gone@example.test", role: "admin", removed_at: "2026-01-01" },
  { id: "staff-term", name: "Personal Pia", email: "pia@example.test", role: "staff", removed_at: null },
  { id: "staff-plain", name: "Personal Bo", email: "bo@example.test", role: "staff", removed_at: null },
  { id: "parent-1", name: "Maja", email: "maja@example.test", role: "parent", removed_at: null },
];
state.staffMembers = [
  { staff_id: "staff-term", department_id: "d1", department_name: "Solen" },
  { staff_id: "staff-plain", department_id: "d2", department_name: "Månen, öst" },
];
const staffRows = context.staffDirectoryRows();
eq(staffRows.map((row) => `${row.name}:${row.status}:${row.departmentLabel}`).join("|"), [
  "Admin Anna:Administratör:Hela organisationen",
  "Personal Bo:Personal:Månen, öst",
  "Personal Pia:Personal · Terminsschema:Solen",
].join("|"), "staff list includes admins and term-schedule permission");
eq(context.staffPeopleStatus(), "1 administratör · 2 personal · 1 terminsschema", "staff group card");

state.organizationPeople = [];
const fallback = context.staffDirectoryRows();
eq(fallback.map((row) => row.name).join("|"), "Fallback Frida", "staff list falls back when profiles are empty");

state.profile.role = "staff";
eq(context.staffDirectoryRows().length, 0, "staff cannot open the personnel directory");

console.log("people directory tests passed");
