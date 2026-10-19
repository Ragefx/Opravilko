# Android app: waiting for the next build

The Android app carries its own copy of the web code, so website changes reach
it only when a new APK is built (Actions -> "Android app" -> Run workflow, on
the work branch). Changes are collected here and built together when asked.

Before each build, copy this list into `frontend/src/data/releases.ts` as the
new build's entry (newest first), so Settings > About in that build lists it.

Last build: **build 63** (commit `fc6dae7`, Oct 17 2026), signed with the
release key; https://github.com/Ragefx/Opravilko/releases/tag/android-build-63
(Run 50 was stopped before it finished, so there is no build 50.)

Build 63: add card closes after adding, widget add card matches the app's, Settings regrouped, Bebek / Bebika, comment counts.

## In the code, not in the app yet

- In Slovenian, the Inbox is now called "Moje naloge" (was "Prejeto"). / V slovenščini se Prejeto zdaj imenuje »Moje naloge«.
- Date picker: today is a filled green circle; the day already picked is a green ring. / Izbirnik datuma: današnji dan je poln zelen krog, že izbrani dan pa zelen obroč.
- Sidebar projects: just tap to open (no star or menu on a long press), and their task counts line up with Inbox, Calendar and the rest. / Projekti v stranskem meniju: samo tapni za odprtje (brez zvezdice in menija ob dolgem pritisku), število nalog pa je poravnano z Mojimi nalogami, Koledarjem in ostalimi.
- App calendar: holidays that are days off show in red (the day's number and, in Squares, the holiday's name), as on the widget. / Koledar v aplikaciji: prazniki, ki so dela prosti dnevi, so rdeči (številka dneva in pri Kvadratkih ime praznika), kot na pripomočku.
- Calendar (app and widget's Month + tasks): moving to another month no longer keeps showing the old day's tasks; it says "Tap a day to see its tasks". / Koledar (aplikacija in pripomoček Mesec + naloge): ob premiku na drug mesec se naloge prejšnjega dne ne kažejo več; piše »Tapni dan, da vidiš njegove naloge«.

## Known gaps

- Arrival reminders (tasks and shops) need Location on. Android drops the
  watched places when Location is switched off; they're set up again only
  on a restart or when the app next pushes its data (left as is for now)
