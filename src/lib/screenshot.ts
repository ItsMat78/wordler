// Finds a Wordle board in a screenshot. Pure pixel work, no DOM, so it runs in
// the browser and in tests alike.
//
// Tile colors come straight from the pixels (Wordle's palettes are fixed), so
// they're exact. Letters are left to OCR, using the clean black-on-white strips
// built here; the server then fixes misread letters using the colors.

export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray; // RGBA
}

export type TileColor = 'g' | 'y' | 'b';

export interface Tile {
  x: number;
  y: number;
  w: number;
  h: number;
  color: TileColor;
}

// Light, dark and high-contrast Wordle, on the web and in the apps.
const PALETTE: [number, number, number, TileColor][] = [
  [0x6a, 0xaa, 0x64, 'g'],
  [0x53, 0x8d, 0x4e, 'g'],
  [0xf5, 0x79, 0x3a, 'g'],
  [0xc9, 0xb4, 0x58, 'y'],
  [0xb5, 0x9f, 0x3b, 'y'],
  [0x85, 0xc0, 0xf9, 'y'],
  [0x78, 0x7c, 0x7e, 'b'],
  [0x3a, 0x3a, 0x3c, 'b'],
];
const CODES: TileColor[] = ['g', 'y', 'b'];
const MAX_DIST2 = 40 * 40;

function classify(r: number, g: number, b: number): number {
  let best = 0;
  let bestD = MAX_DIST2;
  for (const [pr, pg, pb, c] of PALETTE) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = CODES.indexOf(c) + 1;
    }
  }
  return best; // 0 = not a tile color
}

/** Filled tiles, top to bottom, five per row; null if no board is found. */
export function findBoard(img: Pixels): Tile[][] | null {
  const { width: W, height: H, data } = img;
  const label = new Uint8Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) label[i] = classify(data[p], data[p + 1], data[p + 2]);

  // Connected blobs of one tile color. A tile is a square ring around its
  // (white) letter, so its blob fills most of its bounding box.
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  const blobs: Tile[] = [];
  for (let start = 0; start < W * H; start++) {
    const c = label[start];
    if (!c || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
    while (top) {
      const i = stack[--top];
      const x = i % W;
      const y = (i - x) / W;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && label[i - 1] === c && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < W - 1 && label[i + 1] === c && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && label[i - W] === c && !seen[i - W]) { seen[i - W] = 1; stack[top++] = i - W; }
      if (y < H - 1 && label[i + W] === c && !seen[i + W]) { seen[i + W] = 1; stack[top++] = i + W; }
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    if (w < 12 || h < 12) continue;
    if (w / h < 0.8 || w / h > 1.25) continue; // keyboard keys are taller than wide
    if (count / (w * h) < 0.45) continue; // empty tiles are just an outline
    blobs.push({ x: minX, y: minY, w, h, color: CODES[c - 1] });
  }
  if (blobs.length < 5) return null;

  // Rows: blobs of the board's tile size sharing a center line, five across,
  // evenly spaced.
  const rows: Tile[][] = [];
  for (const size of [...new Set(blobs.map((b) => b.w))]) {
    const same = blobs.filter((b) => Math.abs(b.w - size) <= size * 0.12 && Math.abs(b.h - size) <= size * 0.12);
    if (same.length < 5) continue;
    same.sort((a, b) => a.y - b.y);
    const groups: Tile[][] = [];
    for (const t of same) {
      const g = groups.find((r) => Math.abs(r[0].y + r[0].h / 2 - (t.y + t.h / 2)) < size * 0.3);
      if (g) g.push(t);
      else groups.push([t]);
    }
    for (const g of groups) {
      if (g.length !== 5) continue;
      g.sort((a, b) => a.x - b.x);
      const steps = g.slice(1).map((t, i) => t.x - g[i].x);
      if (steps.every((s) => s >= size * 0.98 && s <= size * 1.5 && Math.abs(s - steps[0]) <= size * 0.1)) rows.push(g);
    }
    if (rows.length) break;
  }
  if (!rows.length) return null;

  // The board: the longest run of rows stacked at an even pitch with the same
  // columns, top first.
  rows.sort((a, b) => a[0].y - b[0].y);
  let best: Tile[][] = [];
  for (let i = 0; i < rows.length; i++) {
    const run = [rows[i]];
    for (let j = i + 1; j < rows.length; j++) {
      const prev = run[run.length - 1];
      const size = prev[0].w;
      const dy = rows[j][0].y - prev[0].y;
      const aligned = rows[j].every((t, k) => Math.abs(t.x - prev[k].x) <= size * 0.2);
      if (aligned && dy >= size * 0.98 && dy <= size * 1.5) run.push(rows[j]);
      else if (dy > size * 1.5) break;
    }
    if (run.length > best.length) best = run;
  }
  return best.slice(0, 6);
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Letters are white on every tile color, in every Wordle theme.
const isInk = (d: Uint8ClampedArray, p: number) => Math.min(d[p], d[p + 1], d[p + 2]) > 185;

/** The bounding box of a tile's letter, or null for a blank tile. */
function inkBox(img: Pixels, t: Tile): Box | null {
  const inset = Math.round(t.w * 0.08);
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = t.y + inset; y < t.y + t.h - inset; y++) {
    for (let x = t.x + inset; x < t.x + t.w - inset; x++) {
      if (!isInk(img.data, (y * img.width + x) * 4)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/**
 * Letters OCR can't be trusted with, settled from their shape: an I is a lone
 * narrow bar (and OCR tends to drop it from a line). '' means "ask OCR".
 */
export function shapeHints(img: Pixels, row: Tile[]): string[] {
  return row.map((t) => {
    const b = inkBox(img, t);
    if (!b) return '?';
    return (b.x1 - b.x0) / (b.y1 - b.y0) < 0.3 ? 'i' : '';
  });
}

/**
 * Letters as black on white, each cropped to its ink and scaled to the same
 * height, side by side: the clean, even input OCR reads best.
 */
export function letterStrip(img: Pixels, tiles: Tile[], height = 56): Pixels {
  const pad = 28;
  const gap = 22;
  const boxes = tiles.map((t) => inkBox(img, t));
  const widths = boxes.map((b) => (b ? Math.max(4, Math.round(((b.x1 - b.x0) / (b.y1 - b.y0)) * height)) : height / 2));
  const width = pad * 2 + widths.reduce((a, b) => a + b, 0) + gap * (tiles.length - 1);
  const total = height + pad * 2;
  const data = new Uint8ClampedArray(width * total * 4).fill(255);
  let left = pad;
  boxes.forEach((b, k) => {
    if (b) {
      const sw = (b.x1 - b.x0) / widths[k];
      const sh = (b.y1 - b.y0) / height;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < widths[k]; x++) {
          const sx = Math.min(b.x1 - 1, Math.floor(b.x0 + x * sw));
          const sy = Math.min(b.y1 - 1, Math.floor(b.y0 + y * sh));
          if (!isInk(img.data, (sy * img.width + sx) * 4)) continue;
          const o = ((pad + y) * width + left + x) * 4;
          data[o] = data[o + 1] = data[o + 2] = 0;
        }
      }
    }
    left += widths[k] + gap;
  });
  return { width, height: total, data };
}

/** Reads letters from a strip: 'word' for several letters, 'char' for one. */
export type Ocr = (strip: Pixels, mode: 'word' | 'char') => Promise<string>;

export interface ReadRow {
  word: string; // five letters, '?' where unreadable
  colors: string; // "gybbb", exact
}

/**
 * The whole pipeline: find the board, settle the letters shape can settle,
 * OCR the rest a row at a time, and fall back to single letters when a row
 * doesn't come back the right length.
 */
export async function readBoard(img: Pixels, ocr: Ocr, onRow?: (rows: ReadRow[]) => void): Promise<ReadRow[] | null> {
  const board = findBoard(img);
  if (!board) return null;
  const rows: ReadRow[] = board.map((r) => ({ word: '?????', colors: r.map((t) => t.color).join('') }));
  onRow?.(rows);

  for (const [i, row] of board.entries()) {
    const letters = shapeHints(img, row);
    const open = row.filter((_, k) => letters[k] === '');
    if (open.length) {
      let text = (await ocr(letterStrip(img, open), 'word')).toLowerCase().replace(/[^a-z]/g, '');
      if (text.length !== open.length) {
        text = '';
        for (const t of open) text += (await ocr(letterStrip(img, [t]), 'char')).toLowerCase().replace(/[^a-z]/g, '')[0] ?? '?';
      }
      let k = 0;
      for (let j = 0; j < 5; j++) if (letters[j] === '') letters[j] = text[k++] ?? '?';
    }
    rows[i] = { ...rows[i], word: letters.join('') };
    onRow?.([...rows]);
  }
  return rows;
}
