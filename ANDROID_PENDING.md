# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 26** (commit `ebac72b`, Sep 25 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-26

Build 26 adds the add button at the bottom (four styles in Settings >
Appearance), Next trip opening the calendar on the trip's month, and the trip
chip on its own line under a trip project's name.

## In the code, not in the app yet

(nothing yet)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
