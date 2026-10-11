// Browser glue for reading screenshots: decode the image, then run the shared
// pipeline in src/lib/screenshot.ts with Tesseract as the OCR. Tesseract (about
// 3 MB with its English data) loads from a CDN only when it's first needed,
// and the browser caches it after that.
import { readBoard, type Ocr, type Pixels, type ReadRow } from '../lib/screenshot';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let ocrReady: Promise<Ocr> | null = null;

/** Starts loading OCR early (e.g. when someone reaches for the upload button). */
export function warmOcr(): Promise<Ocr> {
  ocrReady ??= (async () => {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESSERACT;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Could not load the text reader.'));
      document.head.appendChild(s);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const worker = await (window as any).Tesseract.createWorker('eng');
    await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    return async (strip: Pixels, mode: 'word' | 'char') => {
      // 8 = one word, 10 = one character.
      await worker.setParameters({ tessedit_pageseg_mode: mode === 'word' ? '8' : '10' });
      canvas.width = strip.width;
      canvas.height = strip.height;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(strip.data), strip.width, strip.height), 0, 0);
      const { data } = await worker.recognize(canvas);
      return data.text as string;
    };
  })();
  ocrReady.catch(() => (ocrReady = null));
  return ocrReady;
}

/** Pixels of an image file, scaled down so big phone screenshots stay quick. */
async function pixels(file: Blob, maxWidth = 1000): Promise<Pixels> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/**
 * Reads a screenshot. Calls `onRows` as soon as the board is found (colors
 * only) and again as each row's letters come in. Resolves null if there's no
 * Wordle board in the picture.
 */
export async function readScreenshot(file: Blob, onRows: (rows: ReadRow[]) => void): Promise<ReadRow[] | null> {
  const img = await pixels(file);
  const ocr = warmOcr();
  return readBoard(img, async (strip, mode) => (await ocr)(strip, mode), onRows);
}
