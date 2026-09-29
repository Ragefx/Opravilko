# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 42** (commit `1c7f5fe`, Sep 29 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-42

Build 42: widget changes are saved and sent to the other phone right away.

## In the code, not in the app yet

- A repeating task keeps its repeat when you change its date (the repeat
  moves with it: every month on the 15th -> on the 20th)
- Productivity: the two of you side by side (who was most active this week,
  today / 7 / 30 days, day by day) and shopping (items bought, trips, most
  bought); each phone shares its numbers (no task names) on its profile
- Files on a project itself (the paperclip in the project's header), shared
  with everyone on the project; listed in Settings > Storage

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
