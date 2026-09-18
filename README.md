# Opravilko

A personal task manager modeled on Todoist's look and workflow — projects, sections,
labels, priorities, due dates and times, recurring tasks, subtasks, comments,
filters, favorites, search, Today/Upcoming/List/Board views — with your data stored
in your own Dropbox account.

## Features

- **Projects & sections** — List and Board (drag-and-drop kanban) views per project,
  toggle any time; sections are renamable inline.
- **Tasks** — priorities (p1–p4, color-coded), due dates with optional time, labels,
  descriptions, subtasks (nest, collapse, done/total badge), comments.
- **Recurring due dates** — type `every day`, `every monday`, `every weekday`,
  `every 3 days`, or `every month` in quick-add, or set it from the detail panel;
  completing a recurring task advances it instead of archiving it.
- **Today / Upcoming** — due-date-driven views, with a one-click "reschedule all
  overdue to today".
- **Labels & Filters** — a small filter query language (`today`, `overdue`, `p1`–`p4`,
  `@label`, `#Project`, space-separated = AND).
- **Favorites** — star any project/label/filter for a shortcut at the top of the
  sidebar.
- **Search** — Cmd/Ctrl+K (or the sidebar entry) to jump to any task, project, label,
  or filter.
- **Drag-and-drop reordering** — within a project's list, and between/within board
  columns.

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
- **Hosting**: deployed as static files on GitHub Pages, same as your other
  Dropbox-backed projects. No server to run, nothing to keep warm.

## Live app

**https://ragefx.github.io/Opravilko/**

Deployment is automatic: `.github/workflows/deploy.yml` builds and publishes
`frontend/` to GitHub Pages on every push to `main`. Open the URL and click
**Connect to Dropbox** to authorize (only needed once per browser).

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

- Broader keyboard shortcuts (Todoist-style `q` for quick add, `x` complete, etc.)
- Section drag-reorder (tasks reorder; section columns themselves don't yet)
- File attachments on comments
- Recurring rules beyond day/weekday/week/month/N-days (e.g. "last Friday of the month")
