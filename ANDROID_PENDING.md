# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 52** (commit `29f0027`, Sep 30 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-52
(Run 50 was stopped before it finished, so there is no build 50.)

Build 52: No time in the date picker (and removed times stay removed), repeating tasks in Completed, widget days open the app's calendar, add card keeps the keyboard, month + day panel on wide screens.

## In the code, not in the app yet

- Calendar: the + at the bottom adds on the day picked there (e.g. one opened from the widget)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
