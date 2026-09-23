# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 12** (commit `0c17034`, Sep 23 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-12

Build 12 adds the widget's Add sheet (tasks, shopping items, meals), the
fix for tapping a task in the widget, the phone calendar (week/month of
dots with the day's list) and the Display icon.

## In the code, not in the app yet

- Nothing yet.

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
- A partner's task shared from their own Inbox, tapped in the widget's
  Today/Upcoming, opens "Project not found".
