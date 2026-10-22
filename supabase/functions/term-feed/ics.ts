// RFC 5545 builder for published school terms. No child fields are accepted.

export type TermClosure = {
  date: string;
  reason: string;
};

export type TermSpan = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  opens_at?: string | null;
  closes_at?: string | null;
  updated_at?: string | null;
  closures?: TermClosure[] | null;
};

export type TermSchool = {
  id: string;
  name: string;
  terms?: TermSpan[] | null;
};

const TEXT_ENCODER = new TextEncoder();

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:Europe/Stockholm",
  "X-LIC-LOCATION:Europe/Stockholm",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
].join("\r\n");

export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function foldLine(line: string): string {
  const parts: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  let budget = 75;
  for (const char of line) {
    const size = TEXT_ENCODER.encode(char).length;
    if (chunk && chunkBytes + size > budget) {
      parts.push(chunk);
      chunk = char;
      chunkBytes = size;
      budget = 74;
    } else {
      chunk += char;
      chunkBytes += size;
    }
  }
  if (chunk) parts.push(chunk);
  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join("\r\n");
}

export function nextDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function formatDateValue(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function formatUtcStamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "19700101T000000Z";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function sequenceFor(updatedAt?: string | null): number {
  if (!updatedAt) return 0;
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.floor(time / 1000));
}

function clock(value?: string | null): string {
  if (!value) return "";
  const match = /^(\d{2}):(\d{2})/.exec(value);
  return match ? `${match[1]}:${match[2]}` : value;
}

function property(name: string, value: string): string {
  return foldLine(`${name}:${escapeText(value)}`);
}

function rawProperty(name: string, value: string): string {
  return foldLine(`${name}:${value}`);
}

function eventBlock(lines: string[]): string {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

export function calendarName(schools: TermSchool[]): string {
  if (schools.length === 1 && schools[0]?.name) return schools[0].name;
  return "Terminsschema";
}

export function buildTermCalendar(schools: TermSchool[] | null | undefined, generatedAt: Date = new Date()): string {
  const list = Array.isArray(schools) ? schools.filter((school) => school && school.name) : [];
  const stamp = formatUtcStamp(generatedAt);
  const severalSchools = list.length > 1;
  const events: string[] = [];

  for (const school of list) {
    const terms = Array.isArray(school.terms) ? school.terms : [];
    for (const term of terms) {
      if (!term?.id || !term.starts_on || !term.ends_on || !term.name) continue;
      const modified = formatUtcStamp(term.updated_at || generatedAt);
      const sequence = String(sequenceFor(term.updated_at));
      const summary = severalSchools ? `${school.name}: ${term.name}` : term.name;
      const hours = clock(term.opens_at) && clock(term.closes_at)
        ? `Öppet ${clock(term.opens_at)}–${clock(term.closes_at)} på vardagar.`
        : "";
      const description = [severalSchools ? school.name : "", hours].filter(Boolean).join(" ");
      const lines = [
        rawProperty("UID", `term-${term.id}@artan-term-feed`),
        rawProperty("DTSTAMP", stamp),
        rawProperty("DTSTART;VALUE=DATE", formatDateValue(term.starts_on)),
        rawProperty("DTEND;VALUE=DATE", formatDateValue(nextDate(term.ends_on))),
        property("SUMMARY", summary),
        rawProperty("LAST-MODIFIED", modified),
        rawProperty("SEQUENCE", sequence),
      ];
      if (description) lines.push(property("DESCRIPTION", description));
      events.push(eventBlock(lines));

      const closures = Array.isArray(term.closures) ? term.closures : [];
      for (const closure of closures) {
        if (!closure?.date || !closure.reason) continue;
        const closureLines = [
          rawProperty("UID", `closure-${term.id}-${formatDateValue(closure.date)}@artan-term-feed`),
          rawProperty("DTSTAMP", stamp),
          rawProperty("DTSTART;VALUE=DATE", formatDateValue(closure.date)),
          rawProperty("DTEND;VALUE=DATE", formatDateValue(nextDate(closure.date))),
          property("SUMMARY", `Stängt: ${closure.reason}`),
          property("DESCRIPTION", severalSchools ? `${school.name}. ${term.name}` : term.name),
          rawProperty("LAST-MODIFIED", modified),
          rawProperty("SEQUENCE", sequence),
        ];
        events.push(eventBlock(closureLines));
      }
    }
  }

  const header = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//artan//term-feed//SV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    property("X-WR-CALNAME", calendarName(list)),
    "X-WR-TIMEZONE:Europe/Stockholm",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    VTIMEZONE,
  ];
  return `${header.join("\r\n")}\r\n${events.join("\r\n")}${events.length ? "\r\n" : ""}END:VCALENDAR\r\n`;
}
