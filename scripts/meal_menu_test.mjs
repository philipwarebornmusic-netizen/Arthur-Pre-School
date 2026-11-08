import assert from "node:assert/strict";
import "../meals.js";

const meals = globalThis.ArtanMeals;

const tabs = {
  parent: meals.tabsForRole("parent").map((item) => item[2]),
  staff: meals.tabsForRole("staff").map((item) => item[2]),
  admin: meals.tabsForRole("admin").map((item) => item[2]),
};
assert.deepEqual(tabs.parent, ["Min dag", "Hämtning", "Meddelanden", "Mer"]);
assert.deepEqual(tabs.staff, ["Närvaro", "Matsedel", "Meddelanden", "Mer"]);
assert.deepEqual(tabs.admin, ["Närvaro", "Matsedel", "Meddelanden", "Mer"]);
assert.equal(meals.tabsForRole("staff").length, 4);
assert.equal(meals.buriedViews("staff").includes("people"), true);
assert.equal(meals.buriedViews("admin").includes("overview"), true);
assert.equal(meals.allowedViews("parent").includes("meals"), true);
assert.equal(tabs.parent.includes("Matsedel"), false);

assert.equal(meals.mondayOf("2026-11-10"), "2026-11-09");
assert.equal(meals.mondayOf("2026-11-08"), "2026-11-02");
assert.equal(meals.servingDate("2026-11-08"), "2026-11-09");
assert.deepEqual(meals.weekDays("2026-11-09"), [
  "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13",
]);

const fileOnly = meals.presentation({
  today: "2026-11-10",
  menus: [{
    starts_on: "2026-11-09",
    ends_on: "2026-11-13",
    display_name: "Fiskgratäng hemlig.pdf",
    mime_type: "application/pdf",
  }],
  days: [],
});
assert.equal(fileOnly.todayCard.label, "Idag serveras");
assert.equal(fileOnly.todayCard.dish, "");
assert.equal(fileOnly.todayCard.note.includes("Fiskgratäng"), false);
assert.equal(fileOnly.todayCard.note.includes("uppladdade matsedeln"), true);
assert.equal(fileOnly.week.days.every((day) => day.dish === ""), true);

const typed = meals.presentation({
  today: "2026-11-10",
  menus: [{
    starts_on: "2026-11-09",
    ends_on: "2026-11-13",
    display_name: "Annan-fil.pdf",
    mime_type: "application/pdf",
  }],
  days: [{ served_on: "2026-11-10", body: "  Köttbullar  " }],
  closedDates: ["2026-11-11"],
});
assert.equal(typed.todayCard.dish, "Köttbullar");
assert.equal(typed.week.days[2].note, "Stängt");
assert.equal(typed.week.days[2].dish, "");

const weekend = meals.presentation({
  today: "2026-11-08",
  menus: [],
  days: [{ served_on: "2026-11-09", body: "Pannkakor" }],
});
assert.equal(weekend.todayCard.label, "Nästa servering");
assert.equal(weekend.todayCard.date, "2026-11-09");
assert.equal(weekend.todayCard.dish, "Pannkakor");

const saved = meals.applyText(meals.exampleBundle("2026-11-10"), [
  { served_on: "2026-11-10", body: "Pasta" },
  { served_on: "2026-11-11", body: "" },
]);
assert.equal(saved.days.find((day) => day.served_on === "2026-11-10").body, "Pasta");
assert.equal(saved.days.some((day) => day.body.includes("Exempelmeny")), false);
assert.equal(JSON.stringify(saved).includes("Fiskgratäng hemlig"), false);

const unsafe = meals.sanitizeDisplayName("../<img src=x onerror=alert(1)>.pdf", "application/pdf");
assert.equal(unsafe.includes("/"), false);
assert.equal(unsafe.includes("<"), false);
assert.equal(unsafe.toLowerCase().endsWith(".pdf"), true);
assert.equal(meals.pdfHeaderOk("%PDF-1.7\n"), true);
assert.equal(meals.pdfHeaderOk("<html"), false);
assert.equal(meals.downloadUrl("https://storage.example/sign?token=abc", "application/pdf", unsafe).includes("download="), true);
assert.equal(meals.menuPath("org", "school", "menu", "pdf"), "org/school/menu.pdf");

const card = meals.todayCardHtml(fileOnly.todayCard);
assert.equal(card.includes("soft-value"), false);
assert.equal(card.includes("Ingen rätt är ifylld"), true);
assert.equal(card.includes("Hela veckan"), true);
assert.equal(card.includes("Idag serveras"), true);

console.log("meal menu view tests passed");
