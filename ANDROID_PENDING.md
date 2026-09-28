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
- Push: the phone registers for nudges (users/{uid}/devices) and, when your
  partner changes something shared, syncs at once (widget + notification);
  bursts of notifications for one list are merged. Needs the Cloudflare helper
  deployed and HELPER_URL set (src/utils/helper.ts, widget/HelperClient.java).
  Adds firebase-messaging (BoM 34.19.0) to the Android build.
- Shopping: each shop's walking order is learned from the order things get
  ticked there, and the list (and widget) sorts in it

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
