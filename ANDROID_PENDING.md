# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 43** (commit `65ddb97`, Sep 29 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-43

Build 43: Productivity for the two of you and shopping, project files and descriptions, repeats kept when a date changes.

## In the code, not in the app yet

- Shopping items are kept exactly as typed: no capital first letter (in the
  app, the widget, and from the keyboard)
- Comments on shared tasks show who wrote them
- A task in a shared project says it's shared with everyone on it (no
  "Share with" switch there)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
