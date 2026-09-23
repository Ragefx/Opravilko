# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 11** (commit `1c02216`, Sep 23 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-11

Build 11 adds the fix for the app jumping back to the page a widget tap
opened, and the widget's shopping list (amounts, icons, add as items).

## In the code, not in the app yet

- Widget + and mic open an Add task sheet over the home screen (the app
  stays closed): a text field with the keyboard up, a project chip and a
  date chip, and a mic button that turns into send once you type. Typed
  "jutri", "v petek", "ob 9h", "p1" are understood. It stays open for the
  next task; tap outside or Back to close.
  On the shopping list: "Add: mleko 1 l, 2x jajca" adds items (amounts
  count up onto what's there) and your usual items are chips to tap.
  New tasks and items show in the widget at once and sync (Dropbox or
  Firebase) like ticks, app closed too.

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
