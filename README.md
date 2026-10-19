# Questlog

Your life as an RPG: quests broken into steps, XP and gold for getting things done and for good deeds, allies to stay close to, a gratitude journal and a reward shop. Works on the laptop and as an iPhone Home Screen app.

**App:** https://m-a-r-k-o-r.github.io/questlog/

## How it fits together

- `docs/` is the app, served by GitHub Pages. Data lives in your own Supabase project, private to your sign-in.
- `.github/workflows/pings.yml` sends the 7:40 AM and 8:30 PM pings (`scripts/pings.mjs`), even when the Mac is off. Weekend mornings stay quiet unless something is due. Supabase's scheduler (`supabase/timer.sql`) starts it every 10 minutes, because GitHub's own schedule skips runs on new repos.
- `scripts/questlog.mjs` is how Claude's check-ins read and write your quests from the Mac.

## Setup

Run once, from this folder:

```bash
./setup.sh
```

It walks you through creating the Supabase project, your sign-in, and the secrets the ping timer needs. Settings are saved to `~/.questlog/env` (private) and GitHub secrets.

Then turn on the reliable timer (re-run yearly when GitHub emails that the token expires):

```bash
./setup-timer.sh
```

## Handy commands

```bash
node scripts/questlog.mjs dump quests
node scripts/pings.mjs --mode morning --dry-run
gh workflow run pings.yml -f mode=test
```

Regenerate the icons with `python3 scripts/make_icons.py`.
