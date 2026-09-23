# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 11** (commit `1c02216`, Sep 23 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-11

Build 11 adds the fix for the app jumping back to the page a widget tap
opened, and the widget's shopping list (amounts, icons, add as items).

## In the code, not in the app yet

- Nothing yet.

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
