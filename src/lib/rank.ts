// Who's best at Wordle over a stretch of days.
//
// The measure is a rating: average guesses (a miss counts as 7), adjusted for
// how many games someone has played. Every player starts with PRIOR games'
// worth of the group average and moves toward their own average as they play,
// so someone steady over thirty games beats someone slightly better over
// three. On top of that, a board only ranks players with at least `minGames`
// games in its stretch; the rest are listed as "not ranked yet". Lower is better.
import type { Tally } from './db';

export const PRIOR = 7;

export interface Standing extends Tally {
  average: number; // plain average guesses
  rating: number; // adjusted average, the ranking key
  place: number; // ties share a place; 0 when not ranked yet
}

export function rank(tallies: Tally[], minGames: number): { ranked: Standing[]; pending: Standing[] } {
  const games = tallies.reduce((t, r) => t + r.played, 0);
  if (!games) return { ranked: [], pending: [] };
  const mean = tallies.reduce((t, r) => t + r.total, 0) / games;

  const rows = tallies
    .map((r) => ({
      ...r,
      average: r.total / r.played,
      rating: (r.total + PRIOR * mean) / (r.played + PRIOR),
      place: 0,
    }))
    .sort((a, b) => a.rating - b.rating || b.played - a.played);

  const ranked = rows.filter((r) => r.played >= minGames);
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    r.place = prev && prev.rating.toFixed(2) === r.rating.toFixed(2) ? prev.place : i + 1;
  });
  const pending = rows.filter((r) => r.played < minGames).sort((a, b) => b.played - a.played);
  return { ranked, pending };
}
