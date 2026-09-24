# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 22** (commit `ac1604a`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-22

Build 22 adds task reminders: several per task, rung by the phone itself
(also for ones set on the website), with Done and Snooze on the notification.

## In the code, not in the app yet

- Background sync (Firebase) reads only tasks changed since the last one,
  with a full reread every 3 hours: far fewer Firestore reads. Needs the two
  indexes in firestore.indexes.json (without them it reads everything, as before)

## Known gaps

- (none known)
