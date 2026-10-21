# Questlog

RPG-style life tracker for one person. App: https://m-a-r-k-o-r.github.io/questlog/ (GitHub Pages serves `docs/`). Data: the user's Supabase project, table `public.docs` (user_id, collection, id, data jsonb), one JSON document per row, private to the user via RLS.

## Reading and writing data

Use `node scripts/questlog.mjs` (settings in `~/.questlog/env`): `dump [collection]`, `get`, `set <coll> <id> <json|@file|->`, `update` (top-level merge), `delete`, `import <file>`, `push <title> <body> [url]`, `new-id`. Never edit rows in a way that drops fields you didn't mean to change: read, modify, `set` back.

Collections (local dates `YYYY-MM-DD`, timestamps ISO):
- `quests`: `{title, realm, due, priority 1-3, status active|done|archived, createdAt, doneAt, archivedAt, notes, drainBanked?, chapters:[{title, objectives:[{id, title, est (min), xp, due, done, doneAt, scheduled (ISO), steps:[{t, done}]}]}]}`
- `chronicle`: good deeds and journal `{kind reach|gratitude|kindness|help|gift|savor, text, at, date, xp, allyId?, allyName?}`
- `allies`: `{name, relation, every (days), last, birthday, createdAt}`. With no `last`, the reach-out clock starts at `createdAt`. Birthdays with an unknown year use 2000.
- `inbox`: `{text, realm, at, question?, answer?}`
- `rewards` `{title, cost, example?}`, `purchases` `{rewardId, title, cost, at}`
- `meta/today` `{date, note, focus[], deed{kind,text,allyId?}, reflection}`, `meta/week` `{weekOf, summary, highlights[]}`, `meta/pings` (sent markers, owned by the ping timer)
- `devices`: push subscriptions, written by the app

Realms: work, job, personal, creative, learning, health, business, other.

## Breaking a task into a quest

Pick detail to fit the size: tiny = 1 chapter of 1-4 objectives; medium = 1-2 chapters, 3-8 objectives; big = 3-6 phase chapters of 2-6 objectives. Objectives are verb-first, 15-120 min, `xp` 10/15/25/40 for ~15/30/60/120 min, unique 8+ char `id`, `done:false`. Add `steps` only where useful. Spread objective due dates before a named deadline. Ask clarifying questions for big or fuzzy items before writing.

## Game rules (keep in sync with `docs/index.html` and `scripts/pings.mjs`)

Quest bonus 25+25×priority XP. Gold = half of XP. Overdue objectives drain 5 XP/day (cap 50), quests 10/day (cap 100); rescheduling banks drain into `drainBanked`. Streak = days with any objective done or chronicle entry.

## Pings and check-ins

`.github/workflows/pings.yml` is started every 10 min by Supabase pg_cron (`supabase/timer.sql`, job `questlog-pings`, GitHub token in Supabase Vault as `questlog_github_token`); its own `schedule` trigger is only a backup. It sends: morning ping 7:40-11:00 (weekends only if something is due today/tomorrow or overdue), evening 8:30-11:45 PM, once per day each, America/New_York. Claude's scheduled check-ins on the Mac write `meta/today`, plan inbox items, and run the Sunday review; they propose calendar blocks and create events only after the user approves.
