// Results as Discord messages, to paste into the server by hand. Each row's
// word follows its squares as ||`CRANE`||: a spoiler, so nobody sees words by
// accident, and code, so the letters line up.
import type { Submission } from './db';
import { scoreLabel, shortDate } from './wordle';

const EMOJI: Record<string, string> = { g: '🟩', y: '🟨', b: '⬛' };

function rows(s: Submission): string[] {
  const words = s.guesses.split(',');
  return s.colors.split(',').map((row, i) => `${[...row].map((c) => EMOJI[c]).join('')} ||\`${words[i].toUpperCase()}\`||`);
}

/** One player's result, laid out like Wordle's own share text. */
export function shareMine(s: Submission, origin: string): string {
  const head = `Wordle ${s.puzzle_no.toLocaleString('en-US')} ${scoreLabel(s.score)}${s.hard_mode ? '*' : ''}`;
  return [head, '', ...rows(s), '', `<${origin}/>`].join('\n');
}

/** Everyone's results for one puzzle, for whoever posts the day's summary. */
export function shareText(opts: {
  number: number;
  players: Submission[];
  answer: string | null;
  origin: string;
}): string {
  const { number, players, answer, origin } = opts;
  const lines = [`**Wordle ${number.toLocaleString('en-US')}** (${shortDate(number)}) · ${players.length} played`];
  for (const s of players) {
    lines.push('', `${s.name} ${scoreLabel(s.score)}${s.hard_mode ? '*' : ''}`, ...rows(s));
  }
  lines.push('');
  if (answer) {
    lines.push(`Answer: ||\`${answer.toUpperCase()}\`||`, `<${origin}/puzzle/${number}>`);
  } else {
    lines.push(`Submit yours: <${origin}/>`);
  }
  return lines.join('\n');
}
