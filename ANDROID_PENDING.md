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
- Add task: a Date button to pick the date.
- Board: while dragging a task on the phone, a "Move to" strip of section
  names to drop it on; moving between sections works with any sorting.
- Widget: ticks save straight to Firebase (reach the other phone even with
  the app closed). Needs this build to be tested on a phone.
- Widget: knows the newer repeats (every 2 weeks, yearly, fixed / last day
  of the month).
- Arrival reminders: "Remind me when I arrive" under a task's location.
  Android's geofencing (150 m) notifies on arrival, app closed too; needs
  location "Allow all the time". Per person on shared tasks. Needs this
  build to be tested on a phone.
- Voice adding (Slovenian): a microphone in Add task and on the shopping
  list, using the phone's own voice input ("pol kile moke pa jajca" becomes
  two items). Needs this build to be tested on a phone.
- Long-press the app icon: Add task, Shopping list (the first project shown
  as a shopping list), Calendar.

## Known gaps (not started)

- Widget's own list refreshes only when the app runs (new tasks from the
  partner show up in the widget after the app has been opened).
