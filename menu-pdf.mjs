const limits = globalThis.ArtanMenu || { MAX_PDF_PAGES: 20 };

function workerUrl() {
  return new URL("./vendor/pdfjs/pdf.worker.mjs", import.meta.url).href;
}

export async function extractPdfText(data, hooks = {}) {
  const pdfjs = await import("./vendor/pdfjs/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl();
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  const doc = await task.promise;
  if (doc.numPages > limits.MAX_PDF_PAGES) {
    await doc.destroy?.();
    throw new Error(`PDF:en har ${doc.numPages} sidor. Högst ${limits.MAX_PDF_PAGES} sidor kan läsas.`);
  }
  const pages = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    if (hooks.signal?.aborted) {
      await doc.destroy?.();
      throw new Error("Inläsningen avbröts.");
    }
    hooks.onProgress?.({ page: pageNumber, total: doc.numPages });
    if (hooks.signal?.aborted) {
      await doc.destroy?.();
      throw new Error("Inläsningen avbröts.");
    }
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(globalThis.ArtanMenu.linesFromTextItems(content.items).join("\n"));
    if (hooks.signal?.aborted) {
      await doc.destroy?.();
      throw new Error("Inläsningen avbröts.");
    }
  }
  await doc.destroy?.();
  return pages.filter(Boolean).join("\n");
}

globalThis.ArtanMenuExtract = { extractPdfText };
