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

export async function renderPdfPages(data, hooks = {}) {
  const pdfjs = await import("./vendor/pdfjs/pdf.mjs");
  if (pdfjs.GlobalWorkerOptions) pdfjs.GlobalWorkerOptions.workerSrc = workerUrl();
  if (typeof document === "undefined") throw new Error("Sidor kan bara ritas i webbläsaren.");
  const bytes = data instanceof Uint8Array ? new Uint8Array(data) : new Uint8Array(data);
  const task = pdfjs.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: false });
  const doc = await task.promise;
  const pageCount = doc.numPages;
  const maxPages = hooks.maxPages || 12;
  const total = Math.min(pageCount, maxPages);
  try {
    for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
      if (hooks.signal?.aborted) throw new Error("Inläsningen avbröts.");
      hooks.onProgress?.({ page: pageNumber, total });
      const page = await doc.getPage(pageNumber);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(2, 1600 / Math.max(unscaled.width, unscaled.height, 1));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;
      await hooks.onPage?.(canvas, { page: pageNumber, total });
      page.cleanup?.();
      canvas.width = 1;
      canvas.height = 1;
    }
  } finally {
    await doc.destroy?.();
  }
  return { pages: pageCount, read: total, truncated: pageCount > total };
}

globalThis.ArtanMenuExtract = { extractPdfText, renderPdfPages };
