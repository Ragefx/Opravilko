# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 48** (commit `51cedf5`, Sep 30 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-48

Build 48: completed tasks on the calendars, off work (🏖️) and trips together, bigger month buttons on the calendar widget.

## In the code, not in the app yet

- Calendar widget (month view): days on a trip or off work no longer have a coloured background; only the small trip band is coloured

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
