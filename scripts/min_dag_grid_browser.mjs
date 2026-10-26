import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = "/opt/cursor/artifacts/screenshots";

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
  <title>Min dag</title>
  <link rel="stylesheet" href="fonts/nunito.css">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="app-frame">
    <header class="topbar"><img src="logo.svg" width="188" height="56" alt="ärtan"></header>
    <div class="workspace">
      <main id="screen" class="screen"></main>
      <nav id="bottomNav" class="bottom-nav" aria-label="ärtans huvudmeny">
        <button type="button" aria-current="page"><span class="ico">●</span>Min dag</button>
        <button type="button"><span class="ico">◎</span>Hämtning</button>
        <button type="button"><span class="ico">🌱</span>Barnet</button>
        <button type="button"><span class="ico">☰</span>Klasslista</button>
        <button type="button"><span class="ico">✉</span>Gemenskap</button>
        <button type="button"><span class="ico">⚙</span>Konto</button>
      </nav>
    </div>
  </div>
  <script src="pickup-hub.js"></script>
  <script>
    const input = {
      today: "2026-10-26",
      viewerId: "g1",
      standardPickers: [],
      terms: [{
        starts_on: "2026-07-27",
        ends_on: "2026-12-18",
        closures: ["2026-10-30"],
        closureReasons: { "2026-10-30": "Planering" },
        standard: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, attending: true, dropoff_at: "08:00", pickup_at: "16:30" })),
      }],
      dayPlans: [0, 1, 2, 3, 4].map((offset) => ({
        plan_date: ArtanPickup.addDays("2026-10-19", offset),
        dropoff_at: "08:00",
        pickup_at: "16:30",
        dropoff_person_kind: "guardian",
        dropoff_person_id: "g1",
        picker_kind: "guardian",
        picker_id: "g1",
      })).concat([{
        plan_date: "2026-10-26",
        dropoff_at: "08:00",
        pickup_at: "16:30",
        dropoff_person_kind: "guardian",
        dropoff_person_id: "g1",
        picker_kind: "guardian",
        picker_id: "g1",
      }]),
    };
    let fromCurrent = true;
    let showEarlier = false;
    let editor = null;
    let focusIso = "";
    let scrollRestore = null;
    const screen = document.getElementById("screen");

    function weekModel() {
      return {
        weekNumber: ArtanPickup.isoWeekNumber(editor.monday),
        canCopyPrevious: ArtanPickup.hasEarlierSavedWeek(input, editor.monday),
        days: editor.days.map((day) => ({
          iso: day.iso,
          weekday: day.weekday,
          dropoff: day.dropoff,
          pickup: day.pickup,
          ledig: Boolean(day.ledig),
          open: day.open,
          closed: day.closed,
          outside: day.outside,
          dropoffInitials: "TB",
          dropoffKind: "guardian",
          pickupInitials: "TB",
          pickupKind: "guardian",
        })),
      };
    }

    function focusWeekDay(body, iso) {
      const row = [...body.querySelectorAll("[data-week-day]")].find((node) => node.dataset.weekDay === iso);
      if (!row) return;
      const rowTop = row.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
      const rowBottom = rowTop + row.offsetHeight;
      if (rowBottom > body.scrollTop + body.clientHeight) body.scrollTop = Math.max(0, rowBottom - body.clientHeight);
      else if (rowTop < body.scrollTop) body.scrollTop = Math.max(0, rowTop);
    }

    function render() {
      const grid = ArtanPickup.renderTermGrid(input, { editable: true, fromCurrent: fromCurrent && !showEarlier });
      const sheet = editor ? ArtanPickup.renderWeekEditor(weekModel()) : "";
      const hint = "Tryck på en vecka för att ändra. Bara sparade dagar är ifyllda. Rosa dagar är stängda, grå dagar ligger utanför terminen, och dagens ruta är markerad.";
      screen.innerHTML = \`<section class="hero-card home-hero"><div><p class="kicker">Min dag</p><h1 class="h1">Tyra</h1><p class="big-status">Inte incheckad</p><p class="sub">Måndag 26 oktober</p></div></section><section class="card" id="daily-plan"><p class="kicker">Idag</p><h2>Dagens plan</h2><p>Lämning 08:00. Hämtning 16:30.</p><p class="form-hint">Ingen incheckning är gjord ännu.</p></section><section id="term-overview" class="term-overview"><div class="section-head"><div><p class="kicker">Termin</p><h2>Öppettider och schema</h2></div></div><article class="card term-card"><p class="kicker">Publicerad</p><h3>Höst 2026</h3><p>27 jul–18 dec</p></article><article class="card term-card" id="min-dag-grid">\${grid}<p class="form-hint">\${hint}</p></article><button class="secondary" type="button">Ändra i Hämtning</button>\${sheet}</section>\`;
      const top = scrollRestore;
      scrollRestore = null;
      if (top != null) window.scrollTo(0, top);
      const pending = focusIso;
      focusIso = "";
      const body = document.querySelector(".week-sheet-body");
      if (pending && body) focusWeekDay(body, pending);
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      if (action === "show-earlier-weeks") {
        showEarlier = true;
        scrollRestore = window.scrollY;
        render();
      }
      if (action === "edit-pickup-week") {
        scrollRestore = window.scrollY;
        editor = {
          mode: "week",
          monday: target.dataset.monday,
          scrollY: window.scrollY,
          days: ArtanPickup.weekEditorSeed(input, target.dataset.monday, "g1"),
        };
        focusIso = target.dataset.date || "";
        render();
      }
      if (action === "close-pickup-editor" || action === "save-pickup-week") {
        scrollRestore = editor?.scrollY ?? window.scrollY;
        editor = null;
        render();
      }
    });

    window.__setMode = (mode) => {
      fromCurrent = mode !== "before";
      showEarlier = false;
      editor = null;
      focusIso = "";
      scrollRestore = 0;
      render();
    };

    render();
  </script>
</body>
</html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/min-dag-preview.html") {
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
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "artan-min-dag-"));
const chrome = spawn("/usr/local/bin/google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=9337",
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
  const version = await waitForJson("http://127.0.0.1:9337/json/version");
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
    if (message.method === "Runtime.exceptionThrown" || message.method === "Runtime.consoleAPICalled") logs.push(message);
  });

  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  sessionId = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);

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
    throw new Error(`hittade inte ${selector}`);
  }
  async function shot(filename) {
    const image = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.mkdirSync(shotDir, { recursive: true });
    fs.writeFileSync(path.join(shotDir, filename), Buffer.from(image.data, "base64"));
  }
  const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  }, sessionId);
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/min-dag-preview.html` }, sessionId);
  await waitForSelector("#min-dag-grid");

  await evaluate(`window.__setMode("before")`);
  await delay(50);
  await evaluate(`document.getElementById("min-dag-grid").scrollIntoView({ block: "start" })`);
  await delay(80);
  const before = await evaluate(`(() => {
    const week = document.querySelector(".term-grid-week");
    const box = week.getBoundingClientRect();
    return {
      text: week.innerText,
      top: box.top,
      earlier: Boolean(document.querySelector("[data-action='show-earlier-weeks']")),
      july: document.querySelector(".term-grid").innerText.includes("27 jul"),
    };
  })()`);
  assert(before.july && before.text.includes("27 jul") && before.text.includes("v.31"), `före-läget börjar inte på v.31 (${before.text})`);
  assert(!before.earlier && before.top >= 0 && before.top < 500, `före-läget visar inte veckan (${JSON.stringify(before)})`);
  const beforeOverflow = await evaluate(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`);
  assert(beforeOverflow.scroll <= beforeOverflow.client + 1, `före-läget flödar över (${beforeOverflow.scroll}/${beforeOverflow.client})`);
  await shot("min-dag-before-iphone.png");

  await evaluate(`window.__setMode("after")`);
  await delay(50);
  await evaluate(`document.getElementById("min-dag-grid").scrollIntoView({ block: "start" })`);
  await delay(80);
  const after = await evaluate(`(() => {
    const week = document.querySelector(".term-grid-week");
    const link = document.querySelector("[data-action='show-earlier-weeks']");
    const linkBox = link.getBoundingClientRect();
    const weekBox = week.getBoundingClientRect();
    return {
      text: week.innerText,
      weekTop: weekBox.top,
      linkTop: linkBox.top,
      linkHeight: linkBox.height,
      july: document.querySelector(".term-grid").innerText.includes("27 jul"),
      current: document.querySelector(".term-grid").innerText.includes("v.44"),
      saved: document.querySelector('[data-date="2026-10-26"]').className,
      closed: getComputedStyle(document.querySelector(".term-cell.is-closed")).backgroundColor,
    };
  })()`);
  assert(!after.july && after.current && after.text.includes("26 okt") && after.text.includes("v.44"), `efter-läget visar inte aktuell vecka (${after.text})`);
  assert(after.linkTop >= 0 && after.linkTop < 420 && after.linkHeight >= 44, `länken är inte klickbar (${JSON.stringify(after)})`);
  assert(after.saved.includes("term-cell") && !after.saved.includes("is-empty"), `sparad dag ser tom ut (${after.saved})`);
  assert(after.closed === "rgb(255, 240, 237)", `stängd dag är inte rosa (${after.closed})`);
  const afterOverflow = await evaluate(`({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth })`);
  assert(afterOverflow.scroll <= afterOverflow.client + 1, `efter-läget flödar över (${afterOverflow.scroll}/${afterOverflow.client})`);
  await shot("min-dag-after-iphone.png");

  const scrollBeforeOpen = await evaluate("window.scrollY");
  assert(scrollBeforeOpen > 80, `sidan står redan högst upp (${scrollBeforeOpen})`);
  await click('[data-date="2026-10-28"]');
  await waitForSelector("#week-sheet");
  const editorState = await evaluate(`(() => {
    const body = document.querySelector(".week-sheet-body");
    const row = document.querySelector('[data-week-day="2026-10-28"]');
    const bodyBox = body.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    return {
      title: document.getElementById("week-sheet-title").textContent,
      text: document.querySelector(".week-sheet").innerText,
      rowTop: rowBox.top,
      rowBottom: rowBox.bottom,
      bodyTop: bodyBox.top,
      bodyBottom: bodyBox.bottom,
      sheetScroll: body.scrollTop,
    };
  })()`);
  assert(editorState.title === "Vecka 44", `fel vecka öppnades (${editorState.title})`);
  for (const label of ["Samma som förra veckan", "Lämning", "Hämtning", "Ledig", "Spara"]) {
    assert(editorState.text.includes(label), `veckovyn saknar ${label}`);
  }
  assert(editorState.rowTop >= editorState.bodyTop - 1 && editorState.rowBottom <= editorState.bodyBottom + 1, `onsdagen syns inte i veckovyn (${JSON.stringify(editorState)})`);
  await shot("min-dag-week-editor-iphone.png");

  await click('[data-action="close-pickup-editor"]');
  await delay(40);
  const restored = await evaluate(`({ scroll: window.scrollY, sheet: Boolean(document.getElementById("week-sheet")), week: document.querySelector(".term-grid-week").innerText })`);
  assert(!restored.sheet && Math.abs(restored.scroll - scrollBeforeOpen) < 2, `tillbaka hoppade (${JSON.stringify(restored)} mot ${scrollBeforeOpen})`);
  assert(restored.week.includes("v.44") && !restored.week.includes("v.31"), `tillbaka visade fel vecka (${restored.week})`);
  await shot("min-dag-back-iphone.png");

  await click('[data-action="show-earlier-weeks"]');
  await delay(40);
  const earlier = await evaluate(`({ scroll: window.scrollY, july: document.querySelector(".term-grid").innerText.includes("v.31"), link: Boolean(document.querySelector("[data-action='show-earlier-weeks']")) })`);
  assert(earlier.july && !earlier.link && Math.abs(earlier.scroll - scrollBeforeOpen) < 2, `tidigare veckor hoppade (${JSON.stringify(earlier)})`);

  const exceptions = logs.filter((entry) => entry.method === "Runtime.exceptionThrown");
  assert(exceptions.length === 0, `sidfel: ${JSON.stringify(exceptions.slice(0, 2))}`);
  console.log("min dag grid browser checks passed");
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
  } catch {
    // The profile can still be busy for a moment after Chrome exits.
  }
  socket?.close();
}
