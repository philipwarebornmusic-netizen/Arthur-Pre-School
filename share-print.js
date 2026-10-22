/* Share and print helpers for guardians.
   Term shares are a text summary plus an .ics file of the published term and
   closure days. They never include a child, a personal calendar token, or a feed URL.
   Attachment shares use File objects the caller already fetched. */
(function initArtanShare(root) {
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function plain(value) {
    return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
  }

  function isoDate(value) {
    const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
  }

  function compactDate(iso) {
    return iso ? iso.replace(/-/g, "") : "";
  }

  function nextIsoDate(iso) {
    const match = isoDate(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return "";
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }

  function clock(value) {
    const match = String(value ?? "").match(/^(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : "";
  }

  function formatDateSv(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("sv-SE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  }

  function safeFileName(name, extension) {
    const cleaned = plain(name)
      .replace(/[\\/:*?"<>|]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "fil";
    const ext = String(extension || "txt").toLowerCase().replace(/[^a-z0-9]/g, "") || "txt";
    return `${cleaned}.${ext}`;
  }

  function fileNameForType(filename, type) {
    const extension = {
      "application/pdf": "pdf",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/jpeg": "jpg",
    }[type];
    if (!extension) return filename;
    const base = String(filename || "fil").replace(/\.[A-Za-z0-9]+$/, "");
    return safeFileName(base, extension);
  }

  function icsText(value) {
    return plain(value).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,");
  }

  function foldIcsLine(line) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const bytes = encoder.encode(line);
    if (bytes.length <= 75) return line;
    const parts = [];
    let start = 0;
    let budget = 75;
    while (start < bytes.length) {
      let end = Math.min(bytes.length, start + budget);
      while (end > start && (bytes[end] & 0xc0) === 0x80) end -= 1;
      if (end === start) end = Math.min(bytes.length, start + budget);
      parts.push(decoder.decode(bytes.subarray(start, end)));
      start = end;
      budget = 74;
    }
    return parts.join("\r\n ");
  }

  function icsStamp(date) {
    return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  }

  function safePrintUrl(url) {
    return String(url || "").startsWith("blob:") ? String(url) : "";
  }

  function printDocument(model) {
    if (model.kind === "term") {
      const place = [model.schoolName, model.departmentName].filter(Boolean).join(" · ");
      const closures = model.closures.length
        ? `<ul class="print-closures">${model.closures.map((closure) => `<li><strong>${escapeHtml(formatDateSv(closure.date))}</strong> ${escapeHtml(closure.reason)}</li>`).join("")}</ul>`
        : `<p>Inga stängningsdagar.</p>`;
      return `<article class="print-sheet term-print"><p class="print-kicker">${escapeHtml(model.organizationName || "Terminsschema")}</p>${place ? `<p class="print-place">${escapeHtml(place)}</p>` : ""}<h1>${escapeHtml(model.termName)}</h1><p>${escapeHtml(formatDateSv(model.startsOn))}–${escapeHtml(formatDateSv(model.endsOn))}</p>${model.opensAt && model.closesAt ? `<p>Öppettider: vardagar ${escapeHtml(model.opensAt)}–${escapeHtml(model.closesAt)}</p>` : ""}<h2>Stängningsdagar</h2>${closures}</article>`;
    }
    if (model.kind === "post") {
      const images = (model.images || []).map((image) => {
        const url = safePrintUrl(image.url);
        return url ? `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt || model.title || "")}"></figure>` : "";
      }).join("");
      return `<article class="print-sheet text-print"><p class="print-kicker">${escapeHtml(model.kicker || "")}</p><h1>${escapeHtml(model.title || "")}</h1><p class="print-body">${escapeHtml(model.body || "")}</p>${images}</article>`;
    }
    if (model.kind === "image" || model.kind === "pdf") {
      const url = safePrintUrl(model.url);
      const frame = model.kind === "pdf"
        ? (url ? `<iframe class="print-pdf" src="${escapeHtml(url)}" title="${escapeHtml(model.title || "Dokument")}"></iframe>` : "")
        : (url ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(model.alt || model.title || "")}">` : "");
      return `<article class="print-sheet file-print"><h1>${escapeHtml(model.title || "")}</h1>${frame}</article>`;
    }
    return `<article class="print-sheet text-print"><p class="print-kicker">${escapeHtml(model.kicker || "")}</p><h1>${escapeHtml(model.title || "")}</h1><p class="print-body">${escapeHtml(model.body || "")}</p></article>`;
  }

  function normalizedClosures(closures) {
    return (Array.isArray(closures) ? closures : []).map((closure) => ({
      date: isoDate(closure?.date),
      reason: plain(closure?.reason) || "Stängt",
    })).filter((closure) => closure.date).sort((left, right) => left.date.localeCompare(right.date) || left.reason.localeCompare(right.reason, "sv"));
  }

  function buildTermShare(input) {
    const source = input || {};
    const termName = plain(source.termName) || "Termin";
    const startsOn = isoDate(source.startsOn);
    const endsOn = isoDate(source.endsOn);
    const opensAt = clock(source.opensAt);
    const closesAt = clock(source.closesAt);
    if (!startsOn || !endsOn) throw new Error("Terminen saknar datum och kan inte delas.");
    const model = {
      organizationName: plain(source.organizationName),
      schoolName: plain(source.schoolName),
      departmentName: plain(source.departmentName),
      termId: plain(source.termId) || "termin",
      termName,
      startsOn,
      endsOn,
      opensAt,
      closesAt,
      closures: normalizedClosures(source.closures),
    };
    const place = [model.organizationName, model.schoolName, model.departmentName].filter(Boolean).join(", ");
    const hours = model.opensAt && model.closesAt ? `Öppettider: vardagar ${model.opensAt}–${model.closesAt}` : "";
    const closureLines = model.closures.length
      ? model.closures.map((closure) => `${formatDateSv(closure.date)}: ${closure.reason}`)
      : ["Inga stängningsdagar."];
    const text = [
      "Terminsschema",
      place,
      model.termName,
      `${formatDateSv(model.startsOn)}–${formatDateSv(model.endsOn)}`,
      hours,
      "Stängningsdagar",
      ...closureLines,
    ].filter(Boolean).join("\n");
    const stamp = icsStamp(source.stamp ? new Date(source.stamp) : new Date());
    const description = [place, hours].filter(Boolean).join("\\n");
    const events = [
      [
        "BEGIN:VEVENT",
        `UID:term-${icsText(model.termId)}-span@artan`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compactDate(model.startsOn)}`,
        `DTEND;VALUE=DATE:${compactDate(nextIsoDate(model.endsOn))}`,
        `SUMMARY:${icsText(model.termName)}`,
        description ? `DESCRIPTION:${description}` : "",
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].filter(Boolean),
      ...model.closures.map((closure) => [
        "BEGIN:VEVENT",
        `UID:term-${icsText(model.termId)}-closed-${compactDate(closure.date)}@artan`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${compactDate(closure.date)}`,
        `DTEND;VALUE=DATE:${compactDate(nextIsoDate(closure.date))}`,
        `SUMMARY:${icsText(`Stängt: ${closure.reason}`)}`,
        "TRANSP:OPAQUE",
        "END:VEVENT",
      ]),
    ];
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//artan//terminsschema//SV",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Terminsschema",
      ...events.flat(),
      "END:VCALENDAR",
    ];
    const ics = `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
    const built = {
      title: `Terminsschema ${model.termName}`,
      text,
      ics,
      filename: safeFileName(`Terminsschema ${model.termName}`, "ics"),
      print: printDocument({ kind: "term", ...model }),
      model,
    };
    assertPublicTermShare(built);
    return built;
  }

  function assertPublicTermShare(payload) {
    const blob = `${payload?.text || ""}\n${payload?.ics || ""}\n${payload?.print || ""}`;
    const forbidden = [/term-feed/i, /webcal:/i, /token=/i, /\/storage\//i, /service_role/i, /sb_secret/i, /\bpass=/i];
    if (forbidden.some((pattern) => pattern.test(blob))) {
      throw new Error("Terminsschemat kan inte delas eftersom det innehåller en personlig länk.");
    }
  }

  function buildTextShare(input) {
    const title = plain(input?.title) || "Meddelande";
    const kicker = plain(input?.kicker);
    const body = String(input?.body ?? "").replace(/\r\n/g, "\n").trim();
    const text = [kicker, title, body].filter(Boolean).join("\n\n");
    const filename = safeFileName(title, "txt");
    return {
      title,
      text,
      filename,
      file: new File([text], filename, { type: "text/plain" }),
      print: printDocument({ kind: "text", kicker, title, body }),
    };
  }

  function chooseSharePlan(payload, support) {
    const title = payload?.title || "";
    const text = payload?.text || "";
    const files = Array.isArray(payload?.files) ? payload.files.filter(Boolean) : [];
    const canShare = support?.canShare || (() => false);
    const candidates = [];
    if (files.length && text) candidates.push({ files, title, text });
    if (files.length) candidates.push({ files, title });
    for (const data of candidates) {
      try {
        if (canShare(data)) return { mode: "share", data, downloads: [] };
      } catch {
        /* This browser rejected the file list. Try the next shape. */
      }
    }
    if (support?.hasShare && text) return { mode: "share", data: { title, text }, downloads: files };
    return { mode: "fallback", title, text, downloads: files };
  }

  root.ArtanShare = {
    assertPublicTermShare,
    buildTermShare,
    buildTextShare,
    chooseSharePlan,
    fileNameForType,
    foldIcsLine,
    nextIsoDate,
    printDocument,
    safeFileName,
    safePrintUrl,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
