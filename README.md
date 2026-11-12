# Roster Management App

Manage the Chicago Bears depth chart and full roster (active 53, practice squad, reserve lists), with every player enriched by PFF Pro data: grades and league rank, snaps, bio, college and draft.

## How it works

| Piece | What it is |
|---|---|
| `data/bears-roster.json` | **The roster you manage.** Players, statuses, Ourlads acquisition codes, depth chart and coaching staff. First transcribed from Ourlads; edited through the app from then on. Committed to git, so every change has history. |
| `data/pff-cache/` | PFF data from the last sync (git-ignored, since PFF data is licensed). |
| `server/` | Express API. `GET/PUT /api/roster` reads and saves the roster; `POST /api/pff/sync` refreshes PFF. Serves the built front end. |
| `src/` | React front end (Vite). |

PFF is not the source of truth for roster status, because its API has no practice-squad or reserve-list data. Your roster file decides who is on the team and where they sit on the depth chart; PFF adds grades and stats to each player.

## Setup

Needs Node 22+.

```sh
npm install
cp .env.example .env    # add your PFF Pro API key (PFF_API_KEY)
npm run sync:pff        # pull PFF data into data/pff-cache/
npm run dev             # app on http://localhost:5173, API on :3001
```

For a production-style run: `npm run build && npm start`, then open http://localhost:3001.

In the Claude Code cloud environment no `.env` is needed: the network proxy adds the saved PFF key to requests to `api.pff.com`.

## Using the app

- **Depth chart**: offense, defense and special teams, plus the practice squad and reserves. Player colours follow Ourlads: returning (blue), new for 2026 (orange), 2026 draft pick (magenta), 2026 undrafted rookie (teal). Each player shows their PFF grade, coloured by PFF's grade bands.
  Turn on **Edit depth chart** to move players up or down (◀ ▶), take them off a slot (✕), or add them to a slot.
- **Full roster**: every player in one sortable table, filtered by active, practice squad or reserves, and by position or name.
- **PFF comparison**: your depth chart next to PFF's, position by position. It flags different starters, players PFF lists at a position where you don't (and where you have them), backups who outgrade the starter by 5+ points, and PFF depth-chart players who aren't on your active roster. Your slot names map to PFF's (RB→HB, NB→SCB, TE→TE-L/TE-R, LDE→DLE…). PFF-only slots such as SLB appear at the bottom.
- **Player panel**: click any player for their profile, every PFF team report they appear in (passing, receiving, pass rush, coverage, returns and so on; key stats first, with "show all" for the full set), and an edit form for status, jersey, position, acquisition, availability and notes. Moving a player from active to a reserve list takes them off the depth chart.
- **Grades: This season / NFL career / NFL + college**: switch the grade shown everywhere (depth chart, roster, comparison). Career grades are the snap-weighted average of PFF's season grades, Σ(grade × snaps) ÷ Σ snaps, shown with a **C** (NFL) or **C+** (NFL + college) mark. "NFL + college" gives a grade to rookies and practice-squad players with little NFL time. Override one player from the small toggle in the roster table's grade column, or from the player panel. Overrides are saved in your browser.
- **Career**: the player panel lists every NFL and college season PFF has (team, snaps, grade, position stats), with career totals. Players are graded on their unit's overall grade (offense or defense); kickers, punters and long snappers on their own grade. Career rows appear to include preseason snaps.
- **Sync careers** (or `npm run sync:careers`) fetches career history for anyone missing it or last fetched over a day ago. PFF limits reads per minute; the app waits out the limit, so a full refresh takes a few minutes.
- Edits stay local until you press **Save changes**, which writes `data/bears-roster.json`.
- **Sync PFF** refreshes grades and stats, including all 19 PFF team reports (this takes a few minutes; PFF's reports are slow). A report that times out keeps its previous copy and is listed as a warning. Players are matched to PFF by name (with a same-team, first-initial fallback for nicknames). If a match is wrong, set the PFF player id in the player panel.

## PFF CLI

The same API is available from the terminal through [Restish](https://rest.sh), e.g. `restish pff team-roster nfl chicago-bears -o json`. See developer.pff.com for setup.
