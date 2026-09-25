# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 23** (commit `4439ffe`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-23

Build 23 makes the background sync read only changed tasks (far fewer
Firestore reads, once the two indexes exist), gives sub-tasks more room,
lines up the Labels row, and fixes the time picker opening behind the date
picker.

## In the code, not in the app yet

- Now page, On the clock: finished events hidden, "in 1 h 35 min" / now /
  late beside each time, the next one highlighted, a countdown in the header

## Known gaps

- (none known)
