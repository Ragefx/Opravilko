# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 58** (commit `4ee4141`, Oct 7 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-58
(Run 50 was stopped before it finished, so there is no build 50.)

Build 58: English / Slovenian (app, widget, notifications), pictures in comments, tidier lists and task window.

## In the code, not in the app yet

- Shopping: "On sale" card with this week's deals at Hofer, Lidl, Spar and Tuš that fit your meals and usual items (+ Add puts a meal on the list with each deal's shop), and "All deals" to search them. Can be hidden in Simple. / Nakupi: kartica »V akciji« s tedenskimi akcijami Hoferja, Lidla, Spara in Tuša za tvoje obroke in običajne artikle (+ Dodaj doda obrok s trgovino vsake akcije) in »Vse akcije« za iskanje. Skrije se lahko v Preprostem.

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
