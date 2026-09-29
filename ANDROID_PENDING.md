# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 44** (commit `6f6d21f`, Sep 29 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-44

Build 44: shopping items as typed, comments with names/pictures/links/edit, shared-project tasks say they're shared.

## In the code, not in the app yet

- Projects: no display menu; the Inbox is always a board, projects are lists,
  and a Sort button (date, priority, name, date added, or your own order)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
