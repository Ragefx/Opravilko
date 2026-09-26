# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 32** (commit `58a4c60`, Sep 26 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-32

Build 32: the new Settings page, voice only filling in the task name,
reorderable Add task icons, the Today widget opening Now.

## In the code, not in the app yet

- Now: the focus task can be switched off (Settings > Appearance > Now page >
  Focus task); off, it's listed with the rest of today
- Weekly review can be switched off (Settings > Appearance > Now page >
  Weekly review); off, it's hidden from Now, the menu and search
- Weekly review: a task opened from it now shows its date picker on top
  (it opened behind the task)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
