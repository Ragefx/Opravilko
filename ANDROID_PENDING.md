# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 15** (commit `5cdb525`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-15

Build 15 adds the section choice in Add task, the app's Add task card (the
widget's, on the keyboard), the redesigned full-screen task view and the
widget's grouped view picker.

## In the code, not in the app yet

- Shopping page: no ⋯ menu (the list is shared with your partner by itself).
- Widget shopping list: tapping an item opens it in the app (only the circle
  ticks it off); items sorted by shop, then category, with the shop in a
  small column.
- Widget shopping card: a 🏪 Shop chip next to Meal; what you add is marked
  for that shop (SPAR, Hofer, Lidl, or the list's own shops).
- Widget sized like Todoist's: smaller text in the list (task names 14sp,
  dates 12sp, header 16sp), shorter rows and smaller circles; the Add card's
  name 20sp, chips 36dp tall with 15sp text, send button 46dp.

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
- A partner's task shared from their own Inbox, tapped in the widget's
  Today/Upcoming, opens "Project not found".
