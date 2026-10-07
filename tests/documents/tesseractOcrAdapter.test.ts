import * as path from "path";
import { Jimp, loadFont } from "jimp";
// @ts-ignore — jimp ships its built-in bitmap fonts under this subpath without its own .d.ts
import * as fonts from "jimp/fonts";
import { TesseractOcrAdapter, OcrEngineUnavailableError } from "../../src/documents/ocr/TesseractOcrAdapter";

/**
 * Real, end-to-end OCR test: renders an actual PNG with text (via Jimp, pure JS, no
 * native canvas dependency) and runs it through the genuine tesseract.js pipeline — no
 * mocking of the OCR engine itself. This is the same approach used to manually confirm
 * tesseract.js works in this environment before TesseractOcrAdapter was written.
 * Slow (WASM engine + language model load) — generous timeout, one shared worker.
 */
describe("TesseractOcrAdapter (real OCR engine, no mocks)", () => {
  jest.setTimeout(60_000);
  const adapter = new TesseractOcrAdapter();

  afterAll(async () => {
    await adapter.terminate();
  });

  async function renderTextImage(lines: string[]): Promise<Buffer> {
    const image = new Jimp({ width: 600, height: 60 * lines.length + 20, color: 0xffffffff });
    const font = await loadFont(fonts.SANS_32_BLACK);
    lines.forEach((line, i) => image.print({ font, x: 10, y: 10 + i * 60, text: line }));
    return image.getBuffer("image/png");
  }

  test("recognizes rendered text and extracts invoice fields from the OCR output", async () => {
    const buffer = await renderTextImage(["INVOICE NO: INV-1234", "TOTAL: 15000.00"]);
    const result = await adapter.extract(buffer);

    expect(result.rawText).toMatch(/INVOICE/i);
    expect(result.rawText).toMatch(/1234/);
    expect(result.fields.invoiceNumber).toBe("INV-1234");
    expect(result.fields.totalAmountNgn).toBe(15000);
    expect(result.engineUsed).toMatch(/tesseract/i);
  });

  test("an image with no document-shaped text yields nulls rather than fabricated fields", async () => {
    const buffer = await renderTextImage(["HELLO WORLD"]);
    const result = await adapter.extract(buffer);

    expect(result.fields.invoiceNumber).toBeNull();
    expect(result.fields.totalAmountNgn).toBeNull();
  });
});

/**
 * Mandate §20: "Test OCR failure scenarios." The engine must fail loudly and cleanly —
 * never silently fall back to an uncontrolled CDN fetch — when its bundled language
 * data isn't where it's expected. Pointing at a nonexistent local directory forces
 * exactly the failure a broken/incomplete deploy would hit.
 */
describe("TesseractOcrAdapter — OCR failure scenario (mandate §20)", () => {
  jest.setTimeout(30_000);

  test("fails with a clear OcrEngineUnavailableError instead of hanging or silently reaching the network", async () => {
    const brokenAdapter = new TesseractOcrAdapter(path.join(__dirname, "no-such-bundled-lang-dir"));

    await expect(brokenAdapter.extract(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).rejects.toThrow(OcrEngineUnavailableError);

    await brokenAdapter.terminate();
  });
});
