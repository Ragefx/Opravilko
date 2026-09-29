# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 40** (commit `1874d91`, Sep 28 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-40

Build 40: label colours, colour themes, shopping items reach the other phone straight away, Instant updates log always shown.

## In the code, not in the app yet

- Remind me at the shop: tap a pinned shop to move it on the map or give it
  a name of its own ("SPAR Rudnik"); new pins show their street

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
