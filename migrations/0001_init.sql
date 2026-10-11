-- Times are Unix milliseconds. Colors are one letter per tile:
-- g = right spot, y = in the word, b = not in the word.

CREATE TABLE users (
  discord_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  avatar     TEXT,
  timezone   TEXT,
  created_at INTEGER NOT NULL
);

-- One row per Wordle, created the first time someone submits for it.
CREATE TABLE puzzles (
  number    INTEGER PRIMARY KEY,
  date      TEXT NOT NULL,        -- YYYY-MM-DD
  answer    TEXT NOT NULL,
  closed_at INTEGER NOT NULL      -- 12:00 UTC the day after `date`
);

CREATE TABLE submissions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users (discord_id),
  puzzle_no    INTEGER NOT NULL REFERENCES puzzles (number),
  guesses      TEXT NOT NULL,     -- "crane,stomp,..."
  colors       TEXT NOT NULL,     -- "bybbb,gbbyb,..."
  score        INTEGER NOT NULL,  -- 1-6, or 7 for a miss
  hard_mode    INTEGER NOT NULL,  -- worked out from the guesses
  submitted_at INTEGER NOT NULL,
  UNIQUE (user_id, puzzle_no)     -- one go per puzzle, no do-overs
);

CREATE INDEX submissions_puzzle ON submissions (puzzle_no);
