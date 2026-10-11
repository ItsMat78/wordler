# Wordler

A Wordle leaderboard for a group of friends.

You play Wordle like normal on the New York Times site or app. Then you drop a
screenshot of your finished board onto Wordler, and it adds your result to the
leaderboard. That's it.

**Live site:** https://wordler-dap.pages.dev

---

## What you can do

- **Upload a screenshot** of your finished Wordle. Tap the button, drop the
  image on the page, or paste it with Ctrl+V. Wordler reads the colors and
  letters, shows you the board, and you press **Save**.
- **Type your guesses** instead, if you'd rather.
- **See the leaderboard.** Today's puzzle is ranked by number of guesses. There
  are also **Week**, **Month** and **All time** boards.
- **Peek at friends' guesses.** Their colored squares are always visible. To see
  the actual words, tap (or hover over) their name. It asks "Show guesses?"
  first, so nobody gets spoiled by accident.
- **Copy for Discord.** After you save, one button copies your result in the
  usual Wordle style, with each word hidden behind a Discord spoiler:

  ```
  Wordle 1,940 3/6

  ⬛⬛🟨⬛⬛ ||`SLATE`||
  🟨⬛⬛⬛🟨 ||`ADIEU`||
  🟩🟩🟩🟩🟩 ||`UNCAP`||
  ```

- **Check your profile.** Games played, win rate, average guesses, streaks, a
  calendar of the last 10 weeks, your favorite opening word, and your history.

You log in with Discord. Nothing gets added to anyone's Discord server: no bots,
no webhooks. Sharing results is just copy and paste.

---

## How a few things work

### Reading screenshots

1. Wordler finds the board in your picture and reads each tile's color straight
   from the pixels. Wordle's colors never change, so this part is exact.
2. It reads the letters with free text recognition (Tesseract) that runs in your
   browser. Your screenshot never gets uploaded anywhere.
3. When you save, the server double-checks every row. If a letter was misread,
   it picks the one real word that gives exactly the colors in your screenshot.
   So a misread "WOOYY" becomes "WOOZY".
4. If you pasted a board on the wrong day's tab, Wordler notices and saves it to
   the right puzzle.

Your web browser never learns the day's answer. Only the server checks guesses.

### The rankings

- **Today's board:** fewest guesses wins. Ties share a place.
- **Week, Month, All time:** ranked by a **rating**. It's your average number of
  guesses (a miss counts as 7), adjusted for how many games you've played.
  Everyone starts out counted as average, and moves toward their real average
  the more they play. That way one lucky 2/6 can't put a new player on top.
  Lower is better.
- To be ranked you need **3 games** in the week, **5** in the month, or **7**
  overall. Until then you're listed under "Not ranked yet".

### Days and time zones

- Every Wordle has a number (like #1,940), and that number is the same
  everywhere. Wordler uses numbers instead of "today" and "yesterday", so
  friends in different countries are always talking about the same puzzle.
- Each puzzle stays open for 50 hours, from when it starts anywhere in the world
  until it ends everywhere: 12:00 UTC the day after its date. That gives people
  in every time zone a fair chance.
- The site opens on the puzzle for your own date, the same one the NYT gives you.
- Week and month boards follow the UTC date, so everyone sees the same boards.
  Weeks run Monday to Sunday.

---

## Built with

- [Astro](https://astro.build), the same framework as
  [shreyashrai.com](https://shreyashrai.com), whose fonts it borrows
- [Cloudflare Pages](https://pages.cloudflare.com) for hosting
- [Cloudflare D1](https://developers.cloudflare.com/d1/), a small hosted database
- [Tesseract.js](https://tesseract.projectnaptha.com) for reading letters
- Discord login (just your name and avatar)

It all runs on Cloudflare's free plan.

---

## Run it on your computer

You need [Node.js](https://nodejs.org) (version 20 or newer).

1. Install everything:
   ```sh
   npm install
   ```
2. Make your settings file:
   ```sh
   cp .dev.vars.example .dev.vars
   ```
   Open `.dev.vars` and fill it in:
   - `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`: from the
     [Discord Developer Portal](https://discord.com/developers/applications).
     Make an app, open **OAuth2**, and add
     `http://localhost:4321/auth/callback` as a redirect.
   - `SESSION_SECRET`: any long random text. This makes one:
     `node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"`
   - `ALLOWED_DISCORD_IDS` (optional): Discord user IDs, separated by commas,
     if you only want certain people to log in.
3. Set up the local database:
   ```sh
   npm run db:migrate:local
   ```
4. Start it:
   ```sh
   npm run dev
   ```
   Open http://localhost:4321.

---

## Putting changes live

```sh
npm run deploy
```

If you changed the database tables (a new file in `migrations/`), run this
first:

```sh
npm run db:migrate:remote
```

### Setting it up from scratch on a new Cloudflare account

1. `npx wrangler login`
2. `npx wrangler d1 create wordler`, then paste the `database_id` it prints
   into `wrangler.toml`.
3. `npm run db:migrate:remote`
4. `npx wrangler pages project create wordler --production-branch main`
5. Add the secrets (each one asks you to paste a value):
   ```sh
   npx wrangler pages secret put DISCORD_CLIENT_ID --project-name wordler
   npx wrangler pages secret put DISCORD_CLIENT_SECRET --project-name wordler
   npx wrangler pages secret put SESSION_SECRET --project-name wordler
   ```
6. `npm run deploy`
7. In the Discord Developer Portal, add `https://<your-site>/auth/callback` as a
   redirect.

---

## Where things are

| File or folder | What's in it |
| --- | --- |
| `src/pages/index.astro` | The home page: upload on the left, leaderboard on the right |
| `src/pages/u/[id].astro` | Player profiles |
| `src/pages/puzzle/[no].astro` | One puzzle's results (linked from profiles) |
| `src/lib/wordle.ts` | The rules: puzzle numbers, open times, colors, hard mode, checking guesses |
| `src/lib/screenshot.ts` | Finding the board in a screenshot |
| `src/scripts/ocr.ts` | Reading the letters in the browser |
| `src/lib/rank.ts` | How the week, month and all-time rankings are worked out |
| `src/lib/share.ts` | The "Copy for Discord" text |
| `src/lib/db.ts` | Everything that talks to the database |
| `migrations/` | The database tables |
| `src/styles/global.css` | All the styling |

---

## Not built yet

- Skill and luck scores for each game (how good your guesses were, beyond just
  the count).
