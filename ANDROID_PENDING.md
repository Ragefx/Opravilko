# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 17** (commit `2d7e844`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-17

Build 17 adds the back button going to Now, the "where it goes" list in Add
task (project, then its sections), taller chips, and the shopping list at the
same text size as the other lists.

## In the code, not in the app yet

- (nothing)

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
- A partner's task shared from their own Inbox, tapped in the widget's
  Today/Upcoming, opens "Project not found".
