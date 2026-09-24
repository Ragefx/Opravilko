# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 14** (commit `1d7ed1d`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-14

Build 14 adds the redesigned widget Add card (+ menu with description,
labels, location; attachment; priority), the shopping card's live
preview, the tick animation, the category-sorted shopping list and dates
on every widget row.

## In the code, not in the app yet

- Nothing yet.

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
- A partner's task shared from their own Inbox, tapped in the widget's
  Today/Upcoming, opens "Project not found".
