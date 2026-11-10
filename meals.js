(function mealModule(root) {
  const DAY_LABELS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag"];
  const EXAMPLE = {
    organizationId: "00000000-0000-4000-8000-0000000000a1",
    preschoolId: "00000000-0000-4000-8000-0000000000b1",
    departmentId: "00000000-0000-4000-8000-0000000000c1",
    childId: "00000000-0000-4000-8000-0000000000d1",
    profileId: "00000000-0000-4000-8000-0000000000e1",
    menuId: "00000000-0000-4000-8000-0000000000f1",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

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

  function weekDays(monday) {
    return [0, 1, 2, 3, 4].map((offset) => addDays(monday, offset));
  }

  function servingDate(today) {
    const index = weekdayIndex(today);
    if (index === 5) return addDays(today, 2);
    if (index === 6) return addDays(today, 1);
    return today;
  }

  function rangesOverlap(startA, endA, startB, endB) {
    return Boolean(startA && endA && startB && endB && startA <= endB && startB <= endA);
  }

  function coveringMenu(menus, iso) {
    return (menus || []).find((menu) => menu.starts_on <= iso && iso <= menu.ends_on) || null;
  }

  function dayByDate(days, iso) {
    return (days || []).find((day) => day.served_on === iso) || null;
  }

  function dishText(day) {
    return String(day?.body || "").trim();
  }

  function presentation(input) {
    const today = input.today;
    const target = servingDate(today);
    const menus = input.menus || [];
    const days = input.days || [];
    const closed = new Set(input.closedDates || []);
    const day = dayByDate(days, target);
    const menu = coveringMenu(menus, target);
    const dish = dishText(day);
    let note = "";
    if (!dish && closed.has(target) && menu) note = "Stängt. Den uppladdade matsedeln går att öppna.";
    else if (!dish && closed.has(target)) note = "Stängt";
    else if (!dish && menu) note = "Ingen rätt är ifylld. Den uppladdade matsedeln går att öppna.";
    else if (!dish) note = "Ingen matsedel denna dag.";
    const monday = mondayOf(input.weekStart || target);
    const week = weekDays(monday).map((iso) => {
      const row = dayByDate(days, iso);
      const rowDish = dishText(row);
      const rowMenu = coveringMenu(menus, iso);
      let rowNote = "";
      if (!rowDish && closed.has(iso)) rowNote = "Stängt";
      else if (!rowDish) rowNote = "Ingen rätt angiven";
      return {
        iso,
        label: DAY_LABELS[weekdayIndex(iso)] || "",
        dish: rowDish,
        note: rowNote,
        photoUrl: row?.photo_url || "",
        file: Boolean(rowMenu),
      };
    });
    return {
      todayCard: {
        show: Boolean(target),
        label: target === today ? "Idag serveras" : "Nästa servering",
        date: target,
        dish,
        note,
        file: menu,
        example: Boolean(day?.example || menu?.example || input.example),
      },
      week: {
        start: monday,
        end: addDays(monday, 4),
        days: week,
        files: menus.filter((menuItem) => rangesOverlap(menuItem.starts_on, menuItem.ends_on, monday, addDays(monday, 4))),
      },
    };
  }

  function sanitizeDisplayName(raw, mime) {
    const suffix = mime === "application/pdf" ? ".pdf" : ".jpg";
    let cleaned = String(raw || "").replace(/[\\/]/g, " ").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").replace(/\s+/g, " ").trim();
    if (!cleaned || /^[.]+$/.test(cleaned)) cleaned = `matsedel${suffix}`;
    const lower = cleaned.toLowerCase();
    if (!lower.endsWith(suffix) && !lower.endsWith(".jpeg")) cleaned += suffix;
    if (cleaned.length > 80) cleaned = cleaned.slice(0, 80);
    return cleaned;
  }

  function pdfHeaderOk(bytes) {
    const text = typeof bytes === "string" ? bytes : new TextDecoder().decode(bytes);
    return text.startsWith("%PDF-");
  }

  function menuPath(organizationId, preschoolId, objectId, kind) {
    return `${organizationId}/${preschoolId}/${objectId}.${kind === "pdf" ? "pdf" : "jpg"}`;
  }

  function photoPath(organizationId, preschoolId, iso, objectId) {
    return `${organizationId}/${preschoolId}/${iso}--${objectId}.jpg`;
  }

  function replaceCleanup(previousPath, stagedPath, attached) {
    if (!attached) return { remove: stagedPath ? [stagedPath] : [], keep: previousPath || "" };
    return {
      remove: previousPath && previousPath !== stagedPath ? [previousPath] : [],
      keep: stagedPath || "",
    };
  }

  function downloadUrl(signedUrl, mime, displayName) {
    if (!signedUrl) return "";
    if (mime !== "application/pdf") return signedUrl;
    const name = sanitizeDisplayName(displayName, mime);
    const join = signedUrl.includes("?") ? "&" : "?";
    return `${signedUrl}${join}download=${encodeURIComponent(name)}`;
  }

  function tabsForRole(role) {
    if (role === "admin" || role === "staff") {
      return [
        ["attendance", "check", "Närvaro"],
        ["meals", "meal", "Matsedel"],
        ["messages", "messages", "Meddelanden"],
        ["more", "more", "Mer"],
      ];
    }
    return [
      ["home", "home", "Min dag"],
      ["pickup", "clock", "Schema"],
      ["messages", "messages", "Meddelanden"],
      ["more", "more", "Mer"],
    ];
  }

  function buriedViews(role) {
    if (role === "admin") return ["overview", "schools", "people", "events", "banners", "lost", "incidents", "feedback", "account"];
    if (role === "staff") return ["people", "events", "banners", "lost", "incidents", "feedback", "account"];
    return ["child", "classlist", "banners", "events", "lost", "feedback", "account"];
  }

  function allowedViews(role) {
    if (role === "admin") return ["attendance", "meals", "messages", "more", "overview", "schools", "people", "events", "banners", "lost", "incidents", "feedback", "account"];
    if (role === "staff") return ["attendance", "meals", "messages", "people", "more", "events", "banners", "lost", "incidents", "feedback", "account"];
    return ["home", "meals", "pickup", "messages", "more", "child", "classlist", "banners", "events", "lost", "feedback", "account"];
  }

  function exampleBundle(today) {
    const monday = mondayOf(servingDate(today));
    const days = weekDays(monday);
    return {
      example: true,
      menus: [{
        id: EXAMPLE.menuId,
        starts_on: monday,
        ends_on: addDays(monday, 4),
        display_name: "Exempelmeny.pdf",
        mime_type: "application/pdf",
        byte_size: 1200,
        storage_path: null,
        signed_url: "",
        example: true,
      }],
      days: [
        { served_on: days[0], body: "Exempel: fiskgratäng och potatis", photo_path: null, photo_url: "", example: true },
        { served_on: days[1], body: "Exempel: köttbullar och potatis", photo_path: null, photo_url: "", example: true },
        { served_on: days[2], body: "Exempel: linssoppa", photo_path: null, photo_url: "", example: true },
      ],
    };
  }

  function applyText(bundle, entries) {
    const next = {
      example: true,
      menus: (bundle.menus || []).map((menu) => ({ ...menu })),
      days: [],
    };
    const photos = new Map((bundle.days || []).map((day) => [day.served_on, day]));
    entries.forEach((entry) => {
      const previous = photos.get(entry.served_on);
      const body = String(entry.body || "").trim();
      if (!body && !previous?.photo_url) return;
      next.days.push({
        served_on: entry.served_on,
        body,
        photo_path: previous?.photo_path || null,
        photo_url: previous?.photo_url || "",
        example: true,
      });
    });
    return next;
  }

  function demoBanner(dateLabel) {
    return `<section class="demo-banner" role="status"><p><strong>Testversion.</strong> Exempeldatum ${escapeHtml(dateLabel)}. Ingenting sparas och ingen riktig förskola används.</p><p class="demo-roles"><button class="link" type="button" data-action="demo-role" data-role="parent">Förälder</button><button class="link" type="button" data-action="demo-role" data-role="staff">Personal</button><button class="link" type="button" data-action="demo-role" data-role="admin">Administratör</button></p></section>`;
  }

  function shortDate(iso) {
    const date = parseIso(iso);
    if (!date) return String(iso || "");
    const months = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
    return `${date.getUTCDate()} ${months[date.getUTCMonth()]}`;
  }

  function fileLinks(files) {
    if (!files.length) return "";
    return files.map((file) => {
      const label = `${escapeHtml(file.display_name || "Matsedel")} · ${escapeHtml(shortDate(file.starts_on))} till ${escapeHtml(shortDate(file.ends_on))}`;
      if (file.example || !file.signed_url) {
        return `<p class="meal-file"><span>${label}</span> <button class="link" type="button" data-action="meal-file-example">Öppna matsedeln</button></p>`;
      }
      const href = downloadUrl(file.signed_url, file.mime_type, file.display_name);
      const kind = file.mime_type === "application/pdf" ? "PDF" : "bild";
      return `<p class="meal-file"><a class="link" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${label}</a> <span class="meta">${kind}, kopplad till datumen. Rätterna nedan är bara det som skrivits in.</span></p>`;
    }).join("");
  }

  function todayCardHtml(card) {
    if (!card?.show) return "";
    const file = card.file ? fileLinks([card.file]) : "";
    const dish = card.dish ? `<p class="soft-value">${escapeHtml(card.dish)}</p>` : `<p class="soft-sub">${escapeHtml(card.note)}</p>`;
    const extra = card.dish && card.note ? `<p class="soft-sub">${escapeHtml(card.note)}</p>` : "";
    return `<section class="soft-card is-meal"><p class="soft-label">${escapeHtml(card.label)}</p>${dish}${extra}${file}<button class="link" type="button" data-action="open-meals" data-week="${escapeHtml(mondayOf(card.date))}">Hela veckan</button></section>`;
  }

  function weekHtml(model) {
    const view = presentation(model);
    const files = fileLinks(view.week.files);
    const rows = view.week.days.map((day) => {
      const photo = day.photoUrl
        ? `<img src="${escapeHtml(day.photoUrl)}" alt="Mat ${escapeHtml(day.label)}" referrerpolicy="no-referrer">`
        : "";
      const text = day.dish ? `<p>${escapeHtml(day.dish)}</p>` : `<p class="soft-sub">${escapeHtml(day.note)}</p>`;
      return `<article class="card meal-day"><p class="kicker">${escapeHtml(day.label)} · ${escapeHtml(day.iso)}</p>${text}${photo}</article>`;
    }).join("");
    return `<button class="hub-back" type="button" data-action="navigate" data-view="home">‹ Min dag</button><h1 class="h1">Matsedel</h1><p class="page-sub">${escapeHtml(model.schoolName || "")} · ${escapeHtml(view.week.start)}–${escapeHtml(view.week.end)}</p>${files || `<p class="form-hint">Ingen uppladdad matsedel den här veckan.</p>`}${rows}`;
  }

  function importEntryHtml() {
    return `<section class="card meal-import-entry"><h2>Läs in rätter</h2><p class="form-hint">En PDF med text läses direkt. Ett foto eller en skannad PDF läses i webbläsaren. Varje bildrad måste kryssas i. Ingenting sparas av sig själv.</p><label>PDF eller bild<input type="file" accept="application/pdf,image/*" data-action="meal-import-file"></label><button class="link" type="button" data-action="meal-import-example">Visa exempel utan att spara</button><button class="link" type="button" data-action="meal-import-term">Visa en hel termin utan att spara</button></section>`;
  }

  function importReviewHtml(model) {
    const pending = (model.weeks || []).reduce((count, week) => count + week.rows.filter((row) => row.pendingMigration).length, 0);
    const pendingNote = pending ? `<p class="notice" role="status">${pending} dagar ligger längre fram än 120 dagar. De kan inte sparas förrän migreringen för en hel termin är aktiverad.</p>` : "";
    const fileHint = model.limits && model.limits.revision === "term"
      ? "Filen kan bifogas för högst 186 dagar. Rätterna sparas var för sig."
      : "Filen kan bifogas för högst 42 dagar tills migreringen är aktiverad. En hel termin kan inte ligga på en fil ännu.";
    const year = model.needsYear ? `<label>År för veckor som saknar år<input name="anchor_year" type="number" min="2000" max="2100" required value="${escapeHtml(model.anchorYear || "")}"></label><button class="link" type="button" data-action="meal-import-year">Visa datum</button>` : "";
    const warnings = (model.warnings || []).map((warning) => `<p class="form-hint">${escapeHtml(warning.text)}</p>`).join("");
    const weeks = (model.weeks || []).map((week) => {
      const rows = week.rows.map((row) => {
        const checked = row.approve ? "checked" : "";
        const existing = row.existing ? `<p class="soft-sub">Redan sparad: ${escapeHtml(row.existing)}</p>` : "";
        const reason = row.reason ? `<p class="form-hint">${escapeHtml(row.reason)}</p>` : "";
        return `<div class="meal-review-day"><label class="check"><input type="checkbox" name="approve_${escapeHtml(row.id)}" ${checked}> ${escapeHtml(ArtanMenu.WEEKDAY_NAMES[row.weekday] || "Dag")} ${escapeHtml(row.served_on)}</label><input type="date" name="date_${escapeHtml(row.id)}" value="${escapeHtml(row.served_on)}"><textarea name="dish_${escapeHtml(row.id)}">${escapeHtml(row.body || "")}</textarea>${existing}${reason}</div>`;
      }).join("");
      return `<section class="card"><h2>Vecka från ${escapeHtml(week.monday)}</h2>${rows}</section>`;
    }).join("");
    const loose = (model.loose || []).length
      ? `<section class="card"><h2>Utan säkert datum</h2>${model.loose.map((row) => `<div class="meal-review-day"><p>${escapeHtml(row.source)}</p><label class="check"><input type="checkbox" name="approve_${escapeHtml(row.id)}"> Spara när datumet är ifyllt</label><input type="date" name="date_${escapeHtml(row.id)}"><textarea name="dish_${escapeHtml(row.id)}">${escapeHtml(row.body || "")}</textarea><p class="form-hint">${escapeHtml(row.note || "Raden sparas inte förrän den har ett datum.")}</p></div>`).join("")}</section>`
      : "";
    return `<button class="hub-back" type="button" data-action="meal-import-back">‹ Tillbaka</button><h1 class="h1">Granska rätter</h1><p class="page-sub">${escapeHtml(model.fileName || "Exempel")}. Ingenting sparas förrän du kryssar i dagar och trycker på knappen.</p>${model.example ? `<p class="notice" role="status">Testversion. Exemplet sparar inte.</p>` : ""}${model.termFixture ? `<p class="notice" role="status">Testversion av en hel termin. Ingenting sparas. Den riktiga databasen har inte den här räckvidden förrän migreringen är aktiverad.</p>` : ""}${pendingNote}${warnings}${year}<form class="form-stack" data-form="meal-import-review">${weeks}${loose}<h2>Originalfil</h2><p class="form-hint">${fileHint}</p><label class="check"><input type="checkbox" name="attach_file"> Bifoga originalfilen</label><div class="form-grid"><label>Från<input type="date" name="file_start"></label><label>Till<input type="date" name="file_end"></label></div><button class="primary" type="submit">Spara granskade rätter</button></form>`;
  }

  function editorHtml(model) {
    const schools = model.schools || [];
    const schoolField = schools.length > 1
      ? `<label>Förskola<select name="preschool_id">${schools.map((school) => `<option value="${escapeHtml(school.id)}" ${school.id === model.preschoolId ? "selected" : ""}>${escapeHtml(school.name)}</option>`).join("")}</select></label>`
      : `<input type="hidden" name="preschool_id" value="${escapeHtml(model.preschoolId || "")}"><p class="page-sub">${escapeHtml(model.schoolName || "Ingen förskola kopplad")}</p>`;
    const menu = model.menu;
    const days = (model.days || []).map((day) => `<div class="meal-edit-day"><h3>${escapeHtml(day.label)} ${escapeHtml(day.iso)}</h3><label>Rätt<textarea name="day_body_${escapeHtml(day.iso)}" maxlength="400">${escapeHtml(day.body || "")}</textarea></label>${day.photoUrl ? `<img src="${escapeHtml(day.photoUrl)}" alt="Mat ${escapeHtml(day.label)}" referrerpolicy="no-referrer">` : ""}<label>Bild på maten, valfritt<input name="day_photo_${escapeHtml(day.iso)}" type="file" accept="image/*"></label><p class="form-hint">Bara mat. Inga barn i bilden.</p>${day.photoUrl ? `<button class="link" type="button" data-action="meal-clear-photo" data-date="${escapeHtml(day.iso)}">Ta bort bilden</button>` : ""}</div>`).join("");
      const currentFile = menu
      ? `<p class="meal-file">Nuvarande fil: ${escapeHtml(menu.display_name || "Matsedel")} · ${escapeHtml(menu.starts_on)}–${escapeHtml(menu.ends_on)}. ${menu.example ? "Exempelfil, kan inte öppnas." : ""}</p><button class="link" type="button" data-action="meal-clear-menu">Ta bort filen</button>`
      : `<p class="form-hint">Ingen fil är kopplad till den här veckan.</p>`;
    const disabled = model.locked ? "disabled" : "";
    return `<h1 class="h1">Matsedel</h1><p class="page-sub">En gemensam matsedel för förskolan.</p>${importEntryHtml()}<form class="form-stack" data-form="meal-week">${schoolField}<div class="meal-week-switch"><button class="link" type="button" data-action="meal-shift" data-start="${escapeHtml(model.previousWeek)}">Föregående vecka</button><button class="link" type="button" data-action="meal-shift" data-start="${escapeHtml(model.nextWeek)}">Nästa vecka</button></div><p class="kicker">Vecka ${escapeHtml(model.weekStart)}–${escapeHtml(model.weekEnd)}</p>${days}<h2>Befintlig matsedel</h2><p class="form-hint">Spara veckan bifogar filen utan att läsa rätter. Använd Läs in rätter för en PDF med text.</p><div class="form-grid"><label>Från<input name="menu_starts" type="date" value="${escapeHtml(menu?.starts_on || model.weekStart)}" required></label><label>Till<input name="menu_ends" type="date" value="${escapeHtml(menu?.ends_on || model.weekEnd)}" required></label></div><label>PDF eller bild<input name="menu_file" type="file" accept="application/pdf,image/*"></label><input type="hidden" name="menu_id" value="${escapeHtml(menu?.id || "")}">${currentFile}<button class="primary" type="submit" ${disabled}>Spara veckan</button></form>`;
  }

  async function transcodeJpeg(file, maxEdge, maxBytes) {
    if (!file.type.startsWith("image/")) throw new Error("Välj en bild.");
    if (file.size > 20 * 1024 * 1024) throw new Error("Bilden är större än 20 MB.");
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.84));
    if (!blob) throw new Error("Bilden kunde inte bearbetas.");
    if (blob.size > maxBytes) throw new Error("Bilden är för stor efter förminskning.");
    return blob;
  }

  async function preparedMenuFile(file) {
    const name = String(file.name || "");
    const header = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
    if (file.type === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
      if (!pdfHeaderOk(header)) throw new Error("PDF-filen kunde inte läsas. Bara en riktig PDF kan laddas upp.");
      if (file.size < 1 || file.size > 8 * 1024 * 1024) throw new Error("PDF-filen måste vara högst 8 MB.");
      return { blob: file, mime: "application/pdf", kind: "pdf" };
    }
    if (file.type.startsWith("image/")) {
      const blob = await transcodeJpeg(file, 1600, 8 * 1024 * 1024);
      return { blob, mime: "image/jpeg", kind: "jpg" };
    }
    throw new Error("Välj en PDF eller en bild.");
  }

  root.ArtanMeals = {
    EXAMPLE,
    DAY_LABELS,
    escapeHtml,
    addDays,
    mondayOf,
    weekDays,
    servingDate,
    isWeekday,
    rangesOverlap,
    presentation,
    sanitizeDisplayName,
    pdfHeaderOk,
    menuPath,
    photoPath,
    replaceCleanup,
    downloadUrl,
    tabsForRole,
    buriedViews,
    allowedViews,
    exampleBundle,
    applyText,
    demoBanner,
    todayCardHtml,
    weekHtml,
    editorHtml,
    importReviewHtml,
    preparedMenuFile,
    transcodeJpeg,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
