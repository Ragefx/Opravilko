# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 19** (commit `e9fe6cf`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-19

Build 19 adds the themed sheet for every dropdown, the shop picker sheet, the
widget opening the tapped shopping item, no ⋯ menu on tasks in the app, and
the alignment pass (task circles, notes, Add a meal header).

## In the code, not in the app yet

- Voice adds straight away when you stop talking (no send to press): the
  app's and the widget's Add task card add the task; the widget's shopping
  card adds the spoken items, split like the app does ("mleko kruh in dva
  jajca" -> three items).
- Shopping circle 18px, exactly the task circle's size (was 20px).

## Known gaps

- (none known)
