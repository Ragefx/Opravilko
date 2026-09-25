# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Last build: **build 24** (commit `e500c2c`, Sep 25 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-24

Build 24 adds notifications about your partner's changes, shop arrival
lists, repeat-after-done, the widget's tick effect and task card, the Now
page's Later today card, and the redesigned meals window.

## In the code, not in the app yet

- Calendar opens on the whole month by default (fold it to a week with the
  handle; that choice is remembered), and is about 20% more compact.
- Remind me at the shop: the place search opened behind the sheet (now it
  replaces it while you pick); "Add another Hofer" for more of the same shop
- Meals: tap ingredients you already have to leave them off (remembered per
  meal); the widget's meal picker has tick boxes for the same
- Meals: a shop per ingredient (chip next to it, or "@Hofer" in the recipe);
  adding the meal marks each item for its shop (widget too)
- Attachments open in the phone's own viewer (photos, PDFs, documents); they
  did nothing in the app before. Also from Settings > Storage
- Calendar shows sub-tasks with their own date (the phone's calendar too)
- Away periods (trips): ✈️ in the calendar; a band across the days, a banner
  on the day's list; your partner's trips show too (their name, in rose);
  leaving / back times and a note (flight number) on each trip
- Trips can be projects (Tromsø): trip dates from the project's ⋯ menu, a
  countdown chip in its header, the band opens the project; "Make it a trip
  project" on a task; "Next trip" line on Now
- Weekly review: overdue and undated tasks one at a time (Today, Tomorrow,
  Weekend, Next week, Keep, Done, Delete); in the menu, and offered on Now at
  the weekend
- Widget Add task / shopping card: taller buttons (52 dp chips, 56 dp send)

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
