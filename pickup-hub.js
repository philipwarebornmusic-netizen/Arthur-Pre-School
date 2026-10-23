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

  function carriedPicker(plan) {
    if (!plan?.picker_kind || !plan.picker_id) return null;
    if (plan.picker_kind === "pass" && plan.pass_kind !== "permanent") return null;
    return { kind: plan.picker_kind, id: String(plan.picker_id), passKind: plan.pass_kind || "" };
  }

  function explicitPicker(plan) {
    if (!plan?.picker_kind || !plan.picker_id) return null;
    return { kind: plan.picker_kind, id: String(plan.picker_id), passKind: plan.pass_kind || "" };
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
    const previous = plansByDate.get(addDays(iso, -7));
    const standardRow = (term?.standard || []).find((row) => Number(row.weekday) === weekday && row.attending);
    const standardPicker = (input.standardPickers || []).find((row) => Number(row.weekday) === weekday);
    let dropoff = clock(plan?.dropoff_at);
    let pickup = clock(plan?.pickup_at);
    if (!dropoff || !pickup) {
      const previousDropoff = clock(previous?.dropoff_at);
      const previousPickup = clock(previous?.pickup_at);
      if (previousDropoff && previousPickup) {
        dropoff = previousDropoff;
        pickup = previousPickup;
      } else if (standardRow) {
        dropoff = clock(standardRow.dropoff_at);
        pickup = clock(standardRow.pickup_at);
      }
    }
    const picker = explicitPicker(plan) || carriedPicker(previous) || carriedPicker(standardPicker);
    const times = dropoff && pickup ? `${dropoff}–${pickup}` : "";
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
      times,
      dropoff,
      pickup,
      picker,
      otherPerson: someoneElse(open, picker, input.viewerId),
      filled: Boolean(open && times && picker),
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
    if (day.open && !day.times) classes.push("is-empty");
    if (day.open && !day.filled && day.inHorizon) classes.push("is-open");
    const person = day.otherPerson ? personIcon() : "";
    const clocks = day.dropoff && day.pickup
      ? `<span class="term-cell-times"><span>${escapeHtml(day.dropoff)}</span><span class="term-cell-dash">–</span><span>${escapeHtml(day.pickup)}</span></span>`
      : "";
    const body = day.closed
      ? `${closedIcon()}<span class="visually-hidden">Stängt${day.closureReason ? `, ${escapeHtml(day.closureReason)}` : ""}</span>`
      : clocks || `<span class="term-cell-empty" aria-hidden="true"></span>`;
    const label = [
      shortDate(day.iso),
      day.closed ? "stängt" : day.times || (day.open ? "ingen tid" : ""),
      day.otherPerson ? "någon annan hämtar" : "",
    ].filter(Boolean).join(", ");
    const todayId = day.today ? 'id="pickup-today"' : "";
    if (editable) {
      return `<button type="button" class="${classes.join(" ")}" data-action="edit-pickup-week" data-monday="${escapeHtml(monday)}" ${todayId} aria-label="${escapeHtml(label)}">${body}${person}</button>`;
    }
    return `<div class="${classes.join(" ")}" ${todayId} aria-label="${escapeHtml(label)}">${body}${person}</div>`;
  }

  function renderTermGrid(input, options = {}) {
    const grid = input?.weeks ? input : buildTermGrid(input || {});
    if (!grid.weeks.length) return "";
    const editable = Boolean(options.editable);
    const currentMonday = anchorMonday(grid.weeks, input?.today || "");
    const year = String(input?.today || grid.weeks[0].monday || "").slice(0, 4);
    const head = [year, "Mån", "Tis", "Ons", "Tor", "Fre"].map((label) => `<span>${label}</span>`).join("");
    const weeks = grid.weeks.map((week) => {
      const range = week.label.replace(/ v\.\d+$/, "");
      const number = week.label.match(/v\.\d+$/)?.[0] || "";
      const labelInner = `<span>${escapeHtml(range)}</span><small>${escapeHtml(number)}</small>${week.needsPlan ? "<em>Inte ifylld</em>" : ""}`;
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
      const avatarKind = day.avatarKind === "contact" ? "is-contact" : day.avatarKind === "pass" ? "is-pass" : "is-guardian";
      return `<div class="${classes.join(" ")}" data-weekday="${weekday}">${circle}<label class="week-time"><span class="visually-hidden">Lämning ${escapeHtml(dateLabel)}</span><input type="time" data-week-time="dropoff" data-date="${escapeHtml(day.iso)}" value="${escapeHtml(day.dropoff || "")}" ${disabled}></label><span class="week-dash" aria-hidden="true">–</span><label class="week-time"><span class="visually-hidden">Hämtning ${escapeHtml(dateLabel)}</span><input type="time" data-week-time="pickup" data-date="${escapeHtml(day.iso)}" value="${escapeHtml(day.pickup || "")}" ${disabled}></label><label class="week-ledig"><input type="checkbox" data-week-ledig data-date="${escapeHtml(day.iso)}" ${day.ledig ? "checked" : ""}><span>Ledig</span></label><button class="week-avatar ${avatarKind}" type="button" data-action="open-picker" data-date="${escapeHtml(day.iso)}" aria-label="Vem hämtar ${escapeHtml(dateLabel)}" ${disabled}>${escapeHtml(day.initials || "?")}</button></div>`;
    }).join("");
    const error = model?.error ? `<p class="notice error">${escapeHtml(model.error)}</p>` : "";
    return `<section id="week-sheet" class="week-sheet" role="dialog" aria-modal="true" aria-labelledby="week-sheet-title"><header class="week-sheet-bar"><button class="week-back" type="button" data-action="close-pickup-editor" aria-label="Tillbaka">‹</button><h1 id="week-sheet-title">Vecka ${escapeHtml(model?.weekNumber || "")}</h1><button class="week-save" type="button" data-action="save-pickup-week">Spara</button></header><div class="week-sheet-body">${error}${rows}<p class="form-hint">Ledig hoppar över dagen. En standardvecka syns kvar tills dagen sparas med tider.</p></div></section>`;
  }

  function renderPickerSheet(model) {
    const people = (model?.people || []).map((person) => {
      const kind = person.kind === "contact" ? "is-contact" : "is-guardian";
      return `<li><button type="button" class="picker-person${person.selected ? " is-selected" : ""}" data-action="choose-picker" data-token="${escapeHtml(person.token)}" aria-pressed="${person.selected ? "true" : "false"}"><span class="picker-avatar ${kind}">${escapeHtml(person.initials)}</span><span>${escapeHtml(person.name)}</span></button></li>`;
    }).join("");
    const list = people || `<li class="form-hint">Ingen person att välja.</li>`;
    return `<section id="picker-sheet" class="picker-sheet" role="dialog" aria-modal="true" aria-labelledby="picker-sheet-title"><button type="button" class="picker-sheet-backdrop" data-action="close-picker" aria-label="Stäng"></button><div class="picker-sheet-panel"><header class="picker-sheet-bar"><h2 id="picker-sheet-title">Hämtar ${escapeHtml(model?.weekdayName || "")}</h2><button class="picker-confirm" type="button" data-action="confirm-picker" aria-label="Bekräfta">✓</button></header><ul class="picker-list">${list}</ul></div></section>`;
  }

  function staffPickupCaption(rows, today) {
    const ordered = [...(rows || [])].sort((left, right) => String(left.plan_date).localeCompare(String(right.plan_date)));
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

  root.ArtanPickup = {
    addDays,
    buildTermGrid,
    isoWeekNumber,
    personInitials,
    renderPickerSheet,
    renderTermGrid,
    renderWeekEditor,
    shortDate,
    staffPickupCaption,
    weekLabel,
    weekMonday,
    weekdayName,
    weekdayNumber,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
