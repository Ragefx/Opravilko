# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 46** (commit `aee6a78`, Sep 30 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-46

Build 46: the widget's Calendar (month) view; no Files button on the Inbox.

## In the code, not in the app yet

- Widget month view: changing month no longer piles the new month's squares
  under the old ones
- Widget month view: trip days tinted (yours green, your partner's pink), with
  the trip's name on its first day and each Monday

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
