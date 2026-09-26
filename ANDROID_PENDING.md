# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 33** (commit `9c46042`, Sep 26 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-33

Build 33: focus task and weekly review can be switched off, the weekly
review's date picker on top, three priority levels plus No priority.

## In the code, not in the app yet

- Fixed: build 33 could open to a blank screen (the Now page crashed while
  tasks were loading)
- An error now shows a "Something went wrong" screen with Reload instead of
  a blank page
- Shared tasks and shopping items show who ticked them off ("✓ Maruša" in
  the basket, lists and Completed; "Ticked off by …" on the open task)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
