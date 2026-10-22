import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const appPath = fileURLToPath(new URL("../app.js", import.meta.url));
const source = fs.readFileSync(appPath, "utf8");
const start = source.indexOf("const SWEDISH_MONTHS");
const end = source.indexOf("function weekdaysIn");
if (start < 0 || end < start) throw new Error("Could not find the term parser in app.js");

const context = { todayIso: () => "2026-10-22" };
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}\nthis.parseTermText = parseTermText;\nthis.clockRanges = clockRanges;`, context);

const PHILIP = "Startar 3 aug och slutar 31 dec. Vi har stängt för kompetensutveckling 20 aug, 23 sep & 1 nov. stäng kring jul/nyår 24 dec, 25 dec, 26 dec 30 dec och 31 dec. öppettider är 06.30-17.30";
let failed = 0;

function assertEqual(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    failed += 1;
    console.error(`FAIL ${label}\n  actual:   ${left}\n  expected: ${right}`);
  }
}

function parse(value, today = "2026-10-22") {
  return context.parseTermText(value, today);
}

const philip = parse(PHILIP);
assertEqual(philip, {
  name: "Hösttermin 2026",
  startsOn: "2026-08-03",
  endsOn: "2026-12-31",
  opensAt: "06:30",
  closesAt: "17:30",
  closures: [
    { date: "2026-08-20", reason: "Kompetensutveckling" },
    { date: "2026-09-23", reason: "Kompetensutveckling" },
    { date: "2026-11-01", reason: "Kompetensutveckling" },
    { date: "2026-12-24", reason: "Jul/nyår" },
    { date: "2026-12-25", reason: "Jul/nyår" },
    { date: "2026-12-26", reason: "Jul/nyår" },
    { date: "2026-12-30", reason: "Jul/nyår" },
    { date: "2026-12-31", reason: "Jul/nyår" },
  ],
  error: "",
}, "Philip's exact input");

assertEqual(parse("Höstterminen 3 augusti–18 december, öppet 06.30–17.30. Stängt 13 september för planeringsdag och 11 november för studiedag."), {
  name: "Höstterminen",
  startsOn: "2026-08-03",
  endsOn: "2026-12-18",
  opensAt: "06:30",
  closesAt: "17:30",
  closures: [
    { date: "2026-09-13", reason: "Planeringsdag" },
    { date: "2026-11-11", reason: "Studiedag" },
  ],
  error: "",
}, "full month names, en dash, reason after each date");

assertEqual(parse("Startar 3 aug och slutar 31 dec. Öppettider är kl 6.30 till 17.30."), {
  name: "Hösttermin 2026",
  startsOn: "2026-08-03",
  endsOn: "2026-12-31",
  opensAt: "06:30",
  closesAt: "17:30",
  closures: [],
  error: "",
}, "hours written as kl 6.30 till 17.30");

assertEqual(parse("Börjar 3 aug till 18 dec. Stängt 24–31 dec. Öppet 6:30–17:30."), {
  name: "Hösttermin 2026",
  startsOn: "2026-08-03",
  endsOn: "2026-12-18",
  opensAt: "06:30",
  closesAt: "17:30",
  closures: [24, 25, 26, 27, 28, 29, 30, 31].map((day) => ({
    date: `2026-12-${String(day).padStart(2, "0")}`,
    reason: "Stängt",
  })),
  error: "",
}, "closure range 24–31 dec and colon hours");

assertEqual(parse("Startar 3 aug och slutar 31 dec. Stängt för kompetensutveckling 20 aug, 23 sep för studiedag. Öppet 06.30-17.30.").closures, [
  { date: "2026-08-20", reason: "Kompetensutveckling" },
  { date: "2026-09-23", reason: "Studiedag" },
], "a reason before the list stays, and a reason after one date stays on that date");

assertEqual(parse("Startar 1 sept och slutar 10 okt. Stängt 2 sept & 3 oktober för studiedag. Öppet 06.30-17.30."), {
  name: "Hösttermin 2026",
  startsOn: "2026-09-01",
  endsOn: "2026-10-10",
  opensAt: "06:30",
  closesAt: "17:30",
  closures: [
    { date: "2026-09-02", reason: "Studiedag" },
    { date: "2026-10-03", reason: "Studiedag" },
  ],
  error: "",
}, "sept, okt and a reason after the list");

const crossed = parse("Startar 15 nov och slutar 10 jan. Stängt 6 jan för trettondedag. Öppet 06.30-17.30.");
assertEqual(crossed.startsOn, "2026-11-15", "November start stays in 2026");
assertEqual(crossed.endsOn, "2027-01-10", "January end moves to the next year");
assertEqual(crossed.closures, [{ date: "2027-01-06", reason: "Trettondedag" }], "closure earlier than the start uses the next year when it fits");
assertEqual(crossed.error, "", "cross-year term has no error");

assertEqual(parse("Startar 3 aug och slutar 31 dec. Stängt 20 aug.", "2027-03-01"), {
  name: "Hösttermin 2027",
  startsOn: "2027-08-03",
  endsOn: "2027-12-31",
  opensAt: "",
  closesAt: "",
  closures: [{ date: "2027-08-20", reason: "Stängt" }],
  error: "Ärtan hittade inga öppettider.",
}, "next school year and a specific missing-hours error");

assertEqual(parse("Slutar 31 dec. Öppet 06.30-17.30. Stängt 24 dec för julafton.").error, "Ärtan hittade inget startdatum.", "missing start is named");
assertEqual(parse("Startar 3 aug. Öppet 06.30-17.30.").error, "Ärtan hittade inget slutdatum.", "missing end is named");
assertEqual(parse("Startar 3 aug och slutar 31 dec.").error, "Ärtan hittade inga öppettider.", "missing hours are named");
assertEqual(parse("Hej").error, "Ärtan hittade inget startdatum, inget slutdatum och inga öppettider.", "every missing piece is named");

assertEqual(parse("Startar 3 augusti 2027 och slutar 18 december 2026. Öppet 06.30-17.30.").error, "Slutdatumet ligger före startdatumet.", "explicit end before start is reported");

assertEqual(parse("Startar 7 jan och slutar 5 jun. Öppet 06.30-17.30.", "2027-06-15"), {
  name: "Vårtermin 2028",
  startsOn: "2028-01-07",
  endsOn: "2028-06-05",
  opensAt: "06:30",
  closesAt: "17:30",
  closures: [],
  error: "",
}, "a spring date more than five months ago moves to next year");

let threw = false;
try {
  parse("Startar 31 februari och slutar 18 december. Öppet 06.30-17.30.");
} catch (error) {
  threw = error.message === "Ärtan kunde inte tolka ett av datumen.";
}
if (!threw) {
  failed += 1;
  console.error("FAIL invalid date should name the date problem");
}

assertEqual(context.clockRanges("vardagar 8.00-15.00"), [{ start: "08:00", end: "15:00", index: 9 }], "weekly hours with a hyphen still parse");

if (failed) {
  console.error(`${failed} term parser check(s) failed`);
  process.exit(1);
}
console.log("Term parser checks passed.");
