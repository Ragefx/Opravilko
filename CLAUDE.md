# Opravilko: notes for Claude

Opravilko is a Todoist-like to-do app for the owner and their partner.
- Website: React 19 + TypeScript + Vite + react-query, in `frontend/`.
- Storage: Firebase (project `opravilko-bdd45`), with an older Dropbox mode.
- Android: a Capacitor 8 app from the same web code, plus a native Java
  home-screen widget in `frontend/android/app/src/main/java/com/opravilko/app/`
  (`widget/`, `update/`, `share/`, `places/`, `voice/`).

The owner writes short requests, often from the phone, with screenshots.
Reply plainly, without code talk; they aren't a developer.

## Branch and deploying

- Work branch: `claude/friendly-ramanujan-zpcw2a` (unless the session names another).
- Git author (repo-local; set it again in a fresh container):
  `git config user.name "Ragefx"`, `git config user.email "10454763+Ragefx@users.noreply.github.com"`.
- **Deploy website changes straight away**:
  1. Commit.
  2. `git push -q origin <branch>`
  3. `git push -q origin <branch>:main` (GitHub Pages builds from main).
- Commit messages end with the Co-Authored-By / Claude-Session lines the
  session's instructions give. Never put a model name in anything pushed.
- Never commit the keystore. Keep screenshots and test scripts out of the
  repo (use the session's scratchpad), since `git add -A` would pick them up.

## Android builds: only when the owner says "build"

Changes that only reach the phone with a new APK are listed in
`ANDROID_PENDING.md` under "In the code, not in the app yet". Add a line
there for every change the app needs.

When they say **build**:
1. Copy the pending list into `frontend/src/data/releases.ts` as the new
   build's entry (newest first; the build number is the last one + 1). It
   shows in Settings > About. Commit and push the branch and main.
2. Start the `android.yml` workflow on the work branch with the GitHub MCP
   tool `actions_run_trigger` (method run_workflow). Load it with ToolSearch:
   `select:mcp__github__actions_run_trigger,mcp__github__actions_list,mcp__Claude_Code_Remote__send_later`.
3. Unless they say "no check": `send_later` in 4 minutes to check with
   `actions_list`. If the build failed, read the logs and fix it.
4. Update `ANDROID_PENDING.md`: last build N, commit, a one-line summary,
   and the list reset to "(nothing yet)". Commit, then push the branch and main.
5. Give the link `https://github.com/Ragefx/Opravilko/releases/tag/android-build-N`.

- Every APK is signed with the same key (repo secrets), so it installs over
  the last one.
- From build 30 on, the app updates itself: an Update card checks GitHub's
  latest release (`UpdatePlugin.java`, `src/native/update.ts`).
- Don't build the Play Store bundle (.aab) until the owner explicitly asks.

## Firestore rules

After a change to `firestore.rules`, tell the owner to paste the whole file
(https://github.com/Ragefx/Opravilko/blob/main/firestore.rules) into
https://console.firebase.google.com/project/opravilko-bdd45/firestore/rules

## Languages (English / Slovenian)

- Settings > Appearance > Language, per device (`localStorage["opravilko.lang"]`,
  English by default; switching reloads). `src/i18n.ts`.
- Every bit of text is written in place as `tr("English", "Slovensko")`;
  counts use `trn(n, [one, other], [1, 2, 3–4, 5+])` with `#` for the number.
- Dates: import `format` from `src/i18n.ts` (not date-fns) so day and month
  names follow the language; Slovenian patterns differ (`tr("EEE d MMM",
  "EEE, d. MMM")`), standalone months are `LLLL`, and `cap()` capitalises a
  heading that starts with a day or month.
- The Inbox is stored as "Inbox" and shown as "Prejeto" (`assemble` in sync.ts,
  WidgetSyncJob). Built-in meals and shopping categories follow the language.
- Android: `widget/L.java` does the same (`L.t(en, sl)`, `L.date`, `L.res` for
  res/values strings); the language reaches it with the widget data
  (`lang` in `OpravilkoWidget.update`).
- New text, new release notes (`itemsSl` in releases.ts) and new toasts need
  both languages.

## Checking changes

- Type check: `cd frontend && npx tsc -b`. Build: `npm run build`.
- Browser tests: Firebase emulators (firestore 8080, auth 9099) plus
  `VITE_FIREBASE_EMULATOR=1 vite --port 5174`, driven with Playwright
  (Chromium at `/opt/pw-browsers/chromium`).
  - `window.__opravilkoTestSignIn(email)` signs in on the emulator.
  - Opening a page with `?app` once shows the Android app's layouts in the browser.
  - The look is `localStorage["opravilko.look"]` ("soca" by default).
  - The add button style is `localStorage["opravilko.addStyle"]`.
  - The colours are `localStorage["opravilko.palette"]` (`utils/palette.ts`,
    `styles/palettes.css`; unset = the look's own).
- The Java code can't be run here. Compile-check it with `javac` against
  `android-all.jar` plus small stubs (Capacitor and R ids); ask for them to
  be re-created if needed.
- In the app, UI that is app-only uses `appUi` (`src/utils/appUi.ts`), native
  behaviour uses `isNativeApp`, and phone-size layouts use `useNarrowScreen()`.

## Where things are

- Now page: `src/pages/Home.tsx`. Its focus card can be switched off:
  `utils/focusCard.ts`, Settings > Simple (with Weekly review and completed-on-calendar).
- Add task card: `src/components/QuickAddSheet.tsx`.
  - In the app it has tokens plus one row of icons, which can be reordered by
    dragging (order in `localStorage["opravilko.addTools"]`).
  - It opens with a rise animation, or a grow animation with the bottom bar
    style.
  - The website shows it as a window.
- Bottom add button, 5 styles: `src/components/AddDock.tsx`, `utils/addStyle.ts`.
- Settings: `src/components/SettingsModal.tsx`.
  - On the phone it's a grouped page with a page per section; on wide screens, a side nav.
  - About (version, history): `AboutSection.tsx` and `data/releases.ts`.
- Trips: `utils/away.ts`, `components/AwaySheet.tsx`.
  - Your own trips are kept in your profile; a project can be a trip.
  - Your partner's trips are read from their profile.
  - Each trip is by plane, car, or "off work" (🏖️, sand colour); "together"
    trips show as both of yours (only whoever added one can change it).
- Events: a task with `kind: "event"` (`utils/events.ts`): violet, no tick,
  optional `endTime`, never overdue. Once over they're marked done (or a
  repeating one rolls on) by `useFinishEvents` in Layout, and stay greyed on
  the calendars. Task/Event switch: the corner icon in the add card, and a
  row in the task window.
- Simple (Settings > Simple, `utils/simple.ts`): one per-device switch that
  hides extras for the partner (shopping Meal/Shop/reminders/suggestions,
  task deadline/labels/location until set, Midva "from", Now's "pick from
  Next", plus labels/location icons in the add card and Labels/Filters in
  the menu). Each item can be shown anyway. New "please remove X" requests
  from the partner go here (`useHidden("…")`).
- Calendars: `CalendarView.tsx` (website: month with a day panel on wide
  windows, week view) and `MobileCalendar.tsx` (phone). Completed tasks
  (Settings > Simple, `utils/calendarDone.ts`; shopping excluded) and
  Slovenian holidays (`utils/holidays.ts`) show on them. The + adds on the
  picked day (`utils/calendarDay.ts`).
- Widget calendar views: `widget/CalendarWidget.java` (Month; Month + tasks);
  a tapped day opens the app's calendar on it.
- Settings switches kept per device in localStorage: swipe tasks (off by
  default, `utils/swipeTasks.ts`), focus card, weekly review, holidays,
  completed on calendar, Simple.
- Shopping: `components/ShoppingView.tsx`, `utils/shopping.ts`.
  - Meals, a shop per item, "@shop" in a typed line.
  - The widget has matching logic in `widget/ShoppingLogic.java`.
- Widget add card (task and shopping): `widget/QuickAddActivity.java`,
  `res/layout/widget_quick_add.xml`.
- Sync with Firestore: `src/firebase/sync.ts`.
- Rules: `firestore.rules`.

## Helper on Cloudflare, push, Gmail

- `worker/` is the helper at https://opravilko.cloudsan-29b.workers.dev (the
  owner's Cloudflare account; the calendar relay in `cloudflare/` is there too).
  Deployed by `.github/workflows/worker.yml` (secrets CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID, FIREBASE_SERVICE_ACCOUNT); start it with
  `actions_run_trigger` (worker.yml, ref main) after changing `worker/`.
  - /ping: wakes the partner's phones (Firebase Cloud Messaging data message
    "sync"); the phone then syncs and PartnerNotifier shows the notification.
  - /recipe: reads a recipe page's schema.org data.
  - /addon/*: the Gmail add-on, signed in by a key (Settings > Import, backup & Gmail;
    stored as addonKeys/{sha256}).
- The address is in `src/utils/helper.ts`, `widget/HelperClient.java` and
  `gmail-addon/Code.gs`.
- `gmail-addon/`: an Apps Script Gmail add-on, installed by hand (README).
- Every build runs `oxlint` first (it catches hook-order mistakes like build 33's).
- Java compile check: android-all.jar from Maven Central
  (org.robolectric:android-all) plus hand-written stubs for Capacitor,
  AndroidX, Play services location and Firebase messaging, and an R class
  generated from res/.

## Open items

- **Vanished shared task.** The partner ticked off a task the owner shared and
  got "That change isn't allowed"; the task couldn't be found afterwards.
  Not reproduced. The error message now names the task and what was being
  changed (`refusedMessage` in `sync.ts`); ask for that screenshot.
- **Rules paste pending?** The owner may not have pasted the latest
  `firestore.rules` (adds 'deadline', 'kind', 'endTime' for shared tasks);
  the console's Publish button didn't show for them once.
- Build numbers come from the workflow's run number: run 50 was cancelled,
  so there is no build 50. Check the run number before giving the link.

- **Shared attachment storage.** The 700 MB attachment budget
  (`meta/storage` in `firestore.rules`) is one shared counter, and any
  signed-in user can change it.
  - Harmless for the two of them.
  - Should become a per-person limit before anyone else uses the app.
  - The owner hasn't decided yet.
- Settled (don't ask again): shopping-list voice keeps adding items straight
  away; widget icon dragging works; the Gmail add-on works.
- **Google Play.** Discussed and put on hold. The in-app updater covers
  updates for now.
