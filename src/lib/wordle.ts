// The rules, in one place. Pure functions only.
import { WORDS } from './words';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Wordle #0 was 2021-06-19. */
export const LAUNCH = Date.UTC(2021, 5, 19);

/** g = right spot, y = in the word, b = not in the word. */
export type Color = 'g' | 'y' | 'b';

/** Score for a miss (shown as X/6). Sorting by score puts it last. */
export const MISS = 7;

export function puzzleDate(n: number): string {
  return new Date(LAUNCH + n * DAY).toISOString().slice(0, 10);
}

/** The puzzle someone on this calendar date is playing. */
export function puzzleNumber(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - LAUNCH) / DAY);
}

// A puzzle is playable from the moment its date starts anywhere (UTC+14) until
// it ends everywhere (UTC-12): 50 hours, closing 12:00 UTC the next day.
export function opensAt(n: number): number {
  return LAUNCH + n * DAY - 14 * HOUR;
}

export function closesAt(n: number): number {
  return LAUNCH + n * DAY + 36 * HOUR;
}

export function isOpen(n: number, now = Date.now()): boolean {
  return now >= opensAt(n) && now < closesAt(n);
}

export function isClosed(n: number, now = Date.now()): boolean {
  return now >= closesAt(n);
}

/**
 * The puzzle for the visitor's own calendar date, from their IANA time zone
 * (a cookie the page sets). Falls back to UTC.
 */
export function localToday(timeZone: string | undefined, now = Date.now()): number {
  try {
    if (timeZone) {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
      return puzzleNumber(date);
    }
  } catch {
    // Unknown time zone: fall through to UTC.
  }
  return Math.floor((now - LAUNCH) / DAY);
}

/** The two or three puzzles open right now, newest first. */
export function openPuzzles(now = Date.now()): number[] {
  const today = Math.floor((now - LAUNCH) / DAY);
  return [today + 1, today, today - 1].filter((n) => isOpen(n, now));
}

/** Is this one of the ~15k words Wordle accepts as a guess? */
export function isWord(word: string): boolean {
  let lo = 0;
  let hi = WORDS.length / 5 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = WORDS.slice(mid * 5, mid * 5 + 5);
    if (w === word) return true;
    if (w < word) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

/** Tile colors for one guess, with Wordle's duplicate-letter handling. */
export function colorsFor(guess: string, answer: string): Color[] {
  const out: Color[] = Array(5).fill('b');
  const left: Record<string, number> = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) out[i] = 'g';
    else left[answer[i]] = (left[answer[i]] ?? 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (out[i] === 'g') continue;
    if (left[guess[i]]) {
      out[i] = 'y';
      left[guess[i]]--;
    }
  }
  return out;
}

/**
 * Hard mode, read off the guesses: every guess keeps each green in place and
 * reuses every revealed letter (as many times as it was revealed).
 */
export function playedHard(guesses: string[], answer: string): boolean {
  for (let j = 0; j < guesses.length - 1; j++) {
    const hint = colorsFor(guesses[j], answer);
    const need: Record<string, number> = {};
    hint.forEach((c, i) => {
      if (c !== 'b') need[guesses[j][i]] = (need[guesses[j][i]] ?? 0) + 1;
    });
    for (let k = j + 1; k < guesses.length; k++) {
      const g = guesses[k];
      if (hint.some((c, i) => c === 'g' && g[i] !== guesses[j][i])) return false;
      for (const [letter, count] of Object.entries(need)) {
        if (g.split(letter).length - 1 < count) return false;
      }
    }
  }
  return true;
}

export interface Checked {
  guesses: string[];
  colors: Color[][];
  score: number;
  hard: boolean;
}

/**
 * Checks a submission against the answer. Errors are phrased so they never
 * give away more than playing the real game would.
 */
export function checkGuesses(
  raw: string[],
  answer: string,
): { ok: true; value: Checked } | { ok: false; error: string } {
  const guesses = raw.map((g) => g.trim().toLowerCase()).filter(Boolean);
  if (guesses.length === 0) return { ok: false, error: 'Type at least one guess.' };
  if (guesses.length > 6) return { ok: false, error: 'Wordle only gives you six guesses.' };

  for (const [i, g] of guesses.entries()) {
    if (g.includes('?')) return { ok: false, error: `Some letters in row ${i + 1} are missing. Tap it and type the word.` };
    if (!/^[a-z]{5}$/.test(g)) return { ok: false, error: `"${g}" isn't five letters.` };
    if (g !== answer && !isWord(g)) return { ok: false, error: `"${g.toUpperCase()}" isn't in the word list.` };
  }

  const solvedAt = guesses.indexOf(answer);
  if (solvedAt !== -1 && solvedAt < guesses.length - 1) {
    return { ok: false, error: `You solved it on guess ${solvedAt + 1}; remove the rows after it.` };
  }
  if (solvedAt === -1 && guesses.length < 6) {
    return { ok: false, error: 'Your last guess has to be the answer, or fill all six rows.' };
  }

  return {
    ok: true,
    value: {
      guesses,
      colors: guesses.map((g) => colorsFor(g, answer)),
      score: solvedAt === -1 ? MISS : solvedAt + 1,
      hard: playedHard(guesses, answer),
    },
  };
}

/**
 * Fixes OCR misreads using the colors read from the screenshot, which are
 * exact. A row whose letters don't produce its screenshot colors is swapped
 * for the one word (within two letters of what was read) that does. Unknown
 * letters come in as '?'. Rows without colors (typed by hand) pass through.
 *
 * Kept to two letters so a made-up screenshot can't fish the answer out.
 */
export function reconcile(
  raw: string[],
  seen: string[],
  answer: string,
): { ok: true; guesses: string[] } | { ok: false; row: number } {
  if (seen.length !== raw.length) return { ok: true, guesses: raw };
  const guesses = raw.map((g) => g.trim().toLowerCase());

  for (let i = 0; i < guesses.length; i++) {
    const want = seen[i];
    const read = guesses[i];
    if (!/^[gyb]{5}$/.test(want) || read.length !== 5) continue;
    if (/^[a-z]{5}$/.test(read) && colorsFor(read, answer).join('') === want && (read === answer || isWord(read))) {
      continue;
    }

    let best: string[] = [];
    let bestD = 3;
    const consider = (w: string) => {
      let d = 0;
      for (let k = 0; k < 5 && d < 3; k++) if (w[k] !== read[k]) d++;
      if (d > bestD || d > 2 || colorsFor(w, answer).join('') !== want) return;
      if (d < bestD) {
        bestD = d;
        best = [w];
      } else if (!best.includes(w)) best.push(w);
    };
    consider(answer);
    for (let k = 0; k < WORDS.length; k += 5) consider(WORDS.slice(k, k + 5));

    if (best.length !== 1) {
      return { ok: false, row: i + 1 };
    }
    guesses[i] = best[0];
  }
  return { ok: true, guesses };
}

export function scoreLabel(score: number): string {
  return score === MISS ? 'X/6' : `${score}/6`;
}

/** "Oct 11" style, in UTC so it matches the puzzle's own date. */
export function shortDate(n: number): string {
  return new Date(LAUNCH + n * DAY).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "5h 12m" until a timestamp. */
export function timeUntil(ts: number, now = Date.now()): string {
  const mins = Math.max(0, Math.round((ts - now) / 60_000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}
