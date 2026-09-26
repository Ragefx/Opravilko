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

## Checking changes

- Type check: `cd frontend && npx tsc -b`. Build: `npm run build`.
- Browser tests: Firebase emulators (firestore 8080, auth 9099) plus
  `VITE_FIREBASE_EMULATOR=1 vite --port 5174`, driven with Playwright
  (Chromium at `/opt/pw-browsers/chromium`).
  - `window.__opravilkoTestSignIn(email)` signs in on the emulator.
  - Opening a page with `?app` once shows the Android app's layouts in the browser.
  - The look is `localStorage["opravilko.look"]` ("soca" by default).
  - The add button style is `localStorage["opravilko.addStyle"]`.
- The Java code can't be run here. Compile-check it with `javac` against
  `android-all.jar` plus small stubs (Capacitor and R ids); ask for them to
  be re-created if needed.
- In the app, UI that is app-only uses `appUi` (`src/utils/appUi.ts`), native
  behaviour uses `isNativeApp`, and phone-size layouts use `useNarrowScreen()`.

## Where things are

- Now page: `src/pages/Home.tsx`. Its focus card can be switched off:
  `utils/focusCard.ts`, Settings > Appearance.
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
  - Each trip is by plane or car.
- Shopping: `components/ShoppingView.tsx`, `utils/shopping.ts`.
  - Meals, a shop per item, "@shop" in a typed line.
  - The widget has matching logic in `widget/ShoppingLogic.java`.
- Widget add card (task and shopping): `widget/QuickAddActivity.java`,
  `res/layout/widget_quick_add.xml`.
- Sync with Firestore: `src/firebase/sync.ts`.
- Rules: `firestore.rules`.

## Open items

- **Shared attachment storage.** The 700 MB attachment budget
  (`meta/storage` in `firestore.rules`) is one shared counter, and any
  signed-in user can change it.
  - Harmless for the two of them.
  - Should become a per-person limit before anyone else uses the app.
  - The owner hasn't decided yet.
- **Shopping voice.** Voice on the shopping list still adds spoken items
  straight away (voice in Add task now only fills in the text). Ask if they
  want the shopping list to wait for send too.
- **Widget icon dragging.** Reordering the widget card's icons (Android drag
  and drop) has only been compile-checked. Ask how it works on the phone.
- **Google Play.** Discussed and put on hold. The in-app updater covers
  updates for now.
