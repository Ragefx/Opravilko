# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 18** (commit `ed46f7d`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-18

Build 18 adds swipe-left to delete tasks, shopping swipes, the highlighted
Add task name, the widget checking every ~15 minutes, the "Add to shopping"
shortcut, and fixes for widget ticks (usual items) and partner Inbox tasks.

## In the code, not in the app yet

- No ⋯ menu on task rows and Board cards in the app (tap opens the task).
- Shop picker in the app's own look (a sheet from the bottom, counts per
  shop, new shop typed in place) instead of Android's plain list.
- Every dropdown in the app (task view rows, Add task's priority/repeat,
  Display menu, time, Completed filter...) opens the same themed sheet.
- Widget: tapping a shopping item opens that item (it only opened the list).
- Alignment pass: task circles line up with "+ Add task" (and with shopping
  circles), notes under the task name, Add a meal header, dropdown text size.


## Known gaps

- (none known)
