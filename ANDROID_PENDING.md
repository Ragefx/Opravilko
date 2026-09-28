# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 37** (commit `bf63d3e`, Sep 28 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-37

Build 37: deletions reach the other phone, phones no longer dropped by the
helper on errors, the Instant updates log, Settings "Import, backup & Gmail".

## In the code, not in the app yet

- New time picker: quick times (9:00, 12:00, 17:00, 20:00), an hour grid,
  :00/:15/:30/:45, or type it ("16:30", "930"); a button removes the time
- Task view: sub-tasks show their date/time (and deadline) under the name; a
  date typed in a new sub-task ("Foto jutri ob 10") is read as its date

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
