# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 59** (commit `3b9aadb`, Oct 8 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-59
(Run 50 was stopped before it finished, so there is no build 50.)

Build 59: Shopping "On sale" card with this week's deals at Hofer, Lidl, Spar and Tuš.

## In the code, not in the app yet

- Shopping: no example text in the add box. / Nakupi: brez primera v polju za dodajanje.
- Widget month: tap a day's empty space to add on that day (its number opens the app's calendar). / Pripomoček mesec: dotik praznega dela dneva doda nalogo na ta dan (številka odpre koledar v aplikaciji).
- Widget month: holidays as plain text, red for days off, no red block. / Pripomoček mesec: prazniki kot navadno besedilo, prosti dnevi rdeče, brez rdečega ozadja.
- Calendar: Dots or Squares (tasks written in day boxes, like the widget), in Settings > Appearance. / Koledar: pike ali kvadratki (naloge vpisane v dneve, kot na pripomočku), v Nastavitve > Videz.
- Widget: a tapped task opens a card like the app's task window, over the home screen. / Pripomoček: dotik naloge odpre kartico kot okno naloge v aplikaciji, nad začetnim zaslonom.
- Shopping: when shop deals can't be shown, a short line says why. / Nakupi: ko akcij ni mogoče prikazati, kratka vrstica pove zakaj.

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
