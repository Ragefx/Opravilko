# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 25** (commit `1f682cb`, Sep 25 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-25

Build 25 adds trips (shared with your partner, with times, notes and trip
projects), the weekly review, 24-hour times, sub-tasks in the calendar,
attachments opening on the phone, a shop per meal ingredient, taller widget
add buttons, and the compact month calendar.

## In the code, not in the app yet

- Trip projects: the dates chip sits on its own line under the name, so the
  project's buttons stay top right and their menus open on screen
- Next trip on Now opens the calendar on the trip's month, with its first day
  picked

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
