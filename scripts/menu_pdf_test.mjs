import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "../menu-read.js";
import { extractPdfText } from "../menu-pdf.mjs";

const mode = process.argv[2] || "read";

function pdfEscape(value) {
  return String(value).replace(/[()\\]/g, "\\$&");
}

function textPdf(lines) {
  const commands = ["BT", "/F1 12 Tf"];
  lines.forEach((line, index) => {
    commands.push(`${index === 0 ? "40 360 Td" : "0 -18 Td"} (${pdfEscape(line)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

const bytes = textPdf([
  "Vecka 46 2026",
  "Mandag 9 november",
  "Fiskgratang",
  "Tisdag",
  "Kottbullar",
]);
if (mode === "cancel") {
  let cancelled = false;
  await assert.rejects(
    () => extractPdfText(bytes, { signal: { get aborted() { return cancelled; } }, onProgress() { cancelled = true; } }),
    /avbröts/,
  );
  console.log("menu pdf cancel passed");
  process.exit(0);
}

const text = await extractPdfText(bytes);
const parsed = globalThis.ArtanMenu.parseMenuText(text);
assert.equal(parsed.items.find((item) => item.served_on === "2026-11-09")?.body.includes("Fiskgratang"), true);
assert.equal(parsed.items.some((item) => item.body.includes(".pdf")), false);

const pages = ["1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"];
const kids = [];
for (let page = 0; page < 21; page += 1) kids.push(`${page + 3} 0 R`);
pages.push(`2 0 obj << /Type /Pages /Kids [${kids.join(" ")}] /Count 21 >> endobj\n`);
for (let page = 0; page < 21; page += 1) {
  pages.push(`${page + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 10 10] >> endobj\n`);
}
let many = "%PDF-1.4\n";
const offsets = [0];
for (const object of pages) {
  offsets.push(many.length);
  many += object;
}
const xref = many.length;
many += `xref\n0 ${pages.length + 1}\n0000000000 65535 f \n`;
for (let index = 1; index < offsets.length; index += 1) many += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
many += `trailer << /Size ${pages.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
if (mode === "limit") {
  await assert.rejects(() => extractPdfText(new TextEncoder().encode(many)), /Högst 20 sidor/);
  console.log("menu pdf limit passed");
  process.exit(0);
}

const root = fileURLToPath(new URL("..", import.meta.url));
for (const name of ["cancel", "limit"]) {
  const result = spawnSync(process.execPath, ["scripts/menu_pdf_test.mjs", name], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
}
console.log("menu pdf tests passed");
