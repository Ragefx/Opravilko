# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 20** (commit `a0df3ae`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-20

Build 20 adds voice adding straight away when you stop talking (Add task
card and the widget's cards) and the shopping circle at the task circle's size.

## In the code, not in the app yet

- Task notes: writing them uses the full width; pasted/imported indents
  dropped; long lines wrap (the page no longer scrolls sideways).
- Date picker: no keyboard on opening (tap "Type a date" to type), and the
  sheet stays below the status bar even with the keyboard up.

## Known gaps

- (none known)
