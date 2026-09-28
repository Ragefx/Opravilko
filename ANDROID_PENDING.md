# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 39** (commit `7e06a0a`, Sep 28 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-39

Build 39: sub-tasks show their date/time (and deadline) in the task view.

## In the code, not in the app yet

- Labels each have their own colour (existing grey ones get one once), shown
  on tasks and in the task view
- Pasted notes no longer carry their own scroll boxes
- Colour themes (Settings > Appearance > Colours): Triglav, Paper, Pokljuka,
  Dusk, Midnight
- Shopping items added on one phone show up on the other straight away: a
  nudge makes the phone re-read that whole list, and widget changes are
  stamped when saved (not when tapped, maybe offline)
- Settings > About > Instant updates always shows on the phone, and says why
  if the phone couldn't register for nudges

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
