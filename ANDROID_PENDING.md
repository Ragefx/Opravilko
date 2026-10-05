# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 55** (commit `3cfe965`, Oct 1 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-55
(Run 50 was stopped before it finished, so there is no build 50.)

Build 55: a time typed on its own goes on the day already chosen, not today.

## In the code, not in the app yet

- Simple has its own page in Settings (under Look & feel); with Simple on, the shopping add box, mic and Add share one row, the add card has no label or location icons, and the menu has no Labels or Filters
- Calendar (and widget): bought shopping items no longer show under Done

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
