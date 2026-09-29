# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 41** (commit `718f285`, Sep 29 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-41

Build 41: pinned shops (Remind me at the shop) can be moved and renamed.

## In the code, not in the app yet

- Widget changes (ticks, items added) are saved and sent to the other phone
  right away, not when Android gets round to its background job (which with
  the app closed let only the first change through in time)
- A repeating task keeps its repeat when you change its date (the repeat
  moves with it: every month on the 15th -> on the 20th)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
