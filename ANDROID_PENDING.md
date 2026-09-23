# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 8** (commit `947113b`, Sep 23 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-8

## In the code, not in the app yet

- One full-width board column per page on the phone, no edge of the next
  column showing (Android app only; the website keeps its look).
- Shopping list: an item added again without an amount counts up
  ("Mleko" + "mleko" = "Mleko 2×").

## Known gaps (not started)

- Home-screen widget: ticking a task from the widget still goes through the
  old Dropbox sync, so it doesn't reach Firebase. It shows tasks fine.
- Widget's own repeat logic (TaskLogic.java) doesn't know the newer repeats
  (every 2 weeks, yearly, fixed / last day of the month).
- "When I arrive" location reminders (needs background location).
