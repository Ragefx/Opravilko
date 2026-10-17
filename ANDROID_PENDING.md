# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 62** (commit `52c72d9`, Oct 13 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-62
(Run 50 was stopped before it finished, so there is no build 50.)

Build 62: Start page setting, 1-day-before reminders, widget typed time, squares without dots.

## In the code, not in the app yet

- Widget add card: a Task / Event switch in the name's corner, and the date menu has "Pick a day…" and "Add a time…". / Kartica za dodajanje na pripomočku: stikalo Naloga / Dogodek v kotu imena, meni datuma pa ima »Izberi dan …« in »Dodaj uro …«.
- The add task card closes once the task is added (app and widget), with a short "Added to …" note; the widget's shopping card stays open for more. / Kartica za dodajanje naloge se po dodajanju zapre (aplikacija in pripomoček), s kratkim obvestilom »Dodano v …«; kartica za nakupe na pripomočku ostane odprta za nove artikle.
- Widget add card has the same icons as the app's: reminders, repeat and share with your partner too; it uses your default reminders, and an event without a date goes on today. / Kartica za dodajanje na pripomočku ima enake ikone kot v aplikaciji: tudi opomnike, ponavljanje in deljenje s partnerjem; uporabi privzete opomnike, dogodek brez datuma pa gre na danes.
- Widget task window: the date has the same menu as the add card (with a time), and a Reminders row. / Okno naloge na pripomočku: datum ima enak meni kot kartica za dodajanje (z uro), in vrstico Opomniki.
- Reminders window closes once you pick one; "Day before at 9:00" is among the quick choices. / Okno opomnikov se zapre, ko izbereš opomnik; »Dan prej ob 9:00« je med hitrimi izbirami.
- Settings regrouped: Look & feel (Appearance, What's shown), Pages (Home page, Calendar), Tasks (Adding & lists, Reminders), Together, Data, App. / Nastavitve na novo urejene: Videz in občutek (Videz, Kaj je prikazano), Strani (Začetna stran, Koledar), Naloge (Dodajanje in seznami, Opomniki), Skupaj, Podatki, Aplikacija.

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
