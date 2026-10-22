import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

await import(pathToFileURL(path.join(root, "share-print.js")));
const { ArtanShare } = globalThis;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unit() {
  const built = ArtanShare.buildTermShare({
    organizationName: "Kooperativet Ekorren",
    schoolName: "Ekorren förskola",
    departmentName: "Blåbär",
    termId: "term-1",
    termName: "Höstterminen 2026",
    startsOn: "2026-08-17",
    endsOn: "2026-12-18",
    opensAt: "06:30:00",
    closesAt: "18:30",
    closures: [
      { date: "2026-12-01", reason: "Jullunch" },
      { date: "2026-09-13", reason: "Planeringsdag" },
    ],
    childName: "Nora Ek",
    calendarUrl: "https://example.test/functions/v1/term-feed?token=secret",
    weeklyDropoff: "07:15",
    stamp: "2026-10-22T12:00:00Z",
  });
  const blob = `${built.text}\n${built.ics}\n${built.print}`;
  for (const expected of ["Kooperativet Ekorren", "Ekorren förskola", "Blåbär", "Höstterminen 2026", "06:30–18:30", "Planeringsdag", "Jullunch", "BEGIN:VCALENDAR", "DTSTART;VALUE=DATE:20260817", "DTEND;VALUE=DATE:20261219", "DTSTART;VALUE=DATE:20260913"]) {
    assert(blob.includes(expected), `saknas: ${expected}`);
  }
  for (const forbidden of ["Nora", "07:15", "16:45", "token=", "term-feed", "webcal:", "http", "/storage/", "childName"]) {
    assert(!blob.includes(forbidden), `terminsdelningen innehåller ${forbidden}`);
  }
  built.ics.split("\r\n").forEach((line) => {
    assert(new TextEncoder().encode(line).length <= 75, `för lång ICS-rad: ${line}`);
  });
  assert(built.ics.includes("\r\n"), "ICS ska använda CRLF");
  assert(ArtanShare.nextIsoDate("2026-08-31") === "2026-09-01", "datum över månadsskifte");
  assert(!ArtanShare.buildTermShare({
    termName: "<script>",
    startsOn: "2026-01-01",
    endsOn: "2026-01-02",
    opensAt: "08:00",
    closesAt: "16:00",
    stamp: "2026-10-22T12:00:00Z",
  }).print.includes("<script>"), "utskriften ska escapa HTML");

  const leaked = ArtanShare.printDocument({
    kind: "image",
    title: "Bild",
    alt: "Bild",
    url: "https://example.supabase.co/storage/v1/object/sign/photo.jpg?token=secret",
  });
  assert(!leaked.includes("token=") && !leaked.includes("supabase"), "utskrift får inte bädda in en signerad adress");
  const kept = ArtanShare.printDocument({ kind: "image", title: "Bild", alt: "Alt", url: "blob:http://local/bild" });
  assert(kept.includes("blob:http://local/bild"), "blob-adress ska kunna skrivas ut");

  const files = [{ type: "image/jpeg" }, { type: "application/pdf" }];
  const allowed = ArtanShare.chooseSharePlan(
    { title: "Inlägg", text: "Hej", files },
    { hasShare: true, canShare: (data) => data.files?.every((file) => file.type !== "text/calendar") },
  );
  assert(allowed.mode === "share" && allowed.data.files.length === 2 && allowed.data.text === "Hej", "filer och text delas tillsammans");
  const calendar = [{ type: "text/calendar", name: "termin.ics" }];
  const fallback = ArtanShare.chooseSharePlan(
    { title: "Termin", text: "Sammanfattning", files: calendar },
    { hasShare: true, canShare: (data) => data.files?.every((file) => file.type !== "text/calendar") },
  );
  assert(fallback.mode === "share" && fallback.data.text === "Sammanfattning" && !fallback.data.files && fallback.downloads.length === 1, "kalenderfil som inte kan delas laddas ner");
  const offline = ArtanShare.chooseSharePlan(
    { title: "Termin", text: "Sammanfattning", files: calendar },
    { hasShare: false, canShare: () => false },
  );
  assert(offline.mode === "fallback" && offline.downloads.length === 1, "utan Web Share laddas filen ner");

  const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const sharePrepared = source.slice(source.indexOf("function sharePrepared("), source.indexOf("function deliverShareFallback("));
  const runShareAction = source.slice(source.indexOf("function runShareAction("), source.indexOf("document.body.addEventListener(\"click\""));
  assert(!/\bawait\b/.test(sharePrepared), "sharePrepared får inte vänta innan den delar");
  assert(sharePrepared.includes("navigator.share(plan.data)"), "delningen anropas direkt");
  assert(!source.includes("async function sharePrepared") && !source.includes("async function runShareAction"), "klickhanteraren ska vara synkron");
  assert(!/\bawait\b/.test(runShareAction), "runShareAction får inte hämta filen efter trycket");
  assert(source.includes("prefetchGuardianAttachments"), "bilagor förbereds före trycket");
  const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert(index.indexOf("share-print.js") < index.indexOf("app.js"), "hjälpen laddas före appen");
  assert(!fs.existsSync(path.join(root, "supabase/016_share_print.sql")), "ingen databasändring ska följa med");
  console.log("Enhetstester klara.");
}

function fixture(pathname, method, rawBody) {
  let body = {};
  if (rawBody) {
    try { body = JSON.parse(rawBody); } catch { body = {}; }
  }
  if (pathname.includes("/storage/v1/object/sign/post-images")) {
    return (body.paths || []).map((item) => ({ path: item, signedURL: `/object/sign/post-images/${item}?token=super-secret-signed` }));
  }
  if (pathname.includes("/rest/v1/profiles")) {
    return [{
      id: "profile-1",
      auth_user_id: "user-1",
      organization_id: "org-1",
      name: "Nora Vårdnad",
      email: "nora@example.test",
      phone: "",
      role: "parent",
      removed_at: null,
      allow_parent_messages: false,
      allow_playdate_requests: false,
      allow_birthday_invitations: false,
    }];
  }
  if (pathname.includes("/rest/v1/organizations")) return [{ id: "org-1", name: "Kooperativet Ekorren", type: "preschool", created_at: "2026-01-01" }];
  if (pathname.includes("/rest/v1/preschools")) return [{ id: "school-1", organization_id: "org-1", name: "Ekorren förskola" }];
  if (pathname.includes("/rest/v1/departments")) return [{ id: "dept-1", preschool_id: "school-1", name: "Blåbär" }];
  if (pathname.includes("/rest/v1/children")) return [{ id: "child-1", department_id: "dept-1", name: "Nora Ek", birth_date: "2022-03-01", notes: "", avatar_color: "#9bb89a", photo_path: null }];
  if (pathname.includes("/rest/v1/posts")) {
    return [{ id: "post-1", department_id: "dept-1", child_id: null, author_id: "staff-1", type: "official", title: "Utflykt till skogen", body: "Ta med stövlar.", created_at: "2026-10-21T07:00:00Z" }];
  }
  if (pathname.endsWith("/list_school_terms")) {
    return [{ term_id: "term-1", preschool_id: "school-1", term_name: "Höstterminen 2026", starts_on: "2026-08-17", ends_on: "2026-12-18", opens_at: "06:30:00", closes_at: "18:30:00", term_status: "published" }];
  }
  if (pathname.endsWith("/list_school_term_closures")) return [{ closure_id: "closure-1", term_id: "term-1", closure_date: "2026-09-13", reason: "Planeringsdag" }];
  if (pathname.endsWith("/list_child_weekly_schedules")) {
    return [{ schedule_id: "schedule-1", term_id: "term-1", child_id: "child-1", weekday: 1, attending: true, dropoff_at: "07:15:00", pickup_at: "16:45:00", within_opening_hours: true }];
  }
  if (pathname.endsWith("/list_post_images")) {
    return [
      { image_id: "img-1", post_id: "post-1", storage_path: "dept/1.jpg", sort_order: 0, alt_text: "Skogspromenaden", width: 640, height: 480 },
      { image_id: "img-2", post_id: "post-1", storage_path: "dept/2.pdf", sort_order: 1, alt_text: "Karta", width: 640, height: 480 },
    ];
  }
  if (pathname.endsWith("/list_private_messages")) {
    return [{ message_id: "msg-1", delivery_group_id: "grp-1", sender_id: "staff-1", sender_name: "Malin Berg", recipient_id: "profile-1", recipient_name: "Nora Vårdnad", body: "Glöm inte galonbyxor.", created_at: "2026-10-22T08:00:00Z" }];
  }
  if (pathname.endsWith("/calendar_feed_status")) return [{ active: false, created_at: null }];
  if (method === "POST") return [];
  return [];
}

const pageStub = `(() => {
  window.__shareCalls = [];
  window.__downloads = [];
  window.__prints = [];
  window.__allowCalendar = false;
  const share = (data) => {
    const files = [...(data && data.files || [])];
    const record = { title: data && data.title || "", text: data && data.text || "", files: files.map((file) => ({ name: file.name, type: file.type, size: file.size, text: "" })) };
    window.__shareCalls.push(record);
    Promise.all(files.map(async (file, index) => {
      if (String(file.type || "").startsWith("text/") || file.type === "text/calendar" || /\\.(ics|txt)$/i.test(file.name || "")) record.files[index].text = await file.text();
    })).catch(() => {});
    return Promise.resolve();
  };
  const canShare = (data) => {
    const files = data && data.files || [];
    if (!files.length) return false;
    return files.every((file) => {
      if (file.type === "text/calendar" || /\\.ics$/i.test(file.name || "")) return Boolean(window.__allowCalendar);
      return /^(image\\/(jpeg|png|webp|gif)|application\\/pdf)$/.test(file.type || "");
    });
  };
  const define = (name, value) => {
    try { Object.defineProperty(navigator, name, { configurable: true, value }); }
    catch { try { Object.defineProperty(Navigator.prototype, name, { configurable: true, value }); } catch { /* The click test reports a missing share call. */ } }
  };
  define("share", share);
  define("canShare", canShare);
  navigator.clipboard = { writeText: async (text) => { window.__copied = text; } };
  const originalClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function clickDownload() {
    if (this.hasAttribute("download")) { window.__downloads.push(this.download); return; }
    return originalClick.call(this);
  };
  window.print = () => {
    const root = document.getElementById("printRoot");
    window.__prints.push(root ? root.innerHTML : "");
  };
  localStorage.setItem("artan.session", JSON.stringify({ access_token: "test-token", refresh_token: "refresh", expires_at: 9999999999, user: { id: "user-1" } }));
})();`;

function encodeBody(value, contentType) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
  return { body: body.toString("base64"), contentType, length: body.length };
}

async function browser() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const relative = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const file = path.resolve(root, `.${relative}`);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404);
      response.end("missing");
      return;
    }
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(response);
  });
  const port = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "artan-share-"));
  const chrome = spawn("/usr/local/bin/google-chrome", [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--remote-debugging-port=9334",
    `--user-data-dir=${userDir}`,
    "about:blank",
  ], { stdio: "ignore" });

  const held = [];
  let releaseFiles = null;
  const fileGate = new Promise((resolve) => { releaseFiles = resolve; });
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
    const version = await waitForJson("http://127.0.0.1:9334/json/version");
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
      if (message.method === "Fetch.requestPaused" && message.sessionId === sessionId) {
        fulfillPaused(message.params).catch((error) => logs.push(String(error)));
      }
    });

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    sessionId = (await send("Target.attachToTarget", { targetId, flatten: true })).sessionId;
    await send("Page.enable", {}, sessionId);
    await send("Runtime.enable", {}, sessionId);
    await send("Page.addScriptToEvaluateOnNewDocument", { source: pageStub }, sessionId);
    await send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] }, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await send("Page.navigate", { url: `http://127.0.0.1:${port}/` }, sessionId);

    async function evaluate(expression) {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "evaluate failed");
      return result.result.value;
    }
    async function waitForSelector(selector) {
      const started = Date.now();
      while (Date.now() - started < 8000) {
        const found = await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
        if (found) return;
        await delay(50);
      }
      const text = await evaluate("document.body.innerText.slice(0, 1200)");
      throw new Error(`hittade inte ${selector}\n${text}\n${JSON.stringify(logs.slice(-5))}`);
    }
    const click = (selector) => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

    await waitForSelector('[aria-label="Dela Höstterminen 2026"]');
    await waitForSelector('[aria-label="Dela Skogspromenaden"]');
    const prefetchStarted = Date.now();
    while (held.length < 2 && Date.now() - prefetchStarted < 8000) await delay(20);
    assert(held.length >= 2, `bilagorna förbereddes inte (${held.length})`);
    const shot = path.join("/opt/cursor/artifacts/screenshots");
    fs.mkdirSync(shot, { recursive: true });
    async function saveClip(selector, filename, padding = 24) {
      const box = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        (el.querySelector(".share-actions") || el).scrollIntoView({ block: "center" });
        const rect = el.getBoundingClientRect();
        const viewW = document.documentElement.clientWidth;
        const viewH = document.documentElement.clientHeight;
        const x = Math.max(0, rect.x - ${padding});
        const y = Math.max(0, rect.y - ${padding});
        return { x, y, width: Math.max(1, Math.min(rect.width + ${padding * 2}, viewW - x)), height: Math.max(1, Math.min(rect.height + ${padding * 2}, viewH - y)) };
      })()`);
      const image = await send("Page.captureScreenshot", { format: "png", clip: { ...box, scale: 1 } }, sessionId);
      fs.writeFileSync(path.join(shot, filename), Buffer.from(image.data, "base64"));
    }
    await saveClip(".term-card", "share-print-desktop.png", 16);
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, sessionId);
    await saveClip(".term-card", "share-print-mobile.png", 12);
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    await saveClip(".school-post", "share-print-post.png", 16);

    const callsBefore = () => evaluate("window.__shareCalls.length");
    const printsBefore = await evaluate("window.__prints.length");
    await click('[aria-label="Skriv ut Höstterminen 2026"]');
    const termPrint = await evaluate("window.__prints.at(-1)");
    await send("Emulation.setEmulatedMedia", { media: "print" }, sessionId);
    const printed = await send("Page.captureScreenshot", { format: "png" }, sessionId);
    fs.writeFileSync(path.join(shot, "share-print-sheet.png"), Buffer.from(printed.data, "base64"));
    const pdf = await send("Page.printToPDF", { printBackground: false, preferCSSPageSize: true }, sessionId);
    await send("Emulation.setEmulatedMedia", { media: "screen" }, sessionId);
    assert(termPrint.includes("Planeringsdag") && termPrint.includes("Kooperativet Ekorren") && termPrint.includes("Blåbär"), "utskriften saknar terminen");
    assert(!termPrint.includes("Nora") && !termPrint.includes("07:15") && !termPrint.includes("token="), "utskriften läcker barn eller länk");
    const pdfBytes = Buffer.from(pdf.data, "base64");
    const pages = pdfBytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || [];
    assert(pages.length === 1, `terminens utskrift blev ${pages.length} sidor`);

    await click('[aria-label="Dela Höstterminen 2026"]');
    await delay(50);
    const sharedTerm = await evaluate("window.__shareCalls.at(-1)");
    const downloads = await evaluate("window.__downloads.slice()");
    assert(sharedTerm.text.includes("Planeringsdag") && sharedTerm.text.includes("06:30"), "delad text saknar schemat");
    assert(!sharedTerm.text.includes("Nora") && !/https?:\/\//.test(sharedTerm.text) && !sharedTerm.text.includes("token=") && !sharedTerm.text.includes("07:15"), "delad text läcker");
    assert(downloads.some((name) => name.endsWith(".ics")), "ics-filen laddas ner när den inte kan delas");

    await evaluate("window.__allowCalendar = true");
    const beforeCalendar = await callsBefore();
    await click('[aria-label="Dela Höstterminen 2026"]');
    let calendarShare = null;
    const calendarStarted = Date.now();
    while (Date.now() - calendarStarted < 2000) {
      calendarShare = await evaluate(`window.__shareCalls[${beforeCalendar}]`);
      if (calendarShare?.files?.some((file) => file.text?.includes("BEGIN:VCALENDAR"))) break;
      await delay(20);
    }
    assert(calendarShare.files.some((file) => file.name.endsWith(".ics") && file.text.includes("BEGIN:VCALENDAR") && !file.text.includes("Nora") && !file.text.includes("token=")), "ics-filen delas utan personlig länk");

    const beforeEarly = await callsBefore();
    const printsEarly = await evaluate("window.__prints.length");
    await click('[aria-label="Dela Skogspromenaden"]');
    await click('[aria-label="Skriv ut Karta"]');
    assert(await callsBefore() === beforeEarly, "delning anropades innan filen var hämtad");
    assert(await evaluate("window.__prints.length") === printsEarly, "utskrift anropades innan filen var hämtad");
    assert((await evaluate("document.body.innerText")).includes("Filen förbereds"), "ett nytt tryck krävs när filen inte är klar");

    releaseFiles();
    const started = Date.now();
    let attachment = null;
    while (Date.now() - started < 8000) {
      const count = await callsBefore();
      await click('[aria-label="Dela Skogspromenaden"]');
      await delay(40);
      if (await callsBefore() > count) {
        attachment = await evaluate("window.__shareCalls.at(-1)");
        break;
      }
    }
    assert(attachment?.files?.some((file) => file.type === "image/jpeg" && file.size > 0), "bilagan delades inte som fil");
    assert(!JSON.stringify(attachment).includes("token=") && !JSON.stringify(attachment).includes("/storage/"), "bilagan delades som länk");

    await click('[aria-label="Skriv ut Skogspromenaden"]');
    const imagePrint = await evaluate("window.__prints.at(-1)");
    assert(imagePrint.includes("blob:") && !imagePrint.includes("token=") && !imagePrint.includes("/storage/"), "bildutskriften använder inte den signerade adressen");

    await click('[data-action="navigate"][data-view="messages"]');
    await waitForSelector('[aria-label="Dela Malin Berg"]');
    await click('[aria-label="Dela Malin Berg"]');
    await delay(30);
    const message = await evaluate("window.__shareCalls.at(-1)");
    assert(message.text.includes("galonbyxor") && !message.text.includes("token="), "meddelandet delades inte som text");
    await click('[aria-label="Skriv ut Malin Berg"]');
    const messagePrint = await evaluate("window.__prints.at(-1)");
    assert(messagePrint.includes("galonbyxor") && messagePrint.includes("Malin Berg"), "meddelandet saknas i utskriften");

    const beforePost = await callsBefore();
    await click('[aria-label="Dela Utflykt till skogen"]');
    await delay(30);
    const post = await evaluate(`window.__shareCalls[${beforePost}]`);
    assert(post.files.length === 2 && post.text.includes("Ta med stövlar.") && !post.text.includes("Nora") && !post.text.includes("token="), "inläggets filer delades inte");
    assert(printsBefore >= 0);
    console.log("Webbläsartest klart.");
  } catch (error) {
    console.error(error?.message || error);
    console.error(JSON.stringify(logs.slice(-6), null, 2));
    throw error;
  } finally {
    try { socket?.close(); } catch { /* already closed */ }
    chrome.kill("SIGKILL");
    server.close();
    await delay(300);
    try { fs.rmSync(userDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* Chrome may still be releasing the profile. */ }
  }

  async function fulfillPaused(params) {
    const url = params.request.url;
    const method = params.request.method;
    if (!url.includes("supabase.co")) {
      await send("Fetch.continueRequest", { requestId: params.requestId }, sessionId);
      return;
    }
    const cors = [
      { name: "Access-Control-Allow-Origin", value: "*" },
      { name: "Access-Control-Allow-Headers", value: "*" },
      { name: "Access-Control-Allow-Methods", value: "GET,POST,DELETE,OPTIONS" },
      { name: "Cache-Control", value: "no-store" },
    ];
    if (method === "OPTIONS") {
      await send("Fetch.fulfillRequest", { requestId: params.requestId, responseCode: 204, responseHeaders: cors, body: "" }, sessionId);
      return;
    }
    if (method === "GET" && url.includes("token=super-secret-signed")) {
      held.push(url);
      await fileGate;
      const pdfFile = url.includes(".pdf");
      const payload = pdfFile
        ? encodeBody(Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"), "application/pdf")
        : encodeBody(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), "image/jpeg");
      await send("Fetch.fulfillRequest", {
        requestId: params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: payload.contentType }, ...cors],
        body: payload.body,
      }, sessionId);
      return;
    }
    const parsed = new URL(url);
    const json = fixture(parsed.pathname, method, params.request.postData || "");
    const payload = encodeBody(json, "application/json");
    await send("Fetch.fulfillRequest", {
      requestId: params.requestId,
      responseCode: 200,
      responseHeaders: [{ name: "Content-Type", value: "application/json" }, ...cors],
      body: payload.body,
    }, sessionId);
  }

}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForJson(url) {
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch { /* Chrome is still opening the port. */ }
    await delay(50);
  }
  throw new Error("Chrome öppnade inte felsökningsporten.");
}

unit();
await browser();
