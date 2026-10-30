(function pickupHub(root) {
  const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const DAY_NAMES = ["mån", "tis", "ons", "tor", "fre"];
  const SHORT_DAYS = ["Mån", "Tis", "Ons", "Tor", "Fre"];
  const FULL_DAYS = ["måndag", "tisdag", "onsdag", "torsdag", "fredag"];

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    }[char]));
  }

  function isoDate(iso) {
    const [year, month, day] = String(iso || "").split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  function formatIso(date) {
    return date.toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    const date = isoDate(iso);
    if (!date) return "";
    date.setUTCDate(date.getUTCDate() + days);
    return formatIso(date);
  }

  function weekdayNumber(iso) {
    const date = isoDate(iso);
    if (!date) return 0;
    const day = date.getUTCDay();
    return day === 0 || day === 6 ? 0 : day;
  }

  function weekMonday(iso) {
    const date = isoDate(iso);
    if (!date) return "";
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - (day - 1));
    return formatIso(date);
  }

  function isoWeekNumber(iso) {
    const date = isoDate(iso);
    if (!date) return 0;
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function shortDate(iso) {
    const date = isoDate(iso);
    if (!date) return "";
    return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  }

  function weekLabel(monday) {
    return `${shortDate(monday)}–${shortDate(addDays(monday, 4))} v.${isoWeekNumber(monday)}`;
  }

  function clock(value) {
    const match = String(value || "").match(/^(\d{1,2}):(\d{2})/);
    if (!match) return "";
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  function personFrom(plan, prefix, allowDayPass = true) {
    const kind = plan?.[`${prefix}_kind`];
    const id = plan?.[`${prefix}_id`];
    const passKind = plan?.[`${prefix === "picker" ? "pass_kind" : `${prefix}_pass_kind`}`] || "";
    if (!kind || !id) return null;
    if (kind === "pass" && !allowDayPass && passKind !== "permanent") return null;
    return { kind, id: String(id), passKind };
  }

  function carriedPicker(plan) {
    return personFrom(plan, "picker", false);
  }

  function explicitPicker(plan) {
    return personFrom(plan, "picker");
  }

  function carriedDropoffPerson(plan) {
    return personFrom(plan, "dropoff_person", false);
  }

  function explicitDropoffPerson(plan) {
    return personFrom(plan, "dropoff_person");
  }

  function buildPickupCell(iso, input, plansByDate) {
    const today = input.today;
    const terms = input.terms || [];
    const term = terms.find((item) => iso >= item.starts_on && iso <= item.ends_on) || null;
    const weekday = weekdayNumber(iso);
    const closed = Boolean(term && (term.closures || []).includes(iso));
    const open = Boolean(term) && !closed;
    const horizonEnd = addDays(today, 6);
    const plan = plansByDate.get(iso);
    const savedDropoff = clock(plan?.dropoff_at);
    const savedPickup = clock(plan?.pickup_at);
    const saved = Boolean(savedDropoff && savedPickup);
    const picker = saved ? explicitPicker(plan) : null;
    const dropoffPerson = saved ? explicitDropoffPerson(plan) : null;
    const standardRow = (term?.standard || []).find((row) => Number(row.weekday) === weekday && row.attending);
    const suggestionDropoff = !saved && open ? clock(standardRow?.dropoff_at) : "";
    const suggestionPickup = !saved && open ? clock(standardRow?.pickup_at) : "";
    const suggestion = Boolean(suggestionDropoff && suggestionPickup);
    return {
      iso,
      weekday,
      dayNumber: Number(String(iso).slice(8, 10)),
      inTerm: Boolean(term),
      closed,
      outside: !term,
      open,
      today: iso === today,
      inHorizon: Boolean(today) && iso >= today && iso <= horizonEnd,
      saved,
      times: saved ? `${savedDropoff}–${savedPickup}` : "",
      dropoff: saved ? savedDropoff : "",
      pickup: saved ? savedPickup : "",
      suggestion,
      suggestionDropoff: suggestion ? suggestionDropoff : "",
      suggestionPickup: suggestion ? suggestionPickup : "",
      picker,
      dropoffPerson,
      otherPerson: someoneElse(open, picker, input.viewerId),
      filled: Boolean(open && saved && picker),
      closureReason: term?.closureReasons?.[iso] || "",
    };
  }

  function someoneElse(open, picker, viewerId) {
    if (!open || !picker) return false;
    if (viewerId) return !(picker.kind === "guardian" && String(picker.id) === String(viewerId));
    return picker.kind !== "guardian";
  }

  function buildTermGrid(input) {
    const terms = input?.terms || [];
    if (!terms.length) return { weeks: [], unfilled: false };
    const starts = terms.map((term) => term.starts_on).filter(Boolean).sort();
    const ends = terms.map((term) => term.ends_on).filter(Boolean).sort();
    if (!starts.length || !ends.length || starts[0] > ends[ends.length - 1]) return { weeks: [], unfilled: false };
    const plansByDate = new Map((input.dayPlans || []).map((plan) => [plan.plan_date, plan]));
    const weeks = [];
    let monday = weekMonday(starts[0]);
    const last = weekMonday(ends[ends.length - 1]);
    for (let guard = 0; monday && monday <= last && guard < 80; guard += 1) {
      const days = [0, 1, 2, 3, 4].map((offset) => buildPickupCell(addDays(monday, offset), input, plansByDate));
      weeks.push({
        monday,
        label: weekLabel(monday),
        needsPlan: input.markUnfilled === false ? false : days.some((day) => day.open && day.inHorizon && !day.filled),
        days,
      });
      monday = addDays(monday, 7);
    }
    return { weeks, unfilled: weeks.some((week) => week.needsPlan) };
  }

  function personIcon() {
    return `<svg class="term-person" viewBox="0 0 16 16" role="img" aria-label="Någon annan hämtar"><circle cx="8" cy="5" r="2.2"></circle><path d="M3.2 13.4c.7-2.5 2.4-3.7 4.8-3.7s4.1 1.2 4.8 3.7"></path></svg>`;
  }

  function closedIcon() {
    return `<svg class="term-closed-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.2"></circle><path d="M4.8 4.8l6.4 6.4"></path></svg>`;
  }

  function anchorMonday(weeks, today) {
    if (!today || !weeks.length) return "";
    const monday = weekMonday(today);
    if (weeks.some((week) => week.monday === monday)) return monday;
    return (weeks.find((week) => week.monday > monday) || weeks[weeks.length - 1]).monday;
  }

  function renderCell(day, editable, monday) {
    const classes = ["term-cell"];
    if (day.today) classes.push("is-today");
    if (day.closed) classes.push("is-closed");
    if (day.outside) classes.push("is-outside");
    if (day.open && !day.saved) classes.push("is-empty");
    if (day.open && !day.filled && day.inHorizon) classes.push("is-open");
    const person = day.otherPerson ? personIcon() : "";
    const date = `<span class="term-cell-date" aria-hidden="true">${day.today ? "<strong>Idag</strong>" : ""}<span>${escapeHtml(day.dayNumber)}</span></span>`;
    const clocks = day.saved
      ? `<span class="term-cell-times"><span>${escapeHtml(day.dropoff)}</span><span class="term-cell-dash">–</span><span>${escapeHtml(day.pickup)}</span></span>`
      : day.suggestion
        ? `<span class="term-cell-times is-suggestion"><span>${escapeHtml(day.suggestionDropoff)}</span><span class="term-cell-dash">–</span><span>${escapeHtml(day.suggestionPickup)}</span></span>`
        : "";
    const body = day.closed
      ? `${closedIcon()}<span class="visually-hidden">Stängt${day.closureReason ? `, ${escapeHtml(day.closureReason)}` : ""}</span>`
      : clocks || `<span class="term-cell-empty" aria-hidden="true"></span>`;
    const label = [
      shortDate(day.iso),
      day.today ? "idag" : "",
      day.closed ? "stängt" : day.times || (day.suggestion ? `förslag ${day.suggestionDropoff}–${day.suggestionPickup}` : (day.open ? "ingen tid" : "")),
      day.otherPerson ? "någon annan hämtar" : "",
    ].filter(Boolean).join(", ");
    const todayId = day.today ? 'id="pickup-today"' : "";
    if (editable) {
      return `<button type="button" class="${classes.join(" ")}" data-action="edit-pickup-week" data-monday="${escapeHtml(monday)}" ${todayId} aria-label="${escapeHtml(label)}">${date}${body}${person}</button>`;
    }
    return `<div class="${classes.join(" ")}" ${todayId} aria-label="${escapeHtml(label)}">${date}${body}${person}</div>`;
  }

  function renderTermGrid(input, options = {}) {
    const grid = input?.weeks ? input : buildTermGrid(input || {});
    if (!grid.weeks.length) return "";
    const editable = Boolean(options.editable);
    const currentMonday = anchorMonday(grid.weeks, input?.today || "");
    const visibleWeeks = options.currentWeekOnly
      ? [grid.weeks.find((week) => week.monday === currentMonday) || grid.weeks[0]]
      : grid.weeks;
    const year = String(input?.today || visibleWeeks[0].monday || "").slice(0, 4);
    const head = [year, "Mån", "Tis", "Ons", "Tor", "Fre"].map((label) => `<span>${label}</span>`).join("");
    const weeks = visibleWeeks.map((week) => {
      const range = week.label.replace(/ v\.\d+$/, "");
      const number = week.label.match(/v\.\d+$/)?.[0] || "";
      const unsaved = week.days.some((day) => day.open && !day.saved);
      const labelInner = `<span>${escapeHtml(range)}</span><small>${escapeHtml(number)}</small>${unsaved ? "<em>Ej ifylld</em>" : ""}`;
      const label = editable
        ? `<button type="button" class="term-grid-label" data-action="edit-pickup-week" data-monday="${escapeHtml(week.monday)}">${labelInner}</button>`
        : `<div class="term-grid-label">${labelInner}</div>`;
      const current = week.monday === currentMonday ? 'id="pickup-current-week"' : "";
      return `<div class="term-grid-week${week.needsPlan ? " is-unfilled" : ""}" role="row" ${current}>${label}${week.days.map((day) => renderCell(day, editable, week.monday)).join("")}</div>`;
    }).join("");
    return `<div class="term-grid" role="grid" aria-label="Schema måndag till fredag"><div class="term-grid-head" role="row">${head}</div>${weeks}</div>`;
  }

  function weekdayName(iso, form = "short") {
    const number = weekdayNumber(iso);
    if (!number) return "";
    return (form === "full" ? FULL_DAYS : SHORT_DAYS)[number - 1] || "";
  }

  function personInitials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("sv");
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("sv");
  }

  function planTimes(plan) {
    const dropoff = clock(plan?.dropoff_at);
    const pickup = clock(plan?.pickup_at);
    if (!dropoff || !pickup) return null;
    return {
      dropoff,
      pickup,
      dropoffPerson: explicitDropoffPerson(plan),
      picker: explicitPicker(plan),
    };
  }

  function standardEntry(input, iso) {
    const weekday = weekdayNumber(iso);
    const term = (input?.terms || []).find((item) => iso >= item.starts_on && iso <= item.ends_on);
    if (!term) return null;
    const row = (term.standard || []).find((item) => Number(item.weekday) === weekday && item.attending);
    const dropoff = clock(row?.dropoff_at);
    const pickup = clock(row?.pickup_at);
    if (!dropoff || !pickup) return null;
    const pickerRow = (input.standardPickers || []).find((item) => Number(item.weekday) === weekday);
    return {
      dropoff,
      pickup,
      dropoffPerson: carriedDropoffPerson(pickerRow),
      picker: carriedPicker(pickerRow),
    };
  }

  function latestSavedWeek(input, monday) {
    const saved = (input?.dayPlans || []).map((plan) => ({ plan, times: planTimes(plan) })).filter((item) => item.times && item.plan.plan_date < monday);
    if (!saved.length) return null;
    let bestMonday = "";
    for (const item of saved) {
      const week = weekMonday(item.plan.plan_date);
      if (week > bestMonday) bestMonday = week;
    }
    const byWeekday = new Map();
    for (const item of saved) {
      if (weekMonday(item.plan.plan_date) !== bestMonday) continue;
      byWeekday.set(weekdayNumber(item.plan.plan_date), item.times);
    }
    return { monday: bestMonday, byWeekday };
  }

  function hasEarlierSavedWeek(input, monday) {
    return Boolean(latestSavedWeek(input, monday));
  }

  function clonePicker(picker) {
    if (!picker?.kind || !picker.id) return null;
    return { kind: picker.kind, id: String(picker.id), passKind: picker.passKind || "" };
  }

  function spreadFilledDay(days) {
    const donor = days.find((day) => day.open && !day.closed && !day.ledig && day.dropoff && day.pickup);
    if (!donor) return days;
    return days.map((day) => {
      if (day.iso === donor.iso || !day.open || day.closed || day.ledig || day.manual || day.dropoff || day.pickup) return day;
      const dropoffPerson = day.dropoffPerson && !day.dropoffPersonDefault ? clonePicker(day.dropoffPerson) : clonePicker(donor.dropoffPerson);
      const picker = day.picker && !day.pickerDefault ? clonePicker(day.picker) : clonePicker(donor.picker);
      return {
        ...day,
        dropoff: donor.dropoff,
        pickup: donor.pickup,
        dropoffPerson,
        dropoffPersonDefault: Boolean(dropoffPerson) && !(day.dropoffPerson && !day.dropoffPersonDefault) && Boolean(donor.dropoffPersonDefault),
        picker,
        pickerDefault: Boolean(picker) && !(day.picker && !day.pickerDefault) && Boolean(donor.pickerDefault),
        origin: "copied",
      };
    });
  }

  function weekEditorSeed(input, monday, viewerId) {
    const grid = buildTermGrid({ ...(input || {}), markUnfilled: false });
    const week = (grid.weeks || []).find((item) => item.monday === monday);
    if (!week) return [];
    const plans = new Map((input?.dayPlans || []).map((plan) => [plan.plan_date, plan]));
    const standardWeek = week.days.some((day) => day.open && standardEntry(input, day.iso));
    const recent = standardWeek ? null : latestSavedWeek(input, monday)?.byWeekday;
    const seeded = week.days.map((day) => {
      const own = planTimes(plans.get(day.iso));
      const standard = standardWeek && day.open ? standardEntry(input, day.iso) : null;
      const saved = !standardWeek ? recent?.get(day.weekday) : null;
      let dropoff = "";
      let pickup = "";
      let dropoffPerson = null;
      let picker = null;
      let origin = "empty";
      if (own) {
        dropoff = own.dropoff;
        pickup = own.pickup;
        dropoffPerson = own.dropoffPerson;
        picker = own.picker;
        origin = "own";
      } else if (standard) {
        dropoff = standard.dropoff;
        pickup = standard.pickup;
        dropoffPerson = standard.dropoffPerson;
        picker = standard.picker;
        origin = "standard";
      } else if (saved) {
        dropoff = saved.dropoff;
        pickup = saved.pickup;
        dropoffPerson = saved.dropoffPerson;
        picker = saved.picker;
        origin = "recent";
      }
      const dropoffPersonDefault = Boolean(day.open && dropoff && pickup && !dropoffPerson && viewerId);
      const pickerDefault = Boolean(day.open && dropoff && pickup && !picker && viewerId);
      if (dropoffPersonDefault) dropoffPerson = { kind: "guardian", id: String(viewerId), passKind: "" };
      if (pickerDefault) picker = { kind: "guardian", id: String(viewerId), passKind: "" };
      return {
        iso: day.iso,
        weekday: day.weekday,
        open: day.open,
        closed: day.closed,
        outside: day.outside,
        dropoff,
        pickup,
        ledig: false,
        dropoffPerson: clonePicker(dropoffPerson),
        dropoffPersonDefault,
        picker: clonePicker(picker),
        pickerDefault,
        manual: false,
        origin,
      };
    });
    return standardWeek ? seeded : spreadFilledDay(seeded);
  }

  function usualWeekValue(days, field) {
    for (const day of days || []) {
      if (!day.open || day.closed || day.ledig) continue;
      if (field === "picker") {
        if (day.picker && !day.pickerDefault) return clonePicker(day.picker);
      } else if (field === "dropoffPerson") {
        if (day.dropoffPerson && !day.dropoffPersonDefault) return clonePicker(day.dropoffPerson);
      } else if (day[field]) return day[field];
    }
    if (field === "dropoff") return "08:00";
    if (field === "pickup") return "16:30";
    return null;
  }

  function smartFillWeek(days, sourceIso, field, value) {
    const personField = field === "picker" || field === "dropoffPerson";
    if (!personField && !value) {
      return (days || []).map((day) => (day.iso === sourceIso ? { ...day, manual: true, origin: "user", [field]: "" } : day));
    }
    return (days || []).map((day) => {
      if (day.iso === sourceIso) {
        if (!day.open || day.closed) return day;
        const next = {
          ...day,
          manual: true,
          origin: "user",
          dropoffPerson: clonePicker(day.dropoffPerson),
          picker: clonePicker(day.picker),
        };
        if (personField) {
          next[field] = clonePicker(value) || next[field];
          next[field === "picker" ? "pickerDefault" : "dropoffPersonDefault"] = false;
        } else next[field] = value;
        return next;
      }
      if (!day.open || day.closed || day.ledig || day.manual) return day;
      if (personField) {
        const person = clonePicker(value);
        if (!person) return day;
        const defaultField = field === "picker" ? "pickerDefault" : "dropoffPersonDefault";
        if (day.origin !== "copied" && day[field] && !day[defaultField]) return day;
        return { ...day, [field]: person, [defaultField]: false, origin: day.origin === "empty" || !day.origin ? "copied" : day.origin };
      }
      if (day[field] && day.origin !== "copied") return day;
      return {
        ...day,
        [field]: value,
        dropoffPerson: clonePicker(day.dropoffPerson),
        picker: clonePicker(day.picker),
        origin: day.origin === "empty" || !day.origin ? "copied" : day.origin,
      };
    });
  }

  function assignDefaultPicker(days, viewerId) {
    if (!viewerId) return days || [];
    return (days || []).map((day) => {
      if (!day.open || day.closed || day.ledig || !day.dropoff || !day.pickup) return day;
      const defaultPerson = { kind: "guardian", id: String(viewerId), passKind: "" };
      return {
        ...day,
        dropoffPerson: day.dropoffPerson || defaultPerson,
        dropoffPersonDefault: day.dropoffPerson ? Boolean(day.dropoffPersonDefault) : true,
        picker: day.picker || defaultPerson,
        pickerDefault: day.picker ? Boolean(day.pickerDefault) : true,
      };
    });
  }

  function reopenWeekDay(days, iso, viewerId) {
    const others = (days || []).filter((day) => day.iso !== iso);
    return (days || []).map((day) => {
      if (day.iso !== iso || !day.open || day.closed) return day;
      const next = {
        ...day,
        ledig: false,
        manual: true,
        origin: "user",
        dropoffPerson: clonePicker(day.dropoffPerson),
        picker: clonePicker(day.picker),
      };
      if (!next.dropoff) next.dropoff = usualWeekValue(others, "dropoff");
      if (!next.pickup) next.pickup = usualWeekValue(others, "pickup");
      for (const [field, defaultField] of [["dropoffPerson", "dropoffPersonDefault"], ["picker", "pickerDefault"]]) {
        if (next[field] && !next[defaultField]) continue;
        const usual = usualWeekValue(others, field);
        if (usual) {
          next[field] = usual;
          next[defaultField] = false;
        } else if (viewerId) {
          next[field] = { kind: "guardian", id: String(viewerId), passKind: "" };
          next[defaultField] = true;
        }
      }
      return next;
    });
  }

  function fillFromPreviousWeek(days, input, monday) {
    const plans = new Map((input?.dayPlans || []).map((plan) => [plan.plan_date, plan]));
    const apply = (lookup) => {
      let copied = 0;
      const next = (days || []).map((day) => {
        if (!day.open || day.closed) return day;
        const saved = lookup(day);
        if (!saved) return day;
        copied += 1;
        const dropoffPerson = clonePicker(saved.dropoffPerson) || clonePicker(day.dropoffPerson);
        const picker = clonePicker(saved.picker) || clonePicker(day.picker);
        return {
          ...day,
          dropoff: saved.dropoff,
          pickup: saved.pickup,
          ledig: false,
          dropoffPerson,
          dropoffPersonDefault: !saved.dropoffPerson && Boolean(day.dropoffPersonDefault),
          picker,
          pickerDefault: !saved.picker && Boolean(day.pickerDefault),
          manual: false,
          origin: "previous",
        };
      });
      return { days: next, copied };
    };
    const direct = apply((day) => planTimes(plans.get(addDays(day.iso, -7))));
    if (direct.copied) return { ...direct, weekNumber: isoWeekNumber(addDays(monday, -7)), fallback: false };
    const recent = latestSavedWeek(input, monday);
    if (!recent) return { days: days || [], copied: 0, weekNumber: 0, fallback: false };
    const fallback = apply((day) => recent.byWeekday.get(day.weekday));
    return { ...fallback, weekNumber: isoWeekNumber(recent.monday), fallback: Boolean(fallback.copied) };
  }

  function renderWeekEditor(model) {
    const rows = (model?.days || []).map((day) => {
      const weekday = Number(day.weekday) || weekdayNumber(day.iso);
      const name = SHORT_DAYS[weekday - 1] || "";
      const dateLabel = `${name} ${shortDate(day.iso)}`.trim();
      const classes = ["week-row"];
      if (day.closed) classes.push("is-closed");
      if (day.outside) classes.push("is-outside");
      if (day.ledig) classes.push("is-ledig");
      const circle = `<span class="week-date-circle" aria-hidden="true"><span>${escapeHtml(name)}</span><span>${escapeHtml(shortDate(day.iso))}</span></span><span class="visually-hidden">${escapeHtml(dateLabel)}</span>`;
      if (!day.open) {
        const note = day.closed
          ? `${closedIcon()}<span>Stängt</span>`
          : "<span>Utanför</span>";
        return `<div class="${classes.join(" ")}" data-weekday="${weekday}">${circle}<span class="week-closed">${note}</span></div>`;
      }
      const disabled = day.ledig ? "disabled" : "";
      const dropoffKind = day.dropoffKind === "contact" ? "is-contact" : "is-guardian";
      const pickupKind = day.pickupKind === "contact" ? "is-contact" : day.pickupKind === "pass" ? "is-pass" : "is-guardian";
      const dropoffInitials = day.dropoffInitials || day.initials || "?";
      const pickupInitials = day.pickupInitials || day.initials || "?";
      return `<div class="${classes.join(" ")}" data-weekday="${weekday}">${circle}<div class="week-handoffs"><div class="week-handoff"><span class="week-handoff-label">Lämning</span><label class="week-time"><span class="visually-hidden">Lämningstid ${escapeHtml(dateLabel)}</span><input type="time" data-week-time="dropoff" data-date="${escapeHtml(day.iso)}" value="${escapeHtml(day.dropoff || "")}" ${disabled}></label><button class="week-avatar ${dropoffKind}" type="button" data-action="open-picker" data-person-role="dropoff" data-date="${escapeHtml(day.iso)}" aria-label="Vem lämnar ${escapeHtml(dateLabel)}" ${disabled}>${escapeHtml(dropoffInitials)}</button></div><div class="week-handoff"><span class="week-handoff-label">Hämtning</span><label class="week-time"><span class="visually-hidden">Hämtningstid ${escapeHtml(dateLabel)}</span><input type="time" data-week-time="pickup" data-date="${escapeHtml(day.iso)}" value="${escapeHtml(day.pickup || "")}" ${disabled}></label><button class="week-avatar ${pickupKind}" type="button" data-action="open-picker" data-person-role="pickup" data-date="${escapeHtml(day.iso)}" aria-label="Vem hämtar ${escapeHtml(dateLabel)}" ${disabled}>${escapeHtml(pickupInitials)}</button></div></div><label class="week-ledig"><input type="checkbox" data-week-ledig data-date="${escapeHtml(day.iso)}" ${day.ledig ? "checked" : ""}><span>Ledig</span></label></div>`;
    }).join("");
    const error = model?.error ? `<p class="notice error">${escapeHtml(model.error)}</p>` : "";
    const note = model?.note ? `<p class="form-hint" data-week-note>${escapeHtml(model.note)}</p>` : "";
    const copyButton = model?.canCopyPrevious ? `<button class="secondary week-copy" type="button" data-action="same-as-previous-week">Samma som förra veckan</button>` : "";
    return `<section id="week-sheet" class="week-sheet" role="dialog" aria-modal="true" aria-labelledby="week-sheet-title"><header class="week-sheet-bar"><button class="week-back" type="button" data-action="close-pickup-editor" aria-label="Tillbaka">‹</button><h1 id="week-sheet-title">Vecka ${escapeHtml(model?.weekNumber || "")}</h1><button class="week-save" type="button" data-action="save-pickup-week">Spara</button></header><div class="week-sheet-body">${error}${note}${copyButton}${rows}<p class="form-hint">Lämnare och hämtare väljs var för sig. Fyll i en dag, så följer de andra tomma dagarna med. Ledig hoppar över dagen.</p></div></section>`;
  }

  function renderPickerSheet(model) {
    const people = (model?.people || []).map((person) => {
      const kind = person.kind === "contact" ? "is-contact" : "is-guardian";
      return `<li><button type="button" class="picker-person${person.selected ? " is-selected" : ""}" data-action="choose-picker" data-token="${escapeHtml(person.token)}" aria-pressed="${person.selected ? "true" : "false"}"><span class="picker-avatar ${kind}">${escapeHtml(person.initials)}</span><span>${escapeHtml(person.name)}</span></button></li>`;
    }).join("");
    const list = people || `<li class="form-hint">Ingen person att välja.</li>`;
    const verb = model?.role === "dropoff" ? "Lämnar" : "Hämtar";
    return `<section id="picker-sheet" class="picker-sheet" role="dialog" aria-modal="true" aria-labelledby="picker-sheet-title"><button type="button" class="picker-sheet-backdrop" data-action="close-picker" aria-label="Stäng"></button><div class="picker-sheet-panel"><header class="picker-sheet-bar"><h2 id="picker-sheet-title">${verb} ${escapeHtml(model?.weekdayName || "")}</h2><button class="picker-confirm" type="button" data-action="confirm-picker" aria-label="Bekräfta">✓</button></header><ul class="picker-list">${list}</ul></div></section>`;
  }

  function staffPickupCaption(rows, today) {
    const savedOnly = (row) => {
      if (row?.saved === false || row?.source === "previous" || row?.source === "standard") {
        return { ...row, dropoff_at: "", pickup_at: "", picker_label: "" };
      }
      return row;
    };
    const ordered = [...(rows || [])].map(savedOnly).sort((left, right) => String(left.plan_date).localeCompare(String(right.plan_date)));
    const todayRow = ordered.find((row) => row.plan_date === today);
    let todayText = "";
    if (todayRow?.in_term && todayRow.closed) todayText = "Idag stängt";
    else if (todayRow?.in_term && clock(todayRow.dropoff_at) && clock(todayRow.pickup_at)) {
      const who = todayRow.picker_label ? ` · ${todayRow.picker_label}` : "";
      todayText = `Idag ${clock(todayRow.dropoff_at)}–${clock(todayRow.pickup_at)}${who}`;
    } else if (todayRow?.in_term) todayText = "Idag ingen planerad tid";
    const weekText = ordered
      .filter((row) => row.in_term && !row.closed && clock(row.dropoff_at) && clock(row.pickup_at))
      .map((row) => `${DAY_NAMES[weekdayNumber(row.plan_date) - 1] || ""} ${clock(row.dropoff_at)}–${clock(row.pickup_at)}`.trim())
      .join(", ");
    return { todayText, weekText };
  }

  function isoDay(value) {
    return String(value || "").slice(0, 10);
  }

  function termRows(terms) {
    return (terms || [])
      .map((term) => ({ starts_on: isoDay(term?.starts_on), ends_on: isoDay(term?.ends_on) }))
      .filter((term) => term.starts_on && term.ends_on);
  }

  function calendarPassEnd(today) {
    const year = Number(isoDay(today).slice(0, 4));
    const june = `${year}-06-30`;
    const december = `${year}-12-31`;
    if (today <= june) return june;
    if (today <= december) return december;
    return `${year + 1}-06-30`;
  }

  function nextCalendarPassEnd(anchor) {
    const year = Number(isoDay(anchor).slice(0, 4));
    const candidates = [`${year}-06-30`, `${year}-12-31`, `${year + 1}-06-30`, `${year + 1}-12-31`, `${year + 2}-06-30`];
    const horizon = addDays(anchor, 14);
    return candidates.find((date) => date > horizon) || candidates.find((date) => date > anchor) || `${year + 2}-06-30`;
  }

  function defaultPassEnd(today, terms) {
    const day = isoDay(today);
    const rows = termRows(terms);
    const current = rows.filter((term) => term.starts_on <= day && day <= term.ends_on);
    if (current.length) return current.map((term) => term.ends_on).sort().at(-1);
    const upcoming = rows.filter((term) => term.starts_on > day).sort((left, right) => left.starts_on.localeCompare(right.starts_on) || left.ends_on.localeCompare(right.ends_on));
    if (upcoming.length) return upcoming[0].ends_on;
    return calendarPassEnd(day);
  }

  function nextPassEnd(today, afterDate, terms) {
    const day = isoDay(today);
    const anchor = afterDate && isoDay(afterDate) > day ? isoDay(afterDate) : day;
    const later = termRows(terms).map((term) => term.ends_on).filter((endsOn) => endsOn > anchor).sort();
    if (later.length) return later[0];
    return nextCalendarPassEnd(anchor);
  }

  function passRenewalDue(today, endsOn, dismissed) {
    const end = isoDay(endsOn);
    if (!end || dismissed) return false;
    const day = isoDay(today);
    if (end < day) return false;
    return end <= addDays(day, 14);
  }

  function swedishGenitive(name) {
    const cleaned = String(name || "").trim();
    if (!cleaned) return "Personens";
    const last = cleaned.slice(-1).toLocaleLowerCase("sv-SE");
    if (last === "s" || last === "x" || last === "z") return cleaned;
    return `${cleaned}s`;
  }

  root.ArtanPickup = {
    addDays,
    buildTermGrid,
    isoWeekNumber,
    assignDefaultPicker,
    fillFromPreviousWeek,
    hasEarlierSavedWeek,
    personInitials,
    reopenWeekDay,
    renderPickerSheet,
    smartFillWeek,
    usualWeekValue,
    weekEditorSeed,
    renderTermGrid,
    renderWeekEditor,
    shortDate,
    staffPickupCaption,
    weekLabel,
    weekMonday,
    weekdayName,
    weekdayNumber,
    defaultPassEnd,
    nextPassEnd,
    passRenewalDue,
    swedishGenitive,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
