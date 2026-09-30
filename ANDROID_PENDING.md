# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 51** (commit `ed21c89`, Sep 30 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-51
(Run 50 was stopped before it finished, so there is no build 50.)

Build 51: the add card's task/event switch as a small icon in the corner, an event's end time as a chip next to the date.

## In the code, not in the app yet

- Calendar on wide screens (tablets): the month with the chosen day in full on the right
- Add card: switching task/event keeps the keyboard up
- Widget calendar (both views): tapping a day opens the app's calendar with that day picked, even when the calendar is already open

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
