(function menuRead(root) {
  const WEEKDAY_NAMES = ["måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag", "söndag"];
  const MONTHS = {
    januari: 1, jan: 1, februari: 2, feb: 2, mars: 3, mar: 3, april: 4, apr: 4,
    maj: 5, juni: 6, jun: 6, juli: 7, jul: 7, augusti: 8, aug: 8,
    september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11,
    december: 12, dec: 12,
  };
  const EDIT_PAST = 14;
  const EDIT_FUTURE = 120;
  const FILE_SPAN = 41;
  const MAX_DISH = 400;
  const MAX_PDF_PAGES = 20;
  const MAX_PDF_BYTES = 8 * 1024 * 1024;

  function parseIso(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatIso(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const date = parseIso(iso);
    if (!date) return "";
    date.setUTCDate(date.getUTCDate() + days);
    return formatIso(date);
  }

  function diffDays(start, end) {
    const a = parseIso(start);
    const b = parseIso(end);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }

  function weekdayIndex(iso) {
    const date = parseIso(iso);
    if (!date) return -1;
    const day = date.getUTCDay();
    return day === 0 ? 6 : day - 1;
  }

  function isWeekday(iso) {
    const index = weekdayIndex(iso);
    return index >= 0 && index <= 4;
  }

  function mondayOf(iso) {
    const index = weekdayIndex(iso);
    if (index < 0) return "";
    return addDays(iso, -index);
  }

  function fold(value) {
    return String(value || "").toLocaleLowerCase("sv-SE").replace(/å/g, "a").replace(/ä/g, "a").replace(/ö/g, "o");
  }

  function weekdayFromName(value) {
    const name = fold(value);
    const names = ["mandag", "tisdag", "onsdag", "torsdag", "fredag", "lordag", "sondag"];
    return names.indexOf(name);
  }

  function isoWeekMonday(year, week) {
    if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > 53) return "";
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const first = new Date(jan4);
    first.setUTCDate(jan4.getUTCDate() - dow + 1);
    const monday = new Date(first);
    monday.setUTCDate(first.getUTCDate() + (week - 1) * 7);
    const thursday = new Date(monday);
    thursday.setUTCDate(monday.getUTCDate() + 3);
    const probe = new Date(thursday);
    probe.setUTCDate(probe.getUTCDate() + 4 - (probe.getUTCDay() || 7));
    if (probe.getUTCFullYear() !== year) return "";
    return formatIso(monday);
  }

  function dateInWeek(monday, weekday) {
    if (!monday || weekday < 0 || weekday > 6) return "";
    return addDays(monday, weekday);
  }

  function splitMenuLines(text) {
    const source = String(text || "").replace(/\u00a0/g, " ").replace(/\r/g, "");
    const lines = [];
    const boundary = /\s+(?=(?:vecka|v\.?|måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|mandag|lordag|sondag)\b)/i;
    for (const piece of source.split(/\n+/)) {
      if ((fold(piece).match(/\b(mandag|tisdag|onsdag|torsdag|fredag)\b/g) || []).length > 1) {
        const line = piece.replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
        continue;
      }
      for (const part of piece.split(boundary)) {
        const line = part.replace(/\s+/g, " ").trim();
        if (line) lines.push(line);
      }
    }
    return lines;
  }

  function closureNote(text) {
    return /^(stangt|stangd|lov|studiedag|planering|personalplanering|ingen servering|forskolan stangd)\b/.test(fold(text)) && text.length < 80;
  }

  function multiDay(line) {
    const names = fold(line).match(/\b(mandag|tisdag|onsdag|torsdag|fredag)\b/g) || [];
    return new Set(names).size > 1;
  }

  function explicitDate(line) {
    const iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/.exec(line);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const numeric = /\b(\d{1,2})[./](\d{1,2})[./](20\d{2})\b/.exec(line);
    if (numeric) return isoFromParts(Number(numeric[1]), Number(numeric[2]), Number(numeric[3]));
    const month = line.match(/\b(\d{1,2})\s+(januari|jan|februari|feb|mars|mar|april|apr|maj|juni|jun|juli|jul|augusti|aug|september|sep|sept|oktober|okt|november|nov|december|dec)\.?\s+(20\d{2})\b/i);
    if (month) return isoFromParts(Number(month[1]), MONTHS[fold(month[2])], Number(month[3]));
    return "";
  }

  function monthDay(line) {
    const numeric = /\b(\d{1,2})[./](\d{1,2})(?!\d)/.exec(line);
    if (numeric && !/\b20\d{2}\b/.test(line)) return { day: Number(numeric[1]), month: Number(numeric[2]) };
    const named = line.match(/\b(\d{1,2})\s+(januari|jan|februari|feb|mars|mar|april|apr|maj|juni|jun|juli|jul|augusti|aug|september|sep|sept|oktober|okt|november|nov|december|dec)\b\.?/i);
    if (named && !/\b20\d{2}\b/.test(line)) return { day: Number(named[1]), month: MONTHS[fold(named[2])] };
    return null;
  }

  function isoFromParts(day, month, year) {
    if (!day || !month || !year || month < 1 || month > 12 || day < 1 || day > 31) return "";
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return formatIso(date);
  }

  function weekHeading(line) {
    const match = /^(?:vecka|v)\.?\s*(\d{1,2})(?:\s*(?:\/|,)?\s*(20\d{2}))?\b/i.exec(line.trim());
    if (!match) return null;
    return { week: Number(match[1]), year: match[2] ? Number(match[2]) : null };
  }

  function weekdayHeading(line) {
    const match = /^(måndag|tisdag|onsdag|torsdag|fredag|lördag|söndag|mandag|lordag|sondag)\b[:\-\s]*/i.exec(line.trim());
    if (!match) return null;
    return { index: weekdayFromName(match[1]), rest: line.trim().slice(match[0].length).trim() };
  }

  function dishFromRest(rest) {
    return rest.replace(/^[:\-–]+\s*/, "").replace(/\b20\d{2}-\d{2}-\d{2}\b/g, "").replace(/\b\d{1,2}[./]\d{1,2}[./]20\d{2}\b/g, "").replace(/\b\d{1,2}\s+(?:januari|jan|februari|feb|mars|mar|april|apr|maj|juni|jun|juli|jul|augusti|aug|september|sep|sept|oktober|okt|november|nov|december|dec)\.?(?:\s+20\d{2})?/ig, "").replace(/\s+/g, " ").trim();
  }

  function parseMenuText(text, options = {}) {
    const anchorYear = Number(options.anchorYear) || null;
    const warnings = [];
    const source = String(text || "");
    if (/varannan vecka|upprepas varje|samma varje vecka|cyklisk meny/i.test(source)) {
      warnings.push({ code: "cyclic", text: "Upprepning eller cyklisk meny läses inte automatiskt. Bara rader med en egen dag används." });
    }
    const items = [];
    let current = null;
    let establishedYear = anchorYear;
    let pending = null;
    const flush = () => {
      if (!pending) return;
      const body = pending.lines.join(" ").replace(/\s+/g, " ").trim();
      items.push({ ...pending, body, lines: undefined });
      pending = null;
    };
    for (const line of splitMenuLines(source)) {
      if (/^[\w.-]+\.(pdf|jpe?g|png)$/i.test(line)) continue;
      if (multiDay(line)) {
        flush();
        warnings.push({ code: "multi-day", text: `Raden gäller flera dagar och användes inte: ${line}` });
        continue;
      }
      const week = weekHeading(line);
      if (week) {
        flush();
        let year = week.year;
        if (!year && current?.year && current.week >= 52 && week.week === 1) year = current.year + 1;
        else if (!year) year = establishedYear;
        if (year) establishedYear = year;
        const monday = year ? isoWeekMonday(year, week.week) : "";
        if (week.week > 53 || (year && !monday)) {
          warnings.push({ code: "bad-week", text: `Vecka ${week.week}${year ? ` ${year}` : ""} är inte en giltig ISO-vecka.` });
          current = null;
          continue;
        }
        current = { week: week.week, year: year || null, monday };
        if (!year) warnings.push({ code: "needs-year", text: `Vecka ${week.week} saknar år. Välj år innan datumen kan visas.` });
        continue;
      }
      const weekday = weekdayHeading(line);
      if (weekday) {
        flush();
        const full = explicitDate(line);
        const partial = full ? null : monthDay(weekday.rest);
        let served = full;
        let note = "";
        if (!served && partial) {
          const year = current?.year || null;
          const candidate = year ? isoFromParts(partial.day, partial.month, year) : "";
          if (candidate && current?.monday && mondayOf(candidate) === current.monday) served = candidate;
          else note = "Datumet i raden passar inte veckan och användes inte.";
        } else if (!served && current?.monday && weekday.index <= 6) {
          served = dateInWeek(current.monday, weekday.index);
        }
        const dish = dishFromRest(weekday.rest);
        pending = {
          served_on: served,
          weekday: weekday.index,
          lines: dish && !closureNote(dish) ? [dish] : [],
          note: closureNote(dish) ? dish : (note || (!served && !current?.year ? "År saknas." : "")),
          source: line,
          needsYear: !served && !current?.year,
        };
        continue;
      }
      const full = explicitDate(line);
      if (full) {
        flush();
        const dish = dishFromRest(line);
        pending = {
          served_on: full,
          weekday: weekdayIndex(full),
          lines: dish && !closureNote(dish) ? [dish] : [],
          note: closureNote(dish) ? dish : "",
          source: line,
          needsYear: false,
        };
        continue;
      }
      if (pending) {
        if (!closureNote(line)) pending.lines.push(line);
        else pending.note = pending.note || line;
      }
    }
    flush();
    return {
      needsYear: items.some((item) => item.needsYear) || warnings.some((warning) => warning.code === "needs-year"),
      warnings,
      items: items.map((item, index) => ({ ...item, id: `row-${index}` })),
    };
  }

  function withinEditWindow(iso, today) {
    const delta = diffDays(today, iso);
    return delta !== null && delta >= -EDIT_PAST && delta <= EDIT_FUTURE;
  }

  function assessRow({ served_on, body, existing, today, closure, weekday }) {
    const dish = String(body || "").trim();
    if (!served_on) return { savable: false, reason: "Datum saknas." };
    if (weekday !== undefined && weekday !== null && weekday >= 0 && weekdayIndex(served_on) !== weekday) {
      return { savable: false, reason: "Veckodagen stämmer inte med datumet." };
    }
    if (!isWeekday(served_on)) return { savable: false, reason: "Helger sparas inte som serveringsdagar." };
    if (!dish) return { savable: false, reason: "Ingen rätt att spara." };
    if (dish.length > MAX_DISH) return { savable: false, reason: "Rätten är längre än 400 tecken. Korta den innan den sparas." };
    if (!withinEditWindow(served_on, today)) return { savable: false, reason: "Datumet ligger utanför perioden som kan sparas, 14 dagar bakåt till 120 dagar framåt." };
    if (closure) return { savable: true, closed: true, replace: false, reason: "Terminen är stängd denna dag." };
    if (existing) {
      return {
        savable: true,
        replace: true,
        closed: false,
        reason: existing === dish ? "Samma rätt är redan sparad." : "Det finns redan en rätt. Kryssa i om den ska bytas.",
      };
    }
    return { savable: true, replace: false, closed: false, reason: "" };
  }

  function batches(rows) {
    const groups = new Map();
    for (const row of rows) {
      const monday = mondayOf(row.served_on);
      if (!groups.has(monday)) groups.set(monday, []);
      groups.get(monday).push({ served_on: row.served_on, body: String(row.body || "").trim() });
    }
    return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([monday, days]) => ({
      monday,
      days: days.sort((a, b) => a.served_on < b.served_on ? -1 : 1),
    }));
  }

  function fileRangeError(start, end, today) {
    if (!start || !end) return "Välj både från och till om filen ska bifogas.";
    if (end < start) return "Slutdatumet är före startdatumet.";
    const span = diffDays(start, end);
    if (span === null) return "Datumintervallet är ogiltigt.";
    if (span > FILE_SPAN) return "Filen kan kopplas till högst 42 dagar. Rätterna kan ändå sparas var för sig. Välj ett kortare intervall, eller spara utan fil.";
    if (!withinEditWindow(start, today) || !withinEditWindow(end, today)) return "Filens intervall ligger utanför perioden som kan sparas.";
    return "";
  }

  function linesFromTextItems(items) {
    const rows = [];
    for (const item of items || []) {
      const str = String(item.str || "").trim();
      if (!str) continue;
      const y = Math.round(item.transform?.[5] || 0);
      const x = item.transform?.[4] || 0;
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, str });
    }
    return rows.sort((a, b) => b.y - a.y).map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.str).join(" ").replace(/\s+/g, " ").trim()).filter(Boolean);
  }

  const EXAMPLE_IMPORT_TEXT = `Vecka 46 2026
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
Ingen servering`;

  function reviewRows(parsed, context) {
    const weeks = [];
    const loose = [];
    for (const item of parsed.items || []) {
      const existing = context.existing?.[item.served_on] || "";
      const closure = (context.closures || []).includes(item.served_on);
      const assessment = assessRow({
        served_on: item.served_on,
        body: item.body,
        existing,
        today: context.today,
        closure,
        weekday: item.weekday,
      });
      const row = {
        ...item,
        existing,
        ...assessment,
        approve: Boolean(assessment.savable && !assessment.replace && !assessment.closed && !existing && String(item.body || "").trim()),
      };
      if (!row.served_on) {
        loose.push(row);
        continue;
      }
      const monday = mondayOf(row.served_on);
      let week = weeks.find((candidate) => candidate.monday === monday);
      if (!week) {
        week = { monday, rows: [] };
        weeks.push(week);
      }
      week.rows.push(row);
    }
    weeks.sort((a, b) => a.monday < b.monday ? -1 : 1);
    return { weeks, loose, warnings: parsed.warnings || [], needsYear: Boolean(parsed.needsYear) };
  }

  async function saveApprovedWeeks(planned, saveWeek) {
    const saved = [];
    for (const batch of planned) {
      try {
        await saveWeek(batch);
        saved.push(batch.monday);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`${saved.length ? `Sparat genom veckan som börjar ${saved.at(-1)}. ` : ""}Veckan som börjar ${batch.monday} sparades inte: ${errorMessage}`);
      }
    }
    return saved;
  }

  function importDecision({ name, type, size, header }) {
    if (size > MAX_PDF_BYTES) return { kind: "too-big", message: "Filen är större än 8 MB." };
    if (String(type || "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(name || "")) {
      return { kind: "image", message: "Rätter läses inte ur foton eller skannade bilder. Filen kan bifogas under Spara veckan, och rätterna skrivs in för hand." };
    }
    if (type === "application/pdf" || String(name || "").toLowerCase().endsWith(".pdf")) {
      if (!String(header || "").startsWith("%PDF-")) return { kind: "bad-pdf", message: "Filen är inte en PDF." };
      return { kind: "pdf" };
    }
    return { kind: "unknown", message: "Välj en PDF med text, eller en bild om filen bara ska bifogas." };
  }

  root.ArtanMenu = {
    EXAMPLE_IMPORT_TEXT,
    EDIT_PAST,
    EDIT_FUTURE,
    FILE_SPAN,
    MAX_DISH,
    MAX_PDF_PAGES,
    MAX_PDF_BYTES,
    WEEKDAY_NAMES,
    parseMenuText,
    assessRow,
    batches,
    fileRangeError,
    withinEditWindow,
    isoWeekMonday,
    linesFromTextItems,
    reviewRows,
    saveApprovedWeeks,
    importDecision,
    mondayOf,
    addDays,
    isWeekday,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
