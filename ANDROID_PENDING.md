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

- Now page: a small "Later today" card under the focus task (the next few
  timed tasks and events, with how soon) instead of the On the clock block
- Widget: ticking a task off plays the app's effect in steps (filled tick
  circle and a line through the name, then a fade, then it's gone)
- Widget: tapping a task opens its card over the home screen (name, notes,
  date, priority; Save, Delete, Open in app), without opening the app
- Notifications about your partner's changes ("Maruša added to Shopping:
  milk, eggs", "... finished", "... bought"), from the background sync; not
  while you're in the app; switch in Settings > Sharing
- Remind me at the shop: pin your SPAR/Hofer/Lidl (Shopping, bottom); on
  arrival a notification lists that shop's items (plus any-shop ones) and
  opens the list filtered to it (needs location "Allow all the time")
- Widget ticks honour "Count from when it's done" repeats

## Known gaps

- (none known)
