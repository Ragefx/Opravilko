# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 29** (commit `0278cc5`, Sep 25 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-29

Build 29 adds Settings > About (version and every build's changes).

## In the code, not in the app yet

- Shopping list: the bottom add button comes back after Back closes the
  keyboard (it stayed hidden until you changed page)
- Add task card: one Back closes the keyboard and the card together (it took
  two); tapping a chip, the mic or a picker still keeps the card open
- Updates from inside the app: a "Build N is ready" card when GitHub has a
  newer build (Update → Android's Install; the first time Android asks to
  allow installing apps), and Check for updates in Settings > About. New
  native plugin UpdatePlugin + REQUEST_INSTALL_PACKAGES permission

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
