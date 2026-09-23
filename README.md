# Opravilko

A personal task manager modeled on Todoist's look and workflow — projects, sections,
labels, priorities, due dates and times, recurring tasks, subtasks, comments,
filters, favorites, search, Today/Upcoming/List/Board views — with your data stored
in your own Dropbox account.

## Features

- **Projects & sections** — List and Board (drag-and-drop kanban) views per project,
  toggle any time; sections are renamable inline.
- **Tasks** — priorities (p1–p4, color-coded), due dates with an optional 24-hour
  time, labels (editable per task), rich-text descriptions (bold, bulleted and
  numbered lists), subtasks (nest, collapse, done/total badge), comments. The
  detail view mirrors Todoist's layout: title/description/comments on the left,
  project/date/priority/labels in a sidebar on the right.
- **Recurring due dates** — type `every day`, `every monday`, `every weekday`,
  `every 3 days`, or `every month` in quick-add, or set it from the detail panel;
  completing a recurring task advances it instead of archiving it.
- **Today / Upcoming** — due-date-driven views, with a one-click "reschedule all
  overdue to today"; Today also has a List/Board toggle (remembered per browser).
- **Completed** — every completed task across all projects, grouped by day,
  searchable and filterable by project, with one click to restore a task
  (undoes completion and puts it back on its board/list) -- covers both
  browsing history and fixing an accidental complete.
- **Labels & Filters** — a small filter query language (`today`, `overdue`, `p1`–`p4`,
  `@label`, `#Project`, space-separated = AND).
- **Favorites** — star any project/label/filter for a shortcut at the top of the
  sidebar.
- **Search** — Cmd/Ctrl+K (or the sidebar entry) to jump to any task, project, label,
  or filter.
- **Drag-and-drop reordering** — within a project's list, and between/within board
  columns.
- **Import from Todoist** — point it at a Todoist project CSV export (⋯ → Manage data
  → Export as CSV) and it rebuilds sections, sub-tasks, priorities, descriptions and
  due dates (including recurrence phrases). Comments and attachments aren't carried
  over.
- **Keyboard shortcuts** — `q` add task anywhere, `/` or Cmd/Ctrl+K search,
  `g` then `t`/`u`/`i` to jump to Today/Upcoming/Inbox, `?` for the full list.
- **Reminders** — opt-in browser notifications for tasks with a due *time*, while the
  app is open.

### Looks

**Settings** (the ⋯ menu next to the app name) has a **Look** switch, saved per device:

- **Classic**: the original sidebar-and-lists layout.
- **Soča**: no fixed sidebar. The home screen is **Now / Next / Later**:
  - **Now** is a planner page for a day (today unless you pick another in the week strip):
    - a focus card with a timer for today's most urgent task;
    - an hour rail with timed tasks, calendar events and a line at the current time (tap an hour to give an untimed task that time);
    - the day's untimed tasks, where late ones are marked "carried over" with a highlighter.
  - **Next** is the rest of the week, day by day.
  - **Later** is everything further out.

  Press `/` for the command bar to jump anywhere or type a new task. The ☰ menu opens the full project list, and priority shows as `!!!` / `!!` / `!`.

## How it's built

Opravilko is a **static single-page app** — React + TypeScript + Vite, no backend
server. It talks to Dropbox directly from your browser:

- **Auth**: Dropbox's OAuth2 PKCE flow (a public-client flow with no app secret
  involved, safe to run entirely client-side). You approve access once; the
  resulting token is kept in your browser's `localStorage` and silently refreshed
  from then on.
- **Storage**: all your data — projects, sections, tasks, labels, filters — lives in
  a single JSON file (`opravilko-data.json`) inside your Dropbox app folder. The app
  downloads it on load and uploads it (debounced) after every change.
- **Sync safety**: uploads carry the file's Dropbox `rev`, so if the same file was
  changed elsewhere (another tab or device) the write is rejected rather than
  silently overwriting — you're asked whether to keep yours or load theirs. Pending
  writes are flushed when the tab is hidden or closed, and a failed save surfaces a
  Retry instead of failing quietly.
- **Hosting**: deployed as static files on GitHub Pages, same as your other
  Dropbox-backed projects. No server to run, nothing to keep warm.

## Live app

**https://ragefx.github.io/Opravilko/**

Deployment is automatic: `.github/workflows/deploy.yml` builds and publishes
`frontend/` to GitHub Pages on every push to `main`. Open the URL and click
**Connect to Dropbox** to authorize (only needed once per browser).

## Android app

The same app, packaged for Android with [Capacitor](https://capacitorjs.com)
(`frontend/android/`). `.github/workflows/android.yml` builds an APK on every push
to `main` that touches `frontend/`, and publishes it as a GitHub release: open the
repo's **Releases** page on your phone, download `Opravilko.apk`, and open it to
install (Android will ask you to allow installs from your browser once).

What's different from the website:

- **Reminders are scheduled with Android**, so they fire even when the app is closed.
- **Calendar feeds are fetched directly**, not through a public relay.
- **Sign-in** opens Dropbox in the phone's browser; the website's callback page
  hands the result back to the app (`opravilko://oauth`), so no extra redirect URI
  has to be registered with Dropbox.
- **Home-screen widget**, like Todoist's: long-press the home screen → Widgets →
  Opravilko, then pick Today, Upcoming, Inbox or a project. Tap a circle to complete
  a task (it syncs to Dropbox in the background, even offline-then-online), tap a
  task to open it, or **+** to add one. It refreshes from Dropbox about every 30
  minutes and whenever the app is open. The code is in
  `frontend/android/app/src/main/java/com/opravilko/app/widget/`; its task rules
  (`TaskLogic.java`) mirror the web app's and must be kept in step.

**Signing.** By default CI builds a debug-signed APK, and each build has a different
signature, so installing a newer one means uninstalling the old one first (your
tasks are safe in Dropbox; you'd only need to sign in again). To get in-place
updates, add a signing key as repository secrets: `ANDROID_KEYSTORE_BASE64` (the
`.jks` file, base64-encoded), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and
`ANDROID_KEY_PASSWORD`. Keep that key safe; every future update must use it.

To build locally you need the Android SDK: `cd frontend && npm run build:android`,
then open `frontend/android` in Android Studio.

## Local development

```
cd frontend
cp .env.example .env   # fill in VITE_DROPBOX_APP_KEY
npm install
npm run dev
```

## Data model

Everything lives in one JSON document (`VITE_DROPBOX_DATA_PATH`, default
`/opravilko-data.json`, inside your Dropbox app folder):

- **projects** — name, color, favorite flag; the seeded `Inbox` project can't be
  deleted.
- **sections** — group tasks within a project.
- **tasks** — content, description, project/section/parent, priority (1–4), due
  date, labels, completion state.
- **labels** — reusable tags, referenced by name on tasks.
- **filters** — saved searches using a small query language: space-separated
  tokens like `today`, `overdue`, `upcoming`, `p1`–`p4`, `@label`, `#Project`.

Because it's a single JSON file, you can also open it directly from the Dropbox app
on your phone if you ever want to eyeball or back up the raw data.

## Security notes

- The Dropbox app is scoped to its own app folder — it can't see or touch the rest
  of your Dropbox.
- The access/refresh tokens live only in your browser's `localStorage`, scoped to
  the Pages origin. They're never sent anywhere but Dropbox's API.
- The app's UI is publicly reachable at the Pages URL (like any static site), but
  it's useless without your own Dropbox login — there's no shared password to leak.
  Use **Disconnect** in the sidebar to clear the stored token from a shared machine.

## Roadmap ideas (not built yet)

- Bulk multi-select (complete/move/reschedule several tasks at once)
- Section drag-reorder (tasks reorder; section columns themselves don't yet)
- File attachments — worth doing since the Dropbox connection is already there
- Recurring rules beyond day/weekday/week/month/N-days (e.g. "last Friday of the month")
- Display settings (grouping/sort/filters) persist per project rather than per session
