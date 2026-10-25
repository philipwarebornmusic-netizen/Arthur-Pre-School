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
  <title>Hämtbild och förlängning</title>
  <link rel="stylesheet" href="/fonts/nunito.css">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="app-frame">
    <header class="topbar"><img src="/logo.svg" width="188" height="56" alt="ärtan"></header>
    <div class="workspace">
      <main id="screen" class="screen"></main>
      <nav class="bottom-nav" aria-label="ärtans huvudmeny">
        <button type="button" aria-current="page"><span class="ico">●</span>Min dag</button>
        <button type="button"><span class="ico">◎</span>Hämtning</button>
        <button type="button"><span class="ico">🌱</span>Barnet</button>
      </nav>
    </div>
  </div>
  <script src="/pickup-hub.js"></script>
  <script>
    const today = "2026-10-25";
    const terms = [{ starts_on: "2026-08-17", ends_on: "2026-12-18" }, { starts_on: "2027-01-07", ends_on: "2027-06-16" }];
    const defaultEnd = ArtanPickup.defaultPassEnd(today, terms);
    const nextEnd = ArtanPickup.nextPassEnd(today, "2026-12-18", terms);
    const renewal = ArtanPickup.swedishGenitive("Karin") + " hämtpass gäller till 18 dec. 2026. Förläng till nästa termin?";
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f4c16a";
    context.fillRect(0, 0, 64, 64);
    context.fillStyle = "#2f3e46";
    context.beginPath();
    context.arc(32, 24, 10, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.ellipse(32, 58, 18, 14, 0, Math.PI, 0);
    context.fill();
    const photo = canvas.toDataURL("image/jpeg", 0.84);
    const screen = document.querySelector("#screen");
    screen.innerHTML = \`
      <section class="hero-card"><p class="kicker">Min dag</p><h1 class="h1">Karin</h1></section>
      <section class="card pass-renewal" data-pass-renewal="renew">
        <p class="kicker">Hämtpass</p>
        <h2>\${renewal}</h2>
        <div class="stack-actions">
          <button class="primary" type="button" data-action="extend">Förläng</button>
          <button class="secondary" type="button" data-action="dismiss">Låt gå ut</button>
        </div>
      </section>
      <section class="card" id="pickup-list">
        <p class="kicker">Hämtning</p>
        <h2>Hämtlista</h2>
        <p class="form-hint">Valfri bild. Personalen ser den vid utcheckning och när ett hämtpass skannas. Bilden förminskas till 512 pixlar.</p>
        <ul class="contact-list">
          <li class="contact-photo-row">
            <div class="attendance-identity">
              <span class="child-avatar has-photo"><img src="\${photo}" alt=""><span class="avatar-initials">K</span></span>
              <div><strong>Karin</strong><span>Mormor</span>
                <div class="photo-actions contact-photo-actions"><label class="file-button">Byt bild<input type="file" accept="image/*" data-action="contact-photo"></label><button class="link danger-link" type="button">Ta bort bild</button></div>
              </div>
            </div>
            <div class="invite-actions"><button class="link danger-link" type="button">Ta bort</button></div>
          </li>
        </ul>
      </section>
      <form class="card form-stack" data-form="permanent-pickup-pass">
        <h3>Skapa permanent hämtpass</h3>
        <label>Slutdatum<input name="ends_on" type="date" value="\${defaultEnd}"></label>
        <p class="form-hint">Slutdatumet är terminens sista dag. Töm fältet om passet ska gälla tills det återkallas.</p>
      </form>
      <section class="card" id="expired-pass"><h2>Utgånget pass</h2><button class="link" type="button" data-action="renew">Förnya</button><p data-renewed hidden></p></section>
      <form class="card form-stack checkout-panel">
        <p class="kicker">Hämtad av</p>
        <h2>Karin</h2>
        <label>Vem hämtar?
          <select data-pickup-choice>
            <option value="">Välj</option>
            <option value="list:karin" selected>Karin · Mormor</option>
            <option value="other">Annan</option>
          </select>
        </label>
        <div class="checkout-person" data-pickup-person>
          <span class="child-avatar has-photo"><img src="\${photo}" alt=""><span class="avatar-initials">K</span></span>
          <div><strong>Karin</strong><span>Mormor</span></div>
        </div>
      </form>
      <p id="result" class="notice success" hidden></p>\`;
    document.querySelector('[data-action="extend"]').addEventListener("click", () => {
      document.querySelector("[data-pass-renewal]").remove();
      const result = document.querySelector("#result");
      result.hidden = false;
      result.textContent = "Hämtpasset är förlängt till nästa termin. " + nextEnd;
    });
    document.querySelector('[data-action="dismiss"]').addEventListener("click", () => {
      document.querySelector("[data-pass-renewal]")?.remove();
      const result = document.querySelector("#result");
      result.hidden = false;
      result.textContent = "Passet får gå ut.";
    });
    document.querySelector('[data-action="renew"]').addEventListener("click", () => {
      const renewed = document.querySelector("[data-renewed]");
      renewed.hidden = false;
      renewed.textContent = "Förnyat till " + ArtanPickup.nextPassEnd(today, "2026-10-01", terms);
    });
    document.querySelector("[data-pickup-choice]").addEventListener("change", (event) => {
      document.querySelector("[data-pickup-person]").hidden = event.target.value !== "list:karin";
    });
  </script>
</body>
</html>`;

const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(preview);
    return;
  }
  const relative = decodeURIComponent(url.pathname);
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
const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "artan-contact-photo-"));
const chrome = spawn("/usr/local/bin/google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--remote-debugging-port=9336",
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
  const version = await waitForJson("http://127.0.0.1:9336/json/version");
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
    if (message.method === "Runtime.exceptionThrown") logs.push(message);
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
  async function click(selector) {
    await waitForSelector(selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  }
  const shotDir = "/opt/cursor/artifacts/screenshots";
  fs.mkdirSync(shotDir, { recursive: true });
  async function shot(filename) {
    const image = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(path.join(shotDir, filename), Buffer.from(image.data, "base64"));
  }

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 1200, deviceScaleFactor: 2, mobile: true }, sessionId);
  await send("Page.navigate", { url: `http://127.0.0.1:${port}/` }, sessionId);
  await waitForSelector("[data-pass-renewal]");
  const initial = await evaluate(`({
    text: document.querySelector("[data-pass-renewal] h2").textContent,
    end: document.querySelector('[name="ends_on"]').value,
    photo: document.querySelector(".contact-photo-row img").naturalWidth,
    file: Boolean(document.querySelector('[data-action="contact-photo"]')),
    renew: document.querySelector('[data-action="renew"]').textContent,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  })`);
  assert(initial.text === "Karins hämtpass gäller till 18 dec. 2026. Förläng till nästa termin?", initial.text);
  assert(initial.end === "2026-12-18", `slutdatum ${initial.end}`);
  assert(initial.photo > 0 && initial.file, "bilden och filväljaren saknas");
  assert(initial.renew === "Förnya", initial.renew);
  assert(initial.overflow <= 1, `sidan flödar över (${initial.overflow})`);
  await shot("contact-photo-renewal-390.png");
  await evaluate(`document.querySelector(".checkout-panel").scrollIntoView({ block: "start" })`);
  await delay(80);
  await shot("contact-photo-checkout-390.png");

  await click('[data-action="extend"]');
  const extended = await evaluate(`document.querySelector("#result").textContent`);
  assert(extended.includes("Hämtpasset är förlängt till nästa termin.") && extended.includes("2027-06-16"), extended);
  assert(await evaluate(`!document.querySelector("[data-pass-renewal]")`), "kortet ligger kvar efter Förläng");

  await send("Page.reload", {}, sessionId);
  await waitForSelector('[data-action="dismiss"]');
  await click('[data-action="dismiss"]');
  const dismissed = await evaluate(`document.querySelector("#result").textContent`);
  assert(dismissed === "Passet får gå ut.", dismissed);

  await send("Page.reload", {}, sessionId);
  await waitForSelector('[data-action="renew"]');
  await click('[data-action="renew"]');
  const renewed = await evaluate(`document.querySelector("[data-renewed]").textContent`);
  assert(renewed.includes("2026-12-18"), renewed);
  await evaluate(`document.querySelector("[data-pickup-choice]").value = "other"; document.querySelector("[data-pickup-choice]").dispatchEvent(new Event("change"))`);
  assert(await evaluate(`document.querySelector("[data-pickup-person]").hidden`), "annan person visar fortfarande bilden");
  await evaluate(`document.querySelector("[data-pickup-choice]").value = "list:karin"; document.querySelector("[data-pickup-choice]").dispatchEvent(new Event("change"))`);
  assert(await evaluate(`!document.querySelector("[data-pickup-person]").hidden`), "hämtlistan visar inte bilden");
  const exceptions = logs.filter((entry) => entry.method === "Runtime.exceptionThrown");
  assert(exceptions.length === 0, `sidfel: ${JSON.stringify(exceptions.slice(0, 2))}`);
  console.log("contact photo browser checks passed");
} catch (error) {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
} finally {
  chrome.kill("SIGKILL");
  server.close();
  await delay(200);
  try {
    fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch { /* Chrome can still be releasing the profile after the checks have passed. */ }
}
