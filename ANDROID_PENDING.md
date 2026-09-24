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

- Swipe a task left to delete it (red, with Undo); right still completes.
- Widget: ticking a shopping item counts towards the "usual items" chips.
- A task your partner shared from their own Inbox, tapped in the widget (or
  any link), opens in Midva instead of "Project not found".

## Known gaps

- (none known)
