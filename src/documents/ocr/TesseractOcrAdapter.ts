import { createWorker, Worker } from "tesseract.js";
import { OcrAdapter, OcrResult } from "./OcrAdapter";
import { extractFieldsFromText } from "./fieldExtraction";

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

  private async getWorker(): Promise<Worker> {
    if (!this.workerPromise) {
      this.workerPromise = createWorker("eng");
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
