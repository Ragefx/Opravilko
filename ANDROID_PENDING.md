# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 56** (commit `7147dce`, Oct 5 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-56
(Run 50 was stopped before it finished, so there is no build 50.)

Build 56: Simple's own Settings page and tidier screens with it on; bought shopping no longer under Done on the calendar.

## In the code, not in the app yet

- Midva: the old "+ Add task" line is gone; the + button at the bottom adds tasks there already shared
- Simple can also hide Completed in the menu (hidden by default with Simple on; can be shown again)
- Settings: Focus task, Weekly review and Completed tasks on the calendar moved to the Simple page
- Event "Until" in the task window uses the app's own time picker (like Date) instead of the plain browser time box

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
