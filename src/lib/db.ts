// Every D1 query the site makes.
import { closesAt, puzzleDate } from './wordle';

export interface User {
  discord_id: string;
  name: string;
  avatar: string | null;
}

export interface Puzzle {
  number: number;
  date: string;
  answer: string;
  closed_at: number;
}

export interface Submission {
  user_id: string;
  name: string;
  avatar: string | null;
  puzzle_no: number;
  guesses: string;
  colors: string;
  score: number;
  hard_mode: number;
  submitted_at: number;
}

export async function upsertUser(db: D1Database, u: User): Promise<void> {
  await db
    .prepare(
      `INSERT INTO users (discord_id, name, avatar, created_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT (discord_id) DO UPDATE SET name = ?2, avatar = ?3`,
    )
    .bind(u.discord_id, u.name, u.avatar, Date.now())
    .run();
}

export async function getUser(db: D1Database, id: string): Promise<User | null> {
  return db.prepare('SELECT discord_id, name, avatar FROM users WHERE discord_id = ?').bind(id).first<User>();
}

/**
 * The puzzle row, fetching the answer from the NYT on first use. Returns null
 * if the NYT doesn't have that date yet.
 */
export async function getPuzzle(db: D1Database, n: number): Promise<Puzzle | null> {
  const row = await db.prepare('SELECT * FROM puzzles WHERE number = ?').bind(n).first<Puzzle>();
  if (row) return row;

  const date = puzzleDate(n);
  const res = await fetch(`https://www.nytimes.com/svc/wordle/v2/${date}.json`);
  if (!res.ok) return null;
  const data = (await res.json()) as { solution?: string; days_since_launch?: number };
  const answer = data.solution?.toLowerCase() ?? '';
  if (data.days_since_launch !== n || !/^[a-z]{5}$/.test(answer)) return null;

  const puzzle: Puzzle = { number: n, date, answer, closed_at: closesAt(n) };
  await db
    .prepare('INSERT OR IGNORE INTO puzzles (number, date, answer, closed_at) VALUES (?, ?, ?, ?)')
    .bind(n, date, answer, puzzle.closed_at)
    .run();
  return puzzle;
}

/** False if this user already has a result for this puzzle. */
export async function addSubmission(
  db: D1Database,
  s: Omit<Submission, 'name' | 'avatar'>,
): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO submissions
         (user_id, puzzle_no, guesses, colors, score, hard_mode, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(s.user_id, s.puzzle_no, s.guesses, s.colors, s.score, s.hard_mode, s.submitted_at)
    .run();
  return res.meta.changes > 0;
}

const SUBMISSION_COLS = `s.user_id, u.name, u.avatar, s.puzzle_no, s.guesses, s.colors,
  s.score, s.hard_mode, s.submitted_at`;

/** Results for some puzzles, best score first, then earliest. */
export async function submissionsFor(db: D1Database, puzzles: number[]): Promise<Submission[]> {
  if (puzzles.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT ${SUBMISSION_COLS} FROM submissions s JOIN users u ON u.discord_id = s.user_id
       WHERE s.puzzle_no IN (${puzzles.map(() => '?').join(',')})
       ORDER BY s.score, s.submitted_at`,
    )
    .bind(...puzzles)
    .all<Submission>();
  return results;
}

export async function submissionsByUser(db: D1Database, userId: string): Promise<Submission[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SUBMISSION_COLS} FROM submissions s JOIN users u ON u.discord_id = s.user_id
       WHERE s.user_id = ? ORDER BY s.puzzle_no DESC`,
    )
    .bind(userId)
    .all<Submission>();
  return results;
}

/** The puzzles this user has already played, among the given ones. */
export async function playedAmong(db: D1Database, userId: string, puzzles: number[]): Promise<Set<number>> {
  if (puzzles.length === 0) return new Set();
  const { results } = await db
    .prepare(
      `SELECT puzzle_no FROM submissions WHERE user_id = ?
       AND puzzle_no IN (${puzzles.map(() => '?').join(',')})`,
    )
    .bind(userId, ...puzzles)
    .all<{ puzzle_no: number }>();
  return new Set(results.map((r) => r.puzzle_no));
}

export function avatarUrl(u: Pick<User, 'discord_id' | 'avatar'>, size = 64): string {
  if (!u.avatar) {
    // Discord's default avatars, picked the way the client picks them.
    return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.discord_id) >> 22n) % 6}.png`;
  }
  return `https://cdn.discordapp.com/avatars/${u.discord_id}/${u.avatar}.png?size=${size}`;
}

export interface Tally extends User {
  played: number;
  wins: number;
  total: number; // sum of scores, a miss counting 7
}

/** Per-player totals over puzzles numbered `from` and up (all time if omitted). */
export async function tallies(db: D1Database, from = 0): Promise<Tally[]> {
  const { results } = await db
    .prepare(
      `SELECT u.discord_id, u.name, u.avatar, COUNT(*) AS played,
              SUM(s.score <= 6) AS wins, SUM(s.score) AS total
       FROM submissions s JOIN users u ON u.discord_id = s.user_id
       WHERE s.puzzle_no >= ? GROUP BY u.discord_id`,
    )
    .bind(from)
    .all<Tally>();
  return results;
}
