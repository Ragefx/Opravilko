# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 21** (commit `d8138fa`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-21

Build 21 adds the widget's own shopping item card (edit/delete without the
app), the fixed task notes box, the date picker without the keyboard, and
no formatting buttons above task notes.

## In the code, not in the app yet

- Reminders: several per task (before the due time, a time on the day or
  the day before, or a set day and time), from the task's Reminders row and
  Add task; defaults in Settings (None unless picked)
- Reminders scheduled natively from the widget's copy of the tasks (on time
  to the minute), so ones set on the website ring with the app closed after
  the next sync (~15 min); Done / Snooze 15 min / 1 h on the notification
- No more automatic "due now" notification for every task with a time
- Background sync (Firebase) reads only tasks changed since the last one,
  with a full reread every 3 hours: far fewer Firestore reads. Needs the two
  indexes in firestore.indexes.json (without them it reads everything, as before)

## Known gaps

- (none known)
