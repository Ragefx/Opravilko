# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 61** (commit `bf7af30`, Oct 13 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-61
(Run 50 was stopped before it finished, so there is no build 50.)

Build 61: Google Sans font for the calendar and the widget's calendar views.

## In the code, not in the app yet

- Widget add card: a typed time ("13:00") or day ("jutri") shows next to the date as soon as you type a space, and a time alone stays on the tapped day. / Kartica za dodajanje na pripomočku: vpisan čas (»13:00«) ali dan (»jutri«) se pokaže ob datumu takoj po presledku, sam čas pa ostane na izbranem dnevu.
- Calendar squares (widget and app): whole names cut at the edge, no "…". / Kvadratki koledarja (pripomoček in aplikacija): cela imena, odrezana ob robu, brez »…«.

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
