# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 31** (commit `e48fc91`, Sep 26 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-31

Build 31: ticking off in the task view closes it (with Undo), "@shop" when
adding shopping items, the + under the task view, the project list above the
Add task card no longer cut off. First build installable from the in-app
Update card (from build 30).

## In the code, not in the app yet

(nothing yet)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
