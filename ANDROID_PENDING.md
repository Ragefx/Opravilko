# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 16** (commit `d24a6e5`, Sep 24 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-16

Build 16 adds shops and notes on shopping items (sorted by shop, a shop
column and a shop filter), the widget's Shop chip, widget shopping rows that
open the item, the widget sized like Todoist's, and no ⋯ menu on Shopping.

## In the code, not in the app yet

- Shopping list at the same text size as the other lists (app only).

## Known gaps

- A tick on a shopping item in the widget doesn't count towards the
  "usual items" chips (only ticks in the app do).
- A partner's task shared from their own Inbox, tapped in the widget's
  Today/Upcoming, opens "Project not found".
