# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 62** (commit `52c72d9`, Oct 13 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-62
(Run 50 was stopped before it finished, so there is no build 50.)

Build 62: Start page setting, 1-day-before reminders, widget typed time, squares without dots.

## In the code, not in the app yet

- Widget add card: a Task / Event switch in the name's corner, and the date menu has "Pick a day…" and "Add a time…". / Kartica za dodajanje na pripomočku: stikalo Naloga / Dogodek v kotu imena, meni datuma pa ima »Izberi dan …« in »Dodaj uro …«.

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
