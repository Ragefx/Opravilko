# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 57** (commit `113b412`, Oct 5 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-57
(Run 50 was stopped before it finished, so there is no build 50.)

Build 57: Midva add line gone; Simple hides Completed and holds the focus/review/calendar-done switches; event Until uses the time picker.

## In the code, not in the app yet

- Simple can also hide Productivity in the menu (hidden with Simple on; can be shown again)
- Comments can have pictures pasted in
- No "+ Add task" lines in the Inbox, projects and Upcoming in the app (the + button adds)
- Calendar day list and Upcoming: tasks under their own day show just the time (no repeated "Today"/date)
- Menu: Weekly review has its own icon (not the calendar's); no "/" keyboard hint in the app
- Task window: the Event row has a line icon like the other rows (not the 📅 emoji); no "drop files" hint on the phone
- Task window: no ">" arrows on the rows
- Languages: English or Slovenian (Settings > Appearance > Language); the widget, the widget's add card, reminders and other notifications follow it

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
