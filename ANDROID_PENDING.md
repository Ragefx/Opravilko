# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 35** (commit `bbcb9b8`, Sep 27 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-35

Build 35: widget refresh button, faster start (no waiting on the server for
the Inbox check) with a spinner while loading.

## In the code, not in the app yet

- Errors are kept (on the phone and in your account) and listed in Settings >
  About > Problems, with Copy all

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
