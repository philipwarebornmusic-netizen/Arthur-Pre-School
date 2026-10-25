import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForJson(url) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url).then((response) => response.json()).then(resolve).catch((error) => {
        if (Date.now() - started > 15000) reject(error);
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

const preview = `<!doctype html>
<html lang="sv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hämtning</title>
  <link rel="stylesheet" href="fonts/nunito.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-frame">
    <header class="topbar"><img src="logo.svg" width="188" height="56" alt="ärtan"></header>
    <div class="workspace">
      <main id="screen" class="screen"></main>
      <nav id="bottomNav" class="bottom-nav" aria-label="ärtans huvudmeny">
        <button type="button" data-action="navigate" data-view="home"><span class="ico">●</span>Min dag</button>
        <button type="button" data-action="navigate" data-view="pickup" aria-current="page"><span class="ico">◎</span>Hämtning</button>
        <button type="button"><span class="ico">🌱</span>Barnet</button>
        <button type="button"><span class="ico">☰</span>Klasslista</button>
        <button type="button"><span class="ico">✉</span>Gemenskap</button>
        <button type="button"><span class="ico">⚙</span>Konto</button>
      </nav>
    </div>
  </div>
  <div id="printRoot"></div>
  <button class="assistant-launcher" type="button">Ärtan</button>
  <script src="share-print.js"></script>
  <script src="pickup-hub.js"></script>
  <script src="vendor/qrcode-generator/qrcode.js"></script>
  <script>
    const token = "ab".repeat(32);
    const code = String(BigInt("0x" + token.slice(0, 12)) % 1000000n).padStart(6, "0");
    const input = {
      today: "2026-10-22",
      terms: [{
        starts_on: "2026-07-29",
        ends_on: "2026-12-18",
        closures: ["2026-10-23"],
        closureReasons: { "2026-10-23": "Planering" },
        standard: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, attending: true, dropoff_at: "08:00", pickup_at: "16:30" })),
      }],
      dayPlans: [0, 1, 2, 3, 4].map((offset) => ({
        plan_date: ArtanPickup.addDays("2026-10-12", offset),
        dropoff_at: "08:00",
        pickup_at: "16:30",
        dropoff_person_kind: "guardian",
        dropoff_person_id: "g1",
        picker_kind: "guardian",
        picker_id: "g1",
      })),
      standardPickers: [{ weekday: 4, dropoff_person_kind: "guardian", dropoff_person_id: "g1", picker_kind: "guardian", picker_id: "g1" }],
    };
    let editor = null;
    let notice = "";
    let keptScroll = 0;
    const people = [
      { token: "guardian:g1", name: "Anna Berg", initials: "AB", kind: "guardian" },
      { token: "contact:c1", name: "Mormor Karin", initials: "MK", kind: "contact" },
    ];
    const screen = document.getElementById("screen");

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
    }

    function paintQr() {
      document.querySelectorAll("[data-pass-qr]").forEach((slot) => {
        const payload = slot.getAttribute("data-pass-qr");
        if (!payload || typeof qrcode !== "function") return;
        const qr = qrcode(0, "M");
        qr.addData(location.origin + "/?pass=" + payload);
        qr.make();
        slot.innerHTML = qr.createSvgTag(4, 2);
      });
    }

    function weekModel() {
      return {
        weekNumber: ArtanPickup.isoWeekNumber(editor.monday),
        error: editor.error || "",
        note: editor.note || "",
        canCopyPrevious: ArtanPickup.hasEarlierSavedWeek(input, editor.monday),
        days: (editor.days || []).map((day) => ({
          iso: day.iso,
          weekday: day.weekday,
          dropoff: day.dropoff,
          pickup: day.pickup,
          ledig: Boolean(day.ledig),
          open: day.open,
          closed: day.closed,
          outside: day.outside,
          dropoffInitials: day.dropoffPerson?.kind === "contact" ? "MK" : "AB",
          dropoffKind: day.dropoffPerson?.kind === "contact" ? "contact" : "guardian",
          pickupInitials: day.picker?.kind === "contact" ? "MK" : "AB",
          pickupKind: day.picker?.kind === "contact" ? "contact" : "guardian",
        })),
      };
    }

    function menu() {
      return \`<div class="plan-sheet" role="dialog" aria-label="Planera"><button type="button" class="plan-sheet-backdrop" data-action="close-pickup-editor" aria-label="Stäng"></button><div class="plan-sheet-panel"><h2>Planera</h2><div class="stack-actions"><button class="primary" type="button" data-action="pickup-standard">Standardvecka</button><button class="secondary" type="button" data-action="copy-pickup-week">Kopiera den här veckan till nästa</button></div></div></div>\`;
    }

    function standardForm() {
      const rows = [1, 2, 3, 4, 5].map((weekday) => \`<div class="weekly-schedule-row"><label>Lämning<input type="time" name="dropoff_\${weekday}" value="08:00"></label><label>Hämtning<input type="time" name="pickup_\${weekday}" value="16:30"></label></div>\`).join("");
      return \`<form class="week-sheet" data-form="pickup-standard"><header class="week-sheet-bar"><button class="week-back" type="button" data-action="close-pickup-editor" aria-label="Tillbaka">‹</button><h1>Standardvecka</h1><button class="week-save" type="submit">Spara</button></header><div class="week-sheet-body"><button class="secondary" type="button" data-action="parse-weekly-schedule">Tolka och fyll i</button><fieldset class="weekly-schedule"><legend>Måndag till fredag</legend>\${rows}</fieldset></div></form>\`;
    }

    function render() {
      const grid = ArtanPickup.renderTermGrid(input, { editable: true });
      const readonly = ArtanPickup.renderTermGrid(input);
      let extra = "";
      if (editor?.mode === "week") {
        extra = ArtanPickup.renderWeekEditor(weekModel());
        if (editor.personIso) {
          extra += ArtanPickup.renderPickerSheet({
            role: editor.personRole,
            weekdayName: ArtanPickup.weekdayName(editor.personIso, "full"),
            people: people.map((person) => ({ ...person, selected: person.token === editor.draftToken })),
          });
        }
      } else if (editor?.mode === "menu") extra = menu();
      else if (editor?.mode === "standard") extra = standardForm();
      screen.innerHTML = \`<p id="notice">\${escapeHtml(notice)}</p><section class="hero-card"><p class="kicker">Hämtning</p><h1 class="h1">Tyra</h1></section><section class="card term-card" id="pickup-schedule"><h2>Terminen</h2>\${grid}<button class="term-add no-print" type="button" data-action="pickup-add" aria-label="Planera vecka">+</button></section>\${extra}<section class="pass-sheet guardian-pass"><p class="kicker">Hämtpass</p><h1>Visa för personalen</h1><p class="pass-child">Tyra</p><p>22 okt. 2026</p><div class="pass-qr" data-pass-qr="\${token}" role="img" aria-label="QR-kod för hämtpasset"></div><p class="pass-code">\${code}</p><p class="pass-privacy">Passet visar bara förnamn. Visa det för personalen och dela inte länken.</p><div class="share-actions pass-share no-print"><button class="primary" type="button" data-action="share-pass" data-token="\${token}" data-code="\${code}" data-label="Hämtpass för Tyra">Dela</button><button class="secondary" type="button" data-action="print-pass">Skriv ut/Spara</button></div></section><section class="card" id="term-overview"><h2>Öppettider och schema</h2>\${readonly}</section>\`;
      paintQr();
      if (!editor) window.scrollTo(0, keptScroll);
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      if (action === "edit-pickup-week") {
        keptScroll = window.scrollY;
        editor = {
          mode: "week",
          monday: target.dataset.monday,
          days: ArtanPickup.weekEditorSeed(input, target.dataset.monday, "g1"),
          personIso: null,
          personRole: "",
          draftToken: "",
          error: "",
          note: "",
        };
        notice = "";
        render();
      }
      if (action === "open-picker") {
        const day = editor.days.find((item) => item.iso === target.dataset.date);
        editor.personIso = target.dataset.date;
        editor.personRole = target.dataset.personRole === "dropoff" ? "dropoff" : "pickup";
        const selected = editor.personRole === "dropoff" ? day?.dropoffPerson : day?.picker;
        editor.draftToken = selected?.kind === "contact" ? "contact:c1" : "guardian:g1";
        editor.error = "";
        render();
      }
      if (action === "choose-picker") {
        editor.draftToken = target.dataset.token;
        document.querySelectorAll("[data-action='choose-picker']").forEach((button) => {
          const selected = button === target;
          button.classList.toggle("is-selected", selected);
          button.setAttribute("aria-pressed", selected ? "true" : "false");
        });
      }
      if (action === "confirm-picker") {
        const kind = editor.draftToken.startsWith("contact") ? "contact" : "guardian";
        editor.days = ArtanPickup.smartFillWeek(
          editor.days,
          editor.personIso,
          editor.personRole === "dropoff" ? "dropoffPerson" : "picker",
          { kind, id: kind === "contact" ? "c1" : "g1", passKind: "" },
        );
        editor.personIso = null;
        editor.personRole = "";
        editor.error = "";
        render();
      }
      if (action === "same-as-previous-week") {
        const filled = ArtanPickup.fillFromPreviousWeek(editor.days, input, editor.monday);
        if (filled.copied) {
          editor.days = ArtanPickup.assignDefaultPicker(filled.days, "g1");
          editor.note = filled.fallback ? "Kopierade vecka " + filled.weekNumber : "";
          editor.error = "";
        }
        render();
      }
      if (action === "save-pickup-week") {
        const byDate = {};
        document.querySelectorAll("[data-week-time]").forEach((inputField) => {
          const slot = byDate[inputField.dataset.date] || {};
          slot[inputField.dataset.weekTime === "pickup" ? "pickup" : "dropoff"] = inputField.value;
          byDate[inputField.dataset.date] = slot;
        });
        input.dayPlans = Object.entries(byDate).filter(([, times]) => times.dropoff && times.pickup).map(([plan_date, times]) => {
          const day = editor.days.find((item) => item.iso === plan_date);
          const dropoffKind = day?.dropoffPerson?.kind || "guardian";
          const pickerKind = day?.picker?.kind || "guardian";
          return {
            plan_date,
            dropoff_at: times.dropoff,
            pickup_at: times.pickup,
            dropoff_person_kind: dropoffKind,
            dropoff_person_id: day?.dropoffPerson?.id || "g1",
            picker_kind: pickerKind,
            picker_id: day?.picker?.id || "g1",
          };
        });
        notice = "Veckan är sparad.";
        editor = null;
        render();
      }
      if (action === "pickup-add") {
        editor = editor?.mode === "menu" ? null : { mode: "menu" };
        notice = "";
        render();
      }
      if (action === "pickup-standard") {
        editor = { mode: "standard" };
        render();
      }
      if (action === "close-pickup-editor") {
        editor = null;
        render();
      }
      if (action === "copy-pickup-week") {
        notice = "Veckan är kopierad till nästa.";
        editor = null;
        render();
      }
      if (action === "share-pass") {
        const text = [target.dataset.label, target.dataset.code ? "Kod " + target.dataset.code : "", location.origin + "/?pass=" + target.dataset.token].filter(Boolean).join("\\n");
        const support = { hasShare: typeof navigator.share === "function", canShare: () => true };
        const plan = ArtanShare.chooseSharePlan({ title: "Hämtpass", text }, support);
        if (plan.mode === "share") navigator.share(plan.data);
        else if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text);
      }
      if (action === "print-pass") {
        const sheet = target.closest(".guardian-pass");
        const clone = sheet.cloneNode(true);
        clone.querySelectorAll(".pass-share, button").forEach((node) => node.remove());
        document.getElementById("printRoot").innerHTML = clone.outerHTML;
        document.body.dataset.printing = "1";
        window.print();
      }
    });

    document.addEventListener("submit", (event) => {
      if (event.target.dataset.form === "pickup-standard") event.preventDefault();
    });

    window.__showDays = (days, errorText = "") => {
      editor.days = days;
      editor.error = errorText;
      editor.personIso = null;
      editor.personRole = "";
      render();
    };

    render();
  </script>
</body>
</html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/pickup-preview.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(preview);
    return;
  }
  const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = path.resolve(root, `.${relative}`);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end("missing");
    return;
  }
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
});

const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "artan-pickup-"));
const chromePath = process.platform === "darwin"
  ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  : "/usr/local/bin/google-chrome";
const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=9335",
  `--user-data-dir=${userDir}`,
  "about:blank",
], { stdio: "ignore" });

const logs = [];
let sessionId = "";
const pending = new Map();
let nextId = 0;
let socket;

const send = (method, params = {}, id) => new Promise((resolve, reject) => {
  const messageId = ++nextId;
  pending.set(messageId, { resolve, reject });
  const payload = { id: messageId, method, params };
  if (id) payload.sessionId = id;
  socket.send(JSON.stringify(payload));
});

try {
  const version = await waitForJson("http://127.0.0.1:9335/json/version");
  socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", reject);
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
      else waiter.resolve(message.result);
      return;
    }
    if (message.method === "Runtime.consoleAPICalled" || message.method === "Runtime.exceptionThrown") logs.push(message);
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `navigator.share = (data) => { window.__shareCalls = window.__shareCalls || []; window.__shareCalls.push(data); return Promise.resolve(); };
      navigator.clipboard = { writeText(text) { window.__copied = text; return Promise.resolve(); } };
      window.print = () => { window.__printed = true; };
      window.__shareCalls = [];`,
  }, sessionId);

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitForSelector(selector) {
    const started = Date.now();
    while (Date.now() - started < 8000) {
      if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
      await delay(50);
    }
    throw new Error(`hittade inte ${selector}\n${await evaluate("document.body.innerText.slice(0, 800)")}`);
  }
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  async function setSize(width, height, mobile) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile }, sessionId);
  }
  async function overflow() {
    return evaluate(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`);
  }
  const shotDir = path.join(os.tmpdir(), "artan-screenshots");
  fs.mkdirSync(shotDir, { recursive: true });
  async function shot(filename) {
    const image = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(path.join(shotDir, filename), Buffer.from(image.data, "base64"));
  }

  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` }, sessionId);
  await waitForSelector('button.primary[type="submit"]');
  const login = await evaluate("document.body.innerText");
  assert(login.includes("Logga in") && login.includes("Välkommen"), "inloggningen visas");
  for (const [width, height, mobile, name] of [[390, 844, true, "login-mobile"], [1280, 900, false, "login-desktop"]]) {
    await setSize(width, height, mobile);
    await delay(100);
    const box = await overflow();
    assert(box.scroll <= box.client + 1, `inloggningen flödar över vid ${width} (${box.scroll}/${box.client})`);
    await shot(`pickup-hub-${name}.png`);
  }

  await send("Page.navigate", { url: `http://127.0.0.1:${port}/pickup-preview.html` }, sessionId);
  await waitForSelector("#pickup-today");
  await waitForSelector(".pass-code");
  const opened = await evaluate("document.body.innerText");
  assert(opened.includes("19 okt–23 okt") && opened.includes("v.43"), "veckoraden saknas");
  assert(opened.includes("08:00") && opened.includes("16:30"), "tiderna saknas");
  const closedText = await evaluate(`document.querySelector(".term-cell.is-closed").textContent`);
  assert(closedText.includes("Stängt") && closedText.includes("Planering"), `stängd dag saknas (${closedText})`);
  const colors = await evaluate(`(() => {
    const cell = (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor;
    return {
      today: cell("#pickup-today"),
      closed: cell(".term-cell.is-closed"),
      outside: cell(".term-cell.is-outside"),
      person: document.querySelector(".term-person") === null,
    };
  })()`);
  assert(colors.today === "rgb(255, 244, 206)", `idag har fel färg ${colors.today}`);
  assert(colors.closed === "rgb(255, 240, 237)", `stängt har fel färg ${colors.closed}`);
  assert(colors.outside === "rgb(239, 234, 226)", `utanför har fel färg ${colors.outside}`);
  assert(colors.person, "vårdnadshavare ska inte ha personikon från start");

  await setSize(390, 844, true);
  await delay(80);
  let box = await overflow();
  assert(box.scroll <= box.client + 1, `kalendern flödar över på telefon (${box.scroll}/${box.client})`);
  const nav = await evaluate(`(() => {
    const bar = document.querySelector(".bottom-nav");
    const rect = bar.getBoundingClientRect();
    return { buttons: bar.querySelectorAll("button").length, height: rect.height, rows: getComputedStyle(bar).gridTemplateColumns.split(" ").length };
  })()`);
  assert(nav.buttons === 6 && nav.rows === 3 && nav.height > 100, `menyn med sex knappar radbröts inte (${JSON.stringify(nav)})`);
  const overlap = await evaluate(`(() => {
    const add = document.querySelector(".term-add").getBoundingClientRect();
    const bot = document.querySelector(".assistant-launcher").getBoundingClientRect();
    return add.right > bot.left && add.left < bot.right && add.bottom > bot.top && add.top < bot.bottom;
  })()`);
  assert(!overlap, "plusknappen täcker Ärtan-botten");
  const pos = await evaluate(`(() => {
    const week = document.getElementById("pickup-current-week");
    week.scrollIntoView({ block: "start" });
    const box = week.getBoundingClientRect();
    const first = document.querySelector(".term-grid-week").getBoundingClientRect();
    return { weekTop: box.top, firstTop: first.top, scroll: window.scrollY, text: week.innerText };
  })()`);
  assert(pos.scroll > 200 && pos.firstTop < 0 && pos.weekTop < 140, `kalendern öppnas inte vid aktuell vecka (${JSON.stringify(pos)})`);
  assert(pos.text.includes("19 okt") && pos.text.includes("v.43"), `fel vecka ligger överst (${pos.text})`);
  await shot("pickup-hub-grid-mobile.png");
  const savedLeak = await evaluate(`(() => {
    const plans = [0, 1, 2, 3, 4].map((offset) => ({
      plan_date: ArtanPickup.addDays("2026-10-19", offset),
      dropoff_at: "08:00",
      pickup_at: "16:30",
      picker_kind: "guardian",
      picker_id: "g1",
    }));
    const savedInput = {
      today: "2026-10-22",
      terms: [{ starts_on: "2026-10-19", ends_on: "2026-11-13", closures: [], standard: [] }],
      dayPlans: plans,
      standardPickers: [],
      viewerId: "g1",
    };
    const grid = ArtanPickup.buildTermGrid(savedInput);
    const next = grid.weeks.find((week) => week.monday === "2026-10-26");
    const html = ArtanPickup.renderTermGrid(savedInput, { editable: true });
    const schedule = document.getElementById("pickup-schedule");
    window.__scheduleHold = schedule.innerHTML;
    schedule.innerHTML = html;
    const slice = html.slice(html.indexOf('data-monday="2026-10-26"'), html.indexOf('data-monday="2026-11-02"'));
    return {
      empty: next.days.every((day) => !day.saved && !day.filled && !day.times),
      unmarked: !slice.includes("term-cell-times") && slice.includes("Ej ifylld") && slice.includes("is-empty"),
    };
  })()`);
  assert(savedLeak.empty && savedLeak.unmarked, `sparad vecka fyllde nästa (${JSON.stringify(savedLeak)})`);
  await shot("pickup-hub-grid-saved-mobile.png");
  await evaluate(`(() => {
    document.getElementById("pickup-schedule").innerHTML = window.__scheduleHold;
    document.getElementById("pickup-current-week").scrollIntoView({ block: "start" });
  })()`);

  await click("#pickup-today");
  await waitForSelector("#week-sheet");
  const editor = await evaluate(`(() => {
    const sheet = document.getElementById("week-sheet");
    const dropoff = sheet.querySelector('[data-date="2026-10-22"][data-week-time="dropoff"]');
    const pickup = sheet.querySelector('[data-date="2026-10-22"][data-week-time="pickup"]');
    return {
      title: sheet.querySelector("h1").textContent,
      position: getComputedStyle(sheet).position,
      date: sheet.innerText.includes("22 okt"),
      dropoff: dropoff.value,
      pickup: pickup.value,
      labels: sheet.innerText.includes("Lämning") && sheet.innerText.includes("Hämtning"),
      people: sheet.querySelectorAll('[data-action="open-picker"]').length,
      inline: document.body.innerText.includes("Spara dagen"),
    };
  })()`);
  assert(editor.title === "Vecka 43" && editor.position === "fixed" && editor.date && editor.dropoff === "08:00" && editor.pickup === "16:30" && editor.labels && editor.people >= 2 && !editor.inline, `veckovyn fylldes inte (${JSON.stringify(editor)})`);
  const weekFill = await evaluate(`(() => {
    const sheet = document.getElementById("week-sheet");
    const boxes = [...sheet.querySelectorAll("[data-week-ledig]")];
    const row = sheet.querySelector(".week-row");
    return {
      ledig: boxes.length > 0 && boxes.every((box) => !box.checked),
      button: sheet.innerText.includes("Samma som förra veckan"),
      hint: sheet.innerText.includes("Fyll i en dag, så följer de andra tomma dagarna med."),
      closedInputs: sheet.querySelectorAll(".is-closed input").length,
      row: row.scrollWidth,
      client: row.clientWidth,
    };
  })()`);
  assert(weekFill.ledig && weekFill.button && weekFill.hint && weekFill.closedInputs === 0 && weekFill.row <= weekFill.client + 1, `veckovyns ifyllnad är fel (${JSON.stringify(weekFill)})`);
  await shot("pickup-hub-week-mobile.png");
  const mondayOnly = await evaluate(`(() => {
    const seeded = ArtanPickup.weekEditorSeed({
      today: "2026-10-22",
      terms: [{ starts_on: "2026-10-19", ends_on: "2026-10-23", closures: ["2026-10-23"], standard: [] }],
      dayPlans: [{ plan_date: "2026-10-19", dropoff_at: "08:00", pickup_at: "16:30", picker_kind: "guardian", picker_id: "g1" }],
      standardPickers: [],
    }, "2026-10-19", "g1");
    window.__showDays(seeded);
    const sheet = document.getElementById("week-sheet");
    const value = (iso, field) => sheet.querySelector('[data-date="' + iso + '"][data-week-time="' + field + '"]')?.value || "";
    return {
      tueDrop: value("2026-10-20", "dropoff"),
      tuePick: value("2026-10-20", "pickup"),
      fri: sheet.querySelector('[data-date="2026-10-23"][data-week-time="dropoff"]') === null,
      ledig: [...sheet.querySelectorAll("[data-week-ledig]")].every((box) => !box.checked),
    };
  })()`);
  assert(mondayOnly.tueDrop === "08:00" && mondayOnly.tuePick === "16:30" && mondayOnly.fri && mondayOnly.ledig, `måndagens tid fylldes inte på tomma dagar (${JSON.stringify(mondayOnly)})`);
  await shot("pickup-hub-week-fill-mobile.png");
  const copyProbe = await evaluate(`(() => {
    const days = ArtanPickup.weekEditorSeed({
      today: "2026-10-22",
      terms: [{ starts_on: "2026-10-19", ends_on: "2026-11-20", closures: [], standard: [] }],
      dayPlans: [],
      standardPickers: [],
    }, "2026-11-16", "g1");
    const filled = ArtanPickup.fillFromPreviousWeek(days, {
      dayPlans: [0, 1, 2, 3, 4].map((offset) => ({
        plan_date: ArtanPickup.addDays("2026-11-02", offset),
        dropoff_at: "08:00",
        pickup_at: "16:30",
        picker_kind: "guardian",
        picker_id: "g1",
      })),
    }, "2026-11-16");
    const hidden = ArtanPickup.renderWeekEditor({ weekNumber: 43, canCopyPrevious: false, days: [] }).includes("same-as-previous-week");
    return { copied: filled.copied, fallback: filled.fallback, weekNumber: filled.weekNumber, hidden };
  })()`);
  assert(copyProbe.copied === 5 && copyProbe.fallback && copyProbe.weekNumber === 45 && !copyProbe.hidden, `äldre vecka kopierades inte (${JSON.stringify(copyProbe)})`);
  await evaluate(`window.__showDays(ArtanPickup.weekEditorSeed(input, "2026-10-19", "g1"))`);
  await click('#week-sheet [data-action="open-picker"][data-person-role="pickup"][data-date="2026-10-22"]');
  await waitForSelector("#picker-sheet");
  const picker = await evaluate(`(() => {
    const sheet = document.getElementById("picker-sheet");
    const contact = sheet.querySelector(".picker-avatar.is-contact");
    return { title: sheet.querySelector("h2").textContent, contact: getComputedStyle(contact).backgroundColor, names: sheet.innerText };
  })()`);
  assert(picker.title === "Hämtar torsdag" && picker.names.includes("Anna Berg") && picker.names.includes("Mormor Karin") && picker.contact === "rgb(237, 245, 237)", `hämtarlistan är fel (${JSON.stringify(picker)})`);
  await shot("pickup-hub-picker-mobile.png");
  await click('[data-token="contact:c1"]');
  await click('[data-action="confirm-picker"]');
  await delay(30);
  const avatars = await evaluate(`({
    dropoff: document.querySelector('#week-sheet [data-action="open-picker"][data-person-role="dropoff"][data-date="2026-10-22"]').textContent,
    pickup: document.querySelector('#week-sheet [data-action="open-picker"][data-person-role="pickup"][data-date="2026-10-22"]').textContent
  })`);
  assert(avatars.dropoff === "AB" && avatars.pickup === "MK", `lämnare och hämtare uppdaterades inte oberoende (${JSON.stringify(avatars)})`);
  await shot("pickup-hub-separate-people-mobile.png");
  await evaluate(`(() => {
    document.querySelector('[data-week-time="dropoff"][data-date="2026-10-22"]').value = "07:45";
    document.querySelector('[data-week-time="pickup"][data-date="2026-10-22"]').value = "15:15";
    document.querySelector('[data-action="save-pickup-week"]').click();
  })()`);
  await delay(50);
  const saved = await evaluate(`(() => {
    const cell = document.querySelector('#pickup-today');
    return { text: cell.textContent, person: Boolean(cell.querySelector(".term-person")), notice: document.getElementById("notice").textContent, scroll: window.scrollY, sheet: Boolean(document.getElementById("week-sheet")) };
  })()`);
  assert(saved.text.includes("07:45") && saved.text.includes("15:15") && saved.person && saved.notice.includes("Veckan är sparad") && !saved.sheet, `sparad vecka syns inte (${JSON.stringify(saved)})`);
  assert(Math.abs(saved.scroll - pos.scroll) < 80, `scrollen hoppade (${saved.scroll} mot ${pos.scroll})`);

  await click('[data-action="pickup-add"]');
  await waitForSelector('[data-action="copy-pickup-week"]');
  await click('[data-action="pickup-standard"]');
  await waitForSelector('[data-action="parse-weekly-schedule"]');
  const standardCount = await evaluate(`document.querySelectorAll('.week-sheet input[type="time"]').length`);
  assert(standardCount === 10, `standardveckan har ${standardCount} tidsfält`);
  await click('[data-action="pickup-add"]');
  await click('[data-action="copy-pickup-week"]');
  assert((await evaluate("document.getElementById('notice').textContent")).includes("kopierad"), "kopiera vecka bekräftades inte");

  const readonlyButtons = await evaluate(`document.querySelectorAll('#term-overview button').length`);
  assert(readonlyButtons === 0, "terminsöversikten går att redigera");

  await click('[data-action="share-pass"]');
  await delay(30);
  const shared = await evaluate("window.__shareCalls.at(-1)");
  assert(shared?.title === "Hämtpass" && shared.text.includes("Kod ") && shared.text.includes("?pass=" + "ab".repeat(32)), `delningen saknar passet (${JSON.stringify(shared)})`);
  await click('[data-action="print-pass"]');
  const printed = await evaluate(`({ root: document.getElementById("printRoot").innerText, printed: window.__printed, buttons: document.querySelectorAll("#printRoot button").length })`);
  assert(printed.printed && printed.root.includes("Tyra") && printed.root.includes(await evaluate("document.querySelector('.pass-code').textContent")) && printed.buttons === 0, `utskriften är fel (${JSON.stringify(printed)})`);

  await setSize(1280, 900, false);
  await delay(80);
  box = await overflow();
  assert(box.scroll <= box.client + 1, `kalendern flödar över på dator (${box.scroll}/${box.client})`);
  const addLeft = await evaluate(`document.querySelector(".term-add").getBoundingClientRect().left`);
  assert(addLeft >= 272, `plusknappen ligger under sidomenyn (${addLeft})`);
  await shot("pickup-hub-grid-desktop.png");
  await shot("pickup-hub-pass-desktop.png");

  const exceptions = logs.filter((entry) => entry.method === "Runtime.exceptionThrown");
  assert(exceptions.length === 0, `sidfel: ${JSON.stringify(exceptions.slice(0, 2))}`);
  console.log("pickup hub browser checks passed");
} catch (error) {
  console.error(error?.stack || error?.message || error);
  console.error(JSON.stringify(logs.slice(-6), null, 2));
  process.exitCode = 1;
} finally {
  chrome.kill("SIGKILL");
  server.close();
  await delay(200);
  try {
    fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch { /* Chrome can still be releasing the profile after the checks have passed. */ }
}
