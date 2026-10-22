(function pickupHub(root) {
  const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
  const DAY_NAMES = ["mån", "tis", "ons", "tor", "fre"];

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
      otherPerson: Boolean(open && picker && picker.kind !== "guardian"),
      filled: Boolean(open && times && picker),
      closureReason: term?.closureReasons?.[iso] || "",
    };
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

  function renderCell(day, editable) {
    const classes = ["term-cell"];
    if (day.today) classes.push("is-today");
    if (day.closed) classes.push("is-closed");
    if (day.outside) classes.push("is-outside");
    if (day.open && !day.filled && day.inHorizon) classes.push("is-open");
    const person = day.otherPerson ? personIcon() : "";
    const body = day.closed
      ? `${closedIcon()}<span class="term-cell-day">${day.dayNumber}</span><span class="visually-hidden">Stängt${day.closureReason ? `, ${escapeHtml(day.closureReason)}` : ""}</span>`
      : `<span class="term-cell-day">${day.dayNumber}</span>${day.times ? `<span class="term-cell-times">${escapeHtml(day.times)}</span>` : ""}`;
    if (editable && day.open) {
      const label = `${shortDate(day.iso)}${day.times ? `, ${day.times}` : ", ingen tid"}${day.otherPerson ? ", någon annan hämtar" : ""}`;
      return `<button type="button" class="${classes.join(" ")}" data-action="edit-pickup-day" data-date="${escapeHtml(day.iso)}" ${day.today ? 'id="pickup-today"' : ""} aria-label="${escapeHtml(label)}">${body}${person}</button>`;
    }
    return `<div class="${classes.join(" ")}" ${day.today ? 'id="pickup-today"' : ""}>${body}${person}</div>`;
  }

  function renderTermGrid(input, options = {}) {
    const grid = input?.weeks ? input : buildTermGrid(input || {});
    if (!grid.weeks.length) return "";
    const editable = Boolean(options.editable);
    const head = ["", "Mån", "Tis", "Ons", "Tor", "Fre"].map((label) => `<span>${label}</span>`).join("");
    const weeks = grid.weeks.map((week) => `<div class="term-grid-week${week.needsPlan ? " is-unfilled" : ""}" role="row">
      <div class="term-grid-label"><span>${escapeHtml(week.label.replace(/ v\.\d+$/, ""))}</span><small>${escapeHtml(week.label.match(/v\.\d+$/)?.[0] || "")}</small>${week.needsPlan ? `<em>Inte ifylld</em>` : ""}</div>
      ${week.days.map((day) => renderCell(day, editable)).join("")}
    </div>`).join("");
    return `<div class="term-grid" role="grid" aria-label="Schema måndag till fredag"><div class="term-grid-head" role="row">${head}</div>${weeks}</div>`;
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
    renderTermGrid,
    shortDate,
    staffPickupCaption,
    weekLabel,
    weekMonday,
    weekdayNumber,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
