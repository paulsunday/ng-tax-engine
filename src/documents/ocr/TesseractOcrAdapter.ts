import * as path from "path";
import { createWorker, Worker } from "tesseract.js";
import { OcrAdapter, OcrResult } from "./OcrAdapter";
import { extractFieldsFromText } from "./fieldExtraction";

/**
 * Bundled under version control (see .gitignore — only the compressed `*.traineddata.gz`
 * is tracked, never the decompressed `*.traineddata`) so that a fresh production deploy
 * never needs to reach the jsdelivr CDN tesseract.js defaults to. `langPath` pointing at a
 * real local directory (not a URL) makes tesseract.js's worker-script read this file
 * directly instead of fetching — see node_modules/tesseract.js/src/worker-script/index.js.
 */
const BUNDLED_LANG_PATH = path.join(process.cwd(), "assets", "ocr");

export class OcrEngineUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`OCR engine failed to initialize: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "OcrEngineUnavailableError";
  }
}

/**
 * Real, offline OCR via tesseract.js (WASM Tesseract build — no external API/credentials
 * required, confirmed working in this environment: a synthetic test image with
 * "INVOICE NO: INV-1234" / "TOTAL: 15000.00" round-tripped through createWorker().recognize()
 * byte-for-byte correctly during development of this module).
 *
 * The worker is expensive to spin up (loads the WASM engine + language model), so one
 * instance is reused across calls rather than created per document.
 */
export class TesseractOcrAdapter implements OcrAdapter {
  readonly engineName = "tesseract.js (eng)";
  private workerPromise: Promise<Worker> | null = null;

  constructor(private readonly langPath: string = BUNDLED_LANG_PATH) {}

  private async getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      // tesseract.js only settles its own returned promise via the "load" IPC action, not
      // "loadLanguage" — a missing/corrupt bundled language file rejects the latter and
      // would otherwise hang forever. `errorHandler` is the one hook that fires for every
      // failed worker-script action, so it's used here to drive an explicit rejection
      // instead of relying on createWorker()'s promise to ever settle.
      this.workerPromise = new Promise<Worker>((resolve, reject) => {
        createWorker("eng", undefined, {
          langPath: this.langPath,
          cacheMethod: "none",
          errorHandler: (err: unknown) => reject(new OcrEngineUnavailableError(err)),
        })
          .then(resolve)
          .catch((err: unknown) => reject(new OcrEngineUnavailableError(err)));
      }).catch((err) => {
        this.workerPromise = null;
        throw err;
      });
    }
    return this.workerPromise;
  }

  async extract(imageBuffer: Buffer): Promise<OcrResult> {
    const worker = await this.getWorker();
    const { data } = await worker.recognize(imageBuffer);
    const { fields, confidence } = extractFieldsFromText(data.text);

    return {
      rawText: data.text,
      fields,
      fieldConfidence: confidence,
      engineUsed: this.engineName,
    };
  }

  async terminate(): Promise<void> {
    if (this.workerPromise) {
      const worker = await this.workerPromise;
      await worker.terminate();
      this.workerPromise = null;
    }
  }
}
