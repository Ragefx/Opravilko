# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 30** (commit `fbee596`, Sep 26 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-30

Build 30 adds updating from inside the app, the new Add task / shopping
cards with opening animations, and one-Back closing of the Add task card.

## In the code, not in the app yet

- Add task card (bottom bar style): the project list above the card was cut
  off in a curve (the grow animation's clip stayed on)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
