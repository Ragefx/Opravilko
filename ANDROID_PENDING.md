# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 49** (commit `9b215fa`, Sep 30 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-49

Build 49: events, swiping tasks off by default, only the trip band coloured in the widget month, refused changes named.

## In the code, not in the app yet

- Add card: the task/event switch is a small icon in the top right corner (✓ task, violet calendar for an event)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
