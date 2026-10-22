import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

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
        starts_on: "2026-10-20",
        ends_on: "2026-11-06",
        closures: ["2026-10-23"],
        closureReasons: { "2026-10-23": "Planering" },
        standard: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, attending: true, dropoff_at: "08:00", pickup_at: "16:30" })),
      }],
      dayPlans: [],
      standardPickers: [{ weekday: 4, picker_kind: "guardian", picker_id: "g1" }],
    };
    let editor = null;
    let notice = "";
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

    function dayEditor(date) {
      const day = ArtanPickup.buildTermGrid(input).weeks.flatMap((week) => week.days).find((item) => item.iso === date);
      if (!day?.open) return "";
      return \`<form id="pickup-editor" class="card form-stack" data-form="pickup-day" data-date="\${date}"><p class="kicker">Ändra dag</p><h2>\${escapeHtml(ArtanPickup.shortDate(date))}</h2><div class="form-grid"><label>Lämning<input type="time" name="dropoff_at" value="\${escapeHtml(day.dropoff)}" required></label><label>Hämtning<input type="time" name="pickup_at" value="\${escapeHtml(day.pickup)}" required></label></div><label>Vem hämtar?<select name="picker" required><option value="">Välj</option><option value="guardian:g1" \${day.picker?.kind === "guardian" ? "selected" : ""}>Anna</option><option value="contact:c1">Mormor Karin</option></select></label><div class="stack-actions"><button class="primary" type="submit">Spara dagen</button><button class="secondary" type="button" data-action="close-pickup-editor">Avbryt</button></div></form>\`;
    }

    function menu() {
      return \`<section id="pickup-editor" class="card"><p class="kicker">Hämtning</p><h2>Planera</h2><div class="stack-actions"><button class="primary" type="button" data-action="pickup-standard">Standardvecka</button><button class="secondary" type="button" data-action="copy-pickup-week">Kopiera den här veckan till nästa</button><button class="secondary" type="button" data-action="close-pickup-editor">Stäng</button></div></section>\`;
    }

    function standardForm() {
      const rows = [1, 2, 3, 4, 5].map((weekday) => \`<div class="weekly-schedule-row"><label>Lämning<input type="time" name="dropoff_\${weekday}" value="08:00"></label><label>Hämtning<input type="time" name="pickup_\${weekday}" value="16:30"></label></div>\`).join("");
      return \`<form id="pickup-editor" class="card form-stack" data-form="pickup-standard"><p class="kicker">Standardvecka</p><h2>Samma tider varje vecka</h2><button class="secondary" type="button" data-action="parse-weekly-schedule">Tolka och fyll i</button><fieldset class="weekly-schedule"><legend>Måndag till fredag</legend>\${rows}</fieldset><button class="primary" type="submit">Spara standardvecka</button></form>\`;
    }

    function render() {
      const grid = ArtanPickup.renderTermGrid(input, { editable: true });
      const readonly = ArtanPickup.renderTermGrid(input);
      const extra = editor?.mode === "day" ? dayEditor(editor.date) : editor?.mode === "menu" ? menu() : editor?.mode === "standard" ? standardForm() : "";
      screen.innerHTML = \`<p id="notice">\${escapeHtml(notice)}</p><section class="hero-card"><p class="kicker">Hämtning</p><h1 class="h1">Tyra</h1></section><section class="card term-card" id="pickup-schedule"><h2>Terminen</h2>\${extra}\${grid}<button class="term-add no-print" type="button" data-action="pickup-add" aria-label="Planera vecka">+</button></section><section class="pass-sheet guardian-pass"><p class="kicker">Hämtpass</p><h1>Visa för personalen</h1><p class="pass-child">Tyra</p><p>22 okt. 2026</p><div class="pass-qr" data-pass-qr="\${token}" role="img" aria-label="QR-kod för hämtpasset"></div><p class="pass-code">\${code}</p><p class="pass-privacy">Passet visar bara förnamn. Visa det för personalen och dela inte länken.</p><div class="share-actions pass-share no-print"><button class="primary" type="button" data-action="share-pass" data-token="\${token}" data-code="\${code}" data-label="Hämtpass för Tyra">Dela</button><button class="secondary" type="button" data-action="print-pass">Skriv ut/Spara</button></div></section><section class="card" id="term-overview"><h2>Öppettider och schema</h2>\${readonly}</section>\`;
      paintQr();
    }

    document.addEventListener("click", (event) => {
      const target = event.target.closest("[data-action]");
      if (!target) return;
      const action = target.dataset.action;
      if (action === "edit-pickup-day") {
        editor = { mode: "day", date: target.dataset.date };
        notice = "";
        render();
        document.getElementById("pickup-editor")?.scrollIntoView({ block: "start" });
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
      const form = event.target;
      if (form.dataset.form !== "pickup-day") return;
      event.preventDefault();
      const data = new FormData(form);
      const [kind, id] = String(data.get("picker") || "").split(":");
      input.dayPlans = input.dayPlans.filter((plan) => plan.plan_date !== form.dataset.date);
      input.dayPlans.push({
        plan_date: form.dataset.date,
        dropoff_at: data.get("dropoff_at"),
        pickup_at: data.get("pickup_at"),
        picker_kind: kind,
        picker_id: id,
      });
      editor = null;
      notice = "Dagen är sparad.";
      render();
    });

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
const chrome = spawn("/usr/local/bin/google-chrome", [
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
  const shotDir = "/opt/cursor/artifacts/screenshots";
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
  assert(opened.includes("08:00–16:30"), "tiderna saknas");
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
  await shot("pickup-hub-grid-mobile.png");

  await click("#pickup-today");
  await waitForSelector("#pickup-editor");
  const editor = await evaluate(`(() => {
    const form = document.getElementById("pickup-editor");
    return { date: form.querySelector("h2").textContent, dropoff: form.dropoff_at.value, pickup: form.pickup_at.value };
  })()`);
  assert(editor.date === "22 okt" && editor.dropoff === "08:00" && editor.pickup === "16:30", `dagredigeraren fylldes inte (${JSON.stringify(editor)})`);
  await evaluate(`(() => {
    const form = document.getElementById("pickup-editor");
    form.dropoff_at.value = "07:45";
    form.pickup_at.value = "15:15";
    form.picker.value = "contact:c1";
    form.requestSubmit();
  })()`);
  await delay(50);
  const saved = await evaluate(`(() => {
    const cell = document.querySelector('#pickup-today');
    return { text: cell.textContent, person: Boolean(cell.querySelector(".term-person")), notice: document.getElementById("notice").textContent };
  })()`);
  assert(saved.text.includes("07:45–15:15") && saved.person && saved.notice.includes("Dagen är sparad"), `sparad dag syns inte (${JSON.stringify(saved)})`);

  await click('[data-action="pickup-add"]');
  await waitForSelector('[data-action="copy-pickup-week"]');
  await click('[data-action="pickup-standard"]');
  await waitForSelector('[data-action="parse-weekly-schedule"]');
  const standardCount = await evaluate(`document.querySelectorAll('#pickup-editor input[type="time"]').length`);
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
  fs.rmSync(userDir, { recursive: true, force: true });
}
