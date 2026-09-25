# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 27** (commit `b5952da`, Sep 25 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-27

Build 27 fixes the bottom add button also opening the date picker.

## In the code, not in the app yet

- Trips by plane or by car: a "Getting there" choice on each trip; the
  calendar, the day's banner, Next trip on Now and a trip project's chip show
  ✈️ or 🚗

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
