const days = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const months = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"];

const preschool = {
  name: "Björkbacken",
  hours: "06:30–17:30",
  phone: "08-400 00 10",
};

const children = [
  { id: "elsa", name: "Elsa", age: "4 år", dept: "Eken", pickup: "16:00" },
  { id: "love", name: "Love", age: "2 år", dept: "Linden", pickup: "15:30" },
];

const floor = [
  { id: "elsa", name: "Elsa" },
  { id: "noa", name: "Noa" },
  { id: "signe", name: "Signe" },
  { id: "otto", name: "Otto" },
  { id: "maj", name: "Maj" },
  { id: "vera", name: "Vera" },
  { id: "edvin", name: "Edvin" },
  { id: "selma", name: "Selma" },
];

const pickers = [
  { id: "du", label: "Du" },
  { id: "sam", label: "Sam" },
  { id: "morfar", label: "Morfar" },
];

const state = {
  role: "parent",
  tab: "idag",
  childId: "elsa",
  sheet: null,
  absence: {},
  pickupBy: { elsa: "du", love: "sam" },
  pickedUp: {},
  notices: [
    {
      id: "close",
      scope: "preschool",
      critical: true,
      kicker: "Imorgon",
      body: "Björkbacken stänger klockan 15. Personalutbildning.",
      from: "Förskolan",
    },
  ],
  moments: [
    {
      id: "cones",
      dept: "Eken",
      title: "Kottar",
      body: "Elsa och Noa lade en bana av kottar.",
      time: "11:40",
      by: "Jon Ek",
      image: "images/eken.jpg",
    },
    {
      id: "water",
      dept: "Linden",
      title: "Vatten",
      body: "Love hällde vatten i samma skål, om och om igen.",
      time: "10:15",
      by: "Maja Lind",
      image: "images/linden.jpg",
    },
  ],
  history: {
    elsa: [
      { date: "12 sep", kind: "Sjuk" },
      { date: "3 sep", kind: "Ledig" },
    ],
    love: [{ date: "18 sep", kind: "Ledig" }],
  },
};

const screen = document.querySelector("#screen");
const nav = document.querySelector("#nav");
const device = document.querySelector("#device");

function todayLine() {
  const d = new Date();
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function child() {
  return children.find((c) => c.id === state.childId);
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function pickerLabel(id) {
  return pickers.find((p) => p.id === id)?.label ?? "Du";
}

function statusFor(id) {
  if (state.absence[id] === "sjuk") return { label: "Sjuk", exception: true };
  if (state.absence[id] === "ledig") return { label: "Ledig", exception: true };
  if (state.pickedUp[id]) return { label: "Hämtad", exception: false };
  return { label: "Inne", exception: false };
}

function noticesFor(current) {
  return state.notices.filter((n) => n.scope === "preschool" || n.dept === current.dept);
}

function momentFor(current) {
  return state.moments.find((m) => m.dept === current.dept);
}

function hero(current) {
  const absence = state.absence[current.id];
  if (absence === "sjuk" || absence === "ledig") {
    const word = absence === "sjuk" ? "Sjuk" : "Ledig";
    return `
      <section class="hero is-exception" aria-live="polite">
        <p class="hero-kicker">Idag</p>
        <p class="hero-value">${word}</p>
        <div class="hero-sub">
          <p>Ej här. Schemat är avbokat.</p>
          <button class="linkish" type="button" data-action="undo-absence">Ångra</button>
        </div>
      </section>`;
  }
  const who = pickerLabel(state.pickupBy[current.id]);
  const line = who === "Du" ? "Du hämtar" : `${esc(who)} hämtar`;
  return `
    <section class="hero" aria-live="polite">
      <p class="hero-kicker">Hämtas</p>
      <p class="hero-value">${esc(current.pickup)}</p>
      <div class="hero-sub">
        <p>${line}</p>
        <button class="linkish" type="button" data-action="open-pickup">Ändra</button>
      </div>
    </section>`;
}

function letters(current) {
  return noticesFor(current).map((n) => `
    <article class="letter${n.critical ? " critical" : ""}">
      <p class="kicker">${esc(n.kicker)}</p>
      <p>${esc(n.body)}</p>
      <p class="from">${esc(n.from)}</p>
    </article>`).join("");
}

function absenceActions(current) {
  if (state.absence[current.id]) return "";
  return `
    <div class="actions">
      <button type="button" data-action="open-absence" data-kind="sjuk">Sjuk idag</button>
      <button type="button" data-action="open-absence" data-kind="ledig">Ledig</button>
    </div>`;
}

function momentBlock(current) {
  if (state.absence[current.id]) return "";
  const moment = momentFor(current);
  if (!moment) return "";
  return `
    <article class="moment">
      <p class="kicker">${esc(moment.dept)}</p>
      <h3>${esc(moment.title)}</h3>
      <p>${esc(moment.body)}</p>
      <p class="from">${esc(moment.time)} · ${esc(moment.by)}</p>
    </article>`;
}

function parentIdag() {
  const current = child();
  const kids = children.map((c) => `
    <li>
      <button type="button" data-action="child" data-id="${c.id}" aria-current="${c.id === current.id}">
        <span class="name">${esc(c.name)}</span>
        <span class="meta">${esc(c.dept)}</span>
      </button>
    </li>`).join("");
  return `
    <header class="mast">
      <p class="brand">Arthur</p>
      <p class="mast-meta">${esc(todayLine())}</p>
    </header>
    <ul class="kids">${kids}</ul>
    ${hero(current)}
    ${letters(current)}
    ${momentBlock(current)}
    ${absenceActions(current)}
}

function parentBarnet() {
  const current = child();
  const past = state.history[current.id] ?? [];
  const today = state.absence[current.id];
  const rows = [
    today ? `<li><span>Idag</span><span class="status exception">${today === "sjuk" ? "Sjuk" : "Ledig"}</span></li>` : "",
    ...past.map((row) => `<li><span class="history-date">${esc(row.date)}</span><span class="status">${esc(row.kind)}</span></li>`),
  ].join("");
  return `
    <header class="mast">
      <p class="brand">Arthur</p>
      <p class="mast-meta">Barnet</p>
    </header>
    <h2 class="unit-name">${esc(current.name)}</h2>
    <p class="unit-sub">${esc(current.age)} · ${esc(current.dept)} · ${esc(preschool.name)}</p>
    <p class="section-label">Frånvaro</p>
    <ul class="rows">${rows}</ul>`;
}

function parentEnheten() {
  const current = child();
  return `
    <header class="mast">
      <p class="brand">Arthur</p>
      <p class="mast-meta">Enheten</p>
    </header>
    <h2 class="unit-name">${esc(preschool.name)}</h2>
    <p class="unit-sub">${esc(current.dept)}</p>
    <ul class="rows">
      <li><span>Öppet</span><span class="status">${esc(preschool.hours)}</span></li>
      <li><span>Avdelning</span><span class="status">${esc(current.dept)}</span></li>
      <li><span>Telefon</span><span class="status"><a href="tel:+4684000010">${esc(preschool.phone)}</a></span></li>
    </ul>
    <p class="hint">Kontaktuppgifter till andra vårdnadshavare finns inte här.</p>`;
}

function staffView() {
  const inne = floor.filter((c) => statusFor(c.id).label === "Inne").length;
  const rows = floor.map((c) => {
    const status = statusFor(c.id);
    return `
      <button class="row" type="button" data-action="toggle-picked" data-id="${c.id}">
        <span>${esc(c.name)}</span>
        <span class="status${status.exception ? " exception" : ""}">${esc(status.label)}</span>
      </button>`;
  }).join("");
  return `
    <header class="mast">
      <p class="brand">Arthur</p>
      <p class="mast-meta">Personal</p>
    </header>
    <h2 class="unit-name">Eken</h2>
    <p class="unit-sub">${inne} inne · ${floor.length} barn</p>
    <p class="section-label">Idag</p>
    <div class="rows">${rows}</div>
    <p class="hint">Tryck på ett barn som är inne för att markera hämtad.</p>
    <form class="compose" data-action="publish">
      <p class="section-label">Till vårdnadshavarna</p>
      <textarea name="body" maxlength="160" placeholder="Vi är kvar i skogen till 14." required></textarea>
      <div class="publish"><button type="submit">Publicera</button></div>
    </form>`;
}

function sheet() {
  if (!state.sheet) return "";
  const current = child();
  if (state.sheet.type === "pickup") {
    const currentPicker = state.pickupBy[current.id];
    const options = pickers.map((p) => `
      <li><button type="button" data-action="pick" data-id="${p.id}" aria-current="${p.id === currentPicker}">${esc(p.label)}</button></li>`).join("");
    return `
      <div class="sheet" role="dialog" aria-labelledby="sheet-title">
        <h3 id="sheet-title">Vem hämtar ${esc(current.name)}?</h3>
        <ul class="pick-list">${options}</ul>
        <button class="linkish" type="button" data-action="close-sheet">Stäng</button>
      </div>`;
  }
  const kind = state.sheet.kind;
  const word = kind === "sjuk" ? "sjuk" : "ledig";
  return `
    <div class="sheet" role="dialog" aria-labelledby="sheet-title">
      <h3 id="sheet-title">${esc(current.name)} är ${word} idag</h3>
      <p>Hämtningen tas bort. ${esc(current.dept)} ser det direkt.</p>
      <div class="sheet-actions">
        <button class="wax" type="button" data-action="confirm-absence">Bekräfta</button>
        <button type="button" data-action="close-sheet">Avbryt</button>
      </div>
    </div>`;
}

function renderNav() {
  if (state.role !== "parent") {
    nav.hidden = true;
    nav.innerHTML = "";
    return;
  }
  nav.hidden = false;
  const items = [
    ["idag", "Idag"],
    ["barnet", "Barnet"],
    ["enheten", "Enheten"],
  ];
  nav.innerHTML = items.map(([id, label]) => `
    <button type="button" data-action="tab" data-tab="${id}" aria-current="${state.tab === id ? "page" : "false"}">${label}</button>`).join("");
}

function render() {
  device.dataset.role = state.role;
  document.querySelectorAll("[data-action='role']").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.role === state.role));
  });
  let html = "";
  if (state.role === "staff") html = staffView();
  else if (state.tab === "barnet") html = parentBarnet();
  else if (state.tab === "enheten") html = parentEnheten();
  else html = parentIdag();
  screen.innerHTML = html + sheet();
  renderNav();
}

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action } = target.dataset;
  if (action === "role") {
    state.role = target.dataset.role;
    state.sheet = null;
  } else if (action === "tab") {
    state.tab = target.dataset.tab;
    state.sheet = null;
  } else if (action === "child") {
    state.childId = target.dataset.id;
    state.sheet = null;
  } else if (action === "open-pickup") {
    state.sheet = { type: "pickup" };
  } else if (action === "open-absence") {
    state.sheet = { type: "absence", kind: target.dataset.kind };
  } else if (action === "close-sheet") {
    state.sheet = null;
  } else if (action === "confirm-absence") {
    state.absence[state.childId] = state.sheet.kind;
    state.sheet = null;
  } else if (action === "undo-absence") {
    delete state.absence[state.childId];
  } else if (action === "pick") {
    state.pickupBy[state.childId] = target.dataset.id;
    state.sheet = null;
  } else if (action === "toggle-picked") {
    const id = target.dataset.id;
    if (state.absence[id]) return;
    state.pickedUp[id] = !state.pickedUp[id];
  } else {
    return;
  }
  render();
});

document.body.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-action='publish']");
  if (!form) return;
  event.preventDefault();
  const body = new FormData(form).get("body").trim();
  if (!body) return;
  state.notices.unshift({
    id: `n-${Date.now()}`,
    scope: "dept",
    dept: "Eken",
    critical: false,
    kicker: "Eken",
    body,
    from: "Jon Ek",
  });
  form.reset();
  render();
});

render();
