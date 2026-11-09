// Browser-local OCR. tesseract.js 5.1.1 and the LSTM core are vendored.
// Swedish tessdata_fast 4.1.0 is fetched from this origin only when a photo
// or a textless PDF is read. The image itself is not sent anywhere.

const base = new URL("./vendor/tesseract/", import.meta.url);

function abortError() {
  return new Error("Inläsningen avbröts.");
}

function textFromResult(result) {
  const collected = [];
  for (const block of result?.data?.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const text = String(line.text || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const confident = Number(line.confidence) >= 40;
        const useful = /vecka|^v\.?\s*\d|måndag|tisdag|onsdag|torsdag|fredag|mandag|lordag|sondag/i.test(text);
        if (!confident && !useful) continue;
        collected.push(text);
      }
    }
  }
  if (collected.length) return collected.join("\n");
  return String(result?.data?.text || "").replace(/[ \t]+\n/g, "\n").trim();
}

async function recognizeOrAbort(worker, image, signal) {
  if (signal?.aborted) throw abortError();
  let timer = 0;
  let stop = false;
  const aborted = new Promise((_, reject) => {
    const check = () => {
      if (stop) return;
      if (signal?.aborted) {
        worker.terminate();
        reject(abortError());
        return;
      }
      timer = setTimeout(check, 80);
    };
    timer = setTimeout(check, 80);
  });
  try {
    return await Promise.race([worker.recognize(image), aborted]);
  } finally {
    stop = true;
    clearTimeout(timer);
  }
}

export async function openReader(hooks = {}) {
  const Tesseract = (await import("./vendor/tesseract/tesseract.esm.min.js")).default;
  if (hooks.signal?.aborted) throw abortError();
  hooks.onProgress?.({ status: "loading tesseract core", progress: 0 });
  let worker;
  worker = await Tesseract.createWorker("swe", 1, {
    workerPath: new URL("worker.min.js", base).href,
    corePath: new URL("tesseract-core-lstm.wasm.js", base).href,
    langPath: base.href,
    workerBlobURL: false,
    gzip: true,
    cachePath: "artan-menu-ocr",
    logger(message) {
      hooks.onProgress?.(message);
      if (hooks.signal?.aborted) worker?.terminate();
    },
  });
  return {
    async recognize(image) {
      const result = await recognizeOrAbort(worker, image, hooks.signal);
      return textFromResult(result);
    },
    async close() {
      await worker.terminate().catch(() => {});
    },
  };
}

globalThis.ArtanMenuOcr = { openReader };
