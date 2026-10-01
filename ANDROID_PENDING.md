# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 54** (commit `5ee5a35`, Oct 1 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-54
(Run 50 was stopped before it finished, so there is no build 50.)

Build 54: Simple (Settings > Appearance), no Add task line under the calendar, no swiping on the shopping list.

## In the code, not in the app yet

- Add card: a time typed on its own ("ob 18") goes on the day already chosen (the calendar's, or one picked), not today

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
