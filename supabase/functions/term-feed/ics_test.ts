import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildTermCalendar, escapeText, foldLine, nextDate } from "./ics.ts";

const generatedAt = new Date("2026-10-22T13:04:00Z");

const school = {
  id: "school-1",
  name: "Exempelförskolan",
  terms: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Hösttermin 2026",
      starts_on: "2026-08-17",
      ends_on: "2026-12-18",
      opens_at: "08:00",
      closes_at: "16:30",
      updated_at: "2026-10-01T08:15:00Z",
      closures: [
        { date: "2026-11-06", reason: "Planeringsdag, personal; möte\nrad två \\ extra" },
      ],
    },
  ],
};

Deno.test("folds on octet boundaries and escapes text", () => {
  const folded = foldLine(`SUMMARY:${escapeText("å".repeat(40))}`);
  const lines = folded.split("\r\n");
  assert(lines.length > 1);
  for (const [index, line] of lines.entries()) {
    const octets = new TextEncoder().encode(line).length;
    assert(octets <= 75, `line ${index} is ${octets} octets`);
    if (index > 0) assert(line.startsWith(" "));
  }
  assertEquals(escapeText("a,b;c\\d\n"), "a\\,b\\;c\\\\d\\n");
});

Deno.test("exclusive all-day term span and closure summary", () => {
  assertEquals(nextDate("2026-12-18"), "2026-12-19");
  const calendar = buildTermCalendar([school], generatedAt);
  assertStringIncludes(calendar, "X-WR-CALNAME:Exempelförskolan");
  assertStringIncludes(calendar, "X-WR-TIMEZONE:Europe/Stockholm");
  assertStringIncludes(calendar, "BEGIN:VTIMEZONE");
  assertStringIncludes(calendar, "TZID:Europe/Stockholm");
  assertStringIncludes(calendar, "REFRESH-INTERVAL;VALUE=DURATION:PT1H");
  assertStringIncludes(calendar, "X-PUBLISHED-TTL:PT1H");
  assertStringIncludes(calendar, "UID:term-11111111-1111-4111-8111-111111111111@artan-term-feed");
  assertStringIncludes(calendar, "DTSTART;VALUE=DATE:20260817");
  assertStringIncludes(calendar, "DTEND;VALUE=DATE:20261219");
  assertStringIncludes(calendar, "UID:closure-11111111-1111-4111-8111-111111111111-20261106@artan-term-feed");
  assertStringIncludes(calendar, "DTSTART;VALUE=DATE:20261106");
  assertStringIncludes(calendar, "DTEND;VALUE=DATE:20261107");
  assertStringIncludes(calendar, "SUMMARY:Stängt: Planeringsdag\\, personal\\; möte\\nrad två \\\\ extra");
  assertStringIncludes(calendar, "DTSTAMP:20261022T130400Z");
  assertStringIncludes(calendar, "LAST-MODIFIED:20261001T081500Z");
  assertStringIncludes(calendar, `SEQUENCE:${Math.floor(Date.parse("2026-10-01T08:15:00Z") / 1000)}`);
  assertStringIncludes(calendar, "Öppet 08:00–16:30 på vardagar.");
  assert(!calendar.includes("Ella"));
  assert(!calendar.includes("weekly"));
  assert(calendar.endsWith("END:VCALENDAR\r\n"));
});

Deno.test("stable output and combined name for several schools", () => {
  const other = {
    id: "school-2",
    name: "Andra exempel",
    terms: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Vårtermin",
        starts_on: "2027-01-07",
        ends_on: "2027-06-11",
        opens_at: "07:30:00",
        closes_at: "17:00:00",
        updated_at: "2026-10-02T00:00:00Z",
        closures: [{ date: "2027-04-02", reason: "Långfredag" }],
      },
    ],
  };
  const first = buildTermCalendar([school, other], generatedAt);
  const second = buildTermCalendar([school, other], generatedAt);
  assertEquals(first, second);
  assertStringIncludes(first, "X-WR-CALNAME:Terminsschema");
  assertStringIncludes(first, "SUMMARY:Exempelförskolan: Hösttermin 2026");
  assertStringIncludes(first, "SUMMARY:Andra exempel: Vårtermin");
  assertStringIncludes(first, "SUMMARY:Stängt: Långfredag");
  assertStringIncludes(first, "DESCRIPTION:Andra exempel. Vårtermin");
  assert(!first.includes("Ella Exempel"));
});

Deno.test("empty published terms still produce a calendar", () => {
  const calendar = buildTermCalendar([{ id: "school-1", name: "Exempelförskolan", terms: [] }], generatedAt);
  assertStringIncludes(calendar, "BEGIN:VCALENDAR");
  assert(!calendar.includes("BEGIN:VEVENT"));
  assertStringIncludes(calendar, "END:VCALENDAR");
});
