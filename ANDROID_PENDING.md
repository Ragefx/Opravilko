# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 9** (commit `9bd1de4`, Sep 23 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-9

Build 9 has everything up to the Shopping entry shared with your partner:
voice, share to Opravilko, icon shortcuts, the widget refreshing itself,
arrival reminders, templates, shared meals and usual items.

## In the code, not in the app yet

- Phone UI pass: bigger tap targets (ticks, chips, buttons, menu rows,
  date buttons), Add task pinned to the top so the keyboard doesn't cover
  it, Calendar starts in Week view on the phone, Settings sections wrap,
  the board's "Add section" page no longer peeks in.

- Widget redesign: header with the app's mark, what it shows + ▾ to switch
  (Today / Upcoming / Inbox / a project), a mic (opens Add task already
  listening) and a round + button. Lines between rows.
  Today: "Overdue" (with Reschedule = all to today) then today.
  Upcoming: "Overdue", then each day of the week ("Wednesday, 23 Sep ·
  Today"), empty days greyed. Inbox / projects: loose tasks, then each
  section with its count, empty sections greyed. Rows: priority circle
  (grey for none), date with calendar icon (red overdue, green today,
  purple this week), repeat and notes icons, project on the right.

## Known gaps

- None known. Voice, sharing, the widget's own refresh and arrival
  reminders need testing on a real phone.
