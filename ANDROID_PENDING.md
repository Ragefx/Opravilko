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


## Known gaps

- (none known)
