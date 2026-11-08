import assert from "node:assert/strict";
import "../menu-read.js";

const menu = globalThis.ArtanMenu;
const text = `
Vecka 46 2026
Måndag 9 november
Fiskgratäng och potatis
Tisdag 10 november
Köttbullar och gräddsås
Onsdag
Stängt
Torsdag
Linssoppa
Fredag 13 november
Pannkakor

Vecka 52
Måndag
Ärtsoppa

Vecka 1
Måndag
Korv stroganoff

Lördag 14 november 2026
Ingen servering
matsedel-hosten.pdf
`;
const parsed = menu.parseMenuText(text);
assert.equal(parsed.needsYear, false);
const byDate = Object.fromEntries(parsed.items.filter((item) => item.served_on).map((item) => [item.served_on, item.body]));
assert.equal(byDate["2026-11-09"], "Fiskgratäng och potatis");
assert.equal(byDate["2026-11-10"], "Köttbullar och gräddsås");
assert.equal(byDate["2026-11-11"], "");
assert.equal(parsed.items.find((item) => item.served_on === "2026-11-11").note, "Stängt");
assert.equal(byDate["2026-11-12"], "Linssoppa");
assert.equal(byDate["2026-11-13"], "Pannkakor");
assert.equal(byDate["2026-12-21"], "Ärtsoppa");
assert.equal(byDate["2027-01-04"], "Korv stroganoff");
assert.equal(menu.isWeekday("2026-11-14"), false);
assert.equal(parsed.items.some((item) => item.body.includes("matsedel-hosten")), false);
assert.equal(parsed.items.some((item) => item.body.includes(".pdf")), false);

const missingYear = menu.parseMenuText("Vecka 46\nMåndag\nFisk");
assert.equal(missingYear.needsYear, true);
assert.equal(missingYear.items.every((item) => !item.served_on), true);
const withYear = menu.parseMenuText("Vecka 46\nMåndag\nFisk", { anchorYear: 2026 });
assert.equal(withYear.items[0].served_on, "2026-11-09");
assert.equal(withYear.items[0].body, "Fisk");

const week53 = menu.parseMenuText("Vecka 53 2026\nMåndag\nFisk");
assert.equal(week53.items[0].served_on, "2026-12-28");
const badWeek = menu.parseMenuText("Vecka 54 2026\nMåndag\nFisk");
assert.equal(badWeek.items.some((item) => item.served_on), false);
assert.equal(badWeek.warnings.some((warning) => warning.code === "bad-week"), true);

const multi = menu.parseMenuText("Måndag och tisdag: soppa");
assert.equal(multi.items.length, 0);
assert.equal(multi.warnings.some((warning) => warning.code === "multi-day"), true);

const cyclic = menu.parseMenuText("Varannan vecka samma mat\nVecka 46 2026\nMåndag\nFisk");
assert.equal(cyclic.warnings.some((warning) => warning.code === "cyclic"), true);
assert.equal(cyclic.items[0].body, "Fisk");

const long = "a".repeat(401);
const tooLong = menu.assessRow({ served_on: "2026-11-10", body: long, existing: "", today: "2026-11-08", closure: false, weekday: 1 });
assert.equal(tooLong.savable, false);
const outside = menu.assessRow({ served_on: "2027-06-01", body: "Fisk", existing: "", today: "2026-11-08", closure: false, weekday: 1 });
assert.equal(outside.savable, false);
assert.match(outside.reason, /120/);
const weekend = menu.assessRow({ served_on: "2026-11-14", body: "Fisk", existing: "", today: "2026-11-08", closure: false, weekday: 5 });
assert.equal(weekend.savable, false);
const mismatch = menu.assessRow({ served_on: "2026-11-10", body: "Fisk", existing: "", today: "2026-11-08", closure: false, weekday: 0 });
assert.equal(mismatch.savable, false);
const conflict = menu.assessRow({ served_on: "2026-11-10", body: "Ny rätt", existing: "Gammal rätt", today: "2026-11-08", closure: false, weekday: 1 });
assert.equal(conflict.savable, true);
assert.equal(conflict.replace, true);
const closed = menu.assessRow({ served_on: "2026-11-11", body: "Fisk", existing: "", today: "2026-11-08", closure: true, weekday: 2 });
assert.equal(closed.closed, true);

const plan = menu.batches([
  { served_on: "2026-11-10", body: "Köttbullar" },
  { served_on: "2026-11-09", body: "Fisk" },
  { served_on: "2026-12-21", body: "Ärtsoppa" },
]);
assert.equal(plan.length, 2);
assert.deepEqual(plan[0].days.map((day) => day.served_on), ["2026-11-09", "2026-11-10"]);
assert.equal(plan[0].days.length <= 5, true);
assert.equal(menu.fileRangeError("2026-11-09", "2026-12-30", "2026-11-08").includes("42"), true);
assert.equal(menu.fileRangeError("2026-11-09", "2026-11-13", "2026-11-08"), "");

const lines = menu.linesFromTextItems([
  { str: "Vecka 46 2026", transform: [1, 0, 0, 1, 40, 700] },
  { str: "Måndag", transform: [1, 0, 0, 1, 40, 680] },
  { str: "Fisk", transform: [1, 0, 0, 1, 120, 680] },
]);
assert.deepEqual(lines, ["Vecka 46 2026", "Måndag Fisk"]);
const positioned = menu.parseMenuText(lines.join("\n"));
assert.equal(positioned.items[0].served_on, "2026-11-09");
assert.equal(positioned.items[0].body, "Fisk");

const reviewed = menu.reviewRows(parsed, { today: "2026-11-10", existing: { "2026-11-09": "Annan rätt" }, closures: ["2026-11-11"] });
assert.equal(reviewed.weeks[0].rows.find((row) => row.served_on === "2026-11-09").approve, false);
assert.equal(reviewed.weeks[0].rows.find((row) => row.served_on === "2026-11-11").approve, false);
assert.equal(reviewed.weeks[0].rows.find((row) => row.served_on === "2026-11-13").approve, true);
assert.equal(reviewed.loose.some((row) => /matsedel-hosten\.pdf/i.test(row.body || row.source || "")), false);

await import("../meals.js");
const html = globalThis.ArtanMeals.importReviewHtml({ ...reviewed, fileName: "matsedel-hosten.pdf" });
const dishes = [...html.matchAll(/<textarea[^>]*>([^<]*)<\/textarea>/g)].map((match) => match[1]);
assert.equal(dishes.some((dish) => dish.includes("matsedel")), false);
assert.equal((html.match(/class="primary"/g) || []).length, 1);
const conflictRow = reviewed.weeks[0].rows.find((row) => row.served_on === "2026-11-09");
assert.equal(html.includes(`name="approve_${conflictRow.id}" checked`), false);

const image = menu.importDecision({ name: "meny.jpg", type: "image/jpeg", size: 1000, header: "" });
assert.equal(image.kind, "image");
const huge = menu.importDecision({ name: "meny.pdf", type: "application/pdf", size: menu.MAX_PDF_BYTES + 1, header: "%PDF-" });
assert.equal(huge.kind, "too-big");
const broken = menu.importDecision({ name: "meny.pdf", type: "application/pdf", size: 20, header: "hello" });
assert.equal(broken.kind, "bad-pdf");

const weeks = menu.batches([
  { served_on: "2026-11-09", body: "Fisk" },
  { served_on: "2026-12-21", body: "Ärtor" },
]);
const calls = [];
await assert.rejects(
  () => menu.saveApprovedWeeks(weeks, async (batch) => {
    calls.push(batch.monday);
    if (batch.monday === "2026-12-21") throw new Error("överlapp");
  }),
  /Sparat genom veckan som börjar 2026-11-09/,
);
assert.deepEqual(calls, ["2026-11-09", "2026-12-21"]);

console.log("menu read tests passed");
