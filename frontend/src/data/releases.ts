/**
 * Every Android build, newest first: what it brought to the phone. The
 * website gets the same changes as they are made; this is the app's history.
 * Added to at each build (see ANDROID_PENDING.md).
 */
export interface Release {
  build: number;
  date: string;
  items: string[];
}

export const RELEASES: Release[] = [
  {
    build: 34,
    date: "2026-09-26",
    items: [
      "Fixed: build 33 could open to a blank screen (the Now page crashed while tasks were loading).",
      "If something goes wrong, a \"Something went wrong\" screen with Reload shows instead of a blank page.",
      "Shared tasks and shopping items show who ticked them off: \"✓ Maruša\" in the basket, lists and Completed, and \"Ticked off by …\" on the open task.",
      "Shopping: ticking an item plays the same tick as tasks (the circle pops, the name is struck through, the row folds into the basket).",
    ],
  },
  {
    build: 33,
    date: "2026-09-26",
    items: [
      "Now: the focus task can be switched off (Settings > Appearance > Now page > Focus task); off, it's listed with the rest of today.",
      "Weekly review can be switched off (Settings > Appearance > Now page > Weekly review); off, it's hidden from Now, the menu and search.",
      "Weekly review: a task opened from it shows its date picker on top (it opened behind the task).",
      "Priority: three levels (P1 red, P2 yellow, P3 green) plus No priority, which was shown as a blue Priority 4; also in the widget. Typing p4 no longer sets anything.",
    ],
  },
  {
    build: 32,
    date: "2026-09-26",
    items: [
      "Settings on the phone is a proper settings page: you at the top, grouped rows showing what each is set to, a page per section, Sign out at the bottom. The sidebar's gear opens it straight away.",
      "Voice in Add task only fills in the name (check it, then send); it no longer adds the task by itself.",
      "Add task card (app and widget): hold an icon, then slide it to reorder them.",
      "The Today widget opens Now (Upcoming opens the Calendar).",
    ],
  },
  {
    build: 31,
    date: "2026-09-26",
    items: [
      "Ticking a task off in the task view plays the tick, closes the task and offers Undo.",
      "Shopping: \"@shop\" in a typed item marks it for that shop (\"hrenovke 2 @spar\" → Hrenovke 2× at SPAR), in the app and the widget.",
      "The bottom-right + no longer sits on top of the task view.",
      "Add task card (bottom bar): the project list above it is no longer cut off.",
    ],
  },
  {
    build: 30,
    date: "2026-09-26",
    items: [
      "Updates from inside the app: a \"Build N is ready\" card when a newer build is out (Update, then Android's Install; the first time Android asks to allow installing apps), and Check for updates in Settings > About.",
      "New Add task card (app and widget) and widget shopping card: what's set as small tokens (tap to change, × to clear), then where it goes, one row of same-size icons and a round send.",
      "The Add task card opens with an animation: it rises from the bottom, or grows out of the + with the bottom bar style.",
      "Add task card: one Back closes the keyboard and the card together.",
      "Shopping list: the bottom add button comes back after Back closes the keyboard.",
    ],
  },
  {
    build: 29,
    date: "2026-09-25",
    items: [
      "Settings > About: the app's version (build number, when it was built) and what every build brought, from the first one.",
    ],
  },
  {
    build: 28,
    date: "2026-09-25",
    items: [
      "Trips by plane or by car: a \"Getting there\" choice on each trip; the calendar, the day's banner, Next trip on Now and a trip project's chip show ✈️ or 🚗",
    ],
  },
  {
    build: 27,
    date: "2026-09-25",
    items: [
      "Bottom add button: a tap no longer also opens the date picker (the tap's click landed on the Add task card's date chip)",
    ],
  },
  {
    build: 26,
    date: "2026-09-25",
    items: [
      'The add button moved to the bottom, in a style you pick in Settings > Appearance: corner button (the default), bottom bar with a raised +, an "Add a task…" bar, or the Opravilko dot (swipe left = shopping, up = voice); "At the top" keeps the old one. Hold any of them for Task / Shopping item / Voice',
      "Trip projects: the dates chip sits on its own line under the name, so the project's buttons stay top right and their menus open on screen",
      "Next trip on Now opens the calendar on the trip's month, with its first day picked",
    ],
  },
  {
    build: 25,
    date: "2026-09-25",
    items: [
      "Calendar opens on the whole month by default (fold it to a week with the handle; that choice is remembered), and is about 20% more compact.",
      'Remind me at the shop: the place search opened behind the sheet (now it replaces it while you pick); "Add another Hofer" for more of the same shop',
      "Meals: tap ingredients you already have to leave them off (remembered per meal); the widget's meal picker has tick boxes for the same",
      'Meals: a shop per ingredient (chip next to it, or "@Hofer" in the recipe); adding the meal marks each item for its shop (widget too)',
      "Attachments open in the phone's own viewer (photos, PDFs, documents); they did nothing in the app before. Also from Settings > Storage",
      "Calendar shows sub-tasks with their own date (the phone's calendar too)",
      "Away periods (trips): ✈️ in the calendar; a band across the days, a banner on the day's list; your partner's trips show too (their name, in rose); leaving / back times and a note (flight number) on each trip",
      'Trips can be projects (Tromsø): trip dates from the project\'s ⋯ menu, a countdown chip in its header, the band opens the project; "Make it a trip project" on a task; "Next trip" line on Now',
      "Weekly review: overdue and undated tasks one at a time (Today, Tomorrow, Weekend, Next week, Keep, Done, Delete); in the menu, and offered on Now at the weekend",
      "Widget Add task / shopping card: taller buttons (52 dp chips, 56 dp send)",
    ],
  },
  {
    build: 24,
    date: "2026-09-25",
    items: [
      'Now page: a small "Later today" card under the focus task (the next few timed tasks and events, with how soon) instead of the On the clock block',
      "Widget: ticking a task off plays the app's effect in steps (filled tick circle and a line through the name, then a fade, then it's gone)",
      "Widget: tapping a task opens its card over the home screen (name, notes, date, priority; Save, Delete, Open in app), without opening the app",
      'Notifications about your partner\'s changes ("Maruša added to Shopping: milk, eggs", "... finished", "... bought"), from the background sync; not while you\'re in the app; switch in Settings > Sharing',
      'Remind me at the shop: pin your SPAR/Hofer/Lidl (Shopping, bottom); on arrival a notification lists that shop\'s items (plus any-shop ones) and opens the list filtered to it (needs location "Allow all the time")',
      'Widget ticks honour "Count from when it\'s done" repeats',
      "Meals window redesign (icons, delete/bring back built-in meals, icon picker); the widget's meal list leaves out deleted meals",
    ],
  },
  {
    build: 23,
    date: "2026-09-24",
    items: [
      "Background sync (Firebase) reads only tasks changed since the last one, with a full reread every 3 hours: far fewer Firestore reads",
      "Sub-tasks in the task view get more room (taller rows, more spacing)",
      'Task view: "Add a label" no longer sits lower than the other rows',
      "Add task: the time picker opens in front of the date picker (was hidden behind it)",
    ],
  },
  {
    build: 22,
    date: "2026-09-24",
    items: [
      "Reminders: several per task (before the due time, a time on the day or the day before, or a set day and time), from the task's Reminders row and Add task; defaults in Settings (None unless picked)",
      "Reminders scheduled natively from the widget's copy of the tasks (on time to the minute), so ones set on the website ring with the app closed after the next sync (~15 min); Done / Snooze 15 min / 1 h on the notification",
      'No more automatic "due now" notification for every task with a time',
    ],
  },
  {
    build: 21,
    date: "2026-09-24",
    items: [
      "Task notes: writing them uses the full width; pasted/imported indents dropped; long lines wrap (the page no longer scrolls sideways).",
      "Widget: tapping a shopping item opens its own card right over the home screen (name, amount, note, shop, category; Save / Delete), without opening the app; changes sync like ticks.",
      "Task notes: no formatting buttons (B, lists, link) above them any more.",
      'Date picker: no keyboard on opening (tap "Type a date" to type), and the sheet stays below the status bar even with the keyboard up.',
    ],
  },
  {
    build: 20,
    date: "2026-09-24",
    items: [
      "Voice adds straight away when you stop talking (no send to press): the app's and the widget's Add task card add the task; the widget's shopping card adds the spoken items, split like the app does (\"mleko kruh in dva jajca\" -> three items).",
      "Shopping circle 18px, exactly the task circle's size (was 20px).",
    ],
  },
  {
    build: 19,
    date: "2026-09-24",
    items: [
      "No ⋯ menu on task rows and Board cards in the app (tap opens the task).",
      "Shop picker in the app's own look (a sheet from the bottom, counts per shop, new shop typed in place) instead of Android's plain list.",
      "Every dropdown in the app (task view rows, Add task's priority/repeat, Display menu, time, Completed filter...) opens the same themed sheet.",
      "Widget: tapping a shopping item opens that item (it only opened the list).",
      'Alignment pass: task circles line up with "+ Add task" (and with shopping circles), notes under the task name, Add a meal header, dropdown text size.',
    ],
  },
  {
    build: 18,
    date: "2026-09-24",
    items: [
      "Swipe a task left to delete it (red, with Undo); right still completes.",
      'Widget: ticking a shopping item counts towards the "usual items" chips.',
      'A task your partner shared from their own Inbox, tapped in the widget (or any link), opens in Midva instead of "Project not found".',
      "Shopping list: swipe right to tick off (or put back), left to remove (Undo).",
      "Add task card: what it read (dates, times, p1, #project, @label) is highlighted in the name as you type.",
      "Widget checks for changes every ~15 minutes by itself (Android's shortest), and whenever its add card opens.",
      'A 4th app-icon shortcut: "Add to shopping" (opens the list, listening).',
    ],
  },
  {
    build: 17,
    date: "2026-09-24",
    items: [
      "Shopping list at the same text size as the other lists (app only).",
      'Add task (app card and widget card): the place chip shows just the project ("Inbox"); tapping it opens a list of projects with their sections indented under them, like Todoist\'s. Chips taller (widget 44dp, app 48px), nearer the send button (48dp / 52px).',
      "Back button: closes what's open on top (Add task card included) first, otherwise goes straight to Now (not back through every page); from Now it leaves the app.",
    ],
  },
  {
    build: 16,
    date: "2026-09-24",
    items: [
      "Shopping page: no ⋯ menu (the list is shared with your partner by itself).",
      "Widget shopping list: tapping an item opens it in the app (only the circle ticks it off); items sorted by shop, then category, with the shop in a small column; a shop filter above the list (All, each shop, Any shop).",
      "Widget shopping card: a 🏪 Shop chip next to Meal; what you add is marked for that shop (SPAR, Hofer, Lidl, or the list's own shops).",
      "Widget sized like Todoist's: smaller text in the list (task names 14sp, dates 12sp, header 16sp), shorter rows and smaller circles; the Add card's name 20sp, chips 36dp tall with 15sp text, send button 46dp.",
    ],
  },
  {
    build: 15,
    date: "2026-09-24",
    items: [
      'Add task (widget card and the app): choose the project\'s section too, "Inbox / To-do", "Inbox / Dogodki"; a project without sections is just its name.',
      "Add task in the app is the widget's card, sitting on the keyboard: big task name, sideways chips (+ for description / labels / location, where it goes, date, attachment, priority, repeat, share) and a send / mic button. It stays open for the next task.",
      "Task view in the app: full screen, clear of the status bar (it slid under it before); name and notes on top, then one row per property (project / section, date, repeat, reminder, priority, labels, location, arrival reminder, Midva), then sub-tasks, attachments and comments.",
      'Widget view picker (tap the widget\'s title): a rounded card like Todoist\'s, grouped into "Default views" (Today, Upcoming, Inbox, Shopping list) and "Projects", each folding open, with the current one ticked.',
    ],
  },
  {
    build: 14,
    date: "2026-09-24",
    items: [
      "Ticking a task off: the circle fills and pops, a line strikes through the name, then the row folds away (repeating tasks stay, with their next date). Lists and board cards.",
      "Shopping list sorted by category (fruit and veg, bread, dairy, meat, pantry, spices, frozen, sweets, drinks, household, toiletries, pets, other), in the app and the widget.",
      'Widget Add card redesigned: a rounded card floating above the keyboard; chips that scroll sideways: + (Description, Labels, Location), project, date, Attachment (Google sign-in; the file is uploaded by the widget, photos shrunk like the app does), Priority. Location: current location (GPS, named by street) or a place used on another task. On the shopping list the same card has 🍳 Meal and your usual items as chips, and a live preview of what the typed text will add ("🥛 Mleko 2× (onto Mleko)").',
      'Widget rows always show the date next to the calendar icon: Today, Yesterday, Tomorrow or "27 Sep" (and the time).',
    ],
  },
  {
    build: 13,
    date: "2026-09-24",
    items: [
      "Fix: the widget's Add sheet sits on top of the keyboard (it was hidden behind it), and above the navigation bar when the keyboard is closed.",
    ],
  },
  {
    build: 12,
    date: "2026-09-23",
    items: [
      "Calendar on the phone: a week of day numbers with a coloured dot per task (swipe for the next week; open it to the whole month), and the picked day's tasks as a normal list below (Overdue + Reschedule on today).",
      '"Display" is an icon now (a page with lines), next to the ⋯ menu.',
      "Fix: tapping a task in the widget opens that task (it opened only the app when the app wasn't already running: the link came before the sign-in).",
      'Widget + and mic open an Add task sheet over the home screen (the app stays closed): a text field with the keyboard up, a project chip and a date chip, and a mic button that turns into send once you type. Typed "jutri", "v petek", "ob 9h", "p1" are understood. It stays open for the next task; tap outside or Back to close. On the shopping list: "Add: mleko 1 l, 2x jajca" adds items (amounts count up onto what\'s there) and your usual items are chips to tap. A "🍳 Meal" chip opens the meals (yours and the built-in ones): pick one, set the servings, and its ingredients go on the list, noted "za: <meal>". New tasks and items show in the widget at once and sync (Dropbox or Firebase) like ticks, app closed too.',
    ],
  },
  {
    build: 11,
    date: "2026-09-23",
    items: [
      "Fix: opening the app from the widget no longer keeps jumping back to that page when you move elsewhere.",
      'Shopping list in the widget: header "Shopping" with a cart; items with their amount pill and category icon (as in the app); tapping an item ticks it; + opens the list\'s own add box (items, amounts, counting up) and the mic adds spoken items. "🛒 Shopping list" is at the top of the widget\'s choices.',
    ],
  },
  {
    build: 10,
    date: "2026-09-23",
    items: [
      "Phone UI pass: bigger tap targets (ticks, chips, buttons, menu rows, date buttons), Add task pinned to the top so the keyboard doesn't cover it, Calendar starts in Week view on the phone, Settings sections wrap, the board's \"Add section\" page no longer peeks in.",
      'Widget redesign: header with the app\'s mark, what it shows + ▾ to switch (Today / Upcoming / Inbox / a project), a mic (opens Add task already listening) and a round + button. Lines between rows. Today: "Overdue" (with Reschedule = all to today) then today. Upcoming: "Overdue", then each day of the week ("Wednesday, 23 Sep · Today"), empty days greyed. Inbox / projects: loose tasks, then each section with its count, empty sections greyed. Rows: priority circle (grey for none), date with calendar icon (red overdue, green today, purple this week), repeat and notes icons, project on the right.',
    ],
  },
  {
    build: 9,
    date: "2026-09-23",
    items: [
      "One full-width board column per page on the phone, no edge of the next column showing (Android app only; the website keeps its look).",
      'Shopping list: an item added again without an amount counts up ("Mleko" + "mleko" = "Mleko 2×").',
      "Add task: a Date button to pick the date.",
      'Board: while dragging a task on the phone, a "Move to" strip of section names to drop it on; moving between sections works with any sorting.',
      "Widget: ticks save straight to Firebase (reach the other phone even with the app closed).",
      "Widget: knows the newer repeats (every 2 weeks, yearly, fixed / last day of the month).",
      'Arrival reminders: "Remind me when I arrive" under a task\'s location. Android\'s geofencing (150 m) notifies on arrival, app closed too; needs location "Allow all the time". Per person on shared tasks.',
      'Voice adding (Slovenian): a microphone in Add task and on the shopping list, using the phone\'s own voice input ("pol kile moke pa jajca" becomes two items).',
      "Long-press the app icon: Add task, Shopping list (the first project shown as a shopping list), Calendar.",
      "Share to Opravilko: share a link, text or photos from any app; it becomes a task (photos attached) in the project you pick, or items on the shopping list.",
      'Shopping list has its own "Shopping" entry (sidebar, Soča chips, search) instead of being a project; only the shopping view. Shared with your partner by default; two lists merge into one.',
      "Voice, shared meals, usual items and checklists (templates).",
      "Widget refreshes its own list from Firebase (about every 30 minutes and after a tick), so the partner's new tasks show up with the app closed.",
    ],
  },
  {
    build: 8,
    date: "2026-09-23",
    items: ["Google sign-in through the phone's own account picker."],
  },
  {
    build: 7,
    date: "2026-09-23",
    items: [
      "Firebase: sign in with Google, live sync between phones, sharing projects.",
      "Midva: share single tasks with your partner.",
      "Attachments, a proper Settings page, a Calendar page with drag and week view.",
      "Task locations (search a place or drop a pin), Slovenian dates, more repeats.",
      "Shopping list prototype with meals and categories.",
    ],
  },
  {
    build: 6,
    date: "2026-09-23",
    items: [
      "The Soča look (Now / Next / Later home, command bar, project chips), switchable in Settings.",
      "The app is only built when asked for, not after every website change.",
    ],
  },
  {
    build: 4,
    date: "2026-09-22",
    items: ["Board view on the phone: one column per page, with page dots."],
  },
  {
    build: 3,
    date: "2026-09-22",
    items: ["Home-screen widget with your tasks."],
  },
  {
    build: 2,
    date: "2026-09-22",
    items: ["The Android app, installable from GitHub releases."],
  },
];
